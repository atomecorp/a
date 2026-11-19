// The cue tones a page plays through the one audio engine: the Sport session's
// beeps (a sine with straight edges, so it never clicks) and the metronome's bar
// of clicks, in one of its voices (R-182: Bip, Bois, Clave, Cloche), the bar's
// first beat accented (higher) unless the accent is off.

/// A sine of `hz` for `seconds` at `rate`, `edge_seconds` of attack and release, at `gain`.
pub fn tone(hz: f64, seconds: f64, rate: f64, edge_seconds: f64, gain: f64) -> Vec<f32> {
    let frames = crate::js_round(seconds * rate) as usize;
    let edge = crate::js_round(edge_seconds * rate);
    (0..frames)
        .map(|index| {
            let at = index as f64;
            let envelope = 1f64.min(at / edge).min((frames - index) as f64 / edge);
            ((2.0 * std::f64::consts::PI * hz * at / rate).sin() * envelope * gain) as f32
        })
        .collect()
}

/// The metronome's voices: a decaying sine (the beep), a hollow wood block, a short bright clave, a bell.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ClickVoice {
    Beep,
    Wood,
    Clave,
    Bell,
}

impl ClickVoice {
    /// The voice of its index as the page names it (0 beep, 1 wood, 2 clave, 3 bell).
    pub fn from_index(index: u32) -> Option<ClickVoice> {
        match index {
            0 => Some(ClickVoice::Beep),
            1 => Some(ClickVoice::Wood),
            2 => Some(ClickVoice::Clave),
            3 => Some(ClickVoice::Bell),
            _ => None,
        }
    }
}

pub struct ClickBar {
    pub rate: f64,
    pub bpm: f64,
    pub beats: usize,
    pub click_seconds: f64,
    pub accent_hz: f64,
    pub beat_hz: f64,
    pub voice: ClickVoice,
    pub accent: bool,
}

/// The frames of one bar.
pub fn bar_frames(rate: f64, bpm: f64, beats: usize) -> usize {
    crate::js_round((60.0 / bpm) * rate * beats as f64) as usize
}

// One sample of a voice `index` frames into a click of `length` frames, at the pitch `hz`.
// Each voice is a few sines whose level falls with its own decay: the beep and the clave as the
// square of a straight decay, the wood and the bell exponentially (the bell rings longest).
fn voice_sample(voice: ClickVoice, hz: f64, index: usize, length: usize, rate: f64) -> f64 {
    let at = index as f64 / rate;
    let phase = |ratio: f64| (2.0 * std::f64::consts::PI * hz * ratio * at).sin();
    let straight = 1.0 - index as f64 / length as f64;
    match voice {
        ClickVoice::Beep => phase(1.0) * straight * straight,
        ClickVoice::Clave => {
            let short = (1.0 - 2.0 * index as f64 / length as f64).max(0.0);
            (phase(1.4) * 0.8 + phase(2.9) * 0.2) * short * short
        }
        ClickVoice::Wood => {
            let fall = (-at * 70.0).exp();
            (phase(0.55) * 0.7 + phase(1.45) * 0.3) * fall
        }
        ClickVoice::Bell => {
            let fall = (-at * 9.0).exp() * straight;
            (phase(1.0) * 0.5 + phase(2.76) * 0.3 + phase(5.4) * 0.2) * fall
        }
    }
}

/// One bar of clicks in the bar's voice: the first beat at `accent_hz` when the accent is on.
pub fn click_bar(bar: &ClickBar) -> Vec<f32> {
    let beat_frames = (60.0 / bar.bpm) * bar.rate;
    let mut pcm = vec![0f32; bar_frames(bar.rate, bar.bpm, bar.beats)];
    // The bell rings for a whole beat at most; the other voices for the click itself.
    let seconds = if bar.voice == ClickVoice::Bell {
        (60.0 / bar.bpm).min(bar.click_seconds * 8.0)
    } else {
        bar.click_seconds
    };
    let click = (crate::js_round(seconds * bar.rate) as usize).max(1);
    for beat in 0..bar.beats {
        let offset = crate::js_round(beat as f64 * beat_frames) as usize;
        let hz = if beat == 0 && bar.accent {
            bar.accent_hz
        } else {
            bar.beat_hz
        };
        for index in 0..click.min(pcm.len().saturating_sub(offset)) {
            pcm[offset + index] = voice_sample(bar.voice, hz, index, click, bar.rate) as f32;
        }
    }
    pcm
}
