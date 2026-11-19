// The JS kernel's `dsp` module table is generated from this crate's catalog,
// so the mixer UI and validation can never describe a parameter differently
// from the processor. `ATOME_DSP_WRITE_CATALOG=1 cargo test` rewrites it.

use atome_dsp::catalog::ModuleAsset;
use atome_dsp::catalog::{KINDS, ModuleKind};
use atome_dsp::{ControlRange, Unit};
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

fn render() -> String {
    let mut out = String::from(
        "// Generated from atome/engines/atome-dsp (catalog.rs) by its `catalog_js` test:\n\
         // never edit by hand. `ATOME_DSP_WRITE_CATALOG=1 cargo test` rewrites it.\n\n\
         const number = (min, max, value, unit, scale) => Object.freeze({ type: 'number', min, max, default: value, unit, scale });\n\
         const asset = (kind) => Object.freeze({ type: 'asset_ref', asset: kind, default: null });\n\
         const choice = (choices, value) => Object.freeze({ type: 'choice', choices: Object.freeze(choices), min: 0, max: choices.length - 1, default: value });\n\n\
         export const MIX_DSP_EFFECTS = Object.freeze({\n",
    );
    for kind in KINDS
        .iter()
        .filter(|kind| !kind.is_generator() && **kind != ModuleKind::Envelope)
    {
        out.push_str(&format!("    {}: Object.freeze({{\n", kind.key()));
        let mut lines: Vec<String> = kind
            .params()
            .iter()
            .map(|param| {
                if param.unit == Unit::Choice {
                    let keys: Vec<String> =
                        param.choices.iter().map(|key| format!("'{key}'")).collect();
                    return format!(
                        "        {}: choice([{}], {})",
                        param.key,
                        keys.join(", "),
                        number(param.default)
                    );
                }
                let (unit, scale) = unit(param.unit);
                format!(
                    "        {}: number({}, {}, {}, '{unit}', '{scale}')",
                    param.key,
                    number(param.min),
                    number(param.max),
                    number(param.default)
                )
            })
            .collect();
        match kind {
            ModuleKind::Amp => lines.push("        asset_id: asset('amp_capture')".to_string()),
            ModuleKind::Convolution => lines.push("        asset_id: asset('impulse')".to_string()),
            _ => {}
        }
        if lines.is_empty() {
            out.truncate(out.len() - 1);
            out.push_str("}),\n");
            continue;
        }
        out.push_str(&lines.join(",\n"));
        out.push_str("\n    }),\n");
    }
    out.truncate(out.len() - 2);
    out.push_str("\n});\n\n");
    // Ports and keys: only the kinds that differ from one output and no key.
    out.push_str("// Signals a module writes (port 0 continues the chain) and whether a sidechain key drives it.\n");
    out.push_str("export const MIX_DSP_PORTS = Object.freeze({\n");
    let shapes: Vec<String> = KINDS
        .iter()
        .filter(|kind| kind.outputs() > 1 || kind.takes_key())
        .map(|kind| {
            format!(
                "    {}: Object.freeze({{ outputs: {}, key: {} }})",
                kind.key(),
                kind.outputs(),
                kind.takes_key()
            )
        })
        .collect();
    out.push_str(&shapes.join(",\n"));
    out.push_str("\n});\n");
    // Live measurements: only the kinds that publish some (Processor::readings).
    out.push_str("\n// Live measurements a module publishes, in order (audio mix_readings / direct_readings).\n");
    out.push_str("export const MIX_DSP_READINGS = Object.freeze({\n");
    let readings: Vec<String> = KINDS
        .iter()
        .filter(|kind| !kind.readings().is_empty())
        .map(|kind| {
            let keys: Vec<String> = kind
                .readings()
                .iter()
                .map(|key| format!("'{key}'"))
                .collect();
            format!("    {}: Object.freeze([{}])", kind.key(), keys.join(", "))
        })
        .collect();
    out.push_str(&readings.join(",\n"));
    out.push_str("\n});\n");
    // Modulation (R-191): what a modulator writes, and the parameters taking a value per frame.
    out.push_str("\n// Control signals a modulator writes (their range) and the parameters that follow a value per frame.\n");
    out.push_str("export const MIX_DSP_CONTROL = Object.freeze({\n");
    let controls: Vec<String> = KINDS
        .iter()
        .filter(|kind| !kind.is_generator() && !matches!(kind, ModuleKind::Amp | ModuleKind::Convolution))
        .filter_map(|kind| {
            let processor = kind.build(ModuleAsset::None).ok()?;
            let rated: Vec<String> = kind
                .params()
                .iter()
                .filter(|param| processor.audio_rate(param.id))
                .map(|param| format!("'{}'", param.key))
                .collect();
            let range = match kind.control_range() {
                Some(ControlRange::Bipolar) => "'bipolar'",
                Some(ControlRange::Unipolar) => "'unipolar'",
                None => "null",
            };
            (kind.control_outputs() > 0 || !rated.is_empty()).then(|| {
                format!(
                    "    {}: Object.freeze({{ outputs: {}, range: {range}, audio_rate: Object.freeze([{}]) }})",
                    kind.key(),
                    kind.control_outputs(),
                    rated.join(", ")
                )
            })
        })
        .collect();
    out.push_str(&controls.join(",\n"));
    out.push_str("\n});\n");
    out
}

#[test]
fn the_js_catalog_matches_the_processors() {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../../eVe/intuition/tools/molecule/kernel/mix_dsp_catalog.js");
    let rendered = render();
    if std::env::var("ATOME_DSP_WRITE_CATALOG").is_ok() {
        std::fs::write(&path, &rendered).unwrap();
    }
    let current = std::fs::read_to_string(&path).unwrap_or_default();
    assert!(
        current == rendered,
        "{} is stale: run ATOME_DSP_WRITE_CATALOG=1 cargo test",
        path.display()
    );
}
