//! Lays a normalized Loopy Pro project as the native Molecule timeline, through
//! the one document writer of every importer (atome-interchange's
//! `TimelineBuilder`). Every page becomes one Scene (a range of the one timeline,
//! the pages end to end), every grid position (and overdub layer) one track,
//! every audio segment one clip whose source is the shared media of its resource.
//! A cell is a Scene × track and loops its Scene's range, so a clip shorter than
//! its Scene repeats to the Scene's end, as a take landed in a cell does in atome.

use std::collections::BTreeMap;

use atome_interchange::molecule_writer::{
    CellSpec, ClipKind, ClipSource, ClipSpec, DEFAULT_SAMPLE_RATE, DocumentIds, StretchSpec,
    TempoEvent, TrackKind, TrackSpec, linear_to_gain_db,
};
use atome_interchange::{ImportError, ImportReport, MoleculeImport, TimelineBuilder};
use serde_json::{Value, json};

use crate::model::{LoopyClip, LoopyProject, LoopySegment};

/// Ticks of a beat used to compare loop lengths exactly (the kernel's ticks_per_beat).
const TICKS_PER_BEAT: f64 = 960.0;
/// A Scene is the least common multiple of its loops while it stays this many
/// times its longest loop at most; past it, the longest loop, the rest reported.
const MAX_SCENE_MULTIPLE: f64 = 8.0;

fn ticks(beats: f64) -> Option<u64> {
    let ticks = beats * TICKS_PER_BEAT;
    ((ticks - ticks.round()).abs() < 1e-6 && ticks >= 1.0).then_some(ticks.round() as u64)
}

fn gcd(a: u64, b: u64) -> u64 {
    if b == 0 { a } else { gcd(b, a % b) }
}

/// The Scene length of a page, in beats: the least common multiple of its loops
/// when they sit on the tick grid and it stays within bounds, else the longest
/// loop; a page without audio clips is one bar.
pub fn scene_length_beats(clips: &[LoopyClip], beats_per_bar: u32) -> f64 {
    let longest = clips
        .iter()
        .map(|clip| clip.length_beats)
        .fold(0.0, f64::max);
    if longest <= 0.0 {
        return f64::from(beats_per_bar.max(1));
    }
    let mut multiple = 1u64;
    for clip in clips {
        let Some(length) = ticks(clip.length_beats) else {
            return longest;
        };
        multiple = multiple / gcd(multiple, length) * length;
        if multiple as f64 > longest * TICKS_PER_BEAT * MAX_SCENE_MULTIPLE {
            return longest;
        }
    }
    multiple as f64 / TICKS_PER_BEAT
}

/// One piece of a segment heard inside one pass of its clip's loop, in beats of the
/// clock (the source is stretched to keep its beats).
pub struct SegmentPart {
    /// Where it starts in the loop.
    pub at: f64,
    pub length: f64,
    /// Where it lies in the segment's own time (its ramps belong to its start and end).
    pub segment_offset: f64,
    /// Where it reads its source, from the start of the source window.
    pub source_offset: f64,
}

/// What a segment sounds inside one pass of its clip's loop.
pub struct SegmentParts {
    pub parts: Vec<SegmentPart>,
    /// How many times the segment plays its source window (more than 1 when it lasts
    /// longer than its source: Loopy Pro's doubled loop repeats its audio).
    pub repeats: f64,
}

