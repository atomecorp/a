// What the person tells of a delivery atome cannot see the end of (server/social/
// social_operations.js, ported): an assisted transfer's outcome, an unconfirmed publication
// confirmed or not.
use super::net::{Sd, Se};
use super::ops::{Env, delivery_of, field, public_delivery, server_route};
use crate::providers::generation::now_ms;
use crate::vault_router::js;
use serde_json::{Value as JsonValue, json};

const ASSISTED_OUTCOMES: [&str; 4] = ["handed_off", "exported", "cancelled", "failed"];

/// The client reports what happened to an assisted transfer (share sheet, copied text, export).
/// atome cannot see into the other app: `handed_off` is the most it ever records, never
/// `published`.
pub async fn record(payload: &JsonValue, env: &Env, handoff: bool) -> Sd<JsonValue> {
    let store = &env.store;
    let (job, _held) = store.acquire(&field(payload, "job_id")).await?;
    let destination = field(payload, "destination");
    let delivery =
        delivery_of(&job, &destination).ok_or_else(|| Se::new("social_destination_invalid"))?;
    let outcome = payload
        .get("outcome")
        .and_then(JsonValue::as_str)
        .unwrap_or("");
    let status = delivery
        .get("status")
        .and_then(JsonValue::as_str)
        .unwrap_or("");
    let patch = if handoff {
        let assisted = !server_route(&delivery)
            && (js::truthy(delivery.get("route"))
                || js::truthy(delivery.pointer("/fallback/route")));
        if !assisted
            || !ASSISTED_OUTCOMES.contains(&outcome)
            || !["ready", "failed", "cancelled"].contains(&status)
        {
            return Err(Se::new("social_request_invalid"));
        }
        let told = payload
            .get("error")
            .and_then(JsonValue::as_str)
            .unwrap_or("");
        let error = match outcome {
            "failed"
                if ["social_app_unavailable", "social_handoff_unavailable"].contains(&told) =>
            {
                json!(told)
            }
            "failed" => json!("social_handoff_unavailable"),
            _ => JsonValue::Null,
        };
        let target = payload
            .get("target")
            .and_then(JsonValue::as_str)
            .map_or(JsonValue::Null, |t| json!(js::slice(t, 200)));
        json!({ "status": outcome, "error": error, "target": target, "updated_at": now_ms() })
    } else {
        if status != "unconfirmed" || !["published", "not_published"].contains(&outcome) {
            return Err(Se::new("social_request_invalid"));
        }
        let (status, error) = if outcome == "published" {
            ("published", JsonValue::Null)
        } else {
            ("failed", json!("social_publish_unconfirmed"))
        };
        json!({ "status": status, "error": error, "confirmed_by": "user", "updated_at": now_ms() })
    };
    super::jobs::delivery(&job, &destination, |delivery| {
        delivery.extend(patch.as_object().cloned().unwrap_or_default())
    });
    store.release_if_settled(&job, false).await?;
    store.write(&job).await?;
    Ok(public_delivery(
        &delivery_of(&job, &destination).unwrap_or(JsonValue::Null),
    ))
}
