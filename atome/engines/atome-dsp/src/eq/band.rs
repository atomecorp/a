// One band of the EQ: its smoothed parameters, crossfaded switch and type
// changes, dynamic detector and the filter it runs for both channels.

use super::svf::{Design, State, Svf};
use super::{BandType, DEFAULT_ON, DEFAULT_TYPE, DYNAMIC_DB, FREQ_HZ, GAIN_DB, ON, PARAMS, Q};
use super::{THRESHOLD_DB, TYPE, band_param};
use crate::{Smoothed, amplitude_to_db};

// Coefficients follow the smoothed parameters every few frames.
pub(super) const SUB_BLOCK: usize = 16;
pub(super) const SMOOTH_MS: f32 = 21.0;
// Dynamic detector (rule 19) and the level span over which a dynamic band
// travels from its gain to gain + dynamic, above its threshold.
pub(super) const ATTACK_MS: f32 = 5.0;
pub(super) const RELEASE_MS: f32 = 89.0;
pub(super) const DYNAMIC_SPAN_DB: f32 = 12.0;

pub(super) struct Band {
    pub(super) kind: BandType,
    pub(super) pending: BandType,
    pub(super) on: bool,
    pub(super) log2_hz: Smoothed,
    pub(super) q: Smoothed,
    pub(super) gain_db: Smoothed,
    pub(super) dynamic_db: Smoothed,
    pub(super) threshold_db: Smoothed,
    // 0..1 crossfade from dry to filtered: switches and type changes never click.
    pub(super) mix: Smoothed,
    pub(super) mix_now: f32,
    pub(super) svf: Svf,
    pub(super) detector: Svf,
    pub(super) states: [State; 2],
    pub(super) detector_states: [State; 2],
    pub(super) envelope: f32,
    pub(super) offset_db: f32,
    pub(super) gain_now: f32,
    pub(super) redesign: bool,
}

impl Band {
    pub(super) fn new(index: usize) -> Self {
        let default = |slot| PARAMS[band_param(index, slot) as usize].default;
        let kind = BandType::from_index(DEFAULT_TYPE[index]);
        let on = DEFAULT_ON[index] == 1;
        Self {
            kind,
            pending: kind,
            on,
            log2_hz: Smoothed::new(default(FREQ_HZ).log2(), SMOOTH_MS),
            q: Smoothed::new(default(Q), SMOOTH_MS),
            gain_db: Smoothed::new(default(GAIN_DB), SMOOTH_MS),
            dynamic_db: Smoothed::new(0.0, SMOOTH_MS),
            threshold_db: Smoothed::new(default(THRESHOLD_DB), SMOOTH_MS),
            mix: Smoothed::new(if on { 1.0 } else { 0.0 }, SMOOTH_MS),
            mix_now: if on { 1.0 } else { 0.0 },
            svf: Svf::default(),
            detector: Svf::default(),
            states: [State::default(); 2],
            detector_states: [State::default(); 2],
            envelope: 0.0,
            offset_db: 0.0,
            gain_now: 0.0,
            redesign: true,
        }
    }

    pub(super) fn smoothers(&mut self) -> [&mut Smoothed; 5] {
        [
            &mut self.log2_hz,
            &mut self.q,
            &mut self.gain_db,
            &mut self.dynamic_db,
            &mut self.threshold_db,
        ]
    }

    pub(super) fn mix_target(&self) -> f32 {
        if self.on && self.pending == self.kind {
            1.0
        } else {
            0.0
        }
    }

    // Lands every value on its target and clears the filter memories.
    pub(super) fn settle(&mut self) {
        self.clear();
        let target = self.mix_target();
        self.mix.snap(target);
        self.mix_now = target;
    }

    // A silent band takes its pending type and its targets; its crossfade
    // stays where it is, so turning it on still fades it in.
    pub(super) fn clear(&mut self) {
        self.kind = self.pending;
        for smoothed in self.smoothers() {
            smoothed.settle();
        }
        self.states = [State::default(); 2];
        self.detector_states = [State::default(); 2];
        self.envelope = 0.0;
        self.offset_db = 0.0;
        self.redesign = true;
    }

