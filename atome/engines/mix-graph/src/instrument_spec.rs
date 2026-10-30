// The instrument a strip plays, as the eVe kernel normalized it
// (kernel/instrument_schema.js), turned into the sampler of `atome-instrument`
// from the samples loaded under their ids. Built off the audio thread. Its
// markers and composed notes are read by instrument_notes.rs.

use crate::graph::MAX_BLOCK;
use crate::instrument_notes::{composed, ComposedSpec, MarkerBuilder, MarkerInfo, MarkerSpec};
use atome_dsp::Processor;
use atome_instrument::sampler::{PARAMS, POLYPHONY};
use atome_instrument::zone::MAX_OUTPUTS;
use atome_dsp::biquad::Shape;
use atome_instrument::{Draw, Keymap, LoopMode, LoopSpec, Playback, SampleBank, SampleData, Sampler, Segment, Stack, Switches, Zone, ZoneFilter};
use serde::Deserialize;
use std::collections::HashMap;

// Voices beyond the polyphony that may still fade out (stolen, released).
const FADING_VOICES: usize = 8;

#[derive(Clone, Debug, Deserialize)]
pub struct InstrumentSpec {
    pub id: String,
    #[serde(default = "seed")]
    pub seed: u64,
    #[serde(default)]
    pub params: HashMap<String, ParamValue>,
    // Its stereo outputs (D-S2): each zone sounds on one, each strip may play one.
    #[serde(default = "one")]
    pub outputs: usize,
    pub zones: Vec<ZoneSpec>,
    // Keys that choose which switched zones sound (a bank's articulations).
    #[serde(default)]
    pub keyswitch: Option<KeyswitchSpec>,
}

#[derive(Clone, Debug, Deserialize)]
pub struct KeyswitchSpec {
    pub keys: [u8; 2],
    pub default: u8,
}

#[derive(Clone, Debug, Deserialize)]
pub struct FilterSpec {
    pub kind: String,
    pub cutoff_hz: f32,
    pub q: f32,
    pub key_track_cents: f32,
    pub key_center: u8,
    pub velocity_track_cents: f32,
}

fn seed() -> u64 {
    89
}

fn one() -> usize {
    1
}

#[derive(Clone, Debug, Deserialize)]
#[serde(untagged)]
pub enum ParamValue {
    Number(f32),
    Text(String),
}

#[derive(Clone, Debug, Deserialize)]
pub struct ZoneSpec {
    pub id: String,
    pub keys: [u8; 2],
    pub velocities: [u8; 2],
    pub gain_db: f32,
    // Empty when the zone plays a composed note.
    #[serde(default)]
    pub takes: Vec<SegmentSpec>,
    pub stack: StackSpec,
    pub cuts: Vec<String>,
    pub release_takes: Vec<SegmentSpec>,
    pub release_decay_s: f32,
    pub borrow_neighbours: bool,
    #[serde(default)]
    pub composed: Option<ComposedSpec>,
    #[serde(default)]
    pub output: u8,
    #[serde(default)]
    pub one_shot: bool,
    #[serde(default)]
    pub switch: Option<u8>,
    #[serde(default)]
    pub filter: Option<FilterSpec>,
}

#[derive(Clone, Debug, Deserialize)]
pub struct StackSpec {
    pub kind: String,
    #[serde(default)]
    pub draw: Option<String>,
    #[serde(default)]
    pub levels: Vec<f32>,
    #[serde(default)]
    pub crossfade: u8,
}

#[derive(Clone, Debug, Deserialize)]
pub struct SegmentSpec {
    pub sample_id: String,
    pub start: usize,
    pub end: usize,
    pub offset: usize,
    pub velocity_offset: usize,
    pub root: u8,
    pub tune_cents: f32,
    pub gain_db: f32,
    pub pan: f32,
    pub playback: String,
    #[serde(rename = "loop")]
    pub looping: Option<LoopSpecJson>,
    pub stretch: f32,
    #[serde(default)]
    pub markers: Vec<MarkerSpec>,
}

