// The scheduled sends' table (database/adole_scheduled_sends_schema.js): its SQL, nothing else.
// server/scheduled_sends.js decides what a row holds and how it moves.
export function createScheduledSendStore({ query }) {
    const get = sendId => query('get', 'SELECT * FROM scheduled_sends WHERE send_id = ?', [sendId]);
    // A pending send replaced whole (content, time, title) until it leaves.
    const put = ({ sendId, ownerId, kind, parentId, title, dueAt, payload }) => query('run', `INSERT INTO scheduled_sends
            (send_id, owner_id, kind, parent_id, title, due_at, state, payload_json) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)
        ON CONFLICT(send_id) DO UPDATE SET title = excluded.title, due_at = excluded.due_at, payload_json = excluded.payload_json,
            updated_at = datetime('now') WHERE scheduled_sends.state = 'pending'`,
    [sendId, ownerId, kind, parentId, title, dueAt, JSON.stringify(payload)]);
    // Taken by one clock only: the row moves from pending to sending once.
    const take = async sendId => Number((await query('run', `UPDATE scheduled_sends SET state = 'sending', updated_at = datetime('now')
        WHERE send_id = ? AND state = 'pending'`, [sendId]))?.changes || 0) === 1;
    const finish = (sendId, from, to, result) => query('run', `UPDATE scheduled_sends SET state = ?, result_json = ?, done_at = datetime('now'),
        updated_at = datetime('now') WHERE send_id = ? AND state = ?`, [to, result ? JSON.stringify(result) : null, sendId, from]);
    // ISO times compare as text.
    const due = at => query('all', "SELECT * FROM scheduled_sends WHERE state = 'pending' AND due_at <= ? ORDER BY due_at LIMIT 200", [at]);
    const next = () => query('get', "SELECT due_at FROM scheduled_sends WHERE state = 'pending' ORDER BY due_at LIMIT 1");
    const children = parentId => query('all', 'SELECT * FROM scheduled_sends WHERE parent_id = ?', [parentId]);
    const ofOwner = (ownerId, since) => query('all', `SELECT * FROM scheduled_sends WHERE owner_id = ?${since ? ' AND updated_at >= ?' : ''}
        ORDER BY due_at LIMIT 500`, since ? [ownerId, since.replace('T', ' ').slice(0, 19)] : [ownerId]);
    return { get, put, take, finish, due, next, children, ofOwner };
}
