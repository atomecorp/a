// CPAL-based audio recorder
// Pure Rust replacement for the Obj-C AVAudioEngine recorder.
// Records input audio to WAV files via CPAL + hound.
// The CPAL stream lives on a dedicated thread to avoid Send issues.
//
// Optimizations over previous version:
// - Condvar-based stop signaling replaces 50ms polling loop (near-zero CPU when idle)
// - Configurable buffer size (low-latency or high-throughput)
// - Support for 16-bit int, 24-bit int, and 32-bit float WAV output
// - Sample rate validation with explicit warnings
// - Batch sample writes to reduce per-sample overhead

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{SampleFormat, StreamConfig};
use ringbuf::{traits::*, HeapRb};
use std::collections::HashMap;
use std::fs;
use std::path::Path;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{mpsc, Arc, Condvar, Mutex};

use super::metering;
use super::recorder_wav::{create_wav_writer, spawn_wav_writer_thread};
pub use super::recorder_wav::{BufferSizeHint, OutputFormat};

macro_rules! eprintln {
    ($($arg:tt)*) => {
        if crate::runtime_logging::xcode_logs_enabled() {
            std::eprintln!($($arg)*);
        }
    };
}

struct StopSignal {
    flag: Mutex<bool>,
    cvar: Condvar,
}

impl StopSignal {
    fn new() -> Self {
        Self {
            flag: Mutex::new(false),
            cvar: Condvar::new(),
        }
    }

    fn stop(&self) {
        let mut flag = self.flag.lock().unwrap();
        *flag = true;
        self.cvar.notify_all();
    }

    fn wait(&self) {
        let mut flag = self.flag.lock().unwrap();
        while !*flag {
            flag = self.cvar.wait(flag).unwrap();
        }
    }

    #[allow(dead_code)]
    fn is_stopped(&self) -> bool {
        *self.flag.lock().unwrap()
    }
}

struct RecordingSession {
    stop_signal: Arc<StopSignal>,
    /// Lightweight atomic for the audio callback (no mutex in hot path)
    stop_atomic: Arc<AtomicBool>,
    thread_handle: Option<std::thread::JoinHandle<Result<f64, String>>>,
    start_time: std::time::Instant,
    file_path: String,
    sample_rate: u32,
    channels: u16,
    output_format: OutputFormat,
    frame_count: Arc<AtomicU64>,
    overrun_frames: Arc<AtomicU64>,
}

static SESSIONS: once_cell::sync::Lazy<Mutex<HashMap<String, RecordingSession>>> =
    once_cell::sync::Lazy::new(|| Mutex::new(HashMap::new()));

#[derive(serde::Serialize, Clone, Debug)]
pub struct RecordResult {
    pub session_id: String,
    pub file_path: String,
    pub size_bytes: u64,
    pub duration_sec: f64,
    pub frame_count: u64,
    pub overrun_frames: u64,
    pub sample_rate: u32,
    pub channels: u16,
    pub output_format: String,
}

pub fn start(
    session_id: &str,
    abs_wav_path: &str,
    sample_rate: u32,
    channels: u16,
) -> Result<(), String> {
    start_with_options(
        session_id,
        abs_wav_path,
        sample_rate,
        channels,
        OutputFormat::default(),
        BufferSizeHint::default(),
    )
}

