// Modulation in the mix graph (R-191). A modulator (`dsp` lfo, follower,
// constant) writes a control per frame; each of its routes adds depth ×
// control to a parameter of another module, in that parameter's unit (a
// frequency in octaves), saturated to its range, on top of the value the
// person or the automation set. A graph that carries automation or
// modulation renders in control steps of CONTROL_FRAMES frames aligned on
// the rendered-frame clock, so the result never depends on the block size.
//
// A route to a module computed later in the same step reads the control at
// once; one to a module computed earlier (or to the modulator itself) reads
// it CONTROL_FRAMES later through a ring: a modulation loop is allowed and
// declared, never refused. A parameter its processor marks audio-rate takes
// the value of every frame; any other takes the step's first value and its
// processor's own smoothing.

use crate::automation::{Slot, primary_param, slot_of};
use crate::dsp_module;
use crate::graph_order::Layout;
use crate::module::ModuleControls;
use crate::program::{ModuleSpec, Program};
use atome_dsp::{ParamSpec, Unit};
use std::collections::HashMap;

pub const CONTROL_FRAMES: usize = 32;
const CONTROL_RING: usize = 128;

// A modulator output's values for the targets that read it.
pub enum ControlLane {
    Direct(Vec<f32>),
    Ring(Vec<f32>),
}

impl ControlLane {
    // Writes `frames` values (silence past what `values` holds: a bypassed modulator).
    pub fn write(&mut self, clock: usize, values: &[f32], frames: usize) {
        match self {
            Self::Direct(lane) => {
                for (index, slot) in lane[..frames].iter_mut().enumerate() {
                    *slot = values.get(index).copied().unwrap_or(0.0);
                }
            }
            Self::Ring(ring) => {
                for index in 0..frames {
                    ring[(clock + index + CONTROL_FRAMES) & (CONTROL_RING - 1)] =
                        values.get(index).copied().unwrap_or(0.0);
                }
            }
        }
    }

    fn accumulate(&self, clock: usize, depth: f32, out: &mut [f32]) {
        match self {
            Self::Direct(lane) => {
                for (out, value) in out.iter_mut().zip(lane.iter()) {
                    *out += depth * value;
                }
            }
            Self::Ring(ring) => {
                for (index, out) in out.iter_mut().enumerate() {
                    *out += depth * ring[(clock + index) & (CONTROL_RING - 1)];
                }
            }
        }
    }
}

// What a modulation moves: a module's primary value or one of its parameters.
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Target {
    Value,
    Parameter(usize),
}

// A parameter of one module and the controls added to it.
pub struct ParamMod {
    pub target: Target,
    spec: ParamSpec,
    sources: Vec<(usize, f32)>,
    // The step's values, frame by frame.
    pub values: Vec<f32>,
}

impl ParamMod {
    pub fn compute(
        &mut self,
        controls: &ModuleControls,
        lanes: &[ControlLane],
        clock: usize,
        frames: usize,
    ) {
        let base = match self.target {
            Target::Value => controls.value.get(),
            Target::Parameter(index) => controls.parameters[index].get(),
        };
        let values = &mut self.values[..frames];
        values.fill(0.0);
        for (lane, depth) in &self.sources {
            lanes[*lane].accumulate(clock, *depth, values);
        }
        for value in values.iter_mut() {
            *value = self.spec.modulate(base, *value);
        }
    }
}

// The primary value of the built-in modules, as a parameter.
fn value_spec(kind: &str) -> Option<ParamSpec> {
    let key = primary_param(kind)?;
    Some(match kind {
        "pan" => ParamSpec::new(0, key, -1.0, 1.0, 0.0, Unit::Pan),
        _ => ParamSpec::new(0, key, -120.0, 12.0, 0.0, Unit::Decibels),
    })
}

// The compiled modulation of a program: lanes, what each modulator writes,
// and what each module reads, by (strip index, step).
#[derive(Default)]
pub struct Modulation {
    pub lanes: Vec<ControlLane>,
    pub writes: HashMap<(usize, usize), Vec<(usize, usize)>>,
    pub reads: HashMap<(usize, usize), Vec<ParamMod>>,
}

