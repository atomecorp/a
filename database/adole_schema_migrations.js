async function ensureColumn({ query, table, column, ddl }) {
    const columns = await query('all', `PRAGMA table_info(${table})`);
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
}

async function ensureStateCurrentColumns(query) {
    const columns = await query('all', "PRAGMA table_info(state_current)");
    const names = new Set((columns || []).map((col) => col.name));
    if (names.has('owner_id')) return;
    await query('run', "ALTER TABLE state_current ADD COLUMN owner_id TEXT");
    await query(
        'run',
        "UPDATE state_current SET owner_id = (SELECT owner_id FROM atomes WHERE atomes.atome_id = state_current.atome_id) WHERE owner_id IS NULL"
    );
}

async function runAdoleSchemaMigrations(query) {
    await ensurePermissionsColumns(query);
    await ensureSnapshotColumns(query);
    await ensureEventColumns(query);
    await ensureStateCurrentColumns(query);
}

export { runAdoleSchemaMigrations };
