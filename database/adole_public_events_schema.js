// Public events (server/public_events.js): the shared base every user reads in the Activité
// rubrics. A projection of the authors' `calendar_event` Atomes, never their truth: it can be
// rebuilt from the vaults. A series is one published event; its occurrences are what a reader
// finds around a position (a repeated event has one per date of the publication horizon).
export async function ensurePublicEventTables(query) {
    await query('run', `CREATE TABLE IF NOT EXISTS public_event_series (
        event_id TEXT PRIMARY KEY,
        author_id TEXT NOT NULL,
        author_name TEXT NOT NULL DEFAULT '',
        payload_json TEXT NOT NULL,
        reports INTEGER NOT NULL DEFAULT 0,
        hidden_at TEXT,
        published_at TEXT NOT NULL DEFAULT (datetime('now')),
        projected_until TEXT,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);
    await query('run', 'CREATE INDEX IF NOT EXISTS idx_public_event_series_author ON public_event_series(author_id, published_at)');
    await query('run', `CREATE TABLE IF NOT EXISTS public_events (
        occurrence_id TEXT PRIMARY KEY,
        event_id TEXT NOT NULL,
        start_at TEXT NOT NULL,
        end_at TEXT NOT NULL,
        cell INTEGER NOT NULL,
        lat REAL NOT NULL,
        lon REAL NOT NULL,
        categories TEXT NOT NULL,
        free INTEGER NOT NULL DEFAULT 0
    )`);
    await query('run', 'CREATE INDEX IF NOT EXISTS idx_public_events_cell ON public_events(cell, end_at)');
    await query('run', 'CREATE INDEX IF NOT EXISTS idx_public_events_event ON public_events(event_id)');
    await query('run', `CREATE TABLE IF NOT EXISTS public_event_reports (
        event_id TEXT NOT NULL,
        reporter_id TEXT NOT NULL,
        reason TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY(event_id, reporter_id)
    )`);
}
