// Live inputs monitored through mixer strips (a strip whose IN is an
// interface input): one cpal input stream per device the mix program uses,
// pushing frames into that device's `LiveInput`; closed when no strip uses it.
// The stream runs at the output's rate when the device offers it; otherwise its
// frames are resampled to it (a 44.1 kHz input into a 48 kHz engine would
// otherwise play off pitch and drift).

use atome_mix_graph::resample::LinearResampler;
use atome_mix_graph::shared::LiveInput;
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{FromSample, Sample, SizedSample};
use kira::Frame;
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{mpsc, Arc, Mutex};
use std::time::Duration;

struct LiveStream {
    stop: Arc<AtomicBool>,
}

static STREAMS: Mutex<Option<HashMap<String, LiveStream>>> = Mutex::new(None);

#[derive(Clone, Debug, serde::Serialize)]
pub struct InputDevice {
    pub id: String,
    pub name: String,
    pub channels: u16,
}

pub fn input_devices() -> Vec<InputDevice> {
    cpal::default_host().input_devices().map(|devices| devices.filter_map(|device| {
        let name = device.name().ok()?;
        let channels = device.default_input_config().ok()?.channels();
        Some(InputDevice { id: name.clone(), name, channels })
    }).collect()).unwrap_or_default()
}

const CALLBACK_FRAMES: usize = 16_384;

fn data_callback<T>(channels: usize, mut resampler: LinearResampler, input: Arc<LiveInput>) -> impl FnMut(&[T], &cpal::InputCallbackInfo)
where T: Sample + SizedSample, f32: FromSample<T> {
    let mut frames: Vec<Frame> = Vec::with_capacity(CALLBACK_FRAMES);
    let mut resampled: Vec<Frame> = Vec::with_capacity(CALLBACK_FRAMES * 2);
    move |data: &[T], _| {
        frames.clear();
        for chunk in data.chunks(channels.max(1)).take(frames.capacity()) {
            let left = f32::from_sample(chunk[0]);
            let right = chunk.get(1).map(|sample| f32::from_sample(*sample)).unwrap_or(left);
            frames.push(Frame::new(left, right));
        }
        if resampler.is_identity() {
            input.push(&frames);
        } else {
            resampled.clear();
            resampler.process(&frames, &mut resampled);
            input.push(&resampled);
        }
    }
}

// The device's input format at `output_rate` when it offers that rate, else its default.
fn input_config(device: &cpal::Device, output_rate: Option<u32>) -> Result<cpal::SupportedStreamConfig, String> {
    let default = device.default_input_config().map_err(|error| format!("live_input_config: {error}"))?;
    let Some(rate) = output_rate.filter(|rate| *rate != default.sample_rate().0) else { return Ok(default) };
    let matching = device.supported_input_configs().ok().and_then(|mut configs| configs.find(|range| {
        range.sample_format() == default.sample_format() && range.channels() == default.channels()
            && range.min_sample_rate().0 <= rate && rate <= range.max_sample_rate().0
    }));
    Ok(matching.map(|range| range.with_sample_rate(cpal::SampleRate(rate))).unwrap_or(default))
}

fn open(device_id: String, input: Arc<LiveInput>) -> Result<LiveStream, String> {
    let stop = Arc::new(AtomicBool::new(false));
    let thread_stop = Arc::clone(&stop);
    let (ready_tx, ready_rx) = mpsc::channel::<Result<(), String>>();
    // A cpal stream is not Send: the thread that builds it owns it.
    crate::engine_thread::spawn(move || {
        let built = (|| {
            let device = super::recorder::input_device(Some(&device_id))?;
            let output_rate = super::scheduled_backend::render_clock().map(|clock| clock.sample_rate);
            let config = input_config(&device, output_rate)?;
            let channels = usize::from(config.channels());
            let resampler = || LinearResampler::new(config.sample_rate().0, output_rate.unwrap_or(config.sample_rate().0));
            let error = |error| eprintln!("[audio_engine::live_input] stream error: {error}");
            let stream_config = config.config();
            let stream = match config.sample_format() {
                cpal::SampleFormat::F32 => device.build_input_stream(&stream_config, data_callback::<f32>(channels, resampler(), input), error, None),
                cpal::SampleFormat::I16 => device.build_input_stream(&stream_config, data_callback::<i16>(channels, resampler(), input), error, None),
                cpal::SampleFormat::U16 => device.build_input_stream(&stream_config, data_callback::<u16>(channels, resampler(), input), error, None),
                other => return Err(format!("live_input_sample_format_unsupported: {other:?}")),
            }.map_err(|error| format!("live_input_stream: {error}"))?;
            stream.play().map_err(|error| format!("live_input_play: {error}"))?;
            Ok(stream)
        })();
        match built {
            Ok(stream) => {
                let _ = ready_tx.send(Ok(()));
                while !thread_stop.load(Ordering::Acquire) {
                    std::thread::sleep(Duration::from_millis(100));
                }
                drop(stream);
            }
            Err(error) => {
                let _ = ready_tx.send(Err(error));
            }
        }
    });
    ready_rx.recv().map_err(|_| "live_input_thread_failed".to_string())??;
    Ok(LiveStream { stop })
}

pub fn is_open() -> bool {
    STREAMS.lock().map(|streams| streams.as_ref().map_or(false, |streams| !streams.is_empty())).unwrap_or(false)
}

// Opens the inputs the program now monitors and closes the others.
pub fn sync(inputs: Vec<(String, Arc<LiveInput>)>) -> Result<(), String> {
    let mut guard = STREAMS.lock().map_err(|error| format!("Lock error: {error}"))?;
    let streams = guard.get_or_insert_with(HashMap::new);
    streams.retain(|device, stream| {
        let keep = inputs.iter().any(|(wanted, _)| wanted == device);
        if !keep {
            stream.stop.store(true, Ordering::Release);
        }
        keep
    });
    for (device, input) in inputs {
        if !streams.contains_key(&device) {
            streams.insert(device.clone(), open(device, input)?);
        }
    }
    Ok(())
}
