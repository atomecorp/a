// The shop's tables (database/adole_shop_schema.js): their SQL, nothing else. server/shop_listings.js decides
// what a listing row holds, server/shop_orders.js how an order moves; this module only reads and writes the rows.

export function createShopStore({ query }) {
    const listing = listingId => query('get', 'SELECT * FROM shop_listings WHERE listing_id = ?', [listingId]);
    const put = ({ listingId, sellerId, sellerName, listing: value }) => query('run', `INSERT INTO shop_listings
            (listing_id, seller_id, seller_name, kind, title, price, payload_json) VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(listing_id) DO UPDATE SET seller_name = excluded.seller_name, kind = excluded.kind, title = excluded.title,
            price = excluded.price, payload_json = excluded.payload_json, updated_at = datetime('now')`,
    [listingId, sellerId, sellerName, value.kind, value.title, value.price, JSON.stringify(value)]);
    const remove = listingId => query('run', 'DELETE FROM shop_listings WHERE listing_id = ?', [listingId]);
    // The visible sales, newest first, narrowed by seller, kind and words (title, comment, seller's name).
    const browse = ({ sellerId, kind, query: words, limit, offset }) => {
        const where = ['hidden_at IS NULL'], params = [];
        if (sellerId) { where.push('seller_id = ?'); params.push(sellerId); }
        if (kind) { where.push('kind = ?'); params.push(kind); }
        if (words) { where.push("LOWER(title || ' ' || seller_name || ' ' || payload_json) LIKE ?"); params.push(`%${words.replace(/[%_]/g, '')}%`); }
        return query('all', `SELECT * FROM shop_listings WHERE ${where.join(' AND ')} ORDER BY updated_at DESC, listing_id LIMIT ? OFFSET ?`,
            [...params, limit, offset]);
    };
    const report = async (listingId, reporterId, reason) => {
        await query('run', `INSERT INTO shop_listing_reports (listing_id, reporter_id, reason) VALUES (?, ?, ?)
            ON CONFLICT(listing_id, reporter_id) DO NOTHING`, [listingId, reporterId, reason]);
        const total = Number((await query('get', 'SELECT COUNT(*) AS total FROM shop_listing_reports WHERE listing_id = ?', [listingId]))?.total || 0);
        await query('run', 'UPDATE shop_listings SET reports = ? WHERE listing_id = ?', [total, listingId]);
        return total;
    };
    const hide = listingId => query('run', "UPDATE shop_listings SET hidden_at = datetime('now') WHERE listing_id = ? AND hidden_at IS NULL", [listingId]);

    const order = orderId => query('get', 'SELECT * FROM shop_orders WHERE order_id = ?', [orderId]);
    const insertOrder = row => query('run', `INSERT INTO shop_orders (order_id, listing_id, buyer_id, seller_id, kind, state, quantity, amount,
            commission, net, deposit, method, delivery, starts_at, ends_at, delivery_date, delivered_at, snapshot_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [row.order_id, row.listing_id, row.buyer_id, row.seller_id, row.kind, row.state, row.quantity, row.amount, row.commission, row.net,
        row.deposit, row.method, row.delivery, row.starts_at, row.ends_at, row.delivery_date, row.delivered_at, row.snapshot_json]);
    // An order's move: its step kept (append-only), then its row following it.
    const step = async ({ orderId, action, role, actorId = '', from, to, detail = {}, fields = {} }) => {
        await query('run', `INSERT INTO shop_order_steps (order_id, action, role, actor_id, from_state, to_state, detail_json)
            VALUES (?, ?, ?, ?, ?, ?, ?)`, [orderId, action, role, actorId, from, to, JSON.stringify(detail)]);
        const columns = Object.keys(fields);
        await query('run', `UPDATE shop_orders SET state = ?, ${columns.map(column => `${column} = ?, `).join('')}updated_at = datetime('now')
            WHERE order_id = ?`, [to, ...columns.map(column => fields[column]), orderId]);
    };
    const steps = orderId => query('all', 'SELECT action, role, from_state, to_state, detail_json, at FROM shop_order_steps WHERE order_id = ? ORDER BY step_id', [orderId]);
    const ordersOf = (userId, side, limit = 200) => query('all', `SELECT * FROM shop_orders WHERE ${side === 'seller' ? 'seller_id' : 'buyer_id'} = ?
        ORDER BY updated_at DESC LIMIT ?`, [userId, limit]);
    // The units of a sale still taken (paid or waiting): what is left to sell is the listing's quantity or places minus them.
    const taken = async listingId => Number((await query('get', `SELECT COALESCE(SUM(quantity), 0) AS total FROM shop_orders
        WHERE listing_id = ? AND state NOT IN ('refunded', 'cancelled')`, [listingId]))?.total || 0);
    const openOrders = (listingId, sellerId) => query('all', `SELECT * FROM shop_orders WHERE listing_id = ? AND seller_id = ?
        AND state NOT IN ('released', 'refunded', 'cancelled')`, [listingId, sellerId]);
    // The orders time may move: delivered ones (two days without dispute) and dated ones held (the event or appointment over).
    const due = () => query('all', "SELECT * FROM shop_orders WHERE state = 'delivered' OR (state = 'held' AND ends_at IS NOT NULL) LIMIT 500");

    return { listing, put, remove, browse, report, hide, order, insertOrder, step, steps, ordersOf, taken, openOrders, due };
}
