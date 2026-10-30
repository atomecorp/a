// Kira backend that owns the browser AudioContext and schedules every rendered
// block at a known context frame. Recording opens its AudioWorklet on this SAME
// context, so playback and capture share one frame domain: the timeline frame
// heard at any context frame is known exactly (todo/timeline: sample-accurate
// overdub on the Web). Everything runs on the browser main thread: a block is
// rendered only inside `pump`, so the voices started in one synchronous JS
// stretch all begin on the same rendered frame. With nothing to render the
// engine sleeps (BUG-068): its pump stops and its context suspends, the
// context clock freezing with it, so every rendered frame keeps its context
// frame; the next demand (`wake`) resumes both.

use kira::backend::{Backend, Renderer};
use atome_mix_graph::voice::VoiceSound;
use std::cell::{Cell, RefCell};
use wasm_bindgen::prelude::*;
use wasm_bindgen::JsCast;
use web_sys::{AudioContext, AudioContextOptions};

const BLOCK_FRAMES: usize = 512;
const CHANNELS: usize = 2;
const LOOKAHEAD_SECONDS: f64 = 0.12;
const PUMP_INTERVAL_MS: i32 = 10;
// Nothing to render for this long (no voice due or sounding, silence out, no
// hold, no clock read or sound command): the engine sleeps.
const IDLE_SECONDS: f64 = 3.0;
// Output under this (-100 dB) is silence: an effect's last tail ends there.
const SILENCE: f32 = 1.0e-5;

struct RenderClock {
    context: AudioContext,
    sample_rate: f64,
    // Rendered frames since the backend started; the next rendered block
    // starts at this frame.
    frames_rendered: u64,
    // Context frame at which rendered frame 0 is played.
    base_context_frame: f64,
    // Times the main thread fell behind and the schedule had to jump ahead.
    discontinuities: u32,
    // Rendered frame from which each base applies: a capture is placed with the
    // base in force when it started (bounded: the latest ones matter).
    segments: Vec<(u64, f64)>,
    renderer: Option<Renderer>,
    pump: Option<Closure<dyn FnMut()>>,
    // The pump's interval while it runs; none while the engine sleeps.
    interval: Option<i32>,
    asleep: bool,
    // Frames rendered in a row with nothing to play.
    quiet_frames: u64,
    scratch: Scratch,
}

// Block buffers made once: a pump renders into them, never into new ones (D28).
struct Scratch {
    interleaved: Vec<f32>,
    left: Vec<f32>,
    right: Vec<f32>,
    aux: Vec<(Vec<f32>, Vec<f32>)>,
    aux_frames: Vec<kira::Frame>,
}

impl Scratch {
    fn new() -> Self {
        Self {
            interleaved: vec![0.0; BLOCK_FRAMES * CHANNELS],
            left: vec![0.0; BLOCK_FRAMES],
            right: vec![0.0; BLOCK_FRAMES],
            aux: Vec::new(),
            aux_frames: vec![kira::Frame::ZERO; BLOCK_FRAMES],
        }
    }
}

// A voice waiting for its exact rendered frame.
struct PendingStart {
    voice_id: String,
    sound: VoiceSound,
    frame: u64,
}

type StartHook = fn(&str, VoiceSound);
type SoundingHook = fn() -> bool;

thread_local! {
    static CLOCK: RefCell<Option<RenderClock>> = const { RefCell::new(None) };
    static PENDING: RefCell<Vec<PendingStart>> = const { RefCell::new(Vec::new()) };
    static START_HOOK: Cell<Option<StartHook>> = const { Cell::new(None) };
    // Extra destination channel pairs fed by the mixer graph.
    static AUX: RefCell<Option<std::sync::Arc<atome_mix_graph::AuxOutputs>>> = const { RefCell::new(None) };
    static AUX_PAIRS: Cell<usize> = const { Cell::new(0) };
    // Whether a started voice still plays (the engine owns the voices).
    static SOUNDING_HOOK: Cell<Option<SoundingHook>> = const { Cell::new(None) };
    // Owners playing on the context itself (the direct path, a live input, a
    // recording): the engine stays awake while one holds it.
    static HOLDS: RefCell<Vec<String>> = const { RefCell::new(Vec::new()) };
}

// The engine starts a due voice through this hook (it owns the AudioManager).
pub fn install_aux_source(aux: std::sync::Arc<atome_mix_graph::AuxOutputs>) {
    AUX.with(|slot| *slot.borrow_mut() = Some(aux));
}

pub fn install_start_hook(hook: StartHook) {
    START_HOOK.with(|cell| cell.set(Some(hook)));
}

pub fn install_sounding_hook(hook: SoundingHook) {
    SOUNDING_HOOK.with(|cell| cell.set(Some(hook)));
}

