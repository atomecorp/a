// Twice-the-rate processing for a nonlinear curve: a linear-phase half-band
// FIR (Kaiser-windowed sinc, ~80 dB stop band) lifts each sample to two and
// brings two back to one, so the harmonics a curve makes above the device's
// Nyquist are filtered out instead of folding back as aliasing. Polyphase:
// half of the taps are zero and the centre one is a plain delay, so each
// direction costs `BRANCH_TAPS` multiplies per device sample. No allocation.

// Taps of the full half-band filter (4k + 3, so its centre falls on an odd tap).
const TAPS: usize = 47;
const CENTRE: usize = (TAPS - 1) / 2;
// The even taps, all non-zero: one polyphase branch.
const BRANCH_TAPS: usize = TAPS.div_ceil(2);
const KAISER_BETA: f64 = 7.86;
// History ring, a power of two above `BRANCH_TAPS`, stored twice so that any
// window of it reads as one contiguous slice.
const RING: usize = 32;

// Frames by which an up-then-down pass lags its input, at the device rate.
pub const LATENCY_FRAMES: u32 = CENTRE as u32;

fn bessel_i0(x: f64) -> f64 {
    let mut sum = 1.0;
    let mut term = 1.0;
    let half = x * 0.5;
    for k in 1..32 {
        term *= half / k as f64;
        sum += term * term;
    }
    sum
}

// The even taps of the half-band filter (the odd ones are zero but the
// centre, 0.5), normalised so each branch passes DC at exactly 0.5.
fn branch() -> [f32; BRANCH_TAPS] {
    let mut taps = [0.0f64; BRANCH_TAPS];
    let norm = bessel_i0(KAISER_BETA);
    for (j, tap) in taps.iter_mut().enumerate() {
        let k = 2 * j;
        let x = k as f64 - CENTRE as f64;
        let sinc = (std::f64::consts::FRAC_PI_2 * x).sin() / (std::f64::consts::PI * x);
        let r = x / CENTRE as f64;
        *tap = sinc * bessel_i0(KAISER_BETA * (1.0 - r * r).max(0.0).sqrt()) / norm;
    }
    let sum: f64 = taps.iter().sum();
    taps.map(|tap| (tap * 0.5 / sum) as f32)
}

#[derive(Clone, Copy)]
struct History {
    ring: [f32; RING * 2],
    at: usize,
}

impl History {
    const fn new() -> Self {
        Self {
            ring: [0.0; RING * 2],
            at: 0,
        }
    }

    #[inline]
    fn push(&mut self, sample: f32) {
        self.at = (self.at + 1) & (RING - 1);
        self.ring[self.at] = sample;
        self.ring[self.at + RING] = sample;
    }

    // `ago` samples before the last one pushed (0 = the last).
    #[inline]
    fn get(&self, ago: usize) -> f32 {
        self.ring[self.at + RING - ago]
    }

    #[inline]
    fn convolve(&self, taps: &[f32; BRANCH_TAPS]) -> f32 {
        let mut sum = 0.0;
        for (ago, tap) in taps.iter().enumerate() {
            sum += tap * self.get(ago);
        }
        sum
    }
}

// One channel's two-way converter.
#[derive(Clone, Copy)]
pub struct HalfBand2x {
    taps: [f32; BRANCH_TAPS],
    upward: History,
    even: History,
    odd: History,
}

impl HalfBand2x {
    pub fn new() -> Self {
        Self {
            taps: branch(),
            upward: History::new(),
            even: History::new(),
            odd: History::new(),
        }
    }

    // One device sample becomes two at twice the rate.
    #[inline]
    pub fn up(&mut self, sample: f32) -> [f32; 2] {
        self.upward.push(sample);
        // The zero-stuffed stream filtered with gain 2: the even phase is the
        // FIR branch, the odd phase the centre tap alone (a pure delay).
        [
            2.0 * self.upward.convolve(&self.taps),
            self.upward.get(CENTRE / 2),
        ]
    }

    // Two samples at twice the rate become one device sample.
    #[inline]
    pub fn down(&mut self, pair: [f32; 2]) -> f32 {
        self.even.push(pair[0]);
        self.odd.push(pair[1]);
        self.even.convolve(&self.taps) + 0.5 * self.odd.get(CENTRE / 2 + 1)
    }

    pub fn reset(&mut self) {
        self.upward = History::new();
        self.even = History::new();
        self.odd = History::new();
    }
}

impl Default for HalfBand2x {
    fn default() -> Self {
        Self::new()
    }
}

// Frames of history a 4× pass pads at the fast rate so its total latency is a
// whole number of device frames (the compensation works in whole frames).
const MAX_PAD: usize = 3;

// Any processor run at 2× or 4× the device rate (decision R-191: chosen per
// module, never by default): the block goes up through the half-band stages,
// is processed there, and comes back down, filtered of what the processing
// made above the device's Nyquist. Its latency is the stages' plus the inner
// processor's, padded to whole device frames and declared.
pub struct Oversampled {
    inner: Box<dyn crate::Processor>,
    factor: usize,
    // [channel][stage]: stage 0 between the device and 2×, stage 1 between 2× and 4×.
    stages: [[HalfBand2x; 2]; 2],
    left: Vec<f32>,
    right: Vec<f32>,
    pad: usize,
    pad_ring: [[f32; MAX_PAD + 1]; 2],
    pad_at: usize,
    latency: u32,
}

