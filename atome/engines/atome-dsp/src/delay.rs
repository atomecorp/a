// Delay line (fractional read) and the stereo echo effect built on it. The
// ring is sized once in `prepare`; changing the time never reallocates. The
// echo runs free or on the project tempo, clean (digital), worn (tape: wow,
// flutter, saturated and darkening repeats) or bouncing between the sides.
// Synced, it follows the song's tempo where the transport plays (its tempo map,
// R-367), else the host's `tempo_bpm`.

use crate::biquad::{Coefficients, Section, Shape};
use crate::{ParamSpec, Processor, Smoothed, StereoBlock, Transport, Unit, db_to_amplitude};

pub struct DelayLine {
    ring: Vec<f32>,
    write: usize,
}

impl DelayLine {
    pub fn new() -> Self {
        Self {
            ring: Vec::new(),
            write: 0,
        }
    }

    pub fn allocate(&mut self, max_frames: usize) {
        self.ring = vec![0.0; max_frames.max(1) + 2];
        self.write = 0;
    }

    pub fn capacity(&self) -> usize {
        self.ring.len().saturating_sub(2)
    }

    #[inline]
    pub fn push(&mut self, sample: f32) {
        self.ring[self.write] = sample;
        self.write = (self.write + 1) % self.ring.len();
    }

    // Linear interpolation `delay` frames behind the last pushed sample.
    #[inline]
    pub fn read(&self, delay: f32) -> f32 {
        let length = self.ring.len();
        let delay = delay.clamp(1.0, self.capacity() as f32);
        let whole = delay.floor();
        let fraction = delay - whole;
        let index = (self.write + length - whole as usize) % length;
        let previous = (index + length - 1) % length;
        self.ring[index] * (1.0 - fraction) + self.ring[previous] * fraction
    }

    // Four-point Hermite interpolation: a modulated read (chorus, flanger, a
    // reverb's moving lines) keeps its treble, where a linear read dulls it.
    #[inline]
    pub fn read_cubic(&self, delay: f32) -> f32 {
        let length = self.ring.len();
        let delay = delay.clamp(2.0, (self.capacity() as f32 - 1.0).max(2.0));
        let whole = delay.floor();
        let t = delay - whole;
        let newer = (self.write + length - whole as usize + 1) % length;
        let at = |offset: usize| self.ring[(newer + length - offset) % length];
        let (y0, y1, y2, y3) = (at(0), at(1), at(2), at(3));
        let c1 = 0.5 * (y2 - y0);
        let c2 = y0 - 2.5 * y1 + 2.0 * y2 - 0.5 * y3;
        let c3 = 0.5 * (y3 - y0) + 1.5 * (y1 - y2);
        ((c3 * t + c2) * t + c1) * t + y1
    }

    pub fn clear(&mut self) {
        self.ring.fill(0.0);
    }
}

impl Default for DelayLine {
    fn default() -> Self {
        Self::new()
    }
}

pub const TIME_MS: u32 = 0;
pub const FEEDBACK_DB: u32 = 1;
pub const DAMPING_HZ: u32 = 2;
pub const MIX: u32 = 3;
pub const SYNC: u32 = 4;
pub const TEMPO_BPM: u32 = 5;
pub const MODE: u32 = 6;
pub const PARAMS: [ParamSpec; 7] = [
    ParamSpec::new(TIME_MS, "time_ms", 1.0, 2000.0, 377.0, Unit::Milliseconds),
    ParamSpec::new(
        FEEDBACK_DB,
        "feedback_db",
        -60.0,
        -0.5,
        -9.0,
        Unit::Decibels,
    ),
    ParamSpec::new(
        DAMPING_HZ,
        "damping_hz",
        500.0,
        20000.0,
        8000.0,
        Unit::Hertz,
    ),
    ParamSpec::new(MIX, "mix", 0.0, 1.0, 0.34, Unit::Percent),
    // `free` follows `time_ms`; a note value follows `tempo_bpm`.
    ParamSpec::choice(
        SYNC,
        "sync",
        &["free", "1_4", "1_8", "1_8d", "1_16", "1_4t"],
        0,
    ),
    // Written by the host from the project tempo.
    ParamSpec::new(TEMPO_BPM, "tempo_bpm", 20.0, 300.0, 120.0, Unit::Count),
    ParamSpec::choice(MODE, "mode", &["digital", "tape", "ping_pong"], 0),
];
// Beats of each `sync` choice (a quarter note is one beat).
const SYNC_BEATS: [f32; 6] = [0.0, 1.0, 0.5, 0.75, 0.25, 2.0 / 3.0];
// A quarter note at the slowest tempo.
const MAX_TIME_MS: f32 = 3000.0;
// Tape transport: slow wow and fast flutter, as delay excursions.
const WOW_HZ: f32 = 0.5;
const WOW_MS: f32 = 0.55;
const FLUTTER_HZ: f32 = 8.0;
const FLUTTER_MS: f32 = 0.021;
// Each tape repeat loses treble and the lowest bass, then meets the tape curve.
const TAPE_LOW_PASS_HZ: f32 = 4400.0;
const TAPE_HIGH_PASS_HZ: f32 = 89.0;
const TAPE_DRIVE: f32 = 1.3;
// A mode change fades the repeats out and back in over this time.
const SWITCH_MS: f32 = 13.0;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Mode {
    Digital,
    Tape,
    PingPong,
}

