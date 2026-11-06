// Booking a coach (server/coach_bookings.js, ported). A client asks for a session in a coach's
// free time; the request carries only what the client chose to send (the session's title, its
// time, a note) and the name of its public card. The coach alone sees the requests addressed to
// it, and accepts or refuses; once accepted, the session lands in both agendas as an event of each
// one's own vault. A cancellation follows the coach's delay and cancels both events. One coach's
// bookings move one at a time (`serial`): two requests for the same slot never both hold it.
use super::Coaches;
use super::contract::{self, Span};
use super::directory::HOLDING_STATES;
use crate::social::directory::Directory;
use crate::social::live;
use crate::social::shop::clip;
use crate::vault_router::js;
use serde_json::{Map as JsonMap, Value as JsonValue, json};

const EVENT_TYPE: &str = "calendar_event";
const MINUTE_MS: i64 = 60_000;
const TITLE_MAX: usize = 80;
const NOTE_MAX: usize = 600;

fn fail(error: &str) -> JsonValue {
    json!({ "ok": false, "error": error })
}

fn now() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

// What each side reads of a booking: the other's name, never the other's agenda.
fn entry_of(row: &JsonValue, side: &str) -> JsonValue {
    let peer = if side == "client" {
        &row["coach_name"]
    } else {
        &row["client_name"]
    };
    json!({ "id": row["booking_id"], "side": side, "state": row["state"], "coachId": row["coach_id"], "clientId": row["client_id"],
        "peer": peer, "title": row["title"], "note": row["note"], "startsAt": row["starts_at"], "endsAt": row["ends_at"],
        "minutes": row["minutes"], "cancelHours": row["cancel_hours"], "updatedAt": row["updated_at"] })
}

// Who may cancel a booking now (coach_contract.js#coachCancelRefusal): the client withdraws a
// request at any time and cancels an accepted session until its coach's delay before the start;
// the coach cancels until the start.
fn cancel_refusal(booking: &JsonValue, role: &str, now: i64) -> Option<&'static str> {
    let start = js::date(booking.get("starts_at"));
    let state = js::string(&booking["state"]);
    if !HOLDING_STATES.contains(&state.as_str()) {
        return Some("coach_booking_state_invalid");
    }
    let start = start? as f64;
    if now as f64 >= start {
        return Some("coach_booking_past");
    }
    let delay = js::number(booking.get("cancel_hours")) * 3_600_000.0;
    (role == "client" && state == "accepted" && now as f64 > start - delay)
        .then_some("coach_cancel_too_late")
}

impl Coaches {
    async fn booking(&self, id: Option<&JsonValue>) -> Result<Option<JsonValue>, String> {
        self.central
            .get(
                "SELECT * FROM coach_bookings WHERE booking_id = ?",
                vec![json!(clip(id, 80))],
            )
            .await
    }

    async fn step(
        &self,
        row: &JsonValue,
        action: &str,
        role: &str,
        actor: &str,
        to: &str,
        fields: &[(&str, JsonValue)],
    ) -> Result<Option<JsonValue>, String> {
        let id = row["booking_id"].clone();
        self.central
            .run(
                "INSERT INTO coach_booking_steps (booking_id, action, role, actor_id, from_state, to_state) VALUES (?, ?, ?, ?, ?, ?)",
                vec![id.clone(), json!(action), json!(role), json!(actor), row["state"].clone(), json!(to)],
            )
            .await?;
        let mut values = vec![json!(to)];
        let mut sets = String::new();
        for (column, value) in fields {
            sets.push_str(&format!("{column} = ?, "));
            values.push(value.clone());
        }
        values.push(id.clone());
        self.central
            .all(format!("UPDATE coach_bookings SET state = ?, {sets}updated_at = datetime('now') WHERE booking_id = ?"), values)
            .await?;
        self.booking(Some(&id)).await
    }

    // Both screens read again; the other side hears it in its notifications.
    async fn told(&self, row: &JsonValue, actor: &str, action: &str) -> Result<(), String> {
        let (coach, client) = (js::string(&row["coach_id"]), js::string(&row["client_id"]));
        for target in [&coach, &client] {
            let payload =
                json!({ "type": "coach-bookings-changed", "bookingId": row["booking_id"] });
            live::tell(target, &payload).await;
        }
        let target = if actor == coach { client } else { coach };
        let (id, state) = (js::string(&row["booking_id"]), js::string(&row["state"]));
        let notification = json!({ "kind": "coach-booking", "subject": clip(row.get("title"), 80), "message": action,
            "id": format!("coach_booking_{id}_{state}"),
            "extra": { "action": { "kind": "command", "toolId": "coaches.open", "input": { "booking_id": row["booking_id"] } },
                "booking_state": state } });
        self.notifier
            .notify(&target, Some(actor), &notification)
            .await
    }

