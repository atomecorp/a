// The coaches' shared directory (server/coach_directory.js, ported): everyone searches it,
// visitor and guest included. The truth is the coach's own coaching agenda, a `calendar` Atome
// of its vault carrying `coaching`; `coach_directory` only projects a public one after every
// commit that touches it. The free slots are read at once from the coach's vault: its weekly
// hours and unavailabilities, less its own timed events (their titles never leave the vault) and
// the bookings holding a slot. The coaching's shape, its zone arithmetic and the slots are the
// coach contract (contract.rs, the port of atome/src/shared/coach_contract.js); a coach's own events
// are read by the calendar engine (crate::calendar).
use super::Coaches;
use super::contract::{self, Span};
use crate::social::live;
use crate::social::shop::{clip, parse};
use crate::vault_router::js;
use serde_json::{Map as JsonMap, Value as JsonValue, json};

const CALENDAR_TYPE: &str = "calendar";
const EVENT_TYPE: &str = "calendar_event";
const PAGE_SIZE: usize = 34;
pub(super) const DAY_MS: i64 = 86_400_000;
const HORIZON_DAYS: i64 = 21;
const BUSY_LIMIT: usize = 2000;
pub(super) const HOLDING_STATES: [&str; 2] = ["requested", "accepted"];

pub(super) fn deleted(properties: Option<&JsonValue>) -> bool {
    properties.is_some_and(|p| {
        p.get("__deleted") == Some(&json!(true)) || p.get("deleted") == Some(&json!(true))
    })
}

// `parse(value) || fallback`.
fn parsed_or(value: Option<&JsonValue>, fallback: JsonValue) -> JsonValue {
    let value = parse(value);
    if js::truthy(Some(&value)) {
        value
    } else {
        fallback
    }
}

// `value || fallback` of a property.
fn or(value: Option<&JsonValue>, fallback: JsonValue) -> JsonValue {
    value
        .filter(|value| js::truthy(Some(value)))
        .cloned()
        .unwrap_or(fallback)
}

// A stored event as the occurrence reader needs it (no title: a coach's own events only say
// « busy »).
fn event_of(state: &JsonValue) -> JsonValue {
    let empty = json!({});
    let p = state
        .get("properties")
        .filter(|p| js::truthy(Some(p)))
        .unwrap_or(&empty);
    let id = js::first(state, &["atome_id", "id"])
        .map(js::string)
        .unwrap_or_else(|| "undefined".into());
    let mut event = JsonMap::new();
    event.insert("id".into(), json!(id));
    event.insert(
        "exchange_uid".into(),
        or(p.get("exchange_uid"), JsonValue::Null),
    );
    event.insert("calendarId".into(), or(p.get("calendar_id"), json!("")));
    for (key, name) in [("start", "start"), ("end", "end")] {
        if let Some(value) = p.get(name) {
            event.insert(key.into(), value.clone());
        }
    }
    event.insert(
        "allDay".into(),
        json!(p.get("all_day") == Some(&json!(true))),
    );
    event.insert(
        "kind".into(),
        json!(if p.get("kind") == Some(&json!("todo")) {
            "todo"
        } else {
            "event"
        }),
    );
    event.insert("status".into(), or(p.get("status"), json!("open")));
    event.insert(
        "recurrence".into(),
        parsed_or(p.get("recurrence"), JsonValue::Null),
    );
    event.insert(
        "recurrence_id".into(),
        or(p.get("recurrence_id"), json!("")),
    );
    event.insert("exdates".into(), parsed_or(p.get("exdates"), json!([])));
    event.insert("rdates".into(), parsed_or(p.get("rdates"), json!([])));
    event.insert(
        "icalendar".into(),
        parsed_or(p.get("icalendar"), JsonValue::Null),
    );
    event.insert("timezone".into(), or(p.get("timezone"), json!("")));
    JsonValue::Object(event)
}

// A coach as the reader receives it: what the coach chose to show, the quality said as declared.
fn entry_of(found: &JsonValue) -> JsonValue {
    let coaching = parsed_or(found.get("payload_json"), json!({}));
    let mut entry = JsonMap::new();
    entry.insert("coachId".into(), json!(js::string(&found["coach_id"])));
    entry.insert("name".into(), found["name"].clone());
    entry.insert("quality".into(), found["quality"].clone());
    entry.insert("declared".into(), json!(true));
    entry.insert(
        "specialties".into(),
        or(coaching.get("specialties"), json!([])),
    );
    entry.insert("place".into(), or(coaching.get("place"), json!("")));
    for (key, name) in [
        ("timezone", "timezone"),
        ("slotMinutes", "slot_minutes"),
        ("cancelHours", "cancel_hours"),
    ] {
        if let Some(value) = coaching.get(name) {
            entry.insert(key.into(), value.clone());
        }
    }
    JsonValue::Object(entry)
}

impl Coaches {
    async fn listed(&self, coach_id: &str) -> Result<Option<JsonValue>, String> {
        self.central
            .get(
                "SELECT * FROM coach_directory WHERE coach_id = ?",
                vec![json!(coach_id)],
            )
            .await
    }

