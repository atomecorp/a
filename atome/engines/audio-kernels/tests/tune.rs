// R-372, heard rather than trusted: a sung line is synthesized (a voice of 21
// harmonics shaped by two formants, at a pitch that may waver), its notes are
// found, retuned and rendered, and the render is listened to — its pitch read
// again, its formants measured, its noise above the voice's band weighed.

use atome_audio_kernels::tune::{NoteTune, find_notes, render_tune, track_pitch};
use std::f32::consts::TAU;

const RATE: f32 = 48_000.0;

// A formant envelope: peaks near 700 Hz and 1200 Hz (an « a »), the same whatever the pitch.
fn formants(hz: f32) -> f32 {
    let peak = |centre: f32, width: f32| (-((hz - centre) / width).powi(2)).exp();
    0.05 + peak(700.0, 160.0) + 0.6 * peak(1200.0, 200.0)
}

// A voice whose pitch (MIDI note, fractional) follows `note(t)`; harmonics below 6 kHz only.
fn voice(seconds: f32, note: impl Fn(f32) -> f32) -> Vec<f32> {
    let mut phase = 0.0f32;
    (0..(seconds * RATE) as usize)
        .map(|index| {
            let t = index as f32 / RATE;
            let hz = 440.0 * ((note(t) - 69.0) / 12.0).exp2();
            phase = (phase + hz / RATE).fract();
            let fade = (t / 0.01).min(1.0).min((seconds - t) / 0.01);
            let sum: f32 = (1..=21)
                .filter(|k| *k as f32 * hz < 6000.0)
                .map(|k| {
                    formants(k as f32 * hz) * (TAU * phase * k as f32).sin() / (k as f32).sqrt()
                })
                .sum();
            0.2 * sum * fade
        })
        .collect()
}

fn readings_between(track: &atome_audio_kernels::tune::PitchTrack, from: f32, to: f32) -> Vec<f32> {
    let first = (from * RATE) as usize / track.hop;
    let last = (to * RATE) as usize / track.hop;
    track.notes[first..last]
        .iter()
        .copied()
        .filter(|note| *note > 0.0)
        .collect()
}

fn median(mut values: Vec<f32>) -> f32 {
    values.sort_by(f32::total_cmp);
    values[values.len() / 2]
}

fn cents(a: f32, b: f32) -> f32 {
    (a - b) * 100.0
}

