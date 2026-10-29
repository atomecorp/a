// The mix automation heard (todo/timeline/sequenceur_vues_clips_2026-10-29.md A5, Q18): a module's
// parameter follows its lane's curve, computed here at every block from the transport's own clock,
// never stepped by the display. A lane's points are on the transport's time (seconds, sections end
// to end); a transport is anchored when the program carrying a new epoch of it is applied (start,
// seek, pause, stop), then runs on the frames the graph renders, wrapping inside its loop.

use crate::dsp_module;
use crate::module::ModuleControls;
use crate::program::{ModuleSpec, Program};
use serde::Deserialize;
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;

#[derive(Clone, Copy, Debug, Default, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum Curve {
    #[default]
    Linear,
    Hold,
    Smooth,
}

// A point's curve leads to the next point.
#[derive(Clone, Debug, Deserialize, PartialEq)]
pub struct AutomationPoint {
    pub at: f64,
    pub value: f64,
    #[serde(default)]
    pub curve: Curve,
}

#[derive(Clone, Debug, Deserialize, PartialEq)]
pub struct AutomationLane {
    pub param: String,
    pub points: Vec<AutomationPoint>,
}

#[derive(Clone, Debug, Deserialize, PartialEq)]
pub struct LoopSpec {
    pub start: f64,
    pub end: f64,
}

// Where a transport stands when its epoch is applied; a new epoch anchors it again.
#[derive(Clone, Debug, Deserialize, PartialEq)]
pub struct TransportSpec {
    pub id: String,
    pub epoch: u64,
    pub playing: bool,
    #[serde(default)]
    pub seconds: f64,
    #[serde(default, rename = "loop")]
    pub cycle: Option<LoopSpec>,
}

// The value of a curve at `seconds` (points in time order): held before the first and after the last.
pub fn evaluate(points: &[AutomationPoint], seconds: f64) -> Option<f64> {
    let first = points.first()?;
    if seconds <= first.at {
        return Some(first.value);
    }
    let next = points.iter().position(|point| point.at > seconds);
    let Some(next) = next else { return points.last().map(|point| point.value) };
    let (from, to) = (&points[next - 1], &points[next]);
    let span = to.at - from.at;
    let ratio = if span > 0.0 { (seconds - from.at) / span } else { 1.0 };
    let eased = match from.curve {
        Curve::Hold => return Some(from.value),
        Curve::Linear => ratio,
        Curve::Smooth => ratio * ratio * (3.0 - 2.0 * ratio),
    };
    Some(from.value + (to.value - from.value) * eased)
}

// A transport's clock, written by the control thread, read by the render thread.
pub struct TransportClock {
    epoch: AtomicU64,
    playing: AtomicBool,
    seconds: AtomicU64,
    frame: AtomicU64,
    loop_start: AtomicU64,
    loop_end: AtomicU64,
}

impl TransportClock {
    fn new() -> Arc<Self> {
        Arc::new(Self {
            epoch: AtomicU64::new(u64::MAX), playing: AtomicBool::new(false), seconds: AtomicU64::new(0),
            frame: AtomicU64::new(0), loop_start: AtomicU64::new(0), loop_end: AtomicU64::new(0),
        })
    }

    // Anchors a new epoch at `frame`, the frame the graph renders now.
    fn anchor(&self, spec: &TransportSpec, frame: u64) {
        if self.epoch.load(Ordering::Relaxed) == spec.epoch {
            return;
        }
        self.playing.store(false, Ordering::Release);
        let cycle = spec.cycle.as_ref().filter(|cycle| cycle.end > cycle.start);
        self.seconds.store(spec.seconds.to_bits(), Ordering::Relaxed);
        self.frame.store(frame, Ordering::Relaxed);
        self.loop_start.store(cycle.map_or(0.0, |cycle| cycle.start).to_bits(), Ordering::Relaxed);
        self.loop_end.store(cycle.map_or(0.0, |cycle| cycle.end).to_bits(), Ordering::Relaxed);
        self.epoch.store(spec.epoch, Ordering::Relaxed);
        self.playing.store(spec.playing, Ordering::Release);
    }