    // Every open screen hears a coach changed.
    async fn changed(coach_id: &str) {
        let payload = json!({ "type": "coaches-changed", "coachId": coach_id });
        live::broadcast(&payload).await;
    }

    // The coaching of an agenda as the contract reads it, with why it cannot be listed.
    pub(super) fn coaching(value: Option<&JsonValue>) -> (JsonValue, JsonValue) {
        let coaching = contract::normalize_coaching(value.unwrap_or(&JsonValue::Null));
        let refusal = contract::coaching_error(&coaching).map_or(JsonValue::Null, JsonValue::from);
        (coaching, refusal)
    }

    async fn leave(&self, coach_id: &str, calendar_id: &str) -> Result<(), String> {
        let Some(existing) = self.listed(coach_id).await? else {
            return Ok(());
        };
        if !calendar_id.is_empty() && js::string(&existing["calendar_id"]) != calendar_id {
            return Ok(());
        }
        self.central
            .run(
                "DELETE FROM coach_directory WHERE coach_id = ?",
                vec![json!(coach_id)],
            )
            .await?;
        Self::changed(coach_id).await;
        Ok(())
    }

    // After a commit touching `calendar_id` (in `coach_id`'s vault): the directory follows the
    // agenda. One coaching per account: the last one made public is the account's.
    async fn project(&self, coach_id: &str, calendar_id: &str) -> Result<(), String> {
        let state = self.router.get_state(coach_id, &json!(calendar_id)).await?;
        let properties = state.get("properties").filter(|p| js::truthy(Some(p)));
        let (coaching, refusal) = Self::coaching(properties.and_then(|p| p.get("coaching")));
        let kind = state
            .get("type")
            .filter(|kind| js::truthy(Some(kind)))
            .map(js::string)
            .unwrap_or_default();
        if !js::truthy(Some(&state))
            || kind.to_lowercase() != CALENDAR_TYPE
            || deleted(properties)
            || coaching.get("visibility") != Some(&json!("public"))
            || js::truthy(Some(&refusal))
        {
            return self.leave(coach_id, calendar_id).await;
        }
        let mut words = vec![js::text(coaching.get("name"))];
        words.extend(
            coaching["specialties"]
                .as_array()
                .into_iter()
                .flatten()
                .map(|item| js::text(Some(item))),
        );
        words.push(js::text(coaching.get("place")));
        self.central
            .run(
                "INSERT INTO coach_directory (coach_id, calendar_id, name, quality, words, payload_json) VALUES (?, ?, ?, ?, ?, ?)
                 ON CONFLICT(coach_id) DO UPDATE SET calendar_id = excluded.calendar_id, name = excluded.name, quality = excluded.quality,
                 words = excluded.words, payload_json = excluded.payload_json, updated_at = datetime('now')",
                vec![
                    json!(coach_id),
                    json!(calendar_id),
                    coaching["name"].clone(),
                    coaching["quality"].clone(),
                    json!(words.join(" ").to_lowercase()),
                    json!(coaching.to_string()),
                ],
            )
            .await?;
        Self::changed(coach_id).await;
        Ok(())
    }

    /// The commits of one request: each one carrying `coaching`, or an agenda already listed.
    pub async fn after_commit(&self, events: &[JsonValue]) -> Result<(), String> {
        for event in events {
            let atome_id = clip(event.get("atome_id"), 200);
            if atome_id.is_empty() {
                continue;
            }
            let payload = event.get("payload");
            let props = payload
                .and_then(|payload| payload.get("props"))
                .filter(|props| js::truthy(Some(props)))
                .or(payload.filter(|payload| js::truthy(Some(payload))));
            let named = props.is_some_and(|props| props.get("coaching").is_some());
            if !named
                && self
                    .central
                    .get(
                        "SELECT coach_id FROM coach_directory WHERE calendar_id = ?",
                        vec![json!(atome_id)],
                    )
                    .await?
                    .is_none()
            {
                continue;
            }
            if let Some(owner) = self.router.owner_of(&atome_id).await? {
                self.project(&owner, &atome_id).await?;
            }
        }
        Ok(())
    }

    async fn visible(
        &self,
        rows: &[JsonValue],
        viewer: Option<&str>,
    ) -> Result<Vec<JsonValue>, String> {
        let mut kept = Vec::new();
        for found in rows {
            if self
                .blocked(viewer, &js::string(&found["coach_id"]))
                .await?
            {
                continue;
            }
            kept.push(entry_of(found));
        }
        Ok(kept)
    }

