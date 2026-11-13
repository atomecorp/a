//! One list's vertical scroll under the finger, the iOS way (token `scrollMotion`,
//! eVe/elements/skin/panel_skin.js; AGENTS.md rule 12): dragged, it follows the finger, past an end less
//! and less (the rubber band); flicked, it glides on and slows; a glide reaching an end runs on into it
//! and springs back with a small bounce, as a list released stretched does.
//!
//! Pure model: the drag's times are the browser's (the pointer events'), the glide's and the bounce's the
//! renderer's frames; the two never mix. `shown()` is where the content lies: its offset less its stretch.
use serde::Deserialize;

/// The panel skin's one glide (`scrollMotion`).
#[derive(Clone, Copy, Debug, Deserialize, PartialEq)]
pub struct ScrollMotionSpec {
    pub velocity_blend: f64,
    pub min_velocity_px_per_ms: f64,
    pub max_velocity_px_per_ms: f64,
    pub friction_per16_ms: f64,
    pub release_window_ms: f64,
    pub rubber: f64,
    pub bounce_spring_per_ms: f64,
}

/// A glide slower than this (px/ms, 250 px/s) looks still: a press on it stops it and is a tap.
const CAUGHT_GLIDE_PX_PER_MS: f64 = 0.25;
/// A bounce stretched less than this looks settled: a press on it is a tap.
const CAUGHT_STRETCH_PX: f64 = 4.0;
/// A stretch under half a pixel is none.
const STRETCH_EPSILON_PX: f64 = 0.5;
/// A wheel's notches keep a list moving until none came for this long.
pub const SCROLL_WHEEL_SETTLE_MS: f64 = 80.0;

#[derive(Clone, Copy, Debug, PartialEq)]
enum Phase {
    Rest,
    /// Pressed, the finger not moved yet or dragging: `start` is the content's place at the press.
    Drag {
        start_offset: f64,
        start_y: f64,
        last_y: f64,
        last_at: f64,
        velocity: f64,
    },
    Glide {
        velocity: f64,
        previous_at: Option<f64>,
    },
    Bounce {
        from: f64,
        speed: f64,
        started_at: Option<f64>,
    },
    Wheel {
        last_at: Option<f64>,
    },
}

#[derive(Clone, Debug)]
pub struct ScrollMotion {
    spec: ScrollMotionSpec,
    viewport: f64,
    max: f64,
    offset: f64,
    stretch: f64,
    phase: Phase,
}

impl ScrollMotion {
    pub fn new(spec: ScrollMotionSpec, viewport: f64, max: f64, offset: f64) -> Self {
        let max = max.max(0.0);
        Self {
            spec,
            viewport: viewport.max(1.0),
            max,
            offset: offset.clamp(0.0, max),
            stretch: 0.0,
            phase: Phase::Rest,
        }
    }

    /// The list described again: its room and range. A list the browser moved itself (`jump`: a reveal,
    /// a restored place) stops and takes the offset it was described at; otherwise it keeps its own.
    pub fn describe(
        &mut self,
        spec: ScrollMotionSpec,
        viewport: f64,
        max: f64,
        offset: f64,
        jump: bool,
    ) {
        self.spec = spec;
        self.viewport = viewport.max(1.0);
        self.max = max.max(0.0);
        if jump {
            self.stop();
            self.offset = offset;
        }
        self.offset = self.offset.clamp(0.0, self.max);
    }

    pub fn offset(&self) -> f64 {
        self.offset
    }

    pub fn max(&self) -> f64 {
        self.max
    }

    pub fn stretch(&self) -> f64 {
        self.stretch
    }

    /// Where the content lies: past an end it is moved by its stretch.
    pub fn shown(&self) -> f64 {
        self.offset - self.stretch
    }

    pub fn is_moving(&self) -> bool {
        self.phase != Phase::Rest
    }

    pub fn is_gliding(&self) -> bool {
        matches!(self.phase, Phase::Glide { .. } | Phase::Bounce { .. })
    }

    pub fn is_dragging(&self) -> bool {
        matches!(self.phase, Phase::Drag { .. })
    }

    /// Stopped from outside (a reveal, a restore): no glide, no stretch left behind.
    pub fn stop(&mut self) {
        self.phase = Phase::Rest;
        self.stretch = 0.0;
    }

    fn rubber_band(&self, past: f64) -> f64 {
        (1.0 - 1.0 / ((past * self.spec.rubber) / self.viewport + 1.0)) * self.viewport
    }

    /// A press on a list still gliding: a glide stops where it shows (a bounce ends by itself). True (the
    /// press only stops it, no tap) while the list visibly moves: a glide's slow tail, which looks still,
    /// swallowed the first tap on a row or a tool (Envoi touched twice, iPhone, 12 Nov. 2026).
    pub fn catch_glide(&mut self) -> bool {
        match self.phase {
            Phase::Glide { velocity, .. } => {
                self.phase = Phase::Rest;
                velocity.abs() >= CAUGHT_GLIDE_PX_PER_MS
            }
            Phase::Bounce { .. } => self.stretch.abs() >= CAUGHT_STRETCH_PX,
            _ => false,
        }
    }

