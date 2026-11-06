// Public events (server/public_events.js, ported; todo/evenements_publics_2026-10-26.md): the
// events users declared, shown to everyone in the Activité rubrics around their place. The truth is
// the author's `calendar_event` Atome in their vault (its `publication` property); this only
// PROJECTS it into the shared base (store.rs) after every commit that touches it, and writes its
// word back on the Atome (`publication_status`: live, refused with a reason, hidden). Nothing a
// client sends is believed without reading the vault. The recurrence owner is the server's calendar
// engine (crate::calendar, the port of atome/src/squirrel/calendar/icalendar.js); every open screen
// hears which cells changed (social/live.rs). Reading the base stays with `shows-nearby` (server/ws_shows.js).
pub mod contract;
pub mod reading;
pub mod store;

use super::directory::Directory;
use crate::vault_router::VaultRouter;
use crate::vault_router::central::Central;
use crate::vault_router::js;
use crate::vault_router::js::iso;
use crate::ws_sync::SyncRuntime;
use atome_calendar::js_date;
use contract::{clip, parse};
use serde_json::{Value as JsonValue, json};
use std::sync::Arc;
use store::{Occurrence, REPORTS_TO_HIDE, Series, Store};

const EVENT_TYPE: &str = "calendar_event";
const DAY_MS: i64 = 24 * 3600 * 1000;
const OCCURRENCES_LIMIT: usize = 200;

// `list(value)`: a JSON array, else none.
fn list(value: Option<&JsonValue>) -> JsonValue {
    match parse(value) {
        JsonValue::Array(items) => JsonValue::Array(items),
        _ => json!([]),
    }
}

// `parse(value) || null`.
fn parsed_or_null(value: Option<&JsonValue>) -> JsonValue {
    let value = parse(value);
    if js::truthy(Some(&value)) {
        value
    } else {
        JsonValue::Null
    }
}

// `eventOf(id, properties)`: the calendar event as the recurrence owner reads it.
fn event_of(id: &str, properties: &JsonValue) -> JsonValue {
    let mut event = serde_json::Map::new();
    event.insert("id".into(), json!(id));
    event.insert("title".into(), json!(clip(properties.get("title"), 200)));
    if let Some(start) = properties.get("start") {
        event.insert("start".into(), start.clone());
    }
    let end = properties.get("end").filter(|end| js::truthy(Some(end)));
    event.insert("end".into(), end.cloned().unwrap_or(JsonValue::Null));
    let all_day = matches!(properties.get("all_day"), Some(JsonValue::Bool(true)))
        || properties.get("all_day") == Some(&json!("true"));
    event.insert("allDay".into(), json!(all_day));
    let timezone = properties.get("timezone").filter(|zone| !zone.is_null());
    event.insert("timezone".into(), timezone.cloned().unwrap_or(json!("")));
    event.insert(
        "recurrence".into(),
        parsed_or_null(properties.get("recurrence")),
    );
    event.insert("rdates".into(), list(properties.get("rdates")));
    event.insert("exdates".into(), list(properties.get("exdates")));
    event.insert(
        "icalendar".into(),
        parsed_or_null(properties.get("icalendar")),
    );
    let status = clip(properties.get("status"), 20);
    event.insert(
        "status".into(),
        json!(if status.is_empty() {
            "open".into()
        } else {
            status
        }),
    );
    event.insert("alarms".into(), json!([]));
    JsonValue::Object(event)
}

// The cell of a stored payload's place, when it has one.
fn cell_of(payload: &JsonValue) -> Option<i64> {
    let place = payload
        .get("place")
        .filter(|place| js::truthy(Some(place)))?;
    Some(contract::cell(place.get("lat"), place.get("lon")))
}

pub struct PublicEvents {
    store: Store,
    router: Arc<VaultRouter>,
    sync: Arc<SyncRuntime>,
}

impl PublicEvents {
    pub fn new(central: Central, router: Arc<VaultRouter>, sync: Arc<SyncRuntime>) -> Self {
        Self {
            store: Store::new(central),
            router,
            sync,
        }
    }

    async fn state_of(&self, owner: &str, atome_id: &str) -> JsonValue {
        // `getState(...).catch(() => null)`.
        self.router
            .get_state(owner, &json!(atome_id))
            .await
            .unwrap_or(JsonValue::Null)
    }

