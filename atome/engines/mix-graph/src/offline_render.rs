// A project rendered offline (R-349: a shared project's light proxy): its mix
// program, instruments, voices and notes played through the same Kira host as
// the realtime engines (`MixHost`, one sub-track per strip, the graph on the
// main track), with no audio device, as fast as the machine goes. Its own
// `AudioManager` on a backend that only keeps Kira's `Renderer`, its own
// clips: no global engine state is touched. Each call renders the frames asked,
// split at the frames where voices are due (as the native and Web scheduled
// backends' `render_block`), notes dated on the instruments' rendered-frame
// clock, so the render does not depend on the size of the blocks asked.

use crate::dsp_module::AssetStore;
use crate::host::MixHost;
use crate::instrument_command::{NoteKind, event_kind};
use crate::voice::{ScheduledVoice, build_voice_sound};
use crate::{InstrumentSpec, Program, SampleData};
use kira::backend::{Backend, Renderer};
use kira::sound::static_sound::StaticSoundData;
use kira::{AudioManager, AudioManagerSettings, Capacities, Frame};
use serde::Deserialize;
use std::collections::{HashMap, HashSet};
use std::sync::{Arc, Mutex};

const CHANNELS: usize = 2;
// Frames a `render_offline` call asks at a time.
const BLOCK_FRAMES: usize = 4_096;
// Kira's own processing chunk, the realtime engines' default.
const INTERNAL_BUFFER_FRAMES: usize = 128;
// Notes queued on an instrument's ring before the frames they fall in are rendered (its ring holds 1024).
const EVENT_BATCH: usize = 512;
// The longest render: three hours.
const MAX_SECONDS: u64 = 3 * 3_600;

/// A note of the plan, at `frame` of the render (the instruments' clock starts with it).
#[derive(Clone, Debug, Deserialize)]
pub struct PlannedEvent {
    pub instrument_id: String,
    pub frame: u64,
    pub event: NoteKind,
}

/// What a project plays, as the page compiles it: the mix program, the
/// instruments its strips play, its voices on their start frames (the
/// `schedule_instances` voices) and its notes.
#[derive(Clone, Debug, Deserialize)]
pub struct RenderPlan {
    pub rate: u32,
    pub duration_frames: u64,
    #[serde(default)]
    pub program: Program,
    #[serde(default)]
    pub instruments: Vec<InstrumentSpec>,
    #[serde(default)]
    pub voices: Vec<ScheduledVoice>,
    #[serde(default)]
    pub events: Vec<PlannedEvent>,
}

/// The decoded sounds a plan names: clips by asset id, an instrument's samples by sample id,
/// and the assets its `dsp` modules read (a capture, an impulse response) by asset id.
#[derive(Clone, Default)]
pub struct ClipStore {
    pub clips: HashMap<String, StaticSoundData>,
    pub samples: HashMap<String, SampleData>,
    pub assets: AssetStore,
}

/// A stereo render (Kira's main output, clipped to ±1 as a device plays it).
#[derive(Clone, Debug, PartialEq)]
pub struct RenderedAudio {
    pub rate: u32,
    pub frames: Vec<[f32; 2]>,
}

type RendererSlot = Arc<Mutex<Option<Renderer>>>;

// A Kira backend with no device: it hands its renderer to the offline render.
struct OfflineBackend {
    slot: RendererSlot,
}

impl Backend for OfflineBackend {
    type Settings = (u32, RendererSlot);
    type Error = String;

    fn setup(
        (rate, slot): Self::Settings,
        _internal_buffer_size: usize,
    ) -> Result<(Self, u32), String> {
        Ok((Self { slot }, rate))
    }

    fn start(&mut self, renderer: Renderer) -> Result<(), String> {
        *self
            .slot
            .lock()
            .map_err(|error| format!("offline renderer lock: {error}"))? = Some(renderer);
        Ok(())
    }
}

fn invalid(reason: impl std::fmt::Display) -> String {
    format!("render_plan_invalid:{reason}")
}

/// A plan being rendered, the frames asked at each `render_into`.
pub struct OfflineRenderer {
    manager: AudioManager<OfflineBackend>,
    renderer: Renderer,
    host: MixHost,
    clips: HashMap<String, StaticSoundData>,
    voices: Vec<ScheduledVoice>,
    next_voice: usize,
    events: Vec<PlannedEvent>,
    next_event: usize,
    duration: u64,
    cursor: u64,
    buffer: Vec<f32>,
}