    // A session as an event of `owner`'s own vault, or its cancellation.
    async fn write_event(
        &self,
        owner: &str,
        event_id: &str,
        props: JsonValue,
    ) -> Result<(), String> {
        let event = json!({ "kind": "set", "atome_id": event_id, "payload": { "props": props }, "actor": { "type": "user", "id": owner } });
        let entry = self
            .router
            .commit(owner, &event, &json!({ "source": "coaches" }))
            .await?;
        if entry["inserted"] == json!(true) {
            self.sync.publish(&entry["event"]).await?;
        }
        Ok(())
    }

    fn session_props(
        row: &JsonValue,
        title: &str,
        calendar: &JsonValue,
        timezone: &JsonValue,
        role: &str,
        place: &JsonValue,
    ) -> JsonValue {
        let at = js::iso(now());
        let booking = json!({ "booking_id": row["booking_id"], "role": role, "state": "accepted" });
        json!({ "type": EVENT_TYPE, "title": title, "description": row["note"], "location": place, "start": row["starts_at"],
            "end": row["ends_at"], "all_day": false, "calendar_id": calendar, "timezone": timezone, "kind": "event", "status": "open",
            "recurrence_id": "", "sequence": 0, "calendar_scope": "personal", "access": "private", "visibility": "private",
            "created_iso": at, "updated_iso": at, "booking": booking.to_string() })
    }

    // The client asks (`input`: coach_id, starts_at, minutes, title, note, calendar_id, timezone).
    pub(super) async fn request(
        &self,
        directory: &Directory,
        client: &str,
        input: &JsonValue,
    ) -> Result<JsonValue, String> {
        let coach = clip(input.get("coach_id"), 200);
        let start = js::date(Some(&json!(clip(input.get("starts_at"), 40))));
        let (false, Some(start)) = (coach.is_empty(), start) else {
            return Ok(fail("coach_booking_invalid"));
        };
        if coach == client {
            return Ok(fail("coach_own"));
        }
        if self.blocked(Some(client), &coach).await? {
            return Ok(fail("coach_not_found"));
        }
        let title = clip(input.get("title"), TITLE_MAX);
        if title.is_empty() {
            return Ok(fail("coach_title_required"));
        }
        let lock = self.serial(&coach);
        let _held = lock.lock().await;
        let Some(offered) = self.availability(&coach).await? else {
            return Ok(fail("coach_not_found"));
        };
        let coaching = &offered["coaching"];
        let minutes = crate::social::shop::contract::round(js::number_or(
            input.get("minutes"),
            js::number(coaching.get("slot_minutes")),
        ));
        let busy = Span::list(&offered["busy"]);
        if !contract::session_fits(coaching, &busy, start as f64, minutes, now() as f64)? {
            return Ok(fail("coach_slot_taken"));
        }
        let name = match directory.source_profile(client).await? {
            Some(profile) => profile.display_name,
            None => String::new(),
        };
        let id = uuid::Uuid::new_v4().to_string();
        let mut row = JsonMap::new();
        for (column, value) in [
            ("booking_id", json!(id)),
            ("coach_id", json!(coach)),
            ("client_id", json!(client)),
            ("coach_name", offered["name"].clone()),
            ("client_name", json!(clip(Some(&json!(name)), 80))),
            ("state", json!("requested")),
            ("starts_at", json!(js::iso(start))),
            (
                "ends_at",
                json!(js::iso(start + minutes as i64 * MINUTE_MS)),
            ),
            ("minutes", js::number_json(minutes)),
            ("cancel_hours", coaching["cancel_hours"].clone()),
            ("title", json!(title)),
            ("note", json!(clip(input.get("note"), NOTE_MAX))),
            (
                "client_calendar_id",
                json!(
                    Some(clip(input.get("calendar_id"), 200))
                        .filter(|c| !c.is_empty())
                        .unwrap_or_else(|| "default".into())
                ),
            ),
            (
                "client_timezone",
                Some(json!(clip(input.get("timezone"), 60)))
                    .filter(|z| z != "")
                    .unwrap_or_else(|| coaching["timezone"].clone()),
            ),
        ] {
            row.insert(column.into(), value);
        }
        let columns: Vec<&str> = row.keys().map(String::as_str).collect();
        let sql = format!(
            "INSERT INTO coach_bookings ({}) VALUES ({})",
            columns.join(", "),
            vec!["?"; columns.len()].join(", ")
        );
        self.central
            .all(sql, row.values().cloned().collect())
            .await?;
        self.central
            .run(
                "INSERT INTO coach_booking_steps (booking_id, action, role, actor_id, from_state, to_state) VALUES (?, 'request', 'client', ?, '', 'requested')",
                vec![json!(id), json!(client)],
            )
            .await?;
        let stored = self
            .booking(Some(&json!(id)))
            .await?
            .ok_or("coach_booking_lost")?;
        self.told(&stored, client, "requested").await?;
        Ok(json!({ "ok": true, "booking": entry_of(&stored, "client") }))
    }

