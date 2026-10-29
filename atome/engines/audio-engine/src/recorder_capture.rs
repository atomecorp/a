// The input of a take (recorder.rs): a sink writing what each input period brings to the WAV
// ring, fed by a cpal input stream — or, on Windows, by a tap on the exclusive input the output's
// thread reads (wasapi_duplex.rs), so a take and a monitored strip share the interface the
// exclusive mode holds.

use super::metering;
use super::recorder_wav::BufferSizeHint;
use super::scheduled_backend::{note_capture_start_at, CaptureClock};
use ringbuf::traits::{Observer, Producer};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
#[cfg(not(target_os = "windows"))]
use {cpal::traits::{DeviceTrait, StreamTrait}, cpal::{FromSample, Sample, SizedSample}};

pub(super) struct TakeSink {
    pub producer: ringbuf::HeapProd<f32>,
    pub stop: Arc<AtomicBool>,
    pub frames: Arc<AtomicU64>,
    pub overruns: Arc<AtomicU64>,
    pub clock: Arc<Mutex<Option<CaptureClock>>>,
    pub channels: usize,
}

impl TakeSink {
    // One period's interleaved samples, first captured at `host_ns` (never blocks).
    fn push(&mut self, data: &[f32], host_ns: i64) {
        if self.stop.load(Ordering::Relaxed) {
            return;
        }
        note_capture_start_at(&self.clock, host_ns);
        metering::push_samples(data);
        let channels = self.channels.max(1);
        if self.producer.vacant_len() >= data.len() {
            let written = self.producer.push_slice(data);
            self.frames.fetch_add((written / channels) as u64, Ordering::Relaxed);
        } else {
            self.overruns.fetch_add((data.len() / channels) as u64, Ordering::Relaxed);
        }
    }
}

// The input a take records from, open until dropped.
pub(super) enum Capture {
    #[cfg(not(target_os = "windows"))]
    // Held for its drop: the stream stops with the take.
    Stream { _stream: cpal::Stream },
    #[cfg(target_os = "windows")]
    Tap(Option<String>, u64),
}

#[cfg(target_os = "windows")]
impl Drop for Capture {
    fn drop(&mut self) {
        let Capture::Tap(device, id) = self;
        let _ = super::wasapi_duplex::untap(device.as_deref(), *id);
    }
}

// The format a take records at when none was asked: the input's own.
#[cfg(not(target_os = "windows"))]
pub(super) fn input_format(device: Option<&str>) -> Result<(u32, u16), String> {
    let config = super::recorder::input_device(device)?.default_input_config().map_err(|e| format!("No default input config: {e}"))?;
    Ok((config.sample_rate().0, config.channels()))
}

#[cfg(target_os = "windows")]
pub(super) fn input_format(device: Option<&str>) -> Result<(u32, u16), String> {
    super::wasapi_duplex::input_format(device)
}

#[cfg(not(target_os = "windows"))]
fn callback<T>(mut sink: TakeSink) -> impl FnMut(&[T], &cpal::InputCallbackInfo)
where T: Sample + SizedSample, f32: FromSample<T> {
    let mut samples: Vec<f32> = Vec::with_capacity(65_536);
    move |data: &[T], info: &cpal::InputCallbackInfo| {
        samples.clear();
        samples.extend(data.iter().map(|sample| f32::from_sample(*sample)));
        sink.push(&samples, super::scheduled_backend::capture_host_ns(info));
    }
}

#[cfg(not(target_os = "windows"))]
pub(super) fn open(device: Option<&str>, sample_rate: u32, channels: u16, buffer: BufferSizeHint, sink: TakeSink) -> Result<Capture, String> {
    let device = super::recorder::input_device(device)?;
    let format = device.default_input_config().map_err(|e| format!("No default input config: {e}"))?.sample_format();
    let config = cpal::StreamConfig { channels, sample_rate: cpal::SampleRate(sample_rate), buffer_size: buffer.to_cpal() };
    let error = |err: cpal::StreamError| {
        if crate::xcode_logs_enabled() {
            eprintln!("[audio_engine::recorder] Stream error: {err}");
        }
    };
    let stream = match format {
        cpal::SampleFormat::F32 => device.build_input_stream(&config, callback::<f32>(sink), error, None),
        cpal::SampleFormat::I16 => device.build_input_stream(&config, callback::<i16>(sink), error, None),
        cpal::SampleFormat::U16 => device.build_input_stream(&config, callback::<u16>(sink), error, None),
        other => return Err(format!("Unsupported sample format: {other:?}")),
    }.map_err(|e| format!("Failed to build input stream: {e}"))?;
    stream.play().map_err(|e| format!("Failed to start recording stream: {e}"))?;
    Ok(Capture::Stream { _stream: stream })
}

// The exclusive input records at its own format: another one asked is an error, never a conversion.
#[cfg(target_os = "windows")]
pub(super) fn open(device: Option<&str>, sample_rate: u32, channels: u16, _buffer: BufferSizeHint, sink: TakeSink) -> Result<Capture, String> {
    let (rate, count) = input_format(device)?;
    if (rate, count) != (sample_rate, channels) {
        return Err(format!("audio_input_format_unavailable: {sample_rate} Hz × {channels} (the interface records at {rate} Hz × {count} in exclusive mode)"));
    }
    let sink = Mutex::new(sink);
    let id = super::wasapi_duplex::tap(device, Arc::new(move |data: &[f32], host_ns: i64| {
        if let Ok(mut sink) = sink.try_lock() {
            sink.push(data, host_ns);
        }
    }))?;
    Ok(Capture::Tap(device.map(str::to_string), id))
}
