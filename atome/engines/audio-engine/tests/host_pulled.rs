// Host-pulled output (AUv3): a fake plugin host pulls 128-frame quanta with
// host instants; a voice scheduled on a rendered frame comes out exactly
// there, and the render clock maps frames to the host's instants.

use atome_audio_engine::{commands, host_output, playback};
use serde_json::json;
use std::sync::{Arc, Mutex};
use std::time::Duration;

const RATE: u32 = 48_000;
const IMPULSE_AT: usize = 500;

fn impulse_wav() -> Vec<u8> {
    let frames = 4800usize;
    let mut bytes = Vec::with_capacity(44 + frames * 2);
    bytes.extend_from_slice(b"RIFF");
    bytes.extend_from_slice(&((36 + frames * 2) as u32).to_le_bytes());
    bytes.extend_from_slice(b"WAVEfmt ");
    bytes.extend_from_slice(&16u32.to_le_bytes());
    bytes.extend_from_slice(&1u16.to_le_bytes());
    bytes.extend_from_slice(&1u16.to_le_bytes());
    bytes.extend_from_slice(&RATE.to_le_bytes());
    bytes.extend_from_slice(&(RATE * 2).to_le_bytes());
    bytes.extend_from_slice(&2u16.to_le_bytes());
    bytes.extend_from_slice(&16u16.to_le_bytes());
    bytes.extend_from_slice(b"data");
    bytes.extend_from_slice(&((frames * 2) as u32).to_le_bytes());
    for index in 0..frames {
        let sample: i16 = if index == IMPULSE_AT { i16::MAX / 2 } else { 0 };
        bytes.extend_from_slice(&sample.to_le_bytes());
    }
    bytes
}

#[test]
fn a_plugin_host_pulls_exact_frames_on_its_own_clock() {
    host_output::use_host_output(RATE);
    playback::init().expect("engine in host mode");
    // The fake host: one quantum every 128 frames of its own clock (sped up 4x).
    let heard: Arc<Mutex<Vec<f32>>> = Arc::new(Mutex::new(Vec::new()));
    let host_heard = Arc::clone(&heard);
    std::thread::spawn(move || {
        let (mut left, mut right) = (vec![0.0f32; 128], vec![0.0f32; 128]);
        let mut host_ns: i64 = 1_000_000_000;
        loop {
            let popped = host_output::render(&mut left, &mut right, host_ns);
            host_heard.lock().unwrap().extend_from_slice(&left[..popped]);
            host_ns += (128 * 1_000_000_000 / RATE as i64) as i64;
            std::thread::sleep(Duration::from_micros(600));
        }
    });
    commands::load_clip_from_bytes("host_impulse", impulse_wav()).expect("load");
    let clock = commands::render_clock().expect("clock")["clock"].clone();
    assert!(clock["anchor_host_ns"].as_i64().unwrap_or(0) >= 1_000_000_000, "anchored on the host's clock: {clock}");
    let target = clock["frames_rendered"].as_u64().unwrap() + 4096 + 41;
    let scheduled = commands::dispatch("audio_schedule_instances", &json!({ "voices": [{
        "assetId": "host_impulse", "voiceId": "host_voice", "startRenderFrame": target, "gain": 1.0
    }] }), None).expect("schedule");
    assert_eq!(scheduled["start_render_frames"][0].as_u64(), Some(target));
    std::thread::sleep(Duration::from_millis(1200));
    let heard = heard.lock().unwrap();
    let onset = heard.iter().position(|sample| sample.abs() > 0.0);
    assert_eq!(onset.map(|index| index as u64), Some(target + IMPULSE_AT as u64), "the impulse comes out on its exact rendered frame");
}
