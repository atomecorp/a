// An instrument is a sampler (zones of samples) or a synth (a patch of bricks
// run once per voice, atome-instrument synth/). Both play the same notes
// through the same slot (instrument.rs); `Engine` is what the slot holds.
//
// A synth's description: `{ "id", "params": { gain_db, tune_cents, polyphony,
// bend_range }, "synth": { "bricks": [{ "id", "kind", "params" }], "routes":
// [{ "from", "to", "input", "depth" }], "output" } }`, no zones, one output.

use crate::graph::MAX_BLOCK;
use crate::instrument_notes::MarkerInfo;
use crate::instrument_spec::{InstrumentSpec, build_sampler, param_values};
use atome_dsp::Processor;
use atome_instrument::sampler::{PARAMS, POLYPHONY};
use atome_instrument::synth::{BrickDesc, Patch, RouteDesc, SYNTH_PARAMS};
use atome_instrument::{ActionQueue, NoteEvent, SampleData, Sampler, Synth};
use serde::Deserialize;
use std::collections::HashMap;
use std::sync::Arc;

// Voices beyond the polyphony that may still fade out (stolen, released).
const FADING_VOICES: usize = 8;

#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SynthSpec {
    pub bricks: Vec<SynthBrickSpec>,
    #[serde(default)]
    pub routes: Vec<SynthRouteSpec>,
    pub output: String,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SynthBrickSpec {
    pub id: String,
    pub kind: String,
    #[serde(default)]
    pub params: HashMap<String, f32>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SynthRouteSpec {
    pub from: String,
    pub to: String,
    pub input: String,
    pub depth: f32,
}

pub enum Engine {
    Sampler(Box<Sampler>),
    Synth(Box<Synth>),
}

impl Engine {
    pub fn schedule(&mut self, event: NoteEvent) {
        match self {
            Self::Sampler(sampler) => sampler.schedule(event),
            Self::Synth(synth) => synth.schedule(event),
        }
    }

    pub fn set_param(&mut self, id: u32, value: f32) {
        match self {
            Self::Sampler(sampler) => sampler.set_param(id, value),
            Self::Synth(synth) => synth.set_param(id, value),
        }
    }

    pub fn process_outputs(&mut self, left: &mut [f32], right: &mut [f32], frames: usize) {
        match self {
            Self::Sampler(sampler) => sampler.process_outputs(left, right, frames),
            Self::Synth(synth) => synth.process_outputs(left, right, frames),
        }
    }

    // Command markers belong to sample zones: a synth has none to report.
    pub fn report_actions(&mut self, queue: Arc<ActionQueue>, generation: u16) {
        if let Self::Sampler(sampler) = self {
            sampler.report_actions(queue, generation);
        }
    }
}

// Whether `name` is an instrument parameter the instrument plays.
pub fn plays_param(spec: &InstrumentSpec, name: &str) -> bool {
    spec.synth.is_none()
        || SYNTH_PARAMS
            .iter()
            .any(|id| PARAMS[*id as usize].key == name)
}

pub type BuiltEngine = (Engine, [f32; PARAMS.len()], Vec<MarkerInfo>);

pub fn build_engine(
    spec: &InstrumentSpec,
    samples: &HashMap<String, SampleData>,
    sample_rate: u32,
) -> Result<BuiltEngine, String> {
    let Some(synth) = &spec.synth else {
        let (sampler, values, infos) = build_sampler(spec, samples, sample_rate)?;
        return Ok((Engine::Sampler(Box::new(sampler)), values, infos));
    };
    if !spec.zones.is_empty() || spec.keyswitch.is_some() || spec.outputs != 1 {
        return Err(format!(
            "instrument {}: a synth has one output and no zones or keyswitch",
            spec.id
        ));
    }
    if let Some(name) = spec.params.keys().find(|name| !plays_param(spec, name)) {
        return Err(format!(
            "instrument {}: {name} belongs to the sampler; a synth's voice is its patch",
            spec.id
        ));
    }
    let bricks: Vec<BrickDesc> = synth
        .bricks
        .iter()
        .map(|brick| BrickDesc {
            id: brick.id.clone(),
            kind: brick.kind.clone(),
            params: brick
                .params
                .iter()
                .map(|(key, value)| (key.clone(), *value))
                .collect(),
        })
        .collect();
    let routes: Vec<RouteDesc> = synth
        .routes
        .iter()
        .map(|route| RouteDesc {
            from: route.from.clone(),
            to: route.to.clone(),
            input: route.input.clone(),
            depth: route.depth,
        })
        .collect();
    let patch = Patch::new(&bricks, &routes, &synth.output)
        .map_err(|error| format!("instrument {}: {error}", spec.id))?;
    let values = param_values(spec)?;
    let voices = values[POLYPHONY as usize] as usize + FADING_VOICES;
    let mut synth = Synth::new(patch, voices, sample_rate as f32);
    synth.prepare(sample_rate as f32, MAX_BLOCK);
    for (id, value) in values.iter().enumerate() {
        synth.set_param(id as u32, *value);
    }
    synth.reset();
    Ok((Engine::Synth(Box::new(synth)), values, Vec::new()))
}
