// The waveform a clip shows (its media texture).

/// Up to `max_peaks` peaks (0..1) of `channels`: each the highest absolute sample, over every channel,
/// of an equal run of frames, the last run taking the rest.
pub fn waveform_peaks(channels: &[&[f32]], max_peaks: usize) -> Vec<f32> {
    let length = channels.first().map_or(0, |channel| channel.len());
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
            channels
                .iter()
                .flat_map(|channel| &channel[from..to])
                .fold(0f32, |peak, sample| peak.max(sample.abs()))
                .min(1.0)
        })
        .collect()
}
