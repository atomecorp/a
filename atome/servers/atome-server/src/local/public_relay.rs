use super::local_atome::RemoteSyncCredential;
use futures_util::{SinkExt, StreamExt};
use serde_json::{Value, json};
use tokio::time::{Duration, timeout};
use tokio_tungstenite::tungstenite::Message;

// Public, unauthenticated /ws/api operations owned by Fastify (YouTube search,
// PeerTube search and stream resolution,
// television catalogue, YouTube live resolution, the shows around a position, the films and series
// of Divertissement › Vidéo, GPS resources, Open Food
// Facts, the free book catalogs, the Médiathèque's free media and the bug reports
// kept on atome.one, the shop's sales everyone browses, the coaches' directory, the health reference bundle's
// manifest and chunks). The desktop runtime has no copy of them: it forwards the frame,
// without any credential, to the configured Fastify server and returns its
// single reply.
pub(super) const PUBLIC_TYPES: [&str; 20] = [
    "youtube-search",
    "peertube-search",
    "peertube-resolve",
    "tv-catalog",
    "tv-resolve",
    "shows-nearby",
    "video-catalog",
    "gps-resource",
    "food-facts",
    "book-source",
    "book-fetch",
    "media-library-search",
    "media-library-fetch",
    "bug-report-submit",
    "bug-report-status",
    "feature-request-roadmap",
    "shop-public",
    "coaches-public",
    "tone3000",
    "health-reference",
];

// The account's own /ws/api operations that live on atome.one alone (register R-115): its roles and the admin's
// feature requests (server/auth_account_roles.js, server/ws_feature_requests.js) and the shares between accounts
// (server/syncSharingService.js). The desktop runtime forwards them with the account's remote credential, never the
// local token, once the local session is verified; the server checks the account and its rights again.
pub(super) const ACCOUNT_TYPES: [&str; 3] = ["account-roles", "feature-request-admin", "share"];

fn failure_code(request_type: &str) -> &'static str {
    match request_type {
        "youtube-search" => "youtube_search_unavailable",
        "peertube-search" => "peertube_search_unavailable",
        "peertube-resolve" => "peertube_resolve_unavailable",
        _ => "PROVIDER_UNAVAILABLE",
    }
}

pub async fn relay(request: &Value) -> Value {
    let base = std::env::var("SQUIRREL_FASTIFY_URL").unwrap_or_else(|_| "https://atome.one".into());
    forward(request, &base, None).await
}

// An account frame, signed with the remote credential of the verified local account.
pub(super) async fn relay_signed(request: &Value, credential: &RemoteSyncCredential) -> Value {
    forward(request, &credential.remote_url, Some(&credential.token)).await
}

async fn forward(request: &Value, base: &str, token: Option<&str>) -> Value {
    let request_type = request
        .get("type")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string();
    let response_type = format!("{request_type}-response");
    let request_id = request
        .get("requestId")
        .or_else(|| request.get("request_id"))
        .cloned()
        .unwrap_or(Value::Null);
    let failure = |error: &str| {
        json!({"type":response_type, "requestId":request_id,
        "success":false, "ok":false, "error":error})
    };
    let unavailable = failure_code(&request_type);
    let Ok(mut endpoint) = reqwest::Url::parse(base) else {
        return failure("service_invalid");
    };
    let scheme = match endpoint.scheme() {
        "https" => "wss",
        "http" if matches!(endpoint.host_str(), Some("localhost" | "127.0.0.1" | "::1")) => "ws",
        _ => return failure("service_invalid"),
    };
    if endpoint.set_scheme(scheme).is_err() {
        return failure("service_invalid");
    }
    endpoint.set_path("/ws/api");
    endpoint.set_query(None);
    endpoint.set_fragment(None);
    let Ok(Ok((mut socket, _))) = timeout(
        Duration::from_secs(8),
        crate::tls::connect_ws(endpoint.to_string(), None),
    )
    .await
    else {
        return failure(unavailable);
    };
    let mut outgoing = request.clone();
    if let Some(fields) = outgoing.as_object_mut() {
        match token {
            Some(token) => fields.insert("token".to_string(), Value::String(token.to_string())),
            None => fields.remove("token"),
        };
    }
    if socket
        .send(Message::Text(outgoing.to_string().into()))
        .await
        .is_err()
    {
        return failure(unavailable);
    }
    // The catalogue may be built on the first request: allow it more time.
    let Ok(Some(Ok(Message::Text(text)))) = timeout(Duration::from_secs(60), socket.next()).await
    else {
        return failure(unavailable);
    };
    let Ok(response) = serde_json::from_str::<Value>(&text) else {
        return failure(unavailable);
    };
    if response.get("type").and_then(Value::as_str) != Some(response_type.as_str())
        || response.get("requestId") != Some(&request_id)
    {
        return failure(unavailable);
    }
    response
}
