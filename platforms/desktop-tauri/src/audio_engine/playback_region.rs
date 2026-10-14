// Normalization of the source region a voice plays (start, duration).

use kira::sound::static_sound::StaticSoundData;

pub(super) fn sound_duration_seconds(data: &StaticSoundData) -> Result<f64, String> {
    if data.sample_rate == 0 {
        return Err("Clip sample rate is zero".to_string());
    }
    Ok(data.frames.len() as f64 / data.sample_rate as f64)
}

pub(super) fn playback_min_region_duration(sample_rate: u32, source_duration: f64) -> Result<f64, String> {
    if !source_duration.is_finite() || source_duration <= 0.0 {
        return Err("Clip has no playable duration".to_string());
    }
    let frame_duration = 1.0 / sample_rate.max(1) as f64;
    Ok(frame_duration.max(0.0005).min(source_duration))
}

pub(super) fn normalize_playback_start(
    requested_start: f64,
    source_duration: f64,
    min_region_duration: f64,
) -> Result<f64, String> {
    if !requested_start.is_finite() {
        return Err("start_seconds must be finite".to_string());
    }
    let latest_start = (source_duration - min_region_duration).max(0.0);
    Ok(requested_start.max(0.0).min(latest_start))
}

pub(super) fn normalize_playback_duration(
    requested_duration: Option<f64>,
    min_region_duration: f64,
    max_duration: f64,
) -> Result<Option<f64>, String> {
    if !max_duration.is_finite() || max_duration <= 0.0 {
        return Ok(None);
    }
    let Some(duration) = requested_duration else {
        return Ok(None);
    };
    if !duration.is_finite() {
        return Err("duration_seconds must be finite when provided".to_string());
    }
    if duration <= 0.0 {
        return Ok(None);
    }
    if max_duration <= min_region_duration {
        return Ok(None);
    }
    let bounded_duration = duration.max(min_region_duration).min(max_duration);
    if bounded_duration >= max_duration {
        Ok(None)
    } else {
        Ok(Some(bounded_duration))
    }
}

#[cfg(test)]
mod playback_region_tests {
    use super::{
        normalize_playback_duration, normalize_playback_start, playback_min_region_duration,
    };

    #[test]
    fn min_region_never_exceeds_tiny_clip_duration() {
        let min_region = playback_min_region_duration(44_100, 0.0002).unwrap();
        assert_eq!(min_region, 0.0002);
    }

    #[test]
    fn start_is_bounded_to_a_playable_region() {
        let min_region = playback_min_region_duration(44_100, 10.0).unwrap();
        let start = normalize_playback_start(20.0, 10.0, min_region).unwrap();
        assert!(start <= 10.0 - min_region);
    }

    #[test]
    fn duration_normalization_does_not_clamp_with_reversed_bounds() {
        let duration = normalize_playback_duration(Some(0.12), 0.0005, 0.0002).unwrap();
        assert_eq!(duration, None);
    }

    #[test]
    fn duration_rejects_non_finite_values() {
        let error = normalize_playback_duration(Some(f64::NAN), 0.0005, 1.0).unwrap_err();
        assert_eq!(error, "duration_seconds must be finite when provided");
    }

    #[test]
    fn explicit_short_duration_is_promoted_to_min_region() {
        let duration = normalize_playback_duration(Some(0.0001), 0.0005, 1.0).unwrap();
        assert_eq!(duration, Some(0.0005));
    }
}
