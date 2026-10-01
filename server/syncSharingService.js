import { hasPrivateProgramAncestor } from './syncShareHierarchy.js';
import crypto from 'node:crypto';
import db from '../database/adole.js';
import { resolveTargetUserId } from './sharing.js';
import {
    OWNER_RIGHTS, attenuatePropertyList, attenuateRights, normalizePropertyList, normalizeRights,
    roleOfRights, toStoredPermissions
} from '../atome/src/shared/share_rights.js';

const parseJson = (value, fallback = null) => {
    if (value == null) return fallback;
    if (typeof value === 'object') return value;
    try { return JSON.parse(value); } catch (_) { return fallback; }
};

const activeLinkedShareSql = `status IN ('active', 'accepted') AND share_type = 'linked'
    AND (expires_at IS NULL OR expires_at > datetime('now'))`;

// SQLite compare `expires_at` a `datetime('now')` en TEXTE : 'AAAA-MM-JJ HH:MM:SS' UTC,
// jamais un ISO avec 'T' (qui se trierait apres toute heure du meme jour).
const sqlTime = (value) => {
    if (!value) return null;
    const date = new Date(String(value).includes('T') || /Z$/.test(String(value)) ? value : `${String(value).replace(' ', 'T')}Z`);
    return Number.isFinite(date.getTime()) ? date.toISOString().replace('T', ' ').slice(0, 19) : null;
};

const normalizeMode = (value) => ['manual', 'validation-based', 'non-real-time'].includes(
    String(value || '').trim().toLowerCase()
) ? 'manual' : 'real-time';

const normalizeType = (value) => ['copy', 'detached'].includes(
    String(value || '').trim().toLowerCase()
) ? 'detached' : 'linked';

