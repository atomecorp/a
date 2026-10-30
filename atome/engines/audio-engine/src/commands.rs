// The audio commands of the native engine, one implementation for every host:
// the Tauri app wraps each one in a `#[tauri::command]`, the iOS app calls
// `dispatch` through its C ABI with the same names and JSON arguments
// (camelCase, as the JS `backend.kira.js` sends them). Results are the JSON
// the JS side reads.

use crate::{calibration, direct, instrument, metering, mix, mix_assets, playback, playback_schedule, recorder, wake_capture};
use atome_mix_graph::instrument_command::InstrumentAnswer;
use atome_mix_graph::voice::{ScheduledVoice, VoiceRequest};
use serde::Deserialize;
use serde_json::{json, Value};
use std::path::{Path, PathBuf};

fn clip_metadata_json(metadata: &playback::ClipMetadata) -> Value {
    json!({ "sample_rate": metadata.sample_rate, "frame_count": metadata.frame_count, "duration_seconds": metadata.duration_seconds })
}

// A clip or recording path: absolute, or relative to the host's project root.
fn resolve_path(project_root: Option<&Path>, raw: &str) -> Result<PathBuf, String> {
    let raw = raw.trim();
    if raw.is_empty() {
        return Err("Missing clip path".to_string());
    }
    if Path::new(raw).is_absolute() {
        return Ok(PathBuf::from(raw));
    }
    project_root.map(|root| root.join(raw)).ok_or_else(|| format!("relative_path_without_project_root: {raw}"))
}

fn existing(path: PathBuf) -> Result<PathBuf, String> {
    if !path.exists() {
        return Err(format!("Audio clip path does not exist: {}", path.display()));
    }
    path.canonicalize().map_err(|e| format!("Unable to canonicalize audio clip path {}: {e}", path.display()))
}

pub fn init() -> Result<Value, String> {
    playback::init()?;
    Ok(json!({ "success": true }))
}

// Blocking decode: hosts call it off their UI thread.
pub fn load_clip(project_root: Option<&Path>, id: &str, path: &str) -> Result<Value, String> {
    let resolved = existing(resolve_path(project_root, path)?)?;
    #[cfg(not(target_os = "ios"))]
    let (decode_path, metadata) = {
        use crate::transcode;
        let decode_path = transcode::prepare_native_audio_decode_path(&resolved)?;
        let metadata = match playback::load_clip(id, &decode_path.to_string_lossy()) {
            Ok(metadata) => metadata,
            Err(first_error) if decode_path != resolved && transcode::is_video_container_requiring_native_audio_extract(&resolved) => {
                let rebuilt = transcode::rebuild_native_audio_decode_path(&resolved)?;
                playback::load_clip(id, &rebuilt.to_string_lossy())
                    .map_err(|retry| format!("native_audio_decode_failed_after_cache_rebuild: first={first_error}; retry={retry}"))?
            }
            Err(error) => return Err(error),
        };
        (decode_path, metadata)
    };
    #[cfg(target_os = "ios")]
    let (decode_path, metadata) = (resolved.clone(), playback::load_clip(id, &resolved.to_string_lossy())?);
    Ok(json!({
        "success": true, "id": id, "path": resolved.to_string_lossy(), "decode_path": decode_path.to_string_lossy(),
        "input_path": path, "input_path_was_absolute": Path::new(path).is_absolute(),
        "metadata": clip_metadata_json(&metadata), "sample_rate": metadata.sample_rate,
        "frame_count": metadata.frame_count, "duration_seconds": metadata.duration_seconds
    }))
}

pub fn load_clip_from_bytes(id: &str, bytes: Vec<u8>) -> Result<Value, String> {
    let byte_len = bytes.len();
    let metadata = playback::load_clip_from_bytes(id, bytes)?;
    Ok(json!({
        "success": true, "id": id, "bytes_len": byte_len, "metadata": clip_metadata_json(&metadata),
        "sample_rate": metadata.sample_rate, "frame_count": metadata.frame_count, "duration_seconds": metadata.duration_seconds
    }))
}

pub fn has_clip(id: &str) -> Result<Value, String> {
    Ok(json!({ "success": true, "id": id, "loaded": playback::has_clip(id)? }))
}

pub fn play(id: &str) -> Result<Value, String> {
    playback::play(id)?;
    Ok(json!({ "success": true, "id": id }))
}

pub fn play_instance(asset_id: &str, voice_id: &str, request: &VoiceRequest, strip_id: Option<&str>) -> Result<Value, String> {
    playback::play_instance(
        asset_id, voice_id, request.start_seconds, request.duration_seconds, request.gain, request.pan, request.rate,
        request.loop_start_seconds, request.loop_end_seconds, strip_id,
    )?;
    Ok(json!({ "success": true, "asset_id": asset_id, "voice_id": voice_id }))
}

