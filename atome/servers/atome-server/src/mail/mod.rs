// Mail (server/system_mailer.js, server/mailRoutes.js and the protocol clients and service of
// atome/src/squirrel/mail/ they reach, ported): the server's own sender — an authenticated SMTP
// account of the domain's mail host (noreply@atome.one: SPF and DKIM are the host's), configured
// by the environment only (`ATOME_MAIL_FROM`, `ATOME_MAIL_SMTP_HOST`, `_PORT`, `_SECURITY` tls or
// starttls — `none` refused as clear text —, `_USER`, `_PASSWORD`); a server without it sends
// nothing and says so (`system_mail_unconfigured`) — and the personal mail gateway (gateway.rs).
// The clients are this crate's own, on tokio and rustls (socket.rs, smtp.rs, imap.rs).
mod connector;
mod dates;
pub mod gateway;
mod imap;
pub(crate) mod index;
pub(crate) mod mime;
mod smtp;
pub mod socket;

use crate::settings::Settings;
use crate::vault_router::js;
use serde_json::json;
use smtp::{Auth, Smtp};
use socket::Transport;
use std::sync::Arc;
use tokio_rustls::rustls::ClientConfig;

// The system sender's account, read once at start (`readSystemMailConfig`).
struct System {
    address: String,
    auth: Auth,
    smtp: Transport,
}

pub struct Mail {
    tls: Arc<ClientConfig>,
    system: Option<System>,
    // Where an invitation's link leads (`ATOME_SITE_ORIGIN`).
    origin: String,
    gateway: gateway::Gateway,
}

impl Mail {
    /// The environment's sender (an unknown security refuses the start, as Fastify's does) and the
    /// TLS client of every mail connection.
    pub fn load(settings: &Settings) -> Result<Self, String> {
        let set = |name: &str| settings.value(name).filter(|value| !value.is_empty());
        let address = js::trim(&set("ATOME_MAIL_FROM").unwrap_or_default()).to_string();
        let host = js::trim(&set("ATOME_MAIL_SMTP_HOST").unwrap_or_default()).to_string();
        let password = set("ATOME_MAIL_SMTP_PASSWORD").unwrap_or_default();
        let system = if address.is_empty() || host.is_empty() || password.is_empty() {
            None
        } else {
            let security =
                js::trim(&set("ATOME_MAIL_SMTP_SECURITY").unwrap_or_else(|| "tls".into()))
                    .to_lowercase();
            if security == "none" {
                return Err(socket::CLEARTEXT_REFUSED.into());
            }
            if security != "tls" && security != "starttls" {
                return Err("system_mail_security_invalid".into());
            }
            let port = set("ATOME_MAIL_SMTP_PORT")
                .unwrap_or_else(|| if security == "tls" { "465" } else { "587" }.into());
            let username =
                js::trim(&set("ATOME_MAIL_SMTP_USER").unwrap_or_else(|| address.clone()))
                    .to_string();
            Some(System {
                auth: Auth {
                    username: Some(username),
                    password: Some(password),
                },
                smtp: Transport {
                    host,
                    port: js::number(Some(&json!(port))),
                    security,
                },
                address,
            })
        };
        Ok(Self {
            tls: socket::tls_config()?,
            system,
            origin: set("ATOME_SITE_ORIGIN").unwrap_or_else(|| "https://atome.one".into()),
            gateway: gateway::Gateway::default(),
        })
    }

    pub fn origin(&self) -> &str {
        &self.origin
    }

    /// `createSystemMailer().send({ to, fromName, subject, text })`: one message from the server's
    /// own address. A failed connection is dropped as it is; a message tried ends with QUIT.
    pub async fn send_system(
        &self,
        to: &str,
        from_name: &str,
        subject: &str,
        text: &str,
    ) -> Result<(), String> {
        let system = self.system.as_ref().ok_or("system_mail_unconfigured")?;
        let mut client = Smtp::new(system.smtp.clone(), self.tls.clone());
        client.connect(&system.auth).await?;
        let draft = json!({ "from": { "name": from_name, "address": system.address },
            "to": [{ "address": to }], "subject": subject, "body_text": text });
        let sent = client.send(&draft, &system.auth).await;
        client.close().await;
        sent.map(drop)
    }
}
