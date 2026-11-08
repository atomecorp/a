// The sync streams a principal may follow. A stream covers a whole project
// (`project:<id>`) while a share covers a root (an object and its descendants):
// access to a stream comes from the active shares naming it, then each event is
// filtered object by object (`project_stream_event`). The registry keeps one
// `atome_id` per stream (the last written), so it is never an authority: sharing
// one object would open the whole project.
use super::VaultRouter;
use super::js::{self, first, truthy};
use super::shares::{self, ACTIVE_LINKED};
use serde_json::{Map as JsonMap, Value as JsonValue, json};
use std::collections::{HashMap, HashSet};

fn marks(count: usize) -> String {
    vec!["?"; count].join(",")
}

pub(super) fn unique(values: impl IntoIterator<Item = String>) -> Vec<String> {
    let mut seen = HashSet::new();
    values
        .into_iter()
        .filter(|value| !value.is_empty() && seen.insert(value.clone()))
        .collect()
}

impl VaultRouter {
    pub async fn stream_access(
        &self,
        principal: &str,
        stream_id: Option<&JsonValue>,
    ) -> Result<Option<JsonValue>, String> {
        let stream_id = stream_id
            .filter(|value| truthy(Some(value)))
            .map(js::string)
            .unwrap_or_default();
        let Some(stream) = self
            .central
            .get(
                "SELECT * FROM vault_stream_registry WHERE stream_id = ?",
                vec![json!(stream_id)],
            )
            .await?
        else {
            return Ok(None);
        };
        let owner = stream
            .get("vault_principal_id")
            .map(js::string)
            .unwrap_or_default();
        if owner == principal {
            return Ok(Some(js::with(&stream, [("owner", json!(true))])));
        }
        let shares = self
            .central
            .all(
                format!(
                    "SELECT * FROM sync_share_requests
                     WHERE principal_id = ? AND owner_id = ? AND stream_id = ? AND {ACTIVE_LINKED}
                     ORDER BY updated_at DESC"
                ),
                vec![
                    json!(principal),
                    stream
                        .get("vault_principal_id")
                        .cloned()
                        .unwrap_or(JsonValue::Null),
                    stream.get("stream_id").cloned().unwrap_or(JsonValue::Null),
                ],
            )
            .await?;
        if shares.is_empty() {
            return Ok(None);
        }
        Ok(Some(js::with(
            &stream,
            [
                ("owner", json!(false)),
                ("shares", JsonValue::Array(shares)),
            ],
        )))
    }

    // `stream_access` and `stream:head` for a subscription batch: one registry read,
    // one share read and one vault request per owning vault. The head of every
    // authorized stream, in the order the vaults were asked; the others are absent.
    pub async fn authorized_stream_heads(
        &self,
        principal: &str,
        stream_ids: &[JsonValue],
    ) -> Result<Vec<(String, JsonValue)>, String> {
        let ids = unique(stream_ids.iter().map(js::string));
        if ids.is_empty() {
            return Ok(Vec::new());
        }
        let rows = self
            .central
            .all(
                format!("SELECT stream_id, vault_principal_id FROM vault_stream_registry WHERE stream_id IN ({})", marks(ids.len())),
                ids.iter().map(|id| json!(id)).collect(),
            )
            .await?;
        let owner_of = |row: &JsonValue| {
            row.get("vault_principal_id")
                .map(js::string)
                .unwrap_or_default()
        };
        let stream_of = |row: &JsonValue| row.get("stream_id").map(js::string).unwrap_or_default();
        let foreign: Vec<String> = rows
            .iter()
            .filter(|row| owner_of(row) != principal)
            .map(stream_of)
            .collect();
        let mut shared = HashSet::new();
        if !foreign.is_empty() {
            let mut values = vec![json!(principal)];
            values.extend(foreign.iter().map(|id| json!(id)));
            let shares = self
                .central
                .all(
                    format!(
                        "SELECT DISTINCT stream_id, owner_id FROM sync_share_requests
                         WHERE principal_id = ? AND stream_id IN ({}) AND {ACTIVE_LINKED}",
                        marks(foreign.len())
                    ),
                    values,
                )
                .await?;
            for share in shares {
                shared.insert(format!(
                    "{}\n{}",
                    js::string(&share["owner_id"]),
                    js::string(&share["stream_id"])
                ));
            }
        }
        let mut by_vault: Vec<(String, Vec<String>)> = Vec::new();
        for row in &rows {
            let (owner, stream) = (owner_of(row), stream_of(row));
            if owner != principal && !shared.contains(&format!("{owner}\n{stream}")) {
                continue;
            }
            match by_vault.iter_mut().find(|(known, _)| *known == owner) {
                Some((_, streams)) => streams.push(stream),
                None => by_vault.push((owner, vec![stream])),
            }
        }
        let mut heads = Vec::new();
        for (owner, streams) in by_vault {
            let vault_heads = self
                .ask(&owner, "stream:heads", json!({ "stream_ids": streams }))
                .await?;
            for stream in streams {
                let head = vault_heads.get(&stream).filter(|head| truthy(Some(head)));
                let head = head.map_or(0.0, |head| js::number(Some(head)));
                heads.push((stream, js::number_json(head)));
            }
        }
        Ok(heads)
    }

