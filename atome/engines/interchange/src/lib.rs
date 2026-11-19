//! atome-interchange: other applications' projects read into atome (one way),
//! laid as the native Molecule timeline.
//!
//! # API summary
//!
//! Readers (each answers a [`MoleculeImport`] or a typed [`ImportError`]):
//! - [`dawproject::read`]`(project_xml, metadata_xml, entries)`: a DAWproject's
//!   `project.xml` (+ `metadata.xml`, may be empty) and the archive's entry names.
//! - [`otio::read`]`(text)`: an OpenTimelineIO `.otio` JSON document.
//! - [`fcpxml::read`]`(text)`: a Final Cut Pro XML document (1.8–1.11; a
//!   `.fcpxmld` bundle's `Info.fcpxml`).
//!
//! The Molecule writer ([`molecule_writer`]), shared with every importer (Loopy Pro too):
//! - [`TimelineBuilder::new`]`(ids, sample_rate, report)`, then
//!   `set_frame_rate`, `set_tempo_map(Vec<TempoEvent>)`, `add_section`, `add_track(TrackSpec) -> track_id`,
//!   `add_track_in(section, TrackSpec)`, `add_clip(track, ClipSpec) -> clip_id`, `add_midi_media(MidiMedia)`,
//!   `set_gain_db`, `set_pan`, `add_dsp(track, &DspSpec) -> module_id`, `send_to_group`, `route_to_group`,
//!   `add_automation`, `automate_gain_db`, `automate_pan`, `add_marker`, `add_scene -> scene_id`, `set_cell`,
//!   `report_mut`, then [`TimelineBuilder::finish`] → [`MoleculeImport`] (`document`, `report`, `media`,
//!   `midi`; [`MoleculeImport::to_json`] for the WASM boundary).
//! - [`tempo::TempoMap`]: beats ↔ seconds over tempo and meter changes, and its
//!   Molecule `tempo_map`.
//! - [`frac::Frac`]: exact rational time (FCPXML `N/Ds`, OTIO `value/rate`).
//!
//! Media are referenced by key (`media_ref`); the JS importer
//! (`eVe/domains/molecule_import/timeline_document_import.js`) stores them, encodes
//! the MIDI notes to SMF, and commits the timeline into a project. External
//! plug-ins (VST, AU, CLAP) are never imported: the report records them as data,
//! nothing is shown (user decision, 16 Nov. 2026).

pub mod dawproject;
pub mod fcpxml;
pub mod frac;
pub mod molecule_writer;
pub mod otio;
pub mod report;
pub mod tempo;
pub mod xml;

pub use molecule_writer::{MoleculeImport, TimelineBuilder};
pub use report::ImportReport;

/// An import refused, with its stable code (`dawproject_xml_invalid`, `otio_json_invalid`…).
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ImportError {
    /// The stable code.
    pub code: String,
    /// What was wrong, for the logs.
    pub message: String,
}

impl ImportError {
    /// An error of `code`.
    pub fn new(code: &str, message: impl Into<String>) -> ImportError {
        ImportError {
            code: code.into(),
            message: message.into(),
        }
    }
}

impl std::fmt::Display for ImportError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}: {}", self.code, self.message)
    }
}

impl std::error::Error for ImportError {}
