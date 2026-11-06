//! The sources directory one build reads, kept by `fetch.rs` between monthly runs (and shipped as a small real
//! sample under `fixtures/sources/`):
//!
//! ```text
//! bdpm/CIS_bdpm.txt … CIS_CIP_Dispo_Spec.txt   the seven BDPM files
//! thesaurus/thesaurus.pdf                       the ANSM thesaurus
//! complalim/declarations.csv                    Compl'Alim
//! rcp/<CIS>.html                                one SmPC page per medicine
//! sources.json                                  the day each was retrieved (`SourcesState`)
//! ```

use crate::bdpm::{BdpmFiles, FILE_NAMES};
use crate::bundle::Inputs;
use crate::pdf_layout::pdf_runs;
use crate::text::decode_source;
use std::collections::BTreeMap;
use std::path::Path;

pub const BDPM_DIR: &str = "bdpm";
pub const THESAURUS_FILE: &str = "thesaurus/thesaurus.pdf";
pub const COMPLALIM_FILE: &str = "complalim/declarations.csv";
pub const RCP_DIR: &str = "rcp";
pub const STATE_FILE: &str = "sources.json";

/// When each source was retrieved: the build cites these days, and the fetcher refreshes by them.
#[derive(Debug, Clone, Default, PartialEq, serde::Serialize, serde::Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SourcesState {
    pub bdpm: Option<String>,
    pub thesaurus: Option<String>,
    pub complalim: Option<String>,
    /// The Compl'Alim dataset's own date (data.gouv.fr `last_modified`).
    pub complalim_version: Option<String>,
    /// CIS → the day its SmPC page was retrieved.
    pub rcp: BTreeMap<String, String>,
}

pub fn read_state(root: &Path) -> Result<SourcesState, String> {
    let path = root.join(STATE_FILE);
    if !path.exists() {
        return Ok(SourcesState::default());
    }
    serde_json::from_slice(&read(&path)?).map_err(|error| format!("{}: {error}", path.display()))
}

pub fn write_state(root: &Path, state: &SourcesState) -> Result<(), String> {
    let bytes =
        serde_json::to_vec_pretty(state).map_err(|error| format!("{STATE_FILE}: {error}"))?;
    let path = root.join(STATE_FILE);
    std::fs::write(&path, bytes).map_err(|error| format!("{}: {error}", path.display()))
}

fn day(what: &str, value: &Option<String>) -> Result<String, String> {
    value
        .clone()
        .ok_or_else(|| format!("{STATE_FILE}: {what} was never retrieved"))
}

fn read(path: &Path) -> Result<Vec<u8>, String> {
    std::fs::read(path).map_err(|error| format!("{}: {error}", path.display()))
}

/// The seven BDPM files of a sources directory, decoded.
pub fn read_bdpm(root: &Path) -> Result<BdpmFiles, String> {
    let bdpm_dir = root.join(BDPM_DIR);
    let mut texts = Vec::new();
    for name in FILE_NAMES {
        texts.push(decode_source(name, &read(&bdpm_dir.join(name))?)?);
    }
    let [
        specialities,
        presentations,
        compositions,
        generics,
        conditions,
        important,
        availability,
    ]: [String; 7] = texts
        .try_into()
        .map_err(|_| "bdpm: seven files expected".to_string())?;
    Ok(BdpmFiles {
        specialities,
        presentations,
        compositions,
        generics,
        conditions,
        important,
        availability,
    })
}

/// The inputs of a build from a sources directory.
pub fn read_inputs(root: &Path, built_on: &str) -> Result<Inputs, String> {
    let thesaurus = root.join(THESAURUS_FILE);
    let complalim = root.join(COMPLALIM_FILE);
    let state = read_state(root)?;
    let mut rcp_pages = BTreeMap::new();
    for (cis, retrieved) in &state.rcp {
        let path = root.join(RCP_DIR).join(format!("{cis}.html"));
        let html = String::from_utf8(read(&path)?)
            .map_err(|_| format!("{}: not UTF-8", path.display()))?;
        rcp_pages.insert(cis.clone(), (html, retrieved.clone()));
    }
    Ok(Inputs {
        bdpm: read_bdpm(root)?,
        bdpm_retrieved: day("bdpm", &state.bdpm)?,
        thesaurus_runs: pdf_runs(&read(&thesaurus)?)?,
        thesaurus_retrieved: day("thesaurus", &state.thesaurus)?,
        rcp_pages,
        complalim_csv: String::from_utf8(read(&complalim)?)
            .map_err(|_| format!("{COMPLALIM_FILE} is not UTF-8"))?,
        complalim_version: day("complalim_version", &state.complalim_version)?,
        complalim_retrieved: day("complalim", &state.complalim)?,
        built_on: built_on.to_string(),
    })
}
