// Scheduled sends (server/scheduled_sends.js): a publication, a message, a reply or an update its owner
// asked to leave at a given time. The row holds what will leave, replaced by every edit made before
// the time (user decision Q2, 28 Oct. 2026); the server's clock sends it, so a sleeping device never
// holds it back. `state`: pending → sending → sent | partial | failed, or cancelled while pending.
export async function ensureScheduledSendTables(query) {
    await query('run', `CREATE TABLE IF NOT EXISTS scheduled_sends (
        send_id TEXT PRIMARY KEY,
        owner_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        parent_id TEXT,
        title TEXT NOT NULL DEFAULT '',
        due_at TEXT NOT NULL,
        state TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        result_json TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        done_at TEXT
    )`);
    await query('run', 'CREATE INDEX IF NOT EXISTS idx_scheduled_sends_due ON scheduled_sends(state, due_at)');
    await query('run', 'CREATE INDEX IF NOT EXISTS idx_scheduled_sends_owner ON scheduled_sends(owner_id, due_at)');
}
