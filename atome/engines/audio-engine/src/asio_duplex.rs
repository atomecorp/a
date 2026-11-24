// Windows, ASIO (user « Ok pour asio », 18 Nov. 2026; built with the crate's `asio` feature, which
// needs the Steinberg ASIO SDK, see todo/REGISTRE_DEMANDES.md R-235): one driver plays the output
// and gives its inputs, both in each buffer switch of its one clock. The input stream is built
// first, so cpal runs its callback before the output's in the same switch: what the inputs took is
// in the live inputs' rings (the direct path reads them) and the takes' taps before the output
// quantum is filled, as wasapi_duplex.rs does. The driver opens at the engine's rate or refuses.

use super::aux_outputs;
use super::direct;
use super::output_idle;
use super::scheduled_backend::{BLOCK_FRAMES, note_rest, now_host_ns};
use super::windows_driver::{SharedFill, Tap};
use atome_mix_graph::shared::LiveInput;
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{FromSample, Sample, SampleFormat, SizedSample};
use kira::Frame;
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::mpsc::Receiver;
use std::sync::{Arc, Mutex};
use std::time::Duration;

#[derive(Default)]
struct Listeners {
    live: HashMap<String, Vec<Arc<LiveInput>>>,
    taps: Vec<(u64, Tap)>,
}

static LISTENERS: Mutex<Option<Listeners>> = Mutex::new(None);
static RATE: AtomicU32 = AtomicU32::new(0);
static INPUT_CHANNELS: AtomicU32 = AtomicU32::new(0);
static ACTIVE: Mutex<String> = Mutex::new(String::new());

fn host() -> Result<cpal::Host, String> {
    cpal::host_from_id(cpal::HostId::Asio)
        .map_err(|error| format!("asio_host_unavailable: {error}"))
}

pub(crate) fn built() -> bool {
    true
}

// The ASIO drivers installed on this PC, by name (each is loaded a moment to be read).
pub(crate) fn drivers() -> Vec<String> {
    host()
        .and_then(|host| host.devices().map_err(|error| error.to_string()))
        .map(|devices| {
            devices
                .filter_map(|device| super::recorder::device_name(&device).ok())
                .collect()
        })
        .unwrap_or_default()
}

// While a driver plays, it is the only one cpal can load: its name is answered without a reload.
fn playing_driver() -> String {
    ACTIVE.lock().map(|name| name.clone()).unwrap_or_default()
}

pub(crate) fn check(name: &str) -> Result<(), String> {
    if name.trim().is_empty() {
        return Err("asio_driver_required".into());
    }
    if playing_driver() == name || drivers().iter().any(|driver| driver == name) {
        return Ok(());
    }
    Err(format!("asio_driver_not_installed:{name}"))
}

fn device(name: &str) -> Result<cpal::Device, String> {
    host()?
        .devices()
        .map_err(|error| error.to_string())?
        .find(|device| super::recorder::device_name(device).is_ok_and(|found| found == name))
        .ok_or_else(|| format!("asio_driver_not_installed:{name}"))
}

pub(crate) fn output_rate(name: &str) -> Result<u32, String> {
    let rate = device(name)?
        .default_output_config()
        .map_err(|error| format!("asio_output_config: {error}"))?
        .sample_rate();
    Some(rate)
        .filter(|rate| *rate > 0)
        .ok_or_else(|| "asio_rate_unknown".to_string())
}

pub(crate) fn input_format() -> Result<(u32, u16), String> {
    let rate = RATE.load(Ordering::Acquire);
    let channels = INPUT_CHANNELS.load(Ordering::Acquire);
    if rate == 0 {
        return Err("audio_engine_output_not_running".into());
    }
    if channels == 0 {
        return Err("asio_driver_has_no_input".into());
    }
    Ok((rate, channels as u16))
}

// The playing driver is the one input under ASIO.
pub(crate) fn input_devices() -> Vec<(String, u16)> {
    let channels = INPUT_CHANNELS.load(Ordering::Acquire) as u16;
    Some(playing_driver())
        .filter(|name| !name.is_empty() && channels > 0)
        .map(|name| vec![(name, channels)])
        .unwrap_or_default()
}

fn with_listeners(change: impl FnOnce(&mut Listeners)) -> Result<(), String> {
    let mut guard = LISTENERS
        .lock()
        .map_err(|error| format!("Lock error: {error}"))?;
    change(guard.get_or_insert_with(Listeners::default));
    output_idle::note_activity();
    Ok(())
}

