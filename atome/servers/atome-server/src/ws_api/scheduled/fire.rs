// A scheduled send leaving (scheduled_sends.js `fire`, `tick`, `start`, ported): taken once, run
// through each channel, its outcome stored and told to its owner (a notice when late or refused),
// and the clock that leaves each send at its time.
use super::super::WsApi;
use super::{ARMED, channels, or_null, parse, public_row, store, text, truthy};
use crate::settings::Settings;
use crate::social::live;
use crate::vault_router::js;
use serde_json::{Value as JsonValue, json};
use std::sync::Arc;
use std::time::Duration;

const LATE_MS: i64 = 2 * 60_000;

// `{ ok: true, news_id }`, or the failure's message.
fn published(outcome: Result<JsonValue, String>, to: Option<String>) -> JsonValue {
    let mut entry = match outcome {
        Ok(published) => json!({ "ok": true, "news_id": or_null(&published["news_id"]) }),
        Err(error) => json!({ "ok": false, "error": error }),
    };
    if let Some(to) = to {
        let mut named = json!({ "to": to });
        if let (Some(named), Some(fields)) = (named.as_object_mut(), entry.as_object()) {
            named.extend(fields.clone());
        }
        entry = named;
    }
    entry
}

// Each channel through its live path; one failing never stops the others.
async fn run(ws_api: &Arc<WsApi>, row: &JsonValue) -> Result<JsonValue, String> {
    let payload = parse(&row["payload_json"], json!({}));
    let owner = js::text(row.get("owner_id"));
    let mut result = json!({ "news": null, "forums": [], "messages": [], "social": null });
    if truthy(payload.get("news")) {
        result["news"] = published(channels::news(ws_api, &owner, &payload["news"]).await, None);
    }
    let mut forums = Vec::new();
    for entry in payload["forums"].as_array().into_iter().flatten() {
        let mut entry = entry.clone();
        let name = entry
            .as_object_mut()
            .and_then(|fields| fields.shift_remove("name"));
        let outcome = channels::news(ws_api, &owner, &entry).await;
        forums.push(published(outcome, Some(text(name.as_ref()))));
    }
    result["forums"] = json!(forums);
    let mut messages = Vec::new();
    for entry in payload["messages"].as_array().into_iter().flatten() {
        let to_user = entry.get("toUserId").filter(|to| truthy(Some(to)));
        let to = text(to_user.or(entry.get("toPhone")));
        messages.push(match channels::message(ws_api, &owner, entry).await {
            Ok(sent) => json!({ "to": to, "ok": true, "message_id": sent["message_id"] }),
            Err(error) => json!({ "to": to, "ok": false, "error": error }),
        });
    }
    result["messages"] = json!(messages);
    if truthy(payload.get("social")) {
        let social = &payload["social"];
        let deliveries = if row["kind"] == "update" {
            // An update reaches the posts its parent published, in place (Q4).
            let parent = store(ws_api).get(&js::text(row.get("parent_id"))).await?;
            let result = parse(&parent.unwrap_or_default()["result_json"], JsonValue::Null);
            let parent = result
                .pointer("/social/deliveries")
                .and_then(JsonValue::as_array)
                .cloned()
                .unwrap_or_default();
            channels::social_update(ws_api, &owner, social, &parent).await
        } else {
            channels::social_publish(ws_api, &owner, social).await
        };
        result["social"] = match deliveries {
            Ok(deliveries) => json!({ "ok": true, "deliveries": deliveries }),
            Err(error) => json!({ "ok": false, "error": error, "deliveries": [] }),
        };
    }
    Ok(result)
}

fn failed_delivery(delivery: &JsonValue) -> bool {
    js::truthy(delivery.get("error")) || delivery["status"] == "failed"
}

// The networks count one by one (their channel itself only when it failed as a whole): how many
// outcomes, and how many failed.
fn outcomes(result: &JsonValue) -> (usize, usize) {
    let social = &result["social"];
    let mut all: Vec<bool> = Vec::new();
    if !result["news"].is_null() {
        all.push(result["news"]["ok"] == false);
    }
    for entry in result["forums"].as_array().into_iter().flatten() {
        all.push(entry["ok"] == false);
    }
    for entry in result["messages"].as_array().into_iter().flatten() {
        all.push(entry["ok"] == false);
    }
    if social["ok"] == false {
        all.push(true);
    }
    for delivery in social["deliveries"].as_array().into_iter().flatten() {
        all.push(failed_delivery(delivery));
    }
    (all.len(), all.into_iter().filter(|failed| *failed).count())
}

