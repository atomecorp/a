// CPAL-based audio recorder
// Pure Rust replacement for the Obj-C AVAudioEngine recorder.
// Records input audio to WAV files via CPAL + hound (on Windows, the exclusive
// input of the output's thread: recorder_capture.rs).
// The input lives on a dedicated thread to avoid Send issues.
//
// Optimizations over previous version:
// - Condvar-based stop signaling replaces 50ms polling loop (near-zero CPU when idle)
// - Configurable buffer size (low-latency or high-throughput)
// - Support for 16-bit int, 24-bit int, and 32-bit float WAV output
// - Sample rate validation with explicit warnings
// - Batch sample writes to reduce per-sample overhead

use cpal::traits::{DeviceTrait, HostTrait};
use super::recorder_capture::{self, TakeSink};
use super::scheduled_backend::CaptureClock;
use ringbuf::{traits::*, HeapRb};
use std::collections::HashMap;
use std::fs;
use std::path::Path;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{mpsc, Arc, Condvar, Mutex};

use super::metering;
use super::recorder_wav::{create_wav_writer, spawn_wav_writer_thread, written_channels};
pub use super::recorder_wav::{BufferSizeHint, OutputFormat};

macro_rules! eprintln {
    ($($arg:tt)*) => {
        if crate::xcode_logs_enabled() {
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
    capture_clock: Arc<Mutex<Option<CaptureClock>>>,
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
    // Where the take started on the playback's clock (sample-accurate placement).
    pub capture_clock: Option<CaptureClock>,
}

pub fn has_active_sessions() -> bool {
    SESSIONS.lock().map(|sessions| !sessions.is_empty()).unwrap_or(true)
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
        None,
    )
}

// The same on the input chosen with the Input tool (by device name).
pub fn start_on_device(
    session_id: &str,
    abs_wav_path: &str,
    sample_rate: u32,
    channels: u16,
    device_name: Option<String>,
) -> Result<(), String> {
    start_with_options(session_id, abs_wav_path, sample_rate, channels, OutputFormat::default(), BufferSizeHint::default(), device_name)
}

// The format a running session records at (the device's when 0 was requested).
pub fn session_format(session_id: &str) -> Option<(u32, u16)> {
    SESSIONS.lock().ok()?.get(session_id).map(|session| (session.sample_rate, session.channels))
}

// The chosen input by name, else the default one. A chosen input that is gone
// is an error: the take must not silently come from another microphone.
pub(super) fn input_device(name: Option<&str>) -> Result<cpal::Device, String> {
    let host = cpal::default_host();
    if let Some(wanted) = name.map(str::trim).filter(|value| !value.is_empty()) {
        let devices = host.input_devices().map_err(|e| format!("audio_input_devices_unavailable: {e}"))?;
        return devices
            .into_iter()
            .find(|device| device.name().map(|candidate| candidate == wanted).unwrap_or(false))
            .ok_or_else(|| format!("audio_input_device_not_found: {wanted}"));
    }
    host.default_input_device().ok_or_else(|| "No default input (microphone) device found".to_string())
}

pub fn start_with_options(
    session_id: &str,
    abs_wav_path: &str,
    sample_rate: u32,
    channels: u16,
    output_format: OutputFormat,
    buffer_hint: BufferSizeHint,
    device_name: Option<String>,
) -> Result<(), String> {
    super::wake_capture::stop()?;
    let mut sessions = SESSIONS.lock().map_err(|e| format!("Lock error: {e}"))?;
    if sessions.contains_key(session_id) {
        return Err(format!("Session '{session_id}' already active"));
    }

    let (input_rate, input_channels) = recorder_capture::input_format(device_name.as_deref())?;
    let actual_sample_rate = if sample_rate > 0 { sample_rate } else { input_rate };
    let actual_channels = if channels > 0 { channels } else { input_channels };

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
    let capture_clock: Arc<Mutex<Option<CaptureClock>>> = Arc::new(Mutex::new(None));
    let capture_clock_thread = Arc::clone(&capture_clock);
    let path_owned = abs_wav_path.to_string();
    let sr = actual_sample_rate;
    let ch = actual_channels;
    let fmt = output_format;
    let buf_hint = buffer_hint;
    let (ready_tx, ready_rx) = mpsc::channel::<Result<(), String>>();

    // Spawn a thread that owns the input (a cpal Stream is !Send, so it must
    // be created and dropped on the same thread).
    let thread_handle = crate::engine_thread::spawn(move || -> Result<f64, String> {
        let init_result = (|| {
            metering::configure_scope(sr, ch);

            // Validate sample rate range
            if !(8000..=384000).contains(&sr) {
                eprintln!(
                    "[audio_engine::recorder] Warning: unusual sample rate {sr} Hz — \
                     typical values are 16000, 44100, 48000, 96000"
                );
            }

            let writer = create_wav_writer(&path_owned, fmt, sr, written_channels(ch))?;
            let rb_capacity = usize::try_from(sr)
                .unwrap_or(48_000)
                .saturating_mul(usize::from(ch.max(1)))
                .saturating_mul(4)
                .max(4096);
            let (producer, consumer) = HeapRb::<f32>::new(rb_capacity).split();
            let writer_stop = Arc::new(AtomicBool::new(false));
            let writer_handle =
                spawn_wav_writer_thread(consumer, writer, fmt, Arc::clone(&writer_stop), ch);
            let sink = TakeSink {
                producer,
                stop: Arc::clone(&stop_atomic_cb),
                frames: Arc::clone(&frame_count_thread),
                overruns: Arc::clone(&overrun_frames_thread),
                clock: Arc::clone(&capture_clock_thread),
                channels: usize::from(ch.max(1)),
            };
            let stream = recorder_capture::open(device_name.as_deref(), sr, ch, buf_hint, sink)?;
            Ok::<_, String>((stream, writer_stop, writer_handle))
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
            capture_clock,
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
        // The file's channels (a microphone array is written as mono).
        channels: written_channels(session.channels),
        output_format: format!("{:?}", session.output_format),
        capture_clock: session.capture_clock.lock().ok().and_then(|clock| *clock),
    })
}
