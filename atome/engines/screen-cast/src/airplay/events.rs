//! The receiver's event channel: a second connection, to the `eventPort` of its SETUP answer, on which the device
//! asks and this side answers every request `200 OK`. Its keys come from the same verified secret, named from the
//! device's side: this side writes with "Events-Read-Encryption-Key" and reads with "Events-Write-Encryption-Key".
//! The device pushes the queued item's state there (`playbackState`: loading, playing, paused, stopped): each name
//! is handed to the playback.

use std::net::SocketAddr;
use std::time::Duration;

use plist::Value;
use tokio::net::TcpStream;
use tokio::sync::mpsc;
use tokio::task::JoinHandle;

use super::crypto::derive;
use super::http::Connection;
use crate::ScreenError;

const ATTEMPTS: u32 = 5;

/// The state an event names (`params.data` holds the event, itself a binary plist), if it is a playback state.
pub fn playback_state(body: &[u8]) -> Option<String> {
    let outer = plist::from_bytes::<Value>(body).ok()?;
    let data = outer
        .as_dictionary()?
        .get("params")?
        .as_dictionary()?
        .get("data")?
        .as_data()?;
    let event = plist::from_bytes::<Value>(data).ok()?;
    let event = event.as_dictionary()?;
    if event.get("type")?.as_string()? != "playbackState" {
        return None;
    }
    event.get("name")?.as_string().map(str::to_string)
}

/// The channel opened and answered in the background until aborted or closed by the device; the playback states
/// it pushes come out of the receiver.
pub async fn open(
    address: SocketAddr,
    shared: &[u8; 32],
) -> Result<(JoinHandle<()>, mpsc::UnboundedReceiver<String>), ScreenError> {
    let mut attempt = 0;
    // The receiver may open its port a little after its SETUP answer.
    let stream = loop {
        match TcpStream::connect(address).await {
            Ok(stream) => break stream,
            Err(error)
                if attempt + 1 < ATTEMPTS
                    && error.kind() == std::io::ErrorKind::ConnectionRefused =>
            {
                attempt += 1;
                tokio::time::sleep(Duration::from_secs(1)).await;
            }
            Err(error) => return Err(ScreenError::Unreachable(format!("airplay_events:{error}"))),
        }
    };
    let mut channel = Connection::new(stream);
    channel.encrypt(
        derive("Events-Salt", "Events-Read-Encryption-Key", shared),
        derive("Events-Salt", "Events-Write-Encryption-Key", shared),
    );
    let (states, received) = mpsc::unbounded_channel();
    let task = tokio::spawn(async move {
        while let Ok(request) = channel.read_message().await {
            if let Some(state) = playback_state(&request.body) {
                let _ = states.send(state);
            }
            let protocol = request
                .first_line
                .rsplit(' ')
                .next()
                .unwrap_or("RTSP/1.0")
                .to_string();
            let mut headers = vec![
                ("Content-Length", "0".to_string()),
                ("Audio-Latency", "0".to_string()),
            ];
            if let Some(server) = request.header("Server") {
                headers.push(("Server", server.to_string()));
            }
            if let Some(sequence) = request.header("CSeq") {
                headers.push(("CSeq", sequence.to_string()));
            }
            if channel
                .write_message(&format!("{protocol} 200 OK"), &headers, &[])
                .await
                .is_err()
            {
                break;
            }
        }
    });
    Ok((task, received))
}