// Every strip listens to the driver's input, whatever input it named.
pub(crate) fn listen(device: &str, live: Vec<Arc<LiveInput>>) -> Result<(), String> {
    if !live.is_empty() {
        let (_, width) = input_format()?;
        live.iter()
            .try_for_each(|input| input.fits(usize::from(width)))?;
    }
    with_listeners(|listeners| {
        if live.is_empty() {
            listeners.live.remove(device);
        } else {
            listeners.live.insert(device.to_string(), live);
        }
    })
}

pub(crate) fn tap(_device: Option<&str>, id: u64, tap: Tap) -> Result<(), String> {
    input_format()?;
    with_listeners(|listeners| listeners.taps.push((id, tap)))
}

pub(crate) fn untap(id: u64) -> Result<(), String> {
    with_listeners(|listeners| listeners.taps.retain(|(tap, _)| *tap != id))
}

fn has_listeners() -> bool {
    LISTENERS.try_lock().map_or(true, |listeners| {
        listeners
            .as_ref()
            .is_some_and(|listeners| !listeners.live.is_empty() || !listeners.taps.is_empty())
    })
}

// One buffer switch of the inputs: to the taps as it came, to the live inputs as stereo frames
// (the driver's clock is the output's, so no resampling).
fn feed(samples: &[f32], channels: usize, frames: &mut Vec<Frame>) {
    let host_ns = now_host_ns();
    let Ok(mut guard) = LISTENERS.try_lock() else {
        return;
    };
    let Some(listeners) = guard.as_mut() else {
        return;
    };
    listeners
        .taps
        .iter()
        .for_each(|(_, tap)| tap(samples, host_ns));
    if listeners.live.is_empty() {
        return;
    }
    direct::note_input_quantum(samples.len() / channels.max(1));
    // Each listener takes its own channels of the driver's inputs (R-286).
    listeners.live.values().flatten().for_each(|input| {
        frames.clear();
        frames.extend(
            samples
                .chunks(channels.max(1))
                .take(frames.capacity())
                .map(|frame| input.frame_of(frame)),
        );
        input.push_at(frames, host_ns as f64);
    });
}

fn input_stream<T>(
    device: &cpal::Device,
    config: cpal::StreamConfig,
    lost: Arc<AtomicBool>,
) -> Result<cpal::Stream, String>
where
    T: SizedSample,
    f32: FromSample<T>,
{
    let channels = usize::from(config.channels.max(1));
    let mut samples = Vec::<f32>::with_capacity(16_384 * channels);
    let mut frames = Vec::<Frame>::with_capacity(16_384);
    device
        .build_input_stream(
            config,
            move |data: &[T], _: &cpal::InputCallbackInfo| {
                samples.clear();
                samples.extend(
                    data.iter()
                        .take(samples.capacity())
                        .map(|sample| f32::from_sample(*sample)),
                );
                feed(&samples, channels, &mut frames);
            },
            move |error| {
                if error.kind() == cpal::ErrorKind::DeviceNotAvailable {
                    lost.store(true, Ordering::Release);
                }
            },
            None,
        )
        .map_err(|error| format!("asio_input_stream: {error}"))
}

fn output_stream<T>(
    device: &cpal::Device,
    config: cpal::StreamConfig,
    fill: SharedFill,
    lost: Arc<AtomicBool>,
) -> Result<cpal::Stream, String>
where
    T: SizedSample + FromSample<f32>,
{
    let channels = usize::from(config.channels.max(1));
    let mut rendered = Vec::<f32>::with_capacity(16_384 * channels);
    device
        .build_output_stream(
            config,
            move |data: &mut [T], _: &cpal::OutputCallbackInfo| {
                rendered.clear();
                rendered.resize(data.len().min(rendered.capacity()), 0.0);
                if let Ok(mut fill) = fill.try_lock() {
                    fill.fill(&mut rendered, channels, now_host_ns());
                }
                data.iter_mut()
                    .zip(rendered.iter().chain(std::iter::repeat(&0.0)))
                    .for_each(|(out, sample)| *out = T::from_sample(*sample));
            },
            move |error| {
                if error.kind() == cpal::ErrorKind::DeviceNotAvailable {
                    lost.store(true, Ordering::Release);
                }
            },
            None,
        )
        .map_err(|error| format!("asio_output_stream: {error}"))
}

