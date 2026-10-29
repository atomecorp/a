// Order of a compiled mix graph: what a program describes resolved to strip
// indexes, the dependency order (Kahn over sends, routed ports, outputs, keys
// and the strips IN modules read; a loop is allowed, D27) and the plugin-delay
// compensation of the forward routes.

use crate::program::{KeySource, MixSource, ModuleSpec, Program, StripSpec, Target};
use std::collections::HashMap;

// What a program describes, resolved to strip indexes.
pub(crate) struct Layout<'a> {
    strip_of: HashMap<&'a str, usize>,
    // module id -> (strip index, step index)
    module_at: HashMap<&'a str, (usize, usize)>,
}

impl<'a> Layout<'a> {
    pub(crate) fn new(program: &'a Program) -> Result<Self, String> {
        let strip_of: HashMap<&str, usize> = program.strips.iter().enumerate().map(|(index, strip)| (strip.id.as_str(), index)).collect();
        if strip_of.len() != program.strips.len() {
            return Err("duplicate mix strip id".to_string());
        }
        let mut module_at = HashMap::new();
        for (index, strip) in program.strips.iter().enumerate() {
            for (step, module) in strip.chain.iter().enumerate() {
                if module_at.insert(module.id.as_str(), (index, step)).is_some() {
                    return Err(format!("duplicate mix module id {}", module.id));
                }
            }
        }
        Ok(Self { strip_of, module_at })
    }

    pub(crate) fn strip(&self, id: &str) -> Result<usize, String> {
        self.strip_of.get(id).copied().ok_or_else(|| format!("mix target {id} missing"))
    }

    pub(crate) fn target(&self, target: &Target) -> Result<Option<usize>, String> {
        match target {
            Target::Strip { id } => self.strip(id).map(Some),
            _ => Ok(None),
        }
    }

    // The strip an IN module reads (D-S3), None for a live input or an instrument.
    pub(crate) fn mix_source(&self, source: &MixSource) -> Result<Option<usize>, String> {
        match source {
            MixSource::Strip { id } => self.strip_of.get(id.as_str()).map(|index| Some(*index)).ok_or_else(|| format!("IN source {id} missing")),
            _ => Ok(None),
        }
    }

    // The strip (and step, for a port) a key listens to.
    pub(crate) fn key_source(&self, key: &KeySource) -> Result<(usize, Option<(usize, usize)>), String> {
        match key {
            KeySource::Strip { id } => self.strip_of.get(id.as_str()).map(|index| (*index, None)).ok_or_else(|| format!("key source {id} missing")),
            KeySource::Port { module_id, port } => {
                let (strip, step) = *self.module_at.get(module_id.as_str()).ok_or_else(|| format!("key source module {module_id} missing"))?;
                Ok((strip, Some((step, *port))))
            }
        }
    }
}

// Every route of a strip, in one fixed order: per step its send then its
// routed ports, then the strip output.
pub(crate) fn strip_routes(strip: &StripSpec) -> Vec<(Option<usize>, Option<&Target>)> {
    let mut routes = Vec::new();
    for (step, module) in strip.chain.iter().enumerate() {
        if module.kind == "send" {
            routes.push((Some(step), module.target.as_ref()));
        }
        for port in &module.outputs {
            routes.push((Some(step), Some(&port.target)));
        }
    }
    routes.push((None, strip.output.as_ref()));
    routes
}

// Kahn ordering over sends, routed ports, outputs, keys and IN sources. A loop is allowed
// (D27): when only looped strips remain, the first of them in program order
// goes next, and what reaches it later in the order becomes a return.
pub fn dependency_order(program: &Program) -> Result<Vec<usize>, String> {
    let layout = Layout::new(program)?;
    let count = program.strips.len();
    let mut edges: Vec<Vec<usize>> = vec![Vec::new(); count];
    let mut incoming = vec![0usize; count];
    for (index, strip) in program.strips.iter().enumerate() {
        for (_, target) in strip_routes(strip) {
            if let Some(to) = target.map(|target| layout.target(target)).transpose()?.flatten() {
                edges[index].push(to);
                incoming[to] += 1;
            }
        }
        for module in &strip.chain {
            if let Some(key) = &module.key {
                let (from, _) = layout.key_source(key)?;
                edges[from].push(index);
                incoming[index] += 1;
            }
            if let Some(from) = module.source.as_ref().map(|source| layout.mix_source(source)).transpose()?.flatten() {
                edges[from].push(index);
                incoming[index] += 1;
            }
        }
    }
    let mut placed = vec![false; count];
    let mut ready: Vec<usize> = (0..count).rev().filter(|index| incoming[*index] == 0).collect();
    let mut order = Vec::with_capacity(count);
    while order.len() < count {
        let next = match ready.pop() {
            Some(index) if placed[index] => continue,
            Some(index) => index,
            None => (0..count).find(|index| !placed[*index]).expect("an unplaced strip remains"),
        };
        placed[next] = true;
        order.push(next);
        for &to in edges[next].iter().rev() {
            incoming[to] = incoming[to].saturating_sub(1);
            if incoming[to] == 0 && !placed[to] {
                ready.push(to);
            }
        }
    }
    Ok(order)
}

// The ports a module writes, from its description alone.
pub(crate) fn ports_of(spec: &ModuleSpec) -> usize {
    if spec.kind == crate::dsp_module::MODULE_TYPE {
        crate::dsp_module::kind_of(spec).map_or(1, |kind| kind.outputs())
    } else {
        1
    }
}

// Plugin-delay compensation over the forward routes: every route into a
// summing point is delayed so all arrivals line up with the slowest one. A
// return is the loop's own delay and is never compensated. Returns each
// strip's route delays in `strip_routes` order.
pub fn compensation(program: &Program, order: &[usize], module_latency: &dyn Fn(&ModuleSpec) -> usize) -> Result<Vec<Vec<usize>>, String> {
    let layout = Layout::new(program)?;
    let count = program.strips.len();
    let mut position = vec![0usize; count];
    for (at, index) in order.iter().enumerate() {
        position[*index] = at;
    }
    // Per route: (forward strip, or None for the main mix and the devices),
    // whether it is compensated, and its latency.
    let mut arrival = vec![0usize; count];
    let mut route_latency: Vec<Vec<(Option<usize>, bool, usize)>> = vec![Vec::new(); count];
    let mut main_arrival = 0;
    for &index in order {
        let strip = &program.strips[index];
        let mut after_step = Vec::with_capacity(strip.chain.len());
        let mut latency = arrival[index];
        for module in &strip.chain {
            latency += module_latency(module);
            after_step.push(latency);
        }
        for (step, target) in strip_routes(strip) {
            let at = step.map_or(latency, |step| after_step[step]);
            let entry = match target {
                None => (None, false, at),
                Some(target) => match layout.target(target)? {
                    Some(to) if position[to] > position[index] => {
                        arrival[to] = arrival[to].max(at);
                        (Some(to), true, at)
                    }
                    Some(to) => (Some(to), false, at),
                    None => {
                        main_arrival = main_arrival.max(at);
                        (None, true, at)
                    }
                },
            };
            route_latency[index].push(entry);
        }
    }
    Ok(route_latency.iter().map(|routes| routes.iter().map(|(to, compensated, at)| match (to, compensated) {
        (_, false) => 0,
        (Some(to), true) => arrival[*to] - at,
        (None, true) => main_arrival - at,
    }).collect()).collect())
}
