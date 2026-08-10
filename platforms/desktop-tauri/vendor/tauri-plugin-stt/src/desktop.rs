use serde::de::DeserializeOwned;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{plugin::PluginApi, AppHandle, Emitter, Manager, Runtime};

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use vosk::{Model, Recognizer};

use crate::desktop_audio::{resample_linear, TARGET_SAMPLE_RATE};
use crate::model_catalog::{
    language_display_name, model_for_language, AVAILABLE_MODELS, DEFAULT_MODEL_NAME,
    DEFAULT_MODEL_URL,
};
use crate::model_download::prepare_model_files;
use crate::models::*;

use std::sync::atomic::{AtomicU64, Ordering};

/// Session counter - incremented each time a new listening session starts.
/// Audio callbacks capture their session ID and only process audio if it matches
/// the current session. This prevents old audio data from bleeding into new sessions.
static SESSION_COUNTER: AtomicU64 = AtomicU64::new(0);
static ACTIVE_SESSION_ID: AtomicU64 = AtomicU64::new(0);

fn emit_audio_error<R: Runtime>(app: &AppHandle<R>, error: &cpal::StreamError) {
    let _ = app.emit(
        "plugin:stt:diagnostic",
        serde_json::json!({
            "stage": "audio.stream.error",
            "error": error.to_string()
        }),
    );
}

/// Shared audio processing state that can be reused across sessions.
/// This avoids creating new audio streams for each PTT press.
struct AudioProcessor {
    /// The audio buffer accumulating samples
    buffer: Vec<i16>,
    /// The Vosk recognizer
    recognizer: Recognizer,
    /// Last emitted partial result (to avoid duplicates)
    last_partial: String,
    /// Whether to emit interim results
    interim_results: bool,
    /// Native device sample rate used by the streaming resampler.
    input_sample_rate: f64,
    /// Fractional input position carried between audio chunks.
    resample_position: f64,
    /// Last source sample retained for interpolation continuity.
    resample_previous: Option<i16>,
}

struct SttState {
    model: Option<Arc<Model>>,
    current_model_name: Option<String>,
    is_listening: bool,
    listen_start_time: Option<Instant>,
    max_duration_ms: Option<u64>,
    /// The session ID of the current listening session (0 = not listening)
    active_session_id: u64,
    /// Audio processor owned by the currently open microphone stream.
    audio_processor: Option<Arc<Mutex<AudioProcessor>>>,
    /// The only native microphone stream; dropping it closes capture.
    audio_stream: Option<cpal::Stream>,
}

pub fn init<R: Runtime, C: DeserializeOwned>(
    app: &AppHandle<R>,
    _api: PluginApi<R, C>,
) -> crate::Result<Stt<R>> {
    let state = Arc::new(Mutex::new(SttState {
        model: None,
        current_model_name: None,
        is_listening: false,
        listen_start_time: None,
        max_duration_ms: None,
        active_session_id: 0,
        audio_processor: None,
        audio_stream: None,
    }));

    Ok(Stt {
        app: app.clone(),
        state,
        model_prepare_lock: Arc::new(Mutex::new(())),
    })
}

pub struct Stt<R: Runtime> {
    app: AppHandle<R>,
    state: Arc<Mutex<SttState>>,
    model_prepare_lock: Arc<Mutex<()>>,
}

impl<R: Runtime> Stt<R> {
    fn get_models_dir(&self) -> PathBuf {
        self.app
            .path()
            .app_data_dir()
            .unwrap_or_else(|_| PathBuf::from("."))
            .join("vosk-models")
    }

