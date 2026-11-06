// A person's correspondence read from their vault, as Fastify's
// database/communication_messages.js reads it: only the vault owner's own
// messages, newest first with a cursor stable for equal timestamps. A message's
// owner is the vault's owner rule (reads.rs): `state_current`'s, the row's while
// its owner atome is not in the vault yet (a pending owner, pending.rs).
use super::*;
use rusqlite::types::Value as SqlValue;

const OWNER: &str = "COALESCE(s.owner_id, a.owner_id)";

const TIMESTAMP: &str = "COALESCE(json_extract(s.properties, '$.timestamp'), s.updated_at)";

fn bounded_id(value: Option<&JsonValue>, error: &str) -> Result<Option<String>, String> {
    match value {
        None | Some(JsonValue::Null) => Ok(None),
        Some(JsonValue::String(text)) if !text.is_empty() && text.encode_utf16().count() <= 200 => {
            Ok(Some(text.clone()))
        }
        Some(_) => Err(error.into()),
    }
}

fn values(params: &[SqlValue]) -> Vec<&dyn rusqlite::ToSql> {
    params
        .iter()
        .map(|value| value as &dyn rusqlite::ToSql)
        .collect()
}

// `queryCommunicationMessages` for `user_id`.
pub fn query_messages(
    db: &Connection,
    user_id: &str,
    request: &JsonValue,
) -> Result<JsonValue, String> {
    let text = |key: &str| request.get(key).map(canonical::js_string);
    let contact = SqlValue::from(text("contactId"));
    let user = SqlValue::Text(user_id.into());
    let mut params = vec![
        user.clone(),
        user.clone(),
        user.clone(),
        contact.clone(),
        contact,
        user.clone(),
    ];
    let mut condition = format!(
        "({OWNER} = ? OR a.creator_id = ?)
        AND ((json_extract(s.properties, '$.from_id') = ? AND json_extract(s.properties, '$.to_user_id') = ?)
        OR (json_extract(s.properties, '$.from_id') = ? AND json_extract(s.properties, '$.to_user_id') = ?))",
    );
    if !request.get("legacy").is_some_and(js_truthy) {
        condition.push_str(&format!(" AND {OWNER} = ?"));
        params.push(user);
    }
    // A shop sale's conversation: only the messages written about that sale.
    if let Some(listing) = bounded_id(request.get("listingId"), "conversation_listing_invalid")? {
        condition.push_str(" AND json_extract(s.properties, '$.listing_id') = ?");
        params.push(SqlValue::Text(listing));
    }
    let mut cursor = request
        .get("cursor")
        .filter(|cursor| js_truthy(cursor))
        .cloned();
    let message_id = bounded_id(request.get("messageId"), "conversation_target_invalid")?;
    if let Some(message) = &message_id {
        if cursor.is_some() {
            return Err("conversation_target_invalid".into());
        }
        let mut target_params = params.clone();
        target_params.push(SqlValue::Text(message.clone()));
        let target = row_json::query_object(
            db,
            &format!(
                "SELECT s.atome_id, {TIMESTAMP} AS timestamp
                 FROM state_current s JOIN atomes a ON a.atome_id = s.atome_id
                 WHERE a.atome_type = 'message' AND a.deleted_at IS NULL AND {condition}
                 AND json_extract(s.properties, '$.message_id') = ?"
            ),
            &values(&target_params),
        )?
        .ok_or("conversation_message_unavailable")?;
        cursor = Some(json!({ "timestamp": target["timestamp"], "id": target["atome_id"] }));
    }
    if let Some(cursor) = &cursor {
        let (Some(timestamp), Some(id)) = (
            cursor.get("timestamp").and_then(JsonValue::as_str),
            cursor.get("id").and_then(JsonValue::as_str),
        ) else {
            return Err("conversation_cursor_invalid".into());
        };
        let comparison = if message_id.is_some() { "<=" } else { "<" };
        condition.push_str(&format!(
            " AND ({TIMESTAMP} < ? OR ({TIMESTAMP} = ? AND s.atome_id {comparison} ?))"
        ));
        params.push(SqlValue::Text(timestamp.into()));
        params.push(SqlValue::Text(timestamp.into()));
        params.push(SqlValue::Text(id.into()));
    }
    let limit = reads::js_number_of(request.get("limit")).map_or(30, |limit| limit as i64);
    params.push(SqlValue::Integer(limit + 1));
    let rows = row_json::query_objects(
        db,
        &format!(
            "SELECT s.atome_id, s.properties, {TIMESTAMP} AS timestamp
             FROM state_current s JOIN atomes a ON a.atome_id = s.atome_id
             WHERE a.atome_type = 'message' AND a.deleted_at IS NULL AND {condition}
             ORDER BY {TIMESTAMP} DESC, s.atome_id DESC LIMIT ?"
        ),
        &values(&params),
    )?;
    let page: Vec<&JsonMap<String, JsonValue>> = rows.iter().take(limit.max(0) as usize).collect();
    let items: Vec<JsonValue> = page
        .iter()
        .map(|row| {
            let mut item = JsonMap::new();
            item.insert("id".into(), row["atome_id"].clone());
            if let JsonValue::Object(properties) = row_json::parse_stored(row.get("properties")) {
                item.extend(properties);
            }
            item.insert("timestamp".into(), row["timestamp"].clone());
            JsonValue::Object(item)
        })
        .collect();
    let next = (rows.len() as i64 > limit)
        .then(|| {
            page.last()
                .map(|row| json!({ "timestamp": row["timestamp"], "id": row["atome_id"] }))
        })
        .flatten();
    Ok(json!({ "items": items, "nextCursor": next }))
}

