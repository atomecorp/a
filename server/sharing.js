/**
 * Sharing & Permissions System - ADOLE v3.0
 * 
 * Manages sharing of atomes (projects, documents, files) between users.
 * Uses the ADOLE permissions table for persistent, secure access control.
 * 
 * Features:
 * - Granular permissions (read, write, delete, share)
 * - Particle-level restrictions (optional)
 * - Expiration dates
 * - Full audit trail (granted_by, granted_at)
 * - WebSocket sync for real-time permission updates
 */

import db, { withTransaction } from '../database/adole.js';
import { v4 as uuidv4 } from 'uuid';
import { pushNotificationToUserStack } from './notificationStack.js';
import { getABoxEventBus } from './aBoxServer.js';
import { wsSendJsonToUser } from './wsApiState.js';
import { broadcastAtomeCreate } from './atomeRealtime.js';
import { isPublicAccess } from '../atome/shared/recipient_access.js';
import { commitAtomeEvent } from './atomeRoutes.orm.js';
import {
    PERMISSION,
    checkCanShare,
    checkPermission,
    createShare,
    getAccessibleAtomes,
    getPermissionName,
    getSharesForAtome,
    getSharesForUser,
    getSharesGrantedByUser,
    parsePermission,
    revokeShare
} from './sharingPermissionService.js';
import {
    atomeCreatorIdOf,
    atomeIdOf,
    atomeOwnerIdOf,
    atomeParentIdOf,
    atomeProperties,
    atomeTypeOf
} from './sharingAtomeAccessors.js';

export {
    PERMISSION,
    checkPermission,
    createShare,
    getAccessibleAtomes,
    getPermissionName,
    getSharesForAtome,
    getSharesForUser,
    getSharesGrantedByUser,
    parsePermission,
    revokeShare
};

async function commitSharingAtomeCreate({
    id = null,
    type,
    kind = null,
    parent = null,
    owner,
    creator,
    properties = {}
}) {
    const atomeId = id || uuidv4();
    await commitAtomeEvent({
        authenticatedUserId: creator || owner,
        event: {
            atome_id: atomeId,
            project_id: properties.project_id || properties.projectId || parent || null,
            kind: 'set',
            payload: {
                props: {
                    ...properties,
                    type,
                    ...(kind ? { kind } : {}),
                    ...(parent ? { parent_id: parent } : {}),
                    ...(owner ? { owner_id: owner } : {})
                }
            },
            actor: { type: 'user', id: creator || owner }
        }
    });
    return {
        id: atomeId,
        type,
        kind: kind || null,
        meta: {
            parent_id: parent || null,
            owner_id: owner || null,
            created_by: creator || owner || null
        },
        properties
    };
}

async function commitSharingAtomePatch(atomeId, properties, actorId) {
    if (!atomeId || !actorId) return null;
    return await commitAtomeEvent({
        authenticatedUserId: actorId,
        event: {
            atome_id: atomeId,
            kind: 'set',
            payload: { props: properties || {} },
            actor: { type: 'user', id: actorId }
        }
    });
}

async function isProjectContainer(atomeId) {
    if (!atomeId) return false;
    const atome = await db.getAtome(atomeId);
    return atomeTypeOf(atome) === 'project';
}

async function ensureProjectContainer({ projectId, ownerId }) {
    if (!projectId || !ownerId) return { ok: false, reason: 'missing' };
    if (await isProjectContainer(projectId)) return { ok: true, existed: true };

    const currentProjectId = await resolveUserCurrentProjectId(ownerId) || await resolveReceiverProjectIdFromState(ownerId);
    if (!currentProjectId || String(currentProjectId) !== String(projectId)) {
        return { ok: false, reason: 'mismatch' };
    }

    try {
        await commitSharingAtomeCreate({
            id: projectId,
            type: 'project',
            kind: 'project',
            parent: null,
            owner: ownerId,
            creator: ownerId,
            properties: {
                name: 'Project',
                label: 'Project'
            }
        });
    } catch (error) {
        console.warn('[Share] Failed to create project container stub:', error?.message || error);
    }

    return (await isProjectContainer(projectId))
        ? { ok: true, created: true }
        : { ok: false, reason: 'create_failed' };
}

