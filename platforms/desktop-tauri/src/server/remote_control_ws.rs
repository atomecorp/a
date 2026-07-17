use super::{
    remote_audio_analyze_handler, remote_audio_playback_load_handler,
    remote_audio_playback_play_handler, remote_audio_playback_stop_handler,
    remote_audio_record_start_handler, remote_audio_record_stop_handler, remote_control, AppState,
    RemoteAudioAnalyzeRequest, RemoteAudioPlaybackLoadRequest, RemoteAudioPlaybackPlayRequest,
    RemoteAudioPlaybackStopRequest, RemoteAudioRecordStartRequest, RemoteAudioRecordStopRequest,
};
use axum::{
    body::to_bytes,
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        State,
    },
    http::{HeaderMap, HeaderValue},
    response::{IntoResponse, Response},
    Json,
};
use futures_util::StreamExt;
use serde::de::DeserializeOwned;
use serde_json::{json, Value as JsonValue};

fn request_headers(message: &JsonValue) -> Result<HeaderMap, String> {
    let mut headers = HeaderMap::new();
    let remote_token = message
        .get("token")
        .and_then(|value| value.as_str())
        .unwrap_or("")
        .trim();
    if remote_token.is_empty() {
        return Err("remote_control_token_required".to_string());
    }
    headers.insert(
        "x-squirrel-remote-token",
        HeaderValue::from_str(remote_token).map_err(|_| "invalid_remote_control_token")?,
    );
    if let Some(auth_token) = message
        .get("auth_token")
        .or_else(|| message.get("authToken"))
        .and_then(|value| value.as_str())
        .filter(|value| !value.trim().is_empty())
    {
        headers.insert(
            "authorization",
            HeaderValue::from_str(&format!("Bearer {}", auth_token.trim()))
                .map_err(|_| "invalid_auth_token")?,
        );
    }
    if let Some(user_id) = message
        .get("user_id")
        .or_else(|| message.get("userId"))
        .and_then(|value| value.as_str())
        .filter(|value| !value.trim().is_empty())
    {
        headers.insert(
            "x-user-id",
            HeaderValue::from_str(user_id.trim()).map_err(|_| "invalid_user_id")?,
        );
    }
    Ok(headers)
}

fn request_payload<T: DeserializeOwned>(message: &JsonValue) -> Result<T, String> {
    serde_json::from_value(message.get("payload").cloned().unwrap_or_else(|| json!({})))
        .map_err(|error| format!("invalid_remote_control_payload:{error}"))
}

async fn response_json(response: Response) -> JsonValue {
    let status = response.status();
    let body = to_bytes(response.into_body(), 4 * 1024 * 1024)
        .await
        .unwrap_or_default();
    let mut value = serde_json::from_slice::<JsonValue>(&body)
        .unwrap_or_else(|_| json!({ "success": status.is_success() }));
    if let Some(object) = value.as_object_mut() {
        object.insert("status".to_string(), json!(status.as_u16()));
    }
    value
}

async fn dispatch(message: JsonValue, state: AppState) -> JsonValue {
    let request_id = message
        .get("requestId")
        .or_else(|| message.get("request_id"))
        .cloned()
        .unwrap_or(JsonValue::Null);
    let action = message
        .get("action")
        .and_then(|value| value.as_str())
        .unwrap_or("");
    let result = async {
        let headers = request_headers(&message)?;
        let response = match action {
            "status" => remote_control::status(headers, State(state))
                .await
                .into_response(),
            "audio.record.start" => remote_audio_record_start_handler(
                headers,
                State(state),
                Json(request_payload::<RemoteAudioRecordStartRequest>(&message)?),
            )
            .await
            .into_response(),
            "audio.record.stop" => remote_audio_record_stop_handler(
                headers,
                State(state),
                Json(request_payload::<RemoteAudioRecordStopRequest>(&message)?),
            )
            .await
            .into_response(),
            "audio.analyze" => remote_audio_analyze_handler(
                headers,
                State(state),
                Json(request_payload::<RemoteAudioAnalyzeRequest>(&message)?),
            )
            .await
            .into_response(),
            "audio.playback.load" => remote_audio_playback_load_handler(
                headers,
                State(state),
                Json(request_payload::<RemoteAudioPlaybackLoadRequest>(&message)?),
            )
            .await
            .into_response(),
            "audio.playback.play" => remote_audio_playback_play_handler(
                headers,
                State(state),
                Json(request_payload::<RemoteAudioPlaybackPlayRequest>(&message)?),
            )
            .await
            .into_response(),
            "audio.playback.stop" => remote_audio_playback_stop_handler(
                headers,
                State(state),
                Json(request_payload::<RemoteAudioPlaybackStopRequest>(&message)?),
            )
            .await
            .into_response(),
            _ => return Err("unknown_remote_control_action".to_string()),
        };
        Ok(response_json(response).await)
    }
    .await;

    match result {
        Ok(data) => json!({
            "type": "remote-control-response",
            "requestId": request_id,
            "success": data.get("success").and_then(|value| value.as_bool()).unwrap_or(false),
            "data": data
        }),
        Err(error) => json!({
            "type": "remote-control-response",
            "requestId": request_id,
            "success": false,
            "error": error
        }),
    }
}

pub(super) async fn handler(
    ws: WebSocketUpgrade,
    State(state): State<AppState>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_socket(socket, state))
}

async fn handle_socket(mut socket: WebSocket, state: AppState) {
    while let Some(message) = socket.next().await {
        match message {
            Ok(Message::Text(text)) => {
                let response = match serde_json::from_str::<JsonValue>(&text) {
                    Ok(message) => dispatch(message, state.clone()).await,
                    Err(_) => json!({
                        "type": "remote-control-response",
                        "success": false,
                        "error": "invalid_json"
                    }),
                };
                if socket
                    .send(Message::Text(response.to_string()))
                    .await
                    .is_err()
                {
                    break;
                }
            }
            Ok(Message::Ping(data)) => {
                if socket.send(Message::Pong(data)).await.is_err() {
                    break;
                }
            }
            Ok(Message::Close(_)) | Err(_) => break,
            _ => {}
        }
    }
}