    fn ensure_model(&self, language: Option<&str>) -> crate::Result<Arc<Model>> {
        let _prepare_guard = self.model_prepare_lock.lock().unwrap();
        let started_at = Instant::now();
        let (model_name, model_url) = if let Some(lang) = language {
            match model_for_language(lang) {
                Some((name, url)) => (name, url),
                None => (DEFAULT_MODEL_NAME, DEFAULT_MODEL_URL),
            }
        } else {
            (DEFAULT_MODEL_NAME, DEFAULT_MODEL_URL)
        };

        let mut state = self.state.lock().unwrap();

        // Check if we already have this model loaded
        if let Some(current) = &state.current_model_name {
            if current == model_name {
                if let Some(model) = &state.model {
                    let _ = self.app.emit(
                        "plugin:stt:diagnostic",
                        serde_json::json!({
                            "stage": "model.ready",
                            "model": model_name,
                            "cached": true,
                            "elapsedMs": started_at.elapsed().as_millis()
                        }),
                    );
                    return Ok(model.clone());
                }
            }
        }

        // Drop existing model if switching
        state.model = None;
        state.current_model_name = None;
        // Also invalidate the audio processor since it has the old recognizer
        state.audio_processor = None;
        state.audio_stream = None;

        drop(state);

        let _ = self.app.emit(
            "plugin:stt:diagnostic",
            serde_json::json!({
                "stage": "model.load.start",
                "model": model_name,
                "language": language
            }),
        );

        // Download model if needed
        let model_path =
            prepare_model_files(&self.app, self.get_models_dir(), model_name, model_url)?;

        if !model_path.exists() {
            return Err(crate::Error::NotAvailable(format!(
                "Vosk model not found at {:?}",
                model_path
            )));
        }

        let model = Model::new(model_path.to_str().unwrap())
            .ok_or_else(|| crate::Error::Recording("Failed to load Vosk model".to_string()))?;

        let model = Arc::new(model);
        let _ = self.app.emit(
            "plugin:stt:diagnostic",
            serde_json::json!({
                "stage": "model.ready",
                "model": model_name,
                "cached": false,
                "elapsedMs": started_at.elapsed().as_millis()
            }),
        );
        let _ = self.app.emit(
            "stt://download-progress",
            serde_json::json!({
                "status": "ready",
                "model": model_name,
                "progress": 100
            }),
        );

        let mut state = self.state.lock().unwrap();
        state.model = Some(model.clone());
        state.current_model_name = Some(model_name.to_string());

        Ok(model)
    }

    pub fn prepare_model(&self, language: Option<&str>) -> crate::Result<()> {
        self.ensure_model(language).map(|_| ())
    }

