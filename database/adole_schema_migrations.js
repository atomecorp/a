import { normalizePermissionConditions } from '../atome/src/squirrel/conditions/permission_adapter.js';
import { ensurePrincipalIdentityTables } from './adole_principal_identity_schema.js';
import { ensurePublicEventTables } from './adole_public_events_schema.js';
import { ensureShopTables } from './adole_shop_schema.js';
import { ensureCoachTables } from './adole_coach_schema.js';
import { ensureScheduledSendTables } from './adole_scheduled_sends_schema.js';
import { ensureSiteTables } from './adole_site_schema.js';

async function ensureColumn({ query, table, column, ddl }) {
    const columns = await query('all', `PRAGMA table_info(${table})`);
    // Fresh databases receive the complete table from schema.sql.
    if (!columns?.length) return;
    const names = new Set((columns || []).map((col) => col.name));
    if (!names.has(column)) await query('run', ddl);
}

async function ensurePermissionsColumns(query) {
    await ensureColumn({
        query,
        table: 'permissions',
        column: 'can_create',
        ddl: "ALTER TABLE permissions ADD COLUMN can_create INTEGER NOT NULL DEFAULT 0"
    });
    await ensureColumn({
        query,
        table: 'permissions',
        column: 'share_mode',
        ddl: "ALTER TABLE permissions ADD COLUMN share_mode TEXT DEFAULT 'real-time'"
    });
    await ensureColumn({
        query,
        table: 'permissions',
        column: 'conditions',
        ddl: "ALTER TABLE permissions ADD COLUMN conditions TEXT"
    });
}

async function migratePermissionConditions(query) {
    const rows = await query('all', 'SELECT permission_id, conditions FROM permissions WHERE conditions IS NOT NULL');
    for (const row of rows || []) {
        let migrated;
        try {
            migrated = normalizePermissionConditions(row.conditions);
        } catch {
            migrated = { schemaVersion: 1, invalid: true, reason: 'legacy_condition_unmigratable' };
        }
        const serialized = JSON.stringify(migrated);
        if (serialized !== row.conditions) {
            await query('run', 'UPDATE permissions SET conditions = ? WHERE permission_id = ?', [serialized, row.permission_id]);
        }
    }
}

async function ensureSnapshotColumns(query) {
    await ensureColumn({ query, table: 'snapshots', column: 'project_id', ddl: "ALTER TABLE snapshots ADD COLUMN project_id TEXT" });
    await ensureColumn({ query, table: 'snapshots', column: 'state_blob', ddl: "ALTER TABLE snapshots ADD COLUMN state_blob TEXT" });
    await ensureColumn({ query, table: 'snapshots', column: 'label', ddl: "ALTER TABLE snapshots ADD COLUMN label TEXT" });
    await ensureColumn({ query, table: 'snapshots', column: 'actor', ddl: "ALTER TABLE snapshots ADD COLUMN actor TEXT" });
}

async function ensureEventColumns(query) {
    await ensureColumn({ query, table: 'events', column: 'project_id', ddl: "ALTER TABLE events ADD COLUMN project_id TEXT" });
    await ensureColumn({ query, table: 'events', column: 'actor', ddl: "ALTER TABLE events ADD COLUMN actor TEXT" });
    await ensureColumn({ query, table: 'events', column: 'tx_id', ddl: "ALTER TABLE events ADD COLUMN tx_id TEXT" });
    await ensureColumn({ query, table: 'events', column: 'gesture_id', ddl: "ALTER TABLE events ADD COLUMN gesture_id TEXT" });
    await ensureColumn({ query, table: 'events', column: 'stream_id', ddl: "ALTER TABLE events ADD COLUMN stream_id TEXT" });
    await ensureColumn({ query, table: 'events', column: 'sequence', ddl: "ALTER TABLE events ADD COLUMN sequence INTEGER" });
    await ensureColumn({ query, table: 'events', column: 'source', ddl: "ALTER TABLE events ADD COLUMN source TEXT" });
    await ensureColumn({ query, table: 'events', column: 'lww_decisions', ddl: "ALTER TABLE events ADD COLUMN lww_decisions TEXT" });
    await ensureColumn({ query, table: 'events', column: 'projection', ddl: "ALTER TABLE events ADD COLUMN projection TEXT" });
    await ensureColumn({ query, table: 'particles_versions', column: 'event_id', ddl: "ALTER TABLE particles_versions ADD COLUMN event_id TEXT" });
}