/// Loopy Pro places a segment at `offset` on its clip's time for `duration` beats,
/// its source window repeating when the segment lasts longer; the loop shows the
/// window [0, clip length): of a longer take, only the part inside it sounds. A
/// segment with a wrap region was recorded across that region's end: it folds into
/// the region, then the window applies.
pub fn segment_parts(clip: &LoopyClip, segment: &LoopySegment) -> SegmentParts {
    const EPSILON: f64 = 1e-6;
    let period = segment.source_length_beats;
    let mut placed = Vec::new();
    match segment.wrap_region {
        Some((start, length)) if length > EPSILON => {
            let folded = segment.duration_beats.min(length);
            let at = start + (segment.clip_offset_beats - start).rem_euclid(length);
            let first = folded.min(start + length - at);
            placed.push((at, first, 0.0));
            if folded - first > EPSILON {
                placed.push((start, folded - first, first));
            }
        }
        _ => placed.push((segment.clip_offset_beats, segment.duration_beats, 0.0)),
    }
    let mut parts = Vec::new();
    for (at, length, offset) in placed {
        let from = at.max(0.0);
        let to = (at + length).min(clip.length_beats);
        let mut cursor = offset + from - at;
        let end = offset + to - at;
        // Each repetition of the source window is its own piece.
        while end - cursor > EPSILON {
            let pass = (cursor / period + EPSILON).floor();
            let stop = end.min((pass + 1.0) * period);
            if stop - cursor > EPSILON {
                parts.push(SegmentPart {
                    at: at + cursor - offset,
                    length: stop - cursor,
                    segment_offset: cursor,
                    source_offset: (cursor - pass * period).max(0.0),
                });
            }
            cursor = stop;
        }
    }
    SegmentParts {
        parts,
        repeats: segment.duration_beats / period,
    }
}

struct Laying {
    builder: TimelineBuilder,
    seconds_per_beat: f64,
    tempo: f64,
    /// clip id → its Loopy Pro origin, the pairing key of every comparison.
    pairing: serde_json::Map<String, Value>,
    deviations: Vec<Value>,
    tracks: BTreeMap<(i64, i64, usize), String>,
}

impl Laying {
    fn deviation(&mut self, clip: i64, kind: &str, beats: f64, detail: String) {
        self.builder
            .report_mut()
            .approximate(kind, &format!("clip {clip}"), &detail);
        self.deviations.push(json!({
            "clip_source_id": clip, "kind": kind, "beats": beats,
            "milliseconds": beats * self.seconds_per_beat * 1000.0, "detail": detail,
        }));
    }

    fn skip(&mut self, clip: i64, what: &str, reason: String) {
        self.builder
            .report_mut()
            .skip(what, &format!("clip {clip}"), &reason);
    }

    fn check_clip(&mut self, clip: &LoopyClip, scene_beats: f64) {
        let id = clip.source_id;
        let passes = scene_beats / clip.length_beats;
        if clip.looping
            && !clip.play_once
            && (passes - passes.round()).abs() * clip.length_beats > 1e-6
        {
            let cut = scene_beats - passes.floor() * clip.length_beats;
            let detail = format!(
                "a loop of {} beats in a Scene of {scene_beats} beats: its last pass is cut after {cut} beats and it restarts with the Scene",
                clip.length_beats
            );
            self.deviation(id, "loop_phase", cut, detail);
        }
        for (value, field) in [(clip.rate, "rate"), (clip.speed, "speed")] {
            if (value - 1.0).abs() > 1e-9 {
                self.skip(
                    id,
                    &format!("Track.{field}"),
                    format!("{field} {value}: its semantics are not verified"),
                );
            }
        }
        if clip.pitch_semitones.abs() > 1e-9 {
            self.skip(
                id,
                "Track.pitch",
                format!(
                    "{} semitones: atome clips have no pitch shift",
                    clip.pitch_semitones
                ),
            );
        }
        if clip.reverse {
            self.skip(
                id,
                "Track.reverse",
                "reverse playback is not available on atome clips".into(),
            );
        }
        for (fade, which) in [
            (clip.fade_in, "Track.fadeIn"),
            (clip.fade_out, "Track.fadeOut"),
        ] {
            if fade.duration > 0.0 {
                let reason = format!(
                    "duration {} in unit code {:?}: the unit encoding is not documented",
                    fade.duration, fade.unit_code
                );
                self.skip(id, which, reason);
            }
        }
    }

    fn track(&mut self, clip: &LoopyClip, layer: usize) -> String {
        let key = (
            clip.cell.column.round() as i64,
            clip.cell.row.round() as i64,
            layer,
        );
        if let Some(id) = self.tracks.get(&key) {
            return id.clone();
        }
        let id = self
            .builder
            .add_track(TrackSpec::content("", TrackKind::Audio));
        self.tracks.insert(key, id.clone());
        id
    }

