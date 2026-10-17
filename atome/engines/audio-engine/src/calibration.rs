// Input calibration on the native engine (todo/audio_to_finalize §2.1): a train
// of impulses is scheduled on exact rendered frames while the chosen input is
// captured on the same host clock as a take (`note_capture_start`). Each
// impulse heard back (loopback cable, or microphone in front of the speaker)
// lands some frames after the frame it was played on: that residual is what a
// take placed by `placeExactTake` still carries, i.e. the input calibration.

use super::playback;
use super::scheduled_backend::{self, note_capture_start, CaptureClock};
use atome_mix_graph::voice::VoiceSound;
use cpal::traits::{DeviceTrait, StreamTrait};
use cpal::{FromSample, Sample, SizedSample};
use kira::sound::static_sound::StaticSoundData;
use kira::Frame;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

const IMPULSES: u64 = 4;
const IMPULSE_FRAMES: usize = 128;
const LEAD_FRAMES: u64 = 4096;
// A detected onset needs this much quiet before it (fraction of a second).
const QUIET_SECONDS: f64 = 0.2;
const THRESHOLD_OF_PEAK: f32 = 0.3;
const INLIER_SECONDS: f64 = 0.001;

#[derive(serde::Serialize, Clone, Debug)]
pub struct InputCalibration {
    // Median residual of the heard impulses, in output frames and seconds.
    pub offset_frames: f64,
    pub offset_seconds: f64,
    pub offsets_frames: Vec<f64>,
    pub spread_frames: f64,
    pub detected: usize,
    pub expected: usize,
    pub sample_rate: u32,
    pub input_sample_rate: u32,
}

fn impulse_sound(sample_rate: u32) -> VoiceSound {
    let frames: Arc<[Frame]> = (0..IMPULSE_FRAMES).map(|index| Frame::from_mono(if index == 0 { 0.9 } else { 0.0 })).collect();
    let data = StaticSoundData { sample_rate, frames, settings: Default::default(), slice: None };
    VoiceSound { data, envelope: None, control: None }
}

struct Capture {
    samples: Mutex<Vec<f32>>,
    clock: Mutex<Option<CaptureClock>>,
}

fn capture_callback<T>(channels: usize, capture: Arc<Capture>) -> impl FnMut(&[T], &cpal::InputCallbackInfo)
where T: Sample + SizedSample, f32: FromSample<T> {
    move |data: &[T], info| {
        note_capture_start(&capture.clock, info);
        let Ok(mut samples) = capture.samples.try_lock() else { return };
        let room = samples.capacity() - samples.len();
        samples.extend(data.chunks(channels.max(1)).take(room).map(|frame| f32::from_sample(frame[0])));
    }
}

// Onsets of the capture: first sample above THRESHOLD_OF_PEAK × peak after QUIET_SECONDS of less.
fn onsets(samples: &[f32], rate: u32) -> Vec<usize> {
    let peak = samples.iter().fold(0.0f32, |peak, sample| peak.max(sample.abs()));
    if peak < 1e-3 {
        return Vec::new();
    }
    let threshold = peak * THRESHOLD_OF_PEAK;
    let quiet = (QUIET_SECONDS * f64::from(rate)) as usize;
    let mut found = Vec::new();
    let mut last_loud: Option<usize> = None;
    for (index, sample) in samples.iter().enumerate() {
        if sample.abs() < threshold {
            continue;
        }
        if last_loud.map_or(true, |loud| index - loud > quiet) {
            found.push(index);
        }
        last_loud = Some(index);
    }
    found
}

