// The `/ws/api` `screens` family (R-248): the named screens of the local network — a Chromecast, an Apple TV — and a
// person's media sent to one. The device fetches the media itself, from a share of this server on the local network:
// one URL per media sent, carrying a random token, serving that one file and nothing else (`/screen/{token}/{name}`),
// the eight latest kept. The protocols are atome-screen-cast's.
//
// Actions: `browse` (the screens heard within two seconds; on iOS the system browser's `records`, handed over by the
// page), `send` ({ target, media: { file | url, mime, title, start_seconds }, credentials? }), `pair_start` ({ target }:
// the television shows its PIN), `pair_finish` ({ target_id, pin }: the credentials to keep), `stop` ({ target_id }).
use std::collections::{HashMap, VecDeque};
use std::net::{IpAddr, SocketAddr};
use std::sync::{Mutex as StdMutex, OnceLock};

use atome_screen_cast::airplay::{self, AirplayCredentials, Pairing, Playback};
use atome_screen_cast::{MediaToSend, ScreenKind, ScreenTarget, cast, discovery};
use axum::extract::Path as AxumPath;
use axum::routing::get;
use tokio::sync::Mutex;

use super::*;

const KEPT_SHARES: usize = 8;

struct Share {
    token: String,
    path: PathBuf,
    mime: &'static str,
}

#[derive(Default)]
struct Sessions {
    pairings: HashMap<String, Pairing>,
    playbacks: HashMap<String, Playback>,
}

static SHARES: StdMutex<VecDeque<Share>> = StdMutex::new(VecDeque::new());
static SHARE_PORT: OnceLock<u16> = OnceLock::new();
static SESSIONS: OnceLock<Mutex<Sessions>> = OnceLock::new();

fn sessions() -> &'static Mutex<Sessions> {
    SESSIONS.get_or_init(|| Mutex::new(Sessions::default()))
}

async fn shared_file(
    AxumPath((token, _name)): AxumPath<(String, String)>,
    headers: HeaderMap,
) -> axum::response::Response {
    let found = SHARES.lock().ok().and_then(|shares| {
        shares
            .iter()
            .find(|share| share.token == token)
            .map(|share| (share.path.clone(), share.mime))
    });
    let Some((path, mime)) = found else {
        return StatusCode::NOT_FOUND.into_response();
    };
    match serve_file_with_range(&path, mime, &format!("\"{token}\""), &headers, "inline").await {
        Ok(response) => response,
        Err(_) => StatusCode::NOT_FOUND.into_response(),
    }
}

/// The share's port, its listener opened on every interface the first time.
async fn share_port() -> Result<u16, String> {
    if let Some(port) = SHARE_PORT.get() {
        return Ok(*port);
    }
    let listener = tokio::net::TcpListener::bind(("0.0.0.0", 0))
        .await
        .map_err(|error| format!("screen_share_bind:{error}"))?;
    let port = listener
        .local_addr()
        .map_err(|error| error.to_string())?
        .port();
    if SHARE_PORT.set(port).is_err() {
        return SHARE_PORT
            .get()
            .copied()
            .ok_or_else(|| "screen_share_port".to_string());
    }
    let router = Router::new().route("/screen/{token}/{name}", get(shared_file));
    tokio::spawn(async move {
        if let Err(error) = axum::serve(listener, router).await {
            eprintln!("[screens] share stopped: {error}");
        }
    });
    Ok(port)
}

/// This device's address on the network `target` is on.
fn local_address_towards(target: &SocketAddr) -> Result<IpAddr, String> {
    let socket = std::net::UdpSocket::bind(("0.0.0.0", 0)).map_err(|error| error.to_string())?;
    socket
        .connect(target)
        .map_err(|error| format!("screen_no_route:{error}"))?;
    Ok(socket.local_addr().map_err(|error| error.to_string())?.ip())
}

fn token() -> String {
    let mut bytes = [0u8; 16];
    rand::RngCore::fill_bytes(&mut rand::rngs::OsRng, &mut bytes);
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

/// The URL the device fetches `media` from: a person's stored file shared under a fresh token, or a web URL as it is.
async fn media_url(
    media: &JsonValue,
    state: &AppState,
    user_id: &str,
    local: IpAddr,
) -> Result<(String, String), String> {
    if let Some(url) = media
        .get("url")
        .and_then(JsonValue::as_str)
        .filter(|url| url.starts_with("http://") || url.starts_with("https://"))
    {
        // A URL of this device itself (a local server's route) is no URL for another device.
        let host = url
            .split("//")
            .nth(1)
            .and_then(|rest| rest.split(['/', ':']).next())
            .unwrap_or_default();
        if host == "localhost" || host.starts_with("127.") || host == "[::1]" {
            return Err("screen_media_local_url".into());
        }
        let mime = media
            .get("mime")
            .and_then(JsonValue::as_str)
            .ok_or("screen_media_mime_missing")?;
        return Ok((url.to_string(), mime.to_string()));
    }
    let file = media
        .get("file")
        .and_then(JsonValue::as_str)
        .filter(|file| !file.is_empty())
        .ok_or("screen_media_missing")?;
    let (path, safe_name) = locate_user_upload(state, user_id, file)
        .await
        .map_err(|error| error.to_string())?;
    if fs::metadata(&path).await.is_err() {
        return Err("screen_media_not_found".into());
    }
    let (served, mime, served_name) = resolve_playback_media_file(&path, &safe_name).await?;
    let port = share_port().await?;
    let token = token();
    let mut shares = SHARES.lock().map_err(|_| "screen_shares_poisoned")?;
    shares.push_back(Share {
        token: token.clone(),
        path: served,
        mime,
    });
    while shares.len() > KEPT_SHARES {
        shares.pop_front();
    }
    let name: String = served_name
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() || character == '.' {
                character
            } else {
                '_'
            }
        })
        .collect();
    Ok((
        format!("http://{local}:{port}/screen/{token}/{name}"),
        mime.to_string(),
    ))
}

