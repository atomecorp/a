// Round trip of the direct path, measured on the device itself (todo L2): with
// a strip monitoring an input, the probe silences the monitor, sends impulses
// out of the direct path and finds each one coming back in the monitored
// input (loopback cable, or the microphone in front of the speaker). The
// frames between the two are what a played note takes to be heard: output
// buffer, converters, air or cable, input buffer and ring. Each impulse is a
// short 2 kHz burst, so a laptop speaker plays it; its onset is the measure.

use std::sync::atomic::{AtomicBool, AtomicU32, AtomicUsize, Ordering};

pub const IMPULSES: usize = 4;
const BURST_LEVEL: f32 = 0.4;
const BURST_HZ: u64 = 2000;
const BURST_PERIODS: u64 = 10;
const MIN_THRESHOLD: f32 = 0.005;
// Nothing heard within this share of a second: that impulse is lost.
const TIMEOUT_SHARE: u64 = 2;

static ARMED: AtomicBool = AtomicBool::new(false);
static DONE: AtomicBool = AtomicBool::new(false);
static COUNT: AtomicUsize = AtomicUsize::new(0);
static RESULTS: [AtomicU32; IMPULSES] = [const { AtomicU32::new(u32::MAX) }; IMPULSES];

#[derive(Clone, Copy, PartialEq)]
enum Phase {
    Idle,
    // The input's own noise, heard before the first impulse.
    Noise { until: u64 },
    Waiting { sent_at: u64 },
    Pause { until: u64 },
}

pub struct RoundTrip {
    frame: u64,
    phase: Phase,
    noise: f32,
    sample_rate: u64,
}

pub fn arm() {
    COUNT.store(0, Ordering::Release);
    RESULTS.iter().for_each(|result| result.store(u32::MAX, Ordering::Relaxed));
    DONE.store(false, Ordering::Release);
    ARMED.store(true, Ordering::Release);
}

// The frames each impulse took to come back (`None`: never heard), once done.
pub fn results() -> Option<Vec<Option<u32>>> {
    DONE.load(Ordering::Acquire).then(|| RESULTS.iter()
        .map(|result| Some(result.load(Ordering::Relaxed)).filter(|frames| *frames != u32::MAX)).collect())
}

impl RoundTrip {
    pub fn new(sample_rate: u32) -> Self {
        Self { frame: 0, phase: Phase::Idle, noise: 0.0, sample_rate: u64::from(sample_rate.max(1)) }
    }

    // A square burst starting at its onset, `elapsed` frames in.
    fn burst(&self, elapsed: u64) -> f32 {
        let period = (self.sample_rate / BURST_HZ).max(2);
        if elapsed >= period * BURST_PERIODS {
            return 0.0;
        }
        if elapsed % period < period / 2 { BURST_LEVEL } else { -BURST_LEVEL }
    }

    fn record(&mut self, frames: Option<u64>) {
        let index = COUNT.fetch_add(1, Ordering::AcqRel);
        if let Some(slot) = RESULTS.get(index) {
            slot.store(frames.map_or(u32::MAX, |frames| frames as u32), Ordering::Relaxed);
        }
        self.phase = if index + 1 >= IMPULSES {
            DONE.store(true, Ordering::Release);
            Phase::Idle
        } else {
            Phase::Pause { until: self.frame + self.sample_rate / 4 }
        };
    }

    // `left`/`right` hold what the direct path rendered (the monitored input);
    // while measuring they are replaced by the impulses alone.
    pub fn process(&mut self, left: &mut [f32], right: &mut [f32]) {
        if self.phase == Phase::Idle {
            if !ARMED.swap(false, Ordering::AcqRel) {
                self.frame += left.len() as u64;
                return;
            }
            self.noise = 0.0;
            self.phase = Phase::Noise { until: self.frame + self.sample_rate / 5 };
        }
        for (left, right) in left.iter_mut().zip(right.iter_mut()) {
            let heard = left.abs().max(right.abs());
            let mut out = 0.0;
            match self.phase {
                Phase::Noise { until } => {
                    self.noise = self.noise.max(heard);
                    if self.frame >= until {
                        self.phase = Phase::Waiting { sent_at: self.frame };
                        out = self.burst(0);
                    }
                }
                Phase::Waiting { sent_at } => {
                    let elapsed = self.frame - sent_at;
                    out = self.burst(elapsed);
                    if elapsed > 0 && heard > (self.noise * 4.0).max(MIN_THRESHOLD) {
                        self.record(Some(elapsed));
                    } else if elapsed > self.sample_rate / TIMEOUT_SHARE {
                        self.record(None);
                    }
                }
                Phase::Pause { until } => {
                    if self.frame >= until {
                        self.phase = Phase::Waiting { sent_at: self.frame };
                        out = self.burst(0);
                    }
                }
                Phase::Idle => {}
            }
            *left = out;
            *right = out;
            self.frame += 1;
        }
    }
}
