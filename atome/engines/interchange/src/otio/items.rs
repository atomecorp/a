//! The OTIO items laid: clips, gaps, transitions and nested compositions, each
//! placed through its parent's time map.

use super::values::{list, range, schema, text, time, time_rate};
use super::{IMAGE_EXTENSIONS, MAX_NESTING, Map, Piece, Reader};
use crate::ImportError;
use crate::frac::Frac;
use crate::molecule_writer::{ClipKind, TrackKind};
use serde_json::Value;

pub(super) fn duration_of(item: &Value, depth: usize) -> Result<Frac, ImportError> {
    if depth > MAX_NESTING {
        return Err(ImportError::new(
            "otio_nesting_too_deep",
            "OTIO items nest too deep",
        ));
    }
    if let Some((_, duration)) = range(item.get("source_range"))? {
        return Ok(duration);
    }
    match schema(item) {
        "Clip" => Ok(media_reference(item)
            .map(|reference| range(reference.get("available_range")))
            .transpose()?
            .flatten()
            .map_or(Frac::ZERO, |(_, d)| d)),
        "Track" | "Sequence" => list(item, "children")
            .iter()
            .filter(|child| schema(child) != "Transition")
            .try_fold(Frac::ZERO, |sum, child| {
                Ok(sum.plus(duration_of(child, depth + 1)?))
            }),
        "Stack" => list(item, "children")
            .iter()
            .try_fold(Frac::ZERO, |longest, child| {
                Ok(longest.max(duration_of(child, depth + 1)?))
            }),
        _ => Ok(Frac::ZERO),
    }
}

pub(super) fn media_reference(clip: &Value) -> Option<&Value> {
    if let Some(references) = clip.get("media_references").and_then(Value::as_object) {
        let key = clip
            .get("active_media_reference_key")
            .and_then(Value::as_str)
            .unwrap_or("DEFAULT_MEDIA");
        return references.get(key);
    }
    clip.get("media_reference")
        .filter(|reference| !reference.is_null())
}

pub(super) fn scalar_of(reader: &mut Reader, item: &Value, location: &str) -> f64 {
    let mut scalar = 1.0;
    for effect in list(item, "effects") {
        match schema(effect) {
            "LinearTimeWarp" => match effect.get("time_scalar").and_then(Value::as_f64) {
                Some(value) if value.is_finite() && value > 0.0 => scalar *= value,
                _ => reader.report.skip(
                    "time_warp",
                    location,
                    "reverse_or_frozen_time_warp_unsupported",
                ),
            },
            "FreezeFrame" => {
                reader
                    .report
                    .skip("freeze_frame", location, "freeze_frame_unsupported")
            }
            other => {
                let name = if other.is_empty() { "effect" } else { other };
                reader
                    .report
                    .skip(&name.to_lowercase(), location, "effect_without_equivalent");
            }
        }
    }
    scalar
}

pub(super) fn markers(reader: &mut Reader, item: &Value, map: &Map) -> Result<(), ImportError> {
    for marker in list(item, "markers") {
        let Some((start, _)) = range(marker.get("marked_range"))? else {
            continue;
        };
        let at = map.abs(start.to_f64());
        if at >= map.from - 1e-9 && at < map.to + 1e-9 {
            reader
                .markers
                .push((text(marker, "name").to_string(), at.max(0.0)));
        } else {
            reader
                .report
                .skip("marker", text(item, "name"), "marker_outside_its_item");
        }
    }
    Ok(())
}

