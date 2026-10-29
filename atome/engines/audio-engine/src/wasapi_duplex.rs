// Windows device thread (todo/effets_generateurs_audio D23-1, plan "jeu en direct" step 2): one
// thread owns the exclusive output, at the interface's smallest period. Each period it first takes
// what the exclusive inputs captured — into the live inputs' rings (the direct path reads them in
// this same cycle) and the recorders' taps — then plays the output quantum (OutputFill). Input and
// output run in one callback on one clock, as a duplex stream does; cpal 0.15 has no such stream on
// any host, and on Windows only a shared one. Every input of the engine is opened here, so a take
// and a monitored strip share the interface the exclusive mode holds.

use super::aux_outputs;
use super::output_fill::OutputFill;
use super::output_idle;
use super::scheduled_backend::{note_discontinuity, note_rest, now_host_ns, BLOCK_FRAMES};
use super::wasapi_client::{self, Endpoint, Exclusive, ExclusiveFormat};
use atome_mix_graph::resample::LinearResampler;
use atome_mix_graph::shared::LiveInput;
use kira::Frame;
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, AtomicU32, AtomicU64, Ordering};
use std::sync::mpsc::Receiver;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use windows::Win32::Media::Audio::{eCapture, eRender, AUDCLNT_BUFFERFLAGS_SILENT};

// A recorder's tap: an input period's interleaved samples and its host instant.
pub(crate) type Tap = Arc<dyn Fn(&[f32], i64) + Send + Sync>;

struct Input {
    stream: Exclusive,
    live: Vec<Arc<LiveInput>>,
    taps: Vec<(u64, Tap)>,
    resampler: LinearResampler,
    samples: Vec<f32>,
    frames: Vec<Frame>,
    resampled: Vec<Frame>,
}

// The COM objects are free-threaded (multithreaded apartment): the thread that
// opens an input hands it to the device thread.
unsafe impl Send for Input {}

static INPUTS: Mutex<Option<HashMap<String, Input>>> = Mutex::new(None);
static OUTPUT_RATE: AtomicU32 = AtomicU32::new(0);
static NEXT_TAP: AtomicU64 = AtomicU64::new(1);

// COM work runs on a thread of its own in the multithreaded apartment (the
// caller's may be the app's single-threaded one).
fn on_com_thread<T: Send + 'static>(work: impl FnOnce() -> Result<T, String> + Send + 'static) -> Result<T, String> {
    std::thread::spawn(move || wasapi_client::com().and_then(|()| work())).join().map_err(|_| "wasapi_thread_panicked".to_string())?
}

// The rate the engine renders at: the output's exclusive format.
pub(crate) fn output_rate() -> Result<u32, String> {
    on_com_thread(|| Ok(wasapi_client::exclusive_format(&wasapi_client::default_output()?, None)?.rate))
}

fn running_rate() -> Result<u32, String> {
    Some(OUTPUT_RATE.load(Ordering::Acquire)).filter(|rate| *rate > 0).ok_or_else(|| "audio_engine_output_not_running".to_string())
}

// The format an input records at: its exclusive one, at the output's rate when it takes it.
pub(crate) fn input_format(device: Option<&str>) -> Result<(u32, u16), String> {
    let rate = running_rate()?;
    let name = device.map(str::to_string);
    on_com_thread(move || wasapi_client::exclusive_format(&wasapi_client::input(name.as_deref())?, Some(rate)))
        .map(|format| (format.rate, format.channels))
}

// An input by its name: the default input is named too, so a take on it and a strip on the same
// interface share one exclusive stream.
fn key(device: Option<&str>) -> Result<String, String> {
    match device.map(str::trim).filter(|name| !name.is_empty()) {
        Some(name) => Ok(name.to_string()),
        None => on_com_thread(|| wasapi_client::friendly_name(&wasapi_client::input(None)?)),
    }
}

