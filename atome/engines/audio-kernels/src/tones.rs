// The cue tones a page plays through the one audio engine: the Sport session's
// beeps (a sine with straight edges, so it never clicks) and the metronome's bar
// of clicks (a decaying sine per beat, the bar's first beat accented).

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

pub struct ClickBar {
    pub rate: f64,
    pub bpm: f64,
    pub beats: usize,
    pub click_seconds: f64,
    pub accent_hz: f64,
    pub beat_hz: f64,
}

/// The frames of one bar.
pub fn bar_frames(rate: f64, bpm: f64, beats: usize) -> usize {
    crate::js_round((60.0 / bpm) * rate * beats as f64) as usize
}

/// One bar of clicks: each beat a sine whose level falls as the square of a straight decay.
pub fn click_bar(bar: &ClickBar) -> Vec<f32> {
    let beat_frames = (60.0 / bar.bpm) * bar.rate;
    let mut pcm = vec![0f32; bar_frames(bar.rate, bar.bpm, bar.beats)];
    let click = crate::js_round(bar.click_seconds * bar.rate) as usize;
    for beat in 0..bar.beats {
        let offset = crate::js_round(beat as f64 * beat_frames) as usize;
        let hz = if beat == 0 {
            bar.accent_hz
        } else {
            bar.beat_hz
        };
        for index in 0..click.min(pcm.len().saturating_sub(offset)) {
            let decay = 1.0 - index as f64 / click as f64;
            pcm[offset + index] =
                ((2.0 * std::f64::consts::PI * hz * index as f64 / bar.rate).sin() * decay * decay)
                    as f32;
        }
    }
    pcm
}