// `queryListingThreads`: the people who wrote about one sale, each one's last message, newest first.
pub fn query_listing_threads(
    db: &Connection,
    user_id: &str,
    request: &JsonValue,
) -> Result<JsonValue, String> {
    let Some(listing) = bounded_id(request.get("listingId"), "conversation_listing_invalid")?
    else {
        return Err("conversation_listing_invalid".into());
    };
    let rows = row_json::query_objects(
        db,
        &format!(
            "SELECT CASE WHEN json_extract(s.properties, '$.from_id') = ? THEN json_extract(s.properties, '$.to_user_id')
                    ELSE json_extract(s.properties, '$.from_id') END AS peer_id, s.properties, {TIMESTAMP} AS timestamp
             FROM state_current s JOIN atomes a ON a.atome_id = s.atome_id
             WHERE a.atome_type = 'message' AND a.deleted_at IS NULL AND {OWNER} = ? AND json_extract(s.properties, '$.listing_id') = ?
             ORDER BY {TIMESTAMP} DESC, s.atome_id DESC"
        ),
        &[&user_id, &user_id, &listing],
    )?;
    let mut order: Vec<String> = Vec::new();
    let mut threads: HashMap<String, JsonValue> = HashMap::new();
    for row in rows {
        let peer = row
            .get("peer_id")
            .filter(|peer| js_truthy(peer))
            .map(canonical::js_string)
            .unwrap_or_default();
        if peer.is_empty() {
            continue;
        }
        let properties = row_json::parse_stored(row.get("properties"));
        if !threads.contains_key(&peer) {
            if order.len() >= 100 {
                continue;
            }
            order.push(peer.clone());
            threads.insert(peer.clone(), json!({ "peerId": peer, "last": properties, "timestamp": row["timestamp"], "unread": 0 }));
        }
        if properties.get("unread") == Some(&JsonValue::Bool(true))
            && properties.get("box").and_then(JsonValue::as_str) == Some("inbox")
        {
            let thread = threads.get_mut(&peer).expect("thread");
            thread["unread"] = json!(thread["unread"].as_i64().unwrap_or(0) + 1);
        }
    }
    let items: Vec<JsonValue> = order
        .into_iter()
        .filter_map(|peer| threads.remove(&peer))
        .collect();
    Ok(json!({ "items": items }))
}
