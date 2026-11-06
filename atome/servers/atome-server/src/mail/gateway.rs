// The personal mail gateway (server/mailRoutes.js): `POST /api/eve/mail/{sync,send,mark-read,archive,
// delete}` for a verified device session, with the IMAP/SMTP account the request carries
// (scripts/icloud_live_credentials.mjs#resolveMailCredentials: the request's own credentials only,
// normalized as the browser's preferences are, an atome.one address taking its domain's hosts). The
// server connects only to a mail server named by a DNS name, on a mail port, whose every address is
// public (SSRF). One runtime is kept, reused only by the same person with the same credentials (the
// password's digest included): its index and its cursor make the next sync a delta.
use super::Mail;
use super::connector::Connector;
use super::index::Service;
use super::mime::text_of;
use super::smtp::Auth;
use super::socket::Transport;
use crate::auth::Sessions;
use crate::http::fastify_reply;
use crate::vault_router::js;
use crate::ws_api::sources::public_source;
use axum::extract::Request;
use axum::http::{Method, StatusCode};
use axum::response::Response;
use serde_json::{Value as JsonValue, json};
use sha2::{Digest, Sha256};
use std::sync::{Arc, Mutex};
use tokio_rustls::rustls::ClientConfig;

const ROUTES: [&str; 5] = [
    "/api/eve/mail/sync",
    "/api/eve/mail/send",
    "/api/eve/mail/mark-read",
    "/api/eve/mail/archive",
    "/api/eve/mail/delete",
];
const DEFAULT_LIMIT: f64 = 20.0;

/// The account a request names, resolved (`resolveMailCredentials`).
pub struct Credentials {
    pub provider: String,
    pub email: String,
    pub username: String,
    pub password: String,
    pub mailbox: String,
    pub imap: Transport,
    pub smtp: Transport,
}

/// The one runtime kept: its key, the person's connector and their index.
pub struct Runtime {
    key: String,
    connector: Connector,
    credentials: Credentials,
    mailbox: String,
    service: Mutex<Service>,
}

#[derive(Default)]
pub struct Gateway {
    runtime: Mutex<Option<Arc<Runtime>>>,
}

// `Number.parseInt(String(value ?? '').trim(), 10)`.
fn parse_int(value: Option<&JsonValue>) -> f64 {
    let text = match value {
        None | Some(JsonValue::Null) => String::new(),
        Some(value) => js::text(Some(value)),
    };
    let text = js::trim(&text);
    let (sign, digits) = match text.as_bytes().first() {
        Some(b'-') => (-1.0, &text[1..]),
        Some(b'+') => (1.0, &text[1..]),
        _ => (1.0, text),
    };
    let end = digits.bytes().take_while(u8::is_ascii_digit).count();
    digits[..end]
        .parse::<f64>()
        .map_or(f64::NAN, |number| sign * number)
}

// `String(value || default).trim() || default`.
fn string_or(value: Option<&JsonValue>, default: &str) -> String {
    let text = text_of(value);
    if text.is_empty() {
        default.into()
    } else {
        text
    }
}

// `String(value || default).trim()`: a blank value given stays blank.
fn given_or(value: Option<&JsonValue>, default: &str) -> String {
    if js::truthy(value) {
        text_of(value)
    } else {
        js::trim(default).into()
    }
}

