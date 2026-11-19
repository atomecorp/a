//! Reads the rows of a bundle's object store (`objects`: id, type, JSON contents)
//! into the normalized project. Each object refers to others as
//! `{"_type": T, "_value": id}`; the project object lists the pages in order.

use std::collections::{BTreeMap, HashMap};

use serde_json::Value;

use crate::model::{
    LoopyCell, LoopyClip, LoopyClock, LoopyFade, LoopyPage, LoopyProject, LoopyResource,
    LoopySegment, LoopyUnsupported,
};

/// One row of the `objects` table.
#[derive(Debug, Clone, PartialEq)]
pub struct ObjectRow {
    pub id: i64,
    pub kind: String,
    pub contents: Value,
}

#[derive(Debug, PartialEq, Eq)]
pub enum ReadError {
    MissingProject,
    MissingClock,
    MissingObject { id: i64, expected: &'static str },
    MissingResource(String),
    Invalid { id: i64, field: &'static str },
}

impl std::fmt::Display for ReadError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::MissingProject => write!(f, "lpproj_missing_project_object"),
            Self::MissingClock => write!(f, "lpproj_missing_clock"),
            Self::MissingObject { id, expected } => {
                write!(f, "lpproj_missing_object:{expected}:{id}")
            }
            Self::MissingResource(id) => write!(f, "lpproj_missing_resource_file:{id}"),
            Self::Invalid { id, field } => write!(f, "lpproj_invalid_field:{field}:{id}"),
        }
    }
}

impl std::error::Error for ReadError {}

/// Object kinds that only drive Loopy Pro's mixer, effects, controls or interface:
/// counted and reported, never converted (first version scope).
const OUT_OF_SCOPE_KINDS: &[&str] = &[
    "Effect",
    "AudioBus",
    "AudioBusSend",
    "AudioBusAudioSource",
    "ButtonWidget",
    "SliderWidget",
    "TextWidget",
    "TutorialWidget",
    "GroupMIDISource",
    "GroupMIDIDestination",
    "CoreMIDISource",
    "AudioUnitMIDIDestination",
    "MIDISegment",
];

struct Objects {
    by_id: HashMap<i64, (String, Value)>,
}

impl Objects {
    fn get(&self, id: i64, expected: &'static str) -> Result<&Value, ReadError> {
        match self.by_id.get(&id) {
            Some((kind, value)) if kind == expected => Ok(value),
            _ => Err(ReadError::MissingObject { id, expected }),
        }
    }
}

fn reference(value: &Value) -> Option<(&str, i64)> {
    Some((
        value.get("_type")?.as_str()?,
        value.get("_value")?.as_i64()?,
    ))
}

