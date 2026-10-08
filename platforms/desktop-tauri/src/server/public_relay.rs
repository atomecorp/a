use futures_util::{SinkExt, StreamExt};
use serde_json::{json, Value};
use tokio::time::{timeout, Duration};
use tokio_tungstenite::{connect_async, tungstenite::Message};

// Public, unauthenticated /ws/api operations owned by Fastify (YouTube search,
// television catalogue and YouTube live resolution). The desktop runtime has
// no copy of them: it forwards the frame, without any credential, to the
// configured Fastify server and returns its single reply.
pub(super) const PUBLIC_TYPES: [&str; 3] = ["youtube-search", "tv-catalog", "tv-resolve"];

fn failure_code(request_type: &str) -> &'static str {
    if request_type == "youtube-search" { "youtube_search_unavailable" } else { "PROVIDER_UNAVAILABLE" }
}

pub(super) async fn relay(request: &Value) -> Value {
    let request_type = request.get("type").and_then(Value::as_str).unwrap_or_default().to_string();
    let response_type = format!("{request_type}-response");
    let request_id = request.get("requestId").or_else(|| request.get("request_id")).cloned().unwrap_or(Value::Null);
    let failure = |error: &str| json!({"type":response_type, "requestId":request_id,
        "success":false, "ok":false, "error":error});
    let unavailable = failure_code(&request_type);
    let base = std::env::var("SQUIRREL_FASTIFY_URL").unwrap_or_else(|_| "https://atome.one".into());
    let Ok(mut endpoint) = reqwest::Url::parse(&base) else { return failure("service_invalid"); };
    let scheme = match endpoint.scheme() {
        "https" => "wss",
        "http" if matches!(endpoint.host_str(), Some("localhost" | "127.0.0.1" | "::1")) => "ws",
        _ => return failure("service_invalid"),
    };
    if endpoint.set_scheme(scheme).is_err() { return failure("service_invalid"); }
    endpoint.set_path("/ws/api"); endpoint.set_query(None); endpoint.set_fragment(None);
    let Ok(Ok((mut socket, _))) = timeout(Duration::from_secs(8), connect_async(endpoint.to_string())).await
        else { return failure(unavailable); };
    let mut outgoing = request.clone();
    if let Some(fields) = outgoing.as_object_mut() { fields.remove("token"); }
    if socket.send(Message::Text(outgoing.to_string())).await.is_err() {
        return failure(unavailable);
    }
    // The catalogue may be built on the first request: allow it more time.
    let Ok(Some(Ok(Message::Text(text)))) = timeout(Duration::from_secs(60), socket.next()).await
        else { return failure(unavailable); };
    let Ok(response) = serde_json::from_str::<Value>(&text) else { return failure(unavailable); };
    if response.get("type").and_then(Value::as_str) != Some(response_type.as_str())
        || response.get("requestId") != Some(&request_id) {
        return failure(unavailable);
    }
    response
}
