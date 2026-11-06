// The fixture sample shared by the tests: `fixtures/sources` (cut from the November 2026 sources by
// `atome-health-ref fixture`), its bundle as built, and lookups into its parts.
// Each test binary uses part of it.
#![allow(dead_code)]

use atome_health_ref::bundle::{self, Bundle, Inputs};
use atome_health_ref::model::*;
use atome_health_ref::sources;
use std::io::Read;
use std::path::PathBuf;
use std::sync::OnceLock;

pub fn crate_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
}

pub fn fixture_sources() -> PathBuf {
    crate_dir().join("fixtures/sources")
}

pub fn fixture_bundle() -> PathBuf {
    crate_dir().join("fixtures/bundle")
}

/// The day the checked-in fixture bundle was built on: the sample is read as of that day.
pub fn built_on() -> String {
    let dir = fixture_bundle();
    let version = std::fs::read_to_string(dir.join("current")).expect("fixtures/bundle/current");
    let manifest: Manifest = serde_json::from_slice(
        &std::fs::read(dir.join(version.trim()).join("manifest.json")).expect("fixture manifest"),
    )
    .expect("fixture manifest parses");
    manifest.built_on
}

pub fn inputs() -> &'static Inputs {
    static INPUTS: OnceLock<Inputs> = OnceLock::new();
    INPUTS.get_or_init(|| {
        sources::read_inputs(&fixture_sources(), &built_on()).expect("fixture sources read")
    })
}

pub fn built() -> &'static Bundle {
    static BUILT: OnceLock<Bundle> = OnceLock::new();
    BUILT.get_or_init(|| bundle::build(inputs()).expect("fixture bundle builds"))
}

pub fn inflate(bytes: &[u8]) -> Vec<u8> {
    let mut json = Vec::new();
    flate2::read::GzDecoder::new(bytes)
        .read_to_end(&mut json)
        .expect("part inflates");
    json
}

pub fn part<T: serde::de::DeserializeOwned>(name: PartName) -> T {
    let (_, bytes) = built()
        .parts
        .iter()
        .find(|(part, _)| *part == name)
        .expect("part built");
    serde_json::from_slice(&inflate(bytes)).expect("part parses as its record")
}

pub fn medicines() -> &'static MedicinesPart {
    static PART: OnceLock<MedicinesPart> = OnceLock::new();
    PART.get_or_init(|| part(PartName::Medicines))
}

pub fn interactions() -> &'static InteractionsPart {
    static PART: OnceLock<InteractionsPart> = OnceLock::new();
    PART.get_or_init(|| part(PartName::Interactions))
}

pub fn rcp_part() -> &'static RcpPart {
    static PART: OnceLock<RcpPart> = OnceLock::new();
    PART.get_or_init(|| part(PartName::Rcp))
}

pub fn rule<'a>(a: &str, b: &str) -> &'a InteractionRule {
    interactions()
        .rules
        .iter()
        .find(|rule| (rule.a == a && rule.b == b) || (rule.a == b && rule.b == a))
        .unwrap_or_else(|| panic!("no thesaurus rule {a} × {b}"))
}
