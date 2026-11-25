// The notes of a sung or played line and their retuning (R-372, « à la
// Melodyne », option B validated by the user on 25 Nov. 2026): a sound clip's
// pitch is read once over the whole recording (`track_pitch`, the voice
// bricks' YIN, atome-dsp yin.rs), cut into notes where it settles
// (`find_notes`), and each note the person moves is rendered offline
// (`render_tune`) through the phase vocoder that keeps the voice's formants
// (atome-dsp pitch.rs): its own shift, and its drift (the line's wavering
// around the note) kept, flattened or removed. The source is never touched:
// the render is the clip's played sound, its description the clip's
// `clip.tune` (eVe molecule kernel tune.js). Monophonic lines only: a chord
// has no single pitch to read. Channels are planar.

use crate::{INVALID_ARGUMENT, KernelError, Result, require_channels};
use atome_dsp::pitch::{PitchShifter, semitones_to_ratio};
use atome_dsp::stft::frame_size_for;
use atome_dsp::yin::Yin;

/// Frames between two readings of the pitch: about 5 ms at 48 kHz.
pub const TRACK_HOP: usize = 256;
// A reading below this level (−48 dBFS peak) is silence, never a note.
const QUIET: f32 = 4.0e-3;
// A note: 55 ms at least; split where the line leaves it by more than 0.6
// semitone for 40 ms (a vibrato swings round it, a new note stays away).
const NOTE_MIN_SECONDS: f32 = 0.055;
const SPLIT_SEMITONES: f32 = 0.6;
const SPLIT_SECONDS: f32 = 0.04;
// Unvoiced readings a note goes through without ending (a consonant, a breath).
const GAP_SECONDS: f32 = 0.03;
// The retuning glides over this time constant, so a note's start never clicks.
const GLIDE_SECONDS: f32 = 0.002;
// How often the shifters take a new ratio, in frames.
const RATIO_STEP: usize = 32;

/// The pitch of a recording, one reading every `hop` frames: MIDI note
/// numbers (69 = A 440, fractional), 0 where unvoiced or silent.
#[derive(Debug, Clone, PartialEq)]
pub struct PitchTrack {
    pub sample_rate: f32,
    pub hop: usize,
    pub notes: Vec<f32>,
}

impl PitchTrack {
    /// The reading centred on `frame`, interpolated; 0 where unvoiced.
    pub fn at(&self, frame: f32) -> f32 {
        let position = frame / self.hop as f32;
        let index = position.floor().max(0.0) as usize;
        let Some(&here) = self.notes.get(index) else {
            return 0.0;
        };
        let next = self.notes.get(index + 1).copied().unwrap_or(0.0);
        if here <= 0.0 || next <= 0.0 {
            return if position - index as f32 <= 0.5 {
                here
            } else {
                next
            };
        }
        here + (next - here) * (position - index as f32)
    }
}

fn hz_to_note(hz: f32) -> f32 {
    69.0 + 12.0 * (hz / 440.0).log2()
}

fn mono(channels: &[&[f32]]) -> Vec<f32> {
    let scale = 1.0 / channels.len() as f32;
    (0..channels[0].len())
        .map(|index| channels.iter().map(|channel| channel[index]).sum::<f32>() * scale)
        .collect()
}

/// Reads the pitch of the whole recording; reading `i` is centred on frame `i × TRACK_HOP`.
pub fn track_pitch(channels: &[&[f32]], sample_rate: f32) -> Result<PitchTrack> {
    require_channels(channels)?;
    if sample_rate.is_nan() || sample_rate <= 0.0 {
        return Err(KernelError::new(
            INVALID_ARGUMENT,
            "sample_rate must be positive",
        ));
    }
    let signal = mono(channels);
    let mut yin = Yin::new(sample_rate);
    let size = yin.size();
    // YIN compares the frame's first half with the frame: what it reads lies about a quarter of the frame in (plus
    // half a period), so that quarter sits on the reading's centre.
    let half = size / 4;
    let mut frame = vec![0.0f32; size];
    let readings = signal.len().div_ceil(TRACK_HOP);
    let mut notes = Vec::with_capacity(readings);
    for reading in 0..readings {
        let centre = reading * TRACK_HOP;
        for (offset, slot) in frame.iter_mut().enumerate() {
            *slot = (centre + offset)
                .checked_sub(half)
                .and_then(|index| signal.get(index))
                .copied()
                .unwrap_or(0.0);
        }
        let loud = frame
            .iter()
            .fold(0.0f32, |peak, sample| peak.max(sample.abs()))
            >= QUIET;
        notes.push(match yin.detect(&frame) {
            Some(hz) if loud => hz_to_note(hz),
            _ => 0.0,
        });
    }
    Ok(PitchTrack {
        sample_rate,
        hop: TRACK_HOP,
        notes,
    })
}

/// A note found in the line: frames `from..to` of the recording and its
/// pitch, the median of its readings (MIDI note number, fractional).
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct FoundNote {
    pub from: usize,
    pub to: usize,
    pub pitch: f32,
}

fn median(values: &mut [f32]) -> f32 {
    values.sort_by(f32::total_cmp);
    values[values.len() / 2]
}

