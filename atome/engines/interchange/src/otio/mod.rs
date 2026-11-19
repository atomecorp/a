//! OpenTimelineIO (`.otio`, the Academy Software Foundation's JSON timeline,
//! Apache-2.0) read into the Molecule timeline. A `Timeline.1` holds a `Stack.1`
//! of `Track.1` (video or audio); each top-level track becomes one Molecule track,
//! its `Clip` (1 and 2), `Gap` and `Transition` laid in order, times kept exact
//! (rational, 24000/1001 too) until the writer rounds them to samples. A nested
//! `Stack` or `Track` is flattened onto its parent track (the writer moves what
//! overlaps to sibling tracks); a `LinearTimeWarp` becomes a stretch; a
//! `Transition` a centred transition on its left clip, or a fade where one side is
//! a gap. Media are referenced by their `target_url`.

mod items;
mod values;

use crate::ImportError;
use crate::frac::Frac;
use crate::molecule_writer::{
    ClipKind, ClipSource, ClipSpec, DEFAULT_SAMPLE_RATE, DocumentIds, MoleculeImport, StretchSpec,
    TimelineBuilder, TrackKind, TrackSpec, TransitionKind, TransitionSpec,
};
use crate::report::ImportReport;
use serde_json::{Value, json};
use values::{list, range, schema, text, time};

pub(super) const MAX_NESTING: usize = 64;
pub(super) const IMAGE_EXTENSIONS: [&str; 9] = [
    ".png", ".jpg", ".jpeg", ".tif", ".tiff", ".exr", ".dpx", ".bmp", ".webp",
];

// abs = abs0 + (local - local0) * speed, inside [from, to).
#[derive(Clone, Copy, Debug)]
pub(super) struct Map {
    pub abs0: f64,
    pub local0: f64,
    pub speed: f64,
    pub from: f64,
    pub to: f64,
}

impl Map {
    fn abs(&self, local: f64) -> f64 {
        self.abs0 + (local - self.local0) * self.speed
    }

    // The map of an item placed at `position` (parent local time), reading its own
    // time from `start` at `scalar` times the speed, `duration` long (own time).
    fn child(&self, position: f64, start: f64, duration: f64, scalar: f64) -> Map {
        let abs0 = self.abs(position);
        let speed = self.speed / scalar;
        let end = abs0 + duration * self.speed;
        Map {
            abs0,
            local0: start,
            speed,
            from: self.from.max(abs0),
            to: self.to.min(end),
        }
    }
}

#[derive(Clone, Debug)]
pub(super) struct Piece {
    pub track: usize,
    pub kind: ClipKind,
    pub key: String,
    pub name: String,
    pub start: f64,
    pub end: f64,
    pub source_in: f64,
    pub source_out: f64,
    pub fade_in: f64,
    pub fade_out: f64,
    pub transition: Option<f64>,
}

pub(super) struct Reader {
    pub report: ImportReport,
    pub pieces: Vec<Piece>,
    pub markers: Vec<(String, f64)>,
    pub has_audio_tracks: bool,
    pub rate: Option<f64>,
}

use items::{Place, duration_of, markers, track_items};

