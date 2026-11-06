// The Spotify session (server/music/spotify_session.js and spotify_http.js, ported): sealed in the
// person's vault (`music.spotify`), refreshed one at a time per person and written after the
// person's previous write; every URL assembled here, never from a tool's input; each call checked
// against the session it began with. The official consent goes through oauth.rs (PKCE).
use super::Mf;
use crate::providers::credentials::{Credentials, Locks};
use crate::providers::generation::now_ms;
use crate::providers::oauth::{self, Complete, Current, OAuth};
use crate::vault_router::js;
use futures_util::future::BoxFuture;
use serde_json::{Value as JsonValue, json};
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};

pub const SCOPES: [&str; 7] = [
    "user-library-read",
    "user-library-modify",
    "playlist-read-private",
    "playlist-read-collaborative",
    "playlist-modify-private",
    "user-read-playback-state",
    "user-modify-playback-state",
];

pub type Check<'a> = Box<dyn Fn() -> BoxFuture<'a, Result<(), Mf>> + Send + Sync + 'a>;

/// A call's view of its person: the vault, the application, the check every step repeats.
pub struct Session<'a> {
    pub vault: &'a Credentials,
    pub client_id: String,
    pub principal: &'a str,
    pub locks: &'a Locks,
    pub check: Check<'a>,
    // During the authorization itself there is no sealed session to compare with yet.
    pub pending: bool,
    pub accepted: AtomicBool,
}

fn status_code(status: u16) -> &'static str {
    match status {
        401 => "AUTHORIZATION_REQUIRED",
        403 => "PERMISSION_DENIED",
        404 => "ITEM_NOT_FOUND",
        429 => "RATE_LIMITED",
        500.. => "PROVIDER_UNAVAILABLE",
        _ => "PROVIDER_REJECTED",
    }
}

/// `spotifyFetch`: a refused or lost answer as a music failure; an effect's lost answer uncertain.
async fn fetch(request: reqwest::RequestBuilder, effect: bool) -> Result<JsonValue, Mf> {
    let response = crate::providers::http::send(request)
        .await
        .map_err(|_| Mf::uncertain("PROVIDER_UNAVAILABLE", effect))?;
    let status = response.status().as_u16();
    if !response.status().is_success() {
        return Err(Mf::uncertain(status_code(status), effect && status >= 500));
    }
    if status == 204 {
        return Ok(JsonValue::Null);
    }
    let bytes = crate::providers::http::bytes(response, usize::MAX)
        .await
        .map_err(|_| Mf::uncertain("PROVIDER_UNAVAILABLE", effect))?;
    serde_json::from_slice(&bytes).map_err(|_| Mf::uncertain("PROVIDER_UNAVAILABLE", effect))
}

/// `tokenRecord`: a token answer kept with what the previous record knew.
pub fn token_record(token: &JsonValue, previous: &JsonValue) -> Result<JsonValue, Mf> {
    let expires_in = js::number(token.get("expires_in"));
    let bearer = token
        .get("token_type")
        .and_then(JsonValue::as_str)
        .is_some_and(|t| t.to_lowercase() == "bearer");
    if !js::truthy(token.get("access_token")) || !bearer || expires_in.is_nan() || expires_in <= 0.0
    {
        return Err(Mf::new("PROVIDER_REJECTED"));
    }
    let now = now_ms();
    let mut record = previous.as_object().cloned().unwrap_or_default();
    record.insert("access_token".into(), token["access_token"].clone());
    // A refresh answer may omit the refresh token: the previous one stays.
    if let Some(refresh) = token.get("refresh_token").filter(|v| js::truthy(Some(v))) {
        record.insert("refresh_token".into(), refresh.clone());
    }
    let authorization = previous
        .get("authorization_id")
        .filter(|v| js::truthy(Some(v)))
        .cloned()
        .unwrap_or_else(|| json!(oauth::hex(16)));
    record.insert("authorization_id".into(), authorization);
    record.insert(
        "expires_at".into(),
        js::number_json(now as f64 + expires_in * 1000.0),
    );
    record.insert(
        "authorized_at".into(),
        previous
            .get("authorized_at")
            .filter(|v| js::truthy(Some(v)))
            .cloned()
            .unwrap_or_else(|| json!(now)),
    );
    let scopes = match token.get("scope") {
        Some(JsonValue::String(scope)) => json!(
            scope
                .split(' ')
                .filter(|s| !s.is_empty())
                .collect::<Vec<_>>()
        ),
        _ => previous
            .get("scopes")
            .filter(|v| js::truthy(Some(v)))
            .cloned()
            .unwrap_or_else(|| json!([])),
    };
    record.insert("scopes".into(), scopes);
    Ok(JsonValue::Object(record))
}