// `normalizeRuntimeMailPreferences` then `resolveMailCredentials`, as one reading.
pub fn credentials(overrides: Option<&JsonValue>) -> Result<Credentials, String> {
    let source = match overrides {
        Some(JsonValue::Object(_)) => overrides.cloned().unwrap_or_default(),
        Some(JsonValue::Array(_)) => json!({}),
        _ => return Err("mail_credentials_missing".into()),
    };
    let email = text_of(source.get("email"));
    let domain = email.to_lowercase();
    let domain = domain
        .rfind('@')
        .map(|at| js::trim(&domain[at + 1..]).to_string());
    // provider_profiles.js: the one domain whose hosts are known.
    let atome = domain.as_deref() == Some("atome.one");
    let host_default = if atome { "rousse.o2switch.net" } else { "" };
    let side = |key: &str, port: f64, security: &str| {
        let given = source
            .get(key)
            .filter(|value| js::truthy(Some(value)) && (value.is_object() || value.is_array()));
        let field = |name: &str| given.and_then(|side| side.get(name));
        let host = given_or(field("host"), host_default);
        let parsed = parse_int(field("port"));
        let kind = text_of(field("security")).to_lowercase();
        Transport {
            host,
            port: if parsed.is_finite() && parsed > 0.0 {
                parsed
            } else {
                port
            },
            security: if ["tls", "starttls", "ssl", "none"].contains(&kind.as_str()) {
                kind
            } else {
                security.into()
            },
        }
    };
    let password = text_of(source.get("password"));
    let imap = side("imap", 993.0, "tls");
    let smtp = side("smtp", 587.0, "starttls");
    // Clear text is refused (user decision, 2026-11-06): a mail always travels encrypted.
    if imap.security == "none" || smtp.security == "none" {
        return Err(super::socket::CLEARTEXT_REFUSED.into());
    }
    let missing: Vec<&str> = [
        ("email", email.is_empty()),
        ("password", password.is_empty()),
        ("imap_host", imap.host.is_empty()),
        ("smtp_host", smtp.host.is_empty()),
    ]
    .into_iter()
    .filter_map(|(name, absent)| absent.then_some(name))
    .collect();
    if !missing.is_empty() {
        return Err(format!("mail_credentials_missing:{}", missing.join(",")));
    }
    Ok(Credentials {
        provider: string_or(source.get("provider"), "custom_imap_smtp"),
        username: string_or(source.get("username"), &email),
        email,
        password,
        mailbox: string_or(source.get("mailbox"), "INBOX"),
        imap,
        smtp,
    })
}

/// `checkMailHosts`: each server a DNS name, on a mail port, every address of it public.
async fn check_hosts(credentials: &Credentials) -> Result<(), String> {
    for (protocol, transport, ports) in [
        ("imap", &credentials.imap, &[993.0, 143.0][..]),
        ("smtp", &credentials.smtp, &[465.0, 587.0, 25.0][..]),
    ] {
        let host = js::trim(&transport.host).to_lowercase();
        let labels: Vec<&str> = host.split('.').collect();
        let named = labels.len() >= 2
            && labels.iter().all(|label| {
                !label.is_empty()
                    && label
                        .bytes()
                        .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-')
            });
        if host.parse::<std::net::IpAddr>().is_ok() || !named {
            return Err(format!("mail_{protocol}_host_invalid"));
        }
        if !ports.contains(&transport.port) {
            return Err(format!("mail_{protocol}_port_not_allowed"));
        }
        let addresses = public_source::resolve(&host)
            .await
            .map_err(|_| format!("getaddrinfo ENOTFOUND {host}"))?;
        if addresses.is_empty()
            || !addresses
                .iter()
                .all(|address| public_source::public_address(address))
        {
            return Err(format!("mail_{protocol}_address_not_public"));
        }
    }
    Ok(())
}

// `toLimit(value)`: a whole number of at least 1, else the gateway's 20.
fn limit_of(value: Option<&JsonValue>) -> f64 {
    let number = js::number(value);
    if number.is_finite() {
        (number + 0.5).floor().max(1.0)
    } else {
        DEFAULT_LIMIT
    }
}

fn failure(error: &str, default: &str, message: Option<&JsonValue>) -> JsonValue {
    let message = message
        .filter(|message| js::truthy(Some(message)))
        .cloned()
        .unwrap_or(JsonValue::Null);
    json!({ "ok": false, "error": if error.is_empty() { default } else { error }, "message": message })
}

fn object(options: &JsonValue, key: &str) -> Option<JsonValue> {
    options
        .get(key)
        .filter(|value| js::truthy(Some(value)) && (value.is_object() || value.is_array()))
        .cloned()
}

fn or_null(value: Option<&JsonValue>) -> JsonValue {
    value
        .filter(|value| js::truthy(Some(value)))
        .cloned()
        .unwrap_or(JsonValue::Null)
}

