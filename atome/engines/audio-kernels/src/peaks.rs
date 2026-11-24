// The waveform a clip shows (its media texture).

/// Up to `max_peaks` peaks (0..1) of `channels`: each the highest absolute sample, over every channel,
/// of an equal run of frames, the last run taking the rest.
pub fn waveform_peaks(channels: &[&[f32]], max_peaks: usize) -> Vec<f32> {
    let length = channels.first().map_or(0, |channel| channel.len());
    frame_peaks(length, max_peaks, |frame| {
        channels
            .iter()
            .fold(0f32, |peak, channel| peak.max(channel[frame].abs()))
    })
}

/// The same peaks over `length` frames read one at a time: `level(frame)` is the frame's highest
/// absolute sample (a decoded sound's interleaved frames, read in place).
pub fn frame_peaks(length: usize, max_peaks: usize, level: impl Fn(usize) -> f32) -> Vec<f32> {
    if length == 0 {
        return Vec::new();
    }
    let count = max_peaks.clamp(1, length);
    let per_peak = (length / count).max(1);
    (0..count)
        .map(|index| {
            let from = index * per_peak;
            let to = if index == count - 1 {
                length
            } else {
                length.min(from + per_peak)
            };
            (from..to)
                .fold(0f32, |peak, frame| peak.max(level(frame)))
                .min(1.0)
        })
        .collect()
}
