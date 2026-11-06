// `personal-import` (server/ws_personal_import.js, ported): an authenticated, read-only import of
// the account's own contacts (CardDAV) or calendar events (CalDAV) on the existing /ws/api
// connection. One import at a time per account and twelve a minute; the credentials and the address
// are checked, every request goes through dav.rs, every collection is read whole or from its cursor
// (collection.rs) and every object into its canonical item (vcard.rs; an event by the calendar
// engine, atome_calendar::ical). Nothing is stored or committed here: the client receives the
// items, the removed hrefs and the cursors. Any error that is not a `dav_*` code answers
// `dav_read_failed`.
//
// The account is the one the connection reads as current (`resolveWsApiPrincipal`): the
// attachment expiry is its concern there, so an attachment without an expiry is accepted and an
// expired one is detached by that read, where the JS code compared `_wsApiAuthExpMs` itself.
mod collection;
mod dav;
mod vcard;
mod xml;

use super::Asker;
use super::public_source::RateLimit;
use crate::vault_router::js;
use collection::Client;
use dav::Session;
use regex::Regex;
use serde_json::{Map as JsonMap, Value as JsonValue, json};
use std::collections::BTreeSet;
use std::sync::{LazyLock, Mutex};
use std::time::{Duration, Instant};

const MAX_COLLECTIONS: usize = 100;
const MAX_ITEMS: usize = 100_000;

// The accounts importing now, and each account's imports of the last minute.
static INFLIGHT: Mutex<BTreeSet<String>> = Mutex::new(BTreeSet::new());
static WINDOWS: LazyLock<RateLimit> = LazyLock::new(|| RateLimit::new(60_000, 12));
static DAV_CODE: LazyLock<Regex> = LazyLock::new(|| Regex::new("^dav_[a-z_]+$").expect("dav code"));

// An account's import under way, released however it ends (`finally { inflight.delete(user) }`).
struct Running(String);

impl Drop for Running {
    fn drop(&mut self) {
        INFLIGHT
            .lock()
            .expect("personal import lock")
            .remove(&self.0);
    }
}

/// `{ type: 'personal-import-response', requestId, success: ok === true, ...fields }`: the request
/// id is `requestId || request_id`, left out when that is undefined.
fn reply(message: &JsonValue, fields: JsonMap<String, JsonValue>) -> JsonValue {
    let mut reply = JsonMap::new();
    reply.insert("type".into(), json!("personal-import-response"));
    let request = message
        .get("requestId")
        .filter(|id| js::truthy(Some(id)))
        .or_else(|| message.get("request_id"));
    if let Some(request) = request {
        reply.insert("requestId".into(), request.clone());
    }
    reply.insert(
        "success".into(),
        json!(fields.get("ok") == Some(&json!(true))),
    );
    reply.extend(fields);
    JsonValue::Object(reply)
}

fn failure(message: &JsonValue, error: &str) -> JsonValue {
    let mut fields = JsonMap::new();
    fields.insert("ok".into(), json!(false));
    fields.insert("error".into(), json!(error));
    reply(message, fields)
}

/// `String(value || '')`.
fn text(value: Option<&JsonValue>) -> String {
    value
        .filter(|value| js::truthy(Some(value)))
        .map(|value| js::text(Some(value)))
        .unwrap_or_default()
}

/// `handleWsPersonalImport(message, connection)`.
pub(super) async fn answer(asker: &Asker<'_>, message: &JsonValue) -> Result<JsonValue, String> {
    let front = asker
        .connection
        .connection_of(json!({ "message": message, "current": true }))
        .await?;
    if let Some(session_error) = front.get("session_error") {
        return Ok(session_error.clone());
    }
    let Some(user) = front
        .get("principal")
        .and_then(JsonValue::as_str)
        .filter(|user| !user.is_empty())
    else {
        return Ok(failure(message, "auth_session_invalid"));
    };
    let contact = match message.get("domain").and_then(JsonValue::as_str) {
        Some("contact") => true,
        Some("calendar_event") => false,
        _ => return Ok(failure(message, "dav_domain_invalid")),
    };
    let now = chrono::Utc::now().timestamp_millis();
    let _running = {
        let mut inflight = INFLIGHT.lock().expect("personal import lock");
        if inflight.contains(user) || WINDOWS.limited(user, now) {
            return Ok(failure(message, "dav_rate_limited"));
        }
        inflight.insert(user.to_string());
        Running(user.to_string())
    };
    Ok(match import(asker, message, user, contact, now).await {
        Ok(fields) => reply(message, fields),
        Err(error) if DAV_CODE.is_match(&error) => failure(message, &error),
        Err(_) => failure(message, "dav_read_failed"),
    })
}

