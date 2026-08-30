import crypto from 'node:crypto';
import db from '../database/adole.js';
import { normalizePhone } from './auth_crypto.js';

const parse = (value) => {
    if (value == null) return null;
    try { return JSON.parse(value); } catch (_) { return value; }
};

const text = (value) => String(value == null ? '' : value).trim();
const profileValue = (profile, ...keys) => {
    for (const key of keys) {
        const value = text(profile?.[key]);
        if (value) return value;
    }
    return '';
};
const rowValue = (row, profile, key, ...aliases) => (
    profileValue(profile, key, ...aliases)
    || text(parse(row?.[key]))
    || aliases.map((alias) => text(parse(row?.[alias]))).find(Boolean)
    || ''
);
const publicProfile = (row, profile) => {
    const candidates = [profile?.access, profile?.visibility, row?.access, row?.visibility];
    const selected = candidates.find((value) => value !== null && value !== undefined && text(parse(value)) !== '');
    return text(parse(selected)).toLowerCase() === 'public';
};
const displayName = (row, profile) => {
    const values = {
        name: rowValue(row, profile, 'name', 'last_name', 'lastname'),
        firstname: rowValue(row, profile, 'first_name', 'firstname', 'firstName'),
        nickname: rowValue(row, profile, 'nickname', 'pseudonym', 'pseudo')
    };
    const selected = ['name', 'firstname', 'nickname'].includes(text(profile?.display_name_source))
        ? text(profile.display_name_source)
        : 'name';
    return [selected, 'name', 'firstname', 'nickname']
        .filter((key, index, keys) => keys.indexOf(key) === index)
        .map((key) => values[key])
        .find(Boolean) || '';
};
const isBootstrapPhoneIdentity = (row, profile) => {
    if (profileValue(profile, 'name', 'first_name', 'firstname', 'nickname')) return false;
    const name = text(parse(row?.name));
    const username = text(parse(row?.username));
    const phone = normalizePhone(parse(row?.phone));
    return !!phone && normalizePhone(name) === phone && normalizePhone(username) === phone;
};

const PROFILE_SELECT = `SELECT a.atome_id,
        MAX(CASE WHEN p.particle_key = 'visibility' THEN p.particle_value END) AS visibility,
        MAX(CASE WHEN p.particle_key = 'access' THEN p.particle_value END) AS access,
        MAX(CASE WHEN p.particle_key = 'name' THEN p.particle_value END) AS name,
        MAX(CASE WHEN p.particle_key = 'username' THEN p.particle_value END) AS username,
        MAX(CASE WHEN p.particle_key = 'phone' THEN p.particle_value END) AS phone,
        MAX(CASE WHEN p.particle_key IN ('first_name', 'firstname', 'firstName') THEN p.particle_value END) AS first_name,
        MAX(CASE WHEN p.particle_key = 'nickname' THEN p.particle_value END) AS nickname,
        MAX(CASE WHEN p.particle_key = 'user_face' THEN p.particle_value END) AS user_face,
        MAX(CASE WHEN p.particle_key = 'eve_profile' THEN p.particle_value END) AS eve_profile
    FROM atomes a LEFT JOIN particles p ON p.atome_id = a.atome_id`;

const projectProfile = (row) => {
    if (!row) return null;
    const profile = parse(row.eve_profile);
    const canonicalProfile = profile && typeof profile === 'object' && !Array.isArray(profile) ? profile : {};
    return {
        principal_id: String(row.atome_id),
        display_name: isBootstrapPhoneIdentity(row, canonicalProfile) ? '' : displayName(row, canonicalProfile),
        user_face: rowValue(row, canonicalProfile, 'user_face'),
        public: publicProfile(row, canonicalProfile)
    };
};

const runBounded = async (items, worker, concurrency = 8) => {
    const entries = Array.isArray(items) ? items : [];
    let cursor = 0;
    const run = async () => {
        while (cursor < entries.length) {
            const index = cursor;
            cursor += 1;
            await worker(entries[index]);
        }
    };
    await Promise.all(Array.from(
        { length: Math.min(Math.max(1, concurrency), entries.length) },
        () => run()
    ));
};

export class DirectoryPublicService {
    constructor(options = {}) {
        this.syncRuntime = options.syncRuntime || null;
        this.vaultRouter = options.vaultRouter || null;
    }

    async sourceProfile(principalId) {
        const authRow = await db.query(
            'get',
            `${PROFILE_SELECT}
             WHERE a.atome_id = ? AND a.atome_type = 'user' AND a.deleted_at IS NULL
             GROUP BY a.atome_id`,
            [principalId]
        );
        let vaultState = null;
        if (this.vaultRouter?.getState) {
            try {
                vaultState = await this.vaultRouter.getState(principalId, principalId);
            } catch (_) {
                vaultState = null;
            }
        }
        const properties = vaultState?.properties && typeof vaultState.properties === 'object'
            ? vaultState.properties
            : {};
        const row = (authRow || Object.keys(properties).length) ? {
            ...(authRow || {}),
            ...properties,
            atome_id: String(principalId),
            eve_profile: Object.prototype.hasOwnProperty.call(properties, 'eve_profile')
                ? properties.eve_profile
                : authRow?.eve_profile
        } : null;
        return projectProfile(row);
    }

