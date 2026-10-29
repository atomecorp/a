// Live inputs monitored through mixer strips (a strip whose IN is an
// interface input): one cpal input stream per device the mix programs use,
// pushing frames into every `LiveInput` listening to that device (the
// timeline's graph and the direct path's); closed when no strip uses it. A
// device the direct path listens to runs with its small buffer.
// On Windows the device is opened in exclusive mode and read in the output's own
// cycle (wasapi_duplex.rs, a duplex stream).
// The stream runs at the output's rate when the device offers it; otherwise its
// frames are resampled to it (a 44.1 kHz input into a 48 kHz engine would
// otherwise play off pitch and drift).

use atome_mix_graph::shared::LiveInput;
use cpal::traits::{DeviceTrait, HostTrait};
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
#[cfg(not(target_os = "windows"))]
use {atome_mix_graph::resample::LinearResampler, cpal::traits::StreamTrait, cpal::{FromSample, Sample, SizedSample}, kira::Frame, std::sync::mpsc, std::time::Duration};

struct LiveStream {
    stop: Arc<AtomicBool>,
    inputs: Vec<Arc<LiveInput>>,
    small: bool,
}

#[derive(Default)]
struct Wanted {
    console: Vec<(String, Arc<LiveInput>)>,
    direct: Vec<(String, Arc<LiveInput>)>,
}

static STREAMS: Mutex<Option<HashMap<String, LiveStream>>> = Mutex::new(None);
static WANTED: Mutex<Option<Wanted>> = Mutex::new(None);

#[derive(Clone, Debug, serde::Serialize)]
pub struct InputDevice {
    pub id: String,
    pub name: String,
    pub channels: u16,
}

// Inside an audio unit, the host's own input (the sound of the app it is
// inserted on) comes first: the render block pushes it (host_output.rs).
pub fn input_devices() -> Vec<InputDevice> {
    let host = super::host_output::host_rate().map(|_| InputDevice { id: super::host_output::HOST_INPUT_ID.to_string(),
        name: super::host_output::HOST_INPUT_ID.to_string(), channels: 2 });
    host.into_iter().chain(cpal::default_host().input_devices().map(|devices| devices.filter_map(|device| {
        let name = device.name().ok()?;
        let channels = device.default_input_config().ok()?.channels();
        Some(InputDevice { id: name.clone(), name, channels })
    }).collect::<Vec<_>>()).unwrap_or_default()).collect()
}

#[cfg(not(target_os = "windows"))]
const CALLBACK_FRAMES: usize = 16_384;

#[cfg(not(target_os = "windows"))]
fn data_callback<T>(channels: usize, mut resampler: LinearResampler, inputs: Vec<Arc<LiveInput>>) -> impl FnMut(&[T], &cpal::InputCallbackInfo)
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
        super::direct::note_input_quantum(frames.len());
        let pushed = if resampler.is_identity() {
            &frames
        } else {
            resampled.clear();
            resampler.process(&frames, &mut resampled);
            &resampled
        };
        for input in &inputs {
            input.push(pushed);
        }
    }
}

// The device's input format at `output_rate` when it offers that rate, else its default.
#[cfg(not(target_os = "windows"))]
fn input_config(device: &cpal::Device, output_rate: Option<u32>) -> Result<cpal::SupportedStreamConfig, String> {
    let default = device.default_input_config().map_err(|error| format!("live_input_config: {error}"))?;
    let Some(rate) = output_rate.filter(|rate| *rate != default.sample_rate().0) else { return Ok(default) };
    let matching = device.supported_input_configs().ok().and_then(|mut configs| configs.find(|range| {
        range.sample_format() == default.sample_format() && range.channels() == default.channels()
            && range.min_sample_rate().0 <= rate && rate <= range.max_sample_rate().0
    }));
    Ok(matching.map(|range| range.with_sample_rate(cpal::SampleRate(rate))).unwrap_or(default))
}

