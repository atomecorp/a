// The remote control's audio routes (`/ws/control`): the Tauri audio engine records, analyses
// and plays a file of the project for an authorized remote controller.
use super::*;

#[derive(Deserialize, Default)]
pub(super) struct RemoteAudioRecordStartRequest {
    session_id: Option<String>,
    #[serde(rename = "sessionId")]
    session_id_camel: Option<String>,
    file_path: Option<String>,
    #[serde(rename = "filePath")]
    file_path_camel: Option<String>,
    sample_rate: Option<u32>,
    #[serde(rename = "sampleRate")]
    sample_rate_camel: Option<u32>,
    channels: Option<u16>,
}

#[derive(Deserialize, Default)]
pub(super) struct RemoteAudioRecordStopRequest {
    session_id: Option<String>,
    #[serde(rename = "sessionId")]
    session_id_camel: Option<String>,
}

#[derive(Deserialize, Default)]
pub(super) struct RemoteAudioAnalyzeRequest {
    file_path: Option<String>,
    #[serde(rename = "filePath")]
    file_path_camel: Option<String>,
    absolute_file_path: Option<String>,
    #[serde(rename = "absoluteFilePath")]
    absolute_file_path_camel: Option<String>,
}

#[derive(Deserialize, Default)]
pub(super) struct RemoteAudioPlaybackLoadRequest {
    id: Option<String>,
    file_path: Option<String>,
    #[serde(rename = "filePath")]
    file_path_camel: Option<String>,
    absolute_file_path: Option<String>,
    #[serde(rename = "absoluteFilePath")]
    absolute_file_path_camel: Option<String>,
}

#[derive(Deserialize, Default)]
pub(super) struct RemoteAudioPlaybackPlayRequest {
    id: Option<String>,
    voice_id: Option<String>,
    #[serde(rename = "voiceId")]
    voice_id_camel: Option<String>,
    start_seconds: Option<f64>,
    #[serde(rename = "startSeconds")]
    start_seconds_camel: Option<f64>,
    duration_seconds: Option<f64>,
    #[serde(rename = "durationSeconds")]
    duration_seconds_camel: Option<f64>,
    gain: Option<f64>,
    pan: Option<f64>,
    rate: Option<f64>,
}

#[derive(Deserialize, Default)]
pub(super) struct RemoteAudioPlaybackStopRequest {
    id: Option<String>,
    voice_id: Option<String>,
    #[serde(rename = "voiceId")]
    voice_id_camel: Option<String>,
}

pub(super) fn clean_remote_segment(value: &str, fallback: &str) -> String {
    let sanitized = sanitize_file_name(value.trim());
    if sanitized.is_empty() || sanitized == "upload.bin" {
        fallback.to_string()
    } else {
        sanitized
    }
}

pub(super) fn remote_default_recording_path(project_root: &Path, session_id: &str) -> PathBuf {
    let safe_session = clean_remote_segment(session_id, "remote_session");
    project_root
        .join("data")
        .join("remote")
        .join("recordings")
        .join(format!("{safe_session}.wav"))
}

pub(super) fn resolve_remote_audio_path(
    state: &AppState,
    raw_path: Option<&str>,
    fallback_session: Option<&str>,
    must_exist: bool,
) -> Result<PathBuf, String> {
    let project_root = state.project_root.as_ref();
    let Some(raw_path) = raw_path.map(str::trim).filter(|value| !value.is_empty()) else {
        return fallback_session
            .map(|session| remote_default_recording_path(project_root, session))
            .ok_or_else(|| "Missing audio file path".to_string());
    };

    let cleaned = raw_path.trim_start_matches("file://");
    let candidate = PathBuf::from(cleaned);
    let resolved = if candidate.is_absolute() {
        candidate
    } else {
        if candidate.components().any(|part| {
            matches!(
                part,
                Component::ParentDir | Component::RootDir | Component::Prefix(_)
            )
        }) {
            return Err("Remote audio path must stay inside the project".to_string());
        }
        project_root.join(candidate)
    };

    if resolved
        .components()
        .any(|part| matches!(part, Component::ParentDir))
    {
        return Err("Remote audio path must not contain parent directory segments".to_string());
    }

    let canonical_parent = resolved
        .parent()
        .and_then(|parent| parent.canonicalize().ok())
        .or_else(|| project_root.canonicalize().ok())
        .unwrap_or_else(|| project_root.to_path_buf());
    let canonical_root = project_root
        .canonicalize()
        .unwrap_or_else(|_| project_root.to_path_buf());
    if !canonical_parent.starts_with(&canonical_root) {
        return Err("Remote audio path is outside the project root".to_string());
    }
    if must_exist && !resolved.exists() {
        return Err(format!("Audio file not found: {}", resolved.display()));
    }

    Ok(resolved)
}