// The driver's formats are its own (often I32): one stream of each kind per format it may give.
macro_rules! by_format {
    ($build:ident, $format:expr, $($arg:expr),*) => {
        match $format {
            SampleFormat::F32 => $build::<f32>($($arg),*),
            SampleFormat::I16 => $build::<i16>($($arg),*),
            SampleFormat::I24 => $build::<cpal::I24>($($arg),*),
            SampleFormat::I32 => $build::<i32>($($arg),*),
            SampleFormat::F64 => $build::<f64>($($arg),*),
            other => Err(format!("asio_sample_format_unsupported:{other}")),
        }
    };
}

struct Opened {
    output: cpal::Stream,
    input: Option<cpal::Stream>,
}

impl Opened {
    fn each(&self, act: impl Fn(&cpal::Stream) -> Result<(), String>) -> Result<(), String> {
        self.input.iter().try_for_each(&act)?;
        act(&self.output)
    }
}

fn open(
    name: &str,
    rate: u32,
    fill: &SharedFill,
    lost: &Arc<AtomicBool>,
) -> Result<Opened, String> {
    let device = device(name)?;
    let at_rate = |supported: cpal::SupportedStreamConfig| {
        let mut config = supported.config();
        config.sample_rate = rate;
        config.buffer_size = cpal::BufferSize::Default;
        (config, supported.sample_format())
    };
    let takes_rate = device
        .supported_output_configs()
        .map_err(|error| format!("asio_output_config: {error}"))?
        .any(|range| range.min_sample_rate() <= rate && rate <= range.max_sample_rate());
    if !takes_rate {
        return Err(format!("asio_rate_unsupported:{rate}"));
    }
    let (output_config, output_format) = at_rate(
        device
            .default_output_config()
            .map_err(|error| format!("asio_output_config: {error}"))?,
    );
    let input = device.default_input_config().ok().map(at_rate);
    let input = match input {
        Some((config, format)) => Some((
            by_format!(input_stream, format, &device, config, Arc::clone(lost))?,
            config.channels,
        )),
        None => None,
    };
    let output = by_format!(
        output_stream,
        output_format,
        &device,
        output_config,
        Arc::clone(fill),
        Arc::clone(lost)
    )?;
    // The mixer may route strips to the driver's extra output pairs.
    aux_outputs::note_output_device(name.to_string(), output_config.channels, BLOCK_FRAMES);
    INPUT_CHANNELS.store(
        input
            .as_ref()
            .map_or(0, |(_, channels)| u32::from(*channels)),
        Ordering::Release,
    );
    Ok(Opened {
        output,
        input: input.map(|(stream, _)| stream),
    })
}

// Plays driver `name` while it stays the chosen one (`generation`); `opened` hears whether it
// opened. Err when it did not; Ok once it was lost, the engine stopped or the driver changed.
pub(crate) fn run(
    name: &str,
    rate: u32,
    fill: &SharedFill,
    stop: &AtomicBool,
    wake: &Receiver<()>,
    generation: u64,
    opened: &mut dyn FnMut(Result<(), String>) -> bool,
) -> Result<(), ()> {
    let lost = Arc::new(AtomicBool::new(false));
    let streams = open(name, rate, fill, &lost).and_then(|streams| {
        streams.each(|stream| stream.play().map_err(|error| format!("asio_play: {error}")))?;
        Ok(streams)
    });
    let streams = match streams {
        Ok(streams) => streams,
        Err(error) => {
            opened(Err(error));
            return Err(());
        }
    };
    RATE.store(rate, Ordering::Release);
    if let Ok(mut active) = ACTIVE.lock() {
        *active = name.to_string();
    }
    if !opened(Ok(())) {
        return Err(());
    }
    let mut playing = true;
    while !stop.load(Ordering::Acquire)
        && super::windows_driver::unchanged(generation)
        && !lost.load(Ordering::Acquire)
    {
        let _ = wake.recv_timeout(Duration::from_millis(250));
        if !playing && output_idle::is_active() {
            playing = streams
                .each(|stream| stream.play().map_err(|error| error.to_string()))
                .is_ok();
        } else if playing && !has_listeners() && output_idle::should_rest() {
            // At rest the frame/host relation is lost: the next switch re-anchors it.
            playing = streams
                .each(|stream| stream.pause().map_err(|error| error.to_string()))
                .is_err();
            note_rest();
        }
        // The driver keeps its own buffer size: the direct path asks no other.
        direct::take_rebuild();
    }
    drop(streams);
    RATE.store(0, Ordering::Release);
    INPUT_CHANNELS.store(0, Ordering::Release);
    if let Ok(mut active) = ACTIVE.lock() {
        active.clear();
    }
    if !super::windows_driver::unchanged(generation)
        && let Ok(mut listeners) = LISTENERS.lock()
    {
        *listeners = None;
    }
    Ok(())
}
