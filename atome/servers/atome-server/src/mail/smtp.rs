// The SMTP client (atome/src/squirrel/mail/node_protocol_clients.js `NodeSmtpClient`, the protocol's,
// not iCloud's: the server's own sender uses it too): greeting, EHLO, STARTTLS when the transport asks
// it, AUTH LOGIN, then one plain-text message (`buildPlainTextMessage`: UTF-8, 8bit, RFC 2047 words
// for a name or a subject past ASCII, dot-stuffed) and QUIT. Every refusal names its step and the
// server's lines, as the JavaScript client does.
use super::dates;
use super::mime::{LINE_BREAK, is_space, regex, text_of};
use super::socket::{self, Socket, Transport};
use crate::vault_router::js;
use base64::Engine;
use regex::Regex;
use serde_json::{Value as JsonValue, json};
use std::collections::HashSet;
use std::sync::{Arc, LazyLock};
use tokio_rustls::rustls::ClientConfig;

static DOT_LINE: LazyLock<Regex> = LazyLock::new(|| regex(r"(^|\r\n)\."));
static LINE_BREAK_RUN: LazyLock<Regex> = LazyLock::new(|| regex(r"\n+"));
static ANGLED: LazyLock<Regex> = LazyLock::new(|| regex(r"<[^>]+>"));

/// The account a client logs in with (`normalizeAuthConfig`): trimmed, none when blank.
#[derive(Clone, Debug, Default)]
pub struct Auth {
    pub username: Option<String>,
    pub password: Option<String>,
}

pub struct Smtp {
    transport: Transport,
    tls: Arc<ClientConfig>,
    socket: Option<Socket>,
}

struct Reply {
    code: u16,
    lines: Vec<String>,
}

impl Reply {
    fn failed(&self, step: &str) -> String {
        format!("{step}:{}", self.lines.join(" | "))
    }
}

// `/^(\d{3})([\s-])(.*)$/`: a reply line, and whether it is the last (a space after its code).
fn reply_line(line: &str) -> Option<(u16, bool)> {
    let mut chars = line.chars();
    let code: String = chars.by_ref().take(3).collect();
    if code.len() != 3 || !code.bytes().all(|b| b.is_ascii_digit()) {
        return None;
    }
    let separator = chars.next().filter(|c| *c == '-' || is_space(*c))?;
    if chars.any(|c| matches!(c, '\n' | '\r' | '\u{2028}' | '\u{2029}')) {
        return None;
    }
    Some((code.parse().ok()?, separator == ' '))
}

impl Smtp {
    pub fn new(transport: Transport, tls: Arc<ClientConfig>) -> Self {
        Self {
            transport,
            tls,
            socket: None,
        }
    }

    fn socket(&mut self) -> Result<&mut Socket, String> {
        self.socket
            .as_mut()
            .ok_or_else(|| "socket_closed".to_string())
    }

    async fn read_reply(&mut self) -> Result<Reply, String> {
        let socket = self.socket()?;
        let mut lines = Vec::new();
        loop {
            let line = socket.read_line().await?;
            let parsed = reply_line(&line);
            lines.push(line);
            if let Some((code, true)) = parsed {
                return Ok(Reply { code, lines });
            }
        }
    }

    async fn command(&mut self, command: &str) -> Result<Reply, String> {
        self.socket()?
            .write(format!("{command}\r\n").as_bytes())
            .await?;
        self.read_reply().await
    }

    // `EHLO localhost`: the capabilities the server announces, by their first word.
    async fn ehlo(&mut self) -> Result<HashSet<String>, String> {
        let reply = self.command("EHLO localhost").await?;
        if reply.code != 250 {
            return Err(reply.failed("smtp_ehlo_failed"));
        }
        Ok(reply
            .lines
            .iter()
            .filter_map(|line| {
                let rest = line
                    .get(..3)
                    .filter(|code| code.eq_ignore_ascii_case("250"))
                    .map_or(line.as_str(), |_| &line[3..]);
                let rest = rest
                    .strip_prefix(|c: char| c == '-' || is_space(c))
                    .unwrap_or(rest);
                js::trim(rest)
                    .split(is_space)
                    .next()
                    .filter(|word| !word.is_empty())
                    .map(str::to_uppercase)
            })
            .collect())
    }

