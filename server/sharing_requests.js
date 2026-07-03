/**
 * Sharing request lifecycle — ADOLE v3.0
 *
 * Create/accept/copy flow for share requests. Split out of sharing.js; imports
 * lower-level share helpers from sharing.js one-way (no back-import → no cycle).
 */

import db, { withTransaction } from '../database/adole.js';
import { v4 as uuidv4 } from 'uuid';
import { pushNotificationToUserStack } from './notificationStack.js';
import { broadcastAtomeCreate } from './atomeRealtime.js';
import { createShare } from './sharingPermissionService.js';
import {
    atomeCreatorIdOf,
    atomeIdOf,
    atomeOwnerIdOf,
    atomeParentIdOf,
    atomeProperties,
    atomeTypeOf
} from './sharingAtomeAccessors.js';
import {
    commitSharingAtomeCreate,
    commitSharingAtomePatch,
    resolveShareAtomeIds,
    resolveReceiverProjectIdFromState,
    resolveProjectIdForAtome,
    normalizeDurationToExpiry,
    findSharePolicy,
    extractShareType,
    extractShareMeta,
    extractAtomeIdsFromRequest
} from './sharing.js';

export async function applyShareAcceptance({ sharerId, targetUserId, particles }) {
    console.log('[Share] applyShareAcceptance called:', { sharerId, targetUserId, particles: JSON.stringify(particles) });

    if (!sharerId || !targetUserId || !particles) {
        return { ok: false, error: 'Missing sharer or target' };
    }

    const shareType = extractShareType(particles);
    console.log('[Share] Extracted shareType:', shareType);

    const atomeIdsRaw = extractAtomeIdsFromRequest(particles);
    console.log('[Share] atomeIdsRaw:', atomeIdsRaw);

    const resolved = await resolveShareAtomeIds(atomeIdsRaw);
    if (resolved.error) return { ok: false, error: resolved.error };
    const atomeIds = resolved.ids;
    console.log('[Share] Resolved atomeIds:', atomeIds);

    if (!atomeIds.length) return { ok: false, error: 'No atomes to share' };

    const permissions = particles.permissions || {};
    const rawMode = particles.mode || 'real-time';
    const shareMode = (rawMode === 'validation-based' || rawMode === 'manual' || rawMode === 'non-real-time')
        ? 'manual'
        : 'real-time';
    const effectiveShareType = shareMode === 'real-time' ? shareType : 'copy';
    const meta = extractShareMeta(particles);
    const expiresAt = normalizeDurationToExpiry(meta?.duration);
    const conditions = meta?.condition || null;

    console.log('[Share] shareType:', shareType, 'shareMode:', shareMode, 'effectiveShareType:', effectiveShareType);

    console.log('[Share] shareType check:', { shareType, isLinked: shareType === 'linked' });
    console.log('[Share] receiverProjectId:', particles?.receiver_project_id || 'NONE');

    if (effectiveShareType !== 'linked') {
        console.log('[Share] Creating shared copies (non-linked)...');
        let receiverProjectId = particles?.receiver_project_id || null;
        if (!receiverProjectId) {
            receiverProjectId = await resolveReceiverProjectIdFromState(targetUserId);
        }
        console.log('[Share] receiverProjectId for copies:', receiverProjectId);
        const copied = await createSharedCopies({
            sharerId,
            targetUserId,
            atomeIds,
            receiverProjectId: receiverProjectId
        });
        console.log('[Share] createSharedCopies result:', JSON.stringify(copied));
        if (!copied?.ok) return copied;
        return { ok: true, copies: copied.copies || [], mapping: copied.mapping || {} };
    }

    console.log('[Share] Linked share - granting permissions only (no copies created)');
    const permissionPayload = {
        can_read: !!permissions.read,
        can_write: !!permissions.alter,
        can_delete: !!permissions.delete,
        can_share: false,
        can_create: !!permissions.create
    };

    for (const atomeId of atomeIds) {
        const res = await createShare(sharerId, atomeId, targetUserId, permissionPayload, {
            shareMode,
            conditions,
            expiresAt
        });
        if (!res?.success) {
            return { ok: false, error: res?.error || 'Failed to grant permissions' };
        }

        if (shareMode === 'real-time') {
            try {
                const atome = await db.getAtome(atomeId);
                if (atome) {
                    const atomeType = atomeTypeOf(atome);
                    if (!atomeType || atomeType === 'atome') continue;
                    await broadcastAtomeCreate({
                        atomeId,
                        atomeType,
                        parentId: atomeParentIdOf(atome),
                        particles: atomeProperties(atome),
                        senderUserId: sharerId
                    });
                }
            } catch (error) {
        console.warn("[cleanup] operation failed", error); }
        }
    }

    return { ok: true };
}