impl Mode {
    fn from_index(index: usize) -> Self {
        match index {
            1 => Self::Tape,
            2 => Self::PingPong,
            _ => Self::Digital,
        }
    }
}

fn one_pole(sample_rate: f32, frequency: f32) -> f32 {
    1.0 - (-std::f32::consts::TAU * frequency / sample_rate).exp()
}

pub struct Echo {
    sample_rate: f32,
    time: Smoothed,
    free_ms: f32,
    sync: usize,
    tempo_bpm: f32,
    // The tempo where the transport plays now; none while it is stopped.
    playing_bpm: Option<f32>,
    feedback: f32,
    mix: Smoothed,
    damping: Coefficients,
    damping_hz: f32,
    lines: [DelayLine; 2],
    filters: [Section; 2],
    mode: Mode,
    next_mode: Mode,
    fade: f32,
    fade_step: f32,
    wow_phase: f32,
    flutter_phase: f32,
    tape_low_pass: f32,
    tape_high_pass: f32,
    tape_state: [[f32; 2]; 2],
}

impl Echo {
    pub fn new() -> Self {
        Self {
            sample_rate: 48000.0,
            time: Smoothed::new(PARAMS[0].default, 89.0),
            free_ms: PARAMS[0].default,
            sync: PARAMS[4].default as usize,
            tempo_bpm: PARAMS[5].default,
            playing_bpm: None,
            feedback: db_to_amplitude(PARAMS[1].default),
            mix: Smoothed::new(PARAMS[3].default, 10.0),
            damping: Coefficients::default(),
            damping_hz: PARAMS[2].default,
            lines: [DelayLine::new(), DelayLine::new()],
            filters: [Section::default(); 2],
            mode: Mode::Digital,
            next_mode: Mode::Digital,
            fade: 1.0,
            fade_step: 1.0,
            wow_phase: 0.0,
            flutter_phase: 0.25,
            tape_low_pass: 0.0,
            tape_high_pass: 0.0,
            tape_state: [[0.0; 2]; 2],
        }
    }

    fn design_damping(&mut self) {
        self.damping = Coefficients::design(
            Shape::LowPass,
            self.sample_rate,
            self.damping_hz,
            0.707,
            0.0,
        );
    }

    // The delay the echo aims at: its own time, or a note at the tempo.
    fn time_ms(&self) -> f32 {
        match SYNC_BEATS[self.sync] {
            0.0 => self.free_ms,
            beats => {
                (60000.0 / self.playing_bpm.unwrap_or(self.tempo_bpm) * beats).min(MAX_TIME_MS)
            }
        }
    }

    // A tape repeat: darker and thinner on each pass, rounded by the tape.
    #[inline]
    fn wear(&mut self, channel: usize, repeat: f32) -> f32 {
        let state = &mut self.tape_state[channel];
        state[0] += self.tape_low_pass * (repeat - state[0]);
        state[1] += self.tape_high_pass * (state[0] - state[1]);
        let thin = state[0] - state[1];
        (thin * TAPE_DRIVE).tanh() / TAPE_DRIVE
    }

    // The repeats fade out, the mode changes in silence, then they come back.
    #[inline]
    fn follow_mode(&mut self) -> f32 {
        if self.mode != self.next_mode {
            self.fade = (self.fade - self.fade_step).max(0.0);
            if self.fade == 0.0 {
                self.mode = self.next_mode;
            }
        } else if self.fade < 1.0 {
            self.fade = (self.fade + self.fade_step).min(1.0);
        }
        self.fade
    }
}

impl Default for Echo {
    fn default() -> Self {
        Self::new()
    }
}

impl Processor for Echo {
    fn prepare(&mut self, sample_rate: f32, _max_block: usize) {
        self.sample_rate = sample_rate;
        self.time.prepare(sample_rate);
        self.mix.prepare(sample_rate);
        let frames = ((MAX_TIME_MS + WOW_MS + FLUTTER_MS) * 0.001 * sample_rate).ceil() as usize;
        for line in &mut self.lines {
            line.allocate(frames + 2);
        }
        self.fade_step = 1.0 / (SWITCH_MS * 0.001 * sample_rate);
        self.tape_low_pass = one_pole(sample_rate, TAPE_LOW_PASS_HZ);
        self.tape_high_pass = one_pole(sample_rate, TAPE_HIGH_PASS_HZ);
        self.design_damping();
    }