    /// `connect()`: greeting, EHLO, STARTTLS when asked, AUTH LOGIN.
    pub async fn connect(&mut self, auth: &Auth) -> Result<(), String> {
        self.socket = Some(socket::connect(&self.transport, &self.tls).await?);
        let greeting = self.read_reply().await?;
        if greeting.code != 220 {
            return Err(greeting.failed("smtp_bad_greeting"));
        }
        let capabilities = self.ehlo().await?;
        if js::trim(&self.transport.security).to_lowercase() == "starttls" {
            if !capabilities.contains("STARTTLS") {
                return Err("smtp_starttls_not_supported".into());
            }
            let started = self.command("STARTTLS").await?;
            if started.code != 220 {
                return Err(started.failed("smtp_starttls_failed"));
            }
            let host = self.transport.host.clone();
            self.socket()?.upgrade(&host).await?;
            self.ehlo().await?;
        }
        let username = js::trim(auth.username.as_deref().unwrap_or_default()).to_string();
        let password = js::trim(auth.password.as_deref().unwrap_or_default()).to_string();
        if username.is_empty() || password.is_empty() {
            return Err("smtp_auth_missing".into());
        }
        let encode =
            |value: &str| base64::engine::general_purpose::STANDARD.encode(value.as_bytes());
        let steps = [
            ("AUTH LOGIN".to_string(), 334, "smtp_auth_login_failed"),
            (encode(&username), 334, "smtp_auth_username_failed"),
            (encode(&password), 235, "smtp_auth_password_failed"),
        ];
        for (command, expected, step) in steps {
            let reply = self.command(&command).await?;
            if reply.code != expected {
                return Err(reply.failed(step));
            }
        }
        Ok(())
    }

    /// `sendDraft({ draft, auth })`: the message's envelope, its data, the server's id for it.
    pub async fn send(&mut self, draft: &JsonValue, auth: &Auth) -> Result<JsonValue, String> {
        let now = crate::auth::now_ms() as i64;
        let built = build_message(draft, auth.username.as_deref(), now)?;
        let reply = self
            .command(&format!("MAIL FROM:<{}>", built.sender))
            .await?;
        if reply.code != 250 {
            return Err(reply.failed("smtp_mail_from_failed"));
        }
        for recipient in &built.recipients {
            let reply = self.command(&format!("RCPT TO:<{recipient}>")).await?;
            if reply.code != 250 && reply.code != 251 {
                return Err(reply.failed("smtp_rcpt_to_failed"));
            }
        }
        let reply = self.command("DATA").await?;
        if reply.code != 354 {
            return Err(reply.failed("smtp_data_failed"));
        }
        let data = format!("{}\r\n.\r\n", dot_stuff(&built.raw));
        self.socket()?.write(data.as_bytes()).await?;
        let reply = self.read_reply().await?;
        if reply.code != 250 {
            return Err(reply.failed("smtp_data_commit_failed"));
        }
        let joined = reply.lines.join(" ");
        let remote = ANGLED
            .find(&joined)
            .map_or(built.message_id, |id| id.as_str().to_string());
        Ok(json!({ "ok": true, "message_id": remote, "accepted_at": crate::auth::now_ms() as i64 }))
    }

    /// `close()`: QUIT, its failure ignored, then the connection ended.
    pub async fn close(&mut self) {
        if self.socket.is_none() {
            return;
        }
        let _ = self.command("QUIT").await;
        if let Some(mut socket) = self.socket.take() {
            socket.end().await;
        }
    }
}

// `headerWord`: one line, an RFC 2047 encoded word as soon as it leaves printable ASCII.
fn header_word(value: &str) -> String {
    let joined = value.replace(['\r', '\n'], "\n");
    let joined = LINE_BREAK_RUN.replace_all(&joined, " ");
    let text = js::trim(&joined);
    if text.chars().all(|c| (' '..='~').contains(&c)) {
        return text.to_string();
    }
    format!(
        "=?UTF-8?B?{}?=",
        base64::engine::general_purpose::STANDARD.encode(text.as_bytes())
    )
}

fn format_address(name: Option<&str>, address: &str) -> String {
    let Some(name) = name else {
        return format!("<{address}>");
    };
    let word = header_word(name);
    let joined = name.replace(['\r', '\n'], "\n");
    let one_line = LINE_BREAK_RUN.replace_all(&joined, " ");
    if word == one_line {
        format!("\"{}\" <{address}>", word.replace('"', "\\\""))
    } else {
        format!("{word} <{address}>")
    }
}

/// `buildPlainTextMessage(draft, auth)`: what SMTP sends.
pub struct Built {
    pub sender: String,
    pub recipients: Vec<String>,
    pub message_id: String,
    pub raw: String,
}