    pub(super) fn dynamic(&self) -> bool {
        self.kind.has_gain() && !(self.dynamic_db.target() == 0.0 && self.dynamic_db.is_settled())
    }

    pub(super) fn process(
        &mut self,
        sample_rate: f32,
        envelope: (f32, f32),
        left: &mut [f32],
        right: &mut [f32],
    ) {
        let mix_start = self.mix_now;
        self.mix.set(self.mix_target());
        self.mix_now = self.mix.tick();
        if self.mix.is_settled() {
            self.mix_now = self.mix_target();
            self.mix.snap(self.mix_now);
        }
        if mix_start == 0.0 && self.mix_now == 0.0 {
            // Silent band: nothing to hear, so a pending type lands now.
            self.clear();
            self.gain_now = if self.kind.has_gain() {
                self.gain_db.target()
            } else {
                0.0
            };
            return;
        }
        let moving = !self.smoothers().iter().all(|s| s.is_settled());
        let log2_hz = self.log2_hz.tick();
        let q = self.q.tick();
        let gain = self.gain_db.tick();
        let dynamic = self.dynamic_db.tick();
        let threshold = self.threshold_db.tick();
        let detecting = self.dynamic();
        if detecting {
            let over = (amplitude_to_db(self.envelope) - threshold).max(0.0);
            self.offset_db = dynamic * (over / DYNAMIC_SPAN_DB).min(1.0);
        } else {
            self.offset_db = 0.0;
        }
        let gain_now = if self.kind.has_gain() {
            gain + self.offset_db
        } else {
            0.0
        };
        if moving || self.redesign || (gain_now - self.gain_now).abs() > 1.0e-3 {
            let centre = log2_hz.exp2();
            self.svf = Design::new(self.kind, sample_rate, centre, q, gain_now).into();
            self.detector = Design::band_pass(sample_rate, centre, q).into();
            self.redesign = false;
        }
        self.gain_now = gain_now;
        let (svf, detector) = (self.svf, self.detector);
        let [state_l, state_r] = &mut self.states;
        let [detector_l, detector_r] = &mut self.detector_states;
        let (attack, release) = envelope;
        let frames = left.len();
        let full = mix_start == 1.0 && self.mix_now == 1.0;
        let step = (self.mix_now - mix_start) / frames as f32;
        for (index, (l, r)) in left.iter_mut().zip(right.iter_mut()).enumerate() {
            let (dry_l, dry_r) = (*l, *r);
            if detecting {
                let level = detector_l
                    .tick(&detector, dry_l)
                    .abs()
                    .max(detector_r.tick(&detector, dry_r).abs());
                let coefficient = if level > self.envelope {
                    attack
                } else {
                    release
                };
                self.envelope = level + coefficient * (self.envelope - level);
            }
            let wet_l = state_l.tick(&svf, dry_l);
            let wet_r = state_r.tick(&svf, dry_r);
            if full {
                (*l, *r) = (wet_l, wet_r);
            } else {
                let mix = mix_start + step * (index + 1) as f32;
                *l = dry_l + mix * (wet_l - dry_l);
                *r = dry_r + mix * (wet_r - dry_r);
            }
        }
        for state in self
            .states
            .iter_mut()
            .chain(self.detector_states.iter_mut())
        {
            state.flush();
        }
        if self.envelope < 1.0e-9 {
            self.envelope = 0.0;
        }
    }

    pub(super) fn set(&mut self, slot: u32, value: f32) {
        match slot {
            ON => self.on = value >= 0.5,
            TYPE => self.pending = BandType::from_index(value.round() as usize),
            FREQ_HZ => self.log2_hz.set(value.log2()),
            GAIN_DB => self.gain_db.set(value),
            Q => self.q.set(value),
            DYNAMIC_DB => self.dynamic_db.set(value),
            THRESHOLD_DB => self.threshold_db.set(value),
            _ => {}
        }
    }
}
