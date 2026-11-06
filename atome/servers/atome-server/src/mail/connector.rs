// A person's IMAP/SMTP account as the mail service reaches it (atome/src/squirrel/mail/
// icloud_connector.js and icloud_connector_normalization.js): every operation opens its own
// connection (connect, the operation, then LOGOUT or QUIT whatever happened), and answers as the
// connector does — the messages read normalized (`normalizeConnectorMessage`), a refusal named by the
// connector's step with the client's message.
use super::imap::{Imap, Message};
use super::mime::text_of;
use super::smtp::{Auth, Smtp};
use super::socket::Transport;
use crate::vault_router::js;
use serde_json::{Value as JsonValue, json};
use std::sync::Arc;
use tokio_rustls::rustls::ClientConfig;

/// `normalizeRemoteMailbox`.
pub fn remote_mailbox(value: &str) -> String {
    let upper = js::trim(value).to_uppercase();
    if upper.is_empty() {
        "INBOX".into()
    } else {
        upper
    }
}

/// `normalizeLocalMailbox`.
pub fn local_mailbox(value: &str) -> String {
    let lower = js::trim(value).to_lowercase();
    if lower.is_empty() {
        "inbox".into()
    } else {
        lower
    }
}

pub struct Connector {
    pub provider: String,
    // The account's mailbox, as the server names it.
    pub mailbox: String,
    auth: Auth,
    imap: Transport,
    smtp: Transport,
    tls: Arc<ClientConfig>,
}

fn failed(code: &str, error: &str, default: &str) -> JsonValue {
    json!({ "ok": false, "error": code, "message": if error.is_empty() { default } else { error } })
}

fn email_address(value: Option<&JsonValue>) -> JsonValue {
    let Some(value) = value.filter(|value| js::truthy(Some(value))) else {
        return JsonValue::Null;
    };
    let address = text_of(js::first(value, &["address", "email"]));
    if address.is_empty() {
        return JsonValue::Null;
    }
    let name =
        Some(text_of(js::first(value, &["name", "displayName"]))).filter(|name| !name.is_empty());
    json!({ "name": name, "address": address })
}

// `toTimestamp(value, 0)`: a number as it is, else the date it reads as, else 0.
fn timestamp(value: Option<&str>) -> f64 {
    let Some(value) = value else {
        return 0.0;
    };
    let number = js::number(Some(&json!(value)));
    if number.is_finite() {
        return number;
    }
    super::dates::parse(value).map_or(0.0, |ms| ms as f64)
}

impl Connector {
    /// `createIcloudMailConnector` with the credentials the gateway resolved.
    pub fn new(
        provider: &str,
        mailbox: &str,
        auth: Auth,
        imap: Transport,
        smtp: Transport,
        tls: Arc<ClientConfig>,
    ) -> Self {
        let transport = |input: Transport, host: &str, port: f64, security: &str| {
            let given = js::trim(&input.host);
            let kind = js::trim(&input.security).to_lowercase();
            Transport {
                host: if given.is_empty() {
                    host.into()
                } else {
                    given.into()
                },
                port: if input.port.is_finite() {
                    input.port
                } else {
                    port
                },
                security: if kind.is_empty() {
                    security.into()
                } else {
                    kind
                },
            }
        };
        Self {
            provider: if provider.is_empty() {
                "icloud_imap_smtp".into()
            } else {
                provider.into()
            },
            mailbox: remote_mailbox(mailbox),
            auth,
            imap: transport(imap, "imap.mail.me.com", 993.0, "tls"),
            smtp: transport(smtp, "smtp.mail.me.com", 587.0, "starttls"),
            tls,
        }
    }

    // `normalizeConnectorMessage` of a fetched message.
    fn message(&self, message: Message, local: &str) -> JsonValue {
        let parsed = message.parsed;
        let message_id = js::trim(&message.message_id).to_string();
        let thread = parsed
            .in_reply_to
            .clone()
            .or_else(|| parsed.references.first().cloned())
            .unwrap_or_else(|| message_id.clone());
        let thread = js::trim(&thread).to_string();
        let list = |entries: &[JsonValue]| {
            JsonValue::Array(
                entries
                    .iter()
                    .map(|entry| email_address(Some(entry)))
                    .filter(|e| !e.is_null())
                    .collect(),
            )
        };
        let uid = (message.uid != 0.0).then(|| js::string(&js::number_json(message.uid)));
        json!({
            "message_id": message_id,
            "thread_id": if thread.is_empty() { message_id.clone() } else { thread },
            "mailbox": local,
            "subject": js::trim(&parsed.subject),
            "preview": js::trim(&parsed.preview),
            "body_text": js::trim(&parsed.body_text),
            "received_at": js::number_json(timestamp(message.internal_date.as_deref())),
            "unread": message.unread,
            "flags": message.flags,
            "from": email_address(parsed.from.as_ref()),
            "to": list(&parsed.to),
            "cc": list(&parsed.cc),
            "bcc": list(&parsed.bcc),
            "source": { "provider": self.provider, "mailbox": local, "remote_mailbox": remote_mailbox(local) },
            "meta": { "uid": uid, "modseq": null, "cursor": null }
        })
    }

