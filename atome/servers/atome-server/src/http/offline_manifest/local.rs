// The media and model files a local feature reads on this device (R-104 §7; server/
// offline_local_resources.js, ported): each entry is one capability of class `offline: local` and
// the exact files it needs under the static root (`/`), or the index naming them. Never a
// directory: a file is listed because its owner reads it (owner named on each entry), so a
// recording, a demo video or a precompressed copy lying beside it never enters the device's cache.
// Left out on purpose: `assets/videos/superman.mp4` (55 MB demo source of the video preset,
// `genesis.js`), the other videos (read by no code), the unpacked Vosk model (native only), the
// `.wasm.gz` / `.wasm.br` copies (the server's own encodings of a cached `.wasm`).
use serde_json::Value as JsonValue;
use std::path::{Path, PathBuf};

pub enum Needs {
    Files(&'static [&'static str]),
    /// An index whose `lines` name their files (`{ "lines": { <sentence>: { "file": … } } }`),
    /// beside it.
    Index(&'static str),
}

pub const OFFLINE_LOCAL_RESOURCES: [(&str, Needs); 8] = [
    // notification_sounds.js SOUNDS (ALARM_RINGTONES + notification dings), 0.8 MB.
    (
        "audio.alarm_and_notification_sounds",
        Needs::Files(&[
            "assets/audios/alarms/alarm_gentle.mp3",
            "assets/audios/alarms/alarm_chime.mp3",
            "assets/audios/alarms/alarm_birds.mp3",
            "assets/audios/alarms/alarm_bells.mp3",
            "assets/audios/alarms/alarm_gong.mp3",
            "assets/audios/alarms/alarm_clock.mp3",
            "assets/audios/notifications/message.mp3",
            "assets/audios/notifications/media_message.mp3",
            "assets/audios/notifications/visio_call_ring.mp3",
            "assets/audios/notifications/audio_call_ring.mp3",
        ]),
    ),
    // fx_impulse_set.js BUNDLED_IMPULSES, 1.7 MB.
    (
        "audio.amp_cab_impulses",
        Needs::Files(&[
            "assets/impulses/cab_1x12_open.wav",
            "assets/impulses/cab_2x12.wav",
            "assets/impulses/cab_4x12_closed.wav",
            "assets/impulses/cab_bass_1x15.wav",
            "assets/impulses/room_small.wav",
            "assets/impulses/room_hall.wav",
            "assets/impulses/room_plate.wav",
        ]),
    ),
    // audio_to_midi/engine.js: the weights of model.json, 0.7 MB.
    (
        "audio.audio_to_midi_model",
        Needs::Files(&["assets/vendor/basic-pitch/model/group1-shard1of1.bin"]),
    ),
    // media_source_runtime.js BUNDLED_MEDIA_ASSET_BY_NAME: the sound preset and the
    // missing-video placeholder, 0.5 MB.
    (
        "media.bundled_presets",
        Needs::Files(&["assets/audios/riff.m4a", "assets/videos/video_missing.mp4"]),
    ),
    // voice_lines.js: every pre-rendered sentence its index names (the offline sentence
    // included), 17.8 MB.
    (
        "voice.lines_prerendered",
        Needs::Index("assets/voice/lines_fr/index.json"),
    ),
    // local_tts_worker.js: eVe's Piper voice, 63 MB.
    (
        "voice.local_tts",
        Needs::Files(&["assets/voice/fr_FR-siwis-medium/fr_FR-siwis-medium.onnx"]),
    ),
    // browser_voice_engine.js (Vosk model) + browser_voice_worker.js (Silero VAD), 44 MB.
    (
        "voice.browser_stt_vad",
        Needs::Files(&[
            "assets/voice/vosk/vosk-model-small-fr-0.22.tar.gz",
            "assets/voice/vad/silero_vad.onnx",
        ]),
    ),
    // wake_detector_worker.js, 2.4 MB.
    (
        "voice.wake_word",
        Needs::Files(&[
            "assets/voice/wake/melspectrogram.onnx",
            "assets/voice/wake/embedding_model.onnx",
        ]),
    ),
];

