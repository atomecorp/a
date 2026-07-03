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

export async function commitSharingAtomeCreate({
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

export async function commitSharingAtomePatch(atomeId, properties, actorId) {
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

export async function ensureProjectContainer({ projectId, ownerId }) {
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

export async function resolveUserCurrentProjectId(userId) {
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

export function normalizeDurationToExpiry(duration) {
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

export async function findSharePolicy(ownerId, peerUserId) {
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

export async function upsertSharePolicy(ownerId, peerUserId, policy, permissions) {
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

export function extractShareType(particles) {
    const direct = particles?.share_type || particles?.shareType || null;
    const overrides = particles?.property_overrides || particles?.propertyOverrides || {};
    const override = overrides.__shareType || overrides.__share_type || overrides.shareType || overrides.share_type || null;
    return String(direct || override || 'linked');
}

export function extractShareMeta(particles) {
    const override = particles?.property_overrides?.__share_meta || particles?.share_meta || null;
    return override && typeof override === 'object' ? override : {};
}

export function extractAtomeIdsFromRequest(particles) {
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

export async function resolveShareAtomeIds(atomeIds) {
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


export function normalizeShareMode(rawMode) {
    const mode = String(rawMode || '').toLowerCase();
    if (mode === 'validation-based' || mode === 'manual' || mode === 'non-real-time') return 'manual';
    return 'real-time';
}

export async function resolveReceiverProjectIdFromState(userId) {
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

export async function resolveProjectIdForAtome(atomeId, maxDepth = 16) {
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

export async function resolveTargetUserId({ targetUserId, targetPhone }) {
    if (targetUserId) return String(targetUserId);
    if (!targetPhone) return null;
    return await lookupUserByPhone(targetPhone);
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
    getPermissionName
};
