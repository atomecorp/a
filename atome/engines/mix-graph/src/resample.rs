// Streaming linear resampler for live inputs whose device runs at another
// rate than the output (a 44.1 kHz microphone into a 48 kHz engine would
// otherwise play at the wrong pitch and drift). Real-time safe: no
// allocation once `out` has its capacity; state carries across callbacks.

use kira::Frame;

pub struct LinearResampler {
    // Input frames advanced per output frame.
    step: f64,
    // Fractional read position in [previous, input…]: 0 is `previous`.
    position: f64,
    previous: Frame,
}

impl LinearResampler {
    pub fn new(input_rate: u32, output_rate: u32) -> Self {
        Self { step: f64::from(input_rate.max(1)) / f64::from(output_rate.max(1)), position: 0.0, previous: Frame::ZERO }
    }

    pub fn is_identity(&self) -> bool {
        (self.step - 1.0).abs() < f64::EPSILON
    }

    // Appends to `out` the output frames `input` yields (never past its capacity).
    pub fn process(&mut self, input: &[Frame], out: &mut Vec<Frame>) {
        let count = input.len() as f64;
        if input.is_empty() {
            return;
        }
        while self.position < count && out.len() < out.capacity() {
            let index = self.position.floor() as usize;
            let fraction = (self.position - index as f64) as f32;
            let from = if index == 0 { self.previous } else { input[index - 1] };
            let to = input[index];
            out.push(from + (to - from) * fraction);
            self.position += self.step;
        }
        self.position = (self.position - count).max(0.0);
        self.previous = input[input.len() - 1];
    }
}

#[cfg(test)]
mod tests {
    use super::LinearResampler;
    use kira::Frame;

    fn sine(rate: f64, hz: f64, frames: usize, offset: usize) -> Vec<Frame> {
        (offset..offset + frames).map(|i| Frame::from_mono((2.0 * std::f64::consts::PI * hz * i as f64 / rate).sin() as f32)).collect()
    }

    #[test]
    fn a_44k1_input_becomes_48k_at_the_same_pitch() {
        let mut resampler = LinearResampler::new(44_100, 48_000);
        let mut out = Vec::with_capacity(200_000);
        // Ten callbacks of 441 frames: one tenth of a second.
        for block in 0..100 {
            resampler.process(&sine(44_100.0, 440.0, 441, block * 441), &mut out);
        }
        assert!((out.len() as i64 - 48_000).abs() <= 1, "one second in, one second out: {}", out.len());
        // Compare with the ideal 48 kHz sine, one frame behind (the `previous` slot).
        let ideal = sine(48_000.0, 440.0, out.len(), 0);
        let worst = out.iter().skip(1).zip(&ideal).map(|(got, want)| (got.left - want.left).abs()).fold(0.0f32, f32::max);
        assert!(worst < 0.01, "linear interpolation of a 440 Hz sine stays within 1 %: {worst}");
    }

    #[test]
    fn equal_rates_pass_through() {
        let mut resampler = LinearResampler::new(48_000, 48_000);
        assert!(resampler.is_identity());
        let input = sine(48_000.0, 440.0, 512, 0);
        let mut out = Vec::with_capacity(1024);
        resampler.process(&input, &mut out);
        assert_eq!(out.len(), 512);
        assert_eq!(out[1].left, input[0].left);
    }
}
