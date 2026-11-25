// Freezing a strip of the applied program (R-370): which leading part of a strip a stem may stand for, offering and
// thawing stems, and what each strip costs. Control thread only; the render thread side is freeze.rs.
//
// A strip may be frozen when its sound depends on nothing played live: its input is its track's voices or an
// instrument (never a live input), no other strip routes into it, and it is mono or stereo. Its stem stands for its
// source and the leading `dsp` modules that touch nothing else (no port sent out, no key, no mix-in, no modulator,
// none modulated) and do not ring on (a filter's few milliseconds aside) — so a reverb, an echo and everything after
// them (volume, pan, sends) stay live, and a frozen strip sounds the same when it stops or loops.

use crate::freeze::{FreezeSlot, Stem};
use crate::load_meter::StripCost;
use crate::program::{InputSpec, ModuleSpec, Program, StripSpec, Target};
use crate::{MixGraph, dsp_module};
use std::collections::{HashMap, HashSet};
use std::sync::Arc;

#[derive(Default)]
pub(crate) struct Freezes {
    slots: HashMap<String, Arc<FreezeSlot>>,
    costs: HashMap<String, Arc<StripCost>>,
    // The steps each frozen strip's stem stands for, to tell when a new program changes them.
    frozen_steps: HashMap<String, usize>,
    program: Program,
}

// What a stem of `steps` steps of a strip depends on, the same in both: its input, its width, its transport and
// those steps.
fn same_frozen_part(old: &StripSpec, new: &StripSpec, steps: usize) -> bool {
    old.input == new.input
        && old.channels == new.channels
        && old.transport == new.transport
        && new.chain.len() >= steps
        && old.chain.get(..steps) == new.chain.get(..steps)
}

impl Freezes {
    pub(crate) fn slot(&mut self, strip_id: &str) -> Arc<FreezeSlot> {
        self.slots.entry(strip_id.to_string()).or_default().clone()
    }

    pub(crate) fn cost(&mut self, strip_id: &str) -> Arc<StripCost> {
        self.costs.entry(strip_id.to_string()).or_default().clone()
    }

    pub(crate) fn applied(&mut self, program: &Program) -> Result<(), String> {
        let live: HashSet<&str> = program
            .strips
            .iter()
            .map(|strip| strip.id.as_str())
            .collect();
        self.slots.retain(|id, _| live.contains(id.as_str()));
        self.costs.retain(|id, _| live.contains(id.as_str()));
        // A strip whose frozen part changed plays live again at once (its stem fading out): its stem stands for the
        // strip as it was. The page renders the new one when the strip cools down.
        let find = |program: &'_ Program, id: &str| {
            program.strips.iter().find(|strip| strip.id == id).cloned()
        };
        let changed: Vec<String> = self
            .frozen_steps
            .iter()
            .filter(
                |(id, steps)| match (find(&self.program, id), find(program, id)) {
                    (Some(old), Some(new)) => !same_frozen_part(&old, &new, **steps),
                    _ => true,
                },
            )
            .map(|(id, _)| id.clone())
            .collect();
        for id in changed {
            self.frozen_steps.remove(&id);
            if let Some(slot) = self.slots.get(&id) {
                slot.offer_thaw()?;
            }
        }
        for slot in self.slots.values() {
            slot.collect();
        }
        self.program = program.clone();
        Ok(())
    }
}

/// A strip's stem as the render thread hears it.
#[derive(Clone, Debug, PartialEq)]
pub struct FrozenStrip {
    pub strip_id: String,
    pub key: String,
    // 1 frozen, 0 live, between a fade.
    pub mix: f32,
}

/// A strip's share of the load since the last read.
#[derive(Clone, Debug, PartialEq)]
pub struct StripLoad {
    pub strip_id: String,
    pub load: f32,
}

fn routes_into(target: &Target, strip_id: &str) -> bool {
    matches!(target, Target::Strip { id, .. } if id == strip_id)
}

// Something of another strip sends its sound into `strip_id`: its input then is not its own.
fn has_inbound(program: &Program, strip_id: &str) -> bool {
    program
        .strips
        .iter()
        .filter(|strip| strip.id != strip_id)
        .any(|strip| {
            strip
                .output
                .as_ref()
                .is_some_and(|target| routes_into(target, strip_id))
                || strip.chain.iter().any(|module| {
                    module
                        .target
                        .as_ref()
                        .is_some_and(|target| routes_into(target, strip_id))
                        || module
                            .outputs
                            .iter()
                            .any(|port| routes_into(&port.target, strip_id))
                })
        })
}