// The answer of a failed step: its error, or the gateway's own when it has none.
fn unavailable(error: String) -> JsonValue {
    let code = if error.is_empty() {
        "mail_gateway_unavailable".to_string()
    } else {
        error.clone()
    };
    json!({ "ok": false, "error": code, "message": error })
}

impl Runtime {
    /// The person's runtime for these credentials: its mailbox (the request's, else the account's)
    /// and the key that reuses it.
    pub fn new(
        credentials: Credentials,
        options: &JsonValue,
        user: &str,
        tls: Arc<ClientConfig>,
    ) -> Self {
        let mailbox = given_or(js::first(options, &["mailbox"]), &credentials.mailbox);
        let mailbox = if mailbox.is_empty() {
            "INBOX".to_string()
        } else {
            mailbox
        };
        let secret = hex(&Sha256::digest(credentials.password.as_bytes()));
        let key = json!({ "user": user, "secret": secret, "provider": credentials.provider, "email": credentials.email,
            "username": credentials.username, "imap_host": credentials.imap.host, "smtp_host": credentials.smtp.host,
            "mailbox": mailbox })
        .to_string();
        let auth = Auth {
            username: Some(credentials.username.clone()),
            password: Some(credentials.password.clone()),
        };
        let connector = Connector::new(
            &credentials.provider,
            &mailbox,
            auth,
            credentials.imap.clone(),
            credentials.smtp.clone(),
            tls,
        );
        Self {
            key,
            connector,
            credentials,
            mailbox,
            service: Mutex::default(),
        }
    }

    async fn sync(&self, options: &JsonValue) -> Result<JsonValue, String> {
        let previous = self
            .service
            .lock()
            .expect("mail service")
            .cursor()
            .map(str::to_string);
        let initial = options.get("initial") == Some(&json!(true))
            || previous
                .as_deref()
                .is_none_or(|cursor| js::trim(cursor).is_empty());
        let limit = limit_of(options.get("limit"));
        let cursor = if initial { None } else { previous.as_deref() };
        let read = self
            .connector
            .fetch(!initial, &self.mailbox, limit, cursor)
            .await;
        if read.get("ok") != Some(&json!(true)) {
            return Ok(failure(
                &text_of(read.get("error")),
                "mail_sync_failed",
                read.get("message"),
            ));
        }
        let mut service = self.service.lock().expect("mail service");
        let next = read["cursor"].as_str().map(str::to_string).or(previous);
        service.apply(
            read["messages"].as_array().map_or(&[][..], Vec::as_slice),
            next,
        )?;
        let asked = text_of(options.get("mailbox")).to_lowercase();
        let listed = service.list(
            Some(asked.as_str()).filter(|m| !m.is_empty()),
            options.get("unread_only") == Some(&json!(true)),
            limit,
        );
        let mailbox = string_or(options.get("mailbox"), "inbox").to_lowercase();
        Ok(
            json!({ "ok": true, "provider": self.connector.provider, "mailbox": mailbox,
            "mode": if initial { "initial" } else { "delta" }, "cursor": service.cursor(), "items": listed,
            "stats": service.stats(), "email": Some(&self.credentials.email).filter(|e| !e.is_empty()) }),
        )
    }

