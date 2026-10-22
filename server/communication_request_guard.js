// Contact request guard (anti-spam, decided with the user on 2026-10-22).
//
// A request to someone the sender is not in relation with is the one message a
// stranger can send: every limit lives here, on the server, because a client limit
// protects nothing (a script speaks to /ws/api directly; the assistant goes through
// the same path). A request is one recipient; the layers below bound how many a
// sender can fire, whatever the number behind it:
// - rhythm: one request every 15 s;
// - quotas: 10 an hour, 20 a day; 3 a day while the account is younger than 72 h;
// - waiting: at most 20 requests left unanswered, each freed after 30 days;
// - reputation: 3 blocks received within 30 days suspend requests for 30 days.
// A request to a number without account counts exactly like the others and is
// never resolved, so neither the quotas nor the waiting cap tell a number with an
// account from one without. Exceeding a limit is said to the sender: it concerns
// them alone and reveals nothing about anyone else.
import crypto from 'node:crypto';

const DAY_MS = 24 * 3600 * 1000;

export const CONTACT_REQUEST_LIMITS = Object.freeze({
    intervalMs: 15 * 1000,
    perHour: 10,
    perDay: 20,
    newAccountMs: 3 * DAY_MS,
    newAccountPerDay: 3,
    pending: 20,
    pendingMs: 30 * DAY_MS,
    blocks: 3,
    blockWindowMs: 30 * DAY_MS,
    suspensionMs: 30 * DAY_MS,
    // Every request answers after this floor: the time taken never tells whether a number has an account.
    floorMs: 400
});

const timeOf = (value) => {
    const text = String(value || '').trim();
    if (!text) return NaN;
    // SQLite `datetime('now')` is UTC without a zone.
    return Date.parse(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(text) ? `${text.replace(' ', 'T')}Z` : text);
};

export function createContactRequestGuard({ query, findUserById, now = () => Date.now(), limits = CONTACT_REQUEST_LIMITS }) {
    const refuse = (error) => { throw new Error(error); };

    // The blocks received suspend while a run of `blocks` of them, within `blockWindowMs`,
    // ended less than `suspensionMs` ago.
    const suspended = async (senderId, at) => {
        const since = new Date(at - limits.blockWindowMs - limits.suspensionMs).toISOString().replace('T', ' ').slice(0, 19);
        const rows = await query('all', `SELECT updated_at FROM sync_share_policies
            WHERE peer_id = ? AND policy = 'block' AND revoked_at IS NULL AND updated_at >= ?`, [senderId, since]) || [];
        const times = rows.map((row) => timeOf(row.updated_at)).filter(Number.isFinite).sort((a, b) => a - b);
        for (let index = limits.blocks - 1; index < times.length; index += 1) {
            if (times[index] - times[index - limits.blocks + 1] <= limits.blockWindowMs && at - times[index] < limits.suspensionMs) return true;
        }
        return false;
    };

    // Throws the first limit the sender has reached; `contact_request_*` errors are theirs to read.
    const admit = async (senderId) => {
        const at = now();
        const count = async (sinceMs, open = false) => Number((await query('get',
            `SELECT COUNT(*) AS total FROM communication_contact_requests WHERE sender_id = ? AND created_ms > ?${open ? ' AND resolved_ms IS NULL' : ''}`,
            [senderId, at - sinceMs]))?.total || 0);
        const last = await query('get', 'SELECT MAX(created_ms) AS last FROM communication_contact_requests WHERE sender_id = ?', [senderId]);
        if (Number(last?.last) > at - limits.intervalMs) refuse('contact_request_too_soon');
        if (await suspended(senderId, at)) refuse('contact_request_suspended');
        const created = timeOf((await findUserById(senderId))?.created_at);
        if (!Number.isFinite(created)) refuse('contact_request_sender_unknown');
        const young = at - created < limits.newAccountMs;
        if (await count(DAY_MS) >= (young ? limits.newAccountPerDay : limits.perDay)) refuse('contact_request_quota');
        if (await count(3600 * 1000) >= limits.perHour) refuse('contact_request_quota');
        if (await count(limits.pendingMs, true) >= limits.pending) refuse('contact_request_pending_limit');
    };

    // `targetId` is null for a number without account; `note` is kept only when it reached them.
    const record = (senderId, targetId, note) => query('run',
        `INSERT INTO communication_contact_requests (request_id, sender_id, target_id, note, created_ms, resolved_ms)
         VALUES (?, ?, ?, ?, ?, NULL)`,
        [crypto.randomUUID(), senderId, targetId || null, note == null ? null : String(note), now()]);

    // Accepted: the sender's requests to them are answered; the note they read becomes the
    // conversation's first message (`{ note, at }`, or null when none reached them).
    const resolve = async (senderId, targetId) => {
        const delivered = await query('get', `SELECT note, created_ms FROM communication_contact_requests
            WHERE sender_id = ? AND target_id = ? AND resolved_ms IS NULL AND note IS NOT NULL ORDER BY created_ms DESC LIMIT 1`,
        [senderId, targetId]);
        await query('run', `UPDATE communication_contact_requests SET resolved_ms = ?
            WHERE sender_id = ? AND target_id = ? AND resolved_ms IS NULL`, [now(), senderId, targetId]);
        return delivered && String(delivered.note).trim() ? { note: String(delivered.note), at: Number(delivered.created_ms) } : null;
    };

    // Every answer to a request leaves after the same floor.
    const settle = async (startedMs) => {
        const wait = startedMs + limits.floorMs - now();
        if (wait > 0) await new Promise((done) => setTimeout(done, wait));
    };

    return { admit, record, resolve, settle };
}
