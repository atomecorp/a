// A Blackmagic camera of the Multicam (R-375 L6, atome-blackmagic-camera): `{ protocol: "camera",
// setting: { name, … } }` in the `network` family. `action: "encode"` answers the setting's Camera
// Control Protocol `packet` (bytes the page writes to the camera over Web Bluetooth), on every
// server. `action: "send"` with the camera's `address` puts the setting on its REST API: only the
// apps' local server reaches the person's own network (the central server refuses it as it refuses
// OSC, `network_camera_local_only`).
use super::http::HttpRequest;
use atome_blackmagic_camera::{
    BLE_OUTGOING, BLE_SERVICE, BROADCAST, Setting, ccp_packet, rest_requests,
};
use serde_json::{Value as JsonValue, json};

pub const PROTOCOL: &str = "camera";
pub const REST_LOCAL_ONLY: &str = "network_camera_local_only";

fn setting_of(message: &JsonValue) -> Result<Setting, String> {
    Setting::from_json(message.get("setting").unwrap_or(&JsonValue::Null))
}

/// Whether `message` asks for a setting's packet.
pub fn is_encode(message: &JsonValue) -> bool {
    message.get("protocol").and_then(JsonValue::as_str) == Some(PROTOCOL)
        && message.get("action").and_then(JsonValue::as_str) == Some("encode")
}

/// The answer to an `encode`: the reply with the `packet` (camera `camera_id`, 1–254, else every camera) and
/// the Bluetooth `ble` service and characteristic it is written to.
pub fn encode_reply(message: &JsonValue) -> JsonValue {
    let destination = message
        .get("camera_id")
        .and_then(JsonValue::as_u64)
        .filter(|id| (1..255).contains(id))
        .map_or(BROADCAST, |id| id as u8);
    match setting_of(message) {
        Ok(setting) => {
            let mut reply = super::reply(message, Ok(None));
            reply["packet"] = json!(ccp_packet(destination, &setting));
            reply["ble"] = json!({ "service": BLE_SERVICE, "characteristic": BLE_OUTGOING });
            reply
        }
        Err(error) => super::reply(message, Err(error)),
    }
}

/// Puts the setting on the camera at `address` (its REST requests in order): the last status, or
/// the first one outside 2xx.
pub async fn send_rest(message: &JsonValue) -> Result<Option<u16>, String> {
    let setting = setting_of(message)?;
    let address = message
        .get("address")
        .and_then(JsonValue::as_str)
        .unwrap_or("");
    let mut status = None;
    for (path, body) in rest_requests(&setting) {
        let request = HttpRequest::from_message(
            &json!({ "address": address, "path": path, "method": "PUT", "body": body }),
        )?;
        let answered = request.send(crate::tls::http_client()?).await?;
        status = Some(answered);
        if !(200..300).contains(&answered) {
            break;
        }
    }
    Ok(status)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_setting_is_encoded_for_bluetooth_on_its_camera() {
        let message = json!({ "type": "network", "action": "encode", "protocol": "camera", "camera_id": 2,
            "setting": { "name": "iso", "iso": 800 }, "requestId": "r" });
        assert!(is_encode(&message));
        let reply = encode_reply(&message);
        assert_eq!(reply["ok"], json!(true), "{reply}");
        assert_eq!(
            reply["packet"],
            json!([2, 8, 0, 0, 1, 14, 3, 0, 32, 3, 0, 0])
        );
        let wrong = encode_reply(
            &json!({ "action": "encode", "protocol": "camera", "setting": { "name": "zoom" } }),
        );
        assert_eq!(wrong["error"], json!("blackmagic_setting_unknown:zoom"));
    }

    #[tokio::test]
    async fn a_setting_is_put_on_the_cameras_rest_api() {
        use tokio::io::{AsyncReadExt, AsyncWriteExt};
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();
        let server = tokio::spawn(async move {
            let mut requests = Vec::new();
            for _ in 0..2 {
                let (mut stream, _) = listener.accept().await.unwrap();
                let mut buffer = vec![0u8; 4096];
                let read = stream.read(&mut buffer).await.unwrap();
                stream
                    .write_all(b"HTTP/1.1 204 No Content\r\nconnection: close\r\n\r\n")
                    .await
                    .unwrap();
                requests.push(String::from_utf8_lossy(&buffer[..read]).to_string());
            }
            requests
        });
        let answer = super::super::local(&json!({ "type": "network", "action": "send", "protocol": "camera",
            "address": format!("http://127.0.0.1:{port}"), "setting": { "name": "white_balance", "kelvin": 5600, "tint": 3 } }))
        .await;
        let requests = server.await.unwrap();
        assert_eq!(answer["ok"], json!(true), "{answer}");
        assert!(
            requests[0].starts_with("PUT /control/api/v1/video/whiteBalance "),
            "{}",
            requests[0]
        );
        assert!(requests[0].contains(r#"{"whiteBalance":5600}"#));
        assert!(requests[1].starts_with("PUT /control/api/v1/video/whiteBalanceTint "));
    }
}
