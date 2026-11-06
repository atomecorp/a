// The external sources of `/ws/api` (server/wsExternalResourceOperations.js, ported family by
// family): bounded reads of public providers and of the server's own reference data, and the
// account's reports to the operator. Fastify answers them after the device session is checked
// (`validateConnectionDeviceSession`); here the connection checks it (identity.rs `connection_of`) and
// says which account it is attached to. As on Fastify, a family's thrown error answers nothing:
// it is told to the operator.
// The checked public source access (server/public_source_fetch.js), shared by the families below
// (and its public address rule by the mail gateway, mail/gateway.rs).
pub(crate) mod public_source;
// The families of batch A and what they share.
mod books;
mod common;
mod food_facts;
mod food_health;
mod food_requests;
mod gps;
mod gps_route;
mod peertube;
mod tone3000;
mod video_catalog;
mod video_titles;
mod youtube;
// The families of batch B.
mod account_roles;
mod bug_reports;
mod feature_requests;
mod health_reference;
mod media_library;
mod media_library_sources;
mod personal_import;
mod shows;
mod shows_listings;
mod shows_places;
mod shows_tourism;
mod tv_build;
mod tv_catalog;
mod tv_streams;

use super::Connection;
use crate::vault_router::js;
use serde_json::{Map as JsonMap, Value as JsonValue, json};
use std::sync::Arc;

/// Who asks: the connection, its address as Fastify reads it (`request.ip`), and the account it
/// is attached to (`connection._wsApiUserId`).
pub(super) struct Asker<'a> {
    pub connection: &'a Arc<Connection>,
    pub address: &'a str,
    pub principal: Option<String>,
}

/// The `type`s answered here; each is its family's.
pub(super) const KINDS: &[&str] = &[
    "personal-import",
    "youtube-search",
    "peertube-search",
    "peertube-resolve",
    "tv-catalog",
    "tv-resolve",
    "shows-nearby",
    "video-catalog",
    "gps-resource",
    "food-facts",
    "book-source",
    "book-fetch",
    "tone3000",
    "health-reference",
    "media-library-search",
    "media-library-fetch",
    "bug-report-status",
    "bug-report-submit",
    "feature-request-roadmap",
    "feature-request-admin",
    "account-roles",
];

/// `wsResponse(type, message, success, fields)`: `<type>-response`, the message's request id.
pub(super) fn response(
    kind: &str,
    message: &JsonValue,
    success: bool,
    fields: JsonValue,
) -> JsonValue {
    let mut reply = JsonMap::new();
    reply.insert("type".into(), json!(format!("{kind}-response")));
    reply.insert(
        "requestId".into(),
        js::first(message, &["requestId", "request_id"])
            .cloned()
            .unwrap_or(JsonValue::Null),
    );
    reply.insert("success".into(), json!(success));
    reply.insert("ok".into(), json!(success));
    if let JsonValue::Object(fields) = fields {
        reply.extend(fields);
    }
    JsonValue::Object(reply)
}

async fn decided(
    connection: &Arc<Connection>,
    kind: &str,
    message: &JsonValue,
) -> Result<JsonValue, String> {
    let front = connection
        .connection_of(json!({ "message": message }))
        .await?;
    if let Some(session_error) = front.get("session_error") {
        return Ok(session_error.clone());
    }
    let asker = Asker {
        connection,
        address: &connection.network,
        principal: front
            .get("principal")
            .and_then(JsonValue::as_str)
            .map(str::to_string),
    };
    match kind {
        // One arm per family, in Fastify's dispatch order.
        "personal-import" => personal_import::answer(&asker, message).await,
        "youtube-search" => youtube::answer(&asker, message).await,
        "peertube-search" | "peertube-resolve" => peertube::answer(&asker, message).await,
        tv_catalog::CATALOG | tv_catalog::RESOLVE => tv_catalog::answer(message).await,
        shows::KIND => shows::answer(&asker, message).await,
        "video-catalog" => video_catalog::answer(&asker, message).await,
        "gps-resource" => gps::answer(&asker, message).await,
        "food-facts" => food_facts::answer(&asker, message).await,
        health_reference::KIND => health_reference::answer(message).await,
        "book-source" | "book-fetch" => books::answer(&asker, message).await,
        "tone3000" => tone3000::answer(&asker, message).await,
        media_library::SEARCH | media_library::FETCH => {
            media_library::answer(&asker, message).await
        }
        bug_reports::STATUS | bug_reports::SUBMIT => bug_reports::answer(&asker, message).await,
        feature_requests::ROADMAP | feature_requests::ADMIN => {
            feature_requests::answer(&asker, message).await
        }
        account_roles::KIND => account_roles::answer(&asker, message).await,
        _ => Err(format!("no family answers {kind} ({})", asker.address)),
    }
}

pub(super) async fn answer(connection: Arc<Connection>, message: JsonValue) {
    let kind = js::text(message.get("type"));
    match decided(&connection, &kind, &message).await {
        Ok(reply) => connection.reply(reply).await,
        Err(error) => eprintln!("[ws/api] {kind} failed {error}"),
    }
}