async function resolveUserCurrentProjectId(userId) {
    if (!userId) return null;
    try {
        const user = await db.getAtome(userId);
        const data = atomeProperties(user);
        return data.current_project_id || data.currentProjectId || null;
    } catch (error) {
        console.warn("[cleanup] operation failed", error);
        return null;
    }
}

function normalizeDurationToExpiry(duration) {
    if (!duration) return null;
    if (typeof duration === 'number' && Number.isFinite(duration)) {
        return new Date(Date.now() + (duration * 1000)).toISOString();
    }

    if (typeof duration !== 'string') return null;
    const trimmed = duration.trim();
    if (!trimmed) return null;

    const directDate = new Date(trimmed);
    if (!Number.isNaN(directDate.getTime())) {
        return directDate.toISOString();
    }

    const match = trimmed.match(/^(\d+)\s*([smhdw])$/i);
    if (!match) return null;
    const amount = Number(match[1]);
    const unit = match[2].toLowerCase();
    const multipliers = { s: 1, m: 60, h: 3600, d: 86400, w: 604800 };
    const seconds = amount * (multipliers[unit] || 0);
    if (!seconds) return null;
    return new Date(Date.now() + (seconds * 1000)).toISOString();
}

async function loadAtomesByOwnerWithParticles(ownerId, atomeType) {
    const rows = await db.getAtomesByOwner(ownerId, { type: atomeType, limit: 1000, offset: 0 });
    const results = [];
    for (const row of rows || []) {
        const id = row?.atome_id || row?.id;
        if (!id) continue;
        const full = await db.getAtome(id);
        if (full) results.push(full);
    }
    return results;
}

async function findSharePolicy(ownerId, peerUserId) {
    if (!ownerId || !peerUserId) return null;
    const policies = await loadAtomesByOwnerWithParticles(ownerId, 'share_policy');
    for (const policy of policies) {
        const particles = atomeProperties(policy);
        const peer = particles.peerUserId || particles.peer_user_id || null;
        if (String(peer || '') === String(peerUserId)) {
            return { id: atomeIdOf(policy), particles };
        }
    }
    return null;
}

async function upsertSharePolicy(ownerId, peerUserId, policy, permissions) {
    if (!ownerId || !peerUserId || !policy) return null;
    const existing = await findSharePolicy(ownerId, peerUserId);
    const now = new Date().toISOString();
    const payload = {
        peerUserId: String(peerUserId),
        policy: String(policy),
        permissions: permissions || null,
        updatedAt: now,
        createdAt: existing?.particles?.createdAt || now
    };

    if (existing?.id) {
        await commitSharingAtomePatch(existing.id, payload, ownerId);
        return existing.id;
    }

    const created = await commitSharingAtomeCreate({
        id: null,
        type: 'share_policy',
        parent: null,
        owner: ownerId,
        creator: ownerId,
        properties: payload
    });
    return atomeIdOf(created);
}

function extractShareType(particles) {
    const direct = particles?.share_type || particles?.shareType || null;
    const overrides = particles?.property_overrides || particles?.propertyOverrides || {};
    const override = overrides.__shareType || overrides.__share_type || overrides.shareType || overrides.share_type || null;
    return String(direct || override || 'linked');
}

function extractShareMeta(particles) {
    const override = particles?.property_overrides?.__share_meta || particles?.share_meta || null;
    return override && typeof override === 'object' ? override : {};
}

function extractAtomeIdsFromRequest(particles) {
    const ids = Array.isArray(particles?.atome_ids) ? particles.atome_ids : [];
    if (ids.length) return ids.map(String);
    const shared = Array.isArray(particles?.shared_atomes) ? particles.shared_atomes : [];
    return shared
        .map((item) => item?.original_atome_id || item?.shared_atome_id || null)
        .filter(Boolean)
        .map(String);
}

const NON_SHAREABLE_TYPES = new Set(['share_request', 'share_link', 'share_policy']);

