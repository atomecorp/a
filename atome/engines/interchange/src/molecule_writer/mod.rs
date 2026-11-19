//! The one writer of the native Molecule timeline document (`eve.molecule.timeline`
//! v2, `eVe/intuition/tools/molecule/kernel/schemas.js`) for every importer
//! (DAWproject, OpenTimelineIO, FCPXML, Loopy Pro). Importers describe tracks,
//! clips, notes, scenes, markers, automation and mix in seconds; [`TimelineBuilder::finish`]
//! rounds them to the timeline's sample frames exactly as the kernel does
//! (`Math.round(seconds * sample_rate)`, a clip's length taken between its rounded
//! ends so touching clips never overlap), splits clips that overlap on one track
//! onto sibling tracks (the kernel refuses overlaps), closes every section with
//! its empty track and writes the document the kernel's `validateTimeline` accepts.
//! Media stay placeholders (`media_ref` keys) that the JS importer replaces by
//! stored media Atomes; a key it cannot resolve leaves its clip in place, offline.

mod emit;
mod mix;
mod mixing;
mod spec;

pub use mix::{MIX_MAX_GAIN_DB, MIX_SILENCE_DB, linear_to_gain_db};
pub use spec::*;

use crate::ImportError;
use crate::report::ImportReport;
use mix::Strip;
use serde_json::Value;

/// The kernel's default sample rate (`DEFAULT_MOLECULE_SAMPLE_RATE`).
pub const DEFAULT_SAMPLE_RATE: u32 = 48_000;

/// The ids the document carries; the JS importer gives the real ones once the
/// project exists (`tl_<project>`, the project, the project as owner).
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct DocumentIds {
    /// `timeline_id`.
    pub timeline_id: String,
    /// `project_id`.
    pub project_id: String,
    /// `owner_atome_id`.
    pub owner_atome_id: String,
}

impl DocumentIds {
    /// Placeholder ids (`tl_import`, `import`, `import`).
    pub fn placeholder() -> DocumentIds {
        DocumentIds {
            timeline_id: "tl_import".into(),
            project_id: "import".into(),
            owner_atome_id: "import".into(),
        }
    }
}

#[derive(Clone, Debug)]
pub(crate) struct Track {
    pub id: String,
    pub section: String,
    pub spec: TrackSpec,
    pub strip: Strip,
}

#[derive(Clone, Debug)]
pub(crate) struct Lane {
    pub id: String,
    pub target: String,
    pub param: String,
    pub keyframes: Vec<Keyframe>,
}

#[derive(Clone, Debug)]
pub(crate) struct Scene {
    pub id: String,
    pub name: String,
    pub start_seconds: f64,
    pub duration_seconds: f64,
}

/// The result of an import: the document, its report (also in `meta.import`),
/// the media its clips name and the MIDI notes to encode.
#[derive(Clone, Debug)]
pub struct MoleculeImport {
    /// The `eve.molecule.timeline` v2 document.
    pub document: Value,
    /// What came in and what did not.
    pub report: ImportReport,
    /// Each media key its clips name, once.
    pub media: Vec<MediaUse>,
    /// Each MIDI media to encode as SMF.
    pub midi: Vec<MidiMedia>,
}

impl MoleculeImport {
    /// `{ document, report, media, midi }` as one JSON text (what the WASM binding returns).
    pub fn to_json(&self) -> String {
        serde_json::json!({
            "document": self.document,
            "report": self.report.to_value(),
            "media": self.media,
            "midi": self.midi,
        })
        .to_string()
    }
}

/// Builds one Molecule timeline document.
#[derive(Clone, Debug)]
pub struct TimelineBuilder {
    pub(crate) ids: DocumentIds,
    pub(crate) sample_rate: u32,
    pub(crate) fps: f64,
    pub(crate) tempo_map: Vec<TempoEvent>,
    pub(crate) sections: Vec<(String, String)>,
    pub(crate) tracks: Vec<Track>,
    pub(crate) clips: Vec<(String, String, ClipSpec)>,
    pub(crate) markers: Vec<(String, f64)>,
    pub(crate) scenes: Vec<Scene>,
    pub(crate) cells: Vec<(String, Option<String>, CellSpec)>,
    pub(crate) lanes: Vec<Lane>,
    pub(crate) midi: Vec<MidiMedia>,
    pub(crate) report: ImportReport,
    next: u64,
}