    // Every open screen hears which cells changed.
    async fn changed(cells: Vec<i64>) {
        let mut unique: Vec<i64> = Vec::new();
        for cell in cells {
            if !unique.contains(&cell) {
                unique.push(cell);
            }
        }
        if unique.is_empty() {
            return;
        }
        let payload = json!({ "type": "public-events-changed", "cells": unique });
        super::live::broadcast(&payload).await;
    }

    // The server's word written on the author's Atome, when it changes.
    async fn write_status(
        &self,
        owner: &str,
        atome_id: &str,
        properties: &JsonValue,
        status: &str,
        reason: Option<&str>,
    ) -> Result<(), String> {
        let previous = contract::status(properties.get("publication_status"));
        if previous
            .as_ref()
            .is_some_and(|(was, why)| was == status && why.as_deref() == reason)
        {
            return Ok(());
        }
        let word = json!({ "status": status, "reason": reason, "at": iso(chrono::Utc::now().timestamp_millis()) });
        let event = json!({ "kind": "set", "atome_id": atome_id,
            "payload": { "props": { "publication_status": word.to_string() } },
            "actor": { "type": "user", "id": owner } });
        let entry = self
            .router
            .commit(owner, &event, &json!({ "source": "public-events" }))
            .await?;
        if entry["inserted"] == json!(true) {
            self.sync.publish(&entry["event"]).await?;
        }
        Ok(())
    }

    async fn leave(&self, atome_id: &str) -> Result<(), String> {
        let Some(existing) = self.store.series(atome_id).await? else {
            return Ok(());
        };
        self.store.remove(atome_id).await?;
        let payload = parse(existing.get("payload_json"));
        Self::changed(cell_of(&payload).into_iter().collect()).await;
        Ok(())
    }

    /// After a commit touching `atome_id` (in `owner`'s vault): the base follows the Atome.
    pub async fn project(
        &self,
        directory: &Directory,
        owner: &str,
        atome_id: &str,
    ) -> Result<(), String> {
        let state = self.state_of(owner, atome_id).await;
        let properties = state
            .get("properties")
            .filter(|p| js::truthy(Some(p)))
            .cloned()
            .unwrap_or(json!({}));
        let existing = self.store.series(atome_id).await?;
        let kind = state
            .get("type")
            .filter(|kind| js::truthy(Some(kind)))
            .map(js::string)
            .unwrap_or_default();
        if !js::truthy(Some(&state))
            || kind.to_lowercase() != EVENT_TYPE
            || properties.get("__deleted") == Some(&json!(true))
        {
            return self.leave(atome_id).await;
        }
        let Some(publication) = contract::publication(properties.get("publication"))
            .filter(|publication| publication["visibility"] == "public")
        else {
            return self.leave(atome_id).await;
        };
        let event = event_of(atome_id, &properties);
        let now = chrono::Utc::now().timestamp_millis();
        let until = now + contract::HORIZON_DAYS * DAY_MS;
        // Whether its start is a date, and its occurrences over the horizon (their dates written by
        // `toISOString`, an end missing as its start).
        let valid_start = js::truthy(event.get("start")) && js::date(event.get("start")).is_some();
        let range = atome_calendar::Range {
            from: Some(now as f64),
            until: Some(until as f64),
            ..Default::default()
        };
        let calendar = atome_calendar::range_occurrences(
            std::slice::from_ref(&event),
            &range,
            OCCURRENCES_LIMIT,
        )
        .and_then(|found| {
            found
                .into_iter()
                .map(|occurrence| {
                    let start = js_date::iso(occurrence.start)?;
                    let end = js_date::iso(occurrence.end.unwrap_or(occurrence.start))?;
                    Ok(Occurrence {
                        id: format!("{atome_id}@{start}"),
                        start,
                        end,
                    })
                })
                .collect::<Result<Vec<Occurrence>, String>>()
        });
        if contract::error(&publication, &js::string(&event["title"]), valid_start).is_some()
            || event["status"] == "cancelled"
        {
            self.leave(atome_id).await?;
            return self
                .write_status(owner, atome_id, &properties, "refused", Some("invalid"))
                .await;
        }
        if existing
            .as_ref()
            .is_some_and(|existing| js::truthy(existing.get("hidden_at")))
        {
            return self
                .write_status(owner, atome_id, &properties, "hidden", Some("reported"))
                .await;
        }
        if existing.is_none()
            && let Some(refused) = self.store.admit(owner, now).await?
        {
            return self
                .write_status(owner, atome_id, &properties, "refused", Some(refused))
                .await;
        }
        let occurrences = calendar?;
        let recurring = js::truthy(event.get("recurrence"))
            || event["rdates"]
                .as_array()
                .is_some_and(|dates| !dates.is_empty());
        let place = &publication["place"];
        if occurrences.is_empty() {
            self.leave(atome_id).await?;
            return self
                .write_status(owner, atome_id, &properties, "refused", Some("past"))
                .await;
        }
        let payload = json!({ "title": event["title"], "summary": publication["presentation"], "allDay": event["allDay"],
            "recurring": recurring, "categories": publication["categories"], "place": place,
            "price": publication["price"], "poster": publication["poster"], "ticketUrl": publication["ticket_url"],
            "url": publication["url"] });
        // `findUserName`: the name the account shares on its public card.
        let name = match directory.source_profile(owner).await {
            Ok(Some(profile)) => profile.display_name,
            _ => String::new(),
        };
        let cell = contract::cell(place.get("lat"), place.get("lon"));
        self.store
            .put(Series {
                event_id: atome_id.to_string(),
                author_id: owner.to_string(),
                author_name: clip(Some(&json!(name)), 80),
                payload,
                occurrences,
                projected_until: recurring.then(|| iso(until)),
            })
            .await?;
        let previous = existing
            .map(|existing| parse(existing.get("payload_json")))
            .as_ref()
            .and_then(cell_of);
        Self::changed(std::iter::once(cell).chain(previous).collect()).await;
        self.write_status(owner, atome_id, &properties, "live", None)
            .await
    }