pub(super) async fn remote_audio_record_start_handler(
    headers: HeaderMap,
    State(state): State<AppState>,
    Json(payload): Json<RemoteAudioRecordStartRequest>,
) -> impl IntoResponse {
    let user_id = match require_remote_control(&headers, &state) {
        Ok(user_id) => user_id,
        Err(error) => return error.into_response(),
    };
    let session_id = payload
        .session_id
        .or(payload.session_id_camel)
        .map(|value| clean_remote_segment(&value, "remote_session"))
        .unwrap_or_else(|| format!("remote_{}", Uuid::new_v4()));
    let requested_path = payload.file_path.or(payload.file_path_camel);
    let path = match resolve_remote_audio_path(
        &state,
        requested_path.as_deref(),
        Some(&session_id),
        false,
    ) {
        Ok(path) => path,
        Err(error) => return json_error(StatusCode::BAD_REQUEST, &error).into_response(),
    };
    let sample_rate = payload
        .sample_rate
        .or(payload.sample_rate_camel)
        .unwrap_or(0);
    let channels = payload.channels.unwrap_or(0);

    crate::audio_engine::metering::reset();
    let path_string = path.to_string_lossy().to_string();
    match crate::audio_engine::recorder::start(&session_id, &path_string, sample_rate, channels) {
        Ok(()) => {
            println!(
                "[TauriRemote] audio record start session={} user={:?} path={} sr={} ch={}",
                session_id, user_id, path_string, sample_rate, channels
            );
            Json(json!({
                "success": true,
                "runtime": "tauri",
                "session_id": session_id,
                "absolute_file_path": path_string,
                "sample_rate_requested": sample_rate,
                "channels_requested": channels,
                "user_id": user_id
            }))
            .into_response()
        }
        Err(error) => json_error(StatusCode::INTERNAL_SERVER_ERROR, &error).into_response(),
    }
}

pub(super) async fn remote_audio_record_stop_handler(
    headers: HeaderMap,
    State(state): State<AppState>,
    Json(payload): Json<RemoteAudioRecordStopRequest>,
) -> impl IntoResponse {
    let user_id = match require_remote_control(&headers, &state) {
        Ok(user_id) => user_id,
        Err(error) => return error.into_response(),
    };
    let session_id = payload
        .session_id
        .or(payload.session_id_camel)
        .map(|value| clean_remote_segment(&value, "remote_session"))
        .unwrap_or_else(|| "remote_session".to_string());
    match crate::audio_engine::recorder::stop(&session_id) {
        Ok(result) => {
            let analysis = analyze_wav_file(Path::new(&result.file_path))
                .unwrap_or_else(|error| json!({ "success": false, "error": error }));
            println!(
                "[TauriRemote] audio record stop session={} user={:?} path={} duration={} frames={}",
                result.session_id,
                user_id,
                result.file_path,
                result.duration_sec,
                result.frame_count
            );
            Json(json!({
                "success": true,
                "runtime": "tauri",
                "session_id": result.session_id,
                "absolute_file_path": result.file_path,
                "duration_sec": result.duration_sec,
                "frame_count": result.frame_count,
                "sample_rate": result.sample_rate,
                "channels": result.channels,
                "output_format": result.output_format,
                "analysis": analysis,
                "user_id": user_id
            }))
            .into_response()
        }
        Err(error) => json_error(StatusCode::INTERNAL_SERVER_ERROR, &error).into_response(),
    }
}

pub(super) async fn remote_audio_analyze_handler(
    headers: HeaderMap,
    State(state): State<AppState>,
    Json(payload): Json<RemoteAudioAnalyzeRequest>,
) -> impl IntoResponse {
    let user_id = match require_remote_control(&headers, &state) {
        Ok(user_id) => user_id,
        Err(error) => return error.into_response(),
    };
    let requested_path = payload
        .absolute_file_path
        .or(payload.absolute_file_path_camel)
        .or(payload.file_path)
        .or(payload.file_path_camel);
    let path = match resolve_remote_audio_path(&state, requested_path.as_deref(), None, true) {
        Ok(path) => path,
        Err(error) => return json_error(StatusCode::BAD_REQUEST, &error).into_response(),
    };
    match analyze_wav_file(&path) {
        Ok(analysis) => Json(json!({
            "success": true,
            "runtime": "tauri",
            "analysis": analysis,
            "user_id": user_id
        }))
        .into_response(),
        Err(error) => json_error(StatusCode::INTERNAL_SERVER_ERROR, &error).into_response(),
    }
}