    // Searching: by a name, a specialty or a place (« yoga »), in the order of the names; a page
    // at a time.
    pub(super) async fn browse(
        &self,
        message: &JsonValue,
        viewer: Option<&str>,
    ) -> Result<JsonValue, String> {
        let query = clip(message.get("query"), 80).to_lowercase();
        let (mut filters, mut values) = (Vec::new(), Vec::new());
        for word in query.split_whitespace().take(5) {
            filters.push("words LIKE ?");
            values.push(json!(format!("%{}%", word.replace(['%', '_'], ""))));
        }
        let offset = crate::social::shop::contract::round(js::number(message.get("offset")));
        let start = if offset.is_nan() {
            0.0
        } else {
            offset.max(0.0)
        };
        values.extend([json!(PAGE_SIZE + 1), js::number_json(start)]);
        let filter = if filters.is_empty() {
            String::new()
        } else {
            format!("WHERE {}", filters.join(" AND "))
        };
        let rows = self
            .central
            .all(format!("SELECT * FROM coach_directory {filter} ORDER BY name COLLATE NOCASE, coach_id LIMIT ? OFFSET ?"), values)
            .await?;
        let entries = self
            .visible(&rows[..rows.len().min(PAGE_SIZE)], viewer)
            .await?;
        let next = if rows.len() > PAGE_SIZE {
            (start as i64 + PAGE_SIZE as i64).to_string()
        } else {
            String::new()
        };
        Ok(json!({ "entries": entries, "next": next }))
    }

    pub(super) async fn one(
        &self,
        coach_id: Option<&JsonValue>,
        viewer: Option<&str>,
    ) -> Result<JsonValue, String> {
        let found = self.listed(&clip(coach_id, 200)).await?;
        let entries = match found {
            Some(found) => self.visible(&[found], viewer).await?,
            None => Vec::new(),
        };
        Ok(json!({ "entries": entries, "next": "" }))
    }

    /// What a listed coach offers now: its coaching (read again from its vault) and what keeps
    /// it busy over the horizon.
    pub(super) async fn availability(&self, coach_id: &str) -> Result<Option<JsonValue>, String> {
        let Some(found) = self.listed(&js::slice(js::trim(coach_id), 200)).await? else {
            return Ok(None);
        };
        let (coach, calendar) = (
            js::string(&found["coach_id"]),
            js::string(&found["calendar_id"]),
        );
        let state = self.router.get_state(&coach, &json!(calendar)).await?;
        let (coaching, refusal) =
            Self::coaching(state.get("properties").and_then(|p| p.get("coaching")));
        if !js::truthy(Some(&coaching))
            || coaching.get("visibility") != Some(&json!("public"))
            || js::truthy(Some(&refusal))
        {
            return Ok(None);
        }
        let now = chrono::Utc::now().timestamp_millis();
        let (from, until) = (now - DAY_MS, now + HORIZON_DAYS * DAY_MS);
        let states = self
            .router
            .list_states(&coach, &json!({ "atomeType": EVENT_TYPE, "limit": 5000 }))
            .await?;
        let events: Vec<JsonValue> = states
            .as_array()
            .into_iter()
            .flatten()
            .filter(|item| !deleted(item.get("properties")))
            .map(event_of)
            .filter(|event| event["kind"] == json!("event") && event["allDay"] == json!(false))
            .collect();
        // What keeps the coach busy: its timed events' occurrences (an end missing as its start).
        let range = atome_calendar::Range {
            from: Some(from as f64),
            until: Some(until as f64),
            ..Default::default()
        };
        let mut busy: Vec<JsonValue> = atome_calendar::range_occurrences(
            &events, &range, BUSY_LIMIT,
        )?
        .into_iter()
        .map(|occurrence| {
            let end = occurrence.end.unwrap_or(occurrence.start);
            json!({ "start": js::number_json(occurrence.start), "end": js::number_json(end) })
        })
        .collect();
        let mut values = vec![json!(coach)];
        values.extend(HOLDING_STATES.iter().map(|state| json!(state)));
        values.push(json!(js::iso(from)));
        let held = self
            .central
            .all("SELECT starts_at, ends_at FROM coach_bookings WHERE coach_id = ? AND state IN (?, ?) AND ends_at > ?".into(), values)
            .await?;
        busy.extend(held.iter().map(|item| json!({ "start": js::date(item.get("starts_at")), "end": js::date(item.get("ends_at")) })));
        Ok(Some(
            json!({ "coachId": coach, "calendarId": calendar, "name": found["name"], "coaching": coaching, "busy": busy }),
        ))
    }

    pub(super) async fn slots(
        &self,
        coach_id: Option<&JsonValue>,
        viewer: Option<&str>,
    ) -> Result<JsonValue, String> {
        let listed = self.one(coach_id, viewer).await?;
        let entry = listed["entries"].get(0).cloned();
        let offered = match &entry {
            Some(entry) => self.availability(&js::string(&entry["coachId"])).await?,
            None => None,
        };
        let (Some(entry), Some(offered)) = (entry, offered) else {
            return Ok(json!({ "ok": false, "error": "coach_not_found" }));
        };
        let now = chrono::Utc::now().timestamp_millis();
        let slots = contract::free_slots(
            &offered["coaching"],
            &Span::list(&offered["busy"]),
            now as f64,
        )?;
        Ok(json!({ "ok": true, "coach": entry, "slots": slots }))
    }
}