pub fn schedule_instances(voices: &[ScheduledVoice]) -> Result<Value, String> {
    let frames = voices.iter()
        .map(|voice| playback_schedule::schedule_instance(&voice.asset_id, &voice.voice_id, &voice.voice, voice.start_render_frame, voice.strip_id.as_deref()))
        .collect::<Result<Vec<u64>, String>>()?;
    Ok(json!({ "success": true, "start_render_frames": frames }))
}

pub fn measure_input_latency(device_name: Option<&str>) -> Result<Value, String> {
    Ok(json!({ "success": true, "calibration": calibration::measure_input_latency(device_name)? }))
}

pub fn render_clock() -> Result<Value, String> {
    Ok(json!({ "success": true, "clock": playback_schedule::render_clock() }))
}

pub fn mix_apply(program: Value) -> Result<Value, String> {
    let program: atome_mix_graph::Program = serde_json::from_value(program).map_err(|error| format!("mix program invalid: {error}"))?;
    Ok(json!({ "success": true, "strips": mix::apply_program(program)? }))
}

pub fn mix_levels() -> Result<Value, String> {
    let levels: Vec<Value> = mix::levels()?.into_iter()
        .map(|level| json!({ "strip_id": level.strip_id, "peak": level.peak, "rms": level.rms }))
        .collect();
    Ok(json!({ "success": true, "levels": levels }))
}

pub fn mix_devices() -> Result<Value, String> {
    Ok(json!({ "success": true, "devices": mix::devices() }))
}

pub fn mix_asset_load(project_root: Option<&Path>, asset_id: &str, path: &str) -> Result<Value, String> {
    if asset_id.is_empty() {
        return Err("mix_asset_load needs an asset id".to_string());
    }
    let asset = mix_assets::read(&existing(resolve_path(project_root, path)?)?)?;
    mix::load_asset(asset_id, asset)?;
    Ok(json!({ "success": true, "asset_id": asset_id }))
}

// A Sampler's sample, loaded once for every instrument that names `sample_id` (a long WAV streams).
pub fn instrument_sample_load(project_root: Option<&Path>, sample_id: &str, path: &str) -> Result<Value, String> {
    if sample_id.is_empty() {
        return Err("instrument_sample_load needs a sample id".to_string());
    }
    let loaded = instrument::load_sample(sample_id, &existing(resolve_path(project_root, path)?)?)?;
    Ok(json!({ "success": true, "sample_id": sample_id, "frames": loaded.frames, "sample_rate": loaded.sample_rate, "channels": loaded.channels, "streamed": loaded.streamed }))
}

pub fn instrument_run(command: Value) -> Result<Value, String> {
    let command = serde_json::from_value(command).map_err(|error| format!("instrument command invalid: {error}"))?;
    Ok(match instrument::run(command)? {
        InstrumentAnswer::Actions(drained) => json!({ "success": true, "frame": null, "drained": drained }),
        InstrumentAnswer::Frames(frames) => json!({ "success": true, "frame": frames }),
        InstrumentAnswer::Done => json!({ "success": true, "frame": null }),
    })
}

pub fn mix_asset_unload(asset_id: &str) -> Result<Value, String> {
    mix::unload_asset(asset_id)?;
    Ok(json!({ "success": true, "asset_id": asset_id }))
}

pub fn mix_cut_tail(module_id: &str) -> Result<Value, String> {
    mix::cut_tail(module_id)?;
    Ok(json!({ "success": true, "module_id": module_id }))
}

pub fn mix_module_state(module_id: &str) -> Result<Value, String> {
    Ok(json!({ "success": true, "module_id": module_id, "state": mix::module_state(module_id)? }))
}

// The direct path: what is played live, in the device callback (L2).
pub fn direct_apply(program: Value) -> Result<Value, String> {
    let program: atome_mix_graph::Program = serde_json::from_value(program).map_err(|error| format!("direct program invalid: {error}"))?;
    Ok(json!({ "success": true, "strips": direct::apply(program)?, "buffer_frames": direct::BUFFER_FRAMES }))
}

// Round trip of the direct path through an input (default: the default input).
pub fn direct_measure_latency(device_name: Option<&str>) -> Result<Value, String> {
    let device = match device_name.filter(|name| !name.is_empty()) {
        Some(name) => name.to_string(),
        None => cpal::traits::DeviceTrait::name(&recorder::input_device(None)?).map_err(|error| format!("input_device_name: {error}"))?,
    };
    let rate = playback_schedule::render_clock().map(|clock| clock.sample_rate).ok_or("Audio engine not initialized")?;
    Ok(json!({ "success": true, "round_trip": direct::measure_round_trip(&device, rate)? }))
}

