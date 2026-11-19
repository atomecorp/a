//! A DAWproject timeline flattened to what a Molecule track holds: every clip,
//! however nested (a Bitwig audio clip is a clip of audio events), becomes the
//! audio or video pieces it really plays and the notes it really sounds, in
//! seconds on the arrangement. A loop is laid out repeat by repeat, a warp map
//! piece by piece (each piece one stretch ratio), so what is heard stays exact.

use super::Context;
use crate::ImportError;
use crate::molecule_writer::{ClipKind, Curve};
use crate::xml::Element;

const MAX_LOOP_REPEATS: usize = 4096;
pub(super) const EPSILON: f64 = 1e-9;

/// beats or seconds.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) enum Unit {
    Beats,
    Seconds,
}

impl Unit {
    pub fn of(element: &Element, attribute: &str, inherited: Unit) -> Unit {
        match element.attr(attribute) {
            Some("seconds") => Unit::Seconds,
            Some("beats") => Unit::Beats,
            _ => inherited,
        }
    }
}

/// Content time `c` lies on the arrangement at `origin + c`, in `unit`.
#[derive(Clone, Copy, Debug)]
pub(super) struct Frame {
    pub unit: Unit,
    pub origin: f64,
}

impl Frame {
    pub fn seconds(&self, context: &Context<'_>, time: f64) -> f64 {
        match self.unit {
            Unit::Beats => context.tempo.seconds_at(self.origin + time),
            Unit::Seconds => self.origin + time,
        }
    }

    // The same zero, counted in `unit`.
    pub fn in_unit(&self, context: &Context<'_>, unit: Unit) -> Frame {
        if unit == self.unit {
            return *self;
        }
        let zero = self.seconds(context, 0.0);
        Frame {
            unit,
            origin: if unit == Unit::Beats {
                context.tempo.beat_at(zero)
            } else {
                zero
            },
        }
    }

    // A frame in `unit` where content `at` lies at `seconds` on the arrangement.
    pub fn placing(context: &Context<'_>, unit: Unit, at: f64, seconds: f64) -> Frame {
        let origin = if unit == Unit::Beats {
            context.tempo.beat_at(seconds)
        } else {
            seconds
        };
        Frame {
            unit,
            origin: origin - at,
        }
    }
}

/// One audio or video piece, in arrangement seconds.
#[derive(Clone, Debug)]
pub(super) struct Piece {
    pub kind: ClipKind,
    pub path: String,
    pub name: String,
    pub start: f64,
    pub end: f64,
    pub source_in: f64,
    pub source_out: f64,
    pub pitch_lock: bool,
    pub fade_in: f64,
    pub fade_out: f64,
}

/// One note, in arrangement seconds.
#[derive(Clone, Copy, Debug)]
pub(super) struct Note {
    pub start: f64,
    pub end: f64,
    pub key: u8,
    pub velocity: u8,
    pub channel: u8,
}

/// The notes of one arrangement clip (one Molecule MIDI clip).
#[derive(Clone, Debug)]
pub(super) struct NoteGroup {
    pub name: String,
    pub start: f64,
    pub end: f64,
    pub notes: Vec<Note>,
}

/// One automation point of a parameter, in arrangement seconds.
#[derive(Clone, Debug)]
pub(super) struct Point {
    pub parameter: String,
    pub unit: Option<String>,
    pub time: f64,
    pub value: f64,
    pub curve: Curve,
}

/// What a track's lanes hold, flattened.
#[derive(Clone, Debug, Default)]
pub(super) struct Collected {
    pub pieces: Vec<Piece>,
    pub groups: Vec<NoteGroup>,
    pub points: Vec<Point>,
    current_group: Option<usize>,
}

#[derive(Clone, Copy, Debug)]
pub(super) struct Window {
    pub start: f64,
    pub end: f64,
}

impl Window {
    pub const ALL: Window = Window {
        start: 0.0,
        end: f64::INFINITY,
    };

    pub(super) fn cut(self, start: f64, end: f64) -> Option<Window> {
        let window = Window {
            start: self.start.max(start),
            end: self.end.min(end),
        };
        (window.end - window.start > EPSILON).then_some(window)
    }
}

pub(super) fn number(element: &Element, name: &str) -> Result<Option<f64>, ImportError> {
    element.f64_attr(name, "dawproject_time_invalid")
}