    fn lay_segment(
        &mut self,
        clip: &LoopyClip,
        segment: &LoopySegment,
        track: &str,
        scene: (f64, f64),
    ) -> Result<(), ImportError> {
        let (scene_start, scene_beats) = scene;
        let ratio = segment.original_tempo_bpm / self.tempo;
        let stretch = ((ratio - 1.0).abs() > 1e-9).then_some(StretchSpec {
            ratio,
            pitch_lock: true,
        });
        if stretch.is_some() {
            let detail = format!(
                "recorded at {} BPM, played at {} BPM: Loopy Pro keeps the pitch, atome's playback-rate stretch moves it by {:.2} semitones",
                segment.original_tempo_bpm,
                self.tempo,
                12.0 * (1.0 / ratio).log2()
            );
            self.deviation(clip.source_id, "stretch_pitch", 0.0, detail);
        }
        let to_source = 60.0 / segment.original_tempo_bpm;
        let gain = linear_to_gain_db(clip.volume * segment.volume * segment.layer_volume);
        let SegmentParts { parts, repeats } = segment_parts(clip, segment);
        if repeats > 1.0 + 1e-6 {
            let detail = format!(
                "a segment of {} beats on a source of {} beats: its source repeats {repeats:.3} times (Loopy Pro's doubled loop), a reading checked on the clip's waveform only",
                segment.duration_beats, segment.source_length_beats
            );
            self.deviation(
                clip.source_id,
                "segment_repeats_source",
                segment.duration_beats - segment.source_length_beats,
                detail,
            );
        }
        if let Some((start, length)) = segment.wrap_region
            && (start.abs() > 1e-9 || (length - clip.length_beats).abs() > 1e-9)
        {
            let detail = format!(
                "folded into a wrap region of {length} beats from beat {start}, in a loop of {} beats: this case is not verified against Loopy Pro",
                clip.length_beats
            );
            self.deviation(clip.source_id, "wrap_region", 0.0, detail);
        }
        if parts.is_empty() {
            self.skip(
                clip.source_id,
                "AudioSegment",
                format!(
                    "segment {} lies outside its loop's window",
                    segment.source_id
                ),
            );
            return Ok(());
        }
        let looping = clip.looping && !clip.play_once;
        // One part covering its whole loop repeats as one block; otherwise each pass is laid.
        let whole = parts.len() == 1
            && parts[0].at < 1e-9
            && (parts[0].length - clip.length_beats).abs() < 1e-6;
        let passes = if looping && !whole {
            (scene_beats / clip.length_beats).ceil() as u32
        } else {
            1
        };
        for repeat in 0..passes {
            for (part, piece) in parts.iter().enumerate() {
                let at = f64::from(repeat) * clip.length_beats + piece.at;
                if at >= scene_beats - 1e-9 {
                    continue;
                }
                let length = piece.length.min(scene_beats - at);
                let source_in = (segment.source_offset_beats + piece.source_offset) * to_source;
                let mut spec = ClipSpec::new(
                    ClipKind::Audio,
                    ClipSource::Media(segment.resource_id.clone()),
                    (scene_start + at) * self.seconds_per_beat,
                    length * self.seconds_per_beat,
                    source_in,
                );
                spec.source_out_seconds = Some(source_in + length * to_source);
                spec.name = clip.title.clone();
                spec.stretch = stretch;
                spec.gain_db = (gain.abs() > 1e-9).then_some(gain);
                // The ramps belong to the segment's own start and end, not to a cut by the window.
                if piece.segment_offset < 1e-9 {
                    spec.fade_in_seconds =
                        segment.ramp_in_beats.unwrap_or(0.0) * self.seconds_per_beat;
                }
                if piece.segment_offset + piece.length >= segment.duration_beats - 1e-6 {
                    spec.fade_out_seconds =
                        segment.ramp_out_beats.unwrap_or(0.0) * self.seconds_per_beat;
                }
                if whole && looping && scene_beats > clip.length_beats + 1e-9 {
                    spec.block_loop_seconds = Some((scene_beats - at) * self.seconds_per_beat);
                }
                let id = self.builder.add_clip(track, spec)?;
                self.pairing.insert(
                    id,
                    json!({
                        "page_source_id": clip.page_id, "clip_source_id": clip.source_id,
                        "segment_source_id": segment.source_id, "resource_id": segment.resource_id,
                        "part": part, "repeat": repeat,
                    }),
                );
            }
        }
        Ok(())
    }
}

