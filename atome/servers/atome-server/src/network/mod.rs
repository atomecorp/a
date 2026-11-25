//! The `network` family of `/ws/api` (R-347 L12): a control's reaction sends a message « to the
//! network ». `{ type: "network", action: "send", protocol: "osc" | "http", address, path?,
//! value?, method?, body? }` is answered `{ type: "network-response", ok, success, error,
//! http_status? }`. OSC goes out only from the apps' local server (Tauri, iOS), which reaches the
//! person's own network (`local()`); the central server refuses it (`network_osc_local_only`,
//! ws_api/network_ops.rs) and sends HTTP to public addresses only.
pub mod http;
pub mod osc;

use serde_json::{Map as JsonMap, Value as JsonValue, json};

pub const KIND: &str = "network";
pub const OSC_LOCAL_ONLY: &str = "network_osc_local_only";

/// The answer to `message`: `Ok(status)` (an HTTP status, none for OSC) or the error code. An
/// HTTP status outside 2xx is a failure carrying its status (`network_http_status`).
pub fn reply(message: &JsonValue, outcome: Result<Option<u16>, String>) -> JsonValue {
    let mut reply = JsonMap::new();
    reply.insert("type".into(), json!("network-response"));
    let request_id = message
        .get("requestId")
        .or_else(|| message.get("request_id"))
        .cloned()
        .unwrap_or(JsonValue::Null);
    reply.insert("requestId".into(), request_id.clone());
    reply.insert("request_id".into(), request_id);
    let (ok, error, status) = match outcome {
        Ok(Some(status)) if (200..300).contains(&status) => (true, None, Some(status)),
        Ok(Some(status)) => (false, Some("network_http_status".to_string()), Some(status)),
        Ok(None) => (true, None, None),
        Err(error) => (false, Some(error), None),
    };
    reply.insert("ok".into(), json!(ok));
    reply.insert("success".into(), json!(ok));
    reply.insert("error".into(), json!(error));
    if let Some(status) = status {
        reply.insert("http_status".into(), json!(status));
    }
    JsonValue::Object(reply)
}

/// The message's checked action and protocol.
pub fn protocol_of(message: &JsonValue) -> Result<&str, String> {
    let action = message.get("action").and_then(JsonValue::as_str);
    if action != Some("send") {
        return Err(format!(
            "network_action_unknown:{}",
            action.unwrap_or_default()
        ));
    }
    match message.get("protocol").and_then(JsonValue::as_str) {
        Some(protocol @ ("osc" | "http")) => Ok(protocol),
        other => Err(format!(
            "network_protocol_unknown:{}",
            other.unwrap_or_default()
        )),
    }
}

async fn send_local(message: &JsonValue) -> Result<Option<u16>, String> {
    match protocol_of(message)? {
        "osc" => {
            let text = |key: &str| message.get(key).and_then(JsonValue::as_str).unwrap_or("");
            let target = osc::target_of(text("address"), text("path"))?;
            let args = osc::args_of(message.get("value").unwrap_or(&JsonValue::Null))?;
            osc::send(&target, &args).await.map(|_| None)
        }
        _ => {
            let request = http::HttpRequest::from_message(message)?;
            request.send(crate::tls::http_client()?).await.map(Some)
        }
    }
}

/// The local server's answer (an authenticated person on their own device): OSC over UDP and
/// HTTP to any address of their network or of the world.
pub async fn local(message: &JsonValue) -> JsonValue {
    reply(message, send_local(message).await)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_2xx_status_is_a_success_and_another_a_failure() {
        let message = json!({ "requestId": "r1" });
        let done = reply(&message, Ok(Some(204)));
        assert_eq!(done["ok"], json!(true));
        assert_eq!(done["http_status"], json!(204));
        assert_eq!(done["requestId"], json!("r1"));
        let failed = reply(&message, Ok(Some(404)));
        assert_eq!(failed["ok"], json!(false));
        assert_eq!(failed["error"], json!("network_http_status"));
        assert_eq!(failed["http_status"], json!(404));
    }

    #[test]
    fn only_send_and_the_two_protocols_are_read() {
        let send = |protocol: &str| json!({ "action": "send", "protocol": protocol });
        assert_eq!(protocol_of(&send("osc")).unwrap(), "osc");
        assert_eq!(protocol_of(&send("http")).unwrap(), "http");
        assert!(protocol_of(&send("ftp")).is_err());
        assert!(protocol_of(&json!({ "action": "list", "protocol": "osc" })).is_err());
    }

    #[tokio::test]
    async fn the_local_server_sends_osc() {
        let receiver = std::net::UdpSocket::bind("127.0.0.1:0").unwrap();
        receiver
            .set_read_timeout(Some(std::time::Duration::from_secs(2)))
            .unwrap();
        let port = receiver.local_addr().unwrap().port();
        let answer = local(&json!({ "type": KIND, "action": "send", "protocol": "osc",
            "address": format!("127.0.0.1:{port}"), "path": "/vol", "value": 0.75, "requestId": "r2" }))
        .await;
        assert_eq!(answer["ok"], json!(true), "{answer}");
        let mut buffer = [0u8; 64];
        let (read, _) = receiver.recv_from(&mut buffer).unwrap();
        assert_eq!(
            &buffer[..read],
            osc::encode("/vol", &[osc::OscArg::Float(0.75)]).unwrap()
        );
    }

    #[tokio::test]
    async fn the_local_server_posts_http_and_reads_the_status() {
        use tokio::io::{AsyncReadExt, AsyncWriteExt};
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();
        let server = tokio::spawn(async move {
            let (mut stream, _) = listener.accept().await.unwrap();
            let mut buffer = vec![0u8; 4096];
            let read = stream.read(&mut buffer).await.unwrap();
            stream
                .write_all(b"HTTP/1.1 204 No Content\r\nconnection: close\r\n\r\n")
                .await
                .unwrap();
            String::from_utf8_lossy(&buffer[..read]).to_string()
        });
        let answer = local(&json!({ "action": "send", "protocol": "http",
            "address": format!("http://127.0.0.1:{port}"), "path": "/hook", "value": 3 }))
        .await;
        let request = server.await.unwrap();
        assert_eq!(answer["ok"], json!(true), "{answer}");
        assert_eq!(answer["http_status"], json!(204));
        assert!(request.starts_with("POST /hook "), "{request}");
        assert!(request.contains(r#"{"value":3}"#), "{request}");
    }
}
