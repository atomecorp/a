// The analysis of a recorded WAV file the remote control asks for.
use super::*;

pub(super) fn analyze_wav_file(path: &Path) -> Result<JsonValue, String> {
    let metadata = stdfs::metadata(path)
        .map_err(|error| format!("Unable to read audio file metadata: {error}"))?;
    let mut reader =
        hound::WavReader::open(path).map_err(|error| format!("Unable to open WAV: {error}"))?;
    let spec = reader.spec();
    let channels = usize::from(spec.channels.max(1));
    let sample_rate = spec.sample_rate.max(1);
    let total_samples = reader.duration() as usize;
    let frame_count = total_samples / channels;
    let duration_sec = frame_count as f64 / sample_rate as f64;
    let window_frames = ((sample_rate as f64 * 0.1).round() as usize).max(1);
    let silence_threshold = 0.001_f64;

    let mut sample_count: usize = 0;
    let mut frame_index: usize = 0;
    let mut window_sum_sq = 0.0_f64;
    let mut window_peak = 0.0_f64;
    let mut window_sample_count = 0usize;
    let mut sum_sq = 0.0_f64;
    let mut peak = 0.0_f64;
    let mut non_silent_window_count = 0usize;
    let mut silent_window_count = 0usize;
    let mut first_non_silent_sec: Option<f64> = None;
    let mut last_non_silent_sec: Option<f64> = None;
    let mut windows = Vec::new();

    let push_window = |window_start_frame: usize,
                       window_sample_count: usize,
                       window_sum_sq: f64,
                       window_peak: f64,
                       windows: &mut Vec<JsonValue>,
                       non_silent_window_count: &mut usize,
                       silent_window_count: &mut usize,
                       first_non_silent_sec: &mut Option<f64>,
                       last_non_silent_sec: &mut Option<f64>| {
        if window_sample_count == 0 {
            return;
        }
        let rms = (window_sum_sq / window_sample_count as f64).sqrt();
        let start_sec = window_start_frame as f64 / sample_rate as f64;
        let frames_in_window = (window_sample_count / channels).max(1);
        let end_sec = (window_start_frame + frames_in_window) as f64 / sample_rate as f64;
        let non_silent = rms >= silence_threshold || window_peak >= silence_threshold;
        if non_silent {
            *non_silent_window_count += 1;
            if first_non_silent_sec.is_none() {
                *first_non_silent_sec = Some(start_sec);
            }
            *last_non_silent_sec = Some(end_sec);
        } else {
            *silent_window_count += 1;
        }
        if windows.len() < 240 {
            windows.push(json!({
                "start_sec": start_sec,
                "end_sec": end_sec,
                "rms": rms,
                "peak": window_peak,
                "non_silent": non_silent
            }));
        }
    };

    match spec.sample_format {
        hound::SampleFormat::Float => {
            for sample in reader.samples::<f32>() {
                let value =
                    sample.map_err(|error| format!("Unable to read float sample: {error}"))? as f64;
                let abs = value.abs();
                peak = peak.max(abs);
                sum_sq += value * value;
                window_peak = window_peak.max(abs);
                window_sum_sq += value * value;
                sample_count += 1;
                window_sample_count += 1;
                if sample_count.is_multiple_of(channels) {
                    frame_index += 1;
                    if frame_index.is_multiple_of(window_frames) {
                        let start_frame = frame_index.saturating_sub(window_frames);
                        push_window(
                            start_frame,
                            window_sample_count,
                            window_sum_sq,
                            window_peak,
                            &mut windows,
                            &mut non_silent_window_count,
                            &mut silent_window_count,
                            &mut first_non_silent_sec,
                            &mut last_non_silent_sec,
                        );
                        window_sum_sq = 0.0;
                        window_peak = 0.0;
                        window_sample_count = 0;
                    }
                }
            }
        }
        hound::SampleFormat::Int => {
            let scale =
                ((1_i64 << (u32::from(spec.bits_per_sample).saturating_sub(1))) - 1).max(1) as f64;
            for sample in reader.samples::<i32>() {
                let raw =
                    sample.map_err(|error| format!("Unable to read integer sample: {error}"))?;
                let value = raw as f64 / scale;
                let abs = value.abs();
                peak = peak.max(abs);
                sum_sq += value * value;
                window_peak = window_peak.max(abs);
                window_sum_sq += value * value;
                sample_count += 1;
                window_sample_count += 1;
                if sample_count.is_multiple_of(channels) {
                    frame_index += 1;
                    if frame_index.is_multiple_of(window_frames) {
                        let start_frame = frame_index.saturating_sub(window_frames);
                        push_window(
                            start_frame,
                            window_sample_count,
                            window_sum_sq,
                            window_peak,
                            &mut windows,
                            &mut non_silent_window_count,
                            &mut silent_window_count,
                            &mut first_non_silent_sec,
                            &mut last_non_silent_sec,
                        );
                        window_sum_sq = 0.0;
                        window_peak = 0.0;
                        window_sample_count = 0;
                    }
                }
            }
        }
    }

    if window_sample_count > 0 {
        let start_frame = frame_index.saturating_sub(window_sample_count / channels);
        push_window(
            start_frame,
            window_sample_count,
            window_sum_sq,
            window_peak,
            &mut windows,
            &mut non_silent_window_count,
            &mut silent_window_count,
            &mut first_non_silent_sec,
            &mut last_non_silent_sec,
        );
    }

    let rms = if sample_count > 0 {
        (sum_sq / sample_count as f64).sqrt()
    } else {
        0.0
    };

    Ok(json!({
        "path": path.to_string_lossy(),
        "file_size": metadata.len(),
        "sample_rate": spec.sample_rate,
        "channels": spec.channels,
        "bits_per_sample": spec.bits_per_sample,
        "sample_format": format!("{:?}", spec.sample_format),
        "sample_count": sample_count,
        "frame_count": frame_count,
        "duration_sec": duration_sec,
        "rms": rms,
        "peak": peak,
        "silence_threshold": silence_threshold,
        "non_silent_window_count": non_silent_window_count,
        "silent_window_count": silent_window_count,
        "first_non_silent_sec": first_non_silent_sec,
        "last_non_silent_sec": last_non_silent_sec,
        "windows_truncated": frame_count > window_frames * 240,
        "windows": windows
    }))
}