/// Flattens a timeline element's children (`Lanes`, `Clips`, `Notes`, `Warps`,
/// `Audio`, `Video`, `Points`) into `out`.
pub(super) fn walk(
    context: &mut Context<'_>,
    element: &Element,
    frame: Frame,
    window: Window,
    out: &mut Collected,
) -> Result<(), ImportError> {
    for child in &element.children {
        content(context, child, frame, window, out)?;
    }
    Ok(())
}

/// Flattens one timeline element (`Lanes`, `Clips`, `Notes`, `Warps`, `Audio`,
/// `Video`, `Points`) into `out`.
pub(super) fn content(
    context: &mut Context<'_>,
    child: &Element,
    frame: Frame,
    window: Window,
    out: &mut Collected,
) -> Result<(), ImportError> {
    match child.name.as_str() {
        "Lanes" | "Timeline" => {
            let inner = frame.in_unit(context, Unit::of(child, "timeUnit", frame.unit));
            walk(context, child, inner, window, out)?;
        }
        "Clips" => {
            let inner = frame.in_unit(context, Unit::of(child, "timeUnit", frame.unit));
            for clip in child.children_named("Clip") {
                clip_at(context, clip, inner, window, out)?;
            }
        }
        "Notes" => {
            let inner = frame.in_unit(context, Unit::of(child, "timeUnit", frame.unit));
            notes(context, child, inner, window, out)?;
        }
        "Warps" => super::lanes::warps(context, child, frame, window, out)?,
        "Audio" | "Video" => {
            let zero = frame.seconds(context, 0.0);
            let duration = number(child, "duration")?.unwrap_or(f64::INFINITY);
            if let Some(cut) = window.cut(zero, zero + duration) {
                media_piece(context, child, cut, cut.start - zero, 1.0, out)?;
            }
        }
        "Points" => super::lanes::points(context, child, frame, window, out)?,
        "ClipSlot" | "markers" | "Markers" => {}
        other => context.report.skip(
            &format!("timeline_{}", other.to_lowercase()),
            &context.location,
            "unsupported_timeline_content",
        ),
    }
    Ok(())
}

pub(super) fn clip_at(
    context: &mut Context<'_>,
    clip: &Element,
    parent: Frame,
    window: Window,
    out: &mut Collected,
) -> Result<(), ImportError> {
    let name = clip.attr("name").unwrap_or("").to_string();
    if clip.bool_attr("enable") == Some(false) {
        context
            .report
            .skip("disabled_clip", &context.location, "clip_switched_off");
        return Ok(());
    }
    let time = number(clip, "time")?
        .ok_or_else(|| ImportError::new("dawproject_clip_invalid", "a Clip has no time"))?;
    let start = parent.seconds(context, time);
    let end = match number(clip, "duration")? {
        Some(duration) => parent.seconds(context, time + duration),
        None => window.end,
    };
    let Some(window) = window.cut(start, end) else {
        return Ok(());
    };
    let top = out.current_group.is_none();
    if top {
        out.groups.push(NoteGroup {
            name: name.clone(),
            start: window.start,
            end: window.end,
            notes: Vec::new(),
        });
        out.current_group = Some(out.groups.len() - 1);
    }
    let unit = Unit::of(clip, "contentTimeUnit", parent.unit);
    let play_start = number(clip, "playStart")?.unwrap_or(0.0);
    let body = match clip.attr("reference") {
        Some(id) => context.referenced(id)?,
        None => clip,
    };
    let first_piece = out.pieces.len();
    let loop_range = match (number(clip, "loopStart")?, number(clip, "loopEnd")?) {
        (Some(from), Some(to)) if to - from > EPSILON => Some((from, to)),
        _ => None,
    };
    let mut frame = Frame::placing(context, unit, play_start, start);
    match loop_range {
        None => walk(context, body, frame, window, out)?,
        Some((loop_start, loop_end)) => {
            let mut from = play_start;
            let mut repeats = 0;
            loop {
                let repeat_start = frame.seconds(context, from);
                let repeat_end = frame.seconds(context, loop_end);
                if repeat_start >= window.end - EPSILON || repeats == MAX_LOOP_REPEATS {
                    break;
                }
                if let Some(cut) = window.cut(repeat_start, repeat_end) {
                    walk(context, body, frame, cut, out)?;
                }
                repeats += 1;
                frame = Frame::placing(context, unit, loop_start, repeat_end);
                from = loop_start;
            }
            if repeats > 1 {
                context
                    .report
                    .count("loop_repeats_laid", repeats as u64 - 1);
            }
        }
    }
    fades(context, clip, window, &mut out.pieces[first_piece..], &name)?;
    if top {
        out.current_group = None;
        // A clip of audio only holds no notes: no MIDI clip for it.
        if out
            .groups
            .last()
            .is_some_and(|group| group.notes.is_empty())
        {
            out.groups.pop();
        }
    }
    Ok(())
}

