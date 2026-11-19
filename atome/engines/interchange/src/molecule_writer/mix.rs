//! A track's audio strip (`mix_schema.js` `defaultMixStrip`: REC, volume, pan),
//! its catalogue effects and its auxiliaries, written as the kernel validates them.
//! The effects' parameter table is the atome-dsp catalogue itself.

use super::spec::DspSpec;
use crate::ImportError;
use atome_dsp::catalog::ModuleKind;
use serde_json::{Map, Value, json};

/// The kernel's level range (`MIX_SILENCE_DB`, `MIX_MAX_GAIN_DB`).
pub const MIX_SILENCE_DB: f64 = -120.0;
/// The kernel's highest level.
pub const MIX_MAX_GAIN_DB: f64 = 12.0;

#[derive(Clone, Debug, Default)]
pub(crate) struct Strip {
    pub gain_db: f64,
    pub pan: f64,
    pub dsp: Vec<Value>,
    // (bus track id, share sent, share passed on)
    pub auxes: Vec<(String, f64, f64)>,
}

impl Strip {
    pub fn is_default(&self) -> bool {
        self.gain_db == 0.0 && self.pan == 0.0 && self.dsp.is_empty() && self.auxes.is_empty()
    }
}

// An f32 of the catalogue as the decimal the JS catalogue writes (0.707, not 0.70700001…):
// the shortest text of an f32 always reads back as a number.
fn decimal(value: f32) -> f64 {
    format!("{value}")
        .parse::<f64>()
        .expect("an f32's shortest text is a number")
}

fn whole_or_decimal(value: f64) -> Value {
    if value.fract() == 0.0 && value.abs() < 9.0e15 {
        json!(value as i64)
    } else {
        json!(value)
    }
}

/// One catalogue effect as a `dsp` module: every parameter present, each within its range.
pub(crate) fn dsp_module(module_id: &str, spec: &DspSpec) -> Result<Value, ImportError> {
    let kind = ModuleKind::from_key(&spec.effect).map_err(|_| {
        ImportError::new(
            "mix_effect_unknown",
            format!("no catalogue effect {}", spec.effect),
        )
    })?;
    let table = kind.params();
    for (key, value) in &spec.params {
        if !table.iter().any(|param| param.key == key) {
            return Err(ImportError::new(
                "mix_param_unknown",
                format!("{} has no parameter {key}", spec.effect),
            ));
        }
        if !value.is_finite() {
            return Err(ImportError::new(
                "mix_param_invalid",
                format!("{}.{key} is not a finite number", spec.effect),
            ));
        }
    }
    let mut params = Map::new();
    for param in table {
        let (min, max) = (decimal(param.min), decimal(param.max));
        let given = spec
            .params
            .iter()
            .find(|(key, _)| key == param.key)
            .map(|(_, value)| *value);
        let value = given.map_or(decimal(param.default), |value| value.clamp(min, max));
        let value = if param.choices.is_empty() {
            value
        } else {
            value.round().clamp(min, max)
        };
        params.insert(param.key.to_string(), whole_or_decimal(value));
    }
    if matches!(kind, ModuleKind::Amp | ModuleKind::Convolution) {
        params.insert("asset_id".into(), Value::Null);
    }
    let mut module = json!({
        "module_id": module_id, "type": "dsp", "bypass": spec.bypass, "effect": spec.effect, "params": params
    });
    if kind.outputs() > 1 {
        module["outputs"] = json!([]);
    }
    if kind.takes_key() {
        module["key"] = Value::Null;
    }
    Ok(module)
}

/// The strip's JSON (`mix.strips[<track>:audio]`).
pub(crate) fn strip_value(strip_id: &str, strip: &Strip) -> Value {
    let mut chain = vec![
        json!({ "module_id": format!("{strip_id}:record"), "type": "record", "bypass": false, "params": {} }),
        json!({ "module_id": format!("{strip_id}:volume"), "type": "volume", "bypass": false,
            "params": { "gain_db": strip.gain_db } }),
        json!({ "module_id": format!("{strip_id}:pan"), "type": "pan", "bypass": false, "params": { "pan": strip.pan } }),
    ];
    chain.extend(strip.dsp.iter().cloned());
    for (rank, (bus, send, pass)) in strip.auxes.iter().enumerate() {
        let module_id = if rank == 0 {
            format!("{strip_id}:aux")
        } else {
            format!("{strip_id}:aux_{}", rank + 1)
        };
        chain.push(json!({
            "module_id": module_id, "type": "aux", "bypass": false, "params": { "send": send, "pass": pass },
            "destination": { "kind": "bus", "id": bus }, "face": "send"
        }));
    }
    json!({ "chain": chain, "output": { "destination": { "kind": "main" }, "enabled": true }, "input": { "kind": "track" } })
}

/// A linear gain as the kernel's dB (`linearToGainDb`).
pub fn linear_to_gain_db(linear: f64) -> f64 {
    if !linear.is_finite() || linear <= 0.0 {
        return MIX_SILENCE_DB;
    }
    (20.0 * linear.log10()).clamp(MIX_SILENCE_DB, MIX_MAX_GAIN_DB)
}
