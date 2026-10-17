// Sample-accurate starts on the native engine, on this machine's real output
// device: voices scheduled on rendered frames must start exactly there.
// Run with: cargo test --lib scheduled_backend_tests -- --test-threads=1
// (needs an output device; the impulses play at -40 dB: Kira mutes -60 dB and below).

use super::playback;
use super::playback_schedule::{render_clock, schedule_instance};
use atome_mix_graph::voice::{VoiceEnvelope, VoiceRequest};
use super::scheduled_backend::RENDER_TAP;
use std::time::{Duration, Instant};

const IMPULSE_AT: u64 = 1000;

fn wav(sample_rate: u32, sample: impl Fn(u32) -> i16) -> Vec<u8> {
    let spec = hound::WavSpec { channels: 1, sample_rate, bits_per_sample: 16, sample_format: hound::SampleFormat::Int };
    let mut cursor = std::io::Cursor::new(Vec::new());
    {
        let mut writer = hound::WavWriter::new(&mut cursor, spec).unwrap();
        for index in 0..(sample_rate / 10) {
            writer.write_sample(sample(index)).unwrap();
        }
        writer.finalize().unwrap();
    }
    cursor.into_inner()
}

// The impulse sits inside the sound: its attack is not what is measured.
fn impulse_wav(sample_rate: u32) -> Vec<u8> {
    wav(sample_rate, |index| if index == IMPULSE_AT as u32 { i16::MAX } else { 0 })
}

fn started_clock() -> super::scheduled_backend::RenderClock {
    let deadline = Instant::now() + Duration::from_secs(5);
    loop {
        if let Some(clock) = render_clock().filter(|clock| clock.frames_rendered > 0 && clock.anchor_frame.is_some()) {
            return clock;
        }
        assert!(Instant::now() < deadline, "render clock never started");
        std::thread::sleep(Duration::from_millis(10));
    }
}

fn voice(gain: f64) -> VoiceRequest {
    VoiceRequest { gain, ..Default::default() }
}

#[test]
fn scheduled_voices_start_on_their_exact_rendered_frame() {
    playback::init().expect("audio engine init");
    let clock = started_clock();
    playback::load_clip_from_bytes("sched_test_impulse", impulse_wav(clock.sample_rate)).expect("load impulse");
    *RENDER_TAP.lock().unwrap() = Some((None, Vec::new()));
    let next = render_clock().unwrap().frames_rendered;
    // Odd offsets: nowhere near a block boundary.
    let targets = [next + 4096 + 37, next + 4096 + 37 + 12_345, next + 4096 + 37 + 12_346 + 255];
    for (index, frame) in targets.iter().enumerate() {
        let started = schedule_instance("sched_test_impulse", &format!("sched_test_voice_{index}"), &voice(0.01), *frame, None)
            .expect("schedule");
        assert_eq!(started, *frame, "a future frame is kept as is");
    }
    std::thread::sleep(Duration::from_millis(900));
    let (base, samples) = RENDER_TAP.lock().unwrap().take().unwrap();
    let base = base.expect("tap saw no block");
    let mut onsets = Vec::new();
    let mut silent = true;
    for (index, sample) in samples.iter().enumerate() {
        if sample.abs() > 0.0 && silent {
            onsets.push(base + index as u64);
        }
        silent = sample.abs() == 0.0;
    }
    let peak = samples.iter().fold(0.0f32, |peak, sample| peak.max(sample.abs()));
    eprintln!("tap base={base} samples={} peak={peak} clock={:?}", samples.len(), render_clock());
    let expected: Vec<u64> = targets.iter().map(|frame| frame + IMPULSE_AT).collect();
    assert_eq!(onsets, expected, "voices start exactly on their scheduled frames");
    let after = render_clock().unwrap();
    assert!(after.played_frame_now.unwrap() > targets[2] as f64, "the device played past the last voice");
    playback::destroy_clip("sched_test_impulse").ok();
}

// A scheduled voice's fade is rendered on every frame, from its exact start
// frame (todo/audio_to_finalize §2.2): the steady level is a 0.25 DC source.
#[test]
fn scheduled_voice_fades_are_sample_exact() {
    playback::init().expect("audio engine init");
    let clock = started_clock();
    let rate = clock.sample_rate as f64;
    playback::load_clip_from_bytes("sched_test_dc", wav(clock.sample_rate, |_| i16::MAX / 4)).expect("load dc");
    *RENDER_TAP.lock().unwrap() = Some((None, Vec::new()));
    let start = render_clock().unwrap().frames_rendered + 4096 + 101;
    let fade_frames = 1000.0;
    let envelope = VoiceEnvelope { offset_seconds: 0.0, duration_seconds: 3000.0 / rate, fade_in_seconds: fade_frames / rate, fade_out_seconds: 500.0 / rate, end_seconds: None, ..Default::default() };
    let request = VoiceRequest { gain: 0.5, envelope: Some(envelope), ..Default::default() };
    assert_eq!(schedule_instance("sched_test_dc", "sched_test_fade", &request, start, None).expect("schedule"), start);
    std::thread::sleep(Duration::from_millis(700));
    let (base, samples) = RENDER_TAP.lock().unwrap().take().unwrap();
    let at = |frame: u64| samples[(frame - base.expect("tap saw no block")) as usize];
    let steady = at(start + 1500);
    assert!(steady > 0.05, "steady level {steady}");
    assert_eq!(at(start - 1), 0.0, "silent before the voice");
    for offset in [0u64, 1, 250, 500, 999, 2600, 2999] {
        let expected = steady * envelope.gain_at(offset as f64 / rate);
        let got = at(start + offset);
        assert!((got - expected).abs() < 2e-4, "frame +{offset}: {got} vs {expected}");
    }
    assert_eq!(at(start + 3000), 0.0, "silent from the clip's end");
    playback::destroy_clip("sched_test_dc").ok();
}

