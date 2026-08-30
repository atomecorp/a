import crypto from 'node:crypto';
import db from '../database/adole.js';
import { createUserVaultProvider } from './userVaultProvider.js';

const vaultKey = (principalId) => crypto
    .createHash('sha256')
    .update(String(principalId))
    .digest('hex');

const parseJson = (value, fallback = null) => {
    if (value == null) return fallback;
    if (typeof value === 'object') return value;
    try { return JSON.parse(value); } catch (_) { return fallback; }
};

const activeShareSql = `status IN ('active', 'accepted')
    AND share_type = 'linked'
    AND (expires_at IS NULL OR expires_at > datetime('now'))`;

const allowedProperties = (share) => {
    const value = parseJson(share?.allowed_properties_json, null);
    return Array.isArray(value) && value.length ? new Set(value.map(String)) : null;
};

const filterProperties = (properties, share) => {
    const allowed = allowedProperties(share);
    if (!allowed) return { ...(properties || {}) };
    return Object.fromEntries(Object.entries(properties || {}).filter(([key]) => allowed.has(key)));
};

export class UserVaultRouter {
    constructor(options = {}) {
        this.provider = options.provider || createUserVaultProvider(options);
    }

    async provision(principalId) {
        const id = String(principalId || '').trim();
        if (!id) throw new Error('vault_principal_required');
        const record = await this.provider.ensure(id);
        await db.query(
            'run',
            `INSERT INTO vault_principal_registry (principal_id, provider, vault_key, status)
             VALUES (?, 'process', ?, 'active')
             ON CONFLICT(principal_id) DO UPDATE SET status = 'active', updated_at = datetime('now')`,
            [id, vaultKey(id)]
        );
        return record;
    }

    async vaultPrincipalForAtome(atomeId, defaultPrincipalId = null) {
        const id = String(atomeId || '').trim();
        if (!id) return defaultPrincipalId;
        const row = await db.query(
            'get',
            'SELECT vault_principal_id FROM vault_object_registry WHERE atome_id = ?',
            [id]
        );
        return row?.vault_principal_id || defaultPrincipalId;
    }

    async registerAtome(atomeId, principalId) {
        await this.provision(principalId);
        await db.query(
            'run',
            `INSERT INTO vault_object_registry (atome_id, vault_principal_id)
             VALUES (?, ?) ON CONFLICT(atome_id) DO NOTHING`,
            [atomeId, principalId]
        );
        const registered = await this.vaultPrincipalForAtome(atomeId);
        if (registered !== String(principalId)) throw new Error('vault_object_owner_conflict');
    }

    async registerStream(event, principalId) {
        const streamId = String(event?.stream_id || event?.stream || '').trim();
        if (!streamId) throw new Error('vault_stream_required');
        await db.query(
            'run',
            `INSERT INTO vault_stream_registry
             (stream_id, vault_principal_id, project_id, atome_id)
             VALUES (?, ?, ?, ?)
             ON CONFLICT(stream_id) DO UPDATE SET
                 vault_principal_id = excluded.vault_principal_id,
                 project_id = COALESCE(excluded.project_id, vault_stream_registry.project_id),
                 atome_id = COALESCE(excluded.atome_id, vault_stream_registry.atome_id)`,
            [streamId, principalId, event?.project_id || null, event?.atome_id || null]
        );
    }

    async commit(authenticatedPrincipalId, event, options = {}) {
        const actorId = String(authenticatedPrincipalId || '').trim();
        if (!actorId) throw new Error('authenticated_user_missing');
        const normalized = {
            ...event,
            actor: { ...(event?.actor || {}), type: 'user', id: actorId },
            source: options.source || event?.source || null
        };
        const ownerId = await this.vaultPrincipalForAtome(normalized.atome_id, actorId);
        if (String(ownerId) !== actorId) await this.authorizeSharedWrite(actorId, normalized);
        const committed = await this.provider.request(ownerId, 'event:commit', {
            event: normalized,
            source: normalized.source,
            conflictMode: options.conflictMode || null,
            authorized_actor_id: actorId
        });
        await this.registerAtome(normalized.atome_id, ownerId);
        await this.registerStream(committed, ownerId);
        return { event: committed, inserted: committed.inserted === true, vaultPrincipalId: ownerId };
    }

    async commitBatch(authenticatedPrincipalId, events, options = {}) {
        const results = [];
        for (const event of events || []) {
            results.push(await this.commit(authenticatedPrincipalId, {
                ...event,
                tx_id: event.tx_id || event.txId || options.txId || null
            }, options));
        }
        return results;
    }

    async getState(requestingPrincipalId, atomeId) {
        const ownerId = await this.vaultPrincipalForAtome(atomeId, requestingPrincipalId);
        await this.provision(ownerId);
        const state = await this.provider.request(ownerId, 'state:get', { atome_id: atomeId });
        if (!state) return null;
        if (String(ownerId) === String(requestingPrincipalId)) {
            return { ...state, vault_principal_id: ownerId };
        }
        const share = await this.shareForAtome(requestingPrincipalId, atomeId);
        if (!share) return null;
        return {
            ...state,
            properties: filterProperties(state.properties, share),
            vault_principal_id: ownerId,
            sync_share_id: share.share_id
        };
    }

