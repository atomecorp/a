// `social.delete { job_id, destination }` (R-190, M6): the post a delivery published removed from
// the network where its API allows it (Instagram and TikTok offer none: `social_update_unsupported`),
// then the delivery marked `deleted`. Only a published delivery is removed, with the account that
// published it; a delivery still running is refused (`social_job_busy`).
use super::jobs;
use super::net::{Sd, Se};
use super::network::Network;
use super::ops::{self, Env, field};
use crate::providers::generation::now_ms;
use serde_json::{Value as JsonValue, json};

/// The payload read field by field: a job id as `jobs::new_id` makes them, one destination.
fn asked(payload: &JsonValue) -> Sd<(String, String)> {
    let known = payload.as_object().is_some_and(|fields| {
        fields
            .keys()
            .all(|key| ["job_id", "destination"].contains(&key.as_str()))
    });
    let (job, destination) = (field(payload, "job_id"), field(payload, "destination"));
    let job_shaped = job.len() == 32
        && job
            .bytes()
            .all(|c| c.is_ascii_hexdigit() && !c.is_ascii_uppercase());
    if !known || !job_shaped || destination.is_empty() || destination.len() > 160 {
        return Err(Se::new("social_request_invalid"));
    }
    Ok((job, destination))
}

pub async fn delete(payload: &JsonValue, env: &Env) -> Sd<JsonValue> {
    let (id, destination) = asked(payload)?;
    let store = &env.store;
    let (job, _held) = store.acquire(&id).await?;
    let delivery = ops::delivery_of(&job, &destination)
        .ok_or_else(|| Se::new("social_destination_invalid"))?;
    if delivery.get("status") == Some(&json!("deleted")) {
        return Ok(json!({ "job_id": id, "delivery": ops::public_delivery(&delivery) }));
    }
    if delivery.get("status") != Some(&json!("published")) || !ops::server_route(&delivery) {
        return Err(Se::detail("social_request_invalid", "not_published"));
    }
    let network = Network::of(&field(&delivery, "network"))?;
    if matches!(network, Network::TikTok | Network::Instagram) {
        return Err(Se::new("social_update_unsupported"));
    }
    let _lock = store
        .lock(&env.principal, &id, &destination)
        .ok_or_else(|| Se::new("social_job_busy"))?;
    let account = Some(field(&delivery, "account")).filter(|a| !a.is_empty());
    let (session, _) = ops::connected(network, account.as_deref(), env).await?;
    let remote = delivery.get("remote").cloned().unwrap_or(JsonValue::Null);
    network
        .remove(&env.config, ops::record(&session)?, &remote)
        .await?;
    jobs::delivery(&job, &destination, |delivery| {
        let at = json!(now_ms());
        delivery.extend([
            ("status".into(), json!("deleted")),
            ("deleted_at".into(), at.clone()),
            ("updated_at".into(), at),
        ]);
    });
    store.write(&job).await?;
    let removed = ops::delivery_of(&job, &destination).unwrap_or(JsonValue::Null);
    Ok(json!({ "job_id": id, "delivery": ops::public_delivery(&removed) }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_delete_names_one_job_and_one_destination() {
        let id = "0123456789abcdef0123456789abcdef";
        assert!(asked(&json!({ "job_id": id, "destination": "bluesky:ann.bsky.social" })).is_ok());
        assert!(asked(&json!({ "job_id": id })).is_err());
        assert!(asked(&json!({ "job_id": "XYZ", "destination": "bluesky" })).is_err());
        assert!(asked(&json!({ "job_id": id, "destination": "bluesky", "force": true })).is_err());
    }
}
