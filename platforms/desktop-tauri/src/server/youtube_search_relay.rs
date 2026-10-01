use futures_util::{SinkExt, StreamExt};
use serde_json::{json, Value};
use tokio::time::{timeout, Duration};
use tokio_tungstenite::{connect_async, tungstenite::Message};

pub(super) async fn search(request: &Value) -> Value {
    let request_id = request.get("requestId").or_else(|| request.get("request_id")).cloned().unwrap_or(Value::Null);
    let failure = |error: &str| json!({"type":"youtube-search-response", "requestId":request_id,
        "success":false, "ok":false, "error":error});
    let base = std::env::var("SQUIRREL_FASTIFY_URL").unwrap_or_else(|_| "https://atome.one".into());
    let Ok(mut endpoint) = reqwest::Url::parse(&base) else { return failure("youtube_search_service_invalid"); };
    let scheme = match endpoint.scheme() {
        "https" => "wss",
        "http" if matches!(endpoint.host_str(), Some("localhost" | "127.0.0.1" | "::1")) => "ws",
        _ => return failure("youtube_search_service_invalid"),
    };
    if endpoint.set_scheme(scheme).is_err() { return failure("youtube_search_service_invalid"); }
    endpoint.set_path("/ws/api"); endpoint.set_query(None); endpoint.set_fragment(None);
    let Ok(Ok((mut socket, _))) = timeout(Duration::from_secs(8), connect_async(endpoint.to_string())).await
        else { return failure("youtube_search_unavailable"); };
    let outgoing = json!({"type":"youtube-search", "requestId":request_id,
        "query":request.get("query").cloned().unwrap_or(Value::Null),
        "pageToken":request.get("pageToken").cloned().unwrap_or(Value::Null)});
    if socket.send(Message::Text(outgoing.to_string())).await.is_err() {
        return failure("youtube_search_unavailable");
    }
    let Ok(Some(Ok(Message::Text(text)))) = timeout(Duration::from_secs(8), socket.next()).await
        else { return failure("youtube_search_unavailable"); };
    let Ok(response) = serde_json::from_str::<Value>(&text) else { return failure("youtube_search_unavailable"); };
    if response.get("type").and_then(Value::as_str) != Some("youtube-search-response")
        || response.get("requestId") != Some(&request_id) {
        return failure("youtube_search_unavailable");
    }
    response
}