async function ensureSyncEventTables(query) {
    await query('run', `CREATE TABLE IF NOT EXISTS sync_streams (
        stream_id TEXT PRIMARY KEY,
        scope_key TEXT NOT NULL UNIQUE,
        project_id TEXT,
        atome_id TEXT,
        owner_id TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);
    await query('run', `CREATE TABLE IF NOT EXISTS sync_stream_sequences (
        stream_id TEXT PRIMARY KEY,
        last_sequence INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY(stream_id) REFERENCES sync_streams(stream_id) ON DELETE CASCADE
    )`);
    await query('run', `CREATE TABLE IF NOT EXISTS event_property_winners (
        atome_id TEXT NOT NULL,
        particle_key TEXT NOT NULL,
        event_id TEXT NOT NULL,
        event_ts TEXT,
        timestamp_valid INTEGER NOT NULL DEFAULT 0,
        sequence INTEGER NOT NULL,
        decision TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY(atome_id, particle_key),
        FOREIGN KEY(event_id) REFERENCES events(id) ON DELETE RESTRICT
    )`);
    await query('run', `CREATE TABLE IF NOT EXISTS manual_share_cursors (
        share_id TEXT NOT NULL,
        stream_id TEXT NOT NULL,
        published_sequence INTEGER NOT NULL DEFAULT 0,
        acknowledged_sequence INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY(share_id, stream_id),
        FOREIGN KEY(stream_id) REFERENCES sync_streams(stream_id) ON DELETE CASCADE
    )`);
    await query('run', `CREATE TABLE IF NOT EXISTS vault_principal_registry (
        principal_id TEXT PRIMARY KEY,
        provider TEXT NOT NULL,
        vault_key TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL DEFAULT 'active',
        provisioned_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        CHECK(provider IN ('process', 'freebsd-jail')),
        CHECK(status IN ('active', 'stopped', 'failed'))
    )`);
    await query('run', `CREATE TABLE IF NOT EXISTS vault_object_registry (
        atome_id TEXT PRIMARY KEY,
        vault_principal_id TEXT NOT NULL,
        registered_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY(vault_principal_id) REFERENCES vault_principal_registry(principal_id) ON DELETE RESTRICT
    )`);
    await query('run', `CREATE TABLE IF NOT EXISTS vault_stream_registry (
        stream_id TEXT PRIMARY KEY,
        vault_principal_id TEXT NOT NULL,
        project_id TEXT,
        atome_id TEXT,
        registered_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY(vault_principal_id) REFERENCES vault_principal_registry(principal_id) ON DELETE RESTRICT
    )`);
    await query('run', 'CREATE INDEX IF NOT EXISTS idx_vault_stream_principal ON vault_stream_registry(vault_principal_id)');
    await query('run', `CREATE TABLE IF NOT EXISTS sync_share_requests (
        share_id TEXT PRIMARY KEY,
        owner_id TEXT NOT NULL,
        principal_id TEXT NOT NULL,
        atome_id TEXT NOT NULL,
        stream_id TEXT NOT NULL,
        share_type TEXT NOT NULL,
        share_mode TEXT NOT NULL,
        status TEXT NOT NULL,
        permissions_json TEXT NOT NULL,
        allowed_properties_json TEXT,
        publication_cursor INTEGER NOT NULL DEFAULT 0,
        detached_atome_id TEXT,
        expires_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        CHECK(share_type IN ('linked', 'detached')),
        CHECK(share_mode IN ('real-time', 'manual')),
        CHECK(status IN ('pending', 'active', 'accepted', 'rejected', 'revoked', 'expired'))
    )`);
    // Modele de droits D8–D10 : chaine de repartage et listes de proprietes lisibles /
    // ecrivables distinctes (`allowed_properties_json` reste lu en repli, pour l'existant).
    for (const [column, ddl] of [
        ['parent_share_id', 'ALTER TABLE sync_share_requests ADD COLUMN parent_share_id TEXT'],
        ['readable_properties_json', 'ALTER TABLE sync_share_requests ADD COLUMN readable_properties_json TEXT'],
        ['writable_properties_json', 'ALTER TABLE sync_share_requests ADD COLUMN writable_properties_json TEXT']
    ]) await ensureColumn({ query, table: 'sync_share_requests', column, ddl });
    await query('run', 'CREATE INDEX IF NOT EXISTS idx_sync_share_recipient ON sync_share_requests(principal_id, status)');
    await query('run', 'CREATE INDEX IF NOT EXISTS idx_sync_share_parent ON sync_share_requests(parent_share_id)');
    await query('run', 'CREATE INDEX IF NOT EXISTS idx_sync_share_stream ON sync_share_requests(stream_id, principal_id, status)');
    await query('run', `CREATE TABLE IF NOT EXISTS sync_share_policies (
        owner_id TEXT NOT NULL,
        peer_id TEXT NOT NULL,
        policy TEXT NOT NULL,
        permissions_json TEXT,
        revoked_at TEXT,
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY(owner_id, peer_id),
        CHECK(policy IN ('one-shot', 'always', 'never', 'block'))
    )`);
    await query('run', `CREATE TABLE IF NOT EXISTS directory_public_profiles (
        principal_id TEXT PRIMARY KEY,
        display_name TEXT NOT NULL,
        user_face TEXT,
        card_json TEXT,
        revision INTEGER NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);
    await ensureColumn({
        query,
        table: 'directory_public_profiles',
        column: 'user_face',
        ddl: 'ALTER TABLE directory_public_profiles ADD COLUMN user_face TEXT'
    });
    await ensureColumn({
        query,
        table: 'directory_public_profiles',
        column: 'card_json',
        ddl: 'ALTER TABLE directory_public_profiles ADD COLUMN card_json TEXT'
    });
    await query('run', `CREATE TABLE IF NOT EXISTS directory_public_events (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT,
        event_id TEXT NOT NULL UNIQUE,
        principal_id TEXT NOT NULL,
        action TEXT NOT NULL,
        revision INTEGER NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        CHECK(action IN ('upsert', 'revoke', 'delete'))
    )`);
}

const legacyScopeKey = (row) => row.project_id
    ? `project:${row.project_id}`
    : (row.atome_id ? `atome:${row.atome_id}` : 'global');

async function backfillEventSequences(query) {
    const rows = await query(
        'all',
        `SELECT id, ts, atome_id, project_id, actor FROM events
         WHERE stream_id IS NULL OR sequence IS NULL
         ORDER BY ts ASC, id ASC`
    );
    const streamByScope = new Map();
    for (const row of rows || []) {
        const scopeKey = legacyScopeKey(row);
        let streamId = streamByScope.get(scopeKey);
        if (!streamId) {
            const existing = await query('get', 'SELECT stream_id FROM sync_streams WHERE scope_key = ?', [scopeKey]);
            streamId = existing?.stream_id || `legacy:${scopeKey}`;
            await query(
                'run',
                `INSERT OR IGNORE INTO sync_streams (stream_id, scope_key, project_id, atome_id)
                 VALUES (?, ?, ?, ?)`,
                [streamId, scopeKey, row.project_id || null, row.project_id ? null : row.atome_id || null]
            );
            streamByScope.set(scopeKey, streamId);
        }
        const counter = await query('get', 'SELECT last_sequence FROM sync_stream_sequences WHERE stream_id = ?', [streamId]);
        const sequence = Number(counter?.last_sequence || 0) + 1;
        await query(
            'run',
            `INSERT INTO sync_stream_sequences (stream_id, last_sequence) VALUES (?, ?)
             ON CONFLICT(stream_id) DO UPDATE SET last_sequence = excluded.last_sequence`,
            [streamId, sequence]
        );
        await query('run', 'UPDATE events SET stream_id = ?, sequence = ? WHERE id = ?', [streamId, sequence, row.id]);
    }
    await query('run', 'CREATE UNIQUE INDEX IF NOT EXISTS idx_events_stream_sequence ON events(stream_id, sequence)');
}

async function ensureStateCurrentColumns(query) {
    const columns = await query('all', "PRAGMA table_info(state_current)");
    if (!columns?.length) return;
    const names = new Set((columns || []).map((col) => col.name));
    if (names.has('owner_id')) return;
    await query('run', "ALTER TABLE state_current ADD COLUMN owner_id TEXT");
    await query(
        'run',
        "UPDATE state_current SET owner_id = (SELECT owner_id FROM atomes WHERE atomes.atome_id = state_current.atome_id) WHERE owner_id IS NULL"
    );
}

async function refreshUsersView(query) {
    // DROP then CREATE used to run as two awaited statements outside any
    // transaction: between them `users_view` -- the view every auth lookup goes
    // through -- simply did not exist. SQLite DDL is transactional, so both
    // statements are now applied atomically in a single exec.
    await query('exec', `BEGIN;
        DROP VIEW IF EXISTS users_view;
        CREATE VIEW users_view AS
        SELECT a.atome_id AS user_id,
            MAX(CASE WHEN p.particle_key = 'username' THEN JSON_EXTRACT(p.particle_value, '$') END) AS username,
            MAX(CASE WHEN p.particle_key = 'password_hash' THEN JSON_EXTRACT(p.particle_value, '$') END) AS password_hash,
            a.created_at, a.updated_at, a.last_sync, a.created_source
        FROM atomes a LEFT JOIN particles p ON a.atome_id = p.atome_id
        WHERE a.atome_type = 'user' AND a.deleted_at IS NULL
        GROUP BY a.atome_id;
    COMMIT;`);
}
// Device keys gained a role, an assurance and a device grouping (authentication
// V1). Existing keys are silent session keys of a personal device.
async function ensureAuthDeviceKeyColumns(query) {
    for (const [column, ddl] of [
        ['key_role', "ALTER TABLE auth_device_keys ADD COLUMN key_role TEXT NOT NULL DEFAULT 'session'"],
        ['device_id', 'ALTER TABLE auth_device_keys ADD COLUMN device_id TEXT'],
        ['assurance', "ALTER TABLE auth_device_keys ADD COLUMN assurance TEXT NOT NULL DEFAULT 'software'"],
        ['device_class', "ALTER TABLE auth_device_keys ADD COLUMN device_class TEXT NOT NULL DEFAULT 'personal'"],
        ['platform', 'ALTER TABLE auth_device_keys ADD COLUMN platform TEXT'],
        ['label', 'ALTER TABLE auth_device_keys ADD COLUMN label TEXT'],
        ['enrolled_by', 'ALTER TABLE auth_device_keys ADD COLUMN enrolled_by TEXT'],
        ['credential_id', 'ALTER TABLE auth_device_keys ADD COLUMN credential_id TEXT'],
        ['sign_count', 'ALTER TABLE auth_device_keys ADD COLUMN sign_count INTEGER NOT NULL DEFAULT 0'],
        ['last_seen_ms', 'ALTER TABLE auth_device_keys ADD COLUMN last_seen_ms INTEGER'],
        ['connection_proof', 'ALTER TABLE auth_device_keys ADD COLUMN connection_proof INTEGER NOT NULL DEFAULT 0']
    ]) await ensureColumn({ query, table: 'auth_device_keys', column, ddl });
}

async function prepareAdoleSchemaColumns(query) {
    await ensureAuthDeviceKeyColumns(query);
    // A recovery code names its account by itself (codes created before keep their handle path).
    await ensureColumn({ query, table: 'auth_recovery_codes', column: 'lookup', ddl: 'ALTER TABLE auth_recovery_codes ADD COLUMN lookup TEXT' });
    // The account's backup keys travel wrapped with the recovery code and sealed through pairing.
    await ensureColumn({ query, table: 'auth_recovery_codes', column: 'backup_keys', ddl: 'ALTER TABLE auth_recovery_codes ADD COLUMN backup_keys TEXT' });
    for (const column of ['requester_backup_key', 'backup_keys']) {
        await ensureColumn({ query, table: 'auth_pair_requests', column, ddl: `ALTER TABLE auth_pair_requests ADD COLUMN ${column} TEXT` });
    }
    await ensurePermissionsColumns(query);
    await ensureSnapshotColumns(query);
    await ensureEventColumns(query);
    await ensureStateCurrentColumns(query);
    // VideoTrain (server/news_thread.js): a publication's thread, origin, parent, anchor and withdrawal.
    for (const [column, type] of [['thread_ref', 'TEXT'], ['root_id', 'TEXT'], ['parent_id', 'TEXT'], ['anchor_ms', 'INTEGER'], ['retired_at', 'TEXT'],
        ['replies_closed_at', 'TEXT']]) {
        await ensureColumn({ query, table: 'news_publications', column, ddl: `ALTER TABLE news_publications ADD COLUMN ${column} ${type}` });
    }
    // A report kept by the thread's owner (« Garder »).
    await ensureColumn({ query, table: 'news_reports', column: 'dismissed_at', ddl: 'ALTER TABLE news_reports ADD COLUMN dismissed_at TEXT' });
}

async function ensureCommunicationTables(query) {
    await query('run', `CREATE TABLE IF NOT EXISTS communication_preferences (
        user_id TEXT PRIMARY KEY,
        accept_unknown INTEGER NOT NULL DEFAULT 1,
        address_book_json TEXT NOT NULL DEFAULT '[]',
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);
    await query('run', `CREATE TABLE IF NOT EXISTS communication_contacts (
        owner_id TEXT NOT NULL,
        peer_id TEXT NOT NULL,
        status TEXT NOT NULL,
        requested_by TEXT,
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY(owner_id, peer_id),
        CHECK(status IN ('pending', 'accepted', 'refused'))
    )`);
    await query('run', `CREATE TABLE IF NOT EXISTS communication_contact_requests (
        request_id TEXT PRIMARY KEY,
        sender_id TEXT NOT NULL,
        target_id TEXT,
        note TEXT,
        created_ms INTEGER NOT NULL,
        resolved_ms INTEGER
    )`);
    await query('run', 'CREATE INDEX IF NOT EXISTS idx_communication_contact_requests_sender ON communication_contact_requests(sender_id, created_ms)');
    await query('run', `CREATE TABLE IF NOT EXISTS news_publications (
        news_id TEXT PRIMARY KEY,
        author_id TEXT NOT NULL,
        project_id TEXT,
        title TEXT,
        summary TEXT,
        tags_json TEXT NOT NULL DEFAULT '[]',
        audience_json TEXT NOT NULL DEFAULT '"all"',
        payload_json TEXT,
        media_json TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);
    await query('run', `CREATE TABLE IF NOT EXISTS news_subscriptions (
        user_id TEXT PRIMARY KEY,
        tags_json TEXT NOT NULL DEFAULT '[]',
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);
    await query('run', `CREATE TABLE IF NOT EXISTS news_tags (
        slug TEXT PRIMARY KEY,
        label TEXT NOT NULL,
        origin TEXT NOT NULL DEFAULT 'user',
        use_count INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);
    await query('run', 'CREATE INDEX IF NOT EXISTS idx_news_publications_author ON news_publications(author_id)');
    // VideoTrain (server/news_thread.js): votes and reports (its columns: prepareAdoleSchemaColumns).
    await query('run', 'CREATE INDEX IF NOT EXISTS idx_news_publications_thread ON news_publications(thread_ref, root_id)');
    await query('run', `CREATE TABLE IF NOT EXISTS news_votes (
        news_id TEXT NOT NULL,
        voter_id TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY(news_id, voter_id)
    )`);
    await query('run', `CREATE TABLE IF NOT EXISTS news_reports (
        news_id TEXT NOT NULL,
        reporter_id TEXT NOT NULL,
        reason TEXT,
        dismissed_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY(news_id, reporter_id)
    )`);
    await query('run', `CREATE TABLE IF NOT EXISTS communities (
        community_id TEXT PRIMARY KEY,
        host_id TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);
    await query('run', `CREATE TABLE IF NOT EXISTS community_members (
        community_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        status TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY(community_id, user_id),
        CHECK(status IN ('member', 'refused', 'banned'))
    )`);
    // Forums (server/forums.js): their people (invited, then member once they accept) and the e-mail invitations.
    await query('run', `CREATE TABLE IF NOT EXISTS forums (
        forum_id TEXT PRIMARY KEY,
        owner_id TEXT NOT NULL,
        name TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);
    await query('run', `CREATE TABLE IF NOT EXISTS forum_members (
        forum_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        status TEXT NOT NULL,
        invited_by TEXT,
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY(forum_id, user_id),
        CHECK(status IN ('invited', 'member'))
    )`);
    await query('run', `CREATE TABLE IF NOT EXISTS forum_guests (
        token TEXT PRIMARY KEY,
        forum_id TEXT NOT NULL,
        name TEXT,
        invited_by TEXT NOT NULL,
        claimed_by TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);
    // Visio planifiee (invitation au calendrier) : la salle survit au redemarrage du serveur.
    await query('run', `CREATE TABLE IF NOT EXISTS visio_rooms (
        room_id TEXT PRIMARY KEY,
        owner_id TEXT NOT NULL,
        title TEXT,
        starts_at TEXT,
        ends_at TEXT,
        invitees_json TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);
}

async function runAdoleSchemaMigrations(query) {
    await prepareAdoleSchemaColumns(query);
    await migratePermissionConditions(query);
    await ensureSyncEventTables(query);
    await ensureCommunicationTables(query);
    await backfillEventSequences(query);
    await ensurePrincipalIdentityTables(query);
    await ensurePublicEventTables(query);
    await ensureShopTables(query);
    await ensureCoachTables(query);
    await ensureScheduledSendTables(query);
    await ensureSiteTables(query);
    await refreshUsersView(query);
}

export { prepareAdoleSchemaColumns, runAdoleSchemaMigrations, ensureColumn };