/// The Molecule import of a project. Its media keys are the Loopy resource ids;
/// `report.source.lpproj_media` gives each one's content hash, by which the JS
/// importer stores it once.
pub fn lay_out(project: &LoopyProject, name: &str) -> Result<MoleculeImport, ImportError> {
    let tempo = project.clock.tempo_bpm;
    let mut builder = TimelineBuilder::new(
        DocumentIds::placeholder(),
        DEFAULT_SAMPLE_RATE,
        ImportReport::new("lpproj", name),
    )?;
    builder.set_tempo_map(vec![TempoEvent {
        start_seconds: 0.0,
        bpm: tempo,
        beats_per_bar: project.clock.beats_per_bar,
        beat_unit: 4,
        ramp: false,
    }])?;
    for entry in &project.unsupported {
        let location = entry
            .source_id
            .map_or_else(|| "project".to_owned(), |id| format!("object {id}"));
        builder
            .report_mut()
            .skip(&entry.kind, &location, &entry.detail);
    }
    let mut laying = Laying {
        builder,
        seconds_per_beat: 60.0 / tempo,
        tempo,
        pairing: serde_json::Map::new(),
        deviations: Vec::new(),
        tracks: BTreeMap::new(),
    };
    // Tracks in grid order (row by row, then layer), whatever page holds them first.
    let mut positions: Vec<(&LoopyClip, usize)> = project
        .pages
        .iter()
        .flat_map(|page| &page.clips)
        .flat_map(|clip| (0..clip.segments.len()).map(move |layer| (clip, layer)))
        .collect();
    positions.sort_by(|(a, la), (b, lb)| {
        (a.cell.row, a.cell.column, *la)
            .partial_cmp(&(b.cell.row, b.cell.column, *lb))
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    for (clip, layer) in positions {
        laying.track(clip, layer);
    }
    let mut scenes = Vec::new();
    let mut cursor = 0.0;
    for page in &project.pages {
        let scene_beats = scene_length_beats(&page.clips, project.clock.beats_per_bar);
        let scene_name = page.title.clone().unwrap_or_default();
        let scene = laying.builder.add_scene(
            &scene_name,
            cursor * laying.seconds_per_beat,
            scene_beats * laying.seconds_per_beat,
        )?;
        let looped = CellSpec {
            play_mode: Some("loop".into()),
            ..CellSpec::default()
        };
        laying.builder.set_cell(&scene, None, looped)?;
        scenes.push(json!({ "scene_id": scene, "page_source_id": page.source_id, "length_beats": scene_beats }));
        for clip in &page.clips {
            laying.check_clip(clip, scene_beats);
            for (layer, segment) in clip
                .segments
                .iter()
                .enumerate()
                .filter(|(_, segment)| segment.enabled)
            {
                let track = laying.track(clip, layer);
                let play_mode = if clip.looping && !clip.play_once {
                    "loop"
                } else {
                    "one_shot"
                };
                let cell = CellSpec {
                    play_mode: Some(play_mode.into()),
                    ..CellSpec::default()
                };
                laying.builder.set_cell(&scene, Some(&track), cell)?;
                laying.lay_segment(clip, segment, &track, (cursor, scene_beats))?;
            }
        }
        cursor += scene_beats;
    }
    let tracks: serde_json::Map<String, Value> = laying
        .tracks
        .iter()
        .map(|((column, row, layer), id)| {
            (
                id.clone(),
                json!({ "column": column, "row": row, "layer": layer }),
            )
        })
        .collect();
    let report = laying.builder.report_mut();
    report.count("pages", project.pages.len() as u64);
    report.count(
        "clips",
        project
            .pages
            .iter()
            .map(|page| page.clips.len() as u64)
            .sum(),
    );
    report.count("unique_media", project.resources.len() as u64);
    report.source_fact("lpproj_tempo_bpm", json!(tempo));
    report.source_fact("lpproj_scenes", Value::Array(scenes));
    report.source_fact("lpproj_tracks", Value::Object(tracks));
    report.source_fact("lpproj_clips", Value::Object(laying.pairing));
    report.source_fact("lpproj_deviations", Value::Array(laying.deviations));
    report.source_fact("lpproj_media", json!(project.resources));
    laying.builder.finish()
}