async function collectDescendants(rootId, expanded, visited) {
    const queue = [String(rootId)];
    const seen = visited || new Set();

    while (queue.length) {
        const current = queue.shift();
        if (!current || seen.has(current)) continue;
        seen.add(current);

        const rows = await db.query(
            'all',
            'SELECT atome_id, atome_type FROM atomes WHERE parent_id = ? AND deleted_at IS NULL',
            [current]
        );

        for (const row of rows || []) {
            const childId = row?.atome_id ? String(row.atome_id) : null;
            if (!childId || seen.has(childId)) continue;
            const childType = row?.atome_type ? String(row.atome_type) : '';
            if (NON_SHAREABLE_TYPES.has(childType)) continue;
            expanded.add(childId);
            queue.push(childId);
        }
    }
}

async function resolveShareAtomeIds(atomeIds) {
    const ids = Array.isArray(atomeIds) ? atomeIds.map(String).filter(Boolean) : [];
    if (!ids.length) return { ids: [], error: 'No atomes to share' };

    const expanded = new Set();
    for (const id of ids) {
        const row = await db.query(
            'get',
            'SELECT atome_type FROM atomes WHERE atome_id = ? AND deleted_at IS NULL',
            [id]
        );
        if (!row) {
            return { ids: [], error: `Atome not found: ${id}` };
        }
        const type = row?.atome_type ? String(row.atome_type) : '';
        if (NON_SHAREABLE_TYPES.has(type)) {
            return { ids: [], error: `Atome type not shareable: ${type}` };
        }
        expanded.add(id);
        if (type === 'project') {
            await collectDescendants(id, expanded);
        }
    }

    return { ids: Array.from(expanded), error: null };
}

