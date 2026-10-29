// Queries stay at the database boundary. A participant can only read their
// own correspondence; cursor ordering is stable even for equal timestamps.
export async function queryCommunicationMessages({ query, userId, contactId, cursor = null, messageId = null, limit = 30, legacy = false, listingId = null }) {
    const timestamp = "COALESCE(json_extract(s.properties, '$.timestamp'), s.updated_at)";
    const params = [userId, userId, userId, contactId, contactId, userId];
    let where = `(a.owner_id = ? OR a.creator_id = ?)
        AND ((json_extract(s.properties, '$.from_id') = ? AND json_extract(s.properties, '$.to_user_id') = ?)
        OR (json_extract(s.properties, '$.from_id') = ? AND json_extract(s.properties, '$.to_user_id') = ?))`;
    if (!legacy) { where += ' AND a.owner_id = ?'; params.push(userId); }
    // A shop sale's conversation: only the messages written about that sale (server/shop_messages.js).
    if (listingId != null) {
        if (typeof listingId !== 'string' || !listingId || listingId.length > 200) throw new Error('conversation_listing_invalid');
        where += " AND json_extract(s.properties, '$.listing_id') = ?"; params.push(listingId);
    }
    if (messageId != null) {
        if (typeof messageId !== 'string' || !messageId || messageId.length > 200 || cursor) throw new Error('conversation_target_invalid');
        const target = await query('get', `SELECT s.atome_id, ${timestamp} AS timestamp
            FROM state_current s JOIN atomes a ON a.atome_id = s.atome_id
            WHERE a.atome_type = 'message' AND a.deleted_at IS NULL AND ${where}
            AND json_extract(s.properties, '$.message_id') = ?`, [...params, messageId]);
        if (!target) throw new Error('conversation_message_unavailable');
        cursor = { timestamp: target.timestamp, id: target.atome_id };
    }
    if (cursor) {
        if (typeof cursor.timestamp !== 'string' || typeof cursor.id !== 'string') throw new Error('conversation_cursor_invalid');
        where += ` AND (${timestamp} < ? OR (${timestamp} = ? AND s.atome_id ${messageId ? '<=' : '<'} ?))`;
        params.push(cursor.timestamp, cursor.timestamp, cursor.id);
    }
    params.push(limit + 1);
    const rows = await query('all', `SELECT s.atome_id, s.properties, ${timestamp} AS timestamp
        FROM state_current s JOIN atomes a ON a.atome_id = s.atome_id
        WHERE a.atome_type = 'message' AND a.deleted_at IS NULL AND ${where}
        ORDER BY ${timestamp} DESC, s.atome_id DESC LIMIT ?`, params);
    const page = rows.slice(0, limit);
    return { items: page.map(row => ({ id: row.atome_id,
        ...(typeof row.properties === 'string' ? JSON.parse(row.properties) : row.properties), timestamp: row.timestamp })),
        nextCursor: rows.length > limit ? { timestamp: page.at(-1).timestamp, id: page.at(-1).atome_id } : null };
}

// The people who wrote about one sale, as its seller reads them: each one's last message, newest first.
export async function queryListingThreads({ query, userId, listingId, limit = 100 }) {
    if (typeof listingId !== 'string' || !listingId || listingId.length > 200) throw new Error('conversation_listing_invalid');
    const timestamp = "COALESCE(json_extract(s.properties, '$.timestamp'), s.updated_at)";
    const peer = `CASE WHEN json_extract(s.properties, '$.from_id') = ? THEN json_extract(s.properties, '$.to_user_id') ELSE json_extract(s.properties, '$.from_id') END`;
    const rows = await query('all', `SELECT ${peer} AS peer_id, s.properties, ${timestamp} AS timestamp
        FROM state_current s JOIN atomes a ON a.atome_id = s.atome_id
        WHERE a.atome_type = 'message' AND a.deleted_at IS NULL AND a.owner_id = ? AND json_extract(s.properties, '$.listing_id') = ?
        ORDER BY ${timestamp} DESC, s.atome_id DESC`, [userId, userId, listingId]);
    const threads = new Map();
    for (const row of rows) {
        const id = String(row.peer_id || '');
        if (!id) continue;
        const properties = typeof row.properties === 'string' ? JSON.parse(row.properties) : row.properties;
        const thread = threads.get(id) || (threads.size < limit ? { peerId: id, last: properties, timestamp: row.timestamp, unread: 0 } : null);
        if (!thread) continue;
        if (properties.unread === true && properties.box === 'inbox') thread.unread += 1;
        threads.set(id, thread);
    }
    return { items: [...threads.values()] };
}
