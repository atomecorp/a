// Mix program: the audio part of the canonical `timeline.mix`, compiled by the
// eVe mix engine (JS) and applied here. Strip/module ids are the canonical ids.

use crate::automation::{AutomationLane, TransportSpec};
use serde::Deserialize;
use std::collections::HashMap;

// `channels` (R-191): the destination channel of each channel of the signal,
// in order; without it the widths must match, or the signal is mono (copied
// to every channel). A wider signal never folds into a narrower one unless
// the map says how.
#[derive(Clone, Debug, Deserialize, PartialEq)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum Target {
    // `mono`: the signal summed to one channel of the pair (0 left, 1 right).
    Main {
        #[serde(default)]
        mono: Option<u8>,
        #[serde(default)]
        channels: Option<Vec<u16>>,
    },
    Strip {
        id: String,
        #[serde(default)]
        channels: Option<Vec<u16>>,
    },
    Device {
        channel: u16,
        #[serde(default)]
        mono: Option<u8>,
        #[serde(default)]
        channels: Option<Vec<u16>>,
    },
    // Physical output channels one by one (0 and 1 the main pair), one per
    // channel of the signal (a mono signal may list several).
    Outputs {
        channels: Vec<u16>,
    },
}

impl Target {
    pub fn channel_map(&self) -> Option<&[u16]> {
        match self {
            Self::Main { channels, .. }
            | Self::Strip { channels, .. }
            | Self::Device { channels, .. } => channels.as_deref(),
            Self::Outputs { channels } => Some(channels),
        }
    }
}

#[derive(Clone, Debug, Deserialize, PartialEq)]
#[serde(tag = "kind", rename_all = "snake_case")]
#[derive(Default)]
pub enum InputSpec {
    #[default]
    Track,
    LiveAudio {
        device_id: String,
    },
    // One of the instrument's outputs (D-S2), 0 unless named.
    Instrument {
        instrument_id: String,
        #[serde(default)]
        output: usize,
    },
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
    LiveAudio {
        device_id: String,
    },
    Strip {
        id: String,
    },
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
    // A modulator's targets (R-191): parameters of any module its control moves.
    #[serde(default)]
    pub modulations: Vec<ModulationRoute>,
    // 2 or 4: the module runs at that multiple of the rate (none: as built).
    #[serde(default)]
    pub oversample: Option<u8>,
}

// One target of a modulator: `depth` × its control is added to the parameter
// in the parameter's unit (a frequency in octaves), then saturated to its range.
#[derive(Clone, Debug, Deserialize, PartialEq)]
pub struct ModulationRoute {
    pub module_id: String,
    pub param: String,
    pub depth: f64,
    #[serde(default)]
    pub output: usize,
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
    // Its width (R-191): 1, 2, 4 or 8 channels; a strip is stereo unless told.
    #[serde(default = "stereo")]
    pub channels: u8,
}

fn enabled() -> bool {
    true
}

fn stereo() -> u8 {
    2
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