fn start_now(voice_id: &str, sound: VoiceSound) {
    if let Some(hook) = START_HOOK.with(|cell| cell.get()) {
        hook(voice_id, sound);
    }
}

// Queues a voice for rendered frame `frame`; a frame already rendered becomes
// the next block's first frame. Never starts it inline: the caller holds the
// engine. Returns the frame the voice will start on.
pub fn schedule(voice_id: &str, sound: VoiceSound, frame: u64) -> u64 {
    cancel_scheduled(voice_id);
    let start = frame.max(next_render_frame().max(0.0) as u64);
    PENDING.with(|pending| pending.borrow_mut().push(PendingStart { voice_id: voice_id.to_string(), sound, frame: start }));
    start
}

pub fn cancel_scheduled(voice_id: &str) -> bool {
    PENDING.with(|pending| {
        let mut list = pending.borrow_mut();
        let before = list.len();
        list.retain(|entry| entry.voice_id != voice_id);
        before != list.len()
    })
}

// Frames inside [from, to) where scheduled voices are due (missed ones are due at `from`).
fn due_frames(from: u64, to: u64) -> Vec<u64> {
    let mut frames: Vec<u64> = PENDING.with(|pending| pending.borrow().iter()
        .filter(|entry| entry.frame < to)
        .map(|entry| entry.frame.max(from))
        .collect());
    frames.sort_unstable();
    frames.dedup();
    frames
}

fn start_due(at: u64) {
    let due: Vec<PendingStart> = PENDING.with(|pending| {
        let mut list = pending.borrow_mut();
        let (due, rest): (Vec<PendingStart>, Vec<PendingStart>) = list.drain(..).partition(|entry| entry.frame <= at);
        *list = rest;
        due
    });
    for entry in due {
        start_now(&entry.voice_id, entry.sound);
    }
}

#[derive(Debug)]
pub struct ScheduledBackendError(pub String);

impl From<JsValue> for ScheduledBackendError {
    fn from(value: JsValue) -> Self {
        Self(value.as_string().unwrap_or_else(|| format!("{value:?}")))
    }
}

impl std::fmt::Display for ScheduledBackendError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str(&self.0)
    }
}

pub struct ScheduledContextBackend;

impl Backend for ScheduledContextBackend {
    type Settings = ();
    type Error = ScheduledBackendError;

    fn setup(_settings: (), _internal_buffer_size: usize) -> Result<(Self, u32), Self::Error> {
        let options = AudioContextOptions::new();
        options.set_latency_hint(&JsValue::from_str("interactive"));
        let context = AudioContext::new_with_context_options(&options)?;
        let _ = context.resume()?;
        let sample_rate = context.sample_rate() as f64;
        // A multichannel interface: every channel of the destination is used,
        // pair 1-2 for the main mix, the next pairs for strips routed there.
        let destination = context.destination();
        let channels = destination.max_channel_count().max(2) as usize;
        if channels > CHANNELS {
            destination.set_channel_count(channels as u32);
            destination.set_channel_interpretation(web_sys::ChannelInterpretation::Discrete);
        }
        let pairs = (channels / 2).saturating_sub(1);
        AUX_PAIRS.with(|cell| cell.set(pairs));
        AUX.with(|slot| if let Some(aux) = slot.borrow().as_ref() { aux.configure(pairs as u16, BLOCK_FRAMES * 4) });
        CLOCK.with(|cell| {
            *cell.borrow_mut() = Some(RenderClock {
                context,
                sample_rate,
                frames_rendered: 0,
                base_context_frame: 0.0,
                discontinuities: 0,
                segments: Vec::new(),
                renderer: None,
                pump: None,
                interval: None,
                asleep: false,
                quiet_frames: 0,
                scratch: Scratch::new(),
            });
        });
        Ok((Self, sample_rate as u32))
    }

    fn start(&mut self, renderer: Renderer) -> Result<(), Self::Error> {
        CLOCK.with(|cell| {
            let mut guard = cell.borrow_mut();
            let clock = guard.as_mut().ok_or_else(|| ScheduledBackendError("render_clock_missing".into()))?;
            // Whole frames: every block starts exactly on a context frame.
            clock.base_context_frame = ((clock.context.current_time() + LOOKAHEAD_SECONDS) * clock.sample_rate).round();
            clock.segments = vec![(0, clock.base_context_frame)];
            clock.renderer = Some(renderer);
            clock.pump = Some(Closure::<dyn FnMut()>::new(pump));
            start_pump(clock)?;
            Ok::<(), ScheduledBackendError>(())
        })?;
        Ok(())
    }
}

fn pump() {
    render_ahead();
}