    fn imap(&self, mailbox: String) -> Imap {
        Imap::new(
            self.imap.clone(),
            self.tls.clone(),
            self.auth.clone(),
            mailbox,
        )
    }

    /// `fetchInitialMailbox` / `fetchDelta`: the read payload, normalized.
    pub async fn fetch(
        &self,
        delta: bool,
        mailbox: &str,
        limit: f64,
        cursor: Option<&str>,
    ) -> JsonValue {
        let asked = if mailbox.is_empty() {
            self.mailbox.as_str()
        } else {
            mailbox
        };
        let local = local_mailbox(asked);
        let cursor = cursor.map(js::trim).filter(|cursor| !cursor.is_empty());
        let limit = if limit.is_finite() { limit } else { 50.0 };
        let mut client = self.imap(remote_mailbox(asked));
        let read = async {
            client.connect().await?;
            client.fetch(delta, limit, cursor).await
        }
        .await;
        client.close().await;
        let mode = if delta { "delta" } else { "initial" };
        match read {
            Ok(fetched) => json!({
                "ok": true, "provider": self.provider, "mailbox": local,
                "cursor": fetched.cursor.map(|c| js::trim(&c).to_string()).filter(|c| !c.is_empty()),
                "mode": mode,
                "messages": fetched.messages.into_iter().map(|m| self.message(m, &local)).collect::<Vec<_>>(),
            }),
            Err(error) if delta => failed(
                "icloud_imap_delta_failed",
                &error,
                "Unable to fetch the incremental mailbox delta",
            ),
            Err(error) => failed(
                "icloud_imap_initial_failed",
                &error,
                "Unable to fetch the initial mailbox snapshot",
            ),
        }
    }

    /// `sendDraft(draft)`: the message sent, the server's id for it.
    pub async fn send(&self, draft: &JsonValue) -> JsonValue {
        let mut client = Smtp::new(self.smtp.clone(), self.tls.clone());
        let sent = async {
            client.connect(&self.auth).await?;
            client.send(draft, &self.auth).await
        }
        .await;
        client.close().await;
        let draft_id = Some(text_of(draft.get("draft_id"))).filter(|id| !id.is_empty());
        match sent {
            Ok(payload) => {
                let remote = Some(text_of(js::first(
                    &payload,
                    &["message_id", "messageId", "remote_id", "remoteId", "id"],
                )))
                .filter(|id| !id.is_empty());
                let accepted = js::number(payload.get("accepted_at"));
                let accepted = if accepted.is_finite() {
                    accepted
                } else {
                    crate::auth::now_ms().floor()
                };
                json!({ "ok": true, "provider": self.provider, "sent": true, "draft_id": draft_id, "remote_id": remote,
                    "message_id": remote, "accepted_at": js::number_json(accepted), "response": payload })
            }
            Err(error) => failed(
                "icloud_smtp_send_failed",
                &error,
                "Unable to deliver the draft through SMTP",
            ),
        }
    }

    // The message's UID and the mailbox the server holds it in.
    fn located(&self, message: &JsonValue) -> (String, String) {
        let uid = text_of(
            js::first(message.get("meta").unwrap_or(&JsonValue::Null), &["uid"])
                .or_else(|| js::first(message, &["uid"])),
        );
        let source = message.get("source").unwrap_or(&JsonValue::Null);
        let mailbox = js::first(source, &["remote_mailbox", "mailbox"])
            .or_else(|| js::first(message, &["mailbox"]))
            .map_or_else(|| self.mailbox.clone(), |mailbox| js::text(Some(mailbox)));
        (uid, remote_mailbox(&mailbox))
    }

    /// `markRead(message, { read })`.
    pub async fn mark_read(&self, message: &JsonValue, read: bool) -> JsonValue {
        let (uid, mailbox) = self.located(message);
        let mut client = self.imap(mailbox);
        let done = async {
            client.connect().await?;
            client.mark_read(&uid, read).await
        }
        .await;
        client.close().await;
        match done {
            Ok(()) => json!({ "ok": true, "provider": self.provider, "uid": uid }),
            Err(error) => failed(
                "icloud_imap_mark_read_failed",
                &error,
                "Unable to mark the message as read",
            ),
        }
    }

    /// `archiveMessage` (`Archive`) or `deleteMessage` (`Trash`): the message moved there.
    pub async fn move_message(&self, message: &JsonValue, destination: &str) -> JsonValue {
        let (uid, mailbox) = self.located(message);
        let mut client = self.imap(mailbox);
        let done = async {
            client.connect().await?;
            client.move_message(&uid, destination).await
        }
        .await;
        client.close().await;
        match done {
            Ok(()) => json!({ "ok": true, "provider": self.provider, "uid": uid }),
            Err(error) => failed(
                "icloud_imap_move_failed",
                &error,
                "Unable to move the message",
            ),
        }
    }
}
