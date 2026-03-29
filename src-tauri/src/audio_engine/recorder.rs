// CPAL-based audio recorder
// Pure Rust replacement for the Obj-C AVAudioEngine recorder.
// Records input audio to WAV files via CPAL + hound.
// The CPAL stream lives on a dedicated thread to avoid Send issues.

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{SampleFormat, StreamConfig};
use hound::{WavSpec, WavWriter};
use std::collections::HashMap;
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

use super::metering;

struct RecordingSession {
    stop_signal: Arc<AtomicBool>,
    thread_handle: Option<std::thread::JoinHandle<Result<f64, String>>>,
    start_time: std::time::Instant,
    file_path: String,
    sample_rate: u32,
    channels: u16,
}

static SESSIONS: once_cell::sync::Lazy<Mutex<HashMap<String, RecordingSession>>> =
    once_cell::sync::Lazy::new(|| Mutex::new(HashMap::new()));

#[derive(serde::Serialize, Clone, Debug)]
pub struct RecordResult {
    pub session_id: String,
    pub file_path: String,
    pub duration_sec: f64,
    pub sample_rate: u32,
    pub channels: u16,
}

pub fn start(
    session_id: &str,
    abs_wav_path: &str,
    sample_rate: u32,
    channels: u16,
) -> Result<(), String> {
    let mut sessions = SESSIONS.lock().map_err(|e| format!("Lock error: {e}"))?;
    if sessions.contains_key(session_id) {
        return Err(format!("Session '{session_id}' already active"));
    }

    // Ensure parent directory exists
    if let Some(parent) = Path::new(abs_wav_path).parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Cannot create directory {}: {e}", parent.display()))?;
    }

    let stop_signal = Arc::new(AtomicBool::new(false));
    let stop_clone = Arc::clone(&stop_signal);
    let path_owned = abs_wav_path.to_string();
    let sr = sample_rate;
    let ch = channels;

    // Spawn a thread that owns the CPAL stream (Stream is !Send, so it must
    // be created and dropped on the same thread).
    let thread_handle = std::thread::spawn(move || -> Result<f64, String> {
        let host = cpal::default_host();
        let device = host
            .default_input_device()
            .ok_or("No default input (microphone) device found")?;

        let default_config = device
            .default_input_config()
            .map_err(|e| format!("No default input config: {e}"))?;

        let actual_sr = if sr > 0 {
            sr
        } else {
            default_config.sample_rate().0
        };
        let actual_ch = if ch > 0 {
            ch
        } else {
            default_config.channels()
        };

        let stream_config = StreamConfig {
            channels: actual_ch,
            sample_rate: cpal::SampleRate(actual_sr),
            buffer_size: cpal::BufferSize::Default,
        };

        let wav_spec = WavSpec {
            channels: actual_ch,
            sample_rate: actual_sr,
            bits_per_sample: 16,
            sample_format: hound::SampleFormat::Int,
        };

        let writer = WavWriter::create(&path_owned, wav_spec)
            .map_err(|e| format!("Failed to create WAV file {path_owned}: {e}"))?;
        let writer = Arc::new(Mutex::new(Some(writer)));
        let writer_clone = Arc::clone(&writer);

        let stop_for_callback = Arc::clone(&stop_clone);

        let sample_format = default_config.sample_format();

        let err_fn = |err: cpal::StreamError| {
            eprintln!("[audio_engine::recorder] Stream error: {err}");
        };

        let stream = match sample_format {
            SampleFormat::F32 => device
                .build_input_stream(
                    &stream_config,
                    move |data: &[f32], _: &cpal::InputCallbackInfo| {
                        if stop_for_callback.load(Ordering::Relaxed) {
                            return;
                        }
                        metering::push_samples(data);
                        if let Ok(mut guard) = writer_clone.lock() {
                            if let Some(ref mut w) = *guard {
                                for &sample in data {
                                    let s16 = (sample * 32767.0).clamp(-32768.0, 32767.0) as i16;
                                    let _ = w.write_sample(s16);
                                }
                            }
                        }
                    },
                    err_fn,
                    None,
                )
                .map_err(|e| format!("Failed to build input stream: {e}"))?,
            SampleFormat::I16 => device
                .build_input_stream(
                    &stream_config,
                    move |data: &[i16], _: &cpal::InputCallbackInfo| {
                        if stop_for_callback.load(Ordering::Relaxed) {
                            return;
                        }
                        let floats: Vec<f32> = data.iter().map(|&s| s as f32 / 32768.0).collect();
                        metering::push_samples(&floats);
                        if let Ok(mut guard) = writer_clone.lock() {
                            if let Some(ref mut w) = *guard {
                                for &sample in data {
                                    let _ = w.write_sample(sample);
                                }
                            }
                        }
                    },
                    err_fn,
                    None,
                )
                .map_err(|e| format!("Failed to build input stream (i16): {e}"))?,
            _ => {
                return Err(format!("Unsupported sample format: {:?}", sample_format));
            }
        };

        stream
            .play()
            .map_err(|e| format!("Failed to start recording stream: {e}"))?;

        // Block this thread until stop signal
        while !stop_clone.load(Ordering::Relaxed) {
            std::thread::sleep(std::time::Duration::from_millis(50));
        }

        // Drop stream first (stops audio callbacks)
        drop(stream);

        // Finalize WAV
        let mut guard = writer.lock().map_err(|e| format!("Lock error: {e}"))?;
        if let Some(w) = guard.take() {
            w.finalize()
                .map_err(|e| format!("Failed to finalize WAV: {e}"))?;
        }

        Ok(0.0) // duration computed from Instant in stop()
    });

    sessions.insert(
        session_id.to_string(),
        RecordingSession {
            stop_signal,
            thread_handle: Some(thread_handle),
            start_time: std::time::Instant::now(),
            file_path: abs_wav_path.to_string(),
            sample_rate,
            channels,
        },
    );

    Ok(())
}

pub fn stop(session_id: &str) -> Result<RecordResult, String> {
    let mut sessions = SESSIONS.lock().map_err(|e| format!("Lock error: {e}"))?;
    let mut session = sessions
        .remove(session_id)
        .ok_or(format!("Session '{session_id}' not found"))?;

    let duration_sec = session.start_time.elapsed().as_secs_f64();

    // Signal the recording thread to stop
    session.stop_signal.store(true, Ordering::Relaxed);

    // Wait for the thread to finish
    if let Some(handle) = session.thread_handle.take() {
        match handle.join() {
            Ok(Ok(_)) => {}
            Ok(Err(e)) => return Err(format!("Recording thread error: {e}")),
            Err(_) => return Err("Recording thread panicked".to_string()),
        }
    }

    Ok(RecordResult {
        session_id: session_id.to_string(),
        file_path: session.file_path,
        duration_sec,
        sample_rate: session.sample_rate,
        channels: session.channels,
    })
}