// A 4-pole high-pass at `hz` (two cascaded RBJ biquads).
fn high_pass(signal: &[f32], hz: f32) -> Vec<f32> {
    let biquad = |input: &[f32]| {
        let w = TAU * hz / RATE;
        let (cos, alpha) = (w.cos(), w.sin() / (2.0 * std::f32::consts::FRAC_1_SQRT_2));
        let (b0, b1, b2) = ((1.0 + cos) / 2.0, -(1.0 + cos), (1.0 + cos) / 2.0);
        let (a0, a1, a2) = (1.0 + alpha, -2.0 * cos, 1.0 - alpha);
        let (mut x1, mut x2, mut y1, mut y2) = (0.0f32, 0.0f32, 0.0f32, 0.0f32);
        input
            .iter()
            .map(|&x| {
                let y = (b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
                (x2, x1, y2, y1) = (x1, x, y1, y);
                y
            })
            .collect::<Vec<f32>>()
    };
    biquad(&biquad(signal))
}

// Clicks: the loudest 2 ms of what lies above 13 kHz — no voice harmonic does, even moved up 5 semitones — against
// the line's own level, in dB.
fn loudest_click_db(signal: &[f32]) -> f32 {
    let high = high_pass(signal, 13_000.0);
    let window = (0.002 * RATE) as usize;
    let loudest = high
        .chunks(window)
        .map(|chunk| chunk.iter().map(|x| x * x).sum::<f32>() / chunk.len() as f32)
        .fold(0.0f32, f32::max);
    let level = signal.iter().map(|x| x * x).sum::<f32>() / signal.len() as f32;
    10.0 * (loudest / level.max(1e-12)).max(1e-15).log10()
}

// Noise: what a steady stretch holds besides its harmonics of `f0` (each fitted by least squares over the stretch),
// against them, in dB.
fn noise_to_harmonics_db(signal: &[f32], from: f32, to: f32, f0: f32) -> f32 {
    let part = &signal[(from * RATE) as usize..(to * RATE) as usize];
    let mut residual: Vec<f32> = part.to_vec();
    let mut harmonic = 0.0f32;
    for k in (1..).map(|k| k as f32 * f0).take_while(|hz| *hz < 12_000.0) {
        let (mut re, mut im) = (0.0f32, 0.0f32);
        for (index, sample) in part.iter().enumerate() {
            let angle = TAU * k * index as f32 / RATE;
            re += sample * angle.cos();
            im += sample * angle.sin();
        }
        let (re, im) = (2.0 * re / part.len() as f32, 2.0 * im / part.len() as f32);
        for (index, value) in residual.iter_mut().enumerate() {
            let angle = TAU * k * index as f32 / RATE;
            *value -= re * angle.cos() + im * angle.sin();
        }
        harmonic += (re * re + im * im) / 2.0;
    }
    let noise = residual.iter().map(|x| x * x).sum::<f32>() / residual.len() as f32;
    10.0 * (noise / harmonic.max(1e-12)).log10()
}

// The frequency of the strongest harmonic of a steady stretch: where the formant lies.
fn loudest_harmonic(signal: &[f32], from: f32, to: f32, f0: f32) -> f32 {
    let part = &signal[(from * RATE) as usize..(to * RATE) as usize];
    (1..=21)
        .map(|k| k as f32 * f0)
        .filter(|hz| *hz < 6000.0)
        .map(|hz| {
            let (mut re, mut im) = (0.0f32, 0.0f32);
            for (index, sample) in part.iter().enumerate() {
                let angle = TAU * hz * index as f32 / RATE;
                re += sample * angle.cos();
                im += sample * angle.sin();
            }
            (hz, re * re + im * im)
        })
        .max_by(|a, b| a.1.total_cmp(&b.1))
        .map_or(0.0, |(hz, _)| hz)
}

// A1 (A3 = 57, 220 Hz) for 0.8 s, a breath, then B3 (59) for 0.8 s.
fn two_notes() -> Vec<f32> {
    let mut line = voice(0.8, |_| 57.0);
    line.extend(std::iter::repeat_n(0.0, (0.15 * RATE) as usize));
    line.extend(voice(0.8, |_| 59.0));
    line
}

#[test]
fn the_notes_of_a_line_are_found_at_their_pitch() {
    let line = two_notes();
    let track = track_pitch(&[&line], RATE).expect("track");
    let notes = find_notes(&track);
    assert_eq!(notes.len(), 2, "two sung notes: {notes:?}");
    assert!(
        cents(notes[0].pitch, 57.0).abs() < 5.0,
        "A3 read at {:.2}",
        notes[0].pitch
    );
    assert!(
        cents(notes[1].pitch, 59.0).abs() < 5.0,
        "B3 read at {:.2}",
        notes[1].pitch
    );
    let starts = [0.0, 0.95].map(|s| (s * RATE) as i64);
    for (note, start) in notes.iter().zip(starts) {
        assert!(
            (note.from as i64 - start).abs() < (0.05 * RATE) as i64,
            "a note starts where it is sung: {note:?}"
        );
    }
}

#[test]
fn a_moved_note_sounds_at_its_new_pitch_and_the_others_stay() {
    let line = two_notes();
    let track = track_pitch(&[&line], RATE).expect("track");
    let notes = find_notes(&track);
    // The first note up 3 semitones and 21 cents, the second untouched.
    let tunes = [NoteTune {
        from: notes[0].from,
        to: notes[0].to,
        pitch: notes[0].pitch,
        shift: 3.21,
        drift: 1.0,
    }];
    let out = render_tune(&[&line], RATE, &track, &tunes, 0.0).expect("render");
    assert_eq!(
        out[0].len(),
        line.len(),
        "the render keeps the recording's length"
    );
    let heard = track_pitch(&[&out[0]], RATE).expect("track again");
    let first = median(readings_between(&heard, 0.15, 0.7));
    let second = median(readings_between(&heard, 1.1, 1.65));
    println!(
        "moved: {first:.3} (wanted {:.3}), kept: {second:.3} (wanted 59)",
        57.0 + 3.21
    );
    assert!(
        cents(first, 60.21).abs() < 6.0,
        "the moved note sounds at +3.21 st: {first:.3}"
    );
    assert!(
        cents(second, 59.0).abs() < 4.0,
        "the other note keeps its pitch: {second:.3}"
    );
}

#[test]
fn a_moved_voice_keeps_its_formants() {
    let line = voice(1.0, |_| 57.0);
    let track = track_pitch(&[&line], RATE).expect("track");
    let notes = find_notes(&track);
    let tunes = [NoteTune {
        from: 0,
        to: line.len(),
        pitch: notes[0].pitch,
        shift: 5.0,
        drift: 1.0,
    }];
    let out = render_tune(&[&line], RATE, &track, &tunes, 0.0).expect("render");
    let before = loudest_harmonic(&line, 0.3, 0.7, 220.0);
    let after = loudest_harmonic(&out[0], 0.3, 0.7, 220.0 * (5.0f32 / 12.0).exp2());
    println!(
        "formant peak: {before:.0} Hz before, {after:.0} Hz after +5 st (a resampled voice: {:.0})",
        before * (5.0f32 / 12.0).exp2()
    );
    assert!(
        (after - 700.0).abs() < 160.0,
        "the formant stays near 700 Hz: {after:.0}"
    );
}

#[test]
fn flattening_the_drift_holds_a_wavering_note_on_its_pitch() {
    // A note sung ±40 cents round A3 at 5.5 Hz (a wide vibrato).
    let line = voice(1.5, |t| 57.0 + 0.4 * (TAU * 5.5 * t).sin());
    let track = track_pitch(&[&line], RATE).expect("track");
    let notes = find_notes(&track);
    assert_eq!(
        notes.len(),
        1,
        "a vibrato is one note, never several: {notes:?}"
    );
    let spread = |values: Vec<f32>| {
        let mean = values.iter().sum::<f32>() / values.len() as f32;
        (values.iter().map(|v| (v - mean).powi(2)).sum::<f32>() / values.len() as f32).sqrt()
            * 100.0
    };
    let as_sung = spread(readings_between(&track, 0.2, 1.3));
    let tunes = [NoteTune {
        from: notes[0].from,
        to: notes[0].to,
        pitch: notes[0].pitch,
        shift: 0.0,
        drift: 0.0,
    }];
    let out = render_tune(&[&line], RATE, &track, &tunes, 0.0).expect("render");
    let heard = track_pitch(&[&out[0]], RATE).expect("track again");
    let flat = spread(readings_between(&heard, 0.2, 1.3));
    println!("drift: {as_sung:.1} cents as sung, {flat:.1} cents flattened");
    assert!(as_sung > 25.0, "the line wavers as sung");
    assert!(flat < 8.0, "flattened, it holds its pitch: {flat:.1} cents");
}

#[test]
fn a_retuned_line_adds_no_clicks_nor_noise() {
    // A legato line, A3 then C4 with no breath between them, the first note up 4 semitones and the second down 3:
    // the ratio jumps where they meet.
    let line = voice(1.6, |t| if t < 0.8 { 57.0 } else { 60.0 });
    let track = track_pitch(&[&line], RATE).expect("track");
    let notes = find_notes(&track);
    assert_eq!(notes.len(), 2, "two legato notes: {notes:?}");
    let tunes: Vec<NoteTune> = notes
        .iter()
        .zip([4.0, -3.0])
        .map(|(note, shift)| NoteTune {
            from: note.from,
            to: note.to,
            pitch: note.pitch,
            shift,
            drift: 1.0,
        })
        .collect();
    let out = render_tune(&[&line], RATE, &track, &tunes, 0.0).expect("render");
    let untouched = render_tune(&[&line], RATE, &track, &[], 0.0).expect("render");
    let clicks = (loudest_click_db(&line), loudest_click_db(&out[0]));
    let noise = (
        noise_to_harmonics_db(&line, 0.2, 0.7, 220.0),
        noise_to_harmonics_db(&out[0], 0.2, 0.7, 220.0 * (4.0f32 / 12.0).exp2()),
        noise_to_harmonics_db(&out[0], 0.9, 1.4, 261.63 * (-3.0f32 / 12.0).exp2()),
    );
    let residual: f32 = line
        .iter()
        .zip(&untouched[0])
        .map(|(a, b)| (a - b).powi(2))
        .sum();
    let passed = 10.0 * (line.iter().map(|a| a * a).sum::<f32>() / residual.max(1e-12)).log10();
    println!(
        "clicks above 13 kHz: source {:.1} dB, retuned {:.1} dB; noise/harmonics: source {:.1} dB, note up {:.1} dB, note down {:.1} dB; untouched SNR {passed:.1} dB",
        clicks.0, clicks.1, noise.0, noise.1, noise.2
    );
    // The source's own change of note already leaves a trace up there: the render adds none to it.
    assert!(
        clicks.1 < clicks.0 + 3.0,
        "no click where the notes meet: {:.1} dB against the source's {:.1} dB",
        clicks.1,
        clicks.0
    );
    assert!(
        noise.1 < -35.0 && noise.2 < -35.0,
        "the moved notes stay clean: {:.1} / {:.1} dB",
        noise.1,
        noise.2
    );
    assert!(
        passed > 60.0,
        "an untouched line passes through: {passed:.1} dB"
    );
}

#[test]
fn a_stereo_recording_is_retuned_channel_by_channel() {
    let left = voice(0.6, |_| 57.0);
    let right: Vec<f32> = left.iter().map(|x| 0.5 * x).collect();
    let track = track_pitch(&[&left, &right], RATE).expect("track");
    let notes = find_notes(&track);
    let tunes = [NoteTune {
        from: notes[0].from,
        to: notes[0].to,
        pitch: notes[0].pitch,
        shift: 2.0,
        drift: 1.0,
    }];
    let out = render_tune(&[&left, &right], RATE, &track, &tunes, 0.0).expect("render");
    assert_eq!(out.len(), 2);
    for channel in &out {
        let heard = track_pitch(&[channel], RATE).expect("track");
        let pitch = median(readings_between(&heard, 0.15, 0.45));
        assert!(
            cents(pitch, 59.0).abs() < 6.0,
            "each channel at +2 st: {pitch:.3}"
        );
    }
}
