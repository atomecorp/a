// The SMS that carries a phone link (server/wsPhoneLinkAuth.js `deliverLink`,
// server/auth_sms_ovh.js, server/auth_secret_config.js `loadLocalSmsConfig`, ported):
// OVHcloud's SMS API, or, in development, no SMS at all, the link handed back
// (`SQUIRREL_AUTH_SMS_MOCK=1`, refused in production). A development machine may keep
// the OVH settings in `Private/ovh_sms.env` (owner-only, whitelisted keys; a setting
// already given wins). This transport owns delivery only; it never creates a proof.
use crate::settings::Settings;
use serde_json::{Value as JsonValue, json};
use std::path::Path;

const KEYS: [&str; 7] = [
    "OVH_API_ENDPOINT",
    "OVH_SMS_SERVICE_NAME",
    "OVH_SMS_SENDER",
    "OVH_API_APPLICATION_KEY",
    "OVH_API_APPLICATION_SECRET",
    "OVH_API_CONSUMER_KEY",
    "AUTH_SMS_DAILY_LIMIT",
];

struct Ovh {
    service: String,
    sender: String,
    credentials: crate::ovh::Credentials,
}

pub struct Sms {
    mock: bool,
    // The OVH settings, or why there are none (each send then fails).
    ovh: Result<Ovh, String>,
    /// SMS sent per day, every number together (`AUTH_SMS_DAILY_LIMIT`, 20 by default).
    pub daily_limit: i64,
}

impl Sms {
    pub fn load(settings: &Settings, project_root: &Path) -> Result<Self, String> {
        let production = settings.get("NODE_ENV").as_deref() == Some("production");
        let file = settings.secret_file(
            project_root,
            "ATOME_SMS_ENV_FILE",
            "ovh_sms.env",
            &KEYS,
            "sms_secret_file",
        )?;
        let value = |name: &str| {
            settings
                .value(name)
                .or_else(|| file.get(name).cloned())
                .unwrap_or_default()
                .trim()
                .to_string()
        };
        let mock = settings.value("SQUIRREL_AUTH_SMS_MOCK").as_deref() == Some("1");
        if mock && production {
            return Err("auth_sms_mock_forbidden_in_production".into());
        }
        // `Number(AUTH_SMS_DAILY_LIMIT || 20)`, a safe integer of at least one.
        let daily = settings
            .value("AUTH_SMS_DAILY_LIMIT")
            .or_else(|| file.get("AUTH_SMS_DAILY_LIMIT").cloned())
            .filter(|limit| !limit.is_empty())
            .unwrap_or_else(|| "20".into());
        let daily_limit = crate::vault_router::js::number(Some(&json!(daily)));
        if daily_limit.fract() != 0.0 || !(1.0..=9_007_199_254_740_991.0).contains(&daily_limit) {
            return Err("auth_budget_invalid".into());
        }
        let ovh = Ovh {
            service: value("OVH_SMS_SERVICE_NAME"),
            sender: value("OVH_SMS_SENDER"),
            credentials: crate::ovh::Credentials {
                application_key: value("OVH_API_APPLICATION_KEY"),
                application_secret: value("OVH_API_APPLICATION_SECRET"),
                consumer_key: value("OVH_API_CONSUMER_KEY"),
            },
        };
        let service_ok = ovh.service.strip_prefix("sms-").is_some_and(|rest| {
            !rest.is_empty()
                && rest
                    .bytes()
                    .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-')
        });
        let sender_ok = (1..=11).contains(&ovh.sender.len())
            && ovh.sender.bytes().all(|byte| byte.is_ascii_alphanumeric());
        let configured = settings
            .value("OVH_API_ENDPOINT")
            .or_else(|| file.get("OVH_API_ENDPOINT").cloned())
            == Some("ovh-eu".into())
            && service_ok
            && sender_ok
            && !ovh.credentials.application_key.is_empty()
            && !ovh.credentials.application_secret.is_empty()
            && !ovh.credentials.consumer_key.is_empty();
        Ok(Self {
            mock,
            ovh: if configured {
                Ok(ovh)
            } else {
                Err("sms_configuration_required".into())
            },
            daily_limit: daily_limit as i64,
        })
    }

    /// The link sent to `phone`: Ok with the link itself when no SMS is sent (development).
    pub async fn send(&self, phone: &str, link: &str) -> Result<Option<String>, String> {
        if self.mock {
            return Ok(Some(link.to_string()));
        }
        let ovh = self.ovh.as_ref().map_err(String::clone)?;
        if super::device_sessions::e164(Some(&json!(phone))).is_none() {
            return Err("sms_recipient_invalid".into());
        }
        // The link is this server's own (`https://atome.one/auth/v/<id>#t=<token>`).
        let result = ovh
            .request(
                "POST",
                &format!("/sms/{}/jobs", ovh.service),
                &json!({ "charset": "UTF-8", "class": "phoneDisplay",
                    "message": format!("atome - Validez votre connexion : {link}"), "noStopClause": true,
                    "priority": "high", "receivers": [phone], "sender": ovh.sender, "senderForResponse": false }),
            )
            .await?;
        let valid = result
            .get("validReceivers")
            .and_then(JsonValue::as_array)
            .is_some_and(|receivers| receivers.contains(&json!(phone)));
        let invalid = result
            .get("invalidReceivers")
            .and_then(JsonValue::as_array)
            .is_some_and(|receivers| !receivers.is_empty());
        if !valid || invalid {
            return Err("sms_provider_rejected".into());
        }
        Ok(None)
    }
}

impl Ovh {
    // A signed call through the one OVH client (ovh.rs). Provider bodies may hold recipients
    // or message text: never passed on. No retry: a timeout may come after OVH has accepted
    // the SMS.
    async fn request(
        &self,
        method: &str,
        resource: &str,
        payload: &JsonValue,
    ) -> Result<JsonValue, String> {
        crate::ovh::request(
            crate::ovh::EU_ENDPOINT,
            &self.credentials,
            method,
            resource,
            Some(payload),
        )
        .await
        .map_err(|failure| {
            match failure {
                crate::ovh::Failure::Uncertain => "sms_delivery_uncertain",
                crate::ovh::Failure::Unavailable => "sms_provider_unavailable",
                crate::ovh::Failure::Rejected(_) => "sms_provider_rejected",
                crate::ovh::Failure::CredentialsRejected => "sms_provider_credentials_rejected",
            }
            .to_string()
        })
    }
}