    fn process(&mut self, block: &mut StereoBlock) {
        let frames_per_ms = self.sample_rate * 0.001;
        let wow_step = WOW_HZ / self.sample_rate;
        let flutter_step = FLUTTER_HZ / self.sample_rate;
        for index in 0..block.frames() {
            let mut delay = self.time.tick() * frames_per_ms;
            let mix = self.mix.tick();
            let fade = self.follow_mode();
            let (dry_left, dry_right) = (block.left[index], block.right[index]);
            let (echo_left, echo_right) = match self.mode {
                Mode::Digital | Mode::Tape => {
                    let tape = self.mode == Mode::Tape;
                    if tape {
                        self.wow_phase = (self.wow_phase + wow_step).fract();
                        self.flutter_phase = (self.flutter_phase + flutter_step).fract();
                        let wow = (std::f32::consts::TAU * self.wow_phase).sin();
                        let flutter = (std::f32::consts::TAU * self.flutter_phase).sin();
                        delay += (WOW_MS * wow + FLUTTER_MS * flutter) * frames_per_ms;
                    }
                    let mut echoes = [0.0; 2];
                    for (channel, dry) in [dry_left, dry_right].into_iter().enumerate() {
                        let echo = self.lines[channel].read(delay);
                        // Only the repeats are damped, so the first echo lands exactly on time.
                        let mut repeat =
                            self.filters[channel].tick(&self.damping, echo * self.feedback);
                        if tape {
                            repeat = self.wear(channel, repeat);
                        }
                        self.lines[channel].push(dry + repeat);
                        echoes[channel] = echo;
                    }
                    (echoes[0], echoes[1])
                }
                Mode::PingPong => {
                    // The sum enters on the left; each repeat crosses to the other side.
                    let echo_left = self.lines[0].read(delay);
                    let echo_right = self.lines[1].read(delay);
                    let to_left = self.filters[0].tick(&self.damping, echo_right * self.feedback);
                    let to_right = self.filters[1].tick(&self.damping, echo_left * self.feedback);
                    self.lines[0].push((dry_left + dry_right) * 0.5 + to_left);
                    self.lines[1].push(to_right);
                    (echo_left, echo_right)
                }
            };
            let wet = mix * fade;
            block.left[index] = dry_left * (1.0 - mix) + echo_left * wet;
            block.right[index] = dry_right * (1.0 - mix) + echo_right * wet;
        }
    }

    fn set_param(&mut self, id: u32, value: f32) {
        let Some(spec) = PARAMS.get(id as usize) else {
            return;
        };
        let value = spec.clamp(value);
        match id {
            TIME_MS => self.free_ms = value,
            FEEDBACK_DB => self.feedback = db_to_amplitude(value),
            DAMPING_HZ => {
                self.damping_hz = value;
                self.design_damping();
            }
            MIX => self.mix.set(value),
            SYNC => self.sync = spec.index(value),
            TEMPO_BPM => self.tempo_bpm = value,
            MODE => self.next_mode = Mode::from_index(spec.index(value)),
            _ => {}
        }
        if matches!(id, TIME_MS | SYNC | TEMPO_BPM) {
            self.time.set(self.time_ms());
        }
    }

    fn params(&self) -> &'static [ParamSpec] {
        &PARAMS
    }

    fn set_transport(&mut self, transport: &Transport) {
        let bpm = transport
            .playing
            .then_some((transport.beats_per_second * 60.0) as f32)
            .filter(|bpm| bpm.is_finite() && *bpm > 0.0);
        if bpm != self.playing_bpm {
            self.playing_bpm = bpm;
            self.time.set(self.time_ms());
        }
    }

    // The echo rings until its feedback has fallen 60 dB.
    fn tail_frames(&self) -> u32 {
        let repeats = (-60.0 / PARAMS[1].clamp(crate::amplitude_to_db(self.feedback)))
            .ceil()
            .max(1.0);
        (repeats * (self.time.target() + WOW_MS) * 0.001 * self.sample_rate) as u32
    }

    fn reset(&mut self) {
        self.time.settle();
        self.mix.settle();
        self.mode = self.next_mode;
        self.fade = 1.0;
        self.tape_state = [[0.0; 2]; 2];
        for line in &mut self.lines {
            line.clear();
        }
        for filter in &mut self.filters {
            filter.reset();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // A quarter note synced: the host's tempo at rest, the song's while it plays.
    #[test]
    fn a_synced_echo_follows_the_tempo_where_the_song_plays() {
        let mut echo = Echo::new();
        echo.set_param(SYNC, 1.0);
        echo.set_param(TEMPO_BPM, 120.0);
        assert_eq!(echo.time.target(), 500.0);
        let playing = |bpm: f64| Transport {
            playing: true,
            beat: 0.0,
            beats_per_second: bpm / 60.0,
        };
        echo.set_transport(&playing(60.0));
        assert_eq!(echo.time.target(), 1000.0);
        echo.set_transport(&playing(90.0));
        assert!((echo.time.target() - 666.666_7).abs() < 0.01);
        echo.set_transport(&Transport {
            playing: false,
            ..playing(90.0)
        });
        assert_eq!(echo.time.target(), 500.0);
    }
}