pub(crate) fn finite(value: f64, field: &str) -> Result<f64, ImportError> {
    if value.is_finite() {
        Ok(value)
    } else {
        Err(ImportError::new(
            "writer_value_invalid",
            format!("{field} is not finite"),
        ))
    }
}

impl TimelineBuilder {
    /// An empty timeline at `sample_rate` (> 0) with one section, 120 bpm 4/4 and 30 fps.
    pub fn new(
        ids: DocumentIds,
        sample_rate: u32,
        report: ImportReport,
    ) -> Result<TimelineBuilder, ImportError> {
        if sample_rate == 0 {
            return Err(ImportError::new(
                "writer_sample_rate_invalid",
                "the sample rate must be > 0",
            ));
        }
        let mut builder = TimelineBuilder {
            ids,
            sample_rate,
            fps: 30.0,
            tempo_map: vec![TempoEvent {
                start_seconds: 0.0,
                bpm: 120.0,
                beats_per_bar: 4,
                beat_unit: 4,
                ramp: false,
            }],
            sections: Vec::new(),
            tracks: Vec::new(),
            clips: Vec::new(),
            markers: Vec::new(),
            scenes: Vec::new(),
            cells: Vec::new(),
            lanes: Vec::new(),
            midi: Vec::new(),
            report,
            next: 0,
        };
        builder.add_section("Section 1");
        Ok(builder)
    }

    pub(crate) fn fresh(&mut self, prefix: &str) -> String {
        self.next += 1;
        format!("{prefix}_{}", self.next)
    }

    /// The report the import fills (written into `meta.import`).
    pub fn report_mut(&mut self) -> &mut ImportReport {
        &mut self.report
    }

    /// The video frame rate kept in `timebase.fps` (the timeline counts in samples).
    pub fn set_frame_rate(&mut self, fps: f64) -> Result<(), ImportError> {
        if !(fps.is_finite() && fps > 0.0) {
            return Err(ImportError::new(
                "writer_fps_invalid",
                "the frame rate must be > 0",
            ));
        }
        self.fps = fps;
        Ok(())
    }

    /// The tempo map: the first change at 0, start times rising, tempos > 0.
    pub fn set_tempo_map(&mut self, events: Vec<TempoEvent>) -> Result<(), ImportError> {
        let bad = |message: &str| ImportError::new("writer_tempo_map_invalid", message);
        if events
            .first()
            .is_none_or(|first| first.start_seconds != 0.0)
        {
            return Err(bad("the tempo map must start at 0 seconds"));
        }
        for (index, event) in events.iter().enumerate() {
            if !(event.bpm.is_finite()
                && event.bpm > 0.0
                && event.beats_per_bar > 0
                && event.beat_unit > 0)
            {
                return Err(bad("a tempo change needs a tempo > 0 and a positive meter"));
            }
            if index > 0 && event.start_seconds <= events[index - 1].start_seconds {
                return Err(bad("tempo changes must rise strictly in time"));
            }
        }
        self.tempo_map = events;
        Ok(())
    }

    /// The first section's id (every builder has one).
    pub fn first_section(&self) -> &str {
        &self.sections[0].0
    }

    /// Adds a section after the others and answers its id.
    pub fn add_section(&mut self, name: &str) -> String {
        let id = self.fresh("section");
        let name = if name.is_empty() {
            format!("Section {}", self.sections.len() + 1)
        } else {
            name.into()
        };
        self.sections.push((id.clone(), name));
        id
    }

    /// Adds a track at the end of the first section and answers its id.
    pub fn add_track(&mut self, spec: TrackSpec) -> String {
        let section = self.sections[0].0.clone();
        self.push_track(section, spec)
    }

    /// Adds a track at the end of `section_id`.
    pub fn add_track_in(
        &mut self,
        section_id: &str,
        spec: TrackSpec,
    ) -> Result<String, ImportError> {
        if !self.sections.iter().any(|(id, _)| id == section_id) {
            return Err(ImportError::new(
                "writer_section_missing",
                format!("no section {section_id}"),
            ));
        }
        Ok(self.push_track(section_id.into(), spec))
    }

    fn push_track(&mut self, section: String, mut spec: TrackSpec) -> String {
        if spec.name.trim().is_empty() {
            spec.name = format!("Piste {}", self.tracks.len() + 1);
        }
        let id = self.fresh("track");
        self.tracks.push(Track {
            id: id.clone(),
            section,
            spec,
            strip: Strip::default(),
        });
        id
    }

    pub(crate) fn track(&self, track_id: &str) -> Result<&Track, ImportError> {
        self.tracks
            .iter()
            .find(|track| track.id == track_id)
            .ok_or_else(|| ImportError::new("writer_track_missing", format!("no track {track_id}")))
    }