// The networks or people a send could not reach, named for the owner.
fn refused(result: &JsonValue) -> JsonValue {
    let mut names = Vec::new();
    if result["news"]["ok"] == false {
        names.push(json!("eVe"));
    }
    for list in ["forums", "messages"] {
        for entry in result[list].as_array().into_iter().flatten() {
            if !js::truthy(entry.get("ok")) {
                names.push(entry["to"].clone());
            }
        }
    }
    let social = &result["social"];
    if social["ok"] == false {
        names.push(json!("social"));
    }
    for delivery in social["deliveries"].as_array().into_iter().flatten() {
        if failed_delivery(delivery) {
            let network = &delivery["network"];
            names.push(if js::truthy(Some(network)) {
                network.clone()
            } else {
                delivery["destination"].clone()
            });
        }
    }
    JsonValue::Array(names)
}

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |elapsed| elapsed.as_millis() as i64)
}

pub(super) async fn fire(ws_api: &Arc<WsApi>, row: &JsonValue) -> Result<JsonValue, String> {
    let store = store(ws_api);
    let send_id = js::text(row.get("send_id"));
    // Taken once, whatever the number of clocks or a send-now racing the clock.
    if !store.take(&send_id).await? {
        return Ok(JsonValue::Null);
    }
    let mut result = run(ws_api, row).await?;
    let (all, failed) = outcomes(&result);
    let state = if failed == 0 {
        "sent"
    } else if failed == all {
        "failed"
    } else {
        "partial"
    };
    let due = js::date(row.get("due_at")).map_or(f64::NAN, |due| due as f64);
    let late_ms = (now_ms() as f64 - due).max(0.0);
    let late = js::number_json(late_ms);
    let refused_to = refused(&result);
    result["late_ms"] = late.clone();
    result["refused"] = refused_to;
    store
        .finish(&send_id, "sending", state, Some(&result))
        .await?;
    let send = public_row(&store.get(&send_id).await?.unwrap_or_default());
    let owner = js::text(row.get("owner_id"));
    live::tell(
        &owner,
        &json!({ "type": "scheduled-send-changed", "send": send }),
    )
    .await;
    if state != "sent" || late_ms > LATE_MS as f64 {
        let event_id = text(send["payload"].get("event_id"));
        let event = if event_id.is_empty() {
            JsonValue::Null
        } else {
            json!(event_id)
        };
        let mut extra = json!({ "scheduled_send": { "send_id": row["send_id"], "kind": row["kind"], "state": state,
            "late_ms": late, "refused": send["result"]["refused"], "event_id": event } });
        if !event_id.is_empty() {
            // Touched, the send's event opens in the Agenda (to reconnect a network, send again).
            extra["action"] = json!({ "kind": "command", "toolId": "ui.panel.open",
                "input": { "surface": "calendar", "mode": "open", "eventId": event_id, "project_id": "" } });
        }
        let title = &row["title"];
        let notification = json!({ "kind": "system", "id": format!("scheduled_{send_id}_{state}"),
            "subject": if js::truthy(Some(title)) { title.clone() } else { JsonValue::Null },
            "message": "", "extra": extra });
        if let Err(error) = ws_api
            .social
            .notifier
            .notify(&owner, None, &notification)
            .await
        {
            eprintln!("[scheduled-sends] notify failed {error}");
        }
    }
    Ok(send)
}

// `SCHEDULED_SENDS_TICK_MS`, 30 s by default.
fn tick_ms() -> u64 {
    let value = std::env::current_dir()
        .map_err(|e| e.to_string())
        .and_then(|root| Settings::load(&root))
        .ok()
        .and_then(|settings| settings.value("SCHEDULED_SENDS_TICK_MS"))
        .and_then(|value| js::trim(&value).parse::<f64>().ok())
        .filter(|value| value.is_finite() && *value != 0.0);
    value.map_or(30_000, |value| value.max(0.0) as u64)
}

async fn tick(ws_api: &Arc<WsApi>) -> Result<(), String> {
    for row in store(ws_api).due(&js::iso(now_ms())).await? {
        if let Err(error) = fire(ws_api, &row).await {
            eprintln!(
                "[scheduled-sends] send failed {} {error}",
                js::text(row.get("send_id"))
            );
        }
    }
    Ok(())
}

/// The clock: the next due time wakes it, bounded by the tick so a restart, a moved clock or a
/// table not yet migrated at boot is caught on the next round; a save looks again.
pub(in super::super) async fn clock(ws_api: Arc<WsApi>) {
    let tick_ms = tick_ms();
    let mut failed = false;
    loop {
        let wait = match store(&ws_api).next().await {
            Ok(Some(row)) if !failed => js::date(row.get("due_at")).map_or(tick_ms, |due| {
                (due - now_ms()).clamp(0, tick_ms as i64) as u64
            }),
            _ => tick_ms,
        };
        failed = false;
        tokio::select! {
            () = tokio::time::sleep(Duration::from_millis(wait)) => {
                if let Err(error) = tick(&ws_api).await {
                    eprintln!("[scheduled-sends] clock failed {error}");
                    failed = true;
                }
            }
            () = ARMED.notified() => {}
        }
    }
}