/// Cuts the line into notes: a note lasts while the voice holds near its pitch.
pub fn find_notes(track: &PitchTrack) -> Vec<FoundNote> {
    let seconds = |readings: usize| readings as f32 * track.hop as f32 / track.sample_rate;
    let readings_for =
        |time: f32| ((time * track.sample_rate / track.hop as f32).ceil() as usize).max(1);
    let (gap, split, shortest) = (
        readings_for(GAP_SECONDS),
        readings_for(SPLIT_SECONDS),
        NOTE_MIN_SECONDS,
    );
    let mut found = Vec::new();
    let mut current: Vec<(usize, f32)> = Vec::new();
    let mut away = 0usize;
    let mut silent = 0usize;
    let mut close = |current: &mut Vec<(usize, f32)>| {
        if current.len() >= 2
            && seconds(current.last().map_or(0, |last| last.0) - current[0].0 + 1) >= shortest
        {
            let mut pitches: Vec<f32> = current.iter().map(|entry| entry.1).collect();
            found.push(FoundNote {
                from: current[0].0 * track.hop,
                to: (current.last().map_or(0, |last| last.0) + 1) * track.hop,
                pitch: median(&mut pitches),
            });
        }
        current.clear();
    };
    for (index, &note) in track.notes.iter().enumerate() {
        if note <= 0.0 {
            silent += 1;
            if silent > gap {
                close(&mut current);
                away = 0;
            }
            continue;
        }
        silent = 0;
        if current.is_empty() {
            current.push((index, note));
            continue;
        }
        let mut pitches: Vec<f32> = current.iter().map(|entry| entry.1).collect();
        let centre = median(&mut pitches);
        if (note - centre).abs() > SPLIT_SEMITONES {
            away += 1;
            if away >= split {
                // The voice settled elsewhere: the note ends where it left.
                let kept = current.len() + 1 - away;
                let moved: Vec<(usize, f32)> = current.split_off(kept);
                close(&mut current);
                current = moved;
                away = 0;
            }
        } else {
            away = 0;
        }
        current.push((index, note));
    }
    close(&mut current);
    found
}

/// What the person did to one note: `shift` semitones (cents included),
/// `drift` the share of its wavering kept (1 as sung, 0 flat on its pitch),
/// over frames `from..to` around `pitch` (its FoundNote's).
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct NoteTune {
    pub from: usize,
    pub to: usize,
    pub pitch: f32,
    pub shift: f32,
    pub drift: f32,
}

// The shift wanted at `frame`, in semitones.
fn wanted(track: &PitchTrack, tunes: &[NoteTune], frame: usize) -> f32 {
    let Some(tune) = tunes
        .iter()
        .find(|tune| frame >= tune.from && frame < tune.to)
    else {
        return 0.0;
    };
    let heard = track.at(frame as f32);
    let wavering = if heard > 0.0 { heard - tune.pitch } else { 0.0 };
    tune.shift - (1.0 - tune.drift.clamp(0.0, 1.0)) * wavering
}

/// The recording with its notes retuned, frame for frame as long as the
/// source; `formant` semitones move the formants (0 keeps the voice's own).
pub fn render_tune(
    channels: &[&[f32]],
    sample_rate: f32,
    track: &PitchTrack,
    tunes: &[NoteTune],
    formant: f32,
) -> Result<Vec<Vec<f32>>> {
    let frames = require_channels(channels)?;
    if sample_rate.is_nan() || sample_rate <= 0.0 || track.hop == 0 {
        return Err(KernelError::new(
            INVALID_ARGUMENT,
            "sample_rate and the track's hop must be positive",
        ));
    }
    if let Some(tune) = tunes
        .iter()
        .find(|tune| !(tune.from < tune.to && tune.shift.is_finite() && tune.drift.is_finite()))
    {
        return Err(KernelError::new(
            INVALID_ARGUMENT,
            format!("a note tune spans frames from < to with finite values ({tune:?})"),
        ));
    }
    let formant = semitones_to_ratio(formant);
    // Frames of about 21 ms, half a live effect's: a vibrato's swing is followed within a frame (measured in
    // tests/tune.rs), and a voice down to 80 Hz still spans nearly two periods.
    let frame = frame_size_for(sample_rate) / 2;
    let mut shifters: Vec<PitchShifter> = channels
        .iter()
        .map(|_| PitchShifter::with_frame_size(sample_rate, 1, frame))
        .collect();
    let latency = shifters[0].latency();
    let size = shifters[0].size();
    // The frame a shifter synthesizes when sample `t` arrives is centred on `t − size / 2`: its ratio is that centre's.
    let glide = (-(RATIO_STEP as f32) / (GLIDE_SECONDS * sample_rate)).exp();
    let mut semitones = 0.0f32;
    let mut out: Vec<Vec<f32>> = channels
        .iter()
        .map(|_| Vec::with_capacity(frames))
        .collect();
    let mut wet = [0.0f32];
    for t in 0..frames + latency {
        if t % RATIO_STEP == 0 {
            let centre = t.saturating_sub(size / 2);
            let target = wanted(track, tunes, centre);
            semitones = target + glide * (semitones - target);
            let ratio = semitones_to_ratio(semitones);
            for shifter in &mut shifters {
                shifter.set_voice(0, ratio, formant);
            }
        }
        for ((shifter, channel), output) in shifters.iter_mut().zip(channels).zip(&mut out) {
            shifter.push(channel.get(t).copied().unwrap_or(0.0), &mut wet);
            if t >= latency {
                output.push(wet[0]);
            }
        }
    }
    Ok(out)
}