    async rebuild() {
        const rows = await db.query(
            'all',
            `${PROFILE_SELECT}
             WHERE a.atome_type = 'user' AND a.deleted_at IS NULL GROUP BY a.atome_id`
        );
        const activeIds = new Set((rows || []).map((row) => String(row.atome_id)));
        await runBounded(rows, (row) => this.refreshPrincipal(row.atome_id));
        const projected = await db.query('all', 'SELECT principal_id FROM directory_public_profiles');
        const stale = (projected || []).filter((row) => !activeIds.has(String(row.principal_id)));
        await runBounded(stale, (row) => this.refreshPrincipal(row.principal_id, { deleted: true }));
        return { profiles: (await this.list({ limit: 500 })).length };
    }

    async record(principalId, action, requestedRevision = null) {
        const previous = requestedRevision == null ? await db.query(
            'get',
            'SELECT COALESCE(MAX(revision), 0) AS revision FROM directory_public_events WHERE principal_id = ?',
            [principalId]
        ) : null;
        const revision = requestedRevision == null
            ? Number(previous?.revision || 0) + 1
            : Number(requestedRevision);
        const event = {
            id: crypto.randomUUID(),
            stream_id: 'directory.public',
            kind: 'directory.invalidate',
            source: 'directory-service',
            payload: { principal_id: String(principalId), action, revision },
            ts: new Date().toISOString(),
            sequence: 0
        };
        const inserted = await db.query(
            'run',
            `INSERT INTO directory_public_events
             (event_id, principal_id, action, revision) VALUES (?, ?, ?, ?)`,
            [event.id, principalId, action, revision]
        );
        event.sequence = Number(inserted?.lastInsertRowid || inserted?.lastInsertRowid === 0
            ? inserted.lastInsertRowid
            : (await db.query('get', 'SELECT sequence FROM directory_public_events WHERE event_id = ?', [event.id])).sequence);
        await this.syncRuntime?.publishDirectory?.(event);
        return event;
    }

    async refreshPrincipal(principalId, options = {}) {
        const profile = options.deleted === true ? null : await this.sourceProfile(principalId);
        const previous = await db.query(
            'get',
            'SELECT display_name, user_face, revision FROM directory_public_profiles WHERE principal_id = ?',
            [principalId]
        );
        if (profile?.public && profile.display_name) {
            const nextPhoto = profile.user_face || null;
            if (previous
                && text(previous.display_name) === profile.display_name
                && text(previous.user_face) === text(nextPhoto)) {
                return { unchanged: true, principal_id: String(principalId) };
            }
            const eventRevision = Number((await db.query(
                'get',
                'SELECT COALESCE(MAX(revision), 0) AS revision FROM directory_public_events WHERE principal_id = ?',
                [principalId]
            ))?.revision || 0) + 1;
            await db.query(
                'run',
                `INSERT INTO directory_public_profiles (principal_id, display_name, user_face, revision)
                 VALUES (?, ?, ?, ?)
                 ON CONFLICT(principal_id) DO UPDATE SET display_name = excluded.display_name,
                 user_face = excluded.user_face, revision = excluded.revision, updated_at = datetime('now')`,
                [principalId, profile.display_name, nextPhoto, eventRevision]
            );
            return this.record(principalId, 'upsert', eventRevision);
        }
        if (!previous) return { unchanged: true, principal_id: String(principalId) };
        await db.query('run', 'DELETE FROM directory_public_profiles WHERE principal_id = ?', [principalId]);
        return this.record(principalId, options.deleted === true ? 'delete' : 'revoke');
    }

    async list(options = {}) {
        const query = String(options.query || options.search || '').trim().toLowerCase();
        const limit = Math.max(1, Math.min(Number(options.limit) || 100, 500));
        const offset = Math.max(0, Number(options.offset) || 0);
        const rows = query
            ? await db.query(
                'all',
                `SELECT principal_id, display_name, user_face, revision, updated_at
                 FROM directory_public_profiles WHERE lower(display_name) LIKE ?
                 ORDER BY lower(display_name), principal_id LIMIT ? OFFSET ?`,
                [`%${query}%`, limit, offset]
            )
            : await db.query(
                'all',
                `SELECT principal_id, display_name, user_face, revision, updated_at
                 FROM directory_public_profiles ORDER BY lower(display_name), principal_id LIMIT ? OFFSET ?`,
                [limit, offset]
            );
        const requesterId = text(options.requesterId || options.requester_id);
        return Promise.all((rows || []).filter((row) => (
            text(row.display_name) && (!requesterId || text(row.principal_id) !== requesterId)
        )).map(async (row) => {
            const visiblePhoto = row.user_face && requesterId
                ? await db.allowsPropertyRead(row.principal_id, 'user_face', requesterId, 'directory')
                : false;
            return {
                principal_id: row.principal_id,
                display_name: text(row.display_name),
                user_face: visiblePhoto ? text(row.user_face) : null,
                revision: Number(row.revision || 0),
                updated_at: row.updated_at
            };
        }));
    }

    async listEvents(cursor = 0, limit = 500) {
        const rows = await db.query(
            'all',
            `SELECT sequence, event_id, principal_id, action, revision, created_at
             FROM directory_public_events WHERE sequence > ? ORDER BY sequence ASC LIMIT ?`,
            [Math.max(0, Number(cursor) || 0), Math.max(1, Math.min(Number(limit) || 500, 1000))]
        );
        return (rows || []).map((row) => ({
            id: row.event_id,
            stream_id: 'directory.public',
            sequence: Number(row.sequence),
            source: 'directory-service',
            kind: 'directory.invalidate',
            payload: { principal_id: row.principal_id, action: row.action, revision: row.revision },
            projection: null,
            lww_decisions: null,
            ts: row.created_at
        }));
    }
}

export const createDirectoryPublicService = (options) => new DirectoryPublicService(options);
