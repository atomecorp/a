import crypto from 'node:crypto';
import db from '../database/adole.js';
import { createUserVaultProvider } from './userVaultProvider.js';
import { normalizeRights } from '../atome/src/shared/share_rights.js';
import {
    ACTIVE_LINKED_SHARE_SQL,
    findShareForAtome,
    isWithinSharedRoot,
    sharePermissions,
    stateAtomeId,
    stateParentId,
    statesWithinSharedRoot
} from './syncShareHierarchy.js';

const vaultKey = (principalId) => crypto
    .createHash('sha256')
    .update(String(principalId))
    .digest('hex');

const parseJson = (value, fallback = null) => {
    if (value == null) return fallback;
    if (typeof value === 'object') return value;
    try { return JSON.parse(value); } catch (_) { return fallback; }
};

// Deux listes distinctes (D8) : ce que le destinataire VOIT et ce qu'il peut MODIFIER.
// `allowed_properties_json` (historique) sert de repli aux deux.
const propertySet = (share, column) => {
    const value = parseJson(share?.[column], null) ?? parseJson(share?.allowed_properties_json, null);
    return Array.isArray(value) && value.length ? new Set(value.map(String)) : null;
};
const allowedProperties = (share) => propertySet(share, 'readable_properties_json');
const writableProperties = (share) => propertySet(share, 'writable_properties_json');

const filterProperties = (properties, share) => {
    const allowed = allowedProperties(share);
    if (!allowed) return { ...(properties || {}) };
    return Object.fromEntries(Object.entries(properties || {}).filter(([key]) => allowed.has(key)));
};

const SYSTEM_STATE_TYPES = new Set(['project', 'user', 'blackhole', 'tool', 'tool_macro', 'toolbox', 'tool_block', 'panel', 'system']);
const stateType = (state) => String(state?.type || state?.atome_type || state?.properties?.type || state?.properties?.kind || '').toLowerCase();
const stateProjectId = (state) => state?.meta?.project_id || state?.project_id || state?.properties?.project_id || null;

// Memes criteres que `listStateCurrent` (database/adole.js) cote proprietaire.
const matchesListScope = (state, options = {}) => {
    const projectId = options.project_id || options.projectId || null;
    if (projectId && String(stateProjectId(state) || '') !== String(projectId)) return false;
    const atomeType = String(options.atome_type || options.atomeType || '').trim().toLowerCase();
    if (atomeType && stateType(state) !== atomeType && String(state?.kind || '').toLowerCase() !== atomeType) return false;
    if (options.exclude_system === true || options.excludeSystem === true) {
        const id = String(stateAtomeId(state) || '').toLowerCase();
        if (SYSTEM_STATE_TYPES.has(stateType(state)) || id.startsWith('tool.ui.') || id.startsWith('tool_ui.')) return false;
    }
    return true;
};

