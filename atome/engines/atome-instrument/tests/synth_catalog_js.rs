// The JS kernel's synth table is generated from the patch's own kinds
// (synth/patch.rs), so the rack UI and its compiler never describe a brick,
// a parameter or an input differently from the engine (AGENTS.md rule 7).
// `ATOME_SYNTH_WRITE_CATALOG=1 cargo test -p atome-instrument --test synth_catalog_js` rewrites it.

use atome_dsp::{ParamSpec, Unit};
use atome_instrument::sampler::PARAMS;
use atome_instrument::synth::SYNTH_PARAMS;
use atome_instrument::synth::patch::{INPUT_KEYS, KINDS, MAX_BRICKS, MAX_ROUTES};
use std::path::PathBuf;

fn unit(unit: Unit) -> (&'static str, &'static str) {
    match unit {
        Unit::Decibels => ("db", "linear"),
        Unit::Hertz => ("hz", "log"),
        Unit::Milliseconds => ("ms", "log"),
        Unit::Seconds => ("seconds", "log"),
        Unit::Percent => ("percent", "linear"),
        Unit::Ratio => ("ratio", "log"),
        Unit::Pan => ("pan", "linear"),
        Unit::Plain => ("number", "linear"),
        Unit::Choice => ("choice", "step"),
        Unit::Semitones => ("semitones", "linear"),
        Unit::Degrees => ("degrees", "linear"),
        Unit::Count => ("count", "linear"),
    }
}

// 1/√2 (the Butterworth Q) is written by its name, never as an approximation.
fn number(value: f32) -> String {
    if value == std::f32::consts::FRAC_1_SQRT_2 {
        return "Math.SQRT1_2".into();
    }
    let text = format!("{value}");
    text.strip_suffix(".0").map(str::to_string).unwrap_or(text)
}

fn quoted(keys: impl Iterator<Item = &'static str>) -> String {
    keys.map(|key| format!("'{key}'"))
        .collect::<Vec<_>>()
        .join(", ")
}

fn param(spec: &ParamSpec) -> String {
    let (unit, scale) = unit(spec.unit);
    let choices = match spec.unit {
        Unit::Choice => format!(
            ", choices: Object.freeze([{}])",
            quoted(spec.choices.iter().copied())
        ),
        _ => String::new(),
    };
    format!(
        "Object.freeze({{ key: '{}', min: {}, max: {}, default: {}, unit: '{unit}', scale: '{scale}'{choices} }})",
        spec.key,
        number(spec.min),
        number(spec.max),
        number(spec.default)
    )
}

fn render() -> String {
    let mut out = String::from(
        "// Generated from atome/engines/atome-instrument (synth/patch.rs) by its `synth_catalog_js` test:\n\
         // never edit by hand. `ATOME_SYNTH_WRITE_CATALOG=1 cargo test -p atome-instrument --test synth_catalog_js` rewrites it.\n\n",
    );
    out.push_str(&format!(
        "export const SYNTH_LIMITS = Object.freeze({{ bricks: {MAX_BRICKS}, routes: {MAX_ROUTES} }});\n"
    ));
    out.push_str(&format!(
        "export const SYNTH_INPUTS = Object.freeze([{}]);\n",
        quoted(INPUT_KEYS.iter().map(|(_, key)| *key))
    ));
    out.push_str("export const SYNTH_BRICKS = Object.freeze({\n");
    let bricks: Vec<String> = KINDS
        .iter()
        .map(|(kind, key)| {
            let params: Vec<String> = kind
                .params()
                .iter()
                .filter(|spec| kind.patchable(spec.id))
                .map(|spec| format!("        {}", param(spec)))
                .collect();
            let params = match params.is_empty() {
                true => "Object.freeze([])".to_string(),
                false => format!("Object.freeze([\n{}\n    ])", params.join(",\n")),
            };
            format!(
                "    {key}: Object.freeze({{ sounds: {}, inputs: Object.freeze([{}]), params: {params} }})",
                kind.sounds(),
                quoted(kind.inputs().iter().map(|input| {
                    INPUT_KEYS
                        .iter()
                        .find(|(candidate, _)| candidate == input)
                        .map(|(_, key)| *key)
                        .expect("every input has a key")
                }))
            )
        })
        .collect();
    out.push_str(&bricks.join(",\n"));
    out.push_str("\n});\n");
    out.push_str(
        "// The instrument parameters a synth plays (the rest belong to the sampler's voice).\n",
    );
    out.push_str("export const SYNTH_INSTRUMENT_PARAMS = Object.freeze([\n");
    let instrument: Vec<String> = SYNTH_PARAMS
        .iter()
        .map(|id| format!("    {}", param(&PARAMS[*id as usize])))
        .collect();
    out.push_str(&instrument.join(",\n"));
    out.push_str("\n]);\n");
    out
}

#[test]
fn the_js_synth_catalog_matches_the_patch() {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../../eVe/intuition/tools/molecule/kernel/synth_catalog.js");
    let rendered = render();
    if std::env::var("ATOME_SYNTH_WRITE_CATALOG").is_ok() {
        std::fs::write(&path, &rendered).unwrap();
    }
    let current = std::fs::read_to_string(&path).unwrap_or_default();
    assert!(
        current == rendered,
        "{} is stale: run ATOME_SYNTH_WRITE_CATALOG=1 cargo test -p atome-instrument --test synth_catalog_js",
        path.display()
    );
}
