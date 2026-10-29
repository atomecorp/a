// Coaches (server/coach_directory.js, server/coach_bookings.js). `coach_directory` is the shared base everyone
// searches, a projection of the coaches' public coaching agendas (their `calendar` Atome carrying `coaching`), never
// their truth: it can be rebuilt from the vaults. `coach_bookings` holds each request and its answer; every move of a
// booking is kept in `coach_booking_steps`, append-only, the booking's row being their projection.
export async function ensureCoachTables(query) {
    await query('run', `CREATE TABLE IF NOT EXISTS coach_directory (
        coach_id TEXT PRIMARY KEY,
        calendar_id TEXT NOT NULL,
        name TEXT NOT NULL,
        quality TEXT NOT NULL,
        words TEXT NOT NULL DEFAULT '',
        payload_json TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);
    await query('run', 'CREATE INDEX IF NOT EXISTS idx_coach_directory_name ON coach_directory(name)');
    await query('run', `CREATE TABLE IF NOT EXISTS coach_bookings (
        booking_id TEXT PRIMARY KEY,
        coach_id TEXT NOT NULL,
        client_id TEXT NOT NULL,
        coach_name TEXT NOT NULL DEFAULT '',
        client_name TEXT NOT NULL DEFAULT '',
        state TEXT NOT NULL,
        starts_at TEXT NOT NULL,
        ends_at TEXT NOT NULL,
        minutes INTEGER NOT NULL,
        cancel_hours INTEGER NOT NULL,
        title TEXT NOT NULL,
        note TEXT NOT NULL DEFAULT '',
        client_calendar_id TEXT NOT NULL DEFAULT '',
        client_timezone TEXT NOT NULL DEFAULT '',
        coach_event_id TEXT NOT NULL DEFAULT '',
        client_event_id TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);
    await query('run', 'CREATE INDEX IF NOT EXISTS idx_coach_bookings_coach ON coach_bookings(coach_id, starts_at)');
    await query('run', 'CREATE INDEX IF NOT EXISTS idx_coach_bookings_client ON coach_bookings(client_id, starts_at)');
    await query('run', `CREATE TABLE IF NOT EXISTS coach_booking_steps (
        step_id INTEGER PRIMARY KEY AUTOINCREMENT,
        booking_id TEXT NOT NULL,
        action TEXT NOT NULL,
        role TEXT NOT NULL,
        actor_id TEXT NOT NULL,
        from_state TEXT NOT NULL DEFAULT '',
        to_state TEXT NOT NULL,
        at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);
    await query('run', 'CREATE INDEX IF NOT EXISTS idx_coach_booking_steps_booking ON coach_booking_steps(booking_id, step_id)');
}
