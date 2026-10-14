// Mix program: the audio part of the canonical `timeline.mix`, compiled by the
// eVe mix engine (JS) and applied here. Strip/module ids are the canonical ids.

use serde::Deserialize;
use std::collections::HashMap;

#[derive(Clone, Debug, Deserialize, PartialEq)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum Target {
    Main,
    Strip { id: String },
    Device { channel: u16 },
}

#[derive(Clone, Debug, Deserialize, PartialEq)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum InputSpec {
    Track,
    LiveAudio { device_id: String },
}

impl Default for InputSpec {
    fn default() -> Self {
        InputSpec::Track
    }
}

#[derive(Clone, Debug, Deserialize, PartialEq)]
pub struct ModuleSpec {
    pub id: String,
    #[serde(rename = "type")]
    pub kind: String,
    #[serde(default)]
    pub effect: Option<String>,
    #[serde(default)]
    pub bypass: bool,
    #[serde(default)]
    pub params: HashMap<String, serde_json_value::Value>,
    #[serde(default)]
    pub target: Option<Target>,
}

#[derive(Clone, Debug, Deserialize, PartialEq)]
pub struct StripSpec {
    pub id: String,
    #[serde(default)]
    pub input: InputSpec,
    #[serde(default)]
    pub chain: Vec<ModuleSpec>,
    #[serde(default)]
    pub output: Option<Target>,
    #[serde(default = "enabled")]
    pub output_enabled: bool,
    // Track-level mute/solo resolved by the compiler (live, sample-accurate).
    #[serde(default)]
    pub muted: bool,
}

fn enabled() -> bool {
    true
}

#[derive(Clone, Debug, Default, Deserialize, PartialEq)]
pub struct Program {
    #[serde(default)]
    pub strips: Vec<StripSpec>,
}

impl ModuleSpec {
    pub fn number(&self, name: &str, default: f64) -> f64 {
        match self.params.get(name) {
            Some(serde_json_value::Value::Number(value)) => *value,
            _ => default,
        }
    }

    pub fn text(&self, name: &str) -> Option<&str> {
        match self.params.get(name) {
            Some(serde_json_value::Value::Text(value)) => Some(value.as_str()),
            _ => None,
        }
    }
}

// Minimal JSON scalar so the crate needs no JSON dependency at runtime.
pub mod serde_json_value {
    use serde::Deserialize;

    #[derive(Clone, Debug, Deserialize, PartialEq)]
    #[serde(untagged)]
    pub enum Value {
        Number(f64),
        Text(String),
        Flag(bool),
        Null,
    }
}
