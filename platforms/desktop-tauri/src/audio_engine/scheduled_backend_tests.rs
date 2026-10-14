// Sample-accurate starts on the native engine, on this machine's real output
// device: voices scheduled on rendered frames must start exactly there.
// Run with: cargo test --lib scheduled_backend_tests -- --test-threads=1
// (needs an output device; the impulses play at -40 dB: Kira mutes -60 dB and below).

use super::playback;
use super::playback_schedule::{render_clock, schedule_instance};
use super::scheduled_backend::RENDER_TAP;
use std::time::{Duration, Instant};

const IMPULSE_AT: u64 = 1000;

fn impulse_wav(sample_rate: u32) -> Vec<u8> {
    let spec = hound::WavSpec { channels: 1, sample_rate, bits_per_sample: 16, sample_format: hound::SampleFormat::Int };
    let mut cursor = std::io::Cursor::new(Vec::new());
    {
        let mut writer = hound::WavWriter::new(&mut cursor, spec).unwrap();
        // The impulse sits inside the sound: its attack is not what is measured.
        for index in 0..(sample_rate / 10) {
            writer.write_sample(if index == IMPULSE_AT as u32 { i16::MAX } else { 0i16 }).unwrap();
        }
        writer.finalize().unwrap();
    }
    cursor.into_inner()
}

#[test]
fn scheduled_voices_start_on_their_exact_rendered_frame() {
    playback::init().expect("audio engine init");
    let deadline = Instant::now() + Duration::from_secs(5);
    let clock = loop {
        if let Some(clock) = render_clock().filter(|clock| clock.frames_rendered > 0 && clock.anchor_frame.is_some()) {
            break clock;
        }
        assert!(Instant::now() < deadline, "render clock never started");
        std::thread::sleep(Duration::from_millis(10));
    };
    playback::load_clip_from_bytes("sched_test_impulse", impulse_wav(clock.sample_rate)).expect("load impulse");
    *RENDER_TAP.lock().unwrap() = Some((None, Vec::new()));
    let next = render_clock().unwrap().frames_rendered;
    // Odd offsets: nowhere near a block boundary.
    let targets = [next + 4096 + 37, next + 4096 + 37 + 12_345, next + 4096 + 37 + 12_346 + 255];
    for (index, frame) in targets.iter().enumerate() {
        let started = schedule_instance("sched_test_impulse", &format!("sched_test_voice_{index}"), 0.0, None, 0.01, 0.0, 1.0, *frame, None)
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