    /// One action of the gateway on this runtime (`sync`, `send`, `mark-read`, `archive`,
    /// `delete`); any failure answered `ok: false`.
    pub async fn act(&self, action: &str, options: &JsonValue) -> JsonValue {
        let answered = async {
            let connector = &self.connector;
            let email = Some(&self.credentials.email).filter(|email| !email.is_empty());
            if action == "sync" {
                return self.sync(options).await;
            }
            let (key, missing) = if action == "send" {
                ("draft", ("mail_draft_missing", "A draft payload is required."))
            } else {
                ("message", ("mail_message_missing", "A message payload is required."))
            };
            let Some(given) = object(options, key) else {
                return Ok(json!({ "ok": false, "error": missing.0, "message": missing.1 }));
            };
            let read = options.get("read") != Some(&json!(false));
            let (result, done, default) = match action {
                "send" => (connector.send(&given).await, "sent", "mail_send_failed"),
                "mark-read" => (connector.mark_read(&given, read).await, "read", "mail_mark_read_failed"),
                "archive" => (connector.move_message(&given, "Archive").await, "archived", "mail_archive_failed"),
                _ => (connector.move_message(&given, "Trash").await, "deleted", "mail_delete_failed"),
            };
            if result.get("ok") != Some(&json!(true)) {
                return Ok(failure(&text_of(result.get("error")), default, result.get("message")));
            }
            if action == "send" {
                let accepted = or_null(result.get("accepted_at"));
                return Ok(json!({ "ok": true, "sent": true, "provider": connector.provider, "email": email,
                    "draft_id": or_null(given.get("draft_id")),
                    "remote_id": or_null(js::first(&result, &["remote_id", "message_id"])),
                    "message_id": or_null(js::first(&result, &["message_id", "remote_id"])),
                    "accepted_at": if accepted.is_null() { json!(crate::auth::now_ms() as i64) } else { accepted } }));
            }
            let uid = or_null(given.get("meta").and_then(|meta| meta.get("uid")));
            let mut answer = json!({ "ok": true });
            answer[done] = if action == "mark-read" { json!(read) } else { json!(true) };
            for (field, value) in [("provider", json!(connector.provider)), ("email", json!(email)),
                ("message_id", or_null(given.get("message_id"))), ("uid", uid)] {
                answer[field] = value;
            }
            Ok::<JsonValue, String>(answer)
        }
        .await;
        answered.unwrap_or_else(unavailable)
    }
}

impl Gateway {
    // The kept runtime when the same person names the same account, else a new one kept.
    async fn runtime(
        &self,
        mail: &Mail,
        options: &JsonValue,
        user: &str,
    ) -> Result<Arc<Runtime>, String> {
        let credentials = credentials(
            options
                .get("credentials")
                .filter(|value| js::truthy(Some(value))),
        )?;
        check_hosts(&credentials).await?;
        let runtime = Runtime::new(credentials, options, user, mail.tls.clone());
        let mut kept = self.runtime.lock().expect("mail runtime");
        if let Some(kept) = kept.as_ref().filter(|kept| kept.key == runtime.key) {
            return Ok(kept.clone());
        }
        let runtime = Arc::new(runtime);
        *kept = Some(runtime.clone());
        Ok(runtime)
    }
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

pub fn claims(request: &Request) -> bool {
    request.method() == Method::POST && ROUTES.contains(&request.uri().path())
}

// `resolveUserId(user)`.
fn user_of(claims: &JsonValue) -> String {
    for keys in [
        &["id", "userId", "user_id", "sub"][..],
        &["username", "name"][..],
    ] {
        let id = js::trim(&js::text(js::first(claims, keys))).to_string();
        if js::first(claims, keys).is_some() && !id.is_empty() {
            return id;
        }
    }
    "anonymous".into()
}

/// `POST /api/eve/mail/*`: Fastify's body parsers, the caller's session, then the action
/// (503 when it fails).
pub async fn answer(mail: &Mail, sessions: &Sessions, request: Request) -> Response {
    let action = request
        .uri()
        .path()
        .rsplit('/')
        .next()
        .unwrap_or_default()
        .to_string();
    let (parts, body) = match fastify_reply::read(request).await {
        Ok(read) => read,
        Err(refusal) => return refusal,
    };
    let Some(claims) = sessions.validate_request(&parts.headers).await else {
        return fastify_reply::json(
            StatusCode::UNAUTHORIZED,
            &json!({ "ok": false, "error": "mail_auth_required" }),
        );
    };
    let options = body
        .filter(|body| js::truthy(Some(body)))
        .unwrap_or_else(|| json!({}));
    let result = match mail
        .gateway
        .runtime(mail, &options, &user_of(&claims))
        .await
    {
        Ok(runtime) => runtime.act(&action, &options).await,
        Err(error) => unavailable(error),
    };
    let status = if result.get("ok") == Some(&json!(true)) {
        StatusCode::OK
    } else {
        StatusCode::SERVICE_UNAVAILABLE
    };
    fastify_reply::json(status, &result)
}
