// The interchange readers (atome-interchange), reached from the page: a DAWproject's
// `project.xml` (+ `metadata.xml` and its archive's entry names), an OpenTimelineIO
// `.otio` text or a Final Cut Pro XML text, read into the Molecule import of the one
// document writer (`{ document, report, media, midi }`) as JSON, which
// eVe/domains/molecule_import/timeline_document_import.js applies. A refusal is an
// Error whose message starts with the reader's stable code.
use atome_interchange::{ImportError, dawproject, fcpxml, otio};
use wasm_bindgen::prelude::*;

fn refusal(error: ImportError) -> JsError {
    JsError::new(&error.to_string())
}

/// `interchangeReadDawproject(projectXml, metadataXml, entriesJson)`: `entriesJson`
/// is the archive's entry names as a JSON array of strings.
#[wasm_bindgen(js_name = interchangeReadDawproject)]
pub fn interchange_read_dawproject(
    project_xml: &str,
    metadata_xml: &str,
    entries_json: &str,
) -> Result<String, JsError> {
    let entries: Vec<String> = serde_json::from_str(entries_json)
        .map_err(|error| JsError::new(&format!("dawproject_entries_invalid: {error}")))?;
    dawproject::read(project_xml, metadata_xml, &entries)
        .map(|imported| imported.to_json())
        .map_err(refusal)
}

/// `interchangeReadOtio(text)`: an OpenTimelineIO `Timeline.1` document.
#[wasm_bindgen(js_name = interchangeReadOtio)]
pub fn interchange_read_otio(text: &str) -> Result<String, JsError> {
    otio::read(text)
        .map(|imported| imported.to_json())
        .map_err(refusal)
}

/// `interchangeReadFcpxml(text)`: a Final Cut Pro XML document (a `.fcpxmld`
/// bundle's `Info.fcpxml`).
#[wasm_bindgen(js_name = interchangeReadFcpxml)]
pub fn interchange_read_fcpxml(text: &str) -> Result<String, JsError> {
    fcpxml::read(text)
        .map(|imported| imported.to_json())
        .map_err(refusal)
}