// A take recorded during playback carries where it started on the playback
// clock: the host instant of its first sample and the output anchor of then.
#[test]
fn native_capture_notes_its_start_on_the_playback_clock() {
    playback::init().expect("audio engine init");
    std::thread::sleep(Duration::from_millis(300));
    let path = std::env::temp_dir().join("squirrel_sched_capture_clock.wav");
    super::recorder::start("sched_capture_clock", &path.to_string_lossy(), 0, 0).expect("record start");
    std::thread::sleep(Duration::from_millis(500));
    let result = super::recorder::stop("sched_capture_clock").expect("record stop");
    let clock = result.capture_clock.expect("capture clock noted");
    let anchor_ns = clock.anchor_host_ns.expect("playback anchor at capture start");
    assert!(clock.anchor_frame.is_some());
    assert_eq!(clock.output_sample_rate, render_clock().unwrap().sample_rate);
    // Both instants are on the same host clock: the capture starts within a buffer or so of the anchor.
    assert!((clock.first_capture_host_ns - anchor_ns).abs() < 200_000_000, "{clock:?}");
    std::fs::remove_file(path).ok();
}

// A live input runs at the output's rate (resampled when the device cannot),
// and an unknown device name is an explicit error, never another device.
#[test]
fn live_input_follows_the_output_rate_and_refuses_unknown_devices() {
    use cpal::traits::{DeviceTrait, HostTrait};
    playback::init().expect("audio engine init");
    let clock = started_clock();
    let input = atome_mix_graph::shared::LiveInput::new(clock.sample_rate as usize * 4);
    let unknown = super::live_input::sync(vec![("no such microphone".into(), input.clone())]).unwrap_err();
    assert!(unknown.contains("audio_input_device_not_found"), "{unknown}");
    let name = cpal::default_host().default_input_device().and_then(|device| device.name().ok()).expect("default input");
    super::live_input::sync(vec![(name, input.clone())]).expect("open live input");
    std::thread::sleep(Duration::from_millis(300));
    let mut drain = vec![kira::Frame::ZERO; input.available()];
    input.pull(&mut drain);
    std::thread::sleep(Duration::from_millis(1000));
    let arrived = input.available() as f64;
    super::live_input::sync(Vec::new()).expect("close live input");
    let expected = clock.sample_rate as f64;
    assert!((arrived - expected).abs() < expected * 0.08, "one second of input = one second at the output rate: {arrived} vs {expected}");
}

// Input calibration on the real devices: either the impulses are heard back
// (speaker → microphone) with a consistent residual, or none is, explicitly.
#[test]
fn input_calibration_measures_a_consistent_residual_or_says_nothing_was_heard() {
    playback::init().expect("audio engine init");
    started_clock();
    match super::calibration::measure_input_latency(None) {
        Ok(measured) => {
            eprintln!("calibration {measured:?}");
            assert!(measured.detected >= 2, "{measured:?}");
            assert!(measured.spread_frames <= 0.001 * measured.sample_rate as f64, "the impulses agree within 1 ms: {measured:?}");
        }
        Err(error) => assert!(["calibration_no_impulse_heard", "calibration_impulses_disagree"].contains(&error.as_str()), "{error}"),
    }
}


// At rest (no voice for a while) the output pauses; reading the clock wakes it
// and a voice scheduled right after still starts on its exact frame.
#[test]
fn a_resting_output_wakes_and_keeps_exact_starts() {
    playback::init().expect("audio engine init");
    let clock = started_clock();
    let deadline = Instant::now() + Duration::from_secs(12);
    while crate::output_idle::is_active() {
        assert!(Instant::now() < deadline, "the idle output never rested");
        std::thread::sleep(Duration::from_millis(100));
    }
    let woken = render_clock().expect("clock after rest");
    assert!(crate::output_idle::is_active() && woken.anchor_frame.is_some(), "reading the clock wakes the output: {woken:?}");
    playback::load_clip_from_bytes("sched_rest_impulse", impulse_wav(clock.sample_rate)).expect("load impulse");
    *RENDER_TAP.lock().unwrap() = Some((None, Vec::new()));
    let target = render_clock().unwrap().frames_rendered + 4096 + 77;
    assert_eq!(schedule_instance("sched_rest_impulse", "sched_rest_voice", &voice(0.01), target, None).expect("schedule"), target);
    std::thread::sleep(Duration::from_millis(600));
    let (base, samples) = RENDER_TAP.lock().unwrap().take().unwrap();
    let onset = samples.iter().position(|sample| sample.abs() > 0.0).map(|index| base.unwrap() + index as u64);
    assert_eq!(onset, Some(target + IMPULSE_AT), "exact start after waking");
    playback::destroy_clip("sched_rest_impulse").ok();
}