    pub fn start_listening(&self, config: ListenConfig) -> crate::Result<()> {
        let model = self.ensure_model(config.language.as_deref())?;

        let mut state = self.state.lock().unwrap();

        if state.is_listening {
            return Err(crate::Error::Recording("Already listening".to_string()));
        }

        // Generate a new session ID
        let session_id = SESSION_COUNTER.fetch_add(1, Ordering::SeqCst) + 1;
        state.active_session_id = session_id;

        // Store maxDuration config (in milliseconds)
        state.listen_start_time = Some(Instant::now());
        state.max_duration_ms = if config.max_duration > 0 {
            Some(config.max_duration as u64)
        } else {
            None
        };

        let interim_results = config.interim_results;

        {
            // Create new audio processor and stream
            let host = cpal::default_host();
            let device = host
                .default_input_device()
                .ok_or_else(|| crate::Error::Recording("No input device available".to_string()))?;

            let stream_config = device.default_input_config().map_err(|e| {
                crate::Error::Recording(format!("Failed to get input config: {}", e))
            })?;

            let channels = stream_config.channels() as usize;
            let sample_format = stream_config.sample_format();
            let device_sample_rate = stream_config.sample_rate() as f64;

            let _ = self.app.emit(
                "plugin:stt:diagnostic",
                serde_json::json!({
                    "stage": "audio.stream.config",
                    "sampleRate": device_sample_rate,
                    "targetSampleRate": TARGET_SAMPLE_RATE,
                    "channels": channels,
                    "sampleFormat": format!("{:?}", sample_format)
                }),
            );

            // Vosk expects 16kHz
            let target_sample_rate = TARGET_SAMPLE_RATE as f32;
            let mut recognizer = Recognizer::new(&model, target_sample_rate).ok_or_else(|| {
                crate::Error::Recording("Failed to create recognizer".to_string())
            })?;

            recognizer.set_max_alternatives(config.max_alternatives.unwrap_or(1) as u16);
            recognizer.set_partial_words(interim_results);

            let audio_processor = Arc::new(Mutex::new(AudioProcessor {
                buffer: Vec::new(),
                recognizer,
                last_partial: String::new(),
                interim_results,
                input_sample_rate: device_sample_rate,
                resample_position: 0.0,
                resample_previous: None,
            }));

            state.audio_processor = Some(audio_processor.clone());

            let app_handle = self.app.clone();
            let processor_for_callback = audio_processor.clone();

            let process_audio = move |samples_i16: Vec<i16>| {
                // Check if this callback's session is still the active one
                let current_session = ACTIVE_SESSION_ID.load(Ordering::SeqCst);
                if current_session == 0 {
                    // Session ID 0 means not listening - skip processing
                    return;
                }

                let mut processor = processor_for_callback.lock().unwrap();

                // Accumulate samples in buffer
                processor.buffer.extend_from_slice(&samples_i16);

                // Process when we have at least 0.1 seconds of audio after resampling
                let required_samples = (processor.input_sample_rate * 0.1).round() as usize;

                if processor.buffer.len() < required_samples {
                    return;
                }

                // Take all accumulated samples
                let samples_to_process: Vec<i16> = processor.buffer.drain(..).collect();

                let rms = (samples_to_process
                    .iter()
                    .map(|sample| {
                        let normalized = *sample as f64 / i16::MAX as f64;
                        normalized * normalized
                    })
                    .sum::<f64>()
                    / samples_to_process.len() as f64)
                    .sqrt();
                let _ = app_handle.emit("plugin:stt:audioLevel", serde_json::json!({ "rms": rms }));

                let input_sample_rate = processor.input_sample_rate;
                let mut resample_position = processor.resample_position;
                let mut resample_previous = processor.resample_previous;
                let resampled = resample_linear(
                    &samples_to_process,
                    input_sample_rate,
                    &mut resample_position,
                    &mut resample_previous,
                );
                processor.resample_position = resample_position;
                processor.resample_previous = resample_previous;

                // Accept waveform returns Result<DecodingState, _>
                let result = processor.recognizer.accept_waveform(&resampled);
                let is_final = matches!(result, Ok(vosk::DecodingState::Finalized));

                if is_final {
                    let result = processor.recognizer.result();
                    let (text, confidence, alternatives) = match result {
                        vosk::CompleteResult::Single(single) => {
                            let text = single.text.to_string();
                            let alternatives = if text.is_empty() {
                                Vec::new()
                            } else {
                                vec![RecognitionAlternative {
                                    transcript: text.clone(),
                                    confidence: None,
                                }]
                            };
                            (text, None, alternatives)
                        }
                        vosk::CompleteResult::Multiple(multiple) => {
                            let alternatives: Vec<RecognitionAlternative> = multiple
                                .alternatives
                                .iter()
                                .map(|alternative| RecognitionAlternative {
                                    transcript: alternative.text.to_string(),
                                    confidence: Some(alternative.confidence),
                                })
                                .collect();
                            let selected = alternatives.first();
                            (
                                selected
                                    .map(|entry| entry.transcript.clone())
                                    .unwrap_or_default(),
                                selected.and_then(|entry| entry.confidence),
                                alternatives,
                            )
                        }
                    };

                    if !text.is_empty() {
                        processor.last_partial = String::new();

                        let result = RecognitionResult {
                            transcript: text,
                            is_final: true,
                            confidence,
                            alternatives,
                        };
                        let _ = app_handle.emit("stt://result", &result);
                        let _ = app_handle.emit("plugin:stt:result", &result);
                    }
                } else if processor.interim_results {
                    let partial = processor.recognizer.partial_result();
                    let partial_text = partial.partial.to_string();
                    if !partial_text.is_empty() && processor.last_partial != partial_text {
                        processor.last_partial = partial_text.clone();

                        let result = RecognitionResult {
                            transcript: partial_text,
                            is_final: false,
                            confidence: None,
                            alternatives: vec![],
                        };
                        let _ = app_handle.emit("stt://result", &result);
                        let _ = app_handle.emit("plugin:stt:result", &result);
                    }
                }
            };

            let stream = match sample_format {
                cpal::SampleFormat::F32 => {
                    let error_app = self.app.clone();
                    device.build_input_stream(
                        &stream_config.into(),
                        move |data: &[f32], _: &cpal::InputCallbackInfo| {
                            let mono_i16: Vec<i16> = if channels == 1 {
                                data.iter()
                                    .map(|&s| (s.clamp(-1.0, 1.0) * 32767.0) as i16)
                                    .collect()
                            } else {
                                data.chunks(channels)
                                    .map(|frame| {
                                        let avg = frame.iter().sum::<f32>() / channels as f32;
                                        (avg.clamp(-1.0, 1.0) * 32767.0) as i16
                                    })
                                    .collect()
                            };
                            process_audio(mono_i16);
                        },
                        move |error| {
                            emit_audio_error(&error_app, &error);
                        },
                        None,
                    )
                }
                cpal::SampleFormat::I16 => {
                    let error_app = self.app.clone();
                    device.build_input_stream(
                        &stream_config.into(),
                        move |data: &[i16], _: &cpal::InputCallbackInfo| {
                            let mono_i16: Vec<i16> = if channels == 1 {
                                data.to_vec()
                            } else {
                                data.chunks(channels)
                                    .map(|frame| {
                                        let sum: i32 = frame.iter().map(|&s| s as i32).sum();
                                        (sum / channels as i32) as i16
                                    })
                                    .collect()
                            };
                            process_audio(mono_i16);
                        },
                        move |error| {
                            emit_audio_error(&error_app, &error);
                        },
                        None,
                    )
                }
                cpal::SampleFormat::U16 => {
                    let error_app = self.app.clone();
                    device.build_input_stream(
                        &stream_config.into(),
                        move |data: &[u16], _: &cpal::InputCallbackInfo| {
                            let mono_i16: Vec<i16> = if channels == 1 {
                                data.iter().map(|&s| (s as i32 - 32768) as i16).collect()
                            } else {
                                data.chunks(channels)
                                    .map(|frame| {
                                        let avg = frame.iter().map(|&s| s as i32).sum::<i32>()
                                            / channels as i32;
                                        (avg - 32768) as i16
                                    })
                                    .collect()
                            };
                            process_audio(mono_i16);
                        },
                        move |error| {
                            emit_audio_error(&error_app, &error);
                        },
                        None,
                    )
                }
                _ => {
                    return Err(crate::Error::Recording(format!(
                        "Unsupported sample format: {:?}",
                        sample_format
                    )));
                }
            }
            .map_err(|e| crate::Error::Recording(format!("Failed to build stream: {}", e)))?;

            stream
                .play()
                .map_err(|e| crate::Error::Recording(format!("Failed to start stream: {}", e)))?;

            ACTIVE_SESSION_ID.store(session_id, Ordering::SeqCst);
            state.audio_stream = Some(stream);
        }

        state.is_listening = true;

        // Emit stateChange event with RecognitionStatus
        let _ = self.app.emit(
            "plugin:stt:stateChange",
            RecognitionStatus {
                state: RecognitionState::Listening,
                is_available: true,
                language: config.language.clone(),
            },
        );

        // Start maxDuration timer thread if configured
        if config.max_duration > 0 {
            let max_ms = config.max_duration as u64;
            let app_handle_timer = self.app.clone();
            let state_clone = self.state.clone();
            let timer_session_id = session_id;
            std::thread::spawn(move || {
                std::thread::sleep(Duration::from_millis(max_ms));

                // Check if this timer's session is still active
                let mut state = state_clone.lock().unwrap();
                if state.is_listening && state.active_session_id == timer_session_id {
                    // Set session to 0 to stop audio processing
                    ACTIVE_SESSION_ID.store(0, Ordering::SeqCst);
                    state.is_listening = false;
                    state.listen_start_time = None;
                    state.max_duration_ms = None;
                    state.active_session_id = 0;
                    state.audio_stream = None;
                    state.audio_processor = None;

                    // Emit events
                    let _ = app_handle_timer.emit(
                        "plugin:stt:stateChange",
                        RecognitionStatus {
                            state: RecognitionState::Idle,
                            is_available: true,
                            language: None,
                        },
                    );
                    let _ = app_handle_timer.emit(
                        "stt://error",
                        serde_json::json!({
                            "error": "Maximum duration reached",
                            "code": -2
                        }),
                    );
                    let _ = app_handle_timer.emit(
                        "plugin:stt:diagnostic",
                        serde_json::json!({
                            "stage": "audio.stream.closed",
                            "reason": "maximum_duration"
                        }),
                    );
                }
            });
        }

        Ok(())
    }

