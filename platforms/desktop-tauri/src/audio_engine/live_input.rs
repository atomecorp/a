// Live inputs monitored through mixer strips (a strip whose IN is an
// interface input): one cpal input stream per device the mix program uses,
// pushing frames into that device's `LiveInput`; closed when no strip uses it.

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

fn data_callback<T>(channels: usize, input: Arc<LiveInput>) -> impl FnMut(&[T], &cpal::InputCallbackInfo)
where T: Sample + SizedSample, f32: FromSample<T> {
    let mut frames: Vec<Frame> = Vec::with_capacity(16_384);
    move |data: &[T], _| {
        frames.clear();
        for chunk in data.chunks(channels.max(1)).take(frames.capacity()) {
            let left = f32::from_sample(chunk[0]);
            let right = chunk.get(1).map(|sample| f32::from_sample(*sample)).unwrap_or(left);
            frames.push(Frame::new(left, right));
        }
        input.push(&frames);
    }
}

fn open(device_id: String, input: Arc<LiveInput>) -> Result<LiveStream, String> {
    let stop = Arc::new(AtomicBool::new(false));
    let thread_stop = Arc::clone(&stop);
    let (ready_tx, ready_rx) = mpsc::channel::<Result<(), String>>();
    // A cpal stream is not Send: the thread that builds it owns it.
    std::thread::spawn(move || {
        let built = (|| {
            let device = super::recorder::input_device(Some(&device_id))?;
            let config = device.default_input_config().map_err(|error| format!("live_input_config: {error}"))?;
            let channels = usize::from(config.channels());
            let error = |error| eprintln!("[audio_engine::live_input] stream error: {error}");
            let stream_config = config.config();
            let stream = match config.sample_format() {
                cpal::SampleFormat::F32 => device.build_input_stream(&stream_config, data_callback::<f32>(channels, input), error, None),
                cpal::SampleFormat::I16 => device.build_input_stream(&stream_config, data_callback::<i16>(channels, input), error, None),
                cpal::SampleFormat::U16 => device.build_input_stream(&stream_config, data_callback::<u16>(channels, input), error, None),
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