    async listStates(requestingPrincipalId, options = {}) {
        await this.provision(requestingPrincipalId);
        const states = await this.provider.request(requestingPrincipalId, 'state:list', options);
        const own = (states || []).map((state) => ({ ...state, vault_principal_id: requestingPrincipalId }));
        if (options.includeShared !== true && options.include_shared !== true) return own;
        const shares = await db.query(
            'all',
            `SELECT * FROM sync_share_requests WHERE principal_id = ? AND ${activeShareSql}`,
            [requestingPrincipalId]
        );
        for (const share of shares || []) {
            const state = await this.provider.request(share.owner_id, 'state:get', { atome_id: share.atome_id });
            if (!state) continue;
            own.push({
                ...state,
                properties: filterProperties(state.properties, share),
                vault_principal_id: share.owner_id,
                sync_share_id: share.share_id
            });
        }
        return own;
    }

    async listEvents(requestingPrincipalId, options = {}) {
        await this.provision(requestingPrincipalId);
        return this.provider.request(requestingPrincipalId, 'events:list', options);
    }

    async streamAccess(principalId, streamId) {
        const stream = await db.query(
            'get',
            'SELECT * FROM vault_stream_registry WHERE stream_id = ?',
            [String(streamId || '')]
        );
        if (!stream) return null;
        if (String(stream.vault_principal_id) === String(principalId)) return { ...stream, owner: true };
        const share = await db.query(
            'get',
            `SELECT * FROM sync_share_requests
             WHERE stream_id = ? AND principal_id = ? AND ${activeShareSql}
             ORDER BY updated_at DESC LIMIT 1`,
            [streamId, principalId]
        );
        return share ? { ...stream, owner: false, share } : null;
    }

    async listAuthorizedStreams(principalId) {
        const owned = await db.query(
            'all',
            'SELECT stream_id FROM vault_stream_registry WHERE vault_principal_id = ? ORDER BY stream_id',
            [principalId]
        );
        const shared = await db.query(
            'all',
            `SELECT DISTINCT stream_id FROM sync_share_requests
             WHERE principal_id = ? AND ${activeShareSql} ORDER BY stream_id`,
            [principalId]
        );
        return Array.from(new Set([...(owned || []), ...(shared || [])].map((row) => row.stream_id).filter(Boolean)));
    }

    async listStreamEvents(principalId, streamId, options = {}) {
        const stream = await this.streamAccess(principalId, streamId);
        if (!stream) throw new Error('stream_access_denied');
        const requestedLimit = Math.max(1, Math.min(Number(options.limit) || 500, 1000));
        const rows = await this.provider.request(stream.vault_principal_id, 'stream:events', {
            stream_id: streamId,
            cursor: options.cursor,
            limit: requestedLimit
        });
        const deliverable = stream.owner || stream.share.share_mode === 'real-time'
            ? rows
            : rows.filter((event) => Number(event.sequence) <= Number(stream.share.publication_cursor || 0));
        return deliverable.map((event) => this.projectStreamEvent(event, stream));
    }

    async streamHead(principalId, streamId) {
        const stream = await this.streamAccess(principalId, streamId);
        if (!stream || String(stream.vault_principal_id) !== String(principalId)) {
            throw new Error('stream_owner_required');
        }
        return this.provider.request(stream.vault_principal_id, 'stream:head', { stream_id: streamId });
    }

    projectStreamEvent(event, access) {
        if (access.owner) return event;
        const share = access.share;
        const payload = event?.payload && typeof event.payload === 'object' ? event.payload : {};
        const allowed = allowedProperties(share);
        const props = filterProperties(payload.props, share);
        const deleteKeys = (payload.delete_keys || payload.deleteKeys || []).filter((key) => !allowed || allowed.has(String(key)));
        const decisions = Object.fromEntries(Object.entries(event.lww_decisions || {}).filter(([key]) => (
            key === '__lifecycle__' || !allowed || allowed.has(key)
        )));
        const projection = event.projection && typeof event.projection === 'object'
            ? { ...event.projection, properties: filterProperties(event.projection.properties, share) }
            : null;
        return {
            ...event,
            payload: { ...payload, props, delete_keys: deleteKeys },
            lww_decisions: decisions,
            projection
        };
    }

    async projectEventForPrincipal(principalId, event) {
        const access = await this.streamAccess(principalId, event?.stream_id || event?.stream);
        if (!access) return null;
        if (!access.owner && access.share.share_mode === 'manual'
            && Number(event.sequence) > Number(access.share.publication_cursor || 0)) return null;
        return this.projectStreamEvent(event, access);
    }

    async shareForAtome(principalId, atomeId) {
        return db.query(
            'get',
            `SELECT * FROM sync_share_requests
             WHERE atome_id = ? AND principal_id = ? AND ${activeShareSql}
             ORDER BY updated_at DESC LIMIT 1`,
            [atomeId, principalId]
        );
    }

    async authorizeSharedWrite(principalId, event) {
        const share = await this.shareForAtome(principalId, event.atome_id);
        if (!share) throw new Error('property_write_denied');
        const permissions = parseJson(share.permissions_json, {});
        if (permissions.can_write !== true && permissions.write !== true && permissions.alter !== true) {
            throw new Error('property_write_denied');
        }
        const allowed = allowedProperties(share);
        if (!allowed) return true;
        const payload = event.payload || {};
        const touched = [...Object.keys(payload.props || {}), ...(payload.delete_keys || payload.deleteKeys || [])];
        if (touched.some((key) => !allowed.has(String(key)))) throw new Error('property_write_denied');
        return true;
    }

    async stopAll() {
        await this.provider.stopAll();
    }
}

export const createUserVaultRouter = (options) => new UserVaultRouter(options);
