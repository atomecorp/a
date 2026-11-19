// Level detection shared by the dynamics bricks (compressor, multiband,
// de-esser, expander): the static knee curve, a peak hold and the DC blocker
// an even-harmonic colour needs.

// Static curve of a downward compressor: the reduction in dB (never negative)
// of a level `over` dB above the threshold, with a quadratic knee `knee` dB wide.
#[inline]
pub(crate) fn knee_reduction_db(over: f32, slope: f32, knee: f32) -> f32 {
    let half = knee * 0.5;
    if over <= -half {
        0.0
    } else if over >= half {
        over * slope
    } else {
        let x = over + half;
        slope * x * x / (2.0 * knee)
    }
}

// Removes the offset an even-harmonic colour leaves (one pole at 5 Hz).
#[derive(Default, Clone, Copy)]
pub(crate) struct DcBlocker {
    input: f32,
    output: f32,
}

impl DcBlocker {
    #[inline]
    pub(crate) fn tick(&mut self, pole: f32, input: f32) -> f32 {
        let output = input - self.input + pole * self.output;
        self.input = input;
        self.output = if output.abs() < 1.0e-20 { 0.0 } else { output };
        self.output
    }
}

// Peak detector that holds the largest magnitude of the last 21–42 ms (two
// alternating half windows): a steady tone reads its peak, not its ripple.
const HOLD_HALF_MS: f32 = 21.0;

#[derive(Default, Clone, Copy)]
pub(crate) struct PeakHold {
    current: f32,
    previous: f32,
    count: u32,
    half: u32,
}

impl PeakHold {
    pub(crate) fn prepare(&mut self, sample_rate: f32) {
        self.half = ((HOLD_HALF_MS * 0.001 * sample_rate) as u32).max(1);
        self.reset();
    }

    #[inline]
    pub(crate) fn tick(&mut self, level: f32) -> f32 {
        self.current = self.current.max(level);
        self.count += 1;
        let held = self.current.max(self.previous);
        if self.count >= self.half {
            self.previous = self.current;
            self.current = 0.0;
            self.count = 0;
        }
        held
    }

    pub(crate) fn reset(&mut self) {
        self.current = 0.0;
        self.previous = 0.0;
        self.count = 0;
    }
}