#[derive(Clone, Debug, Deserialize)]
pub struct LoopSpecJson {
    pub start: usize,
    pub end: usize,
    pub mode: String,
    pub ping_pong: bool,
    pub crossfade: usize,
    pub count: u32,
}

// `path` names the segment in its zone for the markers it carries.
fn segment(spec: &SegmentSpec, bank_index: &HashMap<&str, usize>, markers: &mut MarkerBuilder, zone_id: &str, path: &str) -> Result<Segment, String> {
    let sample = *bank_index.get(spec.sample_id.as_str()).ok_or_else(|| format!("instrument sample {} is not loaded", spec.sample_id))?;
    let span = markers.span(&spec.markers, zone_id, path)?;
    let looping = spec.looping.as_ref().map(|looping| LoopSpec {
        start: looping.start, end: looping.end, ping_pong: looping.ping_pong, crossfade: looping.crossfade, count: looping.count,
        mode: if looping.mode == "sustain" { LoopMode::Sustain } else { LoopMode::Continuous },
    });
    Ok(Segment {
        sample, start: spec.start, end: spec.end, offset: spec.offset, velocity_offset: spec.velocity_offset, root: spec.root,
        tune_cents: spec.tune_cents, gain_db: spec.gain_db, pan: spec.pan, looping, stretch: spec.stretch, markers: span,
        playback: if spec.playback == "reverse" { Playback::Reverse } else { Playback::Forward },
    })
}

fn filter(spec: &FilterSpec) -> Result<ZoneFilter, String> {
    let shape = match spec.kind.as_str() {
        "lowpass" => Shape::LowPass,
        "highpass" => Shape::HighPass,
        "bandpass" => Shape::BandPass,
        "notch" => Shape::Notch,
        other => return Err(format!("zone filter {other} is unknown")),
    };
    Ok(ZoneFilter { shape, cutoff_hz: spec.cutoff_hz, q: spec.q, key_track_cents: spec.key_track_cents, key_center: spec.key_center,
        velocity_track_cents: spec.velocity_track_cents })
}

fn stack(spec: &StackSpec) -> Result<Stack, String> {
    match spec.kind.as_str() {
        "alternate" => Ok(Stack::Alternate(match spec.draw.as_deref() {
            Some("random") => Draw::Random,
            Some("random_no_repeat") => Draw::RandomNoRepeat,
            _ => Draw::Cycle,
        })),
        "mix" => Ok(Stack::Mix(spec.levels.clone())),
        "layers" => Ok(Stack::Layers { crossfade: spec.crossfade }),
        other => Err(format!("instrument stack {other} is unknown")),
    }
}

// The instrument's settings in the engine's units ("mode" is poly, mono or legato).
fn param_values(spec: &InstrumentSpec) -> Result<[f32; PARAMS.len()], String> {
    let mut values = PARAMS.map(|param| param.default);
    for (name, value) in &spec.params {
        let param = PARAMS.iter().find(|param| param.key == name).ok_or_else(|| format!("instrument param {name} is unknown"))?;
        values[param.id as usize] = match (name.as_str(), value) {
            ("mode", ParamValue::Text(mode)) => match mode.as_str() {
                "poly" => 0.0,
                "mono" => 1.0,
                "legato" => 2.0,
                other => return Err(format!("instrument mode {other} is unknown")),
            },
            (_, ParamValue::Number(number)) => param.clamp(*number),
            (_, ParamValue::Text(_)) => return Err(format!("instrument param {name} must be a number")),
        };
    }
    Ok(values)
}

// Every segment spec of a zone: takes, release takes, composed steps'.
fn segment_specs(zone: &ZoneSpec) -> impl Iterator<Item = &SegmentSpec> {
    zone.takes.iter().chain(zone.release_takes.iter()).chain(zone.composed.iter().flat_map(|composed| composed.steps.iter().flat_map(|step| step.segments.iter())))
}