pub fn start_with_options(
    session_id: &str,
    abs_wav_path: &str,
    sample_rate: u32,
    channels: u16,
    output_format: OutputFormat,
    buffer_hint: BufferSizeHint,
) -> Result<(), String> {
    let mut sessions = SESSIONS.lock().map_err(|e| format!("Lock error: {e}"))?;
    if sessions.contains_key(session_id) {
        return Err(format!("Session '{session_id}' already active"));
    }

    let default_input_config = cpal::default_host()
        .default_input_device()
        .ok_or("No default input (microphone) device found")?
        .default_input_config()
        .map_err(|e| format!("No default input config: {e}"))?;
    let actual_sample_rate = if sample_rate > 0 {
        sample_rate
    } else {
        default_input_config.sample_rate().0
    };
    let actual_channels = if channels > 0 {
        channels
    } else {
        default_input_config.channels()
    };

    // Ensure parent directory exists
    if let Some(parent) = Path::new(abs_wav_path).parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Cannot create directory {}: {e}", parent.display()))?;
    }

    let stop_signal = Arc::new(StopSignal::new());
    let stop_signal_thread = Arc::clone(&stop_signal);
    let stop_atomic = Arc::new(AtomicBool::new(false));
    let stop_atomic_cb = Arc::clone(&stop_atomic);
    let frame_count = Arc::new(AtomicU64::new(0));
    let frame_count_thread = Arc::clone(&frame_count);
    let overrun_frames = Arc::new(AtomicU64::new(0));
    let overrun_frames_thread = Arc::clone(&overrun_frames);
    let path_owned = abs_wav_path.to_string();
    let sr = actual_sample_rate;
    let ch = actual_channels;
    let fmt = output_format;
    let buf_hint = buffer_hint;
    let (ready_tx, ready_rx) = mpsc::channel::<Result<(), String>>();

    // Spawn a thread that owns the CPAL stream (Stream is !Send, so it must
    // be created and dropped on the same thread).
    let thread_handle = std::thread::spawn(move || -> Result<f64, String> {
        let init_result = (|| {
            let host = cpal::default_host();
            let device = host
                .default_input_device()
                .ok_or("No default input (microphone) device found")?;

            let default_config = device
                .default_input_config()
                .map_err(|e| format!("No default input config: {e}"))?;

            let actual_sr = sr;
            let actual_ch = ch;
            metering::configure_scope(actual_sr, actual_ch);

            // Validate sample rate range
            if actual_sr < 8000 || actual_sr > 384000 {
                eprintln!(
                    "[audio_engine::recorder] Warning: unusual sample rate {actual_sr} Hz — \
                     typical values are 16000, 44100, 48000, 96000"
                );
            }

            let stream_config = StreamConfig {
                channels: actual_ch,
                sample_rate: cpal::SampleRate(actual_sr),
                buffer_size: buf_hint.to_cpal(),
            };

            let writer = create_wav_writer(&path_owned, fmt, actual_sr, actual_ch)?;
            let rb_capacity = usize::try_from(actual_sr)
                .unwrap_or(48_000)
                .saturating_mul(usize::from(actual_ch.max(1)))
                .saturating_mul(4)
                .max(4096);
            let rb = HeapRb::<f32>::new(rb_capacity);
            let (producer, consumer) = rb.split();
            let writer_stop = Arc::new(AtomicBool::new(false));
            let writer_handle =
                spawn_wav_writer_thread(consumer, writer, fmt, Arc::clone(&writer_stop));

            let stop_for_callback = Arc::clone(&stop_atomic_cb);
            let frame_count_cb = Arc::clone(&frame_count_thread);
            let overrun_frames_cb = Arc::clone(&overrun_frames_thread);

            let sample_format = default_config.sample_format();

            let err_fn = |err: cpal::StreamError| {
                eprintln!("[audio_engine::recorder] Stream error: {err}");
            };

            let stream = match sample_format {
                SampleFormat::F32 => {
                    let mut producer = producer;
                    device
                        .build_input_stream(
                            &stream_config,
                            move |data: &[f32], _: &cpal::InputCallbackInfo| {
                                if stop_for_callback.load(Ordering::Relaxed) {
                                    return;
                                }
                                metering::push_samples(data);
                                let frames = (data.len() / usize::from(actual_ch.max(1))) as u64;
                                if producer.vacant_len() >= data.len() {
                                    let written = producer.push_slice(data);
                                    frame_count_cb.fetch_add(
                                        (written / usize::from(actual_ch.max(1))) as u64,
                                        Ordering::Relaxed,
                                    );
                                } else {
                                    overrun_frames_cb.fetch_add(frames, Ordering::Relaxed);
                                }
                            },
                            err_fn,
                            None,
                        )
                        .map_err(|e| format!("Failed to build input stream: {e}"))?
                }
                SampleFormat::I16 => {
                    let mut producer = producer;
                    let stop_for_callback2 = Arc::clone(&stop_atomic_cb);
                    let frame_count_cb2 = Arc::clone(&frame_count_thread);
                    let overrun_frames_cb2 = Arc::clone(&overrun_frames_thread);
                    device
                        .build_input_stream(
                            &stream_config,
                            move |data: &[i16], _: &cpal::InputCallbackInfo| {
                                if stop_for_callback2.load(Ordering::Relaxed) {
                                    return;
                                }
                                metering::push_i16_samples(data);
                                let frames = (data.len() / usize::from(actual_ch.max(1))) as u64;
                                if producer.vacant_len() >= data.len() {
                                    let mut written = 0usize;
                                    for &sample in data {
                                        if producer.try_push(sample as f32 / 32768.0).is_ok() {
                                            written += 1;
                                        } else {
                                            break;
                                        }
                                    }
                                    frame_count_cb2.fetch_add(
                                        (written / usize::from(actual_ch.max(1))) as u64,
                                        Ordering::Relaxed,
                                    );
                                } else {
                                    overrun_frames_cb2.fetch_add(frames, Ordering::Relaxed);
                                }
                            },
                            err_fn,
                            None,
                        )
                        .map_err(|e| format!("Failed to build input stream (i16): {e}"))?
                }
                SampleFormat::U16 => {
                    let mut producer = producer;
                    let stop_for_callback3 = Arc::clone(&stop_atomic_cb);
                    let frame_count_cb3 = Arc::clone(&frame_count_thread);
                    let overrun_frames_cb3 = Arc::clone(&overrun_frames_thread);
                    device
                        .build_input_stream(
                            &stream_config,
                            move |data: &[u16], _: &cpal::InputCallbackInfo| {
                                if stop_for_callback3.load(Ordering::Relaxed) {
                                    return;
                                }
                                metering::push_u16_samples(data);
                                let frames = (data.len() / usize::from(actual_ch.max(1))) as u64;
                                if producer.vacant_len() >= data.len() {
                                    let mut written = 0usize;
                                    for &sample in data {
                                        let centered = sample as f32 - 32768.0;
                                        if producer.try_push(centered / 32768.0).is_ok() {
                                            written += 1;
                                        } else {
                                            break;
                                        }
                                    }
                                    frame_count_cb3.fetch_add(
                                        (written / usize::from(actual_ch.max(1))) as u64,
                                        Ordering::Relaxed,
                                    );
                                } else {
                                    overrun_frames_cb3.fetch_add(frames, Ordering::Relaxed);
                                }
                            },
                            err_fn,
                            None,
                        )
                        .map_err(|e| format!("Failed to build input stream (u16): {e}"))?
                }
                _ => {
                    return Err(format!("Unsupported sample format: {:?}", sample_format));
                }
            };

            stream
                .play()
                .map_err(|e| format!("Failed to start recording stream: {e}"))?;

            Ok((stream, writer_stop, writer_handle))
        })();

        let (stream, writer_stop, writer_handle) = match init_result {
            Ok(value) => {
                let _ = ready_tx.send(Ok(()));
                value
            }
            Err(err) => {
                let _ = ready_tx.send(Err(err.clone()));
                return Err(err);
            }
        };

        // Block this thread until stop signal — uses condvar (zero CPU when waiting)
        stop_signal_thread.wait();

        // Drop stream first (stops audio callbacks)
        drop(stream);

        writer_stop.store(true, Ordering::Release);
        match writer_handle.join() {
            Ok(Ok(())) => {}
            Ok(Err(error)) => return Err(error),
            Err(_) => return Err("WAV writer thread panicked".to_string()),
        }

        Ok(0.0) // duration computed from Instant in stop()
    });

    match ready_rx.recv_timeout(std::time::Duration::from_secs(8)) {
        Ok(Ok(())) => {}
        Ok(Err(err)) => {
            let _ = thread_handle.join();
            return Err(err);
        }
        Err(mpsc::RecvTimeoutError::Timeout) => {
            stop_atomic.store(true, Ordering::Relaxed);
            stop_signal.stop();
            return Err(
                "Recording start timed out before the input stream became ready".to_string(),
            );
        }
        Err(mpsc::RecvTimeoutError::Disconnected) => {
            return match thread_handle.join() {
                Ok(Ok(_)) => Err("Recording thread exited before reporting readiness".to_string()),
                Ok(Err(err)) => Err(err),
                Err(_) => Err("Recording thread panicked before reporting readiness".to_string()),
            };
        }
    }

    sessions.insert(
        session_id.to_string(),
        RecordingSession {
            stop_signal,
            stop_atomic,
            thread_handle: Some(thread_handle),
            start_time: std::time::Instant::now(),
            file_path: abs_wav_path.to_string(),
            sample_rate: actual_sample_rate,
            channels: actual_channels,
            output_format,
            frame_count,
            overrun_frames,
        },
    );

    Ok(())
}