fn start_pump(clock: &mut RenderClock) -> Result<(), JsValue> {
    let window = web_sys::window().ok_or_else(|| JsValue::from_str("window_unavailable"))?;
    let pump = clock.pump.as_ref().ok_or_else(|| JsValue::from_str("render_pump_missing"))?;
    clock.interval = Some(window.set_interval_with_callback_and_timeout_and_arguments_0(pump.as_ref().unchecked_ref(), PUMP_INTERVAL_MS)?);
    Ok(())
}

// A demand (a voice to play, a clock read, a sound command, a hold): the quiet
// count starts again; an engine asleep renders again and resumes its context.
// Answers the context's resume when it was asleep: its clock runs from then.
pub fn wake() -> Result<Option<js_sys::Promise>, JsValue> {
    CLOCK.with(|cell| {
        let mut guard = cell.borrow_mut();
        let Some(clock) = guard.as_mut() else { return Ok(None) };
        clock.quiet_frames = 0;
        if !clock.asleep {
            return Ok(None);
        }
        clock.asleep = false;
        let resumed = clock.context.resume()?;
        start_pump(clock)?;
        Ok(Some(resumed))
    })
}

// An owner playing on the context itself holds the engine awake until it lets go.
pub fn hold(owner: &str, on: bool) -> Result<Option<js_sys::Promise>, JsValue> {
    HOLDS.with(|holds| {
        let mut holds = holds.borrow_mut();
        holds.retain(|held| held != owner);
        if on {
            holds.push(owner.to_string());
        }
    });
    if on { wake() } else { Ok(None) }
}

// After a pump: the frames it rendered with nothing to play add up; past
// IDLE_SECONDS the pump stops and the context suspends (its clock freezes).
fn settle(clock: &mut RenderClock, rendered: u64, loud: bool) {
    if rendered == 0 {
        return;
    }
    let busy = loud
        || PENDING.with(|pending| !pending.borrow().is_empty())
        || HOLDS.with(|holds| !holds.borrow().is_empty())
        || SOUNDING_HOOK.with(Cell::get).is_some_and(|sounding| sounding());
    clock.quiet_frames = if busy { 0 } else { clock.quiet_frames + rendered };
    if (clock.quiet_frames as f64) < IDLE_SECONDS * clock.sample_rate {
        return;
    }
    if let (Some(interval), Some(window)) = (clock.interval.take(), web_sys::window()) {
        window.clear_interval_with_handle(interval);
    }
    clock.asleep = true;
    clock.quiet_frames = 0;
    if let Err(error) = clock.context.suspend() {
        web_sys::console::error_1(&error);
    }
}

fn loud(samples: &[f32]) -> bool {
    samples.iter().any(|sample| sample.abs() >= SILENCE)
}

// Renders and schedules blocks until the lookahead is covered. A late pump
// (main thread busy) moves the schedule forward and counts a discontinuity:
// takes overlapping one are not sample-accurate and say so.
fn render_ahead() {
    CLOCK.with(|cell| {
        let mut guard = cell.borrow_mut();
        let Some(clock) = guard.as_mut() else { return };
        let Some(mut renderer) = clock.renderer.take() else { return };
        let now_frame = clock.context.current_time() * clock.sample_rate;
        let next_frame = clock.base_context_frame + clock.frames_rendered as f64;
        if next_frame < now_frame {
            clock.base_context_frame += ((now_frame - next_frame) + LOOKAHEAD_SECONDS * clock.sample_rate).ceil();
            clock.discontinuities += 1;
            clock.segments.push((clock.frames_rendered, clock.base_context_frame));
            if clock.segments.len() > 64 {
                clock.segments.remove(0);
            }
        }
        let horizon = now_frame + LOOKAHEAD_SECONDS * clock.sample_rate;
        let (rendered_from, mut heard) = (clock.frames_rendered, false);
        let Scratch { interleaved, left, right, aux, aux_frames } = &mut clock.scratch;
        while clock.base_context_frame + (clock.frames_rendered as f64) < horizon {
            // The block is rendered in pieces split at the frames where scheduled
            // voices are due: each starts exactly on its frame.
            let block_start = clock.frames_rendered;
            let mut cursor = block_start;
            for due in due_frames(block_start, block_start + BLOCK_FRAMES as u64) {
                if due > cursor {
                    let from = (cursor - block_start) as usize * CHANNELS;
                    let to = (due - block_start) as usize * CHANNELS;
                    renderer.on_start_processing();
                    renderer.process(&mut interleaved[from..to], CHANNELS as u16);
                    cursor = due;
                }
                start_due(due);
            }
            let from = (cursor - block_start) as usize * CHANNELS;
            renderer.on_start_processing();
            renderer.process(&mut interleaved[from..], CHANNELS as u16);
            for frame in 0..BLOCK_FRAMES {
                left[frame] = interleaved[frame * CHANNELS];
                right[frame] = interleaved[frame * CHANNELS + 1];
            }
            interleaved.fill(0.0);
            let when = (clock.base_context_frame + clock.frames_rendered as f64) / clock.sample_rate;
            drain_aux(aux, aux_frames);
            heard = heard || loud(left) || loud(right) || aux.iter().any(|(aux_left, aux_right)| loud(aux_left) || loud(aux_right));
            if schedule_block(&clock.context, clock.sample_rate, left, right, aux, when).is_err() {
                break;
            }
            clock.frames_rendered += BLOCK_FRAMES as u64;
        }
        clock.renderer = Some(renderer);
        let rendered = clock.frames_rendered - rendered_from;
        settle(clock, rendered, heard);
    });
}

