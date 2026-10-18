import fs from 'node:fs';
import db from '../database/adole.js';

// Bounded, revocable test seats on the platform OpenAI key. The key file never
// leaves the server: it is not returned, logged, synchronized or stored in a vault.
// A principal's own key always takes precedence and never consumes a seat.
const DEFAULT_LIMITS = Object.freeze({ seats: 10, operations: 400, tokens: 300_000, realtime: 20 });
const LIMIT_VARIABLES = Object.freeze({
    seats: 'OPENAI_SHARED_KEY_SEATS',
    operations: 'OPENAI_SHARED_DAILY_OPS',
    tokens: 'OPENAI_SHARED_DAILY_TOKENS',
    realtime: 'OPENAI_SHARED_DAILY_REALTIME'
});
// Reading the key state or the model catalog is not a metered provider call; a
// voice session is metered once at `realtime-connect`, not per relayed event.
// These still require an active seat, so a revocation also stops a live session.
const UNMETERED_ACTIONS = new Set(['credential.status', 'models', 'realtime-send', 'realtime-close']);

const readLimits = (environment) => Object.fromEntries(Object.entries(DEFAULT_LIMITS).map(([name, defaultValue]) => {
    const raw = environment[LIMIT_VARIABLES[name]];
    if (raw === undefined || raw === '') return [name, defaultValue];
    const value = Number(raw);
    if (!Number.isInteger(value) || value < 0) throw new Error(`provider_shared_limit_invalid:${LIMIT_VARIABLES[name]}`);
    return [name, value];
}));

export const createProviderSharedGrant = ({ query, environment = process.env, now = Date.now, readFile = fs.readFileSync } = {}) => {
    if (typeof query !== 'function') throw new Error('provider_shared_query_required');
    const keyFile = String(environment.OPENAI_SHARED_KEY_FILE || '');
    const limits = readLimits(environment);
    let cachedKey = null;
    const readKey = () => {
        if (!keyFile) return null;
        if (cachedKey) return cachedKey;
        let value;
        try { value = String(readFile(keyFile, 'utf8')).trim(); }
        catch { throw new Error('provider_shared_key_unavailable'); }
        if (!value || value.length > 1024 || /\s/.test(value)) throw new Error('provider_shared_key_unavailable');
        cachedKey = value;
        return cachedKey;
    };
    const day = () => new Date(now()).toISOString().slice(0, 10);
    const seat = (principal) => query('get', 'SELECT * FROM provider_shared_seats WHERE principal_id = ?', [principal]);
    const activeCount = async () => Number((await query('get',
        "SELECT COUNT(*) AS count FROM provider_shared_seats WHERE state = 'active'"))?.count || 0);
    const autoEnrollment = async () => (await query('get',
        "SELECT value FROM provider_shared_settings WHERE name = 'auto_enrollment'"))?.value || 'open';
    const addUsage = (principal, { operations = 0, tokens = 0, realtime = 0 }) => query('run',
        `INSERT INTO provider_shared_usage (principal_id, day, operations, tokens, realtime) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(principal_id, day) DO UPDATE SET operations = operations + excluded.operations,
             tokens = tokens + excluded.tokens, realtime = realtime + excluded.realtime`,
        [principal, day(), operations, tokens, realtime]);

    // One statement: the seat count and the auto-enrollment switch are checked
    // atomically with the insert, so concurrent first calls cannot exceed the limit.
    const claimSeat = async (principal) => {
        await query('run', `INSERT INTO provider_shared_seats (principal_id, state, granted_by, claimed_ms)
            SELECT ?, 'active', 'auto', ?
            WHERE (SELECT COUNT(*) FROM provider_shared_seats WHERE state = 'active') < ?
              AND NOT EXISTS (SELECT 1 FROM provider_shared_settings WHERE name = 'auto_enrollment' AND value = 'closed')
            ON CONFLICT(principal_id) DO NOTHING`, [principal, now(), limits.seats]);
        return seat(principal);
    };

    return {
        limits,
        // Returns the platform key for an entitled principal, or null when the
        // feature is disabled, the principal is blocked or no seat is free.
        async claim(principal, action) {
            if (!principal || !readKey()) return null;
            const current = (await seat(principal)) || await claimSeat(principal);
            if (current?.state !== 'active') return null;
            if (UNMETERED_ACTIONS.has(action)) return readKey();
            const usage = await query('get', 'SELECT * FROM provider_shared_usage WHERE principal_id = ? AND day = ?', [principal, day()]);
            const realtime = action === 'realtime-connect';
            if (Number(usage?.operations || 0) >= limits.operations || Number(usage?.tokens || 0) >= limits.tokens
                || (realtime && Number(usage?.realtime || 0) >= limits.realtime)) throw new Error('insufficient_quota');
            await addUsage(principal, { operations: 1, realtime: realtime ? 1 : 0 });
            return readKey();
        },
        async recordTokens(principal, usage) {
            const tokens = Number(usage?.total_tokens) || (Number(usage?.input_tokens) || 0) + (Number(usage?.output_tokens) || 0);
            if (tokens > 0) await addUsage(principal, { tokens });
        },
        async list() {
            return query('all', `SELECT s.principal_id, s.state, s.granted_by, s.claimed_ms, s.revoked_ms,
                    COALESCE(SUM(u.operations), 0) AS operations, COALESCE(SUM(u.tokens), 0) AS tokens,
                    COALESCE(SUM(u.realtime), 0) AS realtime,
                    COALESCE(SUM(CASE WHEN u.day = ? THEN u.tokens END), 0) AS tokens_today
                FROM provider_shared_seats s LEFT JOIN provider_shared_usage u ON u.principal_id = s.principal_id
                GROUP BY s.principal_id ORDER BY s.claimed_ms`, [day()]);
        },
        async grant(principal) {
            const current = await seat(principal);
            if (current?.state === 'active') return current;
            if (await activeCount() >= limits.seats) throw new Error('provider_shared_seats_full');
            await query('run', `INSERT INTO provider_shared_seats (principal_id, state, granted_by, claimed_ms, revoked_ms)
                VALUES (?, 'active', 'admin', ?, NULL) ON CONFLICT(principal_id) DO UPDATE SET
                state = 'active', granted_by = 'admin', claimed_ms = excluded.claimed_ms, revoked_ms = NULL`, [principal, now()]);
            return seat(principal);
        },
        async revoke(principal) {
            await query('run', `INSERT INTO provider_shared_seats (principal_id, state, granted_by, claimed_ms, revoked_ms)
                VALUES (?, 'revoked', 'admin', ?, ?) ON CONFLICT(principal_id) DO UPDATE SET
                state = 'revoked', revoked_ms = excluded.revoked_ms`, [principal, now(), now()]);
            return seat(principal);
        },
        // Removes the block: the principal may claim a free seat again.
        async unblock(principal) {
            await query('run', "DELETE FROM provider_shared_seats WHERE principal_id = ? AND state = 'revoked'", [principal]);
        },
        async setAutoEnrollment(open) {
            await query('run', `INSERT INTO provider_shared_settings (name, value) VALUES ('auto_enrollment', ?)
                ON CONFLICT(name) DO UPDATE SET value = excluded.value`, [open ? 'open' : 'closed']);
        },
        autoEnrollment,
        activeCount
    };
};

let sharedGrant = null;
export const getProviderSharedGrant = () => {
    sharedGrant ||= createProviderSharedGrant({ query: db.query });
    return sharedGrant;
};