pub fn build_message(draft: &JsonValue, username: Option<&str>, now: i64) -> Result<Built, String> {
    let from = match draft.get("from") {
        Some(JsonValue::Array(list)) if !list.is_empty() => Some(&list[0]),
        Some(value) if js::truthy(Some(value)) && (value.is_object() || value.is_array()) => {
            Some(value)
        }
        _ => None,
    };
    let sender = from
        .and_then(|from| from.get("address"))
        .filter(|address| js::truthy(Some(address)))
        .cloned()
        .or_else(|| {
            username
                .filter(|name| !name.is_empty())
                .map(|name| json!(name))
        })
        .ok_or("smtp_sender_missing")?;
    let sender_name =
        Some(text_of(from.and_then(|from| from.get("name")))).filter(|n| !n.is_empty());
    let to: Vec<&JsonValue> = match draft.get("to") {
        Some(JsonValue::Array(list)) => list
            .iter()
            .filter(|entry| js::truthy(entry.get("address")))
            .collect(),
        _ => Vec::new(),
    };
    if to.is_empty() {
        return Err("smtp_recipient_missing".into());
    }
    let entry_text = |entry: &JsonValue| -> Option<String> {
        let address = text_of(js::first(entry, &["address", "email"]));
        let name = Some(text_of(entry.get("name"))).filter(|name| !name.is_empty());
        (!address.is_empty()).then(|| format_address(name.as_deref(), &address))
    };
    // `senderAddress.includes('@')`: a sender that is no string fails there.
    let JsonValue::String(sender) = sender else {
        return Err("senderAddress.includes is not a function".into());
    };
    let domain = if sender.contains('@') {
        sender.split('@').nth(1).unwrap_or_default().to_string()
    } else {
        "localhost".into()
    };
    let message_id = match js::first(draft, &["message_id", "remote_id"]) {
        Some(id) => js::text(Some(id)),
        None => {
            let draft_id = js::first(draft, &["draft_id"])
                .map_or_else(|| format!("mail-{now}"), |id| js::text(Some(id)));
            format!("<{}@{domain}>", js::trim(&draft_id))
        }
    };
    let mut references = Vec::new();
    let in_reply_to = js::first(draft, &["in_reply_to"]).map(|value| js::text(Some(value)));
    references.extend(in_reply_to.clone());
    if let Some(JsonValue::Array(list)) = draft.get("references") {
        references.extend(list.iter().map(|entry| js::text(Some(entry))));
    }
    let subject =
        js::first(draft, &["subject"]).map_or_else(|| "(no subject)".into(), |s| js::text(Some(s)));
    let mut lines = vec![
        format!("Date: {}", dates::utc_string(now)),
        format!("Message-ID: {message_id}"),
        // `formatAddress` of a blank address is null, written as such.
        format!(
            "From: {}",
            Some(js::trim(&sender))
                .filter(|address| !address.is_empty())
                .map_or_else(
                    || "null".into(),
                    |address| format_address(sender_name.as_deref(), address)
                )
        ),
        format!(
            "To: {}",
            to.iter()
                .filter_map(|entry| entry_text(entry))
                .collect::<Vec<_>>()
                .join(", ")
        ),
        format!("Subject: {}", header_word(&subject)),
        "MIME-Version: 1.0".into(),
        "Content-Type: text/plain; charset=utf-8".into(),
        "Content-Transfer-Encoding: 8bit".into(),
    ];
    if let Some(in_reply_to) = in_reply_to {
        lines.push(format!("In-Reply-To: {in_reply_to}"));
    }
    if !references.is_empty() {
        lines.push(format!("References: {}", references.join(" ")));
    }
    let body = js::first(draft, &["body_text"])
        .map(|body| js::text(Some(body)))
        .unwrap_or_default();
    let body = LINE_BREAK.replace_all(&body, "\r\n");
    Ok(Built {
        sender,
        recipients: to
            .iter()
            .map(|entry| js::text(entry.get("address")))
            .collect(),
        message_id,
        raw: format!("{}\r\n\r\n{body}\r\n", lines.join("\r\n")),
    })
}

/// `dotStuffMessage`: CRLF lines, a line's leading dot doubled.
pub fn dot_stuff(message: &str) -> String {
    let lines = LINE_BREAK.replace_all(message, "\r\n");
    DOT_LINE.replace_all(&lines, "${1}..").into_owned()
}