async fn import(
    asker: &Asker<'_>,
    message: &JsonValue,
    user: &str,
    contact: bool,
    now: i64,
) -> Result<JsonMap<String, JsonValue>, String> {
    let auth = message.get("auth");
    let (username, password) = (
        text(auth.and_then(|auth| auth.get("username"))),
        text(auth.and_then(|auth| auth.get("password"))),
    );
    let length = |text: &str| text.encode_utf16().count();
    if username.is_empty()
        || password.is_empty()
        || length(&username) > 320
        || length(&password) > 4096
    {
        return Err("dav_credentials_invalid".into());
    }
    // `String(process.env.ATOME_DAV_ALLOWED_HOSTS || '').split(',').filter(Boolean)`, read per import.
    let allowed: Vec<String> = super::common::setting("ATOME_DAV_ALLOWED_HOSTS")?
        .unwrap_or_default()
        .split(',')
        .filter(|host| !host.is_empty())
        .map(str::to_string)
        .collect();
    let url = dav::checked_url(&text(message.get("url")), &allowed).await?;
    let session = Session {
        connection: asker.connection,
        message,
        user: user.to_string(),
        allowed,
        deadline: Instant::now() + Duration::from_millis(80_000),
        requests: 0,
    };
    let protocol = if contact { &xml::CARDDAV } else { &xml::CALDAV };
    let mut client = Client::new(session, protocol, url, &username, &password);
    let collections = client.collections().await?;
    let selected: &[JsonValue] = message
        .get("collections")
        .and_then(JsonValue::as_array)
        .map_or(&[], Vec::as_slice);
    if selected.len() > MAX_COLLECTIONS || collections.len() > MAX_COLLECTIONS {
        return Err("dav_collections_limit".into());
    }
    let (mut items, mut removed, mut cursors, mut calendars) =
        (Vec::new(), Vec::new(), JsonMap::new(), Vec::new());
    for collection in collections {
        if !selected.is_empty()
            && !selected
                .iter()
                .any(|url| url.as_str() == Some(collection.url.as_str()))
        {
            continue;
        }
        // `message.cursor?.[collection.url]`, read from its cursor when truthy.
        let cursor = message
            .get("cursor")
            .and_then(JsonValue::as_object)
            .and_then(|cursors| cursors.get(&collection.url))
            .filter(|cursor| js::truthy(Some(cursor)));
        let read = client.read(&collection.url, cursor).await?;
        // Delayed observations are ordered by the common DAV ingress clock, never by lexical ETag or
        // a device's local collection timestamp.
        for mut item in read.items {
            let etag = item
                .get("etag")
                .filter(|etag| js::truthy(Some(etag)))
                .cloned()
                .unwrap_or(JsonValue::Null);
            item.insert("source_collection".into(), json!(collection.url));
            item.insert(
                "version".into(),
                json!({ "observed_at": now, "etag": etag }),
            );
            items.push(JsonValue::Object(item));
        }
        for href in read.removed {
            removed.push(json!(collection::absolute(&href, &collection.url)?));
        }
        if !read.cursor.is_null() {
            cursors.insert(collection.url.clone(), read.cursor);
        }
        calendars.push(json!({ "id": collection.url, "name": collection.name }));
        if items.len() > MAX_ITEMS {
            return Err("dav_items_limit".into());
        }
    }
    let mut fields = JsonMap::new();
    fields.insert("ok".into(), json!(true));
    fields.insert("complete".into(), json!(true));
    fields.insert("items".into(), JsonValue::Array(items));
    fields.insert("removed_hrefs".into(), JsonValue::Array(removed));
    fields.insert("calendars".into(), json!(calendars));
    fields.insert("groups".into(), json!(calendars));
    fields.insert("cursor".into(), JsonValue::Object(cursors));
    Ok(fields)
}