fn references<'a>(value: Option<&'a Value>) -> impl Iterator<Item = (&'a str, i64)> + 'a {
    let list = match value {
        Some(Value::Array(list)) => list.as_slice(),
        Some(Value::Object(set)) => set
            .get("_value")
            .and_then(Value::as_array)
            .map(Vec::as_slice)
            .unwrap_or(&[]),
        _ => &[],
    };
    list.iter().filter_map(reference)
}

fn number(value: &Value, key: &str) -> Option<f64> {
    value.get(key).and_then(Value::as_f64)
}

fn flag(value: &Value, key: &str) -> Option<bool> {
    value.get(key).and_then(Value::as_bool)
}

fn time_range(value: &Value, key: &str) -> Option<(f64, f64)> {
    let range = value.get(key)?.get("_value")?;
    Some((number(range, "offset")?, number(range, "duration")?))
}

/// A stored fade: absent or negative means "the project default".
fn stored_fade(value: &Value, key: &str) -> Option<f64> {
    number(value, key).filter(|duration| *duration >= 0.0)
}

fn clip_fade(track: &Value, duration: &str, unit: &str, default: LoopyFade) -> LoopyFade {
    match stored_fade(track, duration) {
        Some(duration) => LoopyFade {
            duration,
            unit_code: track
                .get(unit)
                .and_then(Value::as_i64)
                .or(default.unit_code),
        },
        None => default,
    }
}

/// `resources` are the bundle's audio files already identified (name, hash, size),
/// keyed by resource id; the reader never touches the file system.
pub fn read_project(
    rows: Vec<ObjectRow>,
    resources: &BTreeMap<String, LoopyResource>,
) -> Result<LoopyProject, ReadError> {
    let mut unsupported_counts: BTreeMap<&'static str, usize> = BTreeMap::new();
    let mut by_id = HashMap::with_capacity(rows.len());
    let mut project_id = None;
    for row in rows {
        if row.kind == "Project" {
            project_id = Some(row.id);
        }
        if let Some(kind) = OUT_OF_SCOPE_KINDS.iter().find(|kind| **kind == row.kind) {
            *unsupported_counts.entry(kind).or_default() += 1;
        }
        by_id.insert(row.id, (row.kind, row.contents));
    }
    let objects = Objects { by_id };
    let project = objects.get(project_id.ok_or(ReadError::MissingProject)?, "Project")?;
    let clock_id = project
        .get("clock")
        .and_then(reference)
        .map(|(_, id)| id)
        .ok_or(ReadError::MissingClock)?;
    let clock_object = objects.get(clock_id, "Clock")?;
    let clock = LoopyClock {
        tempo_bpm: number(clock_object, "tempo").ok_or(ReadError::Invalid {
            id: clock_id,
            field: "tempo",
        })?,
        beats_per_bar: number(clock_object, "beatsPerBar").map_or(4, |beats| beats as u32),
        master_length_beats: number(clock_object, "masterLength"),
    };
    let defaults = project.get("storedUserDefaults");
    let default_fade = |duration: &str, unit: &str| LoopyFade {
        duration: defaults
            .and_then(|d| stored_fade(d, duration))
            .unwrap_or(0.0),
        unit_code: defaults.and_then(|d| d.get(unit)).and_then(Value::as_i64),
    };
    let default_fade_in = default_fade("fadeInDuration", "fadeInUnit");
    let default_fade_out = default_fade("fadeOutDuration", "fadeOutUnit");

    let mut unsupported = Vec::new();
    let mut pages = Vec::new();
    for (_, page_id) in references(project.get("scenes")) {
        let page = objects.get(page_id, "Scene")?;
        let mut clips = Vec::new();
        for (_, clip_id) in references(page.get("tracks")) {
            let track = objects.get(clip_id, "Track")?;
            if let Some(clip) = read_clip(
                &objects,
                page_id,
                clip_id,
                track,
                (default_fade_in, default_fade_out),
                &mut unsupported,
            )? {
                clips.push(clip);
            }
        }
        pages.push(LoopyPage {
            source_id: page_id,
            title: page.get("title").and_then(Value::as_str).map(str::to_owned),
            columns: number(page, "columns").map_or(0, |n| n as u32),
            rows: number(page, "rows").map_or(0, |n| n as u32),
            clips,
        });
    }
    let used: BTreeMap<&str, ()> = pages
        .iter()
        .flat_map(|page| &page.clips)
        .flat_map(|clip| &clip.segments)
        .map(|segment| (segment.resource_id.as_str(), ()))
        .collect();
    let mut shared = Vec::with_capacity(used.len());
    for resource_id in used.keys() {
        let resource = resources
            .get(*resource_id)
            .ok_or_else(|| ReadError::MissingResource((*resource_id).to_owned()))?;
        shared.push(resource.clone());
    }
    for (kind, count) in unsupported_counts {
        unsupported.push(LoopyUnsupported {
            kind: kind.to_owned(),
            source_id: None,
            detail: format!("{count} object(s) out of the first version's scope"),
        });
    }
    if flag(clock_object, "loopRegionEnabled") == Some(true) {
        unsupported.push(LoopyUnsupported {
            kind: "Clock.loopRegion".to_owned(),
            source_id: Some(clock_id),
            detail: "the clock's loop region is not carried over".to_owned(),
        });
    }
    Ok(LoopyProject {
        clock,
        pages,
        resources: shared,
        unsupported,
    })
}

fn read_clip(
    objects: &Objects,
    page_id: i64,
    clip_id: i64,
    track: &Value,
    default_fades: (LoopyFade, LoopyFade),
    unsupported: &mut Vec<LoopyUnsupported>,
) -> Result<Option<LoopyClip>, ReadError> {
    let mut segments = Vec::new();
    for (_, layer_id) in references(track.get("layers")) {
        let layer = objects.get(layer_id, "Layer")?;
        let layer_volume = number(layer, "volume").unwrap_or(1.0);
        let layer_enabled = flag(layer, "enabled").unwrap_or(true);
        for (kind, segment_id) in references(layer.get("segments")) {
            if kind != "AudioSegment" {
                continue;
            }
            let segment = objects.get(segment_id, "AudioSegment")?;
            let invalid = |field| ReadError::Invalid {
                id: segment_id,
                field,
            };
            let (source_offset, source_length) =
                time_range(segment, "resourceSubregion").ok_or(invalid("resourceSubregion"))?;
            segments.push(LoopySegment {
                source_id: segment_id,
                resource_id: segment
                    .get("resourceId")
                    .and_then(Value::as_str)
                    .ok_or(invalid("resourceId"))?
                    .to_owned(),
                clip_offset_beats: number(segment, "offset").unwrap_or(0.0),
                duration_beats: number(segment, "duration").ok_or(invalid("duration"))?,
                source_offset_beats: source_offset,
                source_length_beats: source_length,
                original_tempo_bpm: number(segment, "originalTempo")
                    .ok_or(invalid("originalTempo"))?,
                ramp_in_beats: flag(segment, "rampStart")
                    .filter(|on| *on)
                    .and_then(|_| number(segment, "precedingRampDuration")),
                ramp_out_beats: flag(segment, "rampEnd")
                    .filter(|on| *on)
                    .and_then(|_| number(segment, "followingRampDuration")),
                wrap_region: time_range(segment, "wrapRegion"),
                volume: number(segment, "volume").unwrap_or(1.0),
                layer_volume,
                enabled: layer_enabled && flag(segment, "enabled").unwrap_or(true),
            });
        }
    }
    let is_midi = number(track, "type") == Some(1.0);
    if is_midi {
        unsupported.push(LoopyUnsupported {
            kind: "Track.midi".to_owned(),
            source_id: Some(clip_id),
            detail: "MIDI clip: out of the first version's scope".to_owned(),
        });
        return Ok(None);
    }
    if segments.is_empty() {
        return Ok(None);
    }
    let frame = track
        .get("frame")
        .and_then(|frame| frame.get("_value"))
        .and_then(Value::as_array)
        .filter(|values| values.len() == 4)
        .ok_or(ReadError::Invalid {
            id: clip_id,
            field: "frame",
        })?;
    let at = |index: usize| frame[index].as_f64().unwrap_or(0.0);
    let length_beats = number(track, "duration").ok_or(ReadError::Invalid {
        id: clip_id,
        field: "duration",
    })?;
    Ok(Some(LoopyClip {
        source_id: clip_id,
        page_id,
        cell: LoopyCell {
            column: at(0),
            row: at(1),
            width: at(2),
            height: at(3),
        },
        title: track
            .get("title")
            .and_then(Value::as_str)
            .map(str::to_owned),
        length_beats,
        looping: flag(track, "loop").unwrap_or(true),
        play_once: flag(track, "playOnce").unwrap_or(false),
        reverse: flag(track, "reverse").unwrap_or(false),
        speed: number(track, "speed").unwrap_or(1.0),
        rate: number(track, "rate").unwrap_or(1.0),
        pitch_semitones: number(track, "pitch").unwrap_or(0.0),
        volume: number(track, "volume").unwrap_or(1.0) * number(track, "gain").unwrap_or(1.0),
        fade_in: clip_fade(track, "fadeInDuration", "fadeInUnit", default_fades.0),
        fade_out: clip_fade(track, "fadeOutDuration", "fadeOutUnit", default_fades.1),
        segments,
    }))
}

/// The `objects` rows of a bundle's `Project.sqlite`, read from its bytes.
pub fn store_objects(store: &[u8]) -> Result<Vec<ObjectRow>, crate::sqlite_store::StoreError> {
    use crate::sqlite_store::{SqlValue, StoreError, read_table};
    let mut objects = Vec::new();
    for row in read_table(store, "objects")? {
        let (Some(SqlValue::Text(kind)), Some(contents)) = (row.columns.get(1), row.columns.get(2))
        else {
            return Err(StoreError(format!("object {} has no type", row.rowid)));
        };
        let bytes = match contents {
            SqlValue::Blob(bytes) => bytes.as_slice(),
            SqlValue::Text(text) => text.as_bytes(),
            _ => return Err(StoreError(format!("object {} has no contents", row.rowid))),
        };
        let contents = serde_json::from_slice(bytes)
            .map_err(|error| StoreError(format!("object {}: {error}", row.rowid)))?;
        objects.push(ObjectRow {
            id: row.rowid,
            kind: kind.clone(),
            contents,
        });
    }
    Ok(objects)
}