impl Oversampled {
    // `factor` is 2 or 4.
    pub fn new(inner: Box<dyn crate::Processor>, factor: usize) -> Result<Self, String> {
        if factor != 2 && factor != 4 {
            return Err(format!("oversampling is 2× or 4×, not {factor}×"));
        }
        Ok(Self {
            inner,
            factor,
            stages: [[HalfBand2x::new(); 2]; 2],
            left: Vec::new(),
            right: Vec::new(),
            pad: 0,
            pad_ring: [[0.0; MAX_PAD + 1]; 2],
            pad_at: 0,
            latency: 0,
        })
    }

    pub fn factor(&self) -> usize {
        self.factor
    }

    // Samples at the fast rate: each stage pair delays by CENTRE * 2 at its
    // own rate; the inner processor by its own latency.
    fn settle_latency(&mut self) {
        let fast = self.factor as u32;
        let stages = match self.factor {
            2 => 2 * CENTRE as u32,
            _ => 4 * CENTRE as u32 + 2 * CENTRE as u32,
        };
        let total = stages + self.inner.latency_frames();
        self.pad = ((fast - total % fast) % fast) as usize;
        self.latency = (total + self.pad as u32) / fast;
    }

    #[inline]
    fn padded(&mut self, channel: usize, sample: f32) -> f32 {
        if self.pad == 0 {
            return sample;
        }
        let ring = &mut self.pad_ring[channel];
        let size = MAX_PAD + 1;
        ring[self.pad_at % size] = sample;
        ring[(self.pad_at + size - self.pad) % size]
    }
}

impl crate::Processor for Oversampled {
    fn prepare(&mut self, sample_rate: f32, max_block: usize) {
        let fast = max_block * self.factor;
        self.inner.prepare(sample_rate * self.factor as f32, fast);
        self.left = vec![0.0; fast];
        self.right = vec![0.0; fast];
        self.settle_latency();
    }

    fn process(&mut self, block: &mut crate::StereoBlock) {
        let frames = block.frames();
        let fast = frames * self.factor;
        for (channel, samples) in [&*block.left, &*block.right].into_iter().enumerate() {
            let out = if channel == 0 {
                &mut self.left
            } else {
                &mut self.right
            };
            for (index, sample) in samples.iter().enumerate() {
                let pair = self.stages[channel][0].up(*sample);
                match self.factor {
                    2 => out[index * 2..index * 2 + 2].copy_from_slice(&pair),
                    _ => {
                        let first = self.stages[channel][1].up(pair[0]);
                        let second = self.stages[channel][1].up(pair[1]);
                        out[index * 4..index * 4 + 2].copy_from_slice(&first);
                        out[index * 4 + 2..index * 4 + 4].copy_from_slice(&second);
                    }
                }
            }
        }
        let mut inner = crate::StereoBlock::new(&mut self.left[..fast], &mut self.right[..fast]);
        self.inner.process(&mut inner);
        for index in 0..fast {
            let (left, right) = (self.left[index], self.right[index]);
            self.left[index] = self.padded(0, left);
            self.right[index] = self.padded(1, right);
            self.pad_at = self.pad_at.wrapping_add(1);
        }
        for channel in 0..2 {
            let (samples, out) = if channel == 0 {
                (&self.left, &mut *block.left)
            } else {
                (&self.right, &mut *block.right)
            };
            for (index, sample) in out.iter_mut().enumerate().take(frames) {
                *sample = match self.factor {
                    2 => self.stages[channel][0].down([samples[index * 2], samples[index * 2 + 1]]),
                    _ => {
                        let at = index * 4;
                        let first = self.stages[channel][1].down([samples[at], samples[at + 1]]);
                        let second =
                            self.stages[channel][1].down([samples[at + 2], samples[at + 3]]);
                        self.stages[channel][0].down([first, second])
                    }
                };
            }
        }
    }

    fn set_param(&mut self, id: u32, value: f32) {
        self.inner.set_param(id, value);
    }

    // Beats run in seconds: the inner rate changes nothing.
    fn set_transport(&mut self, transport: &crate::Transport) {
        self.inner.set_transport(transport);
    }

    fn params(&self) -> &'static [crate::ParamSpec] {
        self.inner.params()
    }

    fn latency_frames(&self) -> u32 {
        self.latency
    }

    fn tail_frames(&self) -> u32 {
        self.inner.tail_frames().div_ceil(self.factor as u32)
    }

    fn reset(&mut self) {
        self.inner.reset();
        for channel in &mut self.stages {
            for stage in channel {
                stage.reset();
            }
        }
        self.pad_ring = [[0.0; MAX_PAD + 1]; 2];
    }

    fn readings(&self) -> &[f32] {
        self.inner.readings()
    }
}