    /// The finger lands: a glide or a bounce is caught where the list shows.
    pub fn press(&mut self, y: f64, at: f64) {
        self.phase = Phase::Drag {
            start_offset: self.shown(),
            start_y: y,
            last_y: y,
            last_at: at,
            velocity: 0.0,
        };
    }

    /// The finger at `y`: the content follows it, past an end less and less.
    pub fn drag(&mut self, y: f64, at: f64) {
        let Phase::Drag {
            start_offset,
            start_y,
            last_y,
            last_at,
            velocity,
        } = self.phase
        else {
            return;
        };
        let elapsed = (at - last_at).max(1.0);
        let instantaneous = -(y - last_y) / elapsed;
        let blend = self.spec.velocity_blend;
        let wanted = start_offset - (y - start_y);
        self.offset = wanted.clamp(0.0, self.max);
        let stretch = if wanted < 0.0 {
            self.rubber_band(-wanted)
        } else if wanted > self.max {
            -self.rubber_band(wanted - self.max)
        } else {
            0.0
        };
        self.stretch = if stretch.abs() < STRETCH_EPSILON_PX {
            0.0
        } else {
            stretch
        };
        self.phase = Phase::Drag {
            start_offset,
            start_y,
            last_y: y,
            last_at: at,
            velocity: velocity * (1.0 - blend) + instantaneous * blend,
        };
    }

    /// The finger lifts at `at`: stretched, the list springs back; thrown, it glides; rested, it stays.
    pub fn release(&mut self, at: f64) {
        let Phase::Drag {
            last_at, velocity, ..
        } = self.phase
        else {
            return;
        };
        if self.stretch != 0.0 {
            self.phase = Phase::Bounce {
                from: self.stretch,
                speed: 0.0,
                started_at: None,
            };
            return;
        }
        let velocity = velocity.clamp(
            -self.spec.max_velocity_px_per_ms,
            self.spec.max_velocity_px_per_ms,
        );
        // A finger that rested before lifting throws nothing.
        self.phase = if at - last_at > self.spec.release_window_ms
            || velocity.abs() < self.spec.min_velocity_px_per_ms
        {
            Phase::Rest
        } else {
            Phase::Glide {
                velocity,
                previous_at: None,
            }
        };
    }

    /// A wheel's notch: the list moves by it at once, within its range.
    pub fn wheel(&mut self, delta: f64) {
        self.stretch = 0.0;
        self.offset = (self.offset + delta).clamp(0.0, self.max);
        self.phase = Phase::Wheel { last_at: None };
    }

    /// One renderer frame at `now` (ms): steps the glide or the bounce. Returns whether the list still moves.
    pub fn step(&mut self, now: f64) -> bool {
        match self.phase {
            Phase::Rest | Phase::Drag { .. } => {}
            Phase::Wheel { last_at } => match last_at {
                None => self.phase = Phase::Wheel { last_at: Some(now) },
                Some(at) if now - at > SCROLL_WHEEL_SETTLE_MS => self.phase = Phase::Rest,
                Some(_) => {}
            },
            Phase::Glide {
                velocity,
                previous_at,
            } => self.step_glide(now, velocity, previous_at),
            Phase::Bounce {
                from,
                speed,
                started_at,
            } => {
                let started = started_at.unwrap_or(now);
                // s(t) = (from + (speed + ω·from)·t)·e^(−ω·t): critically damped, back to rest.
                let omega = self.spec.bounce_spring_per_ms;
                let t = (now - started).max(0.0);
                let stretch = (from + (speed + omega * from) * t) * (-omega * t).exp();
                if t > 30.0 && stretch.abs() < STRETCH_EPSILON_PX {
                    self.stop();
                } else {
                    self.stretch = if stretch.abs() < STRETCH_EPSILON_PX {
                        0.0
                    } else {
                        stretch
                    };
                    self.phase = Phase::Bounce {
                        from,
                        speed,
                        started_at: Some(started),
                    };
                }
            }
        }
        self.is_moving() && !self.is_dragging()
    }

    fn step_glide(&mut self, now: f64, velocity: f64, previous_at: Option<f64>) {
        let elapsed = previous_at.map_or(16.0, |previous| (now - previous).clamp(1.0, 32.0));
        let velocity = velocity * self.spec.friction_per16_ms.powf(elapsed / 16.0);
        if velocity.abs() < self.spec.min_velocity_px_per_ms {
            self.phase = Phase::Rest;
            return;
        }
        let wanted = self.offset + velocity * elapsed;
        let before = self.offset;
        self.offset = wanted.clamp(0.0, self.max);
        // The glide meets an end: it runs on into it and comes back.
        if wanted < 0.0 || wanted > self.max {
            self.phase = Phase::Bounce {
                from: 0.0,
                speed: -velocity,
                started_at: Some(now),
            };
            return;
        }
        self.phase = if (self.offset - before).abs() < 0.01 {
            Phase::Rest
        } else {
            Phase::Glide {
                velocity,
                previous_at: Some(now),
            }
        };
    }
}