pub(super) async fn remote_audio_playback_load_handler(
    headers: HeaderMap,
    State(state): State<AppState>,
    Json(payload): Json<RemoteAudioPlaybackLoadRequest>,
) -> impl IntoResponse {
    let user_id = match require_remote_control(&headers, &state) {
        Ok(user_id) => user_id,
        Err(error) => return error.into_response(),
    };
    let id = payload
        .id
        .map(|value| clean_remote_segment(&value, "remote_clip"))
        .unwrap_or_else(|| format!("remote_clip_{}", Uuid::new_v4()));
    let requested_path = payload
        .absolute_file_path
        .or(payload.absolute_file_path_camel)
        .or(payload.file_path)
        .or(payload.file_path_camel);
    let path = match resolve_remote_audio_path(&state, requested_path.as_deref(), None, true) {
        Ok(path) => path,
        Err(error) => return json_error(StatusCode::BAD_REQUEST, &error).into_response(),
    };
    let path_string = path.to_string_lossy().to_string();
    if let Err(error) = crate::audio_engine::playback::init() {
        return json_error(StatusCode::INTERNAL_SERVER_ERROR, &error).into_response();
    }
    match crate::audio_engine::playback::load_clip(&id, &path_string) {
        Ok(metadata) => {
            println!(
                "[TauriRemote] audio playback load id={} user={:?} path={} duration={}s",
                id, user_id, path_string, metadata.duration_seconds
            );
            Json(json!({
                "success": true,
                "runtime": "tauri",
                "id": id,
                "absolute_file_path": path_string,
                "metadata": {
                    "sample_rate": metadata.sample_rate,
                    "frame_count": metadata.frame_count,
                    "duration_seconds": metadata.duration_seconds
                },
                "sample_rate": metadata.sample_rate,
                "frame_count": metadata.frame_count,
                "duration_seconds": metadata.duration_seconds,
                "user_id": user_id
            }))
            .into_response()
        }
        Err(error) => json_error(StatusCode::INTERNAL_SERVER_ERROR, &error).into_response(),
    }
}

pub(super) async fn remote_audio_playback_play_handler(
    headers: HeaderMap,
    State(state): State<AppState>,
    Json(payload): Json<RemoteAudioPlaybackPlayRequest>,
) -> impl IntoResponse {
    let user_id = match require_remote_control(&headers, &state) {
        Ok(user_id) => user_id,
        Err(error) => return error.into_response(),
    };
    let id = payload
        .id
        .map(|value| clean_remote_segment(&value, "remote_clip"))
        .unwrap_or_else(|| "remote_clip".to_string());
    let voice_id = payload
        .voice_id
        .or(payload.voice_id_camel)
        .map(|value| clean_remote_segment(&value, &id))
        .unwrap_or_else(|| id.clone());
    let start_seconds = payload
        .start_seconds
        .or(payload.start_seconds_camel)
        .unwrap_or(0.0);
    let duration_seconds = payload.duration_seconds.or(payload.duration_seconds_camel);
    let gain = payload.gain.unwrap_or(1.0);
    let pan = payload.pan.unwrap_or(0.0);
    let rate = payload.rate.unwrap_or(1.0);
    match crate::audio_engine::playback::play_instance(
        &id,
        &voice_id,
        start_seconds,
        duration_seconds,
        gain,
        pan,
        rate,
        None,
        None,
        None,
    ) {
        Ok(()) => {
            println!(
                "[TauriRemote] audio playback play id={} voice={} user={:?} start={} duration={:?}",
                id, voice_id, user_id, start_seconds, duration_seconds
            );
            Json(json!({
                "success": true,
                "runtime": "tauri",
                "id": id,
                "voice_id": voice_id,
                "start_seconds": start_seconds,
                "duration_seconds": duration_seconds,
                "gain": gain,
                "rate": rate,
                "user_id": user_id
            }))
            .into_response()
        }
        Err(error) => json_error(StatusCode::INTERNAL_SERVER_ERROR, &error).into_response(),
    }
}

pub(super) async fn remote_audio_playback_stop_handler(
    headers: HeaderMap,
    State(state): State<AppState>,
    Json(payload): Json<RemoteAudioPlaybackStopRequest>,
) -> impl IntoResponse {
    let user_id = match require_remote_control(&headers, &state) {
        Ok(user_id) => user_id,
        Err(error) => return error.into_response(),
    };
    let id = payload
        .id
        .map(|value| clean_remote_segment(&value, "remote_clip"))
        .unwrap_or_else(|| "remote_clip".to_string());
    let voice_id = payload
        .voice_id
        .or(payload.voice_id_camel)
        .map(|value| clean_remote_segment(&value, &id))
        .unwrap_or_else(|| id.clone());
    match crate::audio_engine::playback::stop_instance(&voice_id) {
        Ok(()) => Json(json!({
            "success": true,
            "runtime": "tauri",
            "id": id,
            "voice_id": voice_id,
            "user_id": user_id
        }))
        .into_response(),
        Err(error) => json_error(StatusCode::INTERNAL_SERVER_ERROR, &error).into_response(),
    }
}