// The sampler, its settings and the facts of its marker table (index for index).
pub type Built = (Sampler, [f32; PARAMS.len()], Vec<MarkerInfo>);

pub fn build_sampler(spec: &InstrumentSpec, samples: &HashMap<String, SampleData>, sample_rate: u32) -> Result<Built, String> {
    if !(1..=MAX_OUTPUTS).contains(&spec.outputs) {
        return Err(format!("instrument {} has {} outputs, 1 to {MAX_OUTPUTS}", spec.id, spec.outputs));
    }
    if let Some(zone) = spec.zones.iter().find(|zone| zone.output as usize >= spec.outputs) {
        return Err(format!("zone {} sounds on output {}, the instrument has {}", zone.id, zone.output, spec.outputs));
    }
    let mut bank = SampleBank::new();
    let mut bank_index = HashMap::new();
    for zone in &spec.zones {
        for take in segment_specs(zone) {
            if bank_index.contains_key(take.sample_id.as_str()) {
                continue;
            }
            let data = samples.get(&take.sample_id).ok_or_else(|| format!("instrument sample {} is not loaded", take.sample_id))?;
            bank_index.insert(take.sample_id.as_str(), bank.add(data.clone()));
        }
    }
    let zone_index: HashMap<&str, usize> = spec.zones.iter().enumerate().map(|(index, zone)| (zone.id.as_str(), index)).collect();
    let mut markers = MarkerBuilder::default();
    let zones = spec.zones.iter().map(|zone| {
        let id = zone.id.as_str();
        let mut list = |specs: &[SegmentSpec], prefix: &str| specs.iter().enumerate()
            .map(|(index, take)| segment(take, &bank_index, &mut markers, id, &format!("{prefix}/{index}"))).collect::<Result<Vec<_>, _>>();
        let takes = list(&zone.takes, "takes")?;
        let release_takes = list(&zone.release_takes, "release_takes")?;
        let steps = zone.composed.iter().flat_map(|composed| composed.steps.iter())
            .map(|step| list(&step.segments, &format!("steps/{}", step.id))).collect::<Result<Vec<_>, _>>()?;
        let cuts = zone.cuts.iter().map(|cut| zone_index.get(cut.as_str()).copied().ok_or_else(|| format!("zone {} cuts unknown zone {cut}", zone.id)))
            .collect::<Result<Vec<_>, _>>()?;
        let mut built = Zone::new(zone.keys[0], zone.keys[1], takes).velocities(zone.velocities[0], zone.velocities[1]).stack(stack(&zone.stack)?);
        built.gain_db = zone.gain_db;
        built.cuts = cuts;
        built.release_takes = release_takes;
        built.release_decay_s = zone.release_decay_s;
        built.borrow_neighbours = zone.borrow_neighbours;
        built.output = zone.output;
        built.one_shot = zone.one_shot;
        built.switch = zone.switch;
        built.filter = zone.filter.as_ref().map(filter).transpose()?;
        built.composed = zone.composed.as_ref().map(|spec| composed(spec, steps, &markers, id)).transpose()?;
        Ok(built)
    }).collect::<Result<Vec<_>, String>>()?;
    let (markers, infos) = markers.finish();
    let switches = spec.keyswitch.as_ref().map(|range| Switches { low: range.keys[0], high: range.keys[1], default: range.default });
    let keymap = Keymap::with_markers(zones, markers, &bank, spec.seed)?.with_switches(switches)?;
    // A streamed sample reads the heads this keymap can start from (atome-instrument residency.rs).
    bank.reside(&keymap)?;
    let values = param_values(spec)?;
    let mut sampler = Sampler::new(keymap, bank, values[POLYPHONY as usize] as usize + FADING_VOICES);
    sampler.prepare(sample_rate as f32, MAX_BLOCK);
    if let Some(streams) = sampler.streams() {
        atome_instrument::stream::serve(streams)?;
    }
    for (id, value) in values.iter().enumerate() {
        sampler.set_param(id as u32, *value);
    }
    Ok((sampler, values, infos))
}