fn modulated(program: &Program) -> HashSet<&str> {
    program
        .strips
        .iter()
        .flat_map(|strip| strip.chain.iter())
        .flat_map(|module| module.modulations.iter())
        .map(|route| route.module_id.as_str())
        .collect()
}

fn self_contained(module: &ModuleSpec, modulated: &HashSet<&str>, has_tail: bool) -> bool {
    module.kind == dsp_module::MODULE_TYPE
        && module.outputs.is_empty()
        && module.key.is_none()
        && module.source.is_none()
        && module.modulations.is_empty()
        && !modulated.contains(module.id.as_str())
        && !has_tail
}

/// How many leading steps of `strip` a stem may stand for, or why it may not be frozen.
pub fn freezable_steps(
    program: &Program,
    strip: &StripSpec,
    has_tail: &dyn Fn(&str) -> bool,
) -> Result<usize, String> {
    if matches!(strip.input, InputSpec::LiveAudio { .. }) {
        return Err("freeze_live_input".into());
    }
    if strip.channels > 2 {
        return Err("freeze_wide_strip".into());
    }
    if has_inbound(program, &strip.id) {
        return Err("freeze_strip_has_inputs".into());
    }
    let modulated = modulated(program);
    let steps = strip
        .chain
        .iter()
        .take_while(|module| self_contained(module, &modulated, has_tail(&module.id)))
        .count();
    // A track's voices cost little on their own: a stem pays only when it stands for modules or an instrument.
    if steps == 0 && matches!(strip.input, InputSpec::Track) {
        return Err("freeze_nothing_to_save".into());
    }
    Ok(steps)
}

impl MixGraph {
    /// How many leading steps of the applied strip a stem may stand for, or why it may not be frozen.
    pub fn freezable_steps(&self, strip_id: &str) -> Result<usize, String> {
        let program = &self.freezes.program;
        let strip = program
            .strips
            .iter()
            .find(|strip| strip.id == strip_id)
            .ok_or_else(|| format!("freeze_strip_missing:{strip_id}"))?;
        freezable_steps(program, strip, &|module_id| {
            self.modules
                .get(module_id)
                .is_some_and(|entry| entry.long_tail)
        })
    }

    /// Hears `stem` in place of the strip's frozen part; refused when the strip changed since it was rendered.
    pub fn freeze_strip(&mut self, strip_id: &str, stem: Arc<Stem>) -> Result<(), String> {
        let steps = self.freezable_steps(strip_id)?;
        if stem.steps != steps {
            return Err(format!("freeze_stem_stale:{strip_id}"));
        }
        self.freezes.slot(strip_id).offer_freeze(stem)?;
        self.freezes
            .frozen_steps
            .insert(strip_id.to_string(), steps);
        Ok(())
    }

    /// The strip plays live again, its stem fading out over `freeze::FADE_OUT_SECONDS`.
    pub fn thaw_strip(&mut self, strip_id: &str) -> Result<(), String> {
        self.freezes
            .slots
            .get(strip_id)
            .ok_or_else(|| format!("freeze_strip_missing:{strip_id}"))?
            .offer_thaw()?;
        self.freezes.frozen_steps.remove(strip_id);
        Ok(())
    }

    /// The strips heard through a stem (frozen, or fading in or out), sorted by strip id.
    pub fn frozen_strips(&self) -> Vec<FrozenStrip> {
        let mut frozen: Vec<FrozenStrip> = self
            .freezes
            .slots
            .iter()
            .filter_map(|(strip_id, slot)| {
                slot.collect();
                slot.heard().map(|key| FrozenStrip {
                    strip_id: strip_id.clone(),
                    key,
                    mix: slot.mix(),
                })
            })
            .collect();
        frozen.sort_by(|left, right| left.strip_id.cmp(&right.strip_id));
        frozen
    }

    /// Each strip's share of the load since the last read (measured while it ran live), sorted by strip id.
    pub fn strip_loads(&self) -> Vec<StripLoad> {
        let rate = self.sample_rate();
        let mut loads: Vec<StripLoad> = self
            .freezes
            .costs
            .iter()
            .filter_map(|(strip_id, cost)| {
                let (load, frames) = cost.take(rate);
                (frames > 0).then(|| StripLoad {
                    strip_id: strip_id.clone(),
                    load,
                })
            })
            .collect();
        loads.sort_by(|left, right| left.strip_id.cmp(&right.strip_id));
        loads
    }
}
