//! Non-persistent microphone capture for the local WASM wake detector.
//! The stream lives on its owning thread; only bounded PCM crosses the bridge.
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{FromSample, Sample, SampleFormat, SizedSample, Stream, StreamConfig};
use serde_json::{json, Value};
use std::sync::{mpsc, Arc, Mutex};
use std::sync::atomic::{AtomicBool, Ordering};

#[derive(Default)]
struct Pcm {
    samples: Vec<i16>,
    overrun: bool,
    failed: bool,
}
struct Capture {
    stop: mpsc::Sender<()>,
    thread: std::thread::JoinHandle<()>,
    pcm: Arc<Mutex<Pcm>>,
}
static FOREGROUND: AtomicBool = AtomicBool::new(true);
static CAPTURE: Mutex<Option<Capture>> = Mutex::new(None);

fn stream<T: SizedSample + Sample + Send + 'static>(
    device: &cpal::Device, config: &StreamConfig, pcm: Arc<Mutex<Pcm>>,
) -> Result<Stream, String>
where f32: FromSample<T> {
    let channels = config.channels as usize;
    let ratio = config.sample_rate.0 as f64 / 16000.0;
    let mut phase = 0.0;
    let mut sum = 0.0;
    let mut count = 0;
    let errors = pcm.clone();
    device.build_input_stream(config, move |data: &[T], _| {
        if let Ok(mut output) = pcm.lock() {
            for frame in data.chunks_exact(channels) {
                sum += frame.iter().map(|v| v.to_sample::<f32>() as f64).sum::<f64>() / channels as f64;
                count += 1;
                phase += 1.0;
                if phase >= ratio {
                    phase -= ratio;
                    if output.samples.len() >= 32768 { output.overrun = true; output.samples.clear(); }
                    output.samples.push(((sum / count as f64).clamp(-1.0, 1.0) * 32767.0) as i16);
                    sum = 0.0; count = 0;
                }
            }
        }
    }, move |_| { if let Ok(mut state) = errors.lock() { state.failed = true; } }, None)
        .map_err(|_| "wake_capture_failed".into())
}

pub fn set_foreground(value: bool) -> Result<(), String> {
    FOREGROUND.store(value, Ordering::SeqCst);
    if !value { stop()?; }
    Ok(())
}

pub fn start(sample_rate: u32) -> Result<Value, String> {
    if sample_rate != 16000 { return Err("wake_sample_rate_unsupported".into()); }
    let mut owner = CAPTURE.lock().map_err(|_| "wake_capture_failed")?;
    if owner.is_some() || !FOREGROUND.load(Ordering::SeqCst) || super::recorder::has_active_sessions() { return Err("wake_capture_busy".into()); }
    let pcm = Arc::new(Mutex::new(Pcm::default()));
    let input = pcm.clone();
    let (stop, stopped) = mpsc::channel();
    let (ready, initialized) = mpsc::channel();
    let thread = std::thread::spawn(move || {
        let open = || -> Result<Stream, String> {
            let device = cpal::default_host().default_input_device().ok_or("microphone_unavailable")?;
            let supported = device.default_input_config().map_err(|_| "wake_capture_failed")?;
            if supported.sample_rate().0 < 16000 { return Err("wake_sample_rate_unsupported".into()); }
            let config: StreamConfig = supported.clone().into();
            let capture = match supported.sample_format() {
                SampleFormat::F32 => stream::<f32>(&device, &config, input),
                SampleFormat::I16 => stream::<i16>(&device, &config, input),
                SampleFormat::U16 => stream::<u16>(&device, &config, input),
                _ => Err("wake_sample_format_unsupported".into()),
            }?;
            capture.play().map_err(|_| "wake_capture_failed")?;
            Ok(capture)
        };
        match open() {
            Ok(capture) => { let _ = ready.send(Ok(())); let _ = stopped.recv(); drop(capture); }
            Err(error) => { let _ = ready.send(Err(error)); }
        }
    });
    match initialized.recv().map_err(|_| "wake_capture_failed")? {
        Ok(()) => { *owner = Some(Capture { stop, thread, pcm }); Ok(json!({"active":true,"sample_rate":16000})) }
        Err(error) => { let _ = thread.join(); Err(error) }
    }
}

pub fn stop() -> Result<Value, String> {
    let capture = CAPTURE.lock().map_err(|_| "wake_capture_failed")?.take();
    if let Some(capture) = capture {
        let _ = capture.stop.send(());
        capture.thread.join().map_err(|_| "wake_capture_failed")?;
    }
    Ok(json!({"active":false}))
}

pub fn read() -> Result<Value, String> {
    let owner = CAPTURE.lock().map_err(|_| "wake_capture_failed")?;
    match owner.as_ref() {
        None => Ok(json!({"active":false,"samples":[],"busy":!FOREGROUND.load(Ordering::SeqCst) || super::recorder::has_active_sessions()})),
        Some(capture) => {
            let mut pcm = capture.pcm.lock().map_err(|_| "wake_capture_failed")?;
            if pcm.failed { return Err("wake_capture_failed".into()); }
            let samples = std::mem::take(&mut pcm.samples);
            let overrun = std::mem::take(&mut pcm.overrun);
            Ok(json!({"active":true,"samples":samples,"overrun":overrun}))
        }
    }
}
