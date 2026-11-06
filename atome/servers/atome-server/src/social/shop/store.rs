// The shop's tables (database/adole_shop_schema.js; server/shop_store.js, ported): their SQL,
// nothing else. listings.rs decides what a listing row holds, orders.rs how an order moves.
use crate::vault_router::central::Central;
use crate::vault_router::js;
use serde_json::{Value as JsonValue, json};

pub struct Store {
    pub central: Central,
}

impl Store {
    pub async fn listing(&self, listing_id: &str) -> Result<Option<JsonValue>, String> {
        self.central
            .get(
                "SELECT * FROM shop_listings WHERE listing_id = ?",
                vec![json!(listing_id)],
            )
            .await
    }

    pub async fn put(
        &self,
        listing_id: &str,
        seller_id: &str,
        seller_name: &str,
        listing: &JsonValue,
    ) -> Result<(), String> {
        self.central
            .run(
                "INSERT INTO shop_listings (listing_id, seller_id, seller_name, kind, title, price, payload_json)
                 VALUES (?, ?, ?, ?, ?, ?, ?)
                 ON CONFLICT(listing_id) DO UPDATE SET seller_name = excluded.seller_name, kind = excluded.kind,
                 title = excluded.title, price = excluded.price, payload_json = excluded.payload_json,
                 updated_at = datetime('now')",
                vec![
                    json!(listing_id),
                    json!(seller_id),
                    json!(seller_name),
                    listing["kind"].clone(),
                    listing["title"].clone(),
                    listing["price"].clone(),
                    json!(listing.to_string()),
                ],
            )
            .await
    }

    pub async fn remove(&self, listing_id: &str) -> Result<(), String> {
        self.central
            .run(
                "DELETE FROM shop_listings WHERE listing_id = ?",
                vec![json!(listing_id)],
            )
            .await
    }

    /// The visible sales, newest first, narrowed by seller, kind and words (title, comment,
    /// seller's name).
    pub async fn browse(
        &self,
        seller_id: &str,
        kind: &str,
        words: &str,
        limit: i64,
        offset: i64,
    ) -> Result<Vec<JsonValue>, String> {
        let (mut filters, mut values) = (vec!["hidden_at IS NULL"], Vec::new());
        if !seller_id.is_empty() {
            filters.push("seller_id = ?");
            values.push(json!(seller_id));
        }
        if !kind.is_empty() {
            filters.push("kind = ?");
            values.push(json!(kind));
        }
        if !words.is_empty() {
            filters.push("LOWER(title || ' ' || seller_name || ' ' || payload_json) LIKE ?");
            values.push(json!(format!("%{}%", words.replace(['%', '_'], ""))));
        }
        values.extend([json!(limit), json!(offset)]);
        self.central
            .all(
                format!(
                    "SELECT * FROM shop_listings WHERE {} ORDER BY updated_at DESC, listing_id LIMIT ? OFFSET ?",
                    filters.join(" AND ")
                ),
                values,
            )
            .await
    }

    pub async fn report(
        &self,
        listing_id: &str,
        reporter_id: &str,
        reason: &str,
    ) -> Result<i64, String> {
        let (listing, reporter, reason) = (json!(listing_id), json!(reporter_id), json!(reason));
        self.central
            .run(
                "INSERT INTO shop_listing_reports (listing_id, reporter_id, reason) VALUES (?, ?, ?)
                 ON CONFLICT(listing_id, reporter_id) DO NOTHING",
                vec![listing.clone(), reporter, reason],
            )
            .await?;
        let total = self
            .central
            .get(
                "SELECT COUNT(*) AS total FROM shop_listing_reports WHERE listing_id = ?",
                vec![listing.clone()],
            )
            .await?
            .map_or(0, |row| js::number(row.get("total")) as i64);
        self.central
            .run(
                "UPDATE shop_listings SET reports = ? WHERE listing_id = ?",
                vec![json!(total), listing],
            )
            .await?;
        Ok(total)
    }