pub(super) fn source(
    reader: &mut Reader,
    clip: &Value,
    track_kind: TrackKind,
    location: &str,
) -> Result<Option<(String, ClipKind, Option<f64>)>, ImportError> {
    let video_kind = |url: &str| {
        let lower = url.to_lowercase();
        if IMAGE_EXTENSIONS.iter().any(|ext| lower.ends_with(ext)) {
            ClipKind::Image
        } else {
            ClipKind::Video
        }
    };
    let Some(reference) = media_reference(clip) else {
        reader.report.count("missing_references", 1);
        let kind = if track_kind == TrackKind::Audio {
            ClipKind::Audio
        } else {
            ClipKind::Video
        };
        return Ok(Some((format!("missing:{location}"), kind, None)));
    };
    let media_start = range(reference.get("available_range"))?.map(|(start, _)| start.to_f64());
    let key = match schema(reference) {
        "ExternalReference" => text(reference, "target_url").to_string(),
        "MissingReference" => {
            reader.report.count("missing_references", 1);
            format!("missing:{location}")
        }
        "ImageSequenceReference" => {
            reader.report.approximate(
                "image_sequence",
                location,
                "image_sequence_referenced_as_one_media",
            );
            let digits = reference
                .get("frame_zero_padding")
                .and_then(Value::as_u64)
                .unwrap_or(0);
            format!(
                "{}{}%0{digits}d{}",
                text(reference, "target_url_base"),
                text(reference, "name_prefix"),
                text(reference, "name_suffix")
            )
        }
        other => {
            let what = if other.is_empty() {
                "media_reference".to_string()
            } else {
                other.to_lowercase()
            };
            reader
                .report
                .skip(&what, location, "generated_media_unsupported");
            return Ok(None);
        }
    };
    let kind = if track_kind == TrackKind::Audio {
        ClipKind::Audio
    } else {
        video_kind(&key)
    };
    Ok(Some((key, kind, media_start)))
}

pub(super) struct Place<'a> {
    pub track: usize,
    pub kind: TrackKind,
    pub map: Map,
    pub location: &'a str,
}

pub(super) fn clip(
    reader: &mut Reader,
    item: &Value,
    position: f64,
    place: &Place<'_>,
) -> Result<Option<usize>, ImportError> {
    let name = text(item, "name").to_string();
    let location = if name.is_empty() {
        place.location
    } else {
        name.as_str()
    };
    if item.get("enabled").and_then(Value::as_bool) == Some(false) {
        reader
            .report
            .skip("disabled_clip", location, "clip_switched_off");
        return Ok(None);
    }
    let (start, duration) = match range(item.get("source_range"))? {
        Some(range) => range,
        None => match media_reference(item)
            .map(|reference| range(reference.get("available_range")))
            .transpose()?
            .flatten()
        {
            Some(range) => range,
            None => {
                return Err(ImportError::new(
                    "otio_clip_without_range",
                    format!("clip {location} has no range"),
                ));
            }
        },
    };
    if reader.rate.is_none() {
        reader.rate = item.pointer("/source_range/duration").and_then(time_rate);
    }
    let scalar = scalar_of(reader, item, location);
    let map = place
        .map
        .child(position, start.to_f64(), duration.to_f64(), scalar);
    markers(reader, item, &map)?;
    let Some((key, kind, media_start)) = source(reader, item, place.kind, location)? else {
        return Ok(None);
    };
    if map.to - map.from <= 1e-9 {
        return Ok(None);
    }
    let own_in = map.local0 + (map.from - map.abs0) / map.speed;
    let own_out = map.local0 + (map.to - map.abs0) / map.speed;
    let media_start = match media_start {
        Some(media_start) => media_start,
        None => {
            if own_in > 0.0 {
                reader.report.approximate(
                    "clip_source_start",
                    location,
                    "media_start_unknown_source_time_read_as_file_time",
                );
            }
            0.0
        }
    };
    reader.pieces.push(Piece {
        track: place.track,
        kind,
        key,
        name,
        start: map.from,
        end: map.to,
        source_in: own_in - media_start,
        source_out: own_out - media_start,
        fade_in: 0.0,
        fade_out: 0.0,
        transition: None,
    });
    Ok(Some(reader.pieces.len() - 1))
}