    /// The commits of one request: each `calendar_event` with a publication, or already in the base.
    pub async fn after_commit(
        &self,
        directory: &Directory,
        events: &[JsonValue],
    ) -> Result<(), String> {
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
            let named = props.is_some_and(|props| props.get("publication").is_some());
            if !named && self.store.series(&atome_id).await?.is_none() {
                continue;
            }
            if let Some(owner) = self.router.owner_of(&atome_id).await? {
                self.project(directory, &owner, &atome_id).await?;
            }
        }
        Ok(())
    }

    // A report by an account (never on their own event); three distinct ones hide the event.
    async fn report(
        &self,
        viewer: &str,
        event_id: &str,
        reason: &str,
    ) -> Result<JsonValue, String> {
        let Some(existing) = self.store.series(&js::slice(event_id, 200)).await? else {
            return Ok(json!({ "ok": false, "error": "events_not_found" }));
        };
        let (id, author) = (
            js::string(&existing["event_id"]),
            js::string(&existing["author_id"]),
        );
        if author == viewer {
            return Ok(json!({ "ok": false, "error": "events_own_event" }));
        }
        let reason = if contract::REPORT_REASONS.contains(&reason) {
            reason
        } else {
            "other"
        };
        let total = self.store.report(&id, viewer, reason).await?;
        if total >= REPORTS_TO_HIDE && !js::truthy(existing.get("hidden_at")) {
            self.store.hide(&id).await?;
            let state = self.state_of(&author, &id).await;
            if js::truthy(Some(&state)) {
                let properties = state
                    .get("properties")
                    .filter(|p| js::truthy(Some(p)))
                    .cloned()
                    .unwrap_or(json!({}));
                self.write_status(&author, &id, &properties, "hidden", Some("reported"))
                    .await?;
            }
            let payload = parse(existing.get("payload_json"));
            Self::changed(cell_of(&payload).into_iter().collect()).await;
        }
        Ok(json!({ "ok": true }))
    }

    /// The `public-events` frame of `/ws/api` (an account only): `report`.
    pub async fn handle(&self, message: &JsonValue, viewer: &str) -> Result<JsonValue, String> {
        if clip(message.get("action"), 40) != "report" {
            return Ok(json!({ "ok": false, "error": "events_action_invalid" }));
        }
        let event_id = js::first(message, &["eventId"]).or_else(|| message.get("event_id"));
        let reason = clip(message.get("reason"), 40);
        self.report(viewer, &clip(event_id, 200), &reason).await
    }
}
