// Mix program: the audio part of the canonical `timeline.mix`, compiled by the
// eVe mix engine (JS) and applied here. Strip/module ids are the canonical ids.

use crate::automation::{AutomationLane, TransportSpec};
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
    // One of the instrument's outputs (D-S2), 0 unless named.
    Instrument {
        instrument_id: String,
        #[serde(default)]
        output: usize,
    },
}

impl Default for InputSpec {
    fn default() -> Self {
        InputSpec::Track
    }
}

// One destination of a module's port; a port may have several.
#[derive(Clone, Debug, Deserialize, PartialEq)]
pub struct PortRoute {
    pub port: usize,
    pub target: Target,
}

// What a keyed module listens to: a strip's post-chain signal, or one port of
// a module (a band of a split).
#[derive(Clone, Debug, Deserialize, PartialEq)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum KeySource {
    Strip { id: String },
    Port { module_id: String, port: usize },
}

// What an IN module (`type: "input"`, D-S3) mixes into its chain at its level:
// a live input, a strip's post-chain signal (a loop closes through a return,
// RETURN_FRAMES later) or one output of an instrument.
#[derive(Clone, Debug, Deserialize, PartialEq)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum MixSource {
    LiveAudio { device_id: String },
    Strip { id: String },
    Instrument {
        instrument_id: String,
        #[serde(default)]
        output: usize,
    },
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
    // Ports sent out of the strip; a port not listed stays in it.
    #[serde(default)]
    pub outputs: Vec<PortRoute>,
    #[serde(default)]
    pub key: Option<KeySource>,
    // What an IN module mixes in.
    #[serde(default)]
    pub source: Option<MixSource>,
    // Curves its parameters follow while the strip's transport plays (automation.rs).
    #[serde(default)]
    pub automation: Vec<AutomationLane>,
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
    // The transport its modules' automation follows (a Molecule's).
    #[serde(default)]
    pub transport: Option<String>,
}

fn enabled() -> bool {
    true
}

#[derive(Clone, Debug, Default, Deserialize, PartialEq)]
pub struct Program {
    #[serde(default)]
    pub strips: Vec<StripSpec>,
    #[serde(default)]
    pub transports: Vec<TransportSpec>,
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