impl Modulation {
    // `position[strip]`: the strip's place in the render order.
    pub(crate) fn compile(
        program: &Program,
        layout: &Layout,
        position: &[usize],
    ) -> Result<Self, String> {
        let mut compiled = Self::default();
        // (source strip, step, output, ring?) -> lane
        let mut lane_of: HashMap<(usize, usize, usize, bool), usize> = HashMap::new();
        for (strip, spec) in program.strips.iter().enumerate() {
            for (step, module) in spec.chain.iter().enumerate() {
                if module.modulations.is_empty() {
                    continue;
                }
                let outputs = control_outputs(module)?;
                for route in &module.modulations {
                    if route.output >= outputs {
                        return Err(format!(
                            "mix module {} has no control output {}",
                            module.id, route.output
                        ));
                    }
                    if !route.depth.is_finite() {
                        return Err(format!(
                            "mix modulation {} → {}#{}: the depth is not a number",
                            module.id, route.module_id, route.param
                        ));
                    }
                    let (to_strip, to_step) = layout.module(&route.module_id).ok_or_else(|| {
                        format!(
                            "mix modulation {} targets {}, which is not in the program",
                            module.id, route.module_id
                        )
                    })?;
                    let target_spec = &program.strips[to_strip].chain[to_step];
                    let (target, param) = resolve(target_spec, &route.param)?;
                    let forward = (position[strip], step) < (position[to_strip], to_step);
                    let key = (strip, step, route.output, !forward);
                    let lane = match lane_of.get(&key) {
                        Some(lane) => *lane,
                        None => {
                            compiled.lanes.push(match forward {
                                true => ControlLane::Direct(vec![0.0; CONTROL_FRAMES]),
                                false => ControlLane::Ring(vec![0.0; CONTROL_RING]),
                            });
                            let lane = compiled.lanes.len() - 1;
                            lane_of.insert(key, lane);
                            compiled
                                .writes
                                .entry((strip, step))
                                .or_default()
                                .push((route.output, lane));
                            lane
                        }
                    };
                    let reads = compiled.reads.entry((to_strip, to_step)).or_default();
                    let depth = route.depth as f32;
                    match reads.iter_mut().find(|read| read.target == target) {
                        Some(read) => read.sources.push((lane, depth)),
                        None => reads.push(ParamMod {
                            target,
                            spec: param,
                            sources: vec![(lane, depth)],
                            values: vec![0.0; CONTROL_FRAMES],
                        }),
                    }
                }
            }
        }
        Ok(compiled)
    }

    pub fn is_empty(&self) -> bool {
        self.lanes.is_empty()
    }
}

fn control_outputs(module: &ModuleSpec) -> Result<usize, String> {
    let outputs = match module.kind.as_str() {
        dsp_module::MODULE_TYPE => dsp_module::kind_of(module)?.control_outputs(),
        _ => 0,
    };
    match outputs {
        0 => Err(format!(
            "mix module {} writes no control signal: only a modulator carries modulations",
            module.id
        )),
        outputs => Ok(outputs),
    }
}

fn resolve(spec: &ModuleSpec, param: &str) -> Result<(Target, ParamSpec), String> {
    let refused = || {
        format!(
            "mix modulation: {}#{param} is not a parameter of it",
            spec.id
        )
    };
    let (target, entry) = match slot_of(spec, param).map_err(|_| refused())? {
        Slot::Value => (Target::Value, value_spec(&spec.kind).ok_or_else(refused)?),
        Slot::Parameter(index, entry) => (Target::Parameter(index), *entry),
        // A painted zone switches its module on and off: it is set, never modulated.
        Slot::Engaged => return Err(refused()),
    };
    if !entry.modulatable() {
        return Err(format!(
            "mix modulation: {}#{param} moves in steps (a choice or a count); it is set, never modulated",
            spec.id
        ));
    }
    Ok((target, entry))
}