    // The stream a share of an object of `owner`'s vault binds to: the project's
    // stream for a project (its children live there), else the one holding its events.
    pub async fn stream_for_atome(
        &self,
        owner: &str,
        atome_id: &JsonValue,
    ) -> Result<Option<JsonValue>, String> {
        let stream = self
            .ask(owner, "stream:of-atome", json!({ "atome_id": atome_id }))
            .await?;
        if !truthy(stream.get("stream_id")) {
            return Ok(None);
        }
        self.register_stream(&stream, owner).await?;
        self.central
            .get(
                "SELECT * FROM vault_stream_registry WHERE stream_id = ? AND vault_principal_id = ?",
                vec![stream["stream_id"].clone(), json!(owner)],
            )
            .await
    }

    pub async fn list_share_streams(
        &self,
        principal: &str,
        share_id: &JsonValue,
    ) -> Result<Vec<JsonValue>, String> {
        let share = self
            .central
            .all(
                format!("SELECT stream_id FROM sync_share_requests WHERE share_id = ? AND principal_id = ? AND {ACTIVE_LINKED}"),
                vec![share_id.clone(), json!(principal)],
            )
            .await?;
        Ok(share
            .into_iter()
            .take(1)
            .filter_map(|row| row.get("stream_id").filter(|id| truthy(Some(id))).cloned())
            .collect())
    }

    pub async fn list_stream_events(
        &self,
        principal: &str,
        stream_id: &JsonValue,
        options: &JsonValue,
    ) -> Result<Vec<JsonValue>, String> {
        let Some(access) = self.stream_access(principal, Some(stream_id)).await? else {
            return Err("stream_access_denied".into());
        };
        let limit = js::number_or(options.get("limit"), 500.0).clamp(1.0, 1000.0);
        let mut request = JsonMap::new();
        request.insert("stream_id".into(), stream_id.clone());
        if let Some(cursor) = options.get("cursor") {
            request.insert("cursor".into(), cursor.clone());
        }
        request.insert("limit".into(), js::number_json(limit));
        let owner = js::string(&access["vault_principal_id"]);
        let rows = self
            .ask(&owner, "stream:events", JsonValue::Object(request))
            .await?;
        let mut cache = HashMap::new();
        let mut projected = Vec::new();
        for event in rows.as_array().into_iter().flatten() {
            if let Some(visible) = self
                .project_stream_event(event, &access, &mut cache)
                .await?
            {
                projected.push(visible);
            }
        }
        Ok(projected)
    }

    // A subscription batch's replay page over the principal's own streams: one registry read
    // and one vault request (`streams:events`) for `[[stream_id, cursor], …]`. The streams it
    // does not own (shared, or unknown) are given back, replayed one by one through their access.
    pub async fn list_own_streams_events(
        &self,
        principal: &str,
        pairs: &[JsonValue],
    ) -> Result<(Vec<JsonValue>, Vec<String>), String> {
        let ids = unique(pairs.iter().map(|pair| js::string(&pair[0])));
        if ids.is_empty() {
            return Ok((Vec::new(), Vec::new()));
        }
        let rows = self
            .central
            .all(
                format!("SELECT stream_id FROM vault_stream_registry WHERE vault_principal_id = ? AND stream_id IN ({})", marks(ids.len())),
                std::iter::once(json!(principal)).chain(ids.iter().map(|id| json!(id))).collect(),
            )
            .await?;
        let own: HashSet<String> = rows
            .iter()
            .map(|row| js::string(&row["stream_id"]))
            .collect();
        let (mine, others): (Vec<&JsonValue>, Vec<&JsonValue>) = pairs
            .iter()
            .partition(|pair| own.contains(&js::string(&pair[0])));
        let others = unique(others.into_iter().map(|pair| js::string(&pair[0])));
        if mine.is_empty() {
            return Ok((Vec::new(), others));
        }
        let events = self
            .ask(
                principal,
                "streams:events",
                json!({ "streams": mine, "limit": 500 }),
            )
            .await?;
        let events = events
            .as_array()
            .into_iter()
            .flatten()
            .map(|event| js::with(event, [("vault_principal_id", json!(principal))]))
            .collect();
        Ok((events, others))
    }