// Capacites D8 (read, write, create, delete, reshare, manage), stockees sous leurs noms
// historiques `can_*` (voir atome/src/shared/share_rights.js).
const normalizePermissions = (value = {}) => toStoredPermissions(normalizeRights(value));

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
    rights: normalizeRights(parseJson(row.permissions_json, {})),
    role: roleOfRights(parseJson(row.permissions_json, {})),
    allowed_properties: parseJson(row.allowed_properties_json, null),
    readable_properties: parseJson(row.readable_properties_json, null) ?? parseJson(row.allowed_properties_json, null),
    writable_properties: parseJson(row.writable_properties_json, null) ?? parseJson(row.allowed_properties_json, null),
    parent_share_id: row.parent_share_id || null,
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
        // Le flux est celui ou vivent les evenements de l'objet (un flux par projet), pas la
        // ligne du registre qui porte par hasard cet atome_id (dernier objet ecrit du flux).
        const stream = await this.vaultRouter.streamForAtome(ownerId, atomeId);
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

    // Autorite de `granterId` sur `atomeId` : proprietaire (tous les droits) ou detenteur d'un
    // partage actif portant `reshare` (D9). Renvoie le proprietaire reel et les droits tenus.
    async grantAuthority(granterId, atomeId, capability = 'reshare') {
        if (await hasPrivateProgramAncestor({ provider: this.vaultRouter.provider, ownerId: granterId, atomeId })) {
            throw new Error('program_sharing_not_finalized');
        }
        try {
            const stream = await this.ownedStream(granterId, atomeId);
            return { ownerId: String(granterId), stream, rights: OWNER_RIGHTS, share: null };
        } catch (_) { /* pas proprietaire : on cherche un partage */ }
        const share = typeof this.vaultRouter?.shareForAtome === 'function'
            ? await this.vaultRouter.shareForAtome(granterId, atomeId)
            : null;
        const rights = normalizeRights(parseJson(share?.permissions_json, {}));
        if (!share || rights[capability] !== true) {
            throw new Error(share ? `share_${capability}_denied` : 'share_owner_required');
        }
        const stream = await this.ownedStream(share.owner_id, atomeId);
        return { ownerId: String(share.owner_id), stream, rights, share };
    }

    async request(granterId, message) {
        const principalId = await this.targetId(message);
        if (!principalId || !await this.isProvisioned(principalId)) throw new Error('target_not_provisioned');
        if (String(principalId) === String(granterId)) throw new Error('share_target_is_self');
        const ids = Array.isArray(message.atome_ids)
            ? message.atome_ids.map(String).filter(Boolean)
            : [message.atome_id || message.atomeId].filter(Boolean).map(String);
        if (!ids.length) throw new Error('share_atome_required');
        const peerPolicy = await this.policy(principalId, granterId);
        if (peerPolicy?.policy === 'block') throw new Error('blocked');
        const requested = normalizePermissions(message.permissions || message.permission || {});
        const accepted = parseJson(peerPolicy?.permissions_json, null);
        const shareMode = normalizeMode(message.mode || message.share_mode);
        const shareType = normalizeType(message.share_type || message.shareType || message.property_overrides?.__shareType);
        const rows = [];
        for (const atomeId of ids) {
            const authority = await this.grantAuthority(granterId, atomeId);
            if (String(principalId) === authority.ownerId) throw new Error('share_target_is_owner');
            if ((await this.policy(principalId, authority.ownerId))?.policy === 'block') throw new Error('blocked');
            // Jamais plus que ce que l'on tient (D9) — droits, proprietes et duree.
            const granted = attenuateRights(authority.rights, requested);
            const permissions = toStoredPermissions(peerPolicy?.policy === 'always' ? attenuateRights(granted, accepted || {}) : granted);
            const parentReadable = authority.share
                ? (parseJson(authority.share.readable_properties_json, null) ?? parseJson(authority.share.allowed_properties_json, null))
                : null;
            const parentWritable = authority.share
                ? (parseJson(authority.share.writable_properties_json, null) ?? parseJson(authority.share.allowed_properties_json, null))
                : null;
            const readable = attenuatePropertyList(parentReadable, message.readable_properties ?? message.readableProperties ?? null);
            const writable = attenuatePropertyList(parentWritable, message.writable_properties ?? message.writableProperties ?? allowedProperties(message));
            const requestedExpiry = sqlTime(message.expires_at || message.expiresAt || null);
            const parentExpiry = authority.share?.expires_at || null;
            const expiresAt = parentExpiry && (!requestedExpiry || requestedExpiry > parentExpiry) ? parentExpiry : requestedExpiry;
            const initialStatus = peerPolicy?.policy === 'always'
                ? (shareType === 'linked' ? 'active' : 'accepted')
                : (peerPolicy?.policy === 'never' ? 'rejected' : 'pending');
            const shareId = crypto.randomUUID();
            await db.query(
                'run',
                `INSERT INTO sync_share_requests
                 (share_id, owner_id, principal_id, atome_id, stream_id, share_type,
                  share_mode, status, permissions_json, allowed_properties_json,
                  readable_properties_json, writable_properties_json, parent_share_id, expires_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    shareId, authority.ownerId, principalId, atomeId, authority.stream.stream_id, shareType,
                    shareMode, initialStatus, JSON.stringify(permissions), null,
                    readable ? JSON.stringify(readable) : null, writable ? JSON.stringify(writable) : null,
                    authority.share?.share_id || null, expiresAt
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

    // Tous les partages issus de `shareId` (repartages en chaine), sans cycle.
    async descendants(shareId) {
        const result = [];
        const queue = [String(shareId)];
        const seen = new Set(queue);
        while (queue.length) {
            const children = await db.query('all', 'SELECT * FROM sync_share_requests WHERE parent_share_id = ?', [queue.shift()]) || [];
            for (const child of children) {
                if (seen.has(child.share_id)) continue;
                seen.add(child.share_id);
                result.push(child);
                queue.push(child.share_id);
            }
        }
        return result;
    }

    // Qui peut agir sur un partage donne : le proprietaire, celui qui l'a accorde (repartage),
    // ou un detenteur de `manage` sur le meme atome. Renvoie les droits dont il dispose.
    async authorityOver(actorId, row) {
        const actor = String(actorId);
        if (actor === String(row.owner_id)) return OWNER_RIGHTS;
        if (row.parent_share_id) {
            const parent = await this.get(row.parent_share_id);
            if (parent && String(parent.principal_id) === actor && ['active', 'accepted'].includes(parent.status)) {
                return normalizeRights(parseJson(parent.permissions_json, {}));
            }
        }
        const held = typeof this.vaultRouter?.shareForAtome === 'function'
            ? await this.vaultRouter.shareForAtome(actor, row.atome_id, row.owner_id)
            : null;
        const rights = normalizeRights(parseJson(held?.permissions_json, {}));
        return held && rights.manage === true && String(held.share_id) !== String(row.share_id) ? rights : null;
    }

    async updateRights(actorId, message) {
        const shareId = String(message.share_id || message.request_id || '').trim();
        const row = await this.get(shareId);
        if (!row || ['revoked', 'rejected', 'expired'].includes(row.status)) throw new Error('share_request_not_found');
        if (String(row.principal_id) === String(actorId)) throw new Error('share_rights_self_denied');
        const authority = await this.authorityOver(actorId, row);
        if (!authority) throw new Error('share_manage_denied');
        const rights = toStoredPermissions(attenuateRights(authority, message.permissions || message.rights || {}));
        const readable = normalizePropertyList(message.readable_properties ?? parseJson(row.readable_properties_json, null));
        const writable = normalizePropertyList(message.writable_properties ?? parseJson(row.writable_properties_json, null));
        await db.query('run',
            `UPDATE sync_share_requests SET permissions_json = ?, readable_properties_json = ?, writable_properties_json = ?,
             updated_at = datetime('now') WHERE share_id = ?`,
            [JSON.stringify(rights), readable ? JSON.stringify(readable) : null, writable ? JSON.stringify(writable) : null, shareId]);
        // Un maillon restreint restreint toute la chaine qui en decoule.
        const limits = new Map([[shareId, rights]]);
        for (const child of await this.descendants(shareId)) {
            const parentRights = limits.get(child.parent_share_id) || rights;
            const childRights = toStoredPermissions(attenuateRights(parentRights, parseJson(child.permissions_json, {})));
            limits.set(child.share_id, childRights);
            await db.query('run', `UPDATE sync_share_requests SET permissions_json = ?, updated_at = datetime('now') WHERE share_id = ?`,
                [JSON.stringify(childRights), child.share_id]);
        }
        const updated = visibleRow(await this.get(shareId));
        this.notifyPrincipal(row.principal_id, { type: 'share-updated', share: updated });
        return { ok: true, request: updated };
    }

    // Partages entre moi et un pair, dans les deux sens (trace « qui a donne quoi a qui »).
    async withPeer(principalId, message) {
        const peer = String(message.peer_user_id || message.peerUserId || message.user_id || '').trim();
        if (!peer) throw new Error('share_peer_required');
        const rows = await db.query('all',
            `SELECT * FROM sync_share_requests
             WHERE ((owner_id = ? AND principal_id = ?) OR (owner_id = ? AND principal_id = ?)
                OR (principal_id = ? AND parent_share_id IN (SELECT share_id FROM sync_share_requests WHERE principal_id = ?)))
               AND status NOT IN ('revoked', 'rejected')
             ORDER BY created_at DESC`,
            [principalId, peer, peer, principalId, peer, principalId]) || [];
        return { ok: true, requests: rows.map(visibleRow) };
    }

    async get(shareId) {
        return db.query('get', 'SELECT * FROM sync_share_requests WHERE share_id = ?', [shareId]);
    }

    async activate(row) {
        if (!row) throw new Error('share_request_not_found');
        if (row.share_type === 'detached') {
            const state = await this.vaultRouter.getState(row.owner_id, row.atome_id);
            if (!state) throw new Error('share_source_state_missing');
            // Une copie figee ne contient que ce que le destinataire a le droit de VOIR.
            const allowed = parseJson(row.readable_properties_json, null) ?? parseJson(row.allowed_properties_json, null);
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
            const streams = typeof this.vaultRouter.listShareStreams === 'function'
                ? await this.vaultRouter.listShareStreams(row.principal_id, row.share_id)
                : [row.stream_id];
            for (const streamId of streams) {
                await this.syncRuntime?.grantStream?.(row.principal_id, streamId);
            }
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
        if (!row) throw new Error('share_revoke_denied');
        // Le destinataire peut toujours renoncer ; sinon il faut une autorite sur ce partage.
        if (String(row.principal_id) !== String(principalId) && !await this.authorityOver(principalId, row)) {
            throw new Error('share_revoke_denied');
        }
        const chain = [row, ...await this.descendants(shareId)];
        for (const link of chain) {
            await db.query('run', "UPDATE sync_share_requests SET status = 'revoked', updated_at = datetime('now') WHERE share_id = ?", [link.share_id]);
            const remaining = await db.query(
                'get',
                `SELECT share_id FROM sync_share_requests WHERE principal_id = ? AND stream_id = ?
                 AND ${activeLinkedShareSql}
                 LIMIT 1`,
                [link.principal_id, link.stream_id]
            );
            if (!remaining) this.syncRuntime?.revokeStream?.(link.principal_id, link.stream_id);
            this.notifyPrincipal(String(link.principal_id) === String(principalId) ? link.owner_id : link.principal_id, {
                type: 'share-revoked', share_id: link.share_id, stream_id: link.stream_id
            });
        }
        return { ok: true, share_id: shareId, revoked: chain.map((link) => link.share_id) };
    }

    async handle(message, principalId) {
        const action = String(message.action || '').toLowerCase();
        if (action === 'request') return this.request(principalId, message);
        // `create` activait un partage sans l'accord du destinataire : il suit desormais le
        // meme chemin que `request` (consentement, sauf policy 'always' deja accordee).
        if (action === 'create') return this.request(principalId, message);
        if (action === 'respond') return this.respond(principalId, message);
        if (action === 'publish') return this.publish(principalId, message);
        if (action === 'policy') return this.setPolicy(
            principalId,
            message.peer_user_id || message.peerUserId,
            message.policy,
            message.permissions
        );
        if (action === 'revoke') return this.revoke(principalId, message);
        if (action === 'update-rights') return this.updateRights(principalId, message);
        if (action === 'with-peer') return this.withPeer(principalId, message);
        if (action === 'inbox' || action === 'shared-with-me') return this.list(principalId, 'inbox');
        if (action === 'my-shares') return this.list(principalId, 'outbox');
        throw new Error(`unsupported_sync_share_action:${action || 'missing'}`);
    }
}

export const createSyncSharingService = (options) => new SyncSharingService(options);
