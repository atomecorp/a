// The CB sociale (atome-server src/social/cb/, temp/cb_sociale_2026-11-15/CAHIER_DES_CHARGES.md): its pseudonyms,
// each an opaque handle behind one account in one context (a channel entry, a call, a bottle), and its reports, on a
// person or on a bottle; three distinct ones hide the target and open its case in `moderation_cases`; and its bottles
// (bottles.rs): each bottle, who has seen it, its anonymous reply threads and their messages; the takes of the CB's
// voices (lot L4: metadata, a report's holds, the admins' listening journal). The text the
// Rust chain runs (central_schema/service_tables.rs `CB`), kept here for the reference chain's parity.
// A roles table made before the role `tester` (its CHECK naming `admin` alone) is made again from the account schema,
// its rows kept (central_schema/mod.rs `widen_account_roles`): a tester tries the video bottles under `cb.bottle_video`.
export async function widenAccountRoles(query, authSchema) {
    const [made] = await query('all', "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'auth_account_roles'");
    if (String(made?.sql || '').includes("'tester'")) return;
    await query('exec', 'ALTER TABLE auth_account_roles RENAME TO auth_account_roles_before_tester;');
    await query('exec', authSchema);
    await query('exec', `INSERT INTO auth_account_roles (principal_id, role, granted_ms, granted_by)
         SELECT principal_id, role, granted_ms, granted_by FROM auth_account_roles_before_tester;
         DROP TABLE auth_account_roles_before_tester;`);
}