impl OfflineRenderer {
    pub fn new(plan: &RenderPlan, store: &ClipStore) -> Result<Self, String> {
        if !(8_000..=384_000).contains(&plan.rate) {
            return Err(invalid(format_args!("rate {}", plan.rate)));
        }
        if plan.duration_frames == 0 || plan.duration_frames > MAX_SECONDS * u64::from(plan.rate) {
            return Err(invalid(format_args!(
                "duration_frames {}",
                plan.duration_frames
            )));
        }
        let strips: HashSet<&str> = plan
            .program
            .strips
            .iter()
            .map(|strip| strip.id.as_str())
            .collect();
        let mut clips = HashMap::new();
        for voice in &plan.voices {
            if let Some(strip) = voice.strip_id.as_deref().filter(|id| !id.is_empty())
                && !strips.contains(strip)
            {
                return Err(invalid(format_args!(
                    "voice {} plays on strip {strip}, which the program has not",
                    voice.voice_id
                )));
            }
            let data = store
                .clips
                .get(&voice.asset_id)
                .ok_or_else(|| format!("render_asset_missing:{}", voice.asset_id))?;
            clips.insert(voice.asset_id.clone(), data.clone());
        }
        let mut host = MixHost::new();
        let slot = RendererSlot::default();
        let mut manager = AudioManager::<OfflineBackend>::new(AudioManagerSettings {
            capacities: Capacities::default(),
            main_track_builder: host.main_track_builder(),
            internal_buffer_size: INTERNAL_BUFFER_FRAMES,
            backend_settings: (plan.rate, slot.clone()),
        })?;
        let renderer = slot
            .lock()
            .map_err(|error| format!("offline renderer lock: {error}"))?
            .take()
            .ok_or("offline render backend gave no renderer")?;
        let graph = host.graph_mut();
        for (sample_id, data) in &store.samples {
            graph.instruments().load_sample(sample_id, data.clone());
        }
        for (asset_id, asset) in &store.assets {
            graph.load_asset(asset_id, asset.clone());
        }
        for spec in &plan.instruments {
            graph.set_instrument(spec.clone()).map_err(invalid)?;
        }
        host.apply(&mut manager, plan.program.clone())
            .map_err(invalid)?;
        let mut voices = plan.voices.clone();
        voices.sort_by_key(|voice| voice.start_render_frame);
        let mut events = plan.events.clone();
        events.sort_by_key(|event| event.frame);
        Ok(Self {
            manager,
            renderer,
            host,
            clips,
            voices,
            next_voice: 0,
            events,
            next_event: 0,
            duration: plan.duration_frames,
            cursor: 0,
            buffer: Vec::new(),
        })
    }

    /// Its graph, to act on it between two renders (R-370: a strip frozen or thawed).
    pub fn graph_mut(&mut self) -> &mut crate::MixGraph {
        self.host.graph_mut()
    }

    /// The next frames into `out`: how many were rendered, 0 once the plan is over.
    pub fn render_into(&mut self, out: &mut [Frame]) -> Result<usize, String> {
        let length = (out.len() as u64).min(self.duration - self.cursor) as usize;
        let end = self.cursor + length as u64;
        self.buffer.clear();
        self.buffer.resize(length * CHANNELS, 0.0);
        let mut at = self.cursor;
        while at < end {
            self.start_voices(at)?;
            let due = self
                .voices
                .get(self.next_voice)
                .map_or(end, |voice| voice.start_render_frame.min(end));
            let next = self.queue_events(at, due)?;
            let from = (at - self.cursor) as usize * CHANNELS;
            let to = (next - self.cursor) as usize * CHANNELS;
            self.renderer.on_start_processing();
            self.renderer
                .process(&mut self.buffer[from..to], CHANNELS as u16);
            at = next;
        }
        for (frame, pair) in out.iter_mut().zip(self.buffer.chunks_exact(CHANNELS)) {
            *frame = Frame::new(pair[0], pair[1]);
        }
        self.cursor = end;
        Ok(length)
    }

    // The voices due at `at` start on their strip, picked up by the next piece's `on_start_processing`.
    fn start_voices(&mut self, at: u64) -> Result<(), String> {
        while let Some(voice) = self
            .voices
            .get(self.next_voice)
            .filter(|voice| voice.start_render_frame <= at)
        {
            let data = self
                .clips
                .get(&voice.asset_id)
                .ok_or_else(|| format!("render_asset_missing:{}", voice.asset_id))?;
            let sound = build_voice_sound(data.clone(), &voice.voice)
                .map_err(|error| invalid(format_args!("voice {}: {error}", voice.voice_id)))?;
            self.host
                .route_voice(&voice.voice_id, voice.strip_id.as_deref());
            self.host
                .play(&mut self.manager, &voice.voice_id, sound)
                .map_err(|error| invalid(format_args!("voice {}: {error}", voice.voice_id)))?;
            self.next_voice += 1;
        }
        Ok(())
    }

    // The notes before `until` go on their instrument's dated ring; a batch full ends the piece at the next note.
    fn queue_events(&mut self, at: u64, until: u64) -> Result<u64, String> {
        let mut queued = 0;
        while let Some(event) = self
            .events
            .get(self.next_event)
            .filter(|event| event.frame < until)
        {
            if queued == EVENT_BATCH {
                if event.frame <= at {
                    return Err(invalid(format_args!(
                        "more than {EVENT_BATCH} notes at frame {at}"
                    )));
                }
                return Ok(event.frame);
            }
            self.host
                .graph()
                .instruments_ref()
                .event(
                    &event.instrument_id,
                    event_kind(event.event)?,
                    Some(event.frame),
                )
                .map_err(invalid)?;
            queued += 1;
            self.next_event += 1;
        }
        Ok(until)
    }
}

/// The whole plan rendered.
pub fn render_offline(plan: &RenderPlan, store: &ClipStore) -> Result<RenderedAudio, String> {
    let mut renderer = OfflineRenderer::new(plan, store)?;
    let mut frames = Vec::with_capacity(plan.duration_frames.min(1 << 22) as usize);
    let mut block = vec![Frame::ZERO; BLOCK_FRAMES];
    loop {
        let rendered = renderer.render_into(&mut block)?;
        if rendered == 0 {
            break;
        }
        frames.extend(
            block[..rendered]
                .iter()
                .map(|frame| [frame.left, frame.right]),
        );
    }
    Ok(RenderedAudio {
        rate: plan.rate,
        frames,
    })
}
