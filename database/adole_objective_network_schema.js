// The objectives network (server/objective_network.js, R-104 D8): who may be found for an objective. A projection
// of the people's own `objective_visibility` Atomes (only what a lit « Visib. » shows), never their truth; rebuilt
// from the vaults. Reports: one per reporter and person; three distinct ones hide the person from the network and
// open a case in eVe's moderation queue (`moderation_cases`, handled by eVe's moderators).
export async function ensureObjectiveNetworkTables(query) {
    await query('run', `CREATE TABLE IF NOT EXISTS objective_network_entries (
        objective_atome_id TEXT PRIMARY KEY,
        principal_id TEXT NOT NULL,
        objective_key TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);
    await query('run', 'CREATE INDEX IF NOT EXISTS idx_objective_network_key ON objective_network_entries(objective_key, principal_id)');
    await query('run', 'CREATE INDEX IF NOT EXISTS idx_objective_network_principal ON objective_network_entries(principal_id)');
    await query('run', `CREATE TABLE IF NOT EXISTS objective_network_reports (
        target_id TEXT NOT NULL,
        reporter_id TEXT NOT NULL,
        reason TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY(target_id, reporter_id)
    )`);
    await query('run', `CREATE TABLE IF NOT EXISTS moderation_cases (
        case_id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        target_id TEXT NOT NULL,
        reports INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'open',
        hidden_at TEXT,
        opened_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        handled_by TEXT,
        UNIQUE(kind, target_id)
    )`);
}