/// `path.posix.normalize`: `.` and empty parts dropped, `..` taking its parent (kept at the start
/// of a relative path), the leading and the trailing `/` kept.
pub fn normalize(path: &str) -> String {
    let absolute = path.starts_with('/');
    let mut parts: Vec<&str> = Vec::new();
    for part in path.split('/') {
        match part {
            "" | "." => {}
            ".." if parts.last().is_some_and(|last| *last != "..") => {
                parts.pop();
            }
            ".." if absolute => {}
            _ => parts.push(part),
        }
    }
    let joined = parts.join("/");
    let trailing = path.ends_with('/') && !joined.is_empty();
    match (absolute, joined.is_empty()) {
        (true, _) => format!("/{joined}{}", if trailing { "/" } else { "" }),
        (false, true) => if path.ends_with('/') { "./" } else { "." }.into(),
        (false, false) => format!("{joined}{}", if trailing { "/" } else { "" }),
    }
}

/// `path.join(staticRoot, relative)`: the path read, `..` taken before the file system follows a link.
pub fn under(static_root: &Path, relative: &str) -> PathBuf {
    PathBuf::from(normalize(&format!("{}/{relative}", static_root.display())))
}

// The files an index names, `path.posix.join(folder, line.file)` for each of its `lines`' values.
fn indexed(static_root: &Path, index: &str) -> Result<Vec<String>, String> {
    let file = static_root.join(index);
    let text = std::fs::read_to_string(&file).map_err(|e| format!("{}: {e}", file.display()))?;
    let parsed: JsonValue =
        serde_json::from_str(&text).map_err(|e| format!("{}: {e}", file.display()))?;
    let refused = || format!("offline_local_index_invalid:{index}");
    // `Object.values(lines)`: a number or a boolean holds none.
    let lines: Vec<&JsonValue> = match parsed.get("lines").ok_or_else(refused)? {
        JsonValue::Object(lines) => lines.values().collect(),
        JsonValue::Array(lines) => lines.iter().collect(),
        JsonValue::Number(_) | JsonValue::Bool(_) => Vec::new(),
        JsonValue::String(text) if text.is_empty() => Vec::new(),
        _ => return Err(refused()),
    };
    let folder = index.rsplit_once('/').map_or(".", |(folder, _)| folder);
    lines
        .into_iter()
        .map(|line| match line.get("file") {
            // `path.posix.join` leaves an empty part out.
            Some(JsonValue::String(name)) if name.is_empty() => Ok(normalize(folder)),
            Some(JsonValue::String(name)) => Ok(normalize(&format!("{folder}/{name}"))),
            _ => Err(refused()),
        })
        .collect()
}

/// `resolveOfflineLocalFiles(staticRoot)`: every entry's files under the static root, each once,
/// in UTF-16 order. A listed file that is missing (or not a file) is a broken declaration, refused
/// as `offline_local_resource_missing:<file>`: never a manifest the service worker could not
/// complete.
pub fn resolve(static_root: &Path) -> Result<Vec<String>, String> {
    let mut files = Vec::new();
    for (_, needs) in &OFFLINE_LOCAL_RESOURCES {
        match needs {
            Needs::Index(index) => files.extend(indexed(static_root, index)?),
            Needs::Files(listed) => files.extend(listed.iter().map(|file| file.to_string())),
        }
    }
    for relative in &files {
        let path = under(static_root, relative);
        match std::fs::metadata(&path) {
            Ok(meta) if meta.is_file() => {}
            Ok(_) => return Err(format!("offline_local_resource_missing:{relative}")),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                return Err(format!("offline_local_resource_missing:{relative}"));
            }
            Err(error) => return Err(format!("{}: {error}", path.display())),
        }
    }
    files.sort_by(|a, b| a.encode_utf16().cmp(b.encode_utf16()));
    files.dedup();
    Ok(files)
}