    // The transport's time at `frame`; none while it does not play.
    pub fn seconds_at(&self, frame: u64, sample_rate: f64) -> Option<f64> {
        if !self.playing.load(Ordering::Acquire) {
            return None;
        }
        let anchor = self.frame.load(Ordering::Relaxed);
        let seconds = f64::from_bits(self.seconds.load(Ordering::Relaxed)) + frame.saturating_sub(anchor) as f64 / sample_rate;
        let (start, end) = (f64::from_bits(self.loop_start.load(Ordering::Relaxed)), f64::from_bits(self.loop_end.load(Ordering::Relaxed)));
        Some(if end > start && seconds >= end { start + (seconds - start) % (end - start) } else { seconds })
    }
}

// The transports of the programs applied, by id; a transport no program names is dropped.
#[derive(Default)]
pub struct Transports(HashMap<String, Arc<TransportClock>>);

impl Transports {
    pub fn apply(&mut self, program: &Program, frame: u64) {
        self.0.retain(|id, _| program.transports.iter().any(|spec| &spec.id == id));
        for spec in &program.transports {
            self.0.entry(spec.id.clone()).or_insert_with(TransportClock::new).anchor(spec, frame);
        }
    }
}

// The parameter of a module that holds its primary value (module.rs `value`).
pub fn primary_param(kind: &str) -> Option<&'static str> {
    match kind {
        "volume" => Some("gain_db"),
        "pan" => Some("pan"),
        "send" => Some("level_db"),
        "input" => Some("mix_db"),
        _ => None,
    }
}

enum Slot {
    Value,
    Parameter(usize, &'static atome_dsp::ParamSpec),
}

fn slot_of(spec: &ModuleSpec, param: &str) -> Result<Slot, String> {
    if primary_param(&spec.kind) == Some(param) {
        return Ok(Slot::Value);
    }
    if spec.kind == dsp_module::MODULE_TYPE {
        if let Some((index, entry)) = dsp_module::kind_of(spec)?.params().iter().enumerate().find(|(_, entry)| entry.key == param) {
            return Ok(Slot::Parameter(index, entry));
        }
    }
    Err(format!("mix automation {}#{param} names no parameter of the module", spec.id))
}

struct BoundLane {
    controls: Arc<ModuleControls>,
    slot: Slot,
    points: Vec<AutomationPoint>,
    clock: Arc<TransportClock>,
}

// The lanes a graph runs; built on the control thread, run on the render thread.
#[derive(Default)]
pub struct Automation {
    lanes: Vec<BoundLane>,
}

impl Automation {
    // `controls(module_id)`: the module's controls in the graph being compiled.
    pub fn bind(program: &Program, transports: &Transports, controls: &dyn Fn(&str) -> Option<Arc<ModuleControls>>) -> Result<Self, String> {
        let mut lanes = Vec::new();
        for strip in &program.strips {
            let Some(clock) = strip.transport.as_ref().and_then(|id| transports.0.get(id)) else { continue };
            for spec in &strip.chain {
                for lane in spec.automation.iter().filter(|lane| !lane.points.is_empty()) {
                    let controls = controls(&spec.id).ok_or_else(|| format!("mix automation module {} is not in the graph", spec.id))?;
                    let mut points = lane.points.clone();
                    points.sort_by(|left, right| left.at.total_cmp(&right.at));
                    lanes.push(BoundLane { controls, slot: slot_of(spec, &lane.param)?, points, clock: clock.clone() });
                }
            }
        }
        Ok(Self { lanes })
    }

    // Render thread: every lane of a playing transport takes its value at `frame`.
    pub fn run(&self, frame: u64, sample_rate: f64) {
        for lane in &self.lanes {
            let Some(value) = lane.clock.seconds_at(frame, sample_rate).and_then(|seconds| evaluate(&lane.points, seconds)) else { continue };
            match lane.slot {
                Slot::Value => lane.controls.value.set(value as f32),
                Slot::Parameter(index, entry) => lane.controls.parameters[index].set(entry.clamp(value as f32)),
            }
        }
    }
}