pub fn direct_levels() -> Result<Value, String> {
    let levels: Vec<Value> = direct::levels()?.into_iter()
        .map(|level| json!({ "strip_id": level.strip_id, "peak": level.peak, "rms": level.rms }))
        .collect();
    Ok(json!({ "success": true, "levels": levels }))
}

pub fn direct_cut_tail(module_id: &str) -> Result<Value, String> {
    direct::cut_tail(module_id)?;
    Ok(json!({ "success": true, "module_id": module_id }))
}

pub fn direct_module_state(module_id: &str) -> Result<Value, String> {
    Ok(json!({ "success": true, "module_id": module_id, "state": direct::module_state(module_id)? }))
}

pub fn stop(id: &str) -> Result<Value, String> {
    playback::stop(id)?;
    Ok(json!({ "success": true, "id": id }))
}

pub fn stop_instance(voice_id: &str) -> Result<Value, String> {
    playback::stop_instance(voice_id)?;
    Ok(json!({ "success": true, "voice_id": voice_id }))
}

pub fn destroy_clip(id: &str) -> Result<Value, String> {
    playback::destroy_clip(id)?;
    Ok(json!({ "success": true, "id": id }))
}

pub fn set_volume(id: &str, db: f64) -> Result<Value, String> {
    playback::set_volume(id, db)?;
    Ok(json!({ "success": true, "id": id }))
}

pub fn set_pan(id: &str, pan: f64) -> Result<Value, String> {
    playback::set_pan(id, pan)?;
    Ok(json!({ "success": true, "id": id, "pan": pan }))
}

pub fn set_playback_rate(id: &str, rate: f64) -> Result<Value, String> {
    playback::set_playback_rate(id, rate)?;
    Ok(json!({ "success": true, "id": id }))
}

pub fn record_start(project_root: Option<&Path>, session_id: &str, file_path: &str, sample_rate: u32, channels: u16, input_device_name: Option<String>) -> Result<Value, String> {
    let absolute = resolve_path(project_root, file_path)?.to_string_lossy().to_string();
    metering::reset();
    recorder::start_on_device(session_id, &absolute, sample_rate, channels, input_device_name)?;
    let (sample_rate, channels) = recorder::session_format(session_id).unwrap_or((sample_rate, channels));
    Ok(json!({ "success": true, "session_id": session_id, "file_path": file_path, "absolute_file_path": absolute,
        "sample_rate": sample_rate, "channels": channels }))
}

pub fn record_stop(session_id: &str) -> Result<Value, String> {
    let result = recorder::stop(session_id)?;
    Ok(json!({
        "success": true, "session_id": result.session_id, "absolute_file_path": result.file_path, "size_bytes": result.size_bytes,
        "duration_sec": result.duration_sec, "frame_count": result.frame_count, "overrun_frames": result.overrun_frames,
        "sample_rate": result.sample_rate, "channels": result.channels, "capture_clock": result.capture_clock, "output_format": result.output_format
    }))
}

pub fn get_levels() -> Result<Value, String> {
    let levels = metering::get_levels();
    Ok(json!({
        "rms": levels.rms, "peak": levels.peak, "rms_db": levels.rms_db, "peak_db": levels.peak_db,
        "smoothed_rms": levels.smoothed_rms, "smoothed_rms_db": levels.smoothed_rms_db, "clip_count": levels.clip_count
    }))
}

pub fn get_scope() -> Result<Value, String> {
    let scope = metering::get_scope();
    let levels = metering::get_levels();
    Ok(json!({
        "available": scope.available, "sequence": scope.sequence, "sample_rate": scope.sample_rate,
        "channels": scope.channels, "pairs": scope.pairs, "rms": levels.rms, "peak": levels.peak
    }))
}

// A late end for a scheduled or sounding voice: `end_frame` frames after its
// first one, fading over `release_frames` (a cell's quantized stop, its release).
pub fn set_voice_end(voice_id: &str, end_frame: u64, release_frames: u64) -> Result<Value, String> {
    let found = atome_mix_graph::voice_control::set_end(voice_id, end_frame, release_frames);
    Ok(json!({ "success": true, "found": found }))
}