export async function createShareRequest({ sharerId, targetUserId, targetPhone, atomeIds, permissions, mode, shareType, propertyOverrides }) {
    if (!sharerId || !targetUserId) return { ok: false, error: 'Missing sharer or target' };

    const policyEntry = await findSharePolicy(targetUserId, sharerId);
    const policyValue = policyEntry?.particles?.policy || null;

    if (policyValue === 'block') {
        return { ok: false, error: 'blocked' };
    }

    const requestId = `share_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
    const status = (policyValue === 'always')
        ? (mode === 'real-time' ? 'active' : 'accepted')
        : (policyValue === 'never' ? 'rejected' : 'pending');

    let projectId = null;
    try {
        if (Array.isArray(atomeIds) && atomeIds.length) {
            const first = await db.getAtome(atomeIds[0]);
            const data = atomeProperties(first);
            const candidate = data.project_id || data.projectId || atomeParentIdOf(first);
            if (candidate) {
                projectId = candidate;
            } else {
                projectId = await resolveProjectIdForAtome(atomeIds[0]);
            }
        }
    } catch (error) {
        console.warn("[cleanup] operation failed", error);
        projectId = null;
    }

    const baseParticles = {
        request_id: requestId,
        target_phone: targetPhone || null,
        target_user_id: targetUserId,
        sharer_id: sharerId,
        atome_ids: Array.isArray(atomeIds) ? atomeIds : [],
        permissions: permissions || {},
        mode: mode || 'real-time',
        share_type: shareType || 'linked',
        property_overrides: propertyOverrides || {},
        project_id: projectId,
        timestamp: new Date().toISOString()
    };

    const inbox = await commitSharingAtomeCreate({
        id: null,
        type: 'share_request',
        parent: null,
        owner: targetUserId,
        creator: sharerId,
        properties: { ...baseParticles, status, box: 'inbox' }
    });

    const outbox = await commitSharingAtomeCreate({
        id: null,
        type: 'share_request',
        parent: null,
        owner: sharerId,
        creator: sharerId,
        properties: { ...baseParticles, status, box: 'outbox' }
    });

    const inboxId = atomeIdOf(inbox);
    const outboxId = atomeIdOf(outbox);

    try {
        if (inboxId || outboxId) {
            const linkPayload = { inbox_id: inboxId, outbox_id: outboxId };
            if (inboxId) await commitSharingAtomePatch(inboxId, linkPayload, sharerId);
            if (outboxId) await commitSharingAtomePatch(outboxId, linkPayload, sharerId);
        }
    } catch (error) {
        console.warn("[cleanup] operation failed", error); }

    try {
        const stackRes = await pushNotificationToUserStack({
            userId: targetUserId,
            authorId: sharerId,
            notification: {
                id: inboxId || requestId,
                message_id: inboxId || requestId,
                kind: 'share-request',
                subject: 'Demande de partage',
                message: '',
                share_id: requestId,
                project_id: projectId,
                atome_ids: Array.isArray(atomeIds) ? atomeIds : [],
                mode: baseParticles.mode || null,
                share_type: baseParticles.share_type || null,
                request_atome_id: inboxId || null,
                from_id: sharerId,
                to_user_id: targetUserId,
                timestamp: new Date().toISOString(),
                unread: true,
                status
            }
        });
        console.log('[Share] notification stack push:', {
            targetUserId,
            requestId,
            inboxId: inboxId || null,
            stackSize: stackRes?.count || null
        });
    } catch (err) {
        console.warn('[Share] failed to push notification stack:', err?.message || err);
    }

    if (policyValue === 'always') {
        await applyShareAcceptance({ sharerId, targetUserId, particles: baseParticles });
    }

    console.log('[Share] Share request created:', {
        requestId,
        status,
        inboxId,
        outboxId,
        sharerId,
        targetUserId,
        atomeCount: Array.isArray(atomeIds) ? atomeIds.length : 0
    });

    return {
        ok: true,
        requestId,
        status,
        inboxId,
        outboxId
    };
}

async function createSharedCopies({ sharerId, targetUserId, atomeIds, receiverProjectId }) {
    if (!sharerId || !targetUserId) return { ok: false, error: 'Missing sharer or target' };
    const ids = Array.isArray(atomeIds) ? atomeIds.map(String).filter(Boolean) : [];
    if (!ids.length) return { ok: false, error: 'No atomes to copy' };

    const originals = new Map();
    for (const id of ids) {
        const atome = await db.getAtome(id);
        if (atome) originals.set(String(id), atome);
    }

    const pending = new Set(ids);
    const mapping = new Map();
    const copies = [];
    const reservedKeys = new Set(['_pending_owner_id', '_pending_parent_id']);
    let guard = 0;

    const pickParent = (originalParentId) => {
        if (!originalParentId) return receiverProjectId || null;
        if (mapping.has(originalParentId)) return mapping.get(originalParentId);
        if (pending.has(originalParentId)) return null;
        return receiverProjectId || null;
    };

    while (pending.size && guard < (ids.length * 2)) {
        guard += 1;
        let progress = false;
        for (const id of Array.from(pending)) {
            const original = originals.get(id);
            if (!original) {
                pending.delete(id);
                continue;
            }

            const parentId = atomeParentIdOf(original);
            const resolvedParent = pickParent(parentId);
            if (parentId && pending.has(parentId) && !resolvedParent) {
                continue;
            }

            const properties = { ...atomeProperties(original) };
            for (const key of reservedKeys) {
                if (key in properties) delete properties[key];
            }

            properties.shared_from = sharerId;
            properties.shared_at = new Date().toISOString();
            properties.original_atome_id = id;
            properties.share_type = 'copy';
            const originalCreatorId = atomeCreatorIdOf(original);
            if (originalCreatorId) properties.original_creator_id = originalCreatorId;

            console.log('[Share] Creating copy with parent:', resolvedParent, 'for owner:', targetUserId);
            const created = await commitSharingAtomeCreate({
                id: null,
                type: atomeTypeOf(original) || 'shape',
                kind: original.kind || null,
                parent: resolvedParent,
                owner: targetUserId,
                creator: originalCreatorId || sharerId,
                properties
            });
            console.log('[Share] Created copy result:', JSON.stringify(created));

            const newId = atomeIdOf(created);
            if (newId) {
                mapping.set(id, newId);
                copies.push({ original_atome_id: id, shared_atome_id: newId });
            }

            pending.delete(id);
            progress = true;
        }

        if (!progress) break;
    }

    // Secondary for remaining entries (no parent ordering available)
    for (const id of Array.from(pending)) {
        const original = originals.get(id);
        if (!original) {
            pending.delete(id);
            continue;
        }

        const properties = { ...atomeProperties(original) };
        for (const key of reservedKeys) {
            if (key in properties) delete properties[key];
        }
        properties.shared_from = sharerId;
        properties.shared_at = new Date().toISOString();
        properties.original_atome_id = id;
        properties.share_type = 'copy';
        const originalCreatorId = atomeCreatorIdOf(original);
        if (originalCreatorId) properties.original_creator_id = originalCreatorId;

        const created = await commitSharingAtomeCreate({
            id: null,
            type: atomeTypeOf(original) || 'shape',
            kind: original.kind || null,
            parent: receiverProjectId || null,
            owner: targetUserId,
            creator: originalCreatorId || sharerId,
            properties
        });

        const newId = atomeIdOf(created);
        if (newId) {
            mapping.set(id, newId);
            copies.push({ original_atome_id: id, shared_atome_id: newId });
        }

        pending.delete(id);
    }

    return { ok: true, copies, mapping: Object.fromEntries(mapping) };
}