    // The share, among those opening this stream, whose root holds the event's object.
    async fn share_covering_event(
        &self,
        event: &JsonValue,
        access: &JsonValue,
        cache: &mut HashMap<String, Option<JsonValue>>,
    ) -> Result<Option<JsonValue>, String> {
        let atome_id = js::id(event.get("atome_id"));
        if atome_id.is_empty() {
            return Ok(None);
        }
        if let Some(known) = cache.get(&atome_id) {
            return Ok(known.clone());
        }
        let owner = js::string(&access["vault_principal_id"]);
        let mut covering = None;
        for share in access
            .get("shares")
            .and_then(JsonValue::as_array)
            .into_iter()
            .flatten()
        {
            if self
                .within_shared_root(&owner, &atome_id, &js::id(share.get("atome_id")))
                .await?
            {
                covering = Some(share.clone());
                break;
            }
        }
        cache.insert(atome_id, covering.clone());
        Ok(covering)
    }

    pub async fn stream_head(
        &self,
        principal: &str,
        stream_id: &JsonValue,
    ) -> Result<JsonValue, String> {
        let access = self.stream_access(principal, Some(stream_id)).await?;
        let owner = access
            .as_ref()
            .map(|access| js::string(&access["vault_principal_id"]));
        match owner {
            Some(owner) if owner == principal => {
                self.ask(&owner, "stream:head", json!({ "stream_id": stream_id }))
                    .await
            }
            _ => Err("stream_owner_required".into()),
        }
    }

    async fn project_stream_event(
        &self,
        event: &JsonValue,
        access: &JsonValue,
        cache: &mut HashMap<String, Option<JsonValue>>,
    ) -> Result<Option<JsonValue>, String> {
        let owner = access
            .get("vault_principal_id")
            .cloned()
            .unwrap_or(JsonValue::Null);
        if truthy(access.get("owner")) {
            return Ok(Some(js::with(event, [("vault_principal_id", owner)])));
        }
        let Some(share) = self.share_covering_event(event, access, cache).await? else {
            return Ok(None);
        };
        if share.get("share_mode").and_then(JsonValue::as_str) == Some("manual") {
            let cursor = share
                .get("publication_cursor")
                .filter(|cursor| truthy(Some(cursor)));
            let cursor = cursor.map_or(0.0, |cursor| js::number(Some(cursor)));
            if js::number(event.get("sequence")) > cursor {
                return Ok(None);
            }
        }
        let payload = event
            .get("payload")
            .filter(|payload| payload.is_object())
            .cloned()
            .unwrap_or_else(|| json!({}));
        let allowed = shares::readable(&share);
        let visible = |key: &str| allowed.as_ref().is_none_or(|allowed| allowed.contains(key));
        let props = shares::filter_properties(payload.get("props"), &share);
        let delete_keys: Vec<JsonValue> = first(&payload, &["delete_keys", "deleteKeys"])
            .and_then(JsonValue::as_array)
            .into_iter()
            .flatten()
            .filter(|key| visible(&js::string(key)))
            .cloned()
            .collect();
        let decisions: JsonMap<String, JsonValue> = event
            .get("lww_decisions")
            .and_then(JsonValue::as_object)
            .into_iter()
            .flatten()
            .filter(|(key, _)| key.as_str() == "__lifecycle__" || visible(key))
            .map(|(key, value)| (key.clone(), value.clone()))
            .collect();
        let projection = match event.get("projection") {
            Some(projection) if projection.is_object() => js::with(
                projection,
                [(
                    "properties",
                    shares::filter_properties(projection.get("properties"), &share),
                )],
            ),
            _ => JsonValue::Null,
        };
        Ok(Some(js::with(
            event,
            [
                ("vault_principal_id", owner),
                (
                    "payload",
                    js::with(
                        &payload,
                        [
                            ("props", props),
                            ("delete_keys", JsonValue::Array(delete_keys)),
                        ],
                    ),
                ),
                ("lww_decisions", JsonValue::Object(decisions)),
                ("projection", projection),
            ],
        )))
    }

    pub async fn project_event_for_principal(
        &self,
        principal: &str,
        event: &JsonValue,
    ) -> Result<Option<JsonValue>, String> {
        let stream = first(event, &["stream_id", "stream"]);
        let Some(access) = self.stream_access(principal, stream).await? else {
            return Ok(None);
        };
        self.project_stream_event(event, &access, &mut HashMap::new())
            .await
    }
}
