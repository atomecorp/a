// The shop (server/shop_listings.js, server/shop_orders.js). `shop_listings` is the shared base everyone
// browses, a projection of the sellers' `shop_listing` Atomes, never their truth: it can be rebuilt from the
// vaults. `shop_orders` holds each sale's money in escrow (simulated payment for now); `shop_order_steps` keeps
// every move of an order, append-only, the order's row being their projection.
export async function ensureShopTables(query) {
    await query('run', `CREATE TABLE IF NOT EXISTS shop_listings (
        listing_id TEXT PRIMARY KEY,
        seller_id TEXT NOT NULL,
        seller_name TEXT NOT NULL DEFAULT '',
        kind TEXT NOT NULL,
        title TEXT NOT NULL,
        price REAL NOT NULL,
        payload_json TEXT NOT NULL,
        reports INTEGER NOT NULL DEFAULT 0,
        hidden_at TEXT,
        published_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);
    await query('run', 'CREATE INDEX IF NOT EXISTS idx_shop_listings_seller ON shop_listings(seller_id, updated_at)');
    await query('run', 'CREATE INDEX IF NOT EXISTS idx_shop_listings_recent ON shop_listings(updated_at)');
    await query('run', `CREATE TABLE IF NOT EXISTS shop_listing_reports (
        listing_id TEXT NOT NULL,
        reporter_id TEXT NOT NULL,
        reason TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY(listing_id, reporter_id)
    )`);
    await query('run', `CREATE TABLE IF NOT EXISTS shop_orders (
        order_id TEXT PRIMARY KEY,
        listing_id TEXT NOT NULL,
        buyer_id TEXT NOT NULL,
        seller_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        state TEXT NOT NULL,
        quantity INTEGER NOT NULL DEFAULT 1,
        amount REAL NOT NULL,
        commission REAL NOT NULL,
        net REAL NOT NULL,
        deposit REAL NOT NULL DEFAULT 0,
        method TEXT NOT NULL,
        delivery TEXT NOT NULL DEFAULT '',
        tracking TEXT NOT NULL DEFAULT '',
        starts_at TEXT,
        ends_at TEXT,
        delivery_date TEXT,
        delivered_at TEXT,
        snapshot_json TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);
    await query('run', 'CREATE INDEX IF NOT EXISTS idx_shop_orders_buyer ON shop_orders(buyer_id, updated_at)');
    await query('run', 'CREATE INDEX IF NOT EXISTS idx_shop_orders_seller ON shop_orders(seller_id, updated_at)');
    await query('run', 'CREATE INDEX IF NOT EXISTS idx_shop_orders_listing ON shop_orders(listing_id, state)');
    await query('run', `CREATE TABLE IF NOT EXISTS shop_order_steps (
        step_id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id TEXT NOT NULL,
        action TEXT NOT NULL,
        role TEXT NOT NULL,
        actor_id TEXT NOT NULL DEFAULT '',
        from_state TEXT NOT NULL DEFAULT '',
        to_state TEXT NOT NULL,
        detail_json TEXT NOT NULL DEFAULT '{}',
        at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);
    await query('run', 'CREATE INDEX IF NOT EXISTS idx_shop_order_steps_order ON shop_order_steps(order_id, step_id)');
}