    pub fn stop_listening(&self) -> crate::Result<()> {
        let mut state = self.state.lock().unwrap();

        if !state.is_listening {
            return Ok(());
        }

        ACTIVE_SESSION_ID.store(0, Ordering::SeqCst);

        state.is_listening = false;
        state.listen_start_time = None;
        state.max_duration_ms = None;
        state.active_session_id = 0;
        state.audio_stream = None;
        state.audio_processor = None;

        // Emit stateChange event
        let _ = self.app.emit(
            "plugin:stt:stateChange",
            RecognitionStatus {
                state: RecognitionState::Idle,
                is_available: true,
                language: None,
            },
        );
        let _ = self.app.emit(
            "plugin:stt:diagnostic",
            serde_json::json!({
                "stage": "audio.stream.closed",
                "reason": "stop_listening"
            }),
        );

        Ok(())
    }

    pub fn is_available(&self) -> crate::Result<AvailabilityResponse> {
        Ok(AvailabilityResponse {
            available: true,
            reason: None,
        })
    }

    pub fn get_supported_languages(&self) -> crate::Result<SupportedLanguagesResponse> {
        let models_dir = self.get_models_dir();

        let languages: Vec<SupportedLanguage> = AVAILABLE_MODELS
            .iter()
            .map(|(code, model_name, _)| {
                let installed = models_dir.join(model_name).exists();
                SupportedLanguage {
                    code: code.to_string(),
                    name: language_display_name(code),
                    installed: Some(installed),
                }
            })
            .collect();

        Ok(SupportedLanguagesResponse { languages })
    }

    pub fn check_permission(&self) -> crate::Result<PermissionResponse> {
        Ok(PermissionResponse {
            microphone: PermissionStatus::Granted,
            speech_recognition: PermissionStatus::Granted,
        })
    }

    pub fn request_permission(&self) -> crate::Result<PermissionResponse> {
        Ok(PermissionResponse {
            microphone: PermissionStatus::Granted,
            speech_recognition: PermissionStatus::Granted,
        })
    }
}
