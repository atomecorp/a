//! The import report: what came in, what stayed out and why, kept as data in the
//! timeline (`meta.import`) and never shown (user decision, 16 Nov. 2026: no
//! arbitration screen; an external plug-in is skipped without a word).

use serde::Serialize;
use serde_json::{Map, Value};
use std::collections::BTreeMap;

/// One kind of thing that was not imported, counted.
#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct NotImported {
    /// What it is (`"vst3_plugin"`, `"generator_reference"`, `"title"`…).
    pub what: String,
    /// Where it lies (a track's or a clip's name, or the project).
    #[serde(rename = "where")]
    pub location: String,
    /// Why it stays out (`"external_plugins_unsupported"`…).
    pub reason: String,
    /// How many.
    pub count: u64,
}

/// The report of one import: its counts, its losses, its approximations and the
/// media its clips name but nobody could find (kept as offline clips).
#[derive(Clone, Debug, Default, PartialEq, Serialize)]
pub struct ImportReport {
    /// `"dawproject"`, `"otio"`, `"fcpxml"`, `"lpproj"`…
    pub source_format: String,
    /// The source's own name (a project, a timeline, a file).
    pub source_name: String,
    /// The application that wrote it, when it says so.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub application: Option<String>,
    /// Counts of what was imported (`tracks`, `clips`, `notes`, `markers`…).
    pub imported: BTreeMap<String, u64>,
    /// What stayed out, merged by (what, where, reason).
    pub not_imported: Vec<NotImported>,
    /// What was laid approximately, merged the same way (`count` how often).
    pub approximated: Vec<NotImported>,
    /// Media keys named by clips; the importer moves each one it cannot resolve
    /// into `offline` (the clip is kept, its source stays a `media_ref`).
    pub offline: Vec<String>,
    /// Facts of the source kept for reference (frame rate, start timecode, metadata).
    pub source: Map<String, Value>,
}

impl ImportReport {
    /// An empty report for `source_format`.
    pub fn new(source_format: &str, source_name: &str) -> ImportReport {
        ImportReport {
            source_format: source_format.into(),
            source_name: source_name.into(),
            ..ImportReport::default()
        }
    }

    /// Adds `by` to the `key` count of what was imported.
    pub fn count(&mut self, key: &str, by: u64) {
        *self.imported.entry(key.into()).or_insert(0) += by;
    }

    /// Records one thing not imported (merged with its like).
    pub fn skip(&mut self, what: &str, location: &str, reason: &str) {
        merge(&mut self.not_imported, what, location, reason);
    }

    /// Records one approximation (merged with its like).
    pub fn approximate(&mut self, what: &str, location: &str, reason: &str) {
        merge(&mut self.approximated, what, location, reason);
    }

    /// Keeps a fact of the source.
    pub fn source_fact(&mut self, key: &str, value: Value) {
        self.source.insert(key.into(), value);
    }

    /// The report as JSON (string keys and plain values only: it cannot fail).
    pub fn to_value(&self) -> Value {
        serde_json::to_value(self).expect("an import report holds only JSON values")
    }
}

fn merge(list: &mut Vec<NotImported>, what: &str, location: &str, reason: &str) {
    if let Some(entry) = list
        .iter_mut()
        .find(|e| e.what == what && e.location == location && e.reason == reason)
    {
        entry.count += 1;
        return;
    }
    list.push(NotImported {
        what: what.into(),
        location: location.into(),
        reason: reason.into(),
        count: 1,
    });
}