pub fn shutdown() -> Result<Value, String> {
    wake_capture::stop()?;
    playback::shutdown()?;
    Ok(json!({ "success": true }))
}

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
struct Args {
    id: String,
    path: String,
    bytes: Vec<u8>,
    asset_id: String,
    voice_id: String,
    strip_id: Option<String>,
    voices: Vec<ScheduledVoice>,
    device_name: Option<String>,
    program: Value,
    module_id: String,
    db: f64,
    pan: f64,
    rate: f64,
    session_id: String,
    file_path: String,
    sample_rate: u32,
    channels: u16,
    input_device_name: Option<String>,
    end_frame: u64,
    release_frames: u64,
    models_root: String,
    own_capture: bool,
    phrases: Vec<String>,
    speaking: bool,
    listening: String,
    verifier: Option<String>,
    record: bool,
    sample_id: String,
    command: Value,
}

// Every command by name, with the JSON arguments the JS side sends.
pub fn dispatch(name: &str, args: &Value, project_root: Option<&Path>) -> Result<Value, String> {
    let parsed: Args = serde_json::from_value(args.clone()).map_err(|error| format!("audio_command_args_invalid:{name}: {error}"))?;
    let voice = || serde_json::from_value::<VoiceRequest>(args.clone()).map_err(|error| format!("audio_voice_invalid: {error}"));
    match name.trim_start_matches("audio_") {
        "init" => init(),
        "load_clip" => load_clip(project_root, &parsed.id, &parsed.path),
        "load_clip_from_bytes" => load_clip_from_bytes(&parsed.id, parsed.bytes),
        "has_clip" => has_clip(&parsed.id),
        "play" => play(&parsed.id),
        "play_instance" => play_instance(&parsed.asset_id, &parsed.voice_id, &voice()?, parsed.strip_id.as_deref()),
        "schedule_instances" => schedule_instances(&parsed.voices),
        "measure_input_latency" => measure_input_latency(parsed.device_name.as_deref()),
        "render_clock" => render_clock(),
        "mix_apply" => mix_apply(parsed.program),
        "mix_levels" => mix_levels(),
        "mix_devices" => mix_devices(),
        "mix_cut_tail" => mix_cut_tail(&parsed.module_id),
        "mix_asset_load" => mix_asset_load(project_root, &parsed.asset_id, &parsed.path),
        "mix_asset_unload" => mix_asset_unload(&parsed.asset_id),
        "mix_module_state" => mix_module_state(&parsed.module_id),
        "instrument_sample_load" => instrument_sample_load(project_root, &parsed.sample_id, &parsed.path),
        "instrument" => instrument_run(parsed.command),
        "direct_apply" => direct_apply(parsed.program),
        "direct_levels" => direct_levels(),
        "direct_measure_latency" => direct_measure_latency(parsed.device_name.as_deref()),
        "direct_cut_tail" => direct_cut_tail(&parsed.module_id),
        "direct_module_state" => direct_module_state(&parsed.module_id),
        "stop" => stop(&parsed.id),
        "stop_instance" => stop_instance(&parsed.voice_id),
        "set_voice_end" => set_voice_end(&parsed.voice_id, parsed.end_frame, parsed.release_frames),
        "destroy_clip" => destroy_clip(&parsed.id),
        "set_volume" => set_volume(&parsed.id, parsed.db),
        "set_pan" => set_pan(&parsed.id, parsed.pan),
        "set_playback_rate" => set_playback_rate(&parsed.id, parsed.rate),
        "record_start" => record_start(project_root, &parsed.session_id, &parsed.file_path, parsed.sample_rate, parsed.channels, parsed.input_device_name),
        "record_stop" => record_stop(&parsed.session_id),
        "get_levels" => get_levels(),
        "get_scope" => get_scope(),
        "shutdown" => shutdown(),
        "wake_start" => wake_capture::start(parsed.sample_rate),
        "wake_stop" => wake_capture::stop(),
        "wake_read" => wake_capture::read(),
        #[cfg(feature = "voice")]
        "voice_start" => crate::voice::session::start(&resolve_path(project_root, &parsed.models_root)?, parsed.own_capture),
        #[cfg(feature = "voice")]
        "voice_stop" => crate::voice::session::stop(),
        #[cfg(feature = "voice")]
        "voice_set_phrases" => crate::voice::session::set_phrases(parsed.phrases),
        #[cfg(feature = "voice")]
        "voice_set_speaking" => crate::voice::session::set_speaking(parsed.speaking),
        #[cfg(feature = "voice")]
        "voice_set_listening" => crate::voice::session::set_listening(&parsed.listening),
        #[cfg(feature = "voice")]
        "voice_set_wake_verifier" => crate::voice::session::set_wake_verifier(parsed.verifier),
        #[cfg(feature = "voice")]
        "voice_read" => crate::voice::session::read(parsed.record),
        other => Err(format!("audio_command_unknown:{other}")),
    }
}
