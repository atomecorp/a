pub(crate) const TARGET_SAMPLE_RATE: f64 = 16_000.0;

pub(crate) fn resample_linear(
    samples: &[i16],
    input_sample_rate: f64,
    position: &mut f64,
    previous: &mut Option<i16>,
) -> Vec<i16> {
    if samples.is_empty() || input_sample_rate <= 0.0 {
        return Vec::new();
    }
    let mut source = Vec::with_capacity(samples.len() + usize::from(previous.is_some()));
    if let Some(sample) = previous.take() {
        source.push(sample);
    }
    source.extend_from_slice(samples);
    if source.len() < 2 {
        *previous = source.last().copied();
        return Vec::new();
    }

    let step = input_sample_rate / TARGET_SAMPLE_RATE;
    let mut output = Vec::with_capacity(((source.len() as f64) / step).ceil() as usize);
    while *position + 1.0 < source.len() as f64 {
        let left_index = position.floor() as usize;
        let fraction = (*position - left_index as f64) as f32;
        let left = source[left_index] as f32;
        let right = source[left_index + 1] as f32;
        output.push((left + ((right - left) * fraction)).round() as i16);
        *position += step;
    }
    *position -= (source.len() - 1) as f64;
    *previous = source.last().copied();
    output
}

#[cfg(test)]
mod tests {
    use super::resample_linear;

    #[test]
    fn converts_44100_hz_to_16000_hz_without_drift() {
        let input = vec![1200_i16; 44_100];
        let mut position = 0.0;
        let mut previous = None;
        let mut output = Vec::new();
        for chunk in input.chunks(4410) {
            output.extend(resample_linear(
                chunk,
                44_100.0,
                &mut position,
                &mut previous,
            ));
        }
        assert!((15_999..=16_001).contains(&output.len()));
        assert!(output.iter().all(|sample| *sample == 1200));
    }
}
