// A Google service account's access token (OAuth 2 JWT bearer, an RS256 assertion), shared by
// every Google API the server calls: FCM (social/push/fcm.rs) and Google Play (billing/google.rs,
// scripts/android/play_api.mjs#createPlayAuthorization ported). One token per scope, reused by
// every call until a minute before it expires; held while one authorization runs.
use serde_json::{Value as JsonValue, json};
use tokio::sync::Mutex;

const TOKEN_URL: &str = "https://oauth2.googleapis.com/token";

pub enum AccessError {
    /// The account's private key cannot sign.
    Signing,
    /// Google's token endpoint could not be reached or refused.
    Unavailable,
}

pub struct GoogleAccess {
    scope: &'static str,
    client: reqwest::Client,
    // The access token and when it expires (ms).
    access: Mutex<Option<(String, i64)>>,
}

fn now_ms() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

impl GoogleAccess {
    pub fn new(scope: &'static str, client: reqwest::Client) -> Self {
        Self {
            scope,
            client,
            access: Mutex::new(None),
        }
    }

    /// Drops the token Google refused (401), so the next call authorizes again.
    pub async fn forget(&self) {
        *self.access.lock().await = None;
    }

    /// The access token of the account `email` signing with `private_key` (PEM).
    pub async fn token(&self, email: &str, private_key: &str) -> Result<String, AccessError> {
        let mut access = self.access.lock().await;
        if let Some((token, expires)) = access.as_ref()
            && *expires > now_ms() + 60_000
        {
            return Ok(token.clone());
        }
        let issued = now_ms() / 1000;
        let claims = json!({ "iss": email, "scope": self.scope, "aud": TOKEN_URL, "iat": issued, "exp": issued + 3600 });
        let assertion = jsonwebtoken::EncodingKey::from_rsa_pem(private_key.as_bytes())
            .and_then(|key| {
                jsonwebtoken::encode(
                    &jsonwebtoken::Header::new(jsonwebtoken::Algorithm::RS256),
                    &claims,
                    &key,
                )
            })
            .map_err(|_| AccessError::Signing)?;
        let form = [
            ("grant_type", "urn:ietf:params:oauth:grant-type:jwt-bearer"),
            ("assertion", assertion.as_str()),
        ];
        let response = self
            .client
            .post(TOKEN_URL)
            .form(&form)
            .send()
            .await
            .map_err(|_| AccessError::Unavailable)?;
        if !response.status().is_success() {
            return Err(AccessError::Unavailable);
        }
        let body: JsonValue = response
            .json()
            .await
            .map_err(|_| AccessError::Unavailable)?;
        let (Some(token), Some(expires_in)) =
            (body["access_token"].as_str(), body["expires_in"].as_f64())
        else {
            return Err(AccessError::Unavailable);
        };
        if !expires_in.is_finite() || expires_in <= 60.0 {
            return Err(AccessError::Unavailable);
        }
        *access = Some((
            token.to_string(),
            now_ms() + (expires_in.min(3600.0) * 1000.0) as i64,
        ));
        Ok(token.to_string())
    }
}