// Lays a track's children from local time 0 in `place.map`.
pub(super) fn track_items(
    reader: &mut Reader,
    track: &Value,
    place: &Place<'_>,
    depth: usize,
) -> Result<(), ImportError> {
    let mut position = Frac::ZERO;
    let mut previous: Option<usize> = None;
    let mut pending: Option<(f64, f64, String)> = None;
    for item in list(track, "children") {
        match schema(item) {
            "Transition" => {
                let offset =
                    |key: &str| item.get(key).filter(|v| !v.is_null()).map(time).transpose();
                let incoming = offset("in_offset")?.map_or(0.0, Frac::to_f64);
                let outgoing = offset("out_offset")?.map_or(0.0, Frac::to_f64);
                let kind = text(item, "transition_type").to_string();
                pending = Some((incoming * place.map.speed, outgoing * place.map.speed, kind));
                continue;
            }
            "Clip" => {
                let laid = clip(reader, item, position.to_f64(), place)?;
                if let Some((incoming, outgoing, kind)) = pending.take() {
                    transition(
                        reader,
                        previous,
                        laid,
                        incoming,
                        outgoing,
                        &kind,
                        place.location,
                    );
                }
                previous = laid;
            }
            "Gap" => {
                if let Some((incoming, outgoing, kind)) = pending.take() {
                    transition(
                        reader,
                        previous,
                        None,
                        incoming,
                        outgoing,
                        &kind,
                        place.location,
                    );
                }
                previous = None;
            }
            "Stack" | "Track" | "Sequence" => {
                reader.report.approximate(
                    "nested_composition",
                    place.location,
                    "flattened_onto_its_track",
                );
                nested(reader, item, position.to_f64(), place, depth + 1)?;
                previous = None;
            }
            other => reader
                .report
                .skip(&other.to_lowercase(), place.location, "unsupported_item"),
        }
        position = position.plus(duration_of(item, depth + 1)?);
    }
    if let Some((incoming, outgoing, kind)) = pending {
        transition(
            reader,
            previous,
            None,
            incoming,
            outgoing,
            &kind,
            place.location,
        );
    }
    Ok(())
}

pub(super) fn transition(
    reader: &mut Reader,
    left: Option<usize>,
    right: Option<usize>,
    incoming: f64,
    outgoing: f64,
    kind: &str,
    location: &str,
) {
    if kind != "SMPTE_Dissolve" {
        reader
            .report
            .approximate("transition", location, "transition_laid_as_a_dissolve");
    }
    let total = incoming + outgoing;
    match (left, right) {
        (Some(left), Some(_)) => {
            if (incoming - outgoing).abs() > 1e-9 {
                reader
                    .report
                    .approximate("transition", location, "transition_centred_on_the_cut");
            }
            reader.pieces[left].transition = Some(total);
            reader.report.count("transitions", 1);
        }
        (None, Some(right)) => {
            reader.report.approximate(
                "transition",
                location,
                "transition_from_a_gap_laid_as_a_fade_in",
            );
            reader.pieces[right].fade_in = total;
        }
        (Some(left), None) => {
            reader.report.approximate(
                "transition",
                location,
                "transition_to_a_gap_laid_as_a_fade_out",
            );
            reader.pieces[left].fade_out = total;
        }
        (None, None) => reader
            .report
            .skip("transition", location, "transition_between_gaps"),
    }
}

pub(super) fn nested(
    reader: &mut Reader,
    item: &Value,
    position: f64,
    place: &Place<'_>,
    depth: usize,
) -> Result<(), ImportError> {
    if depth > MAX_NESTING {
        return Err(ImportError::new(
            "otio_nesting_too_deep",
            "OTIO items nest too deep",
        ));
    }
    let name = text(item, "name");
    let location = if name.is_empty() {
        place.location
    } else {
        name
    };
    let duration = duration_of(item, depth)?.to_f64();
    let start = range(item.get("source_range"))?.map_or(0.0, |(start, _)| start.to_f64());
    let scalar = scalar_of(reader, item, location);
    let map = place.map.child(position, start, duration, scalar);
    markers(reader, item, &map)?;
    let inner = Place {
        track: place.track,
        kind: place.kind,
        map,
        location,
    };
    match schema(item) {
        "Stack" => {
            for child in list(item, "children") {
                match schema(child) {
                    "Track" | "Sequence" => {
                        if child.get("enabled").and_then(Value::as_bool) == Some(false) {
                            continue;
                        }
                        let trim = range(child.get("source_range"))?
                            .map_or(0.0, |(start, _)| start.to_f64());
                        let length = duration_of(child, depth + 1)?.to_f64();
                        let track_map = inner.map.child(0.0, trim, length, 1.0);
                        track_items(
                            reader,
                            child,
                            &Place {
                                map: track_map,
                                ..inner
                            },
                            depth + 1,
                        )?;
                    }
                    "Clip" => {
                        clip(reader, child, 0.0, &inner)?;
                    }
                    "Stack" => nested(reader, child, 0.0, &inner, depth + 1)?,
                    "Gap" | "Transition" => {}
                    other => {
                        reader
                            .report
                            .skip(&other.to_lowercase(), location, "unsupported_item")
                    }
                }
            }
        }
        _ => track_items(reader, item, &inner, depth)?,
    }
    Ok(())
}
