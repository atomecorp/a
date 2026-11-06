// The bundle of the fixture sample and the JS contract the app reads it with.
// `ATOME_HEALTH_REF_WRITE_CONTRACT=1` rewrites atome/src/shared/health_reference_contract.js;
// `ATOME_HEALTH_REF_WRITE_FIXTURE=1` rewrites fixtures/bundle from fixtures/sources.

mod support;

use atome_health_ref::bundle;
use atome_health_ref::contract;
use atome_health_ref::model::*;
use serde_json::Value;
use std::collections::BTreeMap;
use support::*;

// ---- The contract ----

#[test]
fn contract_js_is_rendered_from_the_records() {
    let path = crate_dir().join("../../..").join(contract::JS_PATH);
    let rendered = contract::render_js();
    if std::env::var_os("ATOME_HEALTH_REF_WRITE_CONTRACT").is_some() {
        std::fs::write(&path, &rendered).expect("contract written");
    }
    let current = std::fs::read_to_string(&path).expect("contract file present");
    assert_eq!(
        current,
        rendered,
        "{} is stale: ATOME_HEALTH_REF_WRITE_CONTRACT=1 cargo test -p atome-health-ref",
        contract::JS_PATH
    );
}

/// The value checked as the contract type `js`, the way the generated JS validator does it.
fn conforms(
    js: &str,
    value: &Value,
    records: &BTreeMap<&str, Vec<(&str, String)>>,
    choices: &BTreeMap<&str, &[&str]>,
    path: &str,
) {
    if let Some(inner) = js.strip_prefix('?') {
        if !value.is_null() {
            conforms(inner, value, records, choices, path);
        }
        return;
    }
    if let Some(inner) = js.strip_suffix("[]") {
        let items = value
            .as_array()
            .unwrap_or_else(|| panic!("{path}: array expected"));
        for (index, item) in items.iter().enumerate() {
            conforms(inner, item, records, choices, &format!("{path}[{index}]"));
        }
        return;
    }
    match js {
        "string" => assert!(value.is_string(), "{path}: string expected"),
        "boolean" => assert!(value.is_boolean(), "{path}: boolean expected"),
        "integer" => assert!(value.is_u64(), "{path}: integer expected"),
        "number" => assert!(value.is_number(), "{path}: number expected"),
        _ if choices.contains_key(js) => {
            assert!(
                choices[js].contains(&value.as_str().unwrap_or_default()),
                "{path}: '{value}' is not a {js}"
            )
        }
        _ => {
            let fields = records
                .get(js)
                .unwrap_or_else(|| panic!("{path}: unknown type {js}"));
            let object = value
                .as_object()
                .unwrap_or_else(|| panic!("{path}: record expected"));
            let keys: Vec<&str> = object.keys().map(String::as_str).collect();
            let declared: Vec<&str> = fields.iter().map(|(field, _)| *field).collect();
            let (mut sorted_keys, mut sorted_declared) = (keys.clone(), declared.clone());
            sorted_keys.sort_unstable();
            sorted_declared.sort_unstable();
            assert_eq!(
                sorted_keys, sorted_declared,
                "{path}: keys differ from the declared fields of {js}"
            );
            for (field, field_js) in fields {
                conforms(
                    field_js,
                    &object[*field],
                    records,
                    choices,
                    &format!("{path}.{field}"),
                );
            }
        }
    }
}

#[test]
fn every_part_and_the_manifest_serialize_exactly_their_declared_fields() {
    let records: BTreeMap<_, _> = contract::records().into_iter().collect();
    let choices: BTreeMap<_, _> = contract::choices().into_iter().collect();
    let manifest = serde_json::to_value(&built().manifest).expect("manifest serializes");
    conforms("manifest", &manifest, &records, &choices, "manifest");
    for (name, bytes) in &built().parts {
        let value: Value = serde_json::from_slice(&inflate(bytes)).expect("part is JSON");
        conforms(
            contract::part_record(*name),
            &value,
            &records,
            &choices,
            name.as_str(),
        );
    }
}

// ---- The bundle ----

#[test]
fn the_checked_in_fixture_bundle_is_the_build_of_the_fixture_sources() {
    let dir = fixture_bundle();
    if std::env::var_os("ATOME_HEALTH_REF_WRITE_FIXTURE").is_some() {
        std::fs::remove_dir_all(&dir).expect("old fixture bundle removed");
        bundle::write(built(), &dir).expect("fixture bundle written");
    }
    let version = std::fs::read_to_string(dir.join("current")).expect("current");
    assert_eq!(
        version,
        built().manifest.version,
        "fixtures/bundle is stale: ATOME_HEALTH_REF_WRITE_FIXTURE=1"
    );
    for entry in &built().manifest.parts {
        let bytes = std::fs::read(dir.join(&version).join(&entry.file)).expect("part file");
        assert_eq!(bytes.len() as u64, entry.bytes, "{}", entry.file);
        let json = inflate(&bytes);
        assert_eq!(json.len() as u64, entry.json_bytes, "{}", entry.file);
        assert_eq!(
            atome_health_ref::text::sha256_hex(&json),
            entry.sha256,
            "{}",
            entry.file
        );
    }
}

#[test]
fn the_same_sources_give_the_same_version_and_bytes() {
    let again = bundle::build(inputs()).expect("second build");
    assert_eq!(again.manifest, built().manifest);
    assert_eq!(again.parts, built().parts);
    assert_eq!(built().manifest.version.len(), 16);
    let names: Vec<PartName> = built()
        .manifest
        .parts
        .iter()
        .map(|entry| entry.name)
        .collect();
    assert_eq!(names, PartName::ALL);
    let sources: Vec<&str> = built()
        .manifest
        .sources
        .iter()
        .map(|source| source.id.as_str())
        .collect();
    for id in [
        bundle::BDPM_SOURCE,
        bundle::THESAURUS_SOURCE,
        bundle::RCP_SOURCE,
        bundle::COMPLALIM_SOURCE,
    ] {
        assert!(sources.contains(&id), "source {id} cited");
    }
}
