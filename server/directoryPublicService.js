import crypto from 'node:crypto';
import db from '../database/adole.js';

const parse = (value) => {
    if (value == null) return null;
    try { return JSON.parse(value); } catch (_) { return value; }
};

export class DirectoryPublicService {
    constructor(options = {}) {
        this.syncRuntime = options.syncRuntime || null;
    }

    async sourceProfile(principalId) {
        const row = await db.query(
            'get',
            `SELECT a.atome_id,
                    MAX(CASE WHEN p.particle_key = 'username' THEN p.particle_value END) AS username,
                    MAX(CASE WHEN p.particle_key = 'visibility' THEN p.particle_value END) AS visibility
             FROM atomes a LEFT JOIN particles p ON p.atome_id = a.atome_id
             WHERE a.atome_id = ? AND a.atome_type = 'user' AND a.deleted_at IS NULL
             GROUP BY a.atome_id`,
            [principalId]
        );
        if (!row) return null;
        return {
            principal_id: String(row.atome_id),
            display_name: String(parse(row.username) || '').trim(),
            public: parse(row.visibility) === 'public'
        };
    }

    async rebuild() {
        const rows = await db.query(
            'all',
            `SELECT a.atome_id,
                    MAX(CASE WHEN p.particle_key = 'username' THEN p.particle_value END) AS username,
                    MAX(CASE WHEN p.particle_key = 'visibility' THEN p.particle_value END) AS visibility
             FROM atomes a LEFT JOIN particles p ON p.atome_id = a.atome_id
             WHERE a.atome_type = 'user' AND a.deleted_at IS NULL GROUP BY a.atome_id`
        );
        await db.query('run', 'DELETE FROM directory_public_profiles');
        for (const row of rows || []) {
            const name = String(parse(row.username) || '').trim();
            if (parse(row.visibility) !== 'public' || !name) continue;
            const revision = Number((await db.query(
                'get',
                'SELECT COALESCE(MAX(revision), 0) AS revision FROM directory_public_events WHERE principal_id = ?',
                [row.atome_id]
            ))?.revision || 0);
            await db.query(
                'run',
                `INSERT INTO directory_public_profiles (principal_id, display_name, revision)
                 VALUES (?, ?, ?)`,
                [row.atome_id, name, revision]
            );
        }
        return { profiles: (await this.list({ limit: 500 })).length };
    }

    async record(principalId, action) {
        const previous = await db.query(
            'get',
            'SELECT COALESCE(MAX(revision), 0) AS revision FROM directory_public_events WHERE principal_id = ?',
            [principalId]
        );
        const revision = Number(previous?.revision || 0) + 1;
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
        if (profile?.public && profile.display_name) {
            const previous = await db.query(
                'get',
                'SELECT revision FROM directory_public_profiles WHERE principal_id = ?',
                [principalId]
            );
            const revision = Number(previous?.revision || 0) + 1;
            await db.query(
                'run',
                `INSERT INTO directory_public_profiles (principal_id, display_name, revision)
                 VALUES (?, ?, ?)
                 ON CONFLICT(principal_id) DO UPDATE SET display_name = excluded.display_name,
                 revision = excluded.revision, updated_at = datetime('now')`,
                [principalId, profile.display_name, revision]
            );
            return this.record(principalId, 'upsert');
        }
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
                `SELECT principal_id, display_name, revision, updated_at
                 FROM directory_public_profiles WHERE lower(display_name) LIKE ?
                 ORDER BY lower(display_name), principal_id LIMIT ? OFFSET ?`,
                [`%${query}%`, limit, offset]
            )
            : await db.query(
                'all',
                `SELECT principal_id, display_name, revision, updated_at
                 FROM directory_public_profiles ORDER BY lower(display_name), principal_id LIMIT ? OFFSET ?`,
                [limit, offset]
            );
        return rows || [];
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