pub fn measure_input_latency(device_name: Option<&str>) -> Result<InputCalibration, String> {
    playback::init().map_err(|error| format!("calibration_engine_unavailable: {error}"))?;
    let deadline = Instant::now() + Duration::from_secs(5);
    let clock = loop {
        if let Some(clock) = scheduled_backend::render_clock().filter(|clock| clock.anchor_frame.is_some()) {
            break clock;
        }
        if Instant::now() > deadline {
            return Err("calibration_render_clock_unavailable".into());
        }
        std::thread::sleep(Duration::from_millis(10));
    };
    let rate = clock.sample_rate;
    let device = super::recorder::input_device(device_name)?;
    let config = device.default_input_config().map_err(|error| format!("calibration_input_config: {error}"))?;
    let input_rate = config.sample_rate().0;
    let spacing = u64::from(rate) / 2;
    let capture = Arc::new(Capture { samples: Mutex::new(Vec::with_capacity(input_rate as usize * 4)), clock: Mutex::new(None) });
    let channels = usize::from(config.channels());
    let error = |error| eprintln!("[audio_engine::calibration] input error: {error}");
    let stream = match config.sample_format() {
        cpal::SampleFormat::F32 => device.build_input_stream(&config.config(), capture_callback::<f32>(channels, Arc::clone(&capture)), error, None),
        cpal::SampleFormat::I16 => device.build_input_stream(&config.config(), capture_callback::<i16>(channels, Arc::clone(&capture)), error, None),
        cpal::SampleFormat::U16 => device.build_input_stream(&config.config(), capture_callback::<u16>(channels, Arc::clone(&capture)), error, None),
        other => return Err(format!("calibration_sample_format_unsupported: {other:?}")),
    }.map_err(|error| format!("calibration_input_stream: {error}"))?;
    stream.play().map_err(|error| format!("calibration_input_play: {error}"))?;
    // The input opens first: the impulses are played once it captures.
    std::thread::sleep(Duration::from_millis(250));
    let first = scheduled_backend::render_clock().map(|clock| clock.frames_rendered).unwrap_or(clock.frames_rendered) + LEAD_FRAMES;
    let played: Vec<u64> = (0..IMPULSES)
        .map(|index| scheduled_backend::schedule(&format!("calibration_impulse_{index}"), impulse_sound(rate), first + index * spacing))
        .collect();
    let last = *played.last().unwrap_or(&first);
    let deadline = Instant::now() + Duration::from_secs(5);
    while scheduled_backend::render_clock().and_then(|clock| clock.played_frame_now).unwrap_or(0.0) < (last + spacing) as f64 {
        if Instant::now() > deadline {
            return Err("calibration_playback_stalled".into());
        }
        std::thread::sleep(Duration::from_millis(20));
    }
    drop(stream);
    let capture_clock = capture.clock.lock().ok().and_then(|clock| *clock).ok_or("calibration_capture_clock_missing")?;
    let (anchor_frame, anchor_ns) = capture_clock.anchor_frame.zip(capture_clock.anchor_host_ns).ok_or("calibration_capture_anchor_missing")?;
    // The rendered frame playing when the capture's first sample was taken (as `placeExactTake`).
    let capture_start = anchor_frame as f64 + ((capture_clock.first_capture_host_ns - anchor_ns) as f64 / 1e9) * f64::from(rate);
    let samples = capture.samples.lock().map_err(|_| "calibration_capture_lock")?.clone();
    let heard: Vec<f64> = onsets(&samples, input_rate).into_iter()
        .map(|index| capture_start + index as f64 * f64::from(rate) / f64::from(input_rate)).collect();
    // Each heard impulse against the played one it follows (within one spacing).
    let mut offsets: Vec<f64> = heard.iter().filter_map(|frame| played.iter()
        .map(|played| frame - *played as f64).filter(|offset| *offset >= -(spacing as f64) / 4.0 && *offset < spacing as f64 / 2.0)
        .reduce(|best, offset| if offset.abs() < best.abs() { offset } else { best })).collect();
    if offsets.is_empty() {
        return Err("calibration_no_impulse_heard".into());
    }
    offsets.sort_by(|left, right| left.total_cmp(right));
    // A noise mistaken for an impulse is left out: the residual is the median
    // of the impulses that agree with it within INLIER_SECONDS.
    let median = offsets[offsets.len() / 2];
    let inliers: Vec<f64> = offsets.iter().copied().filter(|offset| (offset - median).abs() <= INLIER_SECONDS * f64::from(rate)).collect();
    if inliers.len() < 2 {
        return Err("calibration_impulses_disagree".into());
    }
    let offset = inliers[inliers.len() / 2];
    Ok(InputCalibration {
        offset_frames: offset, offset_seconds: offset / f64::from(rate),
        spread_frames: inliers[inliers.len() - 1] - inliers[0], detected: inliers.len(), expected: IMPULSES as usize,
        offsets_frames: offsets, sample_rate: rate, input_sample_rate: input_rate,
    })
}

#[cfg(test)]
mod tests {
    use super::onsets;

    #[test]
    fn onsets_need_quiet_before_them() {
        let mut samples = vec![0.0f32; 48_000];
        for at in [1000usize, 1010, 30_000] {
            samples[at] = 0.8;
        }
        assert_eq!(onsets(&samples, 48_000), vec![1000, 30_000], "a ring right after an onset is not another one");
        assert!(onsets(&vec![0.0f32; 4800], 48_000).is_empty(), "silence has no onset");
    }
}
