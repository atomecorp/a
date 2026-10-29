// The JS kernel's `dsp` module table is generated from this crate's catalog,
// so the mixer UI and validation can never describe a parameter differently
// from the processor. `ATOME_DSP_WRITE_CATALOG=1 cargo test` rewrites it.

use atome_dsp::catalog::{ModuleKind, KINDS};
use atome_dsp::Unit;
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
    }
}

fn number(value: f32) -> String {
    let text = format!("{value}");
    text.strip_suffix(".0").map(str::to_string).unwrap_or(text)
}

fn render() -> String {
    let mut out = String::from(
        "// Generated from atome/engines/atome-dsp (catalog.rs) by its `catalog_js` test:\n\
         // never edit by hand. `ATOME_DSP_WRITE_CATALOG=1 cargo test` rewrites it.\n\n\
         const number = (min, max, value, unit, scale) => Object.freeze({ type: 'number', min, max, default: value, unit, scale });\n\
         const asset = (kind) => Object.freeze({ type: 'asset_ref', asset: kind, default: null });\n\n\
         export const MIX_DSP_EFFECTS = Object.freeze({\n",
    );
    for kind in KINDS.iter().filter(|kind| !kind.is_generator() && **kind != ModuleKind::Envelope) {
        out.push_str(&format!("    {}: Object.freeze({{\n", kind.key()));
        let mut lines: Vec<String> = kind
            .params()
            .iter()
            .map(|param| {
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
        .map(|kind| format!("    {}: Object.freeze({{ outputs: {}, key: {} }})", kind.key(), kind.outputs(), kind.takes_key()))
        .collect();
    out.push_str(&shapes.join(",\n"));
    out.push_str("\n});\n");
    out
}

#[test]
fn the_js_catalog_matches_the_processors() {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../../eVe/intuition/tools/molecule/kernel/mix_dsp_catalog.js");
    let rendered = render();
    if std::env::var("ATOME_DSP_WRITE_CATALOG").is_ok() {
        std::fs::write(&path, &rendered).unwrap();
    }
    let current = std::fs::read_to_string(&path).unwrap_or_default();
    assert!(current == rendered, "{} is stale: run ATOME_DSP_WRITE_CATALOG=1 cargo test", path.display());
}
