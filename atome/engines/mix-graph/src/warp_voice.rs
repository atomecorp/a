// A warped timeline voice (todo/timeline/sequenceur_pro_2026-11-15.md item 30, mockup M10; JS kernel/warp.js): the
// clip's source is read through a time map — `[clip_seconds, source_seconds]` anchors, one speed between two — and
// at a pitch of its own, the stretcher (atome-instrument stretch.rs, Signalsmith) keeping the length the map asks.
// The source is read at the pitch by the instrument's windowed sinc; the stretcher then lengthens by
// pitch ÷ speed. Its latency is never heard: at the voice's start it is primed from the source (stretch.rs).
// The voice's level, pan, live volume and stop are those of a Kira static sound playing a constant 1 the warped
// frames are multiplied by, so a warped voice answers its handle like every other voice.
// The stretcher is pure Rust: a warped voice plays the same on the Web (wasm32), Tauri and iOS.

use crate::voice::{VoiceRequest, VoiceSound};
use atome_instrument::interp::{SincTables, TAPS, dot, first_tap};
use atome_instrument::stretch::VoiceStretch;
use kira::info::Info;
use kira::sound::Sound;
use kira::sound::static_sound::StaticSoundData;
use kira::{Decibels, Frame, Panning};
use serde::Deserialize;
use std::sync::{Arc, OnceLock};

#[derive(Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct VoiceWarp {
    // Increasing in both: the first at clip time 0, the last at the clip's end.
    pub points: Vec<[f64; 2]>,
    #[serde(default)]
    pub pitch_semitones: f64,
}

// Speeds a window of the map may play at (kernel STRETCH_MIN_RATIO..STRETCH_MAX_RATIO), and the pitch range.
const SLOWEST: f64 = 0.25;
const FASTEST: f64 = 4.0;
const PITCH_SEMITONES: f64 = 24.0;

impl VoiceWarp {
    pub fn validate(&self, source_duration: f64) -> Result<(), String> {
        if self.points.len() < 2 {
            return Err("a warp map has two anchors at least".to_string());
        }
        if !self.pitch_semitones.is_finite() || self.pitch_semitones.abs() > PITCH_SEMITONES {
            return Err("warp pitch_semitones must lie within ±24".to_string());
        }
        if self.points[0][0] != 0.0 {
            return Err("a warp map starts at clip time 0".to_string());
        }
        for pair in self.points.windows(2) {
            let [[clip_from, source_from], [clip_to, source_to]] = [pair[0], pair[1]];
            if ![clip_from, source_from, clip_to, source_to]
                .iter()
                .all(|v| v.is_finite())
            {
                return Err("warp anchors must be finite".to_string());
            }
            if clip_to <= clip_from || source_to <= source_from || source_from < 0.0 {
                return Err("warp anchors increase in clip and in source time".to_string());
            }
            let speed = (source_to - source_from) / (clip_to - clip_from);
            if !(SLOWEST - 1e-9..=FASTEST + 1e-9).contains(&speed) {
                return Err(format!(
                    "a warp window plays at ×{speed:.3}, beyond ×0.25..×4"
                ));
            }
        }
        if self.points[self.points.len() - 1][1] > source_duration + 1e-6 {
            return Err("the warp map reads past its source".to_string());
        }
        Ok(())
    }

    // The source seconds heard at clip time `t`, and the speed there (source seconds per clip second).
    pub fn locate(&self, t: f64) -> (f64, f64) {
        let last = self.points.len() - 1;
        let index = self.points[..last]
            .iter()
            .rposition(|point| point[0] <= t)
            .unwrap_or(0);
        let [clip_from, source_from] = self.points[index];
        let [clip_to, source_to] = self.points[index + 1];
        let speed = (source_to - source_from) / (clip_to - clip_from);
        (source_from + (t - clip_from) * speed, speed)
    }

    pub fn end_seconds(&self) -> f64 {
        self.points[self.points.len() - 1][0]
    }

    pub fn pitch_ratio(&self) -> f64 {
        2f64.powf(self.pitch_semitones / 12.0)
    }
}

// Frames rendered per stretcher call.
const CHUNK: usize = 256;
// The constant the level's static sound plays, looped.
const LEVEL_FRAMES: usize = 1024;

static TABLES: OnceLock<SincTables> = OnceLock::new();

pub struct WarpPlan {
    source: Arc<[Frame]>,
    source_rate: u32,
    warp: VoiceWarp,
    start_seconds: f64,
}

// The voice's sound: its level a looped constant carrying gain and pan, its frames read through the map.
pub fn warped_voice(
    data: StaticSoundData,
    request: &VoiceRequest,
    warp: &VoiceWarp,
) -> Result<VoiceSound, String> {
    if request.reverse {
        return Err("a warped clip is not played backwards".to_string());
    }
    if request.loop_start_seconds.is_some() || request.loop_end_seconds.is_some() {
        return Err("a warped clip does not loop its source".to_string());
    }
    if data.sample_rate == 0 {
        return Err("Clip sample rate is zero".to_string());
    }
    if !request.gain.is_finite() {
        return Err("gain must be finite".to_string());
    }
    warp.validate(data.frames.len() as f64 / data.sample_rate as f64)?;
    let envelope = request.envelope.filter(|envelope| {
        envelope.duration_seconds.is_finite() && envelope.duration_seconds > 0.0
    });
    let level = StaticSoundData {
        sample_rate: data.sample_rate,
        frames: vec![Frame::from_mono(1.0); LEVEL_FRAMES].into(),
        settings: Default::default(),
        slice: None,
    }
    .loop_region(..)
    .volume(Decibels(
        (20.0 * request.gain.clamp(0.000_001, 16.0).log10()) as f32,
    ))
    .panning(Panning(request.pan.clamp(-1.0, 1.0) as f32));
    Ok(VoiceSound {
        data: level,
        envelope,
        control: None,
        warp: Some(WarpPlan {
            source: data.frames.clone(),
            source_rate: data.sample_rate,
            warp: warp.clone(),
            start_seconds: envelope.map_or(0.0, |envelope| envelope.offset_seconds.max(0.0)),
        }),
    })
}

