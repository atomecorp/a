// Duration apart from pitch. The note's pitch stays with the sinc reader (exact);
// the stretcher only sets the duration: reading a take faster shortens it, so
// the stretcher lengthens by the same ratio and the segment keeps the duration
// it asks for. (Signalsmith's own transposition measured 8–14 cents sharp on a
// pure tone with this window; its duration change is exact.) Signalsmith Stretch
// won the Q2 measurement (42.7 ms window at 48 kHz, ~1.9 % of a core per stereo
// voice, against 13–17 % for Rubber Band R3 real time: temp/synth/stretch_probe).
// Its latency is never heard: the sample is known ahead, so at the note the
// stretcher is primed — fed the opening, its output latency rendered and
// dropped — and the first output frame is the segment's first frame.

use signalsmith_stretch::Stretch;

// The live window: 2048 frames, hop 512.
const WINDOW: usize = 2048;
const HOP: usize = 512;
// The duration factors a segment may ask for.
pub const SHORTEST: f32 = 0.25;
pub const LONGEST: f32 = 4.0;
// The stretcher's own factor (duration × reading speed) stays within these.
pub const LOWEST_RATIO: f32 = 1.0 / 16.0;
pub const HIGHEST_RATIO: f32 = 16.0;

pub struct VoiceStretch {
    inner: Stretch,
    input_latency: usize,
    output_latency: usize,
    interleaved_in: Vec<f32>,
    interleaved_out: Vec<f32>,
    pending: f64,
}

// SAFETY: `Stretch` is `Send`; nothing reachable through `&VoiceStretch` touches
// it (the latencies are copied at construction), so shared references are inert.
unsafe impl Sync for VoiceStretch {}

impl VoiceStretch {
    // Off the audio thread: the stretcher and every buffer it will use.
    pub fn new(max_block: usize) -> Self {
        let inner = Stretch::new(2, WINDOW, HOP);
        let input_latency = inner.input_latency();
        let output_latency = inner.output_latency();
        let most_input = (max_block as f32 / LOWEST_RATIO) as usize + 2;
        let priming = input_latency + (output_latency as f32 / LOWEST_RATIO) as usize + 2;
        Self {
            inner,
            input_latency,
            output_latency,
            interleaved_in: vec![0.0; most_input.max(priming) * 2],
            interleaved_out: vec![0.0; max_block.max(output_latency) * 2],
            pending: 0.0,
        }
    }

    // Source frames the voice's input buffers must hold (a block, or the priming).
    pub fn input_capacity(&self) -> usize {
        self.interleaved_in.len() / 2
    }

    // The stretcher's factor for a segment's `duration` read at `speed` × its rate.
    pub fn ratio(duration: f32, speed: f32) -> f32 {
        (duration * speed).clamp(LOWEST_RATIO, HIGHEST_RATIO)
    }

    // Reader frames the next `frames` of output consume at stretcher `factor`.
    pub fn input_for(&mut self, frames: usize, factor: f32) -> usize {
        self.pending += frames as f64 / factor as f64;
        let whole = self.pending.floor();
        self.pending -= whole;
        whole as usize
    }

    // Source frames priming needs: the stretcher's opening, then enough to fill
    // the output latency at `factor`.
    pub fn priming_frames(&self, factor: f32) -> (usize, usize) {
        (self.input_latency, (self.output_latency as f32 / factor).ceil() as usize)
    }

    // `opening` and `ahead` are planar (left, right) source frames from the segment's start.
    pub fn prime(&mut self, opening: (&[f32], &[f32]), ahead: (&[f32], &[f32]), factor: f32) {
        self.inner.reset();
        self.pending = 0.0;
        let opened = interleave(opening, &mut self.interleaved_in);
        self.inner.seek(&self.interleaved_in[..opened], 1.0 / factor as f64);
        let fed = interleave(ahead, &mut self.interleaved_in);
        let dropped = self.output_latency * 2;
        self.inner.process(&self.interleaved_in[..fed], &mut self.interleaved_out[..dropped]);
    }

    // Stretches planar `input` into planar `left`/`right` (overwritten).
    pub fn process(&mut self, input: (&[f32], &[f32]), left: &mut [f32], right: &mut [f32]) {
        let fed = interleave(input, &mut self.interleaved_in);
        let frames = left.len();
        self.inner.process(&self.interleaved_in[..fed], &mut self.interleaved_out[..frames * 2]);
        for (index, (l, r)) in left.iter_mut().zip(right.iter_mut()).enumerate() {
            *l = self.interleaved_out[index * 2];
            *r = self.interleaved_out[index * 2 + 1];
        }
    }

    // Output frames still ringing once the input has ended.
    pub fn tail_frames(&self) -> usize {
        self.output_latency
    }
}

fn interleave((left, right): (&[f32], &[f32]), out: &mut [f32]) -> usize {
    for (index, (l, r)) in left.iter().zip(right.iter()).enumerate() {
        out[index * 2] = *l;
        out[index * 2 + 1] = *r;
    }
    left.len() * 2
}
