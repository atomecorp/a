//! A media played by an AirPlay 2 receiver: the device fetches the URL and plays it while this side keeps the
//! session open. tvOS 18 and later no longer play a `POST /play` (it is answered 200 and nothing plays, its
//! `/playback-info` 500): the media is queued on a remote-control stream instead, as tvOS's own senders do. On one
//! verified, encrypted control connection: RTSP SETUP (an NTP timing responder on a local UDP port, the device's
//! event channel opened back), a feedback, RECORD, a SETUP of the remote-control stream (type 130), then the
//! `/command`s that queue the item and start it; a feedback every 2 s keeps the session, and the device's pushed
//! `playbackState` says when the media plays and when it stopped.

use std::net::{IpAddr, SocketAddr};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use plist::{Dictionary, Value};
use rand::Rng;
use tokio::net::{TcpStream, UdpSocket};
use tokio::sync::oneshot;
use tokio::task::JoinHandle;

use super::crypto::derive;
use super::hap::{AirplayCredentials, verify};
use super::http::{Connection, Message};
use super::queue;
use crate::{MediaToSend, ScreenError};

const FEEDBACK_EVERY: Duration = Duration::from_secs(2);
/// Feedbacks without « playing » before the media counts as not started (the device fetches and buffers first).
const START_FEEDBACKS: u32 = 15;

pub fn binary_plist(entries: Vec<(&str, Value)>) -> Vec<u8> {
    let dictionary: Dictionary = entries
        .into_iter()
        .map(|(key, value)| (key.to_string(), value))
        .collect();
    let mut out = Vec::new();
    Value::Dictionary(dictionary)
        .to_writer_binary(&mut out)
        .expect("a plist written to memory");
    out
}

fn read_plist(message: &Message) -> Option<Dictionary> {
    plist::from_bytes::<Value>(&message.body)
        .ok()?
        .into_dictionary()
}

/// The NTP time of now: seconds since 1900 and the fraction as 32 bits.
fn ntp_now() -> (u32, u32) {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    (
        (now.as_secs() + 2_208_988_800) as u32,
        ((u64::from(now.subsec_nanos()) << 32) / 1_000_000_000) as u32,
    )
}

/// The reply to a RAOP timing request (32 bytes, network order): the request's send time as reference, now twice.
pub fn timing_reply(request: &[u8]) -> Option<[u8; 32]> {
    if request.len() < 32 {
        return None;
    }
    let (seconds, fraction) = ntp_now();
    let mut reply = [0u8; 32];
    reply[0] = request[0];
    reply[1] = 0x53 | 0x80;
    reply[2..4].copy_from_slice(&7u16.to_be_bytes());
    reply[8..16].copy_from_slice(&request[24..32]);
    for at in [16, 24] {
        reply[at..at + 4].copy_from_slice(&seconds.to_be_bytes());
        reply[at + 4..at + 8].copy_from_slice(&fraction.to_be_bytes());
    }
    Some(reply)
}

/// A media playing on a receiver; dropped or stopped, the session closes and the device stops.
pub struct Playback {
    stop: Option<oneshot::Sender<()>>,
    pub task: JoinHandle<Result<(), ScreenError>>,
}

impl Playback {
    pub fn stop(&mut self) {
        if let Some(stop) = self.stop.take() {
            let _ = stop.send(());
        }
    }
}

struct Rtsp {
    uri: String,
    sequence: u32,
    dacp: String,
    remote: String,
}

impl Rtsp {
    fn headers(&mut self, plist_body: bool) -> Vec<(&'static str, String)> {
        let mut headers = vec![
            ("User-Agent", "AirPlay/550.10".to_string()),
            ("CSeq", self.sequence.to_string()),
            ("DACP-ID", self.dacp.clone()),
            ("Active-Remote", self.remote.clone()),
            ("Client-Instance", self.dacp.clone()),
        ];
        self.sequence += 1;
        if plist_body {
            headers.push(("Content-Type", "application/x-apple-binary-plist".into()));
        }
        headers
    }
}

fn refused(step: &str, answer: &Message) -> Result<(), ScreenError> {
    if (200..300).contains(&answer.status()) {
        return Ok(());
    }
    Err(ScreenError::Refused(format!(
        "airplay_{step}_{}",
        answer.status()
    )))
}

/// `media` played by the receiver at `address`, paired by `credentials`; `local` is this side's address on the
/// network the receiver sees (its timing port and the event channel's peer).
pub async fn play(
    address: SocketAddr,
    local: IpAddr,
    credentials: &AirplayCredentials,
    media: &MediaToSend,
) -> Result<Playback, ScreenError> {
    let stream = TcpStream::connect(address)
        .await
        .map_err(|error| ScreenError::Unreachable(error.to_string()))?;
    let mut control = Connection::new(stream);
    let shared = verify(&mut control, credentials).await?;
    control.encrypt(
        derive("Control-Salt", "Control-Write-Encryption-Key", &shared),
        derive("Control-Salt", "Control-Read-Encryption-Key", &shared),
    );

    let timing = UdpSocket::bind(SocketAddr::new(local, 0))
        .await
        .map_err(|error| ScreenError::Io(error.to_string()))?;
    let timing_port = timing
        .local_addr()
        .map_err(|error| ScreenError::Io(error.to_string()))?
        .port();
    let timing_task = tokio::spawn(async move {
        let mut buffer = [0u8; 128];
        while let Ok((read, from)) = timing.recv_from(&mut buffer).await {
            if let Some(reply) = timing_reply(&buffer[..read]) {
                let _ = timing.send_to(&reply, from).await;
            }
        }
    });
    let outcome = session(address, local, timing_port, &shared, control, media).await;
    match outcome {
        Ok((stop, task)) => Ok(Playback {
            stop: Some(stop),
            task: tokio::spawn(async move {
                let ended = task.await.unwrap_or(Ok(()));
                timing_task.abort();
                ended
            }),
        }),
        Err(error) => {
            timing_task.abort();
            Err(error)
        }
    }
}