    pub async fn hide(&self, listing_id: &str) -> Result<(), String> {
        self.central
            .run(
                "UPDATE shop_listings SET hidden_at = datetime('now') WHERE listing_id = ? AND hidden_at IS NULL",
                vec![json!(listing_id)],
            )
            .await
    }

    pub async fn order(&self, order_id: &str) -> Result<Option<JsonValue>, String> {
        self.central
            .get(
                "SELECT * FROM shop_orders WHERE order_id = ?",
                vec![json!(order_id)],
            )
            .await
    }

    pub async fn insert_order(&self, row: &JsonValue) -> Result<(), String> {
        let columns = [
            "order_id",
            "listing_id",
            "buyer_id",
            "seller_id",
            "kind",
            "state",
            "quantity",
            "amount",
            "commission",
            "net",
            "deposit",
            "method",
            "delivery",
            "starts_at",
            "ends_at",
            "delivery_date",
            "delivered_at",
            "snapshot_json",
        ];
        self.central
            .run(
                "INSERT INTO shop_orders (order_id, listing_id, buyer_id, seller_id, kind, state, quantity, amount,
                 commission, net, deposit, method, delivery, starts_at, ends_at, delivery_date, delivered_at, snapshot_json)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                columns.iter().map(|column| row[*column].clone()).collect(),
            )
            .await
    }

    /// An order's move: its step kept (append-only), then its row following it.
    #[allow(clippy::too_many_arguments)]
    pub async fn step(
        &self,
        order_id: &str,
        action: &str,
        role: &str,
        actor_id: &str,
        from: &str,
        to: &str,
        detail: &JsonValue,
        fields: &[(&'static str, JsonValue)],
    ) -> Result<(), String> {
        self.central
            .run(
                "INSERT INTO shop_order_steps (order_id, action, role, actor_id, from_state, to_state, detail_json)
                 VALUES (?, ?, ?, ?, ?, ?, ?)",
                vec![
                    json!(order_id),
                    json!(action),
                    json!(role),
                    json!(actor_id),
                    json!(from),
                    json!(to),
                    json!(detail.to_string()),
                ],
            )
            .await?;
        let mut values = vec![json!(to)];
        let mut sets = String::new();
        for (column, value) in fields {
            sets.push_str(&format!("{column} = ?, "));
            values.push(value.clone());
        }
        values.push(json!(order_id));
        self.central
            .all(
                format!(
                    "UPDATE shop_orders SET state = ?, {sets}updated_at = datetime('now') WHERE order_id = ?"
                ),
                values,
            )
            .await
            .map(drop)
    }

    pub async fn orders_of(&self, user_id: &str, seller: bool) -> Result<Vec<JsonValue>, String> {
        let column = if seller { "seller_id" } else { "buyer_id" };
        self.central
            .all(
                format!(
                    "SELECT * FROM shop_orders WHERE {column} = ? ORDER BY updated_at DESC LIMIT ?"
                ),
                vec![json!(user_id), json!(200)],
            )
            .await
    }

    /// The units of a sale still taken (paid or waiting).
    pub async fn taken(&self, listing_id: &str) -> Result<f64, String> {
        Ok(self
            .central
            .get(
                "SELECT COALESCE(SUM(quantity), 0) AS total FROM shop_orders
                 WHERE listing_id = ? AND state NOT IN ('refunded', 'cancelled')",
                vec![json!(listing_id)],
            )
            .await?
            .map_or(0.0, |row| js::number(row.get("total"))))
    }

    pub async fn open_orders(
        &self,
        listing_id: &str,
        seller_id: &str,
    ) -> Result<Vec<JsonValue>, String> {
        self.central
            .all(
                "SELECT * FROM shop_orders WHERE listing_id = ? AND seller_id = ?
                 AND state NOT IN ('released', 'refunded', 'cancelled')"
                    .into(),
                vec![json!(listing_id), json!(seller_id)],
            )
            .await
    }
}