// Changes the input of `device`, opening it first (`open`) when no strip or take uses it yet;
// an input left with no listener and no tap closes.
fn with_input(device: Option<&str>, open: bool, change: impl FnOnce(&mut Input)) -> Result<(), String> {
    let key = key(device)?;
    let opened = {
        let inputs = INPUTS.lock().map_err(|error| format!("Lock error: {error}"))?;
        inputs.as_ref().is_some_and(|inputs| inputs.contains_key(&key))
    };
    if !opened && !open {
        return Ok(());
    }
    let fresh = if opened { None } else { Some(open_input(&key)?) };
    let mut guard = INPUTS.lock().map_err(|error| format!("Lock error: {error}"))?;
    let inputs = guard.get_or_insert_with(HashMap::new);
    if let Some(input) = fresh {
        inputs.entry(key.clone()).or_insert(input);
    }
    if let Some(input) = inputs.get_mut(&key) {
        change(input);
        if input.live.is_empty() && input.taps.is_empty() {
            inputs.remove(&key);
        }
    }
    output_idle::note_activity();
    Ok(())
}

fn open_input(key: &str) -> Result<Input, String> {
    let rate = running_rate()?;
    let name = key.to_string();
    let stream = on_com_thread(move || {
        let device = wasapi_client::input(Some(&name))?;
        let format = wasapi_client::exclusive_format(&device, Some(rate))?;
        let stream = Exclusive::open(&device, format, eCapture)?;
        stream.start()?;
        Ok(SendExclusive(stream))
    })?.0;
    let capacity = stream.frames as usize * 4;
    Ok(Input {
        resampler: LinearResampler::new(stream.format.rate, rate),
        samples: Vec::with_capacity(capacity * usize::from(stream.format.channels)),
        frames: Vec::with_capacity(capacity),
        resampled: Vec::with_capacity(capacity * 2),
        live: Vec::new(),
        taps: Vec::new(),
        stream,
    })
}

struct SendExclusive(Exclusive);
unsafe impl Send for SendExclusive {}

// The live inputs (mixer strips) listening to `device` now; none closes it for them.
pub(crate) fn listen(device: &str, live: Vec<Arc<LiveInput>>) -> Result<(), String> {
    let open = !live.is_empty();
    with_input(Some(device), open, |input| input.live = live)
}

// A take's tap on `device` (None: the default input); returns its id for `untap`.
pub(crate) fn tap(device: Option<&str>, tap: Tap) -> Result<u64, String> {
    let id = NEXT_TAP.fetch_add(1, Ordering::AcqRel);
    with_input(device, true, |input| input.taps.push((id, tap)))?;
    Ok(id)
}

pub(crate) fn untap(device: Option<&str>, id: u64) -> Result<(), String> {
    with_input(device, false, |input| input.taps.retain(|(tap, _)| *tap != id))
}

impl Input {
    // Everything captured since the last period: to the taps as it came, to the live inputs as
    // stereo frames at the output's rate.
    fn drain(&mut self, host_ns: i64) {
        let Endpoint::Capture(capture) = &self.stream.endpoint else { return };
        let format = self.stream.format;
        let channels = usize::from(format.channels.max(1));
        while unsafe { capture.GetNextPacketSize() }.unwrap_or(0) > 0 {
            let (mut data, mut frames, mut flags) = (std::ptr::null_mut(), 0u32, 0u32);
            if unsafe { capture.GetBuffer(&mut data, &mut frames, &mut flags, None, None) }.is_err() {
                return;
            }
            let silent = flags & AUDCLNT_BUFFERFLAGS_SILENT.0 as u32 != 0;
            let count = (frames as usize * channels).min(self.samples.capacity());
            self.samples.clear();
            self.samples.extend((0..count).map(|index| if silent { 0.0 } else { unsafe { format.read(data, index) } }));
            let _ = unsafe { capture.ReleaseBuffer(frames) };
            self.taps.iter().for_each(|(_, tap)| tap(&self.samples, host_ns));
            if self.live.is_empty() {
                continue;
            }
            self.frames.clear();
            self.frames.extend(self.samples.chunks(channels).take(self.frames.capacity())
                .map(|frame| Frame::new(frame[0], frame.get(1).copied().unwrap_or(frame[0]))));
            super::direct::note_input_quantum(self.frames.len());
            let pushed = if self.resampler.is_identity() {
                &self.frames
            } else {
                self.resampled.clear();
                self.resampler.process(&self.frames, &mut self.resampled);
                &self.resampled
            };
            self.live.iter().for_each(|input| input.push(pushed));
        }
    }
}

