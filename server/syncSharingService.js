import crypto from 'node:crypto';
import db from '../database/adole.js';
import { resolveTargetUserId } from './sharing.js';

const parseJson = (value, fallback = null) => {
    if (value == null) return fallback;
    if (typeof value === 'object') return value;
    try { return JSON.parse(value); } catch (_) { return fallback; }
};

const activeLinkedShareSql = `status IN ('active', 'accepted') AND share_type = 'linked'
    AND (expires_at IS NULL OR expires_at > datetime('now'))`;

const normalizeMode = (value) => ['manual', 'validation-based', 'non-real-time'].includes(
    String(value || '').trim().toLowerCase()
) ? 'manual' : 'real-time';

const normalizeType = (value) => ['copy', 'detached'].includes(
    String(value || '').trim().toLowerCase()
) ? 'detached' : 'linked';

const normalizePermissions = (value = {}) => ({
    can_read: value.can_read === true || value.read === true,
    can_write: value.can_write === true || value.write === true || value.alter === true,
    can_delete: value.can_delete === true || value.delete === true,
    can_create: value.can_create === true || value.create === true,
    can_share: value.can_share === true || value.share === true
});

const allowedProperties = (message = {}) => {
    const direct = message.allowed_properties || message.allowedProperties;
    if (Array.isArray(direct)) return Array.from(new Set(direct.map(String).filter(Boolean)));
    const overrides = message.property_overrides || message.propertyOverrides || {};
    const nested = overrides.allowed_properties || overrides.allowedProperties;
    if (Array.isArray(nested)) return Array.from(new Set(nested.map(String).filter(Boolean)));
    const keys = Object.entries(overrides).filter(([key, value]) => (
        !key.startsWith('__') && key !== 'shareType'
        && (value === true || value?.read === true || value?.can_read === true)
    )).map(([key]) => key);
    return keys.length ? keys : null;
};

const visibleRow = (row) => ({
    share_id: row.share_id,
    request_id: row.share_id,
    owner_id: row.owner_id,
    principal_id: row.principal_id,
    atome_id: row.atome_id,
    stream_id: row.stream_id,
    share_type: row.share_type,
    share_mode: row.share_mode,
    status: row.status,
    permissions: parseJson(row.permissions_json, {}),
    allowed_properties: parseJson(row.allowed_properties_json, null),
    publication_cursor: Number(row.publication_cursor || 0),
    detached_atome_id: row.detached_atome_id || null,
    expires_at: row.expires_at || null,
    created_at: row.created_at,
    updated_at: row.updated_at
});

export class SyncSharingService {
    constructor(options = {}) {
        this.vaultRouter = options.vaultRouter;
        this.syncRuntime = options.syncRuntime;
        this.isProvisioned = options.isProvisioned;
        this.notifyPrincipal = options.notifyPrincipal || (() => {});
    }

    async targetId(message) {
        const direct = message.target_user_id || message.targetUserId || message.principal_id || message.principalId;
        if (direct) return String(direct);
        return resolveTargetUserId({
            targetUserId: null,
            targetPhone: message.target_phone || message.targetPhone || null
        });
    }

    async ownedStream(ownerId, atomeId) {
        const object = await db.query(
            'get',
            'SELECT vault_principal_id FROM vault_object_registry WHERE atome_id = ?',
            [atomeId]
        );
        if (!object || String(object.vault_principal_id) !== String(ownerId)) {
            throw new Error('share_owner_required');
        }
        const stream = await db.query(
            'get',
            'SELECT * FROM vault_stream_registry WHERE atome_id = ? AND vault_principal_id = ?',
            [atomeId, ownerId]
        );
        if (!stream) throw new Error('share_stream_not_found');
        return stream;
    }

    async policy(ownerId, peerId) {
        return db.query(
            'get',
            `SELECT * FROM sync_share_policies
             WHERE owner_id = ? AND peer_id = ? AND revoked_at IS NULL`,
            [ownerId, peerId]
        );
    }

    constrainPermissions(requested, accepted) {
        if (!accepted) return requested;
        return Object.fromEntries(Object.keys(requested).map((key) => [
            key, requested[key] === true && accepted[key] === true
        ]));
    }

