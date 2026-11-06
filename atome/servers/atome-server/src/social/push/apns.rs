// APNs (server/apns_transport.js, ported): an OS delivery transport, never an application
// command endpoint. Its key (`APNS_KEY_PATH`, a .p8) signs a short ES256 bearer per send;
// a call goes to the `.voip` topic. APNs speaks HTTP/2 alone, chosen at the TLS handshake.
use super::{Send, Sending, Transport};
use serde_json::{Value as JsonValue, json};
use std::time::Duration;

pub struct Apns {
    key_id: String,
    team_id: String,
    key_path: String,
    topic: String,
    client: reqwest::Client,
}

fn variable(name: &str) -> String {
    std::env::var(name).unwrap_or_default()
}

// `/^[a-f0-9]{64,200}$/`.
fn token(value: &JsonValue) -> Option<&str> {
    value.as_str().filter(|token| {
        (64..=200).contains(&token.len())
            && token
                .bytes()
                .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
    })
}

impl Apns {
    /// From `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_KEY_PATH` and `APNS_TOPIC`.
    pub fn from_environment() -> Result<Self, String> {
        let client = crate::tls::http_client()?
            .timeout(Duration::from_secs(10))
            .build()
            .map_err(|e| e.to_string())?;
        Ok(Self {
            key_id: variable("APNS_KEY_ID"),
            team_id: variable("APNS_TEAM_ID"),
            key_path: variable("APNS_KEY_PATH"),
            topic: variable("APNS_TOPIC"),
            client,
        })
    }

    async fn deliver(
        &self,
        installation: &JsonValue,
        payload: &JsonValue,
        send: &Send,
    ) -> Result<JsonValue, String> {
        if !self.configured() {
            return Ok(json!({ "ok": false, "error": "apns_configuration_required" }));
        }
        let environment = installation["environment"]
            .as_str()
            .filter(|e| ["sandbox", "production"].contains(e));
        let (Some(token), Some(environment)) = (token(&installation["token"]), environment) else {
            return Err("apns_installation_invalid".into());
        };
        let bytes = payload.to_string();
        if bytes.len() > if send.voip { 5120 } else { 4096 } {
            return Err("apns_payload_too_large".into());
        }
        let Ok(key) = tokio::fs::read(&self.key_path).await else {
            return Ok(json!({ "ok": false, "error": "apns_configuration_required" }));
        };
        let mut header = jsonwebtoken::Header::new(jsonwebtoken::Algorithm::ES256);
        header.kid = Some(self.key_id.clone());
        let claims = json!({ "iss": self.team_id, "iat": chrono::Utc::now().timestamp() });
        let bearer = jsonwebtoken::EncodingKey::from_ec_pem(&key)
            .and_then(|key| jsonwebtoken::encode(&header, &claims, &key))
            .map_err(|_| "apns_configuration_required".to_string());
        let Ok(bearer) = bearer else {
            return Ok(json!({ "ok": false, "error": "apns_configuration_required" }));
        };
        let host = if environment == "sandbox" {
            "api.sandbox.push.apple.com"
        } else {
            "api.push.apple.com"
        };
        let topic = format!("{}{}", self.topic, if send.voip { ".voip" } else { "" });
        let sent = self
            .client
            .post(format!("https://{host}/3/device/{token}"))
            .header("authorization", format!("bearer {bearer}"))
            .header("apns-topic", topic)
            .header("apns-push-type", if send.voip { "voip" } else { "alert" })
            .header("apns-priority", if send.quiet { "5" } else { "10" })
            .header("apns-expiration", (send.expires_at / 1000).to_string())
            .header("apns-collapse-id", &send.collapse_id)
            .body(bytes)
            .send()
            .await;
        let Ok(response) = sent else {
            return Ok(json!({ "ok": false, "error": "apns_transport_uncertain" }));
        };
        let status = response.status().as_u16();
        let Ok(body) = response.text().await else {
            return Ok(json!({ "ok": false, "error": "apns_transport_uncertain" }));
        };
        let reason = serde_json::from_str::<JsonValue>(&body)
            .ok()
            .and_then(|body| body["reason"].as_str().map(str::to_string))
            .unwrap_or_default();
        let invalid = status == 410
            || ["BadDeviceToken", "DeviceTokenNotForTopic"].contains(&reason.as_str());
        let mut result = json!({ "ok": status == 200, "status": status, "invalidToken": invalid });
        if status != 200 {
            result["error"] = json!("apns_rejected");
        }
        Ok(result)
    }
}

impl Transport for Apns {
    fn configured(&self) -> bool {
        [&self.key_id, &self.team_id, &self.key_path, &self.topic]
            .iter()
            .all(|value| !value.is_empty())
    }

    fn send<'a>(
        &'a self,
        installation: &'a JsonValue,
        payload: &'a JsonValue,
        send: &'a Send,
    ) -> Sending<'a> {
        Box::pin(self.deliver(installation, payload, send))
    }
}
