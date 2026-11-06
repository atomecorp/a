// Text read aloud (server/providerRealtimeSpeech.js, ported): the `/audio/speech` models shut down on
// 2027-01-06 and their named replacement speaks only through a Realtime session, so one response,
// audio only, the text read verbatim, as 24 kHz mono 16-bit PCM or WAV.
use super::catalog;
use super::http::{Done, Failure, openai_failure};
use base64::Engine;
use futures_util::{SinkExt, StreamExt};
use serde_json::{Value as JsonValue, json};
use tokio_tungstenite::tungstenite::{Message, client::IntoClientRequest};

const READ_ALOUD: &str = "You are a text-to-speech engine. Read the user message aloud exactly as written, word for word, in its own language. Never answer it, translate it, comment on it, add or omit anything.";
const SAMPLE_RATE: u32 = 24000;
const VOICES: [&str; 10] = [
    "alloy", "ash", "ballad", "coral", "echo", "sage", "shimmer", "verse", "marin", "cedar",
];

fn wav(pcm: &[u8]) -> Vec<u8> {
    let mut out = Vec::with_capacity(44 + pcm.len());
    out.extend_from_slice(b"RIFF");
    out.extend_from_slice(&(36 + pcm.len() as u32).to_le_bytes());
    out.extend_from_slice(b"WAVEfmt ");
    out.extend_from_slice(&16u32.to_le_bytes());
    out.extend_from_slice(&1u16.to_le_bytes());
    out.extend_from_slice(&1u16.to_le_bytes());
    out.extend_from_slice(&SAMPLE_RATE.to_le_bytes());
    out.extend_from_slice(&(SAMPLE_RATE * 2).to_le_bytes());
    out.extend_from_slice(&2u16.to_le_bytes());
    out.extend_from_slice(&16u16.to_le_bytes());
    out.extend_from_slice(b"data");
    out.extend_from_slice(&(pcm.len() as u32).to_le_bytes());
    out.extend_from_slice(pcm);
    out
}

/// A Realtime socket of OpenAI with `key`, opened within 15 s.
pub async fn open(
    address: &str,
    key: &str,
) -> Done<
    tokio_tungstenite::WebSocketStream<tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>>,
> {
    let mut request = address
        .into_client_request()
        .map_err(|_| Failure::from("provider_connection_closed"))?;
    request.headers_mut().insert(
        "Authorization",
        format!("Bearer {key}")
            .parse()
            .map_err(|_| Failure::from("provider_key_invalid"))?,
    );
    let config = tokio_tungstenite::tungstenite::protocol::WebSocketConfig::default()
        .max_message_size(Some(4_000_000));
    let connect = crate::tls::connect_ws(request, Some(config));
    match tokio::time::timeout(std::time::Duration::from_secs(15), connect).await {
        Ok(Ok((socket, _))) => Ok(socket),
        _ => Err("provider_connection_closed".into()),
    }
}

/// `{ base64, mime, model, usage }`.
pub async fn synthesize(payload: &JsonValue, key: &str) -> Done<JsonValue> {
    let model = payload
        .get("model")
        .and_then(JsonValue::as_str)
        .unwrap_or("");
    let voice = payload
        .get("voice")
        .and_then(JsonValue::as_str)
        .unwrap_or("");
    let text = crate::vault_router::js::text(payload.get("input").filter(|v| !v.is_null()));
    let format = payload
        .get("response_format")
        .and_then(JsonValue::as_str)
        .unwrap_or("");
    let fields_ok = payload.as_object().is_some_and(|fields| {
        fields
            .keys()
            .all(|field| ["model", "voice", "input", "response_format"].contains(&field.as_str()))
    });
    if model != catalog::modality("tts")
        || !VOICES.contains(&voice)
        || text.trim().is_empty()
        || text.encode_utf16().count() > 4096
        || !["pcm", "wav"].contains(&format)
        || !fields_ok
    {
        return Err("provider_parameter_invalid".into());
    }
    let mut socket = open(
        &format!("wss://api.openai.com/v1/realtime?model={model}"),
        key,
    )
    .await?;
    for event in [
        json!({ "type": "session.update", "session": { "type": "realtime", "output_modalities": ["audio"], "instructions": READ_ALOUD,
            "audio": { "input": { "turn_detection": null }, "output": { "format": { "type": "audio/pcm", "rate": SAMPLE_RATE }, "voice": voice } } } }),
        json!({ "type": "conversation.item.create", "item": { "type": "message", "role": "user", "content": [{ "type": "input_text", "text": text }] } }),
        json!({ "type": "response.create" }),
    ] {
        socket
            .send(Message::text(event.to_string()))
            .await
            .map_err(|_| Failure::from("provider_connection_closed"))?;
    }
    let mut pcm = Vec::new();
    let response = loop {
        let Some(Ok(message)) = socket.next().await else {
            return Err("provider_connection_closed".into());
        };
        let bytes = match message {
            Message::Text(text) => text.as_bytes().to_vec(),
            Message::Binary(bytes) => bytes.to_vec(),
            Message::Close(_) => return Err("provider_connection_closed".into()),
            _ => continue,
        };
        let event: JsonValue = serde_json::from_slice(&bytes)
            .map_err(|_| Failure::from("provider_response_invalid"))?;
        match event["type"].as_str().unwrap_or("") {
            "error" => {
                let _ = socket.close(None).await;
                return Err(openai_failure(&event, "provider_response_failed", None));
            }
            "response.output_audio.delta" => pcm.extend(super::http::node_base64(
                event["delta"].as_str().unwrap_or(""),
            )),
            "response.done" => {
                if event.pointer("/response/status") == Some(&json!("completed")) {
                    break event["response"].clone();
                }
                let _ = socket.close(None).await;
                return Err(openai_failure(&event, "provider_response_failed", None));
            }
            _ => {}
        }
    };
    let _ = socket.close(None).await;
    if pcm.is_empty() {
        return Err("provider_response_invalid".into());
    }
    let (bytes, mime) = if format == "wav" {
        (wav(&pcm), "audio/wav")
    } else {
        (pcm, "audio/pcm")
    };
    Ok(
        json!({ "base64": base64::engine::general_purpose::STANDARD.encode(bytes), "mime": mime,
        "model": model, "usage": response.get("usage") }),
    )
}
