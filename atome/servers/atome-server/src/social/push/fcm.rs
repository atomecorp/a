// Google FCM (server/fcm_transport.js, ported): an OS wake-up transport, application
// traffic stays on /ws/api. The service account (`FCM_SERVICE_ACCOUNT_PATH`, of project
// `FCM_PROJECT_ID`) holds the access token (google_access.rs); a send carries data alone, never a visible notification.
use super::{Send, Sending, Transport};
use crate::google_access::{AccessError, GoogleAccess};
use serde_json::{Value as JsonValue, json};
use std::time::Duration;

pub struct Fcm {
    project: String,
    account_path: String,
    client: reqwest::Client,
    access: GoogleAccess,
}

fn now_ms() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

// `/^[A-Za-z0-9_-]{22}$/`.
fn installation_token(value: &JsonValue) -> Option<&str> {
    value.as_str().filter(|token| {
        token.len() == 22
            && token
                .bytes()
                .all(|byte| byte.is_ascii_alphanumeric() || byte == b'_' || byte == b'-')
    })
}

// `/^[a-z0-9-]{6,63}$/`.
fn project_id(project: &str) -> bool {
    (6..=63).contains(&project.len())
        && project
            .bytes()
            .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'-')
}

// `/^[^\s@]+@[^\s@]+\.iam\.gserviceaccount\.com$/`.
fn service_email(email: &str) -> bool {
    let Some((name, domain)) = email.split_once('@') else {
        return false;
    };
    let Some(host) = domain.strip_suffix(".iam.gserviceaccount.com") else {
        return false;
    };
    let plain =
        |part: &str| !part.is_empty() && !part.chars().any(|c| c.is_whitespace() || c == '@');
    plain(name) && plain(host)
}

impl Fcm {
    /// From `FCM_PROJECT_ID` and `FCM_SERVICE_ACCOUNT_PATH`.
    pub fn from_environment() -> Result<Self, String> {
        let client = crate::tls::http_client()?
            .timeout(Duration::from_secs(10))
            .build()
            .map_err(|e| e.to_string())?;
        Ok(Self {
            project: std::env::var("FCM_PROJECT_ID").unwrap_or_default(),
            account_path: std::env::var("FCM_SERVICE_ACCOUNT_PATH").unwrap_or_default(),
            access: GoogleAccess::new(
                "https://www.googleapis.com/auth/firebase.messaging",
                client.clone(),
            ),
            client,
        })
    }

    async fn authorize(&self) -> Result<String, String> {
        let key = tokio::fs::read_to_string(&self.account_path)
            .await
            .ok()
            .and_then(|text| serde_json::from_str::<JsonValue>(&text).ok())
            .ok_or("fcm_configuration_required")?;
        let email = key["client_email"].as_str().unwrap_or_default();
        let (Some(private_key), true) = (
            key["private_key"].as_str(),
            key["project_id"] == self.project.as_str() && service_email(email),
        ) else {
            return Err("fcm_configuration_required".into());
        };
        self.access
            .token(email, private_key)
            .await
            .map_err(|error| match error {
                AccessError::Signing => "fcm_configuration_required".into(),
                AccessError::Unavailable => "fcm_authorization_unavailable".into(),
            })
    }

    async fn deliver(
        &self,
        installation: &JsonValue,
        payload: &JsonValue,
        send: &Send,
    ) -> Result<JsonValue, String> {
        if !self.configured() {
            return Ok(json!({ "ok": false, "error": "fcm_configuration_required" }));
        }
        let Some(token) =
            installation_token(&installation["token"]).filter(|_| project_id(&self.project))
        else {
            return Ok(json!({ "ok": false, "error": "fcm_installation_invalid" }));
        };
        let Ok(bearer) = self.authorize().await else {
            return Ok(json!({ "ok": false, "error": "fcm_authorization_unavailable" }));
        };
        let ttl = ((send.expires_at - now_ms()) / 1000).clamp(0, 86_400);
        if ttl == 0 {
            return Ok(json!({ "ok": false, "error": "push_call_expired" }));
        }
        let kind = if send.control {
            "call-state"
        } else if send.voip {
            "call"
        } else {
            "alert"
        };
        let mut android = json!({ "priority": if send.quiet { "NORMAL" } else { "HIGH" }, "ttl": format!("{ttl}s") });
        if send.voip {
            android["collapse_key"] = json!(send.collapse_id);
        }
        let body = json!({ "message": { "fid": token,
            "data": { "atome": payload["atome"].to_string(), "notification_kind": kind }, "android": android } })
        .to_string();
        if body.len() > 4096 {
            return Ok(json!({ "ok": false, "error": "fcm_payload_too_large" }));
        }
        let sent = self
            .client
            .post(format!(
                "https://fcm.googleapis.com/v1/projects/{}/messages:send",
                self.project
            ))
            .header("authorization", format!("Bearer {bearer}"))
            .header("content-type", "application/json")
            .body(body)
            .send()
            .await;
        let Ok(response) = sent else {
            return Ok(json!({ "ok": false, "error": "fcm_transport_uncertain" }));
        };
        let status = response.status().as_u16();
        if response.status().is_success() {
            return Ok(json!({ "ok": true, "status": status }));
        }
        if status == 401 {
            self.access.forget().await;
        }
        let reason = response
            .json::<JsonValue>()
            .await
            .ok()
            .and_then(|body| {
                body.pointer("/error/details")?
                    .as_array()?
                    .iter()
                    .find_map(|detail| {
                        detail["errorCode"]
                            .as_str()
                            .filter(|code| !code.is_empty())
                            .map(str::to_string)
                    })
            })
            .unwrap_or_default();
        Ok(
            json!({ "ok": false, "status": status, "invalidToken": reason == "UNREGISTERED", "error": "fcm_rejected" }),
        )
    }
}

impl Transport for Fcm {
    fn configured(&self) -> bool {
        !self.project.is_empty() && !self.account_path.is_empty()
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