fn fades(
    context: &mut Context<'_>,
    clip: &Element,
    window: Window,
    pieces: &mut [Piece],
    name: &str,
) -> Result<(), ImportError> {
    let (fade_in, fade_out) = (
        number(clip, "fadeInTime")?.unwrap_or(0.0),
        number(clip, "fadeOutTime")?.unwrap_or(0.0),
    );
    let unit = Unit::of(clip, "fadeTimeUnit", Unit::Beats);
    let span = |from: f64, length: f64| match unit {
        Unit::Seconds => length,
        Unit::Beats => {
            context
                .tempo
                .seconds_at(context.tempo.beat_at(from) + length)
                - from
        }
    };
    let (in_seconds, out_seconds) = (span(window.start, fade_in), span(window.end, fade_out));
    for piece in pieces.iter_mut() {
        if piece.name.is_empty() {
            piece.name = name.to_string();
        }
        if in_seconds > 0.0 && (piece.start - window.start).abs() < 1e-6 {
            piece.fade_in = in_seconds;
        }
        if out_seconds > 0.0 && (piece.end - window.end).abs() < 1e-6 {
            piece.fade_out = out_seconds;
        }
    }
    Ok(())
}

fn notes(
    context: &mut Context<'_>,
    element: &Element,
    frame: Frame,
    window: Window,
    out: &mut Collected,
) -> Result<(), ImportError> {
    let mut found = Vec::new();
    for note in element.children_named("Note") {
        let time = number(note, "time")?
            .ok_or_else(|| ImportError::new("dawproject_note_invalid", "a Note has no time"))?;
        let duration = number(note, "duration")?
            .ok_or_else(|| ImportError::new("dawproject_note_invalid", "a Note has no duration"))?;
        let key = note
            .attr("key")
            .and_then(|key| key.trim().parse::<i64>().ok())
            .ok_or_else(|| ImportError::new("dawproject_note_invalid", "a Note has no key"))?;
        let start = frame.seconds(context, time);
        if start < window.start - EPSILON
            || start >= window.end - EPSILON
            || !(0..=127).contains(&key)
        {
            continue;
        }
        let end = frame.seconds(context, time + duration).min(window.end);
        let velocity = number(note, "vel")?.unwrap_or(0.787_402);
        let channel = note
            .attr("channel")
            .and_then(|channel| channel.trim().parse::<i64>().ok())
            .unwrap_or(0);
        found.push(Note {
            start,
            end: end.max(start + 0.001),
            key: key as u8,
            velocity: (velocity * 127.0).round().clamp(1.0, 127.0) as u8,
            channel: (channel.clamp(0, 15) + 1) as u8,
        });
    }
    match out.current_group {
        Some(index) => out.groups[index].notes.extend(found),
        None if !found.is_empty() => {
            let start = found
                .iter()
                .map(|note| note.start)
                .fold(f64::INFINITY, f64::min);
            let end = found.iter().map(|note| note.end).fold(0.0, f64::max);
            out.groups.push(NoteGroup {
                name: String::new(),
                start,
                end,
                notes: found,
            });
        }
        None => {}
    }
    Ok(())
}

pub(super) fn media_piece(
    context: &mut Context<'_>,
    media: &Element,
    window: Window,
    source_in: f64,
    ratio: f64,
    out: &mut Collected,
) -> Result<(), ImportError> {
    let path = media
        .child("File")
        .and_then(|file| file.attr("path"))
        .ok_or_else(|| {
            ImportError::new(
                "dawproject_media_invalid",
                "an Audio or Video has no File path",
            )
        })?;
    let algorithm = media.attr("algorithm").unwrap_or("stretch").to_lowercase();
    out.pieces.push(Piece {
        kind: if media.name == "Video" {
            ClipKind::Video
        } else {
            ClipKind::Audio
        },
        path: path.to_string(),
        name: String::new(),
        start: window.start,
        end: window.end,
        source_in,
        source_out: source_in + (window.end - window.start) / ratio,
        pitch_lock: !(algorithm.contains("repitch")
            || algorithm.contains("resample")
            || algorithm.contains("varispeed")),
        fade_in: 0.0,
        fade_out: 0.0,
    });
    context.media(path);
    Ok(())
}