// The graph's extra pairs for this block, as (left, right) channel arrays;
// the arrays are made again only when the number of pairs changes.
fn drain_aux(out: &mut Vec<(Vec<f32>, Vec<f32>)>, frames: &mut [kira::Frame]) {
    let pairs = AUX_PAIRS.with(Cell::get);
    AUX.with(|slot| {
        let slot = slot.borrow();
        let Some(aux) = slot.as_ref() else {
            out.clear();
            return;
        };
        out.resize_with(pairs, || (vec![0.0; BLOCK_FRAMES], vec![0.0; BLOCK_FRAMES]));
        for (index, (left, right)) in out.iter_mut().enumerate() {
            aux.drain_pair(index as u16 + 1, frames);
            for ((frame, left), right) in frames.iter().zip(left.iter_mut()).zip(right.iter_mut()) {
                *left = frame.left;
                *right = frame.right;
            }
        }
    });
}

fn schedule_block(
    context: &AudioContext,
    sample_rate: f64,
    left: &mut [f32],
    right: &mut [f32],
    aux: &mut [(Vec<f32>, Vec<f32>)],
    when: f64,
) -> Result<(), JsValue> {
    let buffer = context.create_buffer((CHANNELS + aux.len() * 2) as u32, BLOCK_FRAMES as u32, sample_rate as f32)?;
    buffer.copy_to_channel(left, 0)?;
    buffer.copy_to_channel(right, 1)?;
    for (index, (aux_left, aux_right)) in aux.iter_mut().enumerate() {
        buffer.copy_to_channel(aux_left, (CHANNELS + index * 2) as i32)?;
        buffer.copy_to_channel(aux_right, (CHANNELS + index * 2 + 1) as i32)?;
    }
    let source = context.create_buffer_source()?;
    source.set_buffer(Some(&buffer));
    source.connect_with_audio_node(&context.destination())?;
    source.start_with_when(when)?;
    Ok(())
}

// The frame the next started voice will begin on (a voice started now is
// mixed from the first frame of the next rendered block).
pub fn next_render_frame() -> f64 {
    CLOCK.with(|cell| cell.borrow().as_ref().map(|clock| clock.frames_rendered as f64).unwrap_or(-1.0))
}

pub fn shared_context() -> Option<AudioContext> {
    CLOCK.with(|cell| cell.borrow().as_ref().map(|clock| clock.context.clone()))
}

// Snapshot of the render clock: rendered frame `n` is played at context frame
// `base + n`, with the base of the segment `n` falls in (`base_segments`, flat
// [from_frame, base, ...]; a new segment starts at each discontinuity).
// Whoever follows the clock (a playhead, a session's beeps) keeps the engine
// rendering, and reads it caught up; an engine asleep is woken by `wake` first.
pub fn render_clock() -> js_sys::Object {
    CLOCK.with(|cell| if let Some(clock) = cell.borrow_mut().as_mut() { clock.quiet_frames = 0 });
    render_ahead();
    let snapshot = js_sys::Object::new();
    CLOCK.with(|cell| {
        if let Some(clock) = cell.borrow().as_ref() {
            let set = |key: &str, value: f64| {
                let _ = js_sys::Reflect::set(&snapshot, &JsValue::from_str(key), &JsValue::from_f64(value));
            };
            set("frames_rendered", clock.frames_rendered as f64);
            set("base_context_frame", clock.base_context_frame);
            set("sample_rate", clock.sample_rate);
            set("discontinuities", clock.discontinuities as f64);
            set("block_frames", BLOCK_FRAMES as f64);
            let segments = js_sys::Float64Array::new_with_length((clock.segments.len() * 2) as u32);
            for (index, (from, base)) in clock.segments.iter().enumerate() {
                segments.set_index((index * 2) as u32, *from as f64);
                segments.set_index((index * 2 + 1) as u32, *base);
            }
            let _ = js_sys::Reflect::set(&snapshot, &JsValue::from_str("base_segments"), &segments);
        }
    });
    snapshot
}