// Starts the device thread on the default output; Ok once its first stream plays.
pub(crate) fn start(fill: OutputFill, stop: Arc<AtomicBool>, wake: Receiver<()>) -> Result<(), String> {
    let (ready_tx, ready_rx) = std::sync::mpsc::channel::<Result<(), String>>();
    crate::engine_thread::spawn(move || {
        let mut fill = fill;
        let mut ready = Some(ready_tx);
        if let Err(error) = wasapi_client::com() {
            let _ = ready.take().map(|ready| ready.send(Err(error)));
            return;
        }
        wasapi_client::pro_audio_thread();
        while !stop.load(Ordering::Acquire) {
            match open_output() {
                Ok(output) => {
                    let _ = ready.take().map(|ready| ready.send(Ok(())));
                    play(&output, &mut fill, &stop, &wake);
                }
                Err(error) => {
                    // The first stream reports its error; a lost device is looked for again.
                    if let Some(ready) = ready.take() {
                        let _ = ready.send(Err(error));
                        return;
                    }
                    std::thread::sleep(Duration::from_millis(250));
                }
            }
            note_discontinuity();
        }
        OUTPUT_RATE.store(0, Ordering::Release);
    });
    ready_rx.recv().map_err(|_| "output_thread_failed".to_string())?
}

fn open_output() -> Result<Exclusive, String> {
    let device = wasapi_client::default_output()?;
    let format: ExclusiveFormat = wasapi_client::exclusive_format(&device, None)?;
    let output = Exclusive::open(&device, format, eRender)?;
    // The mixer may route strips to this device's extra channel pairs.
    aux_outputs::note_output_device(wasapi_client::friendly_name(&device)?, format.channels, BLOCK_FRAMES);
    OUTPUT_RATE.store(format.rate, Ordering::Release);
    Ok(output)
}

// One period of silence written ahead, so the stream starts with a full buffer.
fn prime(output: &Exclusive) -> Result<(), String> {
    let Endpoint::Render(render) = &output.endpoint else { return Err("wasapi_not_a_render_stream".into()) };
    unsafe {
        render.GetBuffer(output.frames).map_err(|error| format!("wasapi_get_buffer: {error}"))?;
        render.ReleaseBuffer(output.frames, AUDCLNT_BUFFERFLAGS_SILENT.0 as u32).map_err(|error| format!("wasapi_release_buffer: {error}"))?;
    }
    output.start()
}

// Plays `output` until the engine stops or the device goes away; rests (stream stopped) while
// nothing sounds and no input is open.
fn play(output: &Exclusive, fill: &mut OutputFill, stop: &AtomicBool, wake: &Receiver<()>) {
    let Endpoint::Render(render) = &output.endpoint else { return };
    let channels = usize::from(output.format.channels.max(1));
    let frames = output.frames as usize;
    let mut data = vec![0.0f32; frames * channels];
    let mut playing = prime(output).is_ok();
    if !playing {
        return;
    }
    while !stop.load(Ordering::Acquire) {
        if !playing {
            let _ = wake.recv_timeout(Duration::from_millis(250));
            if output_idle::is_active() {
                if prime(output).is_err() {
                    return;
                }
                playing = true;
            }
            continue;
        }
        if !output.wait(500) {
            continue;
        }
        let host_ns = now_host_ns();
        let inputs_open = match INPUTS.try_lock() {
            Ok(mut inputs) => inputs.as_mut().map_or(false, |inputs| {
                inputs.values_mut().for_each(|input| input.drain(host_ns));
                !inputs.is_empty()
            }),
            Err(_) => true,
        };
        fill.fill(&mut data, channels, host_ns);
        let written = unsafe { render.GetBuffer(output.frames) }.and_then(|buffer| unsafe {
            for (index, sample) in data.iter().enumerate() {
                output.format.write(buffer, index, *sample);
            }
            render.ReleaseBuffer(output.frames, 0)
        });
        // A device that went away (invalidated): the thread opens the default one again.
        if written.is_err() {
            return;
        }
        // The exclusive stream always runs at its smallest period: the direct path asks no other.
        super::direct::take_rebuild();
        if !inputs_open && output_idle::should_rest() {
            output.stop();
            playing = false;
            note_rest();
        }
    }
}