/// The token endpoint with the application's id and `fields`.
pub async fn token(client_id: &str, fields: &[(&str, &str)]) -> Result<JsonValue, Mf> {
    let mut pairs = vec![("client_id", client_id)];
    pairs.extend_from_slice(fields);
    fetch(
        crate::providers::http::client()
            .post("https://accounts.spotify.com/api/token")
            .header("Content-Type", "application/x-www-form-urlencoded")
            .body(crate::providers::http::form(&pairs)),
        false,
    )
    .await
}

impl Session<'_> {
    async fn check(&self) -> Result<(), Mf> {
        (self.check)().await
    }

    async fn sealed(&self) -> Result<Option<JsonValue>, Mf> {
        self.vault
            .read_record("music.spotify")
            .await
            .map_err(Mf::from)
    }

    /// `spotifySession`: the sealed session, refreshed when it is about to expire.
    pub async fn record(&self) -> Result<JsonValue, Mf> {
        self.check().await?;
        let Some(record) = self.sealed().await? else {
            return Err(Mf::new("AUTHORIZATION_REQUIRED"));
        };
        self.check().await?;
        if (now_ms() as f64) < js::number(record.get("expires_at")) - 30_000.0 {
            return Ok(record);
        }
        let _refreshing = self.locks.refreshing(self.principal).await;
        // Another call may have refreshed it meanwhile.
        let Some(record) = self.sealed().await? else {
            return Err(Mf::new("AUTHORIZATION_REQUIRED"));
        };
        self.check().await?;
        if (now_ms() as f64) < js::number(record.get("expires_at")) - 30_000.0 {
            return Ok(record);
        }
        let Some(refresh) = record
            .get("refresh_token")
            .filter(|v| js::truthy(Some(v)))
            .map(js::string)
        else {
            return Err(Mf::new("AUTHORIZATION_REQUIRED"));
        };
        let answered = token(
            &self.client_id,
            &[("grant_type", "refresh_token"), ("refresh_token", &refresh)],
        )
        .await;
        let updated = match answered.and_then(|answer| token_record(&answer, &record)) {
            Ok(updated) => updated,
            Err(failure)
                if ["PROVIDER_REJECTED", "AUTHORIZATION_REQUIRED"]
                    .contains(&failure.code.as_str()) =>
            {
                return Err(Mf::new("AUTHORIZATION_REQUIRED"));
            }
            Err(failure) => return Err(failure),
        };
        self.check().await?;
        let _writing = self.locks.writing(self.principal).await;
        self.check().await?;
        let current = self.sealed().await?;
        self.check().await?;
        if current.is_none_or(|current| current.get("access_token") != record.get("access_token")) {
            return Err(Mf::new("CONTEXT_CHANGED"));
        }
        self.vault
            .store_record("music.spotify", updated.clone())
            .await
            .map_err(Mf::from)?;
        self.check().await?;
        Ok(updated)
    }

    /// The session's record sealed after the person's previous session write.
    pub async fn seal(&self, record: Option<JsonValue>) -> Result<(), Mf> {
        let _writing = self.locks.writing(self.principal).await;
        self.check().await?;
        match record {
            Some(record) => self
                .vault
                .store_record("music.spotify", record)
                .await
                .map_err(Mf::from)?,
            None => self
                .vault
                .remove_record("music.spotify")
                .await
                .map_err(Mf::from)?,
        }
        self.check().await
    }

    async fn same_session(&self, record: &JsonValue) -> Result<(), Mf> {
        self.check().await?;
        if !self.pending {
            let current = self.sealed().await?;
            self.check().await?;
            let id = record
                .get("authorization_id")
                .filter(|v| js::truthy(Some(v)));
            if id.is_none() || current.as_ref().and_then(|c| c.get("authorization_id")) != id {
                return Err(Mf::new("CONTEXT_CHANGED"));
            }
        }
        Ok(())
    }

    /// `spotifyApi`: one Web API call within the session it began with.
    pub async fn api(
        &self,
        record: &JsonValue,
        path: &str,
        method: reqwest::Method,
        body: Option<JsonValue>,
        effect: bool,
    ) -> Result<JsonValue, Mf> {
        self.same_session(record).await?;
        let mut request = crate::providers::http::client()
            .request(method, format!("https://api.spotify.com/v1{path}"))
            .header(
                "Authorization",
                format!("Bearer {}", js::text(record.get("access_token"))),
            )
            .header("Content-Type", "application/json");
        if let Some(body) = body {
            request = request.body(body.to_string());
        }
        let result = fetch(request, effect).await?;
        if effect {
            self.accepted.store(true, Ordering::Relaxed);
        }
        self.same_session(record).await?;
        Ok(result)
    }

    pub(super) async fn get(&self, record: &JsonValue, path: &str) -> Result<JsonValue, Mf> {
        self.api(record, path, reqwest::Method::GET, None, false)
            .await
    }

    pub fn accepted(&self) -> bool {
        self.accepted.load(Ordering::Relaxed)
    }
}