type Session = (oneshot::Sender<()>, JoinHandle<Result<(), ScreenError>>);

async fn session(
    address: SocketAddr,
    local: IpAddr,
    timing_port: u16,
    shared: &[u8; 32],
    mut control: Connection<TcpStream>,
    media: &MediaToSend,
) -> Result<Session, ScreenError> {
    let mut random = rand::rngs::OsRng;
    let mut rtsp = Rtsp {
        uri: format!("rtsp://{local}/{}", random.r#gen::<u32>()),
        sequence: 0,
        dacp: format!("{:X}", random.r#gen::<u64>()),
        remote: random.r#gen::<u32>().to_string(),
    };
    let mac = "02:00:00:00:00:01".to_string();
    let setup = binary_plist(vec![
        ("deviceID", Value::String(mac.clone())),
        ("sessionUUID", Value::String(queue::upper_uuid())),
        ("timingPort", Value::Integer(u64::from(timing_port).into())),
        ("timingProtocol", Value::String("NTP".into())),
        ("isMultiSelectAirPlay", Value::Boolean(true)),
        ("groupContainsGroupLeader", Value::Boolean(false)),
        ("macAddress", Value::String(mac)),
        ("model", Value::String("iPhone14,3".into())),
        ("name", Value::String("atome".into())),
        ("osBuildVersion", Value::String("20F66".into())),
        ("osName", Value::String("iPhone OS".into())),
        ("osVersion", Value::String("16.5".into())),
        ("senderSupportsRelay", Value::Boolean(false)),
        ("sourceVersion", Value::String("690.7.1".into())),
        ("statsCollectionEnabled", Value::Boolean(false)),
    ]);
    let headers = rtsp.headers(true);
    let answer = control
        .exchange(&format!("SETUP {} RTSP/1.0", rtsp.uri), &headers, &setup)
        .await?;
    refused("setup", &answer)?;
    let event_port = read_plist(&answer)
        .and_then(|body| body.get("eventPort")?.as_unsigned_integer())
        .unwrap_or(0) as u16;
    let (events, mut states) =
        super::events::open(SocketAddr::new(address.ip(), event_port), shared).await?;
    let headers = rtsp.headers(false);
    control
        .exchange("POST /feedback RTSP/1.0", &headers, &[])
        .await?;
    let headers = rtsp.headers(false);
    let recorded = control
        .exchange(&format!("RECORD {} RTSP/1.0", rtsp.uri), &headers, &[])
        .await?;
    refused("record", &recorded)?;

    let headers = rtsp.headers(true);
    let answer = control
        .exchange(
            &format!("SETUP {} RTSP/1.0", rtsp.uri),
            &headers,
            &queue::remote_control_setup(),
        )
        .await?;
    refused("stream", &answer)?;
    let stream = read_plist(&answer)
        .and_then(|body| queue::stream_id(&body))
        .ok_or(ScreenError::Protocol("airplay_stream_id_missing"))?;
    let session = queue::upper_uuid();
    for command in queue::commands(media) {
        let mut headers = rtsp.headers(true);
        headers.extend([
            ("X-Apple-ProtocolVersion", "1".to_string()),
            ("X-Apple-Session-ID", session.clone()),
            ("X-Apple-StreamID", stream.clone()),
        ]);
        let answer = control
            .exchange("POST /command HTTP/1.1", &headers, &command)
            .await?;
        refused("command", &answer)?;
    }

    let (stop, mut stopped) = oneshot::channel();
    let task = tokio::spawn(async move {
        let mut playing = false;
        let mut waited = 0;
        let outcome = loop {
            tokio::select! {
                _ = &mut stopped => break Ok(()),
                state = states.recv() => match state.as_deref() {
                    Some("playing") => playing = true,
                    Some("stopped") if playing => break Ok(()),
                    Some(_) => {}
                    None => break if playing { Ok(()) } else { Err(ScreenError::Refused("airplay_events_closed".into())) },
                },
                _ = tokio::time::sleep(FEEDBACK_EVERY) => {
                    let headers = rtsp.headers(false);
                    if let Err(error) = control.exchange("POST /feedback RTSP/1.0", &headers, &[]).await {
                        break if playing { Ok(()) } else { Err(error) };
                    }
                    waited += 1;
                    if !playing && waited >= START_FEEDBACKS {
                        break Err(ScreenError::Refused("airplay_media_not_started".into()));
                    }
                }
            }
        };
        events.abort();
        outcome
    });
    Ok((stop, task))
}