async function applyShareAcceptance({ sharerId, targetUserId, particles }) {
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

async function createShareRequest({ sharerId, targetUserId, targetPhone, atomeIds, permissions, mode, shareType, propertyOverrides }) {
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

function normalizeShareMode(rawMode) {
    const mode = String(rawMode || '').toLowerCase();
    if (mode === 'validation-based' || mode === 'manual' || mode === 'non-real-time') return 'manual';
    return 'real-time';
}

async function resolveReceiverProjectIdFromState(userId) {
    if (!userId) return null;
    try {
        const state = await db.getStateCurrent(userId);
        const props = state?.properties || {};
        return props.current_project_id || props.currentProjectId || null;
    } catch (error) {
        console.warn("[cleanup] operation failed", error);
        return null;
    }
}

async function resolveProjectIdForAtome(atomeId, maxDepth = 16) {
    if (!atomeId) return null;
    let currentId = String(atomeId);
    let depth = 0;
    while (currentId && depth < maxDepth) {
        depth += 1;
        const atome = await db.getAtome(currentId);
        if (!atome) return null;
        const data = atomeProperties(atome);
        const directProject = data.project_id || data.projectId || atome.project_id || atome.projectId || null;
        if (directProject) return String(directProject);
        const type = atomeTypeOf(atome);
        if (type === 'project') return String(currentId);
        const parentId = atomeParentIdOf(atome);
        if (!parentId || String(parentId) === String(currentId)) return null;
        currentId = String(parentId);
    }
    return null;
}

async function lookupUserByPhone(phone) {
    const clean = String(phone || '').trim();
    if (!clean) return null;
    const raw = clean.replace(/\s+/g, '');
    const jsonValue = JSON.stringify(raw);

    const row = await db.query('get', `
        SELECT a.atome_id
        FROM atomes a
        JOIN particles p ON a.atome_id = p.atome_id
        WHERE a.atome_type = 'user'
          AND p.particle_key = 'phone'
          AND (p.particle_value = ? OR p.particle_value = ?)
        LIMIT 1
    `, [jsonValue, raw]);

    return row?.atome_id || null;
}

async function resolveTargetUserId({ targetUserId, targetPhone }) {
    if (targetUserId) return String(targetUserId);
    if (!targetPhone) return null;
    return await lookupUserByPhone(targetPhone);
}

async function loadShareRequestById(requestAtomeId) {
    if (!requestAtomeId) return null;
    return await db.getAtome(String(requestAtomeId));
}

async function loadShareRequestsByRequestId(requestId) {
    if (!requestId) return [];
    const raw = String(requestId);
    const jsonValue = JSON.stringify(raw);
    const rows = await db.query('all', `
        SELECT a.atome_id
        FROM atomes a
        JOIN particles p ON a.atome_id = p.atome_id
        WHERE a.atome_type = 'share_request'
          AND p.particle_key = 'request_id'
          AND (p.particle_value = ? OR p.particle_value = ?)
    `, [jsonValue, raw]);

    const out = [];
    for (const row of rows || []) {
        const item = await db.getAtome(row.atome_id);
        if (item) out.push(item);
    }
    return out;
}

function normalizeParticles(source) {
    if (!source || typeof source !== 'object') return {};
    if (source.properties && typeof source.properties === 'object') return source.properties;
    return source;
}

async function listShareRequestsForUser(userId, options = {}) {
    if (!userId) return [];
    const box = String(options.box || 'inbox');
    const statusesRaw = Array.isArray(options.statuses || options.status)
        ? (options.statuses || options.status)
        : (options.status ? [options.status] : []);
    const statuses = statusesRaw.length
        ? statusesRaw.map((value) => String(value).toLowerCase()).filter(Boolean)
        : ['pending', 'active'];

    const boxJson = JSON.stringify(box);
    const statusJson = statuses.map((s) => JSON.stringify(s));

    const rows = await db.query('all', `
        SELECT a.atome_id,
               MAX(CASE WHEN p.particle_key = 'timestamp' THEN p.particle_value END) as timestamp
        FROM atomes a
        LEFT JOIN particles p ON a.atome_id = p.atome_id
        WHERE a.atome_type = 'share_request'
          AND a.owner_id = ?
          AND EXISTS (
            SELECT 1 FROM particles pb
            WHERE pb.atome_id = a.atome_id
              AND pb.particle_key = 'box'
              AND (pb.particle_value = ? OR pb.particle_value = ?)
          )
          AND EXISTS (
            SELECT 1 FROM particles ps
            WHERE ps.atome_id = a.atome_id
              AND ps.particle_key = 'status'
              AND (
                ${statuses.map(() => 'ps.particle_value = ? OR ps.particle_value = ?').join(' OR ')}
              )
          )
        GROUP BY a.atome_id
        ORDER BY timestamp DESC
    `, [String(userId), boxJson, box, ...statuses.flatMap((s, idx) => [statusJson[idx], s])]);

    const results = [];
    for (const row of rows || []) {
        const atome = await db.getAtome(row.atome_id);
        if (atome) results.push(atome);
    }
    return results;
}

async function resolveUserAccessInfo(userId) {
    if (!userId) return { access: 'private', visibility: 'private' };
    let access = null;
    let visibility = null;
    try {
        access = await db.getParticle(String(userId), 'access');
    } catch (error) {
        console.warn("[cleanup] operation failed", error); }
    try {
        visibility = await db.getParticle(String(userId), 'visibility');
    } catch (error) {
        console.warn("[cleanup] operation failed", error); }
    return { access: access || '', visibility: visibility || '' };
}

async function hasAcceptedRelationship(targetUserId, sharerId) {
    if (!targetUserId || !sharerId) return false;
    const policyEntry = await findSharePolicy(targetUserId, sharerId);
    const policyValue = String(policyEntry?.particles?.policy || '').toLowerCase();
    if (policyValue === 'block' || policyValue === 'never') return false;
    if (policyValue === 'always') return true;

    const sharerRaw = String(sharerId);
    const sharerJson = JSON.stringify(sharerRaw);
    const statusAccepted = JSON.stringify('accepted');
    const statusActive = JSON.stringify('active');
    const rows = await db.query('all', `
        SELECT a.atome_id
        FROM atomes a
        JOIN particles ps ON a.atome_id = ps.atome_id
        JOIN particles pst ON a.atome_id = pst.atome_id
        WHERE a.atome_type = 'share_request'
          AND a.owner_id = ?
          AND ps.particle_key = 'sharer_id'
          AND (ps.particle_value = ? OR ps.particle_value = ?)
          AND pst.particle_key = 'status'
          AND (pst.particle_value = ? OR pst.particle_value = ? OR pst.particle_value = ? OR pst.particle_value = ?)
        LIMIT 1
    `, [String(targetUserId), sharerJson, sharerRaw, statusAccepted, 'accepted', statusActive, 'active']);
    return Array.isArray(rows) && rows.length > 0;
}

async function enforceRecipientVisibility({ sharerId, targetUserId, context = 'share' }) {
    const accessInfo = await resolveUserAccessInfo(targetUserId);
    const isPublic = isPublicAccess(accessInfo);
    if (isPublic) {
        return { ok: true, accessInfo, accepted: true };
    }
    const accepted = await hasAcceptedRelationship(targetUserId, sharerId);
    if (!accepted) {
        console.warn('[Share] Recipient rejected (private, no accepted relationship):', {
            context,
            sharerId,
            targetUserId,
            access: accessInfo.access,
            visibility: accessInfo.visibility
        });
        return { ok: false, accessInfo, accepted: false, error: 'Recipient is private' };
    }
    return { ok: true, accessInfo, accepted: true };
}

async function broadcastShareCommand({ recipients, senderUserId, command, params }) {
    if (!recipients || recipients.length === 0) return;
    const nowIso = new Date().toISOString();
    const payloadText = JSON.stringify({ command, params });

    for (const recipientId of recipients) {
        if (!recipientId) continue;
        const payload = {
            type: 'console-message',
            message: payloadText,
            from: { userId: String(senderUserId), phone: null, username: null },
            to: { userId: String(recipientId), phone: null },
            timestamp: nowIso
        };
        try {
            wsSendJsonToUser(String(recipientId), payload, { scope: 'ws/api', op: command, targetUserId: String(recipientId) });
        } catch (error) {
        console.warn("[cleanup] operation failed", error); }
    }
}

async function listShareRecipients(atomeId) {
    const recipients = new Set();
    const rows = await db.query(
        'all',
        "SELECT DISTINCT principal_id FROM permissions WHERE atome_id = ? AND can_read = 1 AND (expires_at IS NULL OR expires_at > datetime('now'))",
        [atomeId]
    );

    for (const row of rows || []) {
        const principalId = row?.principal_id ? String(row.principal_id) : null;
        if (!principalId) continue;
        const allowed = await db.canRead(atomeId, principalId);
        if (!allowed) continue;
        recipients.add(principalId);
    }

    return Array.from(recipients);
}
/**
 * Handle sharing WebSocket messages
 * All sharing operations go through WebSocket via EventBus
 * 
 * Message format:
 * {
 *   type: 'share',
 *   action: 'create' | 'revoke' | 'get-atome' | 'my-shares' | 'shared-with-me' | 'accessible' | 'check',
 *   requestId: string,
 *   ...params
 * }
 */
export async function handleShareMessage(message, userId) {
    const { action, requestId } = message;

    if (!userId) {
        return { requestId, success: false, error: 'Unauthorized' };
    }

    try {
        switch (action) {
            case 'request': {
                const {
                    target_user_id,
                    target_phone,
                    atome_ids,
                    permissions,
                    mode,
                    share_type,
                    property_overrides
                } = message || {};

                const resolvedTargetUserId = await resolveTargetUserId({ targetUserId: target_user_id, targetPhone: target_phone });
                if (!resolvedTargetUserId) {
                    return { requestId, success: false, error: 'Target user not found' };
                }

                const visibilityCheck = await enforceRecipientVisibility({
                    sharerId: userId,
                    targetUserId: resolvedTargetUserId,
                    context: 'share-request'
                });
                if (!visibilityCheck.ok) {
                    return { requestId, success: false, error: visibilityCheck.error || 'Recipient is private' };
                }

                const idsInput = Array.isArray(atome_ids) ? atome_ids.map(String).filter(Boolean) : (atome_ids ? [String(atome_ids)] : []);
                const resolvedIds = await resolveShareAtomeIds(idsInput);
                if (resolvedIds.error) {
                    return { requestId, success: false, error: resolvedIds.error };
                }
                const ids = resolvedIds.ids;
                if (!ids.length) return { requestId, success: false, error: 'No atomes to share' };

                console.log('[Share] Checking permissions for share request:', { userId, targetUserId: resolvedTargetUserId, atomeIds: ids });

                for (const atomeId of ids) {
                    const allowed = await checkCanShare(userId, atomeId);
                    console.log('[Share] checkCanShare result:', { userId, atomeId, allowed });
                    if (!allowed) {
                        console.warn('[Share] Share request failed:', {
                            targetPhone: target_phone,
                            atomeIds: ids,
                            mode,
                            error: 'Access denied (share)',
                            targetUserId: resolvedTargetUserId,
                            failedAtomeId: atomeId
                        });
                        return { requestId, success: false, error: 'Access denied (share)' };
                    }
                }

                const resolvedShareType = extractShareType({ share_type, property_overrides });
                const res = await createShareRequest({
                    sharerId: userId,
                    targetUserId: resolvedTargetUserId,
                    targetPhone: target_phone || null,
                    atomeIds: ids,
                    permissions: permissions || {},
                    mode: mode || 'real-time',
                    shareType: resolvedShareType,
                    propertyOverrides: property_overrides || {}
                });

                return { requestId, success: res.ok, data: res, error: res.error || null };
            }

            case 'respond': {
                const statusRaw = String(message?.status || message?.decision || '').toLowerCase();
                const requestAtomeId = message?.request_atome_id || message?.atome_id || null;
                const requestIdValue = message?.request_id || null;
                const receiverProjectId = message?.receiver_project_id || null;
                const policy = message?.policy || null;

                if (!requestAtomeId && !requestIdValue) {
                    return { requestId, success: false, error: 'Missing request identifier' };
                }

                const inboxRequest = requestAtomeId
                    ? await loadShareRequestById(requestAtomeId)
                    : null;

                let requestRecord = inboxRequest;
                if (!requestRecord && requestIdValue) {
                    const candidates = await loadShareRequestsByRequestId(requestIdValue);
                    requestRecord = candidates.find(r => String(atomeOwnerIdOf(r) || '') === String(userId)) || null;
                }

                if (!requestRecord) {
                    return { requestId, success: false, error: 'Share request not found' };
                }

                const particles = normalizeParticles(requestRecord);
                if (String(particles.box || '') !== 'inbox') {
                    return { requestId, success: false, error: 'Not an inbox request' };
                }

                const sharerId = particles.sharer_id || particles.sharerId || null;
                const requestIdResolved = particles.request_id || particles.requestId || requestIdValue;
                const modeValue = normalizeShareMode(particles.mode || 'real-time');
                const shareType = extractShareType(particles);

                if (!sharerId || !requestIdResolved) {
                    return { requestId, success: false, error: 'Invalid share request data' };
                }

                const newStatus = (statusRaw === 'accepted')
                    ? (shareType === 'linked' && modeValue === 'real-time' ? 'active' : 'accepted')
                    : (statusRaw === 'rejected' ? 'rejected' : null);

                if (!newStatus) {
                    return { requestId, success: false, error: 'Unsupported status' };
                }

                if (policy && policy !== 'one-shot') {
                    await upsertSharePolicy(userId, sharerId, policy, particles.permissions || {});
                }

                let acceptanceResult = { ok: true };
                let resolvedProjectId = receiverProjectId || particles.receiver_project_id || null;
                if (newStatus === 'active' || newStatus === 'accepted') {
                    if (!resolvedProjectId) {
                        resolvedProjectId = await resolveUserCurrentProjectId(userId);
                    }
                    const ensureResult = await ensureProjectContainer({
                        projectId: resolvedProjectId,
                        ownerId: userId
                    });
                    if (!resolvedProjectId || !ensureResult.ok) {
                        console.warn('[Share] Reject accept: invalid receiver_project_id', {
                            requestAtomeId,
                            receiverProjectId: resolvedProjectId,
                            userId,
                            reason: ensureResult.reason
                        });
                        return { requestId, success: false, error: 'Invalid receiver_project_id' };
                    }
                }

                const updates = {
                    status: newStatus,
                    statusUpdatedAt: new Date().toISOString(),
                    acceptedAt: newStatus === 'accepted' || newStatus === 'active' ? new Date().toISOString() : undefined,
                    rejectedAt: newStatus === 'rejected' ? new Date().toISOString() : undefined,
                    receiver_project_id: resolvedProjectId || null
                };

                const inboxId = particles.inboxId || atomeIdOf(requestRecord);
                const outboxId = particles.outboxId || null;

                const finalResult = await withTransaction(async () => {
                    if (newStatus === 'active' || newStatus === 'accepted') {
                        console.log('[Share] Processing accept - receiver_project_id:', resolvedProjectId);
                        const acceptanceParticles = {
                            ...particles,
                            receiver_project_id: resolvedProjectId
                        };
                        acceptanceResult = await applyShareAcceptance({
                            sharerId,
                            targetUserId: userId,
                            particles: acceptanceParticles
                        });
                        if (!acceptanceResult?.ok) {
                            throw new Error(acceptanceResult.error || 'Acceptance failed');
                        }
                        if (acceptanceResult?.copies?.length) {
                            updates.importedAtomeIds = acceptanceResult.copies.map(c => c.sharedAtomeId);
                            updates.importedAtomesCount = acceptanceResult.copies.length;
                            updates.linkMappings = acceptanceResult.mapping || {};
                        }
                    }

                    if (inboxId) await commitSharingAtomePatch(inboxId, updates, userId);
                    if (outboxId) await commitSharingAtomePatch(outboxId, updates, userId);

                    if (!outboxId && requestIdResolved) {
                        const related = await loadShareRequestsByRequestId(requestIdResolved);
                        for (const item of related) {
                            if (String(atomeOwnerIdOf(item) || '') !== String(sharerId)) continue;
                            const id = atomeIdOf(item);
                            if (!id) continue;
                            await commitSharingAtomePatch(id, updates, userId);
                        }
                    }

                    return acceptanceResult;
                });

                return {
                    requestId,
                    success: true,
                    status: newStatus,
                    data: finalResult || null
                };
            }

            case 'publish': {
                const requestAtomeId = message?.request_atome_id || message?.atome_id || null;
                const requestIdValue = message?.request_id || null;

                const sourceRequest = requestAtomeId
                    ? await loadShareRequestById(requestAtomeId)
                    : null;

                let requestRecord = sourceRequest;
                if (!requestRecord && requestIdValue) {
                    const candidates = await loadShareRequestsByRequestId(requestIdValue);
                    requestRecord = candidates.find(r => String(atomeOwnerIdOf(r) || '') === String(userId)) || null;
                }

                if (!requestRecord) {
                    return { requestId, success: false, error: 'Share request not found' };
                }

                const particles = normalizeParticles(requestRecord);
                const targetUserId = particles.target_user_id || particles.targetUserId || null;
                const shareMode = normalizeShareMode(particles.mode || 'real-time');
                const atomeIds = Array.isArray(particles.atome_ids) ? particles.atome_ids : [];

                if (!targetUserId || !atomeIds.length) {
                    return { requestId, success: false, error: 'Invalid share request payload' };
                }

                if (shareMode === 'real-time') {
                    return { requestId, success: false, error: 'Real-time shares do not require publish' };
                }

                const items = [];
                for (const id of atomeIds) {
                    const atome = await db.getAtome(String(id));
                    if (!atome) continue;
                    items.push({
                        atome_id: String(id),
                        parent_id: atomeParentIdOf(atome),
                        atome_type: atomeTypeOf(atome) || null
                    });
                }

                await broadcastShareCommand({
                    recipients: [String(targetUserId)],
                    senderUserId: userId,
                    command: 'share-publish',
                    params: {
                        request_id: particles.request_id || particles.requestId || requestIdValue || null,
                        items,
                        at: new Date().toISOString()
                    }
                });

                await commitSharingAtomePatch(
                    atomeIdOf(requestRecord),
                    { published_at: new Date().toISOString() },
                    userId
                );

                return { requestId, success: true };
            }

            case 'policy': {
                const peerUserId = message?.peer_user_id || null;
                const policy = message?.policy || null;
                const permissions = message?.permissions || null;
                if (!peerUserId || !policy) {
                    return { requestId, success: false, error: 'Missing peer_user_id or policy' };
                }
                const policyId = await upsertSharePolicy(userId, peerUserId, policy, permissions);
                return { requestId, success: true, policyId };
            }

            case 'create': {
                const { atome_id, principal_id, permission, particle_key, expires_at } = message;
                if (!atome_id || !principal_id) {
                    return { requestId, success: false, error: 'Missing atome_id or principal_id' };
                }
                const visibilityCheck = await enforceRecipientVisibility({
                    sharerId: userId,
                    targetUserId: principal_id,
                    context: 'share-create'
                });
                if (!visibilityCheck.ok) {
                    return { requestId, success: false, error: visibilityCheck.error || 'Recipient is private' };
                }
                const permLevel = typeof permission === 'string' ? parsePermission(permission) : (permission || PERMISSION.READ);
                const result = await createShare(userId, atome_id, principal_id, permLevel, {
                    particleKey: particle_key,
                    expiresAt: expires_at
                });
                return { requestId, ...result };
            }

            case 'revoke': {
                const { permission_id } = message;
                if (!permission_id) {
                    return { requestId, success: false, error: 'Missing permission_id' };
                }
                const result = await revokeShare(userId, parseInt(permission_id));
                return { requestId, ...result };
            }

            case 'get-atome': {
                const { atome_id } = message;
                if (!atome_id) {
                    return { requestId, success: false, error: 'Missing atome_id' };
                }
                const canView = await checkCanShare(userId, atome_id);
                if (!canView) {
                    return { requestId, success: false, error: 'Access denied' };
                }
                const shares = await getSharesForAtome(atome_id);
                return { requestId, success: true, data: shares };
            }

            case 'my-shares': {
                const shares = await getSharesGrantedByUser(userId);
                return { requestId, success: true, data: shares };
            }

            case 'shared-with-me': {
                const shares = await getSharesForUser(userId);
                return { requestId, success: true, data: shares };
            }

            case 'inbox': {
                const box = message?.box || 'inbox';
                const status = message?.status || message?.statuses || null;
                const requests = await listShareRequestsForUser(userId, { box, status });
                console.log('[Share] Inbox fetch:', {
                    userId,
                    box,
                    status,
                    count: Array.isArray(requests) ? requests.length : 0
                });
                return { requestId, success: true, data: requests };
            }

            case 'accessible': {
                const { atome_type } = message;
                const atomes = await getAccessibleAtomes(userId, atome_type || null);
                return { requestId, success: true, data: atomes, count: atomes.length };
            }

            case 'check': {
                const { atome_id, permission } = message;
                if (!atome_id) {
                    return { requestId, success: false, error: 'Missing atome_id' };
                }
                const permLevel = parsePermission(permission || 'read');
                const hasPermission = await checkPermission(userId, atome_id, permLevel);
                return {
                    requestId,
                    success: true,
                    atome_id,
                    user_id: userId,
                    permission: permission || 'read',
                    granted: hasPermission
                };
            }

            default:
                return { requestId, success: false, error: `Unknown action: ${action}` };
        }
    } catch (error) {
        console.error('Share message error:', error.message);
        return { requestId, success: false, error: error.message };
    }
}

/**
 * Register sharing WebSocket handler with EventBus
 */
export function registerSharingWebSocket() {
    const eventBus = getABoxEventBus();
    if (!eventBus) {
        console.warn('EventBus not available, sharing WebSocket handler not registered');
        return;
    }

    eventBus.on('share', async (message, socket) => {
        const userId = socket?.userId || message.userId;
        const response = await handleShareMessage(message, userId);

        if (socket && typeof socket.send === 'function') {
            socket.send(JSON.stringify({ type: 'share-response', ...response }));
        }
    });

    console.log('Sharing WebSocket handler registered (ADOLE v3.0)');
}

/**
 * Register sharing routes (backward compatibility)
 * In ADOLE v3.0, sharing is handled via WebSocket, not HTTP routes
 */
export function registerSharingRoutes(server, validateToken) {
    // Register WebSocket handler
    registerSharingWebSocket();
    console.log('Sharing routes registered (ADOLE v3.0 - WebSocket mode)');
}

export default {
    PERMISSION,
    createShare,
    revokeShare,
    checkPermission,
    getSharesForAtome,
    getSharesForUser,
    getSharesGrantedByUser,
    getAccessibleAtomes,
    parsePermission,
    getPermissionName,
    handleShareMessage,
    registerSharingWebSocket,
    registerSharingRoutes
};
