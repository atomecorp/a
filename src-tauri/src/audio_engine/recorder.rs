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
use hound::{WavSpec, WavWriter};
use std::collections::HashMap;
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Condvar, Mutex};

use super::metering;

macro_rules! eprintln {
    ($($arg:tt)*) => {
        if crate::runtime_logging::xcode_logs_enabled() {
            std::eprintln!($($arg)*);
        }
    };
}

/// Output format for WAV recording.
#[derive(Clone, Copy, Debug, serde::Deserialize)]
pub enum OutputFormat {
    /// 16-bit signed integer PCM (CD quality, smaller files)
    Int16,
    /// 24-bit signed integer PCM (professional quality)
    Int24,
    /// 32-bit IEEE float (maximum precision, larger files)
    Float32,
}

impl Default for OutputFormat {
    fn default() -> Self {
        Self::Int24 // Professional default
    }
}

impl OutputFormat {
    fn wav_spec(&self, sample_rate: u32, channels: u16) -> WavSpec {
        match self {
            Self::Int16 => WavSpec {
                channels,
                sample_rate,
                bits_per_sample: 16,
                sample_format: hound::SampleFormat::Int,
            },
            Self::Int24 => WavSpec {
                channels,
                sample_rate,
                bits_per_sample: 24,
                sample_format: hound::SampleFormat::Int,
            },
            Self::Float32 => WavSpec {
                channels,
                sample_rate,
                bits_per_sample: 32,
                sample_format: hound::SampleFormat::Float,
            },
        }
    }

    fn write_f32_sample<W: std::io::Write + std::io::Seek>(
        &self,
        writer: &mut WavWriter<W>,
        sample: f32,
    ) -> Result<(), hound::Error> {
        match self {
            Self::Int16 => {
                let s = (sample * 32767.0).clamp(-32768.0, 32767.0) as i16;
                writer.write_sample(s)
            }
            Self::Int24 => {
                let s = (sample * 8_388_607.0).clamp(-8_388_608.0, 8_388_607.0) as i32;
                writer.write_sample(s)
            }
            Self::Float32 => writer.write_sample(sample),
        }
    }

    fn write_i16_sample<W: std::io::Write + std::io::Seek>(
        &self,
        writer: &mut WavWriter<W>,
        sample: i16,
    ) -> Result<(), hound::Error> {
        match self {
            Self::Int16 => writer.write_sample(sample),
            Self::Int24 => {
                // Scale i16 → i24 range
                writer.write_sample((sample as i32) << 8)
            }
            Self::Float32 => {
                writer.write_sample(sample as f32 / 32768.0)
            }
        }
    }
}

/// Preferred buffer size hint for CPAL.
#[derive(Clone, Copy, Debug)]
#[allow(dead_code)]
pub enum BufferSizeHint {
    /// Let CPAL choose (usually ~2048 samples)
    Default,
    /// Low latency (~256 samples, higher CPU)
    Low,
    /// Medium (~512 samples, balanced)
    Medium,
    /// Custom frame count
    Frames(u32),
}

impl BufferSizeHint {
    fn to_cpal(self) -> cpal::BufferSize {
        match self {
            Self::Default => cpal::BufferSize::Default,
            Self::Low => cpal::BufferSize::Fixed(256),
            Self::Medium => cpal::BufferSize::Fixed(512),
            Self::Frames(n) => cpal::BufferSize::Fixed(n),
        }
    }
}

impl Default for BufferSizeHint {
    fn default() -> Self {
        Self::Default
    }
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

    // Ensure parent directory exists
    if let Some(parent) = Path::new(abs_wav_path).parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Cannot create directory {}: {e}", parent.display()))?;
    }

    let stop_signal = Arc::new(StopSignal::new());
    let stop_signal_thread = Arc::clone(&stop_signal);
    let stop_atomic = Arc::new(AtomicBool::new(false));
    let stop_atomic_cb = Arc::clone(&stop_atomic);
    let path_owned = abs_wav_path.to_string();
    let sr = sample_rate;
    let ch = channels;
    let fmt = output_format;
    let buf_hint = buffer_hint;

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

        let actual_sr = if sr > 0 { sr } else { default_config.sample_rate().0 };
        let actual_ch = if ch > 0 { ch } else { default_config.channels() };

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

        let wav_spec = fmt.wav_spec(actual_sr, actual_ch);

        let writer = WavWriter::create(&path_owned, wav_spec)
            .map_err(|e| format!("Failed to create WAV file {path_owned}: {e}"))?;
        let writer = Arc::new(Mutex::new(Some(writer)));
        let writer_clone = Arc::clone(&writer);

        let stop_for_callback = Arc::clone(&stop_atomic_cb);
        let fmt_cb = fmt;

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
                                    let _ = fmt_cb.write_f32_sample(w, sample);
                                }
                            }
                        }
                    },
                    err_fn,
                    None,
                )
                .map_err(|e| format!("Failed to build input stream: {e}"))?,
            SampleFormat::I16 => {
                let writer_clone2 = Arc::clone(&writer);
                let stop_for_callback2 = Arc::clone(&stop_atomic_cb);
                let fmt_cb2 = fmt;
                device
                    .build_input_stream(
                        &stream_config,
                        move |data: &[i16], _: &cpal::InputCallbackInfo| {
                            if stop_for_callback2.load(Ordering::Relaxed) {
                                return;
                            }
                            let floats: Vec<f32> =
                                data.iter().map(|&s| s as f32 / 32768.0).collect();
                            metering::push_samples(&floats);
                            if let Ok(mut guard) = writer_clone2.lock() {
                                if let Some(ref mut w) = *guard {
                                    for &sample in data {
                                        let _ = fmt_cb2.write_i16_sample(w, sample);
                                    }
                                }
                            }
                        },
                        err_fn,
                        None,
                    )
                    .map_err(|e| format!("Failed to build input stream (i16): {e}"))?
            }
            _ => {
                return Err(format!("Unsupported sample format: {:?}", sample_format));
            }
        };

        stream
            .play()
            .map_err(|e| format!("Failed to start recording stream: {e}"))?;

        // Block this thread until stop signal — uses condvar (zero CPU when waiting)
        stop_signal_thread.wait();

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
            stop_atomic,
            thread_handle: Some(thread_handle),
            start_time: std::time::Instant::now(),
            file_path: abs_wav_path.to_string(),
            sample_rate,
            channels,
            output_format,
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

    Ok(RecordResult {
        session_id: session_id.to_string(),
        file_path: session.file_path,
        duration_sec,
        sample_rate: session.sample_rate,
        channels: session.channels,
        output_format: format!("{:?}", session.output_format),
    })
}
