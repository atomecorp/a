// The offline render of an edit's piece (cahier sampler §8.4): its window of the
// untouched source, less its mean (dc), turned (reverse), then — after the
// stretcher, when the piece is stretched or pitched — laid at its length with
// its gain and its ramps (linear factors multiplied together across the piece).

/// The window `[start, end)` of `channel`, its dc removed and reversed as asked.
pub fn read_window(channel: &[f32], start: usize, end: usize, dc: bool, reverse: bool) -> Vec<f32> {
    let mut window = channel[start..end].to_vec();
    if dc && !window.is_empty() {
        let mean = window.iter().map(|value| f64::from(*value)).sum::<f64>() / window.len() as f64;
        for value in &mut window {
            *value = (f64::from(*value) - mean) as f32;
        }
    }
    if reverse {
        window.reverse();
    }
    window
}

/// `data` laid over a piece of `length` frames (cut there when longer), at `gain` × its ramps.
pub fn lay_piece(data: &[f32], length: usize, gain: f64, ramps: &[(f64, f64)]) -> Vec<f32> {
    let count = length.min(data.len());
    let span = length as f64;
    (0..count)
        .map(|index| {
            let level = ramps.iter().fold(gain, |level, (from, to)| {
                level * (from + ((to - from) * index as f64) / span)
            });
            (f64::from(data[index]) * level) as f32
        })
        .collect()
}