pub fn warped_sound(level: Box<dyn Sound>, plan: WarpPlan) -> Box<dyn Sound> {
    let stretcher = VoiceStretch::new(CHUNK);
    let capacity = stretcher.input_capacity();
    Box::new(WarpedSound {
        level,
        pitch: plan.warp.pitch_ratio(),
        clock: plan.start_seconds,
        end: plan.warp.end_seconds(),
        plan,
        reader: 0.0,
        stretcher,
        input_left: vec![0.0; capacity],
        input_right: vec![0.0; capacity],
        out_left: vec![0.0; CHUNK],
        out_right: vec![0.0; CHUNK],
        primed: false,
        ringing: 0,
    })
}

struct WarpedSound {
    level: Box<dyn Sound>,
    plan: WarpPlan,
    pitch: f64,
    // Clip seconds of the next frame heard, and of the map's end.
    clock: f64,
    end: f64,
    // Source frame the reader reads next.
    reader: f64,
    stretcher: VoiceStretch,
    input_left: Vec<f32>,
    input_right: Vec<f32>,
    out_left: Vec<f32>,
    out_right: Vec<f32>,
    primed: bool,
    // Frames rendered past the map's end (the stretcher's tail).
    ringing: usize,
}

impl WarpedSound {
    // The stretcher's factor at clip time `t`: output over reader frames.
    fn factor_at(&self, t: f64) -> f32 {
        let (_, speed) = self.plan.warp.locate(t.min(self.end));
        VoiceStretch::ratio((self.pitch / speed) as f32, 1.0)
    }

    // `frames` reader frames from the reader's place, at the pitch, into the input buffers.
    fn read(&mut self, frames: usize, dt: f64) {
        let step = self.pitch * self.plan.source_rate as f64 * dt;
        let tables = TABLES.get_or_init(SincTables::new);
        let band = tables.band(step);
        let source = &self.plan.source;
        let length = source.len() as i64;
        for index in 0..frames {
            let base = self.reader.floor();
            let weights = atome_instrument::interp::weights(band, self.reader - base);
            let first = first_tap(base as i64);
            let mut left = [0.0f32; TAPS];
            let mut right = [0.0f32; TAPS];
            for tap in 0..TAPS {
                let at = first + tap as i64;
                if (0..length).contains(&at) {
                    let frame = source[at as usize];
                    left[tap] = frame.left;
                    right[tap] = frame.right;
                }
            }
            self.input_left[index] = dot(&weights, &left);
            self.input_right[index] = dot(&weights, &right);
            self.reader += step;
        }
    }

    // At the voice's first frame: the reader at the source heard there, the stretcher fed and its latency dropped.
    fn prime(&mut self, dt: f64) {
        let (source, _) = self.plan.warp.locate(self.clock.min(self.end));
        self.reader = source * self.plan.source_rate as f64;
        let factor = self.factor_at(self.clock);
        let (opening, ahead) = self.stretcher.priming_frames(factor);
        self.read(opening + ahead, dt);
        self.stretcher.prime(
            (&self.input_left[..opening], &self.input_right[..opening]),
            (
                &self.input_left[opening..opening + ahead],
                &self.input_right[opening..opening + ahead],
            ),
            factor,
        );
        self.primed = true;
    }

    fn render(&mut self, frames: usize, dt: f64) {
        if !self.primed {
            self.prime(dt);
        }
        let factor = self.factor_at(self.clock + frames as f64 * dt * 0.5);
        let input = self.stretcher.input_for(frames, factor);
        self.read(input, dt);
        self.stretcher.process(
            (&self.input_left[..input], &self.input_right[..input]),
            &mut self.out_left[..frames],
            &mut self.out_right[..frames],
        );
        self.clock += frames as f64 * dt;
        if self.clock > self.end {
            self.ringing += frames;
        }
    }
}

impl Sound for WarpedSound {
    fn on_start_processing(&mut self) {
        self.level.on_start_processing();
    }

    fn process(&mut self, out: &mut [Frame], dt: f64, info: &Info) {
        self.level.process(out, dt, info);
        for chunk in out.chunks_mut(CHUNK) {
            self.render(chunk.len(), dt);
            for (index, frame) in chunk.iter_mut().enumerate() {
                frame.left *= self.out_left[index];
                frame.right *= self.out_right[index];
            }
        }
    }

    // Once the map is over and the stretcher has rung out, or when the voice was stopped.
    fn finished(&self) -> bool {
        self.level.finished() || self.ringing >= self.stretcher.tail_frames()
    }
}