export async function ensureCbSocialTables(query) {
    await query('run', `CREATE TABLE IF NOT EXISTS cb_handles (
        handle TEXT PRIMARY KEY,
        context TEXT NOT NULL,
        principal_id TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);
    await query('run', 'CREATE INDEX IF NOT EXISTS idx_cb_handles_context ON cb_handles(context)');
    await query('run', 'CREATE INDEX IF NOT EXISTS idx_cb_handles_principal ON cb_handles(principal_id)');
    await query('run', `CREATE TABLE IF NOT EXISTS cb_person_reports (
        target_id TEXT NOT NULL,
        reporter_id TEXT NOT NULL,
        reason TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY(target_id, reporter_id)
    )`);
    await query('run', `CREATE TABLE IF NOT EXISTS cb_bottle_reports (
        target_id TEXT NOT NULL,
        reporter_id TEXT NOT NULL,
        reason TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY(target_id, reporter_id)
    )`);
    await query('run', `CREATE TABLE IF NOT EXISTS cb_bottles (
        bottle_id TEXT PRIMARY KEY,
        sender_id TEXT NOT NULL,
        sender_handle TEXT NOT NULL,
        zone_range TEXT NOT NULL,
        zone_cell TEXT NOT NULL,
        kind TEXT NOT NULL,
        body TEXT NOT NULL DEFAULT '',
        media_file TEXT,
        media_mime TEXT,
        thumb_file TEXT,
        duration_ms INTEGER,
        state TEXT NOT NULL,
        holder_id TEXT,
        reserved_until INTEGER,
        recirculations INTEGER NOT NULL DEFAULT 0,
        created_ms INTEGER NOT NULL,
        expires_ms INTEGER NOT NULL,
        updated_ms INTEGER NOT NULL,
        lang TEXT NOT NULL DEFAULT '',
        no_translate INTEGER NOT NULL DEFAULT 0,
        target_country TEXT
    )`);
    await query('run', 'CREATE INDEX IF NOT EXISTS idx_cb_bottles_sea ON cb_bottles(state, zone_cell)');
    await query('run', 'CREATE INDEX IF NOT EXISTS idx_cb_bottles_sender ON cb_bottles(sender_id, created_ms)');
    await query('run', `CREATE TABLE IF NOT EXISTS cb_bottle_seen (
        bottle_id TEXT NOT NULL,
        principal_id TEXT NOT NULL,
        seen_ms INTEGER NOT NULL,
        PRIMARY KEY(bottle_id, principal_id)
    )`);
    await query('run', 'CREATE INDEX IF NOT EXISTS idx_cb_bottle_seen_principal ON cb_bottle_seen(principal_id, seen_ms)');
    await query('run', `CREATE TABLE IF NOT EXISTS cb_bottle_threads (
        thread_id TEXT PRIMARY KEY,
        bottle_id TEXT NOT NULL,
        replier_id TEXT NOT NULL,
        replier_handle TEXT NOT NULL,
        created_ms INTEGER NOT NULL,
        UNIQUE(bottle_id, replier_id)
    )`);
    await query('run', `CREATE TABLE IF NOT EXISTS cb_bottle_messages (
        message_id TEXT PRIMARY KEY,
        thread_id TEXT NOT NULL,
        from_sender INTEGER NOT NULL,
        body TEXT NOT NULL,
        created_ms INTEGER NOT NULL,
        lang TEXT NOT NULL DEFAULT '',
        no_translate INTEGER NOT NULL DEFAULT 0
    )`);
    await query('run', 'CREATE INDEX IF NOT EXISTS idx_cb_bottle_messages_thread ON cb_bottle_messages(thread_id, created_ms)');
    await query('run', `CREATE TABLE IF NOT EXISTS cb_recordings (
        recording_id TEXT PRIMARY KEY,
        room TEXT NOT NULL,
        room_kind TEXT NOT NULL,
        handle TEXT NOT NULL,
        started_ms INTEGER NOT NULL,
        ended_ms INTEGER NOT NULL,
        duration_ms INTEGER NOT NULL,
        file TEXT NOT NULL,
        bytes INTEGER NOT NULL,
        sealing TEXT NOT NULL DEFAULT 'plain'
    )`);
    await query('run', 'CREATE INDEX IF NOT EXISTS idx_cb_recordings_room ON cb_recordings(room, ended_ms)');
    await query('run', `CREATE TABLE IF NOT EXISTS cb_recording_holds (
        case_id TEXT NOT NULL,
        room TEXT NOT NULL,
        from_ms INTEGER NOT NULL,
        held_ms INTEGER NOT NULL,
        PRIMARY KEY(case_id, room, held_ms)
    )`);
    await query('run', `CREATE TABLE IF NOT EXISTS cb_recording_listens (
        listen_id TEXT PRIMARY KEY,
        case_id TEXT NOT NULL,
        recording_id TEXT,
        admin_id TEXT NOT NULL,
        action TEXT NOT NULL,
        at_ms INTEGER NOT NULL
    )`);
    // The Appel's pairs put in touch (lot L5; central_schema/social_tables.rs `CB_CALL_PAIRS`): a keyed fingerprint of the
    // two accounts, never an account, and the instant, purged past `cb.call_pair_days`.
    await query('run', `CREATE TABLE IF NOT EXISTS cb_call_pairs (
        pair_hash TEXT PRIMARY KEY,
        met_ms INTEGER NOT NULL
    )`);
    await query('run', 'CREATE INDEX IF NOT EXISTS idx_cb_call_pairs_met ON cb_call_pairs(met_ms)');
    // The number of each channel a report froze, for the moderator's case file (central_schema/social_tables.rs
    // `CB_RECORDING_HOLD_CHANNELS`), erased with the holds of a closed case.
    await query('run', `CREATE TABLE IF NOT EXISTS cb_recording_hold_channels (
        case_id TEXT NOT NULL,
        room TEXT NOT NULL,
        channel INTEGER NOT NULL,
        held_ms INTEGER NOT NULL,
        PRIMARY KEY(case_id, room)
    )`);
    await widenCbBottleColumns(query);
    await dropCbColumns(query);
}

// Lot L2b (lieu et traduction): a table made before it gains its author's language and refusal and the country a bottle
// is thrown to (central_schema/mod.rs `CB_COLUMNS`, the same columns in the same order).
export const CB_BOTTLE_COLUMNS = Object.freeze([
    ['cb_bottles', 'lang', "ALTER TABLE cb_bottles ADD COLUMN lang TEXT NOT NULL DEFAULT ''"],
    ['cb_bottles', 'no_translate', 'ALTER TABLE cb_bottles ADD COLUMN no_translate INTEGER NOT NULL DEFAULT 0'],
    ['cb_bottles', 'target_country', 'ALTER TABLE cb_bottles ADD COLUMN target_country TEXT'],
    ['cb_bottle_messages', 'lang', "ALTER TABLE cb_bottle_messages ADD COLUMN lang TEXT NOT NULL DEFAULT ''"],
    ['cb_bottle_messages', 'no_translate', 'ALTER TABLE cb_bottle_messages ADD COLUMN no_translate INTEGER NOT NULL DEFAULT 0']
]);
async function widenCbBottleColumns(query) {
    for (const [table, column, ddl] of CB_BOTTLE_COLUMNS) {
        const columns = await query('all', `PRAGMA table_info(${table})`);
        if (!(columns || []).some(entry => entry.name === column)) await query('run', ddl);
    }
}
// Lot L2c (user, 16 Nov. 2026: no catcher's country is ever stored): a column a table made by lot L2b had leaves it, its
// values blanked first and overwritten on disk (`secure_delete`) (central_schema/mod.rs `CB_DROPPED_COLUMNS`, `drop_cb_columns`).
export const CB_DROPPED_COLUMNS = Object.freeze([['cb_bottles', 'catcher_country']]);
async function dropCbColumns(query) {
    for (const [table, column] of CB_DROPPED_COLUMNS) {
        const columns = await query('all', `PRAGMA table_info(${table})`);
        if (!(columns || []).some(entry => entry.name === column)) continue;
        const [secure] = (await query('all', 'PRAGMA secure_delete')) || [];
        await query('run', 'PRAGMA secure_delete = ON');
        await query('run', `UPDATE ${table} SET ${column} = NULL`);
        await query('run', `ALTER TABLE ${table} DROP COLUMN ${column}`);
        await query('run', `PRAGMA secure_delete = ${Number(secure?.secure_delete) || 0}`);
    }
}
