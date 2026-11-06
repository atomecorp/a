// The contact form of a website (`POST /_site/contact`, server/site_http.js, ported; Q17):
// checked, limited by address and by site, delivered to the author's Communiquer as a notice
// (social/live.rs: their stack, their open screens or their queue, their devices); the author's
// own address is never exposed. A hidden `website` field filled is a robot's: it is thanked and
// nothing leaves.
use super::Site;
use super::http::{HTML, failed, notice, reply};
use super::objects::escape_html;
use crate::http::fastify_reply;
use crate::social::live::Notifier;
use crate::vault_router::js;
use axum::body::{Body, Bytes};
use axum::extract::Request;
use axum::http::{HeaderMap, StatusCode, header};
use axum::response::Response;
use serde_json::{Map as JsonMap, Value as JsonValue, json};
use sha2::{Digest, Sha256};
use std::net::SocketAddr;
use std::sync::LazyLock;

const PER_IP_PER_HOUR: i64 = 5;
const PER_SITE_PER_DAY: i64 = 89;
const HOUR_MS: i64 = 3_600_000;
const FORM: &str = "application/x-www-form-urlencoded";
// The form parser's own `bodyLimit`, and Fastify's for every other body.
const FORM_LIMIT: usize = 16_384;
const BODY_LIMIT: usize = 1024 * 1024 * 1024;

static EMAIL: LazyLock<regex::Regex> =
    LazyLock::new(|| regex::Regex::new(r"^[^\s@]+@[^\s@]+\.[^\s@]+$").expect("email shape"));

// `String(form[key] || '')`.
fn field(form: &JsonValue, key: &str) -> String {
    form.get(key)
        .filter(|value| js::truthy(Some(value)))
        .map(|value| js::text(Some(value)))
        .unwrap_or_default()
}

// The body's media type, lowered, without its parameters.
fn media(headers: &HeaderMap) -> Option<String> {
    let content_type = headers.get(header::CONTENT_TYPE)?.to_str().ok()?;
    let media = content_type.split(';').next().unwrap_or("");
    Some(media.trim().to_ascii_lowercase())
}

// The body as the route reads it (`request.body || {}`): a form's fields (the last of a repeated
// one), JSON as it is, anything else none; or Fastify's refusal.
fn form(headers: &HeaderMap, bytes: &Bytes) -> Result<JsonValue, fastify_reply::Refusal> {
    if media(headers).as_deref() == Some(FORM) {
        let fields: JsonMap<String, JsonValue> = url::form_urlencoded::parse(bytes)
            .map(|(key, value)| (key.into_owned(), json!(value.into_owned())))
            .collect();
        return Ok(JsonValue::Object(fields));
    }
    let content_type = headers
        .get(header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok());
    let body = fastify_reply::body(content_type, bytes)?;
    Ok(body
        .filter(|body| js::truthy(Some(body)))
        .unwrap_or_else(|| json!({})))
}

impl Site {
    /// `POST /_site/contact`, its notice sent through `notifier`.
    pub async fn contact(
        &self,
        notifier: &Notifier,
        peer: SocketAddr,
        request: Request,
    ) -> Response {
        let (parts, body) = request.into_parts();
        let limit = if media(&parts.headers).as_deref() == Some(FORM) {
            FORM_LIMIT
        } else {
            BODY_LIMIT
        };
        let Ok(bytes) = axum::body::to_bytes(Body::new(body), limit).await else {
            return fastify_reply::refused((
                StatusCode::PAYLOAD_TOO_LARGE,
                "FST_ERR_CTP_BODY_TOO_LARGE",
                "Payload Too Large",
                "Request body is too large",
            ));
        };
        let form = match form(&parts.headers, &bytes) {
            Ok(form) => form,
            Err(refusal) => return fastify_reply::refused(refusal),
        };
        let ip = crate::http::peer::client_network(peer, &parts.headers);
        let answered = self.contacted(notifier, &form, &ip).await;
        match answered {
            Ok((status, page)) => {
                let page = reply(status, &[("content-type", HTML.into())], Body::from(page));
                fastify_reply::compressed(&parts.headers, page).await
            }
            Err(error) => failed(&error),
        }
    }

    // The answer's status and page.
    async fn contacted(
        &self,
        notifier: &Notifier,
        form: &JsonValue,
        ip: &str,
    ) -> Result<(StatusCode, String), String> {
        let row = self.store.site(&field(form, "site")).await?;
        let back = row.as_ref().map_or(String::new(), |row| {
            format!(
                "<p><a href=\"/{}/\">Revenir au site</a></p>",
                escape_html(&js::text(row.get("slug")))
            )
        });
        let answer = |status: StatusCode, title: &str, body: &str| {
            let body = format!("{body}{back}");
            let page = notice(title, &body, "<meta name=\"robots\" content=\"noindex\">");
            Ok((status, page))
        };
        let Some(row) = row.filter(|row| row["state"] == "online") else {
            return answer(StatusCode::NOT_FOUND, "Site introuvable", "");
        };
        let thanks = "<p>Merci, votre message est parti.</p>";
        if !field(form, "website").is_empty() {
            return answer(StatusCode::OK, "Message envoyé", thanks);
        }
        let name = js::slice(js::trim(&field(form, "name")), 120);
        let email = js::slice(js::trim(&field(form, "email")), 254);
        let message = js::slice(js::trim(&field(form, "message")), 4000);
        if name.is_empty() || message.is_empty() || !EMAIL.is_match(&email) {
            return answer(
                StatusCode::BAD_REQUEST,
                "Message incomplet",
                "<p>Le nom, l’e-mail et le message sont demandés.</p>",
            );
        }
        let site_id = js::text(row.get("site_id"));
        let digest = Sha256::digest(format!("{ip}|{site_id}").as_bytes());
        let ip_key: String = digest
            .iter()
            .take(16)
            .map(|byte| format!("{byte:02x}"))
            .collect();
        let at = super::now_ms();
        let store = &self.store;
        if store.contact_count(&site_id, &ip_key, at - HOUR_MS).await? >= PER_IP_PER_HOUR
            || store.contact_count(&site_id, "", at - 24 * HOUR_MS).await? >= PER_SITE_PER_DAY
        {
            return answer(
                StatusCode::TOO_MANY_REQUESTS,
                "Trop de messages",
                "<p>Réessayez un peu plus tard.</p>",
            );
        }
        store.log_contact(&site_id, &ip_key, at).await?;
        let live = &row["live_version"];
        let version = if js::truthy(Some(live)) {
            store.version(&site_id, live).await?
        } else {
            None
        };
        let slug = js::text(row.get("slug"));
        let title = version
            .as_ref()
            .and_then(|version| version["manifest"].get("title"))
            .filter(|title| js::truthy(Some(title)))
            .map_or_else(|| slug.clone(), |title| js::text(Some(title)));
        let notification = json!({ "kind": "site-contact", "subject": format!("{title} · {name}"), "message": message,
            "id": format!("site_contact_{site_id}_{at}"),
            "extra": { "site_id": row["site_id"], "slug": row["slug"], "reply_to": email, "name": name } });
        notifier
            .notify(&js::text(row.get("owner_id")), None, &notification)
            .await?;
        answer(StatusCode::OK, "Message envoyé", thanks)
    }
}