/// The authorization's own end: the code exchanged with its PKCE verifier, every scope granted,
/// the Spotify account read, the session sealed.
async fn authorized(
    session: &Session<'_>,
    code: &str,
    redirect: &str,
    verifier: &str,
) -> Result<JsonValue, Mf> {
    let fields = [
        ("grant_type", "authorization_code"),
        ("code", code),
        ("redirect_uri", redirect),
        ("code_verifier", verifier),
    ];
    let mut record = token_record(&token(&session.client_id, &fields).await?, &json!({}))?;
    session.check().await?;
    let scopes = record["scopes"].as_array().cloned().unwrap_or_default();
    if !js::truthy(record.get("refresh_token"))
        || SCOPES.iter().any(|scope| !scopes.contains(&json!(scope)))
    {
        return Err(Mf::new("PERMISSION_DENIED"));
    }
    let profile = session.get(&record, "/me").await?;
    if !js::truthy(profile.get("id")) || !js::truthy(profile.get("account_id")) {
        return Err(Mf::new("PROVIDER_REJECTED"));
    }
    let name = profile
        .get("display_name")
        .filter(|name| js::truthy(Some(name)))
        .map(js::string)
        .unwrap_or_default();
    record["identity"] = json!({ "id": profile["account_id"], "name": name });
    record["spotify_user_id"] = profile["id"].clone();
    session.seal(Some(record.clone())).await?;
    Ok(json!({ "state": "connected", "identity": record["identity"] }))
}

/// `startSpotifyConnection`: the official consent page for this application, bound to a PKCE
/// verifier; its completion, on the provider's redirect, seals the session.
pub fn connect(
    oauth: &Arc<OAuth>,
    vault: Credentials,
    client_id: &str,
    public_base: &str,
    locks: Arc<Locks>,
    principal: &str,
) -> Result<JsonValue, Mf> {
    use base64::Engine;
    let mut secret = [0u8; 48];
    ring::rand::SecureRandom::fill(&ring::rand::SystemRandom::new(), &mut secret).expect("random");
    let encode = |bytes: &[u8]| base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(bytes);
    let verifier = encode(&secret);
    let challenge =
        encode(ring::digest::digest(&ring::digest::SHA256, verifier.as_bytes()).as_ref());
    let (application, owner) = (client_id.to_string(), principal.to_string());
    let complete: Complete = Box::new(move |code: String, redirect: String, current: Current| {
        Box::pin(async move {
            let check: Check = Box::new(move || {
                let current = current.clone();
                Box::pin(async move {
                    if current() {
                        Ok(())
                    } else {
                        Err(Mf::new("social_cancelled"))
                    }
                })
            });
            let session = Session {
                vault: &vault,
                client_id: application,
                principal: &owner,
                locks: &locks,
                check,
                pending: true,
                accepted: AtomicBool::new(false),
            };
            let deadline = std::time::Duration::from_secs(20);
            let ended =
                tokio::time::timeout(deadline, authorized(&session, &code, &redirect, &verifier))
                    .await
                    .unwrap_or_else(|_| Err(Mf::new("PROVIDER_UNAVAILABLE")));
            // The shared callback tells only its typed codes.
            ended.map_err(|failure| match failure.code.as_str() {
                "social_cancelled" => failure.code,
                code => super::music_error(code).to_string(),
            })
        })
    });
    let authorize = |state: &str, redirect: &str| {
        let mut url =
            url::Url::parse("https://accounts.spotify.com/authorize").expect("Spotify's address");
        url.query_pairs_mut()
            .append_pair("client_id", client_id)
            .append_pair("response_type", "code")
            .append_pair("redirect_uri", redirect)
            .append_pair("state", state)
            .append_pair("code_challenge_method", "S256")
            .append_pair("code_challenge", &challenge)
            .append_pair("scope", &SCOPES.join(" "));
        url.to_string()
    };
    Ok(oauth.start(principal, "spotify", public_base, authorize, complete)?)
}

/// `disconnectSpotify`: any pending consent cancelled and the session removed from atome (the
/// provider's own grant stays: atome cannot revoke it).
pub async fn disconnect(oauth: &OAuth, session: &Session<'_>) -> Result<JsonValue, Mf> {
    session.check().await?;
    oauth.cancel(session.principal, "", Some("spotify"));
    session.seal(None).await?;
    Ok(json!({ "state": "disconnected", "provider_revoked": false }))
}