fn target_of(data: &JsonValue) -> Result<ScreenTarget, String> {
    serde_json::from_value(data.get("target").cloned().unwrap_or(JsonValue::Null))
        .map_err(|error| format!("screen_target_invalid:{error}"))
}

async fn browse(data: &JsonValue) -> Result<JsonValue, String> {
    if let Some(records) = data.get("records").and_then(JsonValue::as_array) {
        let targets: Vec<ScreenTarget> = records
            .iter()
            .filter_map(|record| {
                let txt: HashMap<String, String> =
                    serde_json::from_value(record.get("txt").cloned()?).ok()?;
                discovery::target_from_record(
                    record["service"].as_str()?,
                    record["name"].as_str()?,
                    record["host"].as_str()?,
                    record["port"].as_u64()? as u16,
                    &txt,
                )
            })
            .collect();
        return Ok(json!({ "screens": targets }));
    }
    #[cfg(target_os = "ios")]
    return Err("screen_records_required".into());
    #[cfg(not(target_os = "ios"))]
    discovery::browse(std::time::Duration::from_secs(2))
        .await
        .map(|targets| json!({ "screens": targets }))
        .map_err(|error| error.code())
}

async fn send(data: &JsonValue, state: &AppState, user_id: &str) -> Result<JsonValue, String> {
    let target = target_of(data)?;
    let address = target.address().map_err(|error| error.code())?;
    let local = local_address_towards(&address)?;
    let media = data.get("media").cloned().unwrap_or(JsonValue::Null);
    let (url, mime) = media_url(&media, state, user_id, local).await?;
    let to_send = MediaToSend {
        url,
        mime,
        title: media["title"].as_str().unwrap_or_default().to_string(),
        start_seconds: media["start_seconds"].as_f64().unwrap_or(0.0),
    };
    match target.kind {
        ScreenKind::Chromecast => cast::send(address, &to_send)
            .await
            .map_err(|error| error.code())?,
        ScreenKind::Airplay => {
            let credentials: AirplayCredentials =
                serde_json::from_value(data.get("credentials").cloned().unwrap_or(JsonValue::Null))
                    .map_err(|_| "screen_refused:airplay_not_paired".to_string())?;
            let playback = airplay::play(address, local, &credentials, &to_send)
                .await
                .map_err(|error| error.code())?;
            if let Some(mut previous) = sessions()
                .lock()
                .await
                .playbacks
                .insert(target.id.clone(), playback)
            {
                previous.stop();
            }
        }
    }
    Ok(json!({ "target_id": target.id, "playing": true }))
}

async fn pair_start(data: &JsonValue) -> Result<JsonValue, String> {
    let target = target_of(data)?;
    let pairing = airplay::show_pin(target.address().map_err(|error| error.code())?)
        .await
        .map_err(|error| error.code())?;
    sessions()
        .lock()
        .await
        .pairings
        .insert(target.id.clone(), pairing);
    Ok(json!({ "target_id": target.id, "pin_shown": true }))
}

async fn pair_finish(data: &JsonValue) -> Result<JsonValue, String> {
    let id = data["target_id"].as_str().unwrap_or_default();
    let pin = data["pin"].as_str().unwrap_or_default();
    let pairing = sessions()
        .lock()
        .await
        .pairings
        .remove(id)
        .ok_or("screen_pairing_not_started")?;
    let credentials = airplay::finish_pairing(pairing, pin)
        .await
        .map_err(|error| error.code())?;
    Ok(json!({ "target_id": id, "credentials": credentials }))
}

async fn stop(data: &JsonValue) -> Result<JsonValue, String> {
    let id = data["target_id"].as_str().unwrap_or_default();
    let stopped = sessions()
        .lock()
        .await
        .playbacks
        .remove(id)
        .map(|mut playback| playback.stop())
        .is_some();
    Ok(json!({ "target_id": id, "stopped": stopped }))
}

pub(super) async fn handle_ws_screens_message(data: JsonValue, state: &AppState) -> JsonValue {
    let request_id = data["requestId"]
        .as_str()
        .or_else(|| data["request_id"].as_str())
        .map(String::from);
    let user_id = match ws_api::ws_authenticated_user(&data, state) {
        Ok(user_id) => user_id,
        Err(response) => return ws_api::ws_reply_envelope(response, request_id.as_deref()),
    };
    let input = data.get("input").cloned().unwrap_or(JsonValue::Null);
    let outcome = match data["action"].as_str().unwrap_or_default() {
        "browse" => browse(&input).await,
        "send" => send(&input, state, &user_id).await,
        "pair_start" => pair_start(&input).await,
        "pair_finish" => pair_finish(&input).await,
        "stop" => stop(&input).await,
        other => Err(format!("screen_action_unknown:{other}")),
    };
    let reply = match outcome {
        Ok(data) => {
            json!({ "type": "screens-response", "success": true, "ok": true, "error": JsonValue::Null, "data": data })
        }
        Err(error) => {
            json!({ "type": "screens-response", "success": false, "ok": false, "error": error })
        }
    };
    ws_api::ws_reply_envelope(reply, request_id.as_deref())
}