// On Windows the input is the exclusive one the output's thread reads in its own cycle (wasapi_duplex.rs).
#[cfg(target_os = "windows")]
fn open(device_id: String, inputs: Vec<Arc<LiveInput>>, small: bool) -> Result<LiveStream, String> {
    super::wasapi_duplex::listen(&device_id, inputs.clone())?;
    Ok(LiveStream { stop: Arc::new(AtomicBool::new(false)), inputs, small })
}

#[cfg(not(target_os = "windows"))]
fn open(device_id: String, inputs: Vec<Arc<LiveInput>>, small: bool) -> Result<LiveStream, String> {
    let stop = Arc::new(AtomicBool::new(false));
    let thread_stop = Arc::clone(&stop);
    let stream_inputs = inputs.clone();
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
            let mut stream_config = config.config();
            if small {
                stream_config.buffer_size = super::direct::buffer_size(config.buffer_size());
            }
            let inputs = stream_inputs;
            let stream = match config.sample_format() {
                cpal::SampleFormat::F32 => device.build_input_stream(&stream_config, data_callback::<f32>(channels, resampler(), inputs), error, None),
                cpal::SampleFormat::I16 => device.build_input_stream(&stream_config, data_callback::<i16>(channels, resampler(), inputs), error, None),
                cpal::SampleFormat::U16 => device.build_input_stream(&stream_config, data_callback::<u16>(channels, resampler(), inputs), error, None),
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
    Ok(LiveStream { stop, inputs, small })
}

pub fn is_open() -> bool {
    STREAMS.lock().map(|streams| streams.as_ref().map_or(false, |streams| !streams.is_empty())).unwrap_or(false)
}

// Opens the inputs the programs now monitor and closes the others; a device
// whose listeners or buffer changed is opened again.
fn reconcile(wanted: &Wanted) -> Result<(), String> {
    let mut devices: HashMap<&str, (Vec<Arc<LiveInput>>, bool)> = HashMap::new();
    for (device, input, small) in wanted.console.iter().map(|(device, input)| (device, input, false))
        .chain(wanted.direct.iter().map(|(device, input)| (device, input, true))) {
        let entry = devices.entry(device.as_str()).or_default();
        entry.0.push(Arc::clone(input));
        entry.1 |= small;
    }
    // The host's input is no device to open: its listeners are handed to the render block.
    super::host_output::listen_host_input(devices.remove(super::host_output::HOST_INPUT_ID).map(|(inputs, _)| inputs).unwrap_or_default())?;
    let mut guard = STREAMS.lock().map_err(|error| format!("Lock error: {error}"))?;
    let streams = guard.get_or_insert_with(HashMap::new);
    streams.retain(|device, stream| {
        let keep = devices.get(device.as_str()).is_some_and(|(inputs, small)| *small == stream.small
            && inputs.len() == stream.inputs.len() && inputs.iter().zip(&stream.inputs).all(|(a, b)| Arc::ptr_eq(a, b)));
        if !keep {
            stream.stop.store(true, Ordering::Release);
            #[cfg(target_os = "windows")]
            if !devices.contains_key(device.as_str()) {
                let _ = super::wasapi_duplex::listen(device, Vec::new());
            }
        }
        keep
    });
    for (device, (inputs, small)) in devices {
        if !streams.contains_key(device) {
            streams.insert(device.to_string(), open(device.to_string(), inputs, small)?);
        }
    }
    Ok(())
}

fn sync(update: impl FnOnce(&mut Wanted)) -> Result<(), String> {
    let mut guard = WANTED.lock().map_err(|error| format!("Lock error: {error}"))?;
    let wanted = guard.get_or_insert_with(Wanted::default);
    update(wanted);
    reconcile(wanted)
}

pub fn sync_console(inputs: Vec<(String, Arc<LiveInput>)>) -> Result<(), String> {
    sync(|wanted| wanted.console = inputs)
}

pub fn sync_direct(inputs: Vec<(String, Arc<LiveInput>)>) -> Result<(), String> {
    sync(|wanted| wanted.direct = inputs)
}
