// Applying a program on the control thread: modules kept (their state and
// controls) or built anew, sources planned, the graph compiled and handed to
// the render thread, the automation bound. Nothing here runs on the render thread.

use crate::dsp_module::{self, DspRuntime};
use crate::graph::{self, Graph, StepModule, StripParts};
use crate::module::{ModuleControls, ModuleRuntime, Processor};
use crate::shared::LiveInput;
use crate::source_bus::Feeds;
use crate::{
    MixGraph, ModuleEntry, ModuleSpec, Program, automation, dsp, module_identity, primary_value,
    record_tap, wide, write_controls,
};
use std::collections::{HashMap, HashSet};
use std::sync::Arc;
use std::sync::atomic::Ordering;

impl MixGraph {
    // One processor per pair of the strip's `channels` (R-191).
    fn build_module(
        &self,
        spec: &ModuleSpec,
        tap: Option<Arc<record_tap::RecordTap>>,
        channels: usize,
    ) -> Result<ModuleEntry, String> {
        let (parameters, readings) = if spec.kind == dsp_module::MODULE_TYPE {
            let kind = dsp_module::kind_of(spec)?;
            (
                dsp_module::parameter_slots(kind),
                dsp_module::reading_slots(kind),
            )
        } else {
            (Vec::new(), Vec::new())
        };
        let controls = ModuleControls::new(primary_value(spec), spec.bypass, parameters, readings);
        write_controls(&controls, spec);
        let sample_rate = self.sample_rate();
        let mut latency = 0;
        let pairs = wide::pairs_of(channels);
        if spec.kind == record_tap::MODULE_TYPE && pairs > 1 {
            return Err(format!(
                "mix record point {}: a take records a mono or stereo strip, this one has {channels} channels",
                spec.id
            ));
        }
        let gain = || dsp::SmoothedGain::new(dsp::db_to_amplitude(primary_value(spec)));
        let mut processors = Vec::with_capacity(pairs);
        for _ in 0..pairs {
            processors.push(match spec.kind.as_str() {
                "volume" => Processor::Volume(gain()),
                "pan" => Processor::Pan,
                "mono" => Processor::Mono,
                record_tap::MODULE_TYPE => {
                    let tap = tap.clone().ok_or("mix record point has no strip")?;
                    tap.hold(&spec.id)?;
                    Processor::Record(tap)
                }
                "send" => Processor::Send(gain()),
                "input" => Processor::Input(gain()),
                dsp_module::MODULE_TYPE => {
                    let runtime = DspRuntime::build(
                        spec,
                        &controls.parameters,
                        &self.assets,
                        sample_rate,
                        graph::MAX_BLOCK,
                    )?;
                    latency = runtime.latency();
                    Processor::Dsp(Box::new(runtime))
                }
                other => return Err(format!("mix module type {other} is not an audio module")),
            });
        }
        // A tail longer than a stem's fade would be heard cut where the timeline stops or loops (R-370).
        let long_tail = matches!(processors.first(), Some(Processor::Dsp(runtime))
            if f64::from(runtime.tail_frames) > crate::freeze::LONG_TAIL_SECONDS * f64::from(sample_rate));
        let fresh = ModuleRuntime::new(controls.clone(), processors, sample_rate);
        Ok(ModuleEntry {
            spec: spec.clone(),
            controls,
            channels,
            latency,
            long_tail,
            fresh: Some(fresh),
            active: None,
            sent: None,
        })
    }

    fn drain_retired(&self) {
        if let Ok(mut retired) = self.shared.retired.lock() {
            retired.clear();
            retired.reserve(4);
        }
    }

    // Where every module runs now: a graph the render thread never took comes
    // back with the modules it carried fresh; one it took is the active graph.
    fn settle_locations(&mut self) -> Result<(), String> {
        let returned = self
            .shared
            .pending
            .lock()
            .map_err(|error| format!("mix graph lock: {error}"))?
            .take();
        match returned {
            Some(mut graph) => {
                for (id, module) in graph.take_fresh() {
                    if let Some(entry) = self.modules.get_mut(&id) {
                        entry.fresh = Some(module);
                    }
                }
                for entry in self.modules.values_mut() {
                    entry.sent = None;
                }
            }
            None => {
                for entry in self.modules.values_mut() {
                    if let Some(location) = entry.sent.take() {
                        entry.active = Some(location);
                    }
                }
            }
        }
        Ok(())
    }