    // The coach answers a request: accepted (both events written), or refused. `title`: the
    // coach's own event's title.
    pub(super) async fn answer(
        &self,
        coach: &str,
        message: &JsonValue,
    ) -> Result<JsonValue, String> {
        let accept = message.get("accept") == Some(&json!(true));
        let row = self.booking(message.get("bookingId")).await?;
        if !row.is_some_and(|row| row["coach_id"] == json!(coach)) {
            return Ok(fail("coach_booking_not_found"));
        }
        let title = clip(message.get("title"), TITLE_MAX);
        if accept && title.is_empty() {
            return Ok(fail("coach_title_required"));
        }
        let lock = self.serial(coach);
        let _held = lock.lock().await;
        let current = self
            .booking(message.get("bookingId"))
            .await?
            .ok_or("coach_booking_lost")?;
        if current["state"] != json!("requested") {
            return Ok(fail("coach_booking_state_invalid"));
        }
        if !accept {
            let refused = self
                .step(&current, "refuse", "coach", coach, "refused", &[])
                .await?
                .ok_or("coach_booking_lost")?;
            self.told(&refused, coach, "refused").await?;
            return Ok(json!({ "ok": true, "booking": entry_of(&refused, "coach") }));
        }
        if js::date(current.get("starts_at")).is_some_and(|start| start <= now()) {
            return Ok(fail("coach_booking_past"));
        }
        let Some(offered) = self.availability(coach).await? else {
            return Ok(fail("coach_not_found"));
        };
        let (coaching, client) = (&offered["coaching"], js::string(&current["client_id"]));
        let (coach_event, client_event) = (
            uuid::Uuid::new_v4().to_string(),
            uuid::Uuid::new_v4().to_string(),
        );
        let props = Self::session_props(
            &current,
            &title,
            &offered["calendarId"],
            &coaching["timezone"],
            "coach",
            &coaching["place"],
        );
        self.write_event(coach, &coach_event, props).await?;
        let own = js::string(&current["title"]);
        let props = Self::session_props(
            &current,
            &own,
            &current["client_calendar_id"],
            &current["client_timezone"],
            "client",
            &coaching["place"],
        );
        self.write_event(&client, &client_event, props).await?;
        let fields = [
            ("coach_event_id", json!(coach_event)),
            ("client_event_id", json!(client_event)),
        ];
        let accepted = self
            .step(&current, "accept", "coach", coach, "accepted", &fields)
            .await?
            .ok_or("coach_booking_lost")?;
        self.told(&accepted, coach, "accepted").await?;
        Ok(json!({ "ok": true, "booking": entry_of(&accepted, "coach") }))
    }

    // Either side cancels, within the coach's rules; an accepted session's two events are
    // cancelled with it.
    pub(super) async fn cancel(
        &self,
        user: &str,
        message: &JsonValue,
    ) -> Result<JsonValue, String> {
        let Some(row) = self.booking(message.get("bookingId")).await? else {
            return Ok(fail("coach_booking_not_found"));
        };
        let role = if row["coach_id"] == json!(user) {
            "coach"
        } else if row["client_id"] == json!(user) {
            "client"
        } else {
            return Ok(fail("coach_booking_not_found"));
        };
        let lock = self.serial(&js::string(&row["coach_id"]));
        let _held = lock.lock().await;
        let current = self
            .booking(message.get("bookingId"))
            .await?
            .ok_or("coach_booking_lost")?;
        if let Some(refusal) = cancel_refusal(&current, role, now()) {
            return Ok(fail(refusal));
        }
        for (owner, event, side) in [
            ("coach_id", "coach_event_id", "coach"),
            ("client_id", "client_event_id", "client"),
        ] {
            let event = js::string(&current[event]);
            if event.is_empty() {
                continue;
            }
            let booking =
                json!({ "booking_id": current["booking_id"], "role": side, "state": "cancelled" });
            let props = json!({ "status": "cancelled", "updated_iso": js::iso(now()), "booking": booking.to_string() });
            self.write_event(&js::string(&current[owner]), &event, props)
                .await?;
        }
        let cancelled = self
            .step(&current, "cancel", role, user, "cancelled", &[])
            .await?
            .ok_or("coach_booking_lost")?;
        self.told(&cancelled, user, "cancelled").await?;
        Ok(json!({ "ok": true, "booking": entry_of(&cancelled, role) }))
    }

    // The bookings of one side: a coach's requests and sessions (`coach`), a client's own
    // (`client`), the coming ones first.
    pub(super) async fn list(
        &self,
        user: &str,
        side: Option<&JsonValue>,
    ) -> Result<JsonValue, String> {
        let side = if side == Some(&json!("coach")) {
            "coach"
        } else {
            "client"
        };
        let rows = self
            .central
            .all(
                format!("SELECT * FROM coach_bookings WHERE {side}_id = ? ORDER BY (ends_at < ?), starts_at LIMIT 200"),
                vec![json!(user), json!(js::iso(now()))],
            )
            .await?;
        let items: Vec<JsonValue> = rows.iter().map(|row| entry_of(row, side)).collect();
        Ok(json!({ "ok": true, "items": items }))
    }
}
