// The waveform a clip shows (its media texture).

/// Up to `max_peaks` peaks (0..1) of `channels`: each the highest absolute sample, over every channel,
/// of its equal share of the frames (`frame_peaks`).
pub fn waveform_peaks(channels: &[&[f32]], max_peaks: usize) -> Vec<f32> {
    let length = channels.first().map_or(0, |channel| channel.len());
    frame_peaks(length, max_peaks, |frame| {
        channels
            .iter()
            .fold(0f32, |peak, channel| peak.max(channel[frame].abs()))
    })
}

/// The same peaks over `length` frames read one at a time: `level(frame)` is the frame's highest
/// absolute sample (a decoded sound's interleaved frames, read in place). Peak `index` covers the
/// frames from `index · length / count` to `(index + 1) · length / count`: every peak the same share
/// of the sound, so that peak `i` lies at the fraction `i / count` of it. A last peak taking the rest
/// slid the whole waveform once the count was high (a zoomed clip's 65 536 peaks: over a second).
pub fn frame_peaks(length: usize, max_peaks: usize, level: impl Fn(usize) -> f32) -> Vec<f32> {
    if length == 0 {
        return Vec::new();
    }
    let count = max_peaks.clamp(1, length);
    let edge = |index: usize| (index as u128 * length as u128 / count as u128) as usize;
    (0..count)
        .map(|index| {
            (edge(index)..edge(index + 1))
                .fold(0f32, |peak, frame| peak.max(level(frame)))
                .min(1.0)
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::frame_peaks;

    #[test]
    fn every_peak_covers_its_own_share_of_the_sound() {
        // 30 s at 44.1 kHz in 65 536 peaks: a click at 15.3 s lies at 15.3 / 30 of them.
        let length = 1_323_000;
        let click = 674_730;
        let peaks = frame_peaks(
            length,
            65_536,
            |frame| if frame == click { 1.0 } else { 0.0 },
        );
        assert_eq!(peaks.len(), 65_536);
        let at = peaks.iter().position(|peak| *peak == 1.0).unwrap();
        assert_eq!(at, click * 65_536 / length);
        assert!((at as f64 / 65_536.0 - 15.3 / 30.0).abs() < 1e-4, "{at}");
    }

    #[test]
    fn every_frame_is_read_once_and_a_short_sound_gets_a_peak_per_frame() {
        let read = std::cell::Cell::new(0usize);
        let peaks = frame_peaks(1_000, 7, |_| {
            read.set(read.get() + 1);
            0.5
        });
        assert_eq!((peaks.len(), read.get()), (7, 1_000));
        assert_eq!(
            frame_peaks(5, 256, |frame| frame as f32 / 10.0),
            vec![0.0, 0.1, 0.2, 0.3, 0.4]
        );
    }
}