// Etat d'un autre coffre vu au travers d'un partage actif : proprietes lisibles seulement,
// et capacites = celles du partage (et non celles de l'ancien modele de permissions central).
const projectSharedState = (state, share) => {
    const rights = normalizeRights(sharePermissions(share));
    return {
        ...state,
        properties: filterProperties(state.properties, share),
        vault_principal_id: share.owner_id,
        sync_share_id: share.share_id,
        capabilities: {
            read: rights.read,
            write: rights.write,
            create: rights.create,
            delete: rights.delete,
            share: rights.reshare
        }
    };
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
        let ownerId = await this.vaultPrincipalForAtome(normalized.atome_id, null);
        if (!ownerId) {
            const parentId = stateParentId({ properties: normalized.payload?.props || {} })
                || normalized.parent_id || normalized.parentId || normalized.project_id || normalized.projectId || null;
            const parentOwnerId = parentId ? await this.vaultPrincipalForAtome(parentId, null) : null;
            if (parentOwnerId && String(parentOwnerId) !== actorId) {
                await this.authorizeSharedCreate(actorId, parentOwnerId, parentId);
                ownerId = parentOwnerId;
            }
        }
        ownerId ||= actorId;
        if (String(ownerId) !== actorId && await this.vaultPrincipalForAtome(normalized.atome_id, null)) {
            await this.authorizeSharedWrite(actorId, normalized, ownerId);
        }
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
        return projectSharedState(state, share);
    }

    async listStates(requestingPrincipalId, options = {}) {
        await this.provision(requestingPrincipalId);
        const includeShared = options.includeShared === true || options.include_shared === true;
        if (!includeShared) {
            const states = await this.provider.request(requestingPrincipalId, 'state:list', options);
            return (states || []).map((state) => ({ ...state, vault_principal_id: requestingPrincipalId }));
        }
        // Pagination sur l'ensemble FUSIONNE (propres puis partages) : le client avance son
        // offset du nombre d'etats recus, donc des partages ajoutes a chaque page creaient des
        // doublons et faisaient sauter des etats propres.
        const limit = Math.max(1, Math.min(Number(options.limit) || 1000, 10000));
        const offset = Math.max(0, Number(options.offset) || 0);
        const ownStates = await this.provider.request(requestingPrincipalId, 'state:list', {
            ...options,
            limit: Math.min(offset + limit, 10000),
            offset: 0
        });
        const merged = (ownStates || []).map((state) => ({ ...state, vault_principal_id: requestingPrincipalId }));
        const shares = await db.query(
            'all',
            `SELECT * FROM sync_share_requests WHERE principal_id = ? AND ${ACTIVE_LINKED_SHARE_SQL}`,
            [requestingPrincipalId]
        );
        const seen = new Set(merged.map((state) => String(stateAtomeId(state))));
        for (const share of shares || []) {
            const states = await statesWithinSharedRoot({
                provider: this.provider,
                ownerId: share.owner_id,
                rootAtomeId: share.atome_id
            });
            for (const state of states) {
                const id = String(stateAtomeId(state));
                // Les filtres de la requete (projet, type, systeme) valent aussi pour les
                // partages : sinon ouvrir un projet y injectait tous les objets partages.
                if (seen.has(id) || !matchesListScope(state, options)) continue;
                seen.add(id);
                merged.push(projectSharedState(state, share));
            }
        }
        return merged.slice(offset, offset + limit);
    }

    async listEvents(requestingPrincipalId, options = {}) {
        await this.provision(requestingPrincipalId);
        return this.provider.request(requestingPrincipalId, 'events:list', options);
    }

    async applyHistory(principalId, options = {}) {
        await this.provision(principalId);
        const result = await this.provider.request(principalId, 'history:apply', options);
        if (result.ok) for (const event of result.events || []) await this.registerStream(event, principalId);
        return result;
    }

    // Un flux de synchro couvre un PROJET entier (`project:<id>`), alors qu'un partage couvre
    // une racine (un objet et ses descendants). L'acces au flux vient donc des partages actifs
    // qui le designent, et chaque evenement est ensuite filtre par objet (`projectStreamEvent`).
    // Le registre ne retient qu'un `atome_id` par flux (le dernier ecrit) : il ne peut pas
    // servir d'autorite, sinon partager un objet ouvre tout le projet.
    async streamAccess(principalId, streamId) {
        const stream = await db.query(
            'get',
            'SELECT * FROM vault_stream_registry WHERE stream_id = ?',
            [String(streamId || '')]
        );
        if (!stream) return null;
        if (String(stream.vault_principal_id) === String(principalId)) return { ...stream, owner: true };
        const shares = await db.query(
            'all',
            `SELECT * FROM sync_share_requests
             WHERE principal_id = ? AND owner_id = ? AND stream_id = ? AND ${ACTIVE_LINKED_SHARE_SQL}
             ORDER BY updated_at DESC`,
            [principalId, stream.vault_principal_id, stream.stream_id]
        );
        return shares?.length ? { ...stream, owner: false, shares } : null;
    }

    // Flux dans lequel vivent les evenements d'un objet du coffre de `ownerId`.
    async streamForAtome(ownerId, atomeId) {
        const events = await this.provider.request(ownerId, 'events:list', {
            atome_id: atomeId,
            limit: 1,
            order: 'desc'
        });
        const streamId = String(events?.[0]?.stream_id || events?.[0]?.stream || '').trim();
        if (!streamId) return null;
        const stream = await db.query(
            'get',
            'SELECT * FROM vault_stream_registry WHERE stream_id = ? AND vault_principal_id = ?',
            [streamId, ownerId]
        );
        return stream || null;
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
             WHERE principal_id = ? AND ${ACTIVE_LINKED_SHARE_SQL} ORDER BY stream_id`,
            [principalId]
        );
        return Array.from(new Set([...(owned || []), ...(shared || [])].map((row) => row.stream_id).filter(Boolean)));
    }

    async listShareStreams(principalId, shareId) {
        const share = await db.query(
            'get',
            `SELECT stream_id FROM sync_share_requests
             WHERE share_id = ? AND principal_id = ? AND ${ACTIVE_LINKED_SHARE_SQL}`,
            [shareId, principalId]
        );
        return share?.stream_id ? [share.stream_id] : [];
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
        const shareCache = new Map();
        const projected = [];
        for (const event of rows || []) {
            const visible = await this.projectStreamEvent(event, stream, shareCache);
            if (visible) projected.push(visible);
        }
        return projected;
    }

    // Partage (parmi ceux qui ouvrent ce flux) dont la racine contient l'objet de l'evenement.
    async shareCoveringEvent(event, access, cache = new Map()) {
        const atomeId = String(event?.atome_id || '').trim();
        if (!atomeId) return null;
        if (cache.has(atomeId)) return cache.get(atomeId);
        let covering = null;
        for (const share of access.shares || []) {
            if (await isWithinSharedRoot({
                provider: this.provider,
                ownerId: access.vault_principal_id,
                atomeId,
                rootAtomeId: share.atome_id
            })) { covering = share; break; }
        }
        cache.set(atomeId, covering);
        return covering;
    }

    async streamHead(principalId, streamId) {
        const stream = await this.streamAccess(principalId, streamId);
        if (!stream || String(stream.vault_principal_id) !== String(principalId)) {
            throw new Error('stream_owner_required');
        }
        return this.provider.request(stream.vault_principal_id, 'stream:head', { stream_id: streamId });
    }

    async projectStreamEvent(event, access, shareCache = new Map()) {
        if (access.owner) return { ...event, vault_principal_id: access.vault_principal_id };
        const share = await this.shareCoveringEvent(event, access, shareCache);
        if (!share) return null;
        if (share.share_mode === 'manual' && Number(event.sequence) > Number(share.publication_cursor || 0)) return null;
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
            vault_principal_id: access.vault_principal_id,
            payload: { ...payload, props, delete_keys: deleteKeys },
            lww_decisions: decisions,
            projection
        };
    }

    async projectEventForPrincipal(principalId, event) {
        const access = await this.streamAccess(principalId, event?.stream_id || event?.stream);
        if (!access) return null;
        return this.projectStreamEvent(event, access);
    }

    async shareForAtome(principalId, atomeId, ownerId = null) {
        const resolvedOwnerId = ownerId || await this.vaultPrincipalForAtome(atomeId, null);
        if (!resolvedOwnerId) return null;
        return findShareForAtome({
            db,
            provider: this.provider,
            principalId,
            ownerId: resolvedOwnerId,
            atomeId
        });
    }

    async authorizeSharedCreate(principalId, ownerId, parentId) {
        const share = await this.shareForAtome(principalId, parentId, ownerId);
        const permissions = normalizeRights(sharePermissions(share));
        if (!share || permissions.create !== true) {
            throw new Error('property_create_denied');
        }
        return true;
    }

    async authorizeSharedWrite(principalId, event, ownerId = null) {
        const share = await this.shareForAtome(principalId, event.atome_id, ownerId);
        if (!share) throw new Error('property_write_denied');
        const permissions = normalizeRights(sharePermissions(share));
        const isDelete = String(event.kind || '').toLowerCase() === 'delete';
        // Supprimer est une capacite a part entiere : elle n'exige pas en plus `write`.
        if (isDelete) {
            if (permissions.delete !== true) throw new Error('property_delete_denied');
            return true;
        }
        if (permissions.write !== true) throw new Error('property_write_denied');
        const allowed = writableProperties(share);
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
