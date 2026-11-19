//! The flattened content laid on the Molecule tracks of its DAWproject track:
//! audio and video pieces as clips (a warp piece stretched), each note group as a
//! MIDI media and its clip, the automation points on the volume and pan they name.

use super::mixing::{Param, ParamKind, pan_value, volume_db};
use super::timeline::{Collected, Point};
use crate::ImportError;
use crate::molecule_writer::{
    ClipKind, ClipSource, ClipSpec, Keyframe, MidiMedia, MidiNote, StretchSpec, TimelineBuilder,
};
use std::collections::HashMap;

/// The Molecule tracks of one DAWproject track.
#[derive(Clone, Debug, Default)]
pub(super) struct Placed {
    pub audio: Option<String>,
    pub video: Option<String>,
    pub midi: Option<String>,
    pub name: String,
}

/// What the structure laid: tracks per DAWproject track id, parameters per id.
pub(super) struct Laid {
    pub tracks: HashMap<String, Placed>,
    pub params: HashMap<String, Param>,
    pub points: Vec<Point>,
    pub next_midi: usize,
}

pub(super) fn lay_collected(
    builder: &mut TimelineBuilder,
    laid: &mut Laid,
    id: &str,
    collected: Collected,
) -> Result<Vec<String>, ImportError> {
    laid.points.extend(collected.points);
    let Some(placed) = laid.tracks.get(id).cloned() else {
        if !collected.pieces.is_empty() || !collected.groups.is_empty() {
            builder
                .report_mut()
                .skip("clips", id, "lanes_name_an_unknown_track");
        }
        return Ok(Vec::new());
    };
    let mut tracks = Vec::new();
    for piece in collected.pieces {
        let track = match piece.kind {
            ClipKind::Video => placed.video.clone(),
            _ => placed.audio.clone(),
        };
        let Some(track) = track else {
            builder
                .report_mut()
                .skip("clip", &placed.name, "group_tracks_hold_no_clips");
            continue;
        };
        let duration = piece.end - piece.start;
        let natural = piece.source_out - piece.source_in;
        let mut spec = ClipSpec::new(
            piece.kind,
            ClipSource::Media(piece.path.clone()),
            piece.start,
            duration,
            piece.source_in,
        );
        spec.source_out_seconds = Some(piece.source_out);
        spec.name = (!piece.name.is_empty()).then(|| piece.name.clone());
        spec.fade_in_seconds = piece.fade_in;
        spec.fade_out_seconds = piece.fade_out;
        if natural > 0.0 && (duration / natural - 1.0).abs() > 1e-9 {
            spec.stretch = Some(StretchSpec {
                ratio: duration / natural,
                pitch_lock: piece.pitch_lock,
            });
        }
        builder.add_clip(&track, spec)?;
        tracks.push(track);
    }
    for group in collected.groups {
        let Some(track) = placed.midi.clone() else {
            builder
                .report_mut()
                .skip("notes", &placed.name, "group_tracks_hold_no_clips");
            continue;
        };
        laid.next_midi += 1;
        let key = format!("midi:{}", laid.next_midi);
        let mut notes: Vec<MidiNote> = group
            .notes
            .iter()
            .map(|note| MidiNote {
                start_s: note.start - group.start,
                duration_s: note.end - note.start,
                pitch: note.key,
                velocity: note.velocity,
                channel: note.channel,
            })
            .collect();
        notes.sort_by(|a, b| a.start_s.total_cmp(&b.start_s).then(a.pitch.cmp(&b.pitch)));
        let name = if group.name.is_empty() {
            placed.name.clone()
        } else {
            group.name.clone()
        };
        builder.add_midi_media(MidiMedia {
            media_key: key.clone(),
            name: name.clone(),
            duration_s: group.end - group.start,
            notes,
        });
        let mut spec = ClipSpec::new(
            ClipKind::Midi,
            ClipSource::Midi(key),
            group.start,
            group.end - group.start,
            0.0,
        );
        spec.name = Some(name);
        builder.add_clip(&track, spec)?;
        tracks.push(track);
    }
    Ok(tracks)
}

/// Lays the automation points on the volume and pan they name.
pub(super) fn lay_points(
    builder: &mut TimelineBuilder,
    laid: &mut Laid,
    extra: Vec<Point>,
) -> Result<(), ImportError> {
    let mut points = std::mem::take(&mut laid.points);
    points.extend(extra);
    let mut lanes: Vec<(String, Vec<Keyframe>)> = Vec::new();
    for point in points {
        let Some(param) = laid.params.get(&point.parameter) else {
            builder
                .report_mut()
                .skip("automation", "Arrangement", "parameter_without_equivalent");
            continue;
        };
        let (Some(strip), kind) = (&param.strip, param.kind) else {
            builder.report_mut().skip(
                "automation",
                &param.location,
                "parameter_without_equivalent",
            );
            continue;
        };
        let unit = point.unit.as_deref().unwrap_or("linear");
        let value = match kind {
            ParamKind::Volume => volume_db(point.value, unit, param.min, param.max),
            ParamKind::Pan => pan_value(point.value, unit, param.min, param.max),
            ParamKind::Other => {
                builder.report_mut().skip(
                    "automation",
                    &param.location,
                    "parameter_without_equivalent",
                );
                continue;
            }
        };
        let key = format!("{strip}|{kind:?}");
        let keyframe = Keyframe {
            time_seconds: point.time,
            value,
            curve: point.curve,
        };
        match lanes.iter_mut().find(|(lane, _)| *lane == key) {
            Some((_, keyframes)) => keyframes.push(keyframe),
            None => lanes.push((key, vec![keyframe])),
        }
    }
    for (key, keyframes) in lanes {
        let (strip, kind) = key
            .split_once('|')
            .expect("a lane key holds its strip and kind");
        if kind == "Volume" {
            builder.automate_gain_db(strip, keyframes)?;
        } else {
            builder.automate_pan(strip, keyframes)?;
        }
    }
    Ok(())
}