    pub(crate) fn strip(&mut self, track_id: &str) -> Result<&mut Strip, ImportError> {
        let track = self
            .tracks
            .iter_mut()
            .find(|track| track.id == track_id)
            .ok_or_else(|| {
                ImportError::new("writer_track_missing", format!("no track {track_id}"))
            })?;
        if track.spec.role == TrackRole::Content && !track.spec.kind.has_audio_strip() {
            return Err(ImportError::new(
                "writer_track_has_no_audio_strip",
                format!("track {track_id} has no audio strip"),
            ));
        }
        Ok(&mut track.strip)
    }

    /// True when the track has an audio strip (a group, or an audio, video or mixed track).
    pub fn has_audio_strip(&self, track_id: &str) -> bool {
        self.track(track_id).is_ok_and(|track| {
            track.spec.role == TrackRole::Group || track.spec.kind.has_audio_strip()
        })
    }

    /// Adds a clip on a content track that accepts its kind and answers its id. A
    /// clip starting before 0 loses its part before 0.
    pub fn add_clip(&mut self, track_id: &str, mut spec: ClipSpec) -> Result<String, ImportError> {
        let track = self.track(track_id)?;
        if track.spec.role != TrackRole::Content {
            return Err(ImportError::new(
                "writer_clip_on_group",
                format!("track {track_id} is a group"),
            ));
        }
        if !track.spec.kind.accepts(spec.kind) {
            return Err(ImportError::new(
                "writer_clip_kind_mismatch",
                format!(
                    "a {} clip cannot lie on a {} track",
                    spec.kind.key(),
                    track.spec.kind.key()
                ),
            ));
        }
        finite(spec.start_seconds, "clip start")?;
        finite(spec.duration_seconds, "clip duration")?;
        finite(spec.source_in_seconds, "clip source in")?;
        if spec.start_seconds < 0.0 {
            let cut = -spec.start_seconds;
            let rate = spec.stretch.map_or(1.0, |stretch| stretch.ratio);
            spec.start_seconds = 0.0;
            spec.duration_seconds -= cut;
            spec.source_in_seconds += cut / rate;
        }
        let id = self.fresh("clip");
        self.clips.push((id.clone(), track_id.into(), spec));
        Ok(id)
    }

    /// Registers the notes a [`ClipSource::Midi`] key names.
    pub fn add_midi_media(&mut self, media: MidiMedia) {
        self.midi.push(media);
    }

    /// A named instant on the ruler.
    pub fn add_marker(&mut self, name: &str, time_seconds: f64) -> Result<(), ImportError> {
        if !(time_seconds.is_finite() && time_seconds >= 0.0) {
            return Err(ImportError::new(
                "writer_marker_invalid",
                "a marker needs a time >= 0",
            ));
        }
        self.markers.push((name.into(), time_seconds));
        Ok(())
    }

    /// A Scene (a time range of the timeline; Scenes never overlap); answers its id.
    pub fn add_scene(
        &mut self,
        name: &str,
        start_seconds: f64,
        duration_seconds: f64,
    ) -> Result<String, ImportError> {
        if !(start_seconds.is_finite()
            && start_seconds >= 0.0
            && duration_seconds.is_finite()
            && duration_seconds > 0.0)
        {
            return Err(ImportError::new(
                "writer_scene_invalid",
                "a scene needs a start >= 0 and a length > 0",
            ));
        }
        let id = self.fresh("scene");
        self.scenes.push(Scene {
            id: id.clone(),
            name: name.into(),
            start_seconds,
            duration_seconds,
        });
        Ok(id)
    }

    /// A cell's own settings: a Scene's track (`Some`) or the Scene itself (`None`).
    pub fn set_cell(
        &mut self,
        scene_id: &str,
        track_id: Option<&str>,
        cell: CellSpec,
    ) -> Result<(), ImportError> {
        if !self.scenes.iter().any(|scene| scene.id == scene_id) {
            return Err(ImportError::new(
                "writer_scene_missing",
                format!("no scene {scene_id}"),
            ));
        }
        if let Some(track_id) = track_id {
            self.track(track_id)?;
        }
        self.cells
            .push((scene_id.into(), track_id.map(String::from), cell));
        Ok(())
    }

    /// Writes the document (see the module documentation).
    pub fn finish(self) -> Result<MoleculeImport, ImportError> {
        emit::finish(self)
    }
}