    pub fn apply(&mut self, program: Program) -> Result<(), String> {
        graph::dependency_order(&program)?;
        self.drain_retired();
        self.settle_locations()?;
        let sample_rate = self.sample_rate();
        let (live_inputs, live_capacity) = (&mut self.live_inputs, self.live_capacity);
        let feeds = Feeds::plan(
            &program,
            &mut |device, channels| {
                live_inputs
                    .entry((device.to_string(), channels.to_vec()))
                    .or_insert_with(|| LiveInput::with_channels(live_capacity, channels))
                    .clone()
            },
            &mut self.instruments,
            sample_rate,
        )?;
        let mut next_modules = HashMap::new();
        let mut parts = Vec::with_capacity(program.strips.len());
        for strip in &program.strips {
            let mut modules = Vec::with_capacity(strip.chain.len());
            let tap = strip
                .chain
                .iter()
                .any(|spec| spec.kind == record_tap::MODULE_TYPE)
                .then(|| self.record_tap_for(&strip.id));
            let mut before_tap = Some(0);
            let channels = wide::check_width(&strip.id, strip.channels)?;
            for spec in &strip.chain {
                // A REC point writes into the tap it was built with: kept only on its own strip.
                let own_tap = match (&tap, spec.kind == record_tap::MODULE_TYPE) {
                    (Some(tap), true) => tap.is_held_by(&spec.id)?,
                    _ => true,
                };
                let mut entry = match self.modules.remove(&spec.id) {
                    Some(mut entry)
                        if module_identity(&entry.spec) == module_identity(spec)
                            && entry.channels == channels
                            && own_tap =>
                    {
                        write_controls(&entry.controls, spec);
                        entry.spec = spec.clone();
                        entry
                    }
                    _ => self.build_module(spec, tap.clone(), channels)?,
                };
                before_tap = match spec.kind.as_str() {
                    record_tap::MODULE_TYPE => {
                        if let (Some(tap), Some(frames)) = (&tap, before_tap) {
                            tap.set_latency(frames);
                        }
                        None
                    }
                    _ => before_tap.map(|frames| frames + entry.latency),
                };
                let module = match (entry.fresh.take(), entry.active) {
                    (Some(fresh), _) => StepModule::Fresh(fresh),
                    (None, Some((at, index))) => StepModule::Adopt(at, index),
                    (None, None) => return Err(format!("mix module {} has no runtime", spec.id)),
                };
                modules.push(module);
                next_modules.insert(spec.id.clone(), entry);
            }
            parts.push(StripParts {
                id: strip.id.clone(),
                capture: self.capture_slot(&strip.id),
                source: feeds.strip_source(&strip.input),
                meter: self.meters.entry(strip.id.clone()).or_default().clone(),
                freeze: self.freezes.slot(&strip.id),
                cost: self.freezes.cost(&strip.id),
                modules,
            });
        }
        let devices: HashSet<(String, Vec<u16>)> = feeds
            .devices()
            .map(|(device, channels)| (device.to_string(), channels.to_vec()))
            .collect();
        let routed = feeds.routed();
        let output_channels = (usize::from(self.shared.aux.pairs()) + 1) * 2;
        let mut compiled = Graph::compile(
            &program,
            parts,
            feeds,
            &|spec| next_modules.get(&spec.id).map_or(0, |entry| entry.latency),
            output_channels,
        )?;
        self.transports
            .apply(&program, self.shared.frames.load(Ordering::Relaxed));
        self.output_latency = compiled.output_latency;
        compiled.automation = automation::Automation::bind(&program, &self.transports, &|id| {
            next_modules.get(id).map(|entry| entry.controls.clone())
        })?;
        for strip in &mut compiled.strips {
            strip.transport = program
                .strips
                .iter()
                .find(|spec| spec.id == strip.id)
                .and_then(|spec| spec.transport.as_deref())
                .and_then(|id| self.transports.strip(id));
        }
        for (id, location) in compiled.locations() {
            if let Some(entry) = next_modules.get_mut(id) {
                entry.sent = Some(location);
            }
        }
        let live: HashSet<&str> = program
            .strips
            .iter()
            .map(|strip| strip.id.as_str())
            .collect();
        self.captures.retain(|id, _| live.contains(id.as_str()));
        self.record_taps.retain(|id, _| live.contains(id.as_str()));
        self.instruments.retain(routed);
        self.live_inputs.retain(|key, _| devices.contains(key));
        self.meters.retain(|id, _| live.contains(id.as_str()));
        self.freezes.applied(&program)?;
        self.modules = next_modules;
        *self
            .shared
            .pending
            .lock()
            .map_err(|error| format!("mix graph lock: {error}"))? = Some(Box::new(compiled));
        Ok(())
    }
}