    async request(ownerId, message, { direct = false } = {}) {
        const principalId = await this.targetId(message);
        if (!principalId || !await this.isProvisioned(principalId)) throw new Error('target_not_provisioned');
        const ids = Array.isArray(message.atome_ids)
            ? message.atome_ids.map(String).filter(Boolean)
            : [message.atome_id || message.atomeId].filter(Boolean).map(String);
        if (!ids.length) throw new Error('share_atome_required');
        const peerPolicy = await this.policy(principalId, ownerId);
        if (peerPolicy?.policy === 'block') throw new Error('blocked');
        const requested = normalizePermissions(message.permissions || message.permission || {});
        const accepted = parseJson(peerPolicy?.permissions_json, null);
        const permissions = peerPolicy?.policy === 'always'
            ? this.constrainPermissions(requested, accepted)
            : requested;
        const shareMode = normalizeMode(message.mode || message.share_mode);
        const shareType = normalizeType(message.share_type || message.shareType || message.property_overrides?.__shareType);
        const initialStatus = direct || peerPolicy?.policy === 'always'
            ? (shareType === 'linked' ? 'active' : 'accepted')
            : (peerPolicy?.policy === 'never' ? 'rejected' : 'pending');
        const rows = [];
        for (const atomeId of ids) {
            const stream = await this.ownedStream(ownerId, atomeId);
            const shareId = crypto.randomUUID();
            await db.query(
                'run',
                `INSERT INTO sync_share_requests
                 (share_id, owner_id, principal_id, atome_id, stream_id, share_type,
                  share_mode, status, permissions_json, allowed_properties_json, expires_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    shareId, ownerId, principalId, atomeId, stream.stream_id, shareType,
                    shareMode, initialStatus, JSON.stringify(permissions),
                    JSON.stringify(allowedProperties(message)), message.expires_at || message.expiresAt || null
                ]
            );
            let row = await this.get(shareId);
            if (initialStatus === 'active' || initialStatus === 'accepted') row = await this.activate(row);
            const visible = visibleRow(row);
            rows.push(visible);
            this.notifyPrincipal(principalId, {
                type: 'share-invitation',
                share: visible,
                streams: visible.share_type === 'linked' && visible.status === 'active'
                    ? [visible.stream_id]
                    : []
            });
        }
        return { ok: true, requests: rows, streams: rows.filter((row) => row.share_type === 'linked').map((row) => row.stream_id) };
    }

    async get(shareId) {
        return db.query('get', 'SELECT * FROM sync_share_requests WHERE share_id = ?', [shareId]);
    }

    async activate(row) {
        if (!row) throw new Error('share_request_not_found');
        if (row.share_type === 'detached') {
            const state = await this.vaultRouter.getState(row.owner_id, row.atome_id);
            if (!state) throw new Error('share_source_state_missing');
            const allowed = parseJson(row.allowed_properties_json, null);
            const properties = allowed?.length
                ? Object.fromEntries(Object.entries(state.properties || {}).filter(([key]) => allowed.includes(key)))
                : { ...(state.properties || {}) };
            const detachedId = crypto.randomUUID();
            await this.vaultRouter.commit(row.principal_id, {
                id: crypto.randomUUID(),
                kind: 'set',
                atome_id: detachedId,
                actor: { type: 'user', id: row.principal_id },
                payload: {
                    props: {
                        ...properties,
                        detached_from: row.atome_id,
                        detached_share_id: row.share_id
                    }
                }
            }, { source: `share-detached:${row.share_id}` });
            await db.query(
                'run',
                `UPDATE sync_share_requests SET status = 'accepted', detached_atome_id = ?,
                 updated_at = datetime('now') WHERE share_id = ?`,
                [detachedId, row.share_id]
            );
        } else {
            await db.query(
                'run',
                `UPDATE sync_share_requests SET status = 'active', updated_at = datetime('now')
                 WHERE share_id = ?`,
                [row.share_id]
            );
            await this.syncRuntime?.grantStream?.(row.principal_id, row.stream_id);
        }
        return this.get(row.share_id);
    }

    async respond(principalId, message) {
        const shareId = String(message.share_id || message.request_id || message.request_atome_id || '').trim();
        const row = await this.get(shareId);
        if (!row || String(row.principal_id) !== String(principalId)) throw new Error('share_request_not_found');
        const decision = String(message.status || message.decision || '').toLowerCase();
        if (decision === 'rejected') {
            await db.query('run', "UPDATE sync_share_requests SET status = 'rejected', updated_at = datetime('now') WHERE share_id = ?", [shareId]);
        } else if (decision === 'accepted') {
            await this.activate(row);
        } else throw new Error('share_decision_invalid');
        if (message.policy && message.policy !== 'one-shot') {
            await this.setPolicy(principalId, row.owner_id, message.policy, parseJson(row.permissions_json, {}));
        }
        const updated = await this.get(shareId);
        this.notifyPrincipal(updated.owner_id, {
            type: 'share-decision',
            share: visibleRow(updated)
        });
        return { ok: true, request: visibleRow(updated), streams: updated.share_type === 'linked' ? [updated.stream_id] : [] };
    }

    async publish(ownerId, message) {
        const shareId = String(message.share_id || message.request_id || message.request_atome_id || '').trim();
        const row = await this.get(shareId);
        if (!row || String(row.owner_id) !== String(ownerId)) throw new Error('share_owner_required');
        if (row.share_type !== 'linked' || row.share_mode !== 'manual' || row.status !== 'active') {
            throw new Error('manual_linked_share_required');
        }
        const cursor = await this.vaultRouter.streamHead(ownerId, row.stream_id);
        await db.query(
            'run',
            `UPDATE sync_share_requests SET publication_cursor = ?, updated_at = datetime('now')
             WHERE share_id = ?`,
            [cursor, shareId]
        );
        await this.syncRuntime.replayPrincipalStream(row.principal_id, row.stream_id);
        return { ok: true, share_id: shareId, stream_id: row.stream_id, publication_cursor: cursor };
    }

    async setPolicy(ownerId, peerId, policy, permissions = null) {
        const value = String(policy || 'one-shot').toLowerCase();
        if (!['one-shot', 'always', 'never', 'block'].includes(value)) throw new Error('share_policy_invalid');
        await db.query(
            'run',
            `INSERT INTO sync_share_policies (owner_id, peer_id, policy, permissions_json, revoked_at)
             VALUES (?, ?, ?, ?, NULL)
             ON CONFLICT(owner_id, peer_id) DO UPDATE SET policy = excluded.policy,
             permissions_json = excluded.permissions_json, revoked_at = NULL, updated_at = datetime('now')`,
            [ownerId, peerId, value, permissions ? JSON.stringify(normalizePermissions(permissions)) : null]
        );
        return { ok: true, owner_id: ownerId, peer_id: peerId, policy: value };
    }

    async list(principalId, mode) {
        const column = mode === 'outbox' ? 'owner_id' : 'principal_id';
        const rows = await db.query(
            'all',
            `SELECT * FROM sync_share_requests WHERE ${column} = ? ORDER BY created_at DESC`,
            [principalId]
        );
        return { ok: true, requests: (rows || []).map(visibleRow) };
    }

    async revoke(principalId, message) {
        const shareId = String(message.share_id || message.permission_id || message.request_id || '').trim();
        const row = await this.get(shareId);
        if (!row || ![row.owner_id, row.principal_id].map(String).includes(String(principalId))) {
            throw new Error('share_revoke_denied');
        }
        await db.query('run', "UPDATE sync_share_requests SET status = 'revoked', updated_at = datetime('now') WHERE share_id = ?", [shareId]);
        const remaining = await db.query(
            'get',
            `SELECT share_id FROM sync_share_requests WHERE principal_id = ? AND stream_id = ?
             AND ${activeLinkedShareSql}
             LIMIT 1`,
            [row.principal_id, row.stream_id]
        );
        if (!remaining) this.syncRuntime?.revokeStream?.(row.principal_id, row.stream_id);
        this.notifyPrincipal(row.owner_id === principalId ? row.principal_id : row.owner_id, {
            type: 'share-revoked', share_id: shareId, stream_id: row.stream_id
        });
        return { ok: true, share_id: shareId };
    }

    async handle(message, principalId) {
        const action = String(message.action || '').toLowerCase();
        if (action === 'request') return this.request(principalId, message);
        if (action === 'create') return this.request(principalId, message, { direct: true });
        if (action === 'respond') return this.respond(principalId, message);
        if (action === 'publish') return this.publish(principalId, message);
        if (action === 'policy') return this.setPolicy(
            principalId,
            message.peer_user_id || message.peerUserId,
            message.policy,
            message.permissions
        );
        if (action === 'revoke') return this.revoke(principalId, message);
        if (action === 'inbox' || action === 'shared-with-me') return this.list(principalId, 'inbox');
        if (action === 'my-shares') return this.list(principalId, 'outbox');
        throw new Error(`unsupported_sync_share_action:${action || 'missing'}`);
    }
}

export const createSyncSharingService = (options) => new SyncSharingService(options);