/// Reads an OpenTimelineIO document (`Timeline.1`).
pub fn read(text_json: &str) -> Result<MoleculeImport, ImportError> {
    let root = values::parse(text_json)?;
    if schema(&root) != "Timeline" {
        return Err(ImportError::new(
            "otio_not_a_timeline",
            format!(
                "the root is {:?}, not a Timeline",
                text(&root, "OTIO_SCHEMA")
            ),
        ));
    }
    let stack = root
        .get("tracks")
        .filter(|stack| schema(stack) == "Stack")
        .ok_or_else(|| {
            ImportError::new("otio_not_a_timeline", "the Timeline has no Stack of tracks")
        })?;
    let name = text(&root, "name");
    let mut report = ImportReport::new(
        "otio",
        if name.is_empty() {
            "OpenTimelineIO"
        } else {
            name
        },
    );
    report.source_fact("schema", json!(text(&root, "OTIO_SCHEMA")));
    if let Some(global) = root.get("global_start_time").filter(|v| !v.is_null()) {
        report.source_fact("global_start_seconds", json!(time(global)?.to_f64()));
    }
    let tracks: Vec<&Value> = list(stack, "children")
        .iter()
        .filter(|t| matches!(schema(t), "Track" | "Sequence"))
        .collect();
    let has_audio_tracks = tracks.iter().any(|track| text(track, "kind") == "Audio");
    let mut reader = Reader {
        report,
        pieces: Vec::new(),
        markers: Vec::new(),
        has_audio_tracks,
        rate: None,
    };
    let top = Map {
        abs0: 0.0,
        local0: 0.0,
        speed: 1.0,
        from: 0.0,
        to: f64::INFINITY,
    };
    let top = match range(stack.get("source_range"))? {
        Some((start, duration)) => top.child(0.0, start.to_f64(), duration.to_f64(), 1.0),
        None => top,
    };
    markers(&mut reader, stack, &top)?;
    let mut specs: Vec<TrackSpec> = Vec::new();
    // The top video layer first, as a timeline reads from the top; audio after, in order.
    let mut ordered: Vec<&Value> = tracks
        .iter()
        .copied()
        .filter(|t| text(t, "kind") != "Audio")
        .rev()
        .collect();
    ordered.extend(
        tracks
            .iter()
            .copied()
            .filter(|t| text(t, "kind") == "Audio"),
    );
    for track in ordered {
        let kind = match text(track, "kind") {
            "Audio" => TrackKind::Audio,
            "Video" => TrackKind::Video,
            other => {
                reader.report.skip(
                    "track",
                    if other.is_empty() { "Stack" } else { other },
                    "track_kind_without_equivalent",
                );
                continue;
            }
        };
        let name = text(track, "name");
        let mute = track.get("enabled").and_then(Value::as_bool) == Some(false);
        specs.push(TrackSpec {
            mute,
            ..TrackSpec::content(name, kind)
        });
        let location = if name.is_empty() { "Track" } else { name };
        let mut trim = range(track.get("source_range"))?.map_or(0.0, |(start, _)| start.to_f64());
        let length = duration_of(track, 0)?.to_f64();
        let natural = list(track, "children")
            .iter()
            .filter(|child| schema(child) != "Transition")
            .try_fold(Frac::ZERO, |sum, child| {
                Ok::<Frac, ImportError>(sum.plus(duration_of(child, 1)?))
            })?
            .to_f64();
        // An EDL's record timecode written as the track's trim (`start_time` -01:00:00) holds none of its items: the
        // trim's start is read as the items' start, its length kept.
        if trim + length <= 0.0 || trim >= natural {
            reader.report.approximate(
                "track_trim",
                location,
                "trim_outside_its_items_read_from_their_start",
            );
            trim = 0.0;
        }
        let map = top.child(0.0, trim, length, 1.0);
        markers(&mut reader, track, &map)?;
        track_items(
            &mut reader,
            track,
            &Place {
                track: specs.len() - 1,
                kind,
                map,
                location,
            },
            0,
        )?;
    }
    write(reader, specs)
}

fn write(mut reader: Reader, specs: Vec<TrackSpec>) -> Result<MoleculeImport, ImportError> {
    let fps = reader.rate.map(values::rate).transpose()?;
    if let Some(fps) = fps {
        reader.report.source_fact(
            "frame_rate",
            json!({ "num": fps.num() as i64, "den": fps.den() as i64 }),
        );
    }
    let markers = std::mem::take(&mut reader.markers);
    let pieces = std::mem::take(&mut reader.pieces);
    let mute_video_sound = reader.has_audio_tracks;
    let mut builder = TimelineBuilder::new(
        DocumentIds::placeholder(),
        DEFAULT_SAMPLE_RATE,
        reader.report,
    )?;
    if let Some(fps) = fps {
        builder.set_frame_rate(fps.to_f64())?;
    }
    let ids: Vec<String> = specs
        .into_iter()
        .map(|spec| builder.add_track(spec))
        .collect();
    for piece in pieces {
        let duration = piece.end - piece.start;
        let mut spec = ClipSpec::new(
            piece.kind,
            ClipSource::Media(piece.key),
            piece.start,
            duration,
            piece.source_in,
        );
        spec.source_out_seconds = Some(piece.source_out);
        spec.name = (!piece.name.is_empty()).then_some(piece.name);
        spec.fade_in_seconds = piece.fade_in;
        spec.fade_out_seconds = piece.fade_out;
        spec.transition = piece.transition.map(|seconds| TransitionSpec {
            kind: TransitionKind::Fade,
            seconds,
        });
        let natural = piece.source_out - piece.source_in;
        if piece.kind != ClipKind::Image && natural > 0.0 && (duration / natural - 1.0).abs() > 1e-9
        {
            spec.stretch = Some(StretchSpec {
                ratio: duration / natural,
                pitch_lock: false,
            });
        }
        spec.sound_muted = piece.kind == ClipKind::Video && mute_video_sound;
        builder.add_clip(&ids[piece.track], spec)?;
    }
    for (name, at) in markers {
        builder.add_marker(&name, at)?;
    }
    builder.finish()
}