pub fn stop(session_id: &str) -> Result<RecordResult, String> {
    let mut sessions = SESSIONS.lock().map_err(|e| format!("Lock error: {e}"))?;
    let mut session = sessions
        .remove(session_id)
        .ok_or(format!("Session '{session_id}' not found"))?;

    // Signal the recording thread to stop — both the atomic (for the audio callback)
    // and the condvar (for the blocking wait)
    session.stop_atomic.store(true, Ordering::Relaxed);
    session.stop_signal.stop();

    // Wait for the thread to finish
    if let Some(handle) = session.thread_handle.take() {
        match handle.join() {
            Ok(Ok(_)) => {}
            Ok(Err(e)) => return Err(format!("Recording thread error: {e}")),
            Err(_) => return Err("Recording thread panicked".to_string()),
        }
    }
    let frame_count = session.frame_count.load(Ordering::Relaxed);
    let overrun_frames = session.overrun_frames.load(Ordering::Relaxed);
    let duration_sec = if session.sample_rate > 0 {
        frame_count as f64 / session.sample_rate as f64
    } else {
        session.start_time.elapsed().as_secs_f64()
    };
    if frame_count == 0 {
        return Err(format!(
            "audio_recording_empty: no input frames were captured for session '{session_id}'"
        ));
    }
    let size_bytes = fs::metadata(&session.file_path)
        .map(|metadata| metadata.len())
        .map_err(|error| format!(
            "audio_recording_output_metadata_failed: unable to inspect recording for session '{session_id}': {error}"
        ))?;
    if size_bytes == 0 {
        return Err(format!(
            "audio_recording_empty: no output bytes were written for session '{session_id}'"
        ));
    }

    Ok(RecordResult {
        session_id: session_id.to_string(),
        file_path: session.file_path,
        size_bytes,
        duration_sec,
        frame_count,
        overrun_frames,
        sample_rate: session.sample_rate,
        channels: session.channels,
        output_format: format!("{:?}", session.output_format),
    })
}
