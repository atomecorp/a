// R-372, heard: a sound clip quantized by its warp markers (eVe
// project_view_timeline_warp.js: each attack pinned on its grid line) is
// played by the engine's warped voice with every attack on the grid — the hits
// played late or early land where the grid says, none lost, none doubled, and
// the sound between them keeps its pitch.

use atome_mix_graph::voice::{VoiceEnvelope, VoiceRequest, build_voice_sound};
use atome_mix_graph::warp_voice::VoiceWarp;
use kira::Frame;
use kira::info::MockInfoBuilder;
use kira::sound::SoundData;
use kira::sound::static_sound::StaticSoundData;
use std::f32::consts::TAU;
use std::sync::Arc;

const RATE: u32 = 48_000;
const BLOCK: usize = 512;
const SECONDS: f64 = 3.0;
// 120 bpm: an eighth is 0.25 s.
const EIGHTH: f64 = 0.25;
// Hits played around the eighths, up to 70 ms off.
const PLAYED: [f64; 6] = [0.31, 0.52, 0.94, 1.43, 2.06, 2.27];

// A hit: a 1 kHz tone with a sharp attack, dying in 40 ms; between hits, a quiet 220 Hz drone.
fn source() -> StaticSoundData {
    let frames: Arc<[Frame]> = (0..(SECONDS * RATE as f64) as usize)
        .map(|index| {
            let t = index as f64 / RATE as f64;
            let hit: f64 = PLAYED
                .iter()
                .filter(|&&at| t >= at)
                .map(|&at| (-(t - at) / 0.04).exp() * (TAU as f64 * 1000.0 * (t - at)).sin())
                .sum();
            Frame::from_mono((0.6 * hit + 0.02 * (TAU as f64 * 220.0 * t).sin()) as f32)
        })
        .collect();
    StaticSoundData {
        sample_rate: RATE,
        frames,
        settings: Default::default(),
        slice: None,
    }
}

// The map the quantize writes: each played hit (source time) pinned at its nearest eighth (clip time).
fn quantized() -> Vec<[f64; 2]> {
    let mut points = vec![[0.0, 0.0]];
    points.extend(
        PLAYED
            .iter()
            .map(|&at| [(at / EIGHTH).round() * EIGHTH, at]),
    );
    points.push([SECONDS, SECONDS]);
    points
}

fn render(points: Vec<[f64; 2]>) -> Vec<f32> {
    let request = VoiceRequest {
        envelope: Some(VoiceEnvelope {
            duration_seconds: SECONDS,
            ..VoiceEnvelope::default()
        }),
        warp: Some(VoiceWarp {
            points,
            pitch_semitones: 0.0,
            tape: false,
        }),
        ..VoiceRequest::default()
    };
    let (mut sound, _handle) = build_voice_sound(source(), &request)
        .expect("voice")
        .into_sound()
        .expect("sound");
    let info = MockInfoBuilder::new().build();
    let mut left = Vec::new();
    let mut block = vec![Frame::ZERO; BLOCK];
    while left.len() < (SECONDS * RATE as f64) as usize + RATE as usize && !sound.finished() {
        sound.on_start_processing();
        sound.process(&mut block, 1.0 / RATE as f64, &info);
        left.extend(block.iter().map(|frame| frame.left));
    }
    left
}

// Where the hits are heard: the 1 ms windows whose level rises above a third of the loudest after 80 ms below it.
fn attacks(signal: &[f32]) -> Vec<f64> {
    let window = RATE as usize / 1000;
    let levels: Vec<f32> = signal
        .chunks(window)
        .map(|chunk| chunk.iter().fold(0.0f32, |peak, x| peak.max(x.abs())))
        .collect();
    let loudest = levels.iter().copied().fold(0.0f32, f32::max);
    let mut found = Vec::new();
    let mut quiet = 80;
    for (index, &level) in levels.iter().enumerate() {
        if level > loudest / 3.0 {
            if quiet >= 80 {
                // The attack itself: the first sample of the window over the threshold.
                let start = index * window;
                let first = signal[start..(start + window).min(signal.len())]
                    .iter()
                    .position(|x| x.abs() > loudest / 3.0)
                    .unwrap_or(0);
                found.push((start + first) as f64 / RATE as f64);
            }
            quiet = 0;
        } else {
            quiet += 1;
        }
    }
    found
}

#[test]
fn quantized_hits_are_heard_on_the_grid() {
    let unquantized = attacks(&render(vec![[0.0, 0.0], [SECONDS, SECONDS]]));
    let heard = attacks(&render(quantized()));
    let grid: Vec<f64> = PLAYED
        .iter()
        .map(|&at| (at / EIGHTH).round() * EIGHTH)
        .collect();
    println!("played {unquantized:.3?}\nheard  {heard:.3?}\ngrid   {grid:.3?}");
    assert_eq!(
        unquantized.len(),
        PLAYED.len(),
        "every hit is found as played"
    );
    assert_eq!(
        heard.len(),
        grid.len(),
        "no hit lost nor doubled by the warp"
    );
    for (heard, line) in heard.iter().zip(&grid) {
        assert!(
            (heard - line).abs() < 0.003,
            "a hit heard at {heard:.4} s, its line at {line:.4} s"
        );
    }
}

// Each hit keeps its 1 kHz: the rising zero crossings over its first 20 ms, past its attack, counted per second.
#[test]
fn quantized_hits_keep_their_pitch() {
    let out = render(quantized());
    for &line in PLAYED
        .iter()
        .map(|at| (at / EIGHTH).round() * EIGHTH)
        .collect::<Vec<_>>()
        .iter()
    {
        let from = ((line + 0.003) * RATE as f64) as usize;
        let to = from + RATE as usize / 50;
        let crossings: Vec<f64> = (from..to)
            .filter(|&i| out[i - 1] < 0.0 && out[i] >= 0.0)
            .map(|i| (i - 1) as f64 + out[i - 1] as f64 / (out[i - 1] - out[i]) as f64)
            .collect();
        let hz = (crossings.len() - 1) as f64 * RATE as f64
            / (crossings[crossings.len() - 1] - crossings[0]);
        println!("hit at {line:.3} s: {hz:.1} Hz");
        assert!(
            (hz - 1000.0).abs() < 6.0,
            "the hit at {line:.3} s sounds at {hz:.1} Hz"
        );
    }
}
