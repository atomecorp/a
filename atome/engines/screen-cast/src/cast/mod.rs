//! A Chromecast (Cast v2): a media sent to the device's Default Media Receiver, which fetches it from the URL itself
//! and goes on playing once the sender has left (the device is the player; the phone is free).
//! Flow: CONNECT to `receiver-0`, LAUNCH the Default Media Receiver, CONNECT to its transport, LOAD the media, wait
//! for its MEDIA_STATUS (or LOAD_FAILED). The device's PINGs are answered with a PONG while waiting.

pub mod frame;

use std::net::SocketAddr;
use std::time::Duration;

use serde_json::{Value, json};
use tokio::io::{AsyncRead, AsyncReadExt, AsyncWrite, AsyncWriteExt};

use crate::{MediaToSend, ScreenError};
use frame::{CastMessage, MAX_MESSAGE};

/// The Default Media Receiver, Google's own player on every Cast device.
pub const DEFAULT_MEDIA_RECEIVER: &str = "CC1AD845";
const SENDER: &str = "sender-atome";
const CONNECTION: &str = "urn:x-cast:com.google.cast.tp.connection";
const HEARTBEAT: &str = "urn:x-cast:com.google.cast.tp.heartbeat";
const RECEIVER: &str = "urn:x-cast:com.google.cast.receiver";
const MEDIA: &str = "urn:x-cast:com.google.cast.media";
const STEP_TIMEOUT: Duration = Duration::from_secs(20);

struct Channel<S> {
    stream: S,
    request: u64,
}

impl<S: AsyncRead + AsyncWrite + Unpin> Channel<S> {
    async fn send(
        &mut self,
        destination: &str,
        namespace: &str,
        payload: Value,
    ) -> Result<(), ScreenError> {
        let message = CastMessage {
            source: SENDER.into(),
            destination: destination.into(),
            namespace: namespace.into(),
            payload: payload.to_string(),
        };
        self.stream
            .write_all(&message.encode())
            .await
            .map_err(|error| ScreenError::Io(error.to_string()))
    }

    async fn request(
        &mut self,
        destination: &str,
        namespace: &str,
        mut payload: Value,
    ) -> Result<u64, ScreenError> {
        self.request += 1;
        payload["requestId"] = json!(self.request);
        self.send(destination, namespace, payload).await?;
        Ok(self.request)
    }

    async fn receive(&mut self) -> Result<CastMessage, ScreenError> {
        let mut length = [0u8; 4];
        self.stream
            .read_exact(&mut length)
            .await
            .map_err(|error| ScreenError::Io(error.to_string()))?;
        let length = u32::from_be_bytes(length) as usize;
        if length > MAX_MESSAGE {
            return Err(ScreenError::Protocol("cast_message_too_large"));
        }
        let mut body = vec![0u8; length];
        self.stream
            .read_exact(&mut body)
            .await
            .map_err(|error| ScreenError::Io(error.to_string()))?;
        CastMessage::decode(&body)
    }

    /// The next answer to `request` (a JSON payload carrying that `requestId`), answering the device's PINGs meanwhile.
    async fn answer(&mut self, request: u64) -> Result<Value, ScreenError> {
        let wait = async {
            loop {
                let message = self.receive().await?;
                let payload: Value = serde_json::from_str(&message.payload)
                    .map_err(|_| ScreenError::Protocol("cast_payload_not_json"))?;
                if message.namespace == HEARTBEAT && payload["type"] == "PING" {
                    self.send(&message.source, HEARTBEAT, json!({ "type": "PONG" }))
                        .await?;
                    continue;
                }
                if message.namespace == CONNECTION
                    && payload["type"] == "CLOSE"
                    && message.source == "receiver-0"
                {
                    return Err(ScreenError::Refused("cast_receiver_closed".into()));
                }
                if payload["requestId"].as_u64() == Some(request) {
                    return Ok(payload);
                }
            }
        };
        tokio::time::timeout(STEP_TIMEOUT, wait)
            .await
            .map_err(|_| ScreenError::Unreachable("cast_device_silent".into()))?
    }
}

/// The Default Media Receiver's transport id in a RECEIVER_STATUS.
fn transport_of(status: &Value) -> Option<String> {
    status["status"]["applications"]
        .as_array()?
        .iter()
        .find(|application| application["appId"] == DEFAULT_MEDIA_RECEIVER)?["transportId"]
        .as_str()
        .map(str::to_owned)
}

/// The LOAD request of `media`.
pub fn load_payload(media: &MediaToSend) -> Value {
    json!({
        "type": "LOAD",
        "autoplay": true,
        "currentTime": media.start_seconds,
        "media": {
            "contentId": media.url,
            "contentType": media.mime,
            "streamType": "BUFFERED",
            "metadata": { "metadataType": 0, "title": media.title }
        }
    })
}

/// `media` played by the Chromecast at `address` (the Bonjour `_googlecast._tcp` host and port).
pub async fn send(address: SocketAddr, media: &MediaToSend) -> Result<(), ScreenError> {
    let stream = crate::tls::connect_local_device(address).await?;
    play_on(stream, media).await
}

/// The whole exchange over an open stream (a TLS stream to the device, or a test's in-memory pipe).
pub async fn play_on<S: AsyncRead + AsyncWrite + Unpin>(
    stream: S,
    media: &MediaToSend,
) -> Result<(), ScreenError> {
    let mut channel = Channel { stream, request: 0 };
    channel
        .send("receiver-0", CONNECTION, json!({ "type": "CONNECT" }))
        .await?;
    let launch = channel
        .request(
            "receiver-0",
            RECEIVER,
            json!({ "type": "LAUNCH", "appId": DEFAULT_MEDIA_RECEIVER }),
        )
        .await?;
    let status = channel.answer(launch).await?;
    if status["type"] != "RECEIVER_STATUS" {
        return Err(ScreenError::Refused(format!(
            "cast_launch_{}",
            status["type"].as_str().unwrap_or("unknown")
        )));
    }
    let transport = transport_of(&status).ok_or(ScreenError::Protocol("cast_transport_missing"))?;
    channel
        .send(&transport, CONNECTION, json!({ "type": "CONNECT" }))
        .await?;
    let load = channel
        .request(&transport, MEDIA, load_payload(media))
        .await?;
    let answer = channel.answer(load).await?;
    match answer["type"].as_str() {
        Some("MEDIA_STATUS") => {
            channel
                .send(&transport, CONNECTION, json!({ "type": "CLOSE" }))
                .await?;
            channel
                .stream
                .shutdown()
                .await
                .map_err(|error| ScreenError::Io(error.to_string()))
        }
        other => Err(ScreenError::Refused(format!(
            "cast_load_{}",
            other.unwrap_or("unknown")
        ))),
    }
}

#[cfg(test)]
mod tests;
