// Compiled mix graph: strips in dependency order, each with its module chain,
// its routes (sends/output) and their latency-compensation delays.

use crate::dsp::{self, DelayLine, SmoothedGain};
use crate::module::ModuleCell;
use crate::program::{Program, Target};
use crate::shared::{CaptureSlot, LiveInput, StripMeter};
use kira::info::Info;
use kira::Frame;
use std::collections::HashMap;
use std::sync::Arc;

pub const MAX_BLOCK: usize = 4096;

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum RouteTarget {
    Main,
    Strip(usize),
    Device(u16),
}

pub struct Route {
    pub target: RouteTarget,
    pub delay: Option<DelayLine>,
}

pub struct ChainStep {
    pub cell: ModuleCell,
    // Send route, or sidechain key source strip index.
    pub route: Option<Route>,
    pub key_source: Option<usize>,
}

pub struct StripRuntime {
    pub id: String,
    pub capture: Arc<CaptureSlot>,
    pub live: Option<Arc<LiveInput>>,
    pub meter: Arc<StripMeter>,
    pub chain: Vec<ChainStep>,
    pub output: Option<Route>,
    pub output_enabled: bool,
    pub muted: bool,
    mute_gain: SmoothedGain,
    inbox: Vec<Frame>,
    work: Vec<Frame>,
    // Post-chain signal, read by sidechain consumers processed later.
    pub post: Vec<Frame>,
    scratch: Vec<Frame>,
}

pub struct Graph {
    pub strips: Vec<StripRuntime>,
    pub main: Vec<Frame>,
    pub aux: Vec<(u16, Vec<Frame>)>,
}

pub struct StripParts {
    pub id: String,
    pub capture: Arc<CaptureSlot>,
    pub live: Option<Arc<LiveInput>>,
    pub meter: Arc<StripMeter>,
    pub cells: Vec<ModuleCell>,
}

fn target_index(target: &Target, index_of: &HashMap<&str, usize>) -> Result<RouteTarget, String> {
    Ok(match target {
        Target::Main => RouteTarget::Main,
        Target::Device { channel } => RouteTarget::Device(*channel),
        Target::Strip { id } => RouteTarget::Strip(*index_of.get(id.as_str()).ok_or_else(|| format!("mix target {id} missing"))?),
    })
}

// Kahn ordering over sends, outputs and sidechain keys; a cycle is refused.
pub fn dependency_order(program: &Program) -> Result<Vec<usize>, String> {
    let index_of: HashMap<&str, usize> = program.strips.iter().enumerate().map(|(index, strip)| (strip.id.as_str(), index)).collect();
    if index_of.len() != program.strips.len() {
        return Err("duplicate mix strip id".to_string());
    }
    let mut edges: Vec<Vec<usize>> = vec![Vec::new(); program.strips.len()];
    let mut incoming = vec![0usize; program.strips.len()];
    let mut link = |from: usize, to: usize| {
        edges[from].push(to);
        incoming[to] += 1;
    };
    for (index, strip) in program.strips.iter().enumerate() {
        let mut targets: Vec<&Target> = strip.chain.iter().filter_map(|module| module.target.as_ref()).collect();
        targets.extend(strip.output.as_ref());
        for target in targets {
            if let RouteTarget::Strip(to) = target_index(target, &index_of)? {
                link(index, to);
            }
        }
        for module in &strip.chain {
            if let Some(source) = module.text("sidechain_strip_id") {
                let from = *index_of.get(source).ok_or_else(|| format!("sidechain source {source} missing"))?;
                link(from, index);
            }
        }
    }
    let mut ready: Vec<usize> = (0..program.strips.len()).filter(|index| incoming[*index] == 0).collect();
    ready.reverse();
    let mut order = Vec::with_capacity(program.strips.len());
    while let Some(index) = ready.pop() {
        order.push(index);
        for &to in &edges[index] {
            incoming[to] -= 1;
            if incoming[to] == 0 {
                ready.push(to);
            }
        }
    }
    if order.len() != program.strips.len() {
        return Err("mix routing loop".to_string());
    }
    Ok(order)
}

// Plugin-delay compensation: every route into a summing point is delayed so
// all arrivals line up with the slowest one. `module_latency` is in frames.
pub fn compensation(program: &Program, order: &[usize], module_latency: &dyn Fn(&crate::program::ModuleSpec) -> usize)
    -> (Vec<Vec<usize>>, Vec<usize>) {
    let index_of: HashMap<&str, usize> = program.strips.iter().enumerate().map(|(index, strip)| (strip.id.as_str(), index)).collect();
    let count = program.strips.len();
    let mut arrival = vec![0usize; count];
    // route latency per strip: one entry per send (chain order) then the output.
    let mut route_latency: Vec<Vec<(Option<usize>, usize)>> = vec![Vec::new(); count];
    for &index in order {
        let strip = &program.strips[index];
        let mut latency = arrival[index];
        for module in &strip.chain {
            latency += module_latency(module);
            if let Some(target) = &module.target {
                let to = match target { Target::Strip { id } => index_of.get(id.as_str()).copied(), _ => None };
                route_latency[index].push((to, latency));
                if let Some(to) = to {
                    arrival[to] = arrival[to].max(latency);
                }
            }
        }
        let to = match &strip.output { Some(Target::Strip { id }) => index_of.get(id.as_str()).copied(), _ => None };
        route_latency[index].push((to, latency));
        if let Some(to) = to {
            arrival[to] = arrival[to].max(latency);
        }
    }
    let main_arrival = route_latency.iter().flatten().filter(|(to, _)| to.is_none()).map(|(_, latency)| *latency).max().unwrap_or(0);
    let delays = route_latency.iter().map(|routes| routes.iter().map(|(to, latency)| match to {
        Some(to) => arrival[*to] - latency,
        None => main_arrival - latency,
    }).collect()).collect();
    (delays, arrival)
}

impl Graph {
    pub fn compile(program: &Program, parts: Vec<StripParts>, module_latency: &dyn Fn(&crate::program::ModuleSpec) -> usize) -> Result<Graph, String> {
        let order = dependency_order(program)?;
        let (delays, _) = compensation(program, &order, module_latency);
        let ordered_ids: HashMap<&str, usize> = order.iter().enumerate().map(|(position, index)| (program.strips[*index].id.as_str(), position)).collect();
        let mut parts: Vec<Option<StripParts>> = parts.into_iter().map(Some).collect();
        let mut aux_channels: Vec<u16> = Vec::new();
        let mut strips = Vec::with_capacity(order.len());
        for &index in &order {
            let spec = &program.strips[index];
            let part = parts[index].take().ok_or("mix strip parts missing")?;
            let mut route_delays = delays[index].iter().copied();
            let mut route = |target: &Target| -> Result<Route, String> {
                let target = target_index(target, &ordered_ids)?;
                if let RouteTarget::Device(channel) = target {
                    if !aux_channels.contains(&channel) {
                        aux_channels.push(channel);
                    }
                }
                let frames = route_delays.next().unwrap_or(0);
                Ok(Route { target, delay: (frames > 0).then(|| DelayLine::new(frames)) })
            };
            let mut chain = Vec::with_capacity(spec.chain.len());
            for (module, cell) in spec.chain.iter().zip(part.cells) {
                let key_source = module.text("sidechain_strip_id").and_then(|id| ordered_ids.get(id).copied());
                let send = module.target.as_ref().map(&mut route).transpose()?;
                chain.push(ChainStep { cell, route: send, key_source });
            }
            let output = match &spec.output {
                Some(target) => Some(route(target)?),
                None => {
                    route_delays.next();
                    None
                }
            };
            strips.push(StripRuntime {
                id: spec.id.clone(),
                capture: part.capture,
                live: part.live,
                meter: part.meter,
                chain,
                output,
                output_enabled: spec.output_enabled,
                muted: spec.muted,
                mute_gain: SmoothedGain::new(if spec.muted { 0.0 } else { 1.0 }),
                inbox: vec![Frame::ZERO; MAX_BLOCK],
                work: vec![Frame::ZERO; MAX_BLOCK],
                post: vec![Frame::ZERO; MAX_BLOCK],
                scratch: vec![Frame::ZERO; MAX_BLOCK],
            });
        }
        Ok(Graph {
            strips,
            main: vec![Frame::ZERO; MAX_BLOCK],
            aux: aux_channels.into_iter().map(|channel| (channel, vec![Frame::ZERO; MAX_BLOCK])).collect(),
        })
    }

    fn deliver(route: &mut Route, signal: &mut [Frame], later: &mut [StripRuntime], first_later: usize, main: &mut [Frame], aux: &mut [(u16, Vec<Frame>)]) {
        if let Some(delay) = route.delay.as_mut() {
            delay.process(signal);
        }
        let destination: &mut [Frame] = match route.target {
            RouteTarget::Main => main,
            RouteTarget::Strip(position) => &mut later[position - first_later].inbox[..signal.len()],
            RouteTarget::Device(channel) => match aux.iter_mut().find(|(candidate, _)| *candidate == channel) {
                Some((_, buffer)) => &mut buffer[..signal.len()],
                None => return,
            },
        };
        for (out, input) in destination.iter_mut().zip(signal.iter()) {
            *out += *input;
        }
    }

    // Runs one block of `frames` frames and leaves the main mix in `self.main`.
    pub fn process(&mut self, frames: usize, dt: f64, info: &Info) {
        let frames = frames.min(MAX_BLOCK);
        self.main[..frames].fill(Frame::ZERO);
        for (_, buffer) in &mut self.aux {
            buffer[..frames].fill(Frame::ZERO);
        }
        for position in 0..self.strips.len() {
            let (done, rest) = self.strips.split_at_mut(position);
            let (current, later) = rest.split_first_mut().expect("strip at position");
            let StripRuntime { capture, live, chain, output, output_enabled, muted, mute_gain, inbox, work, post, scratch, meter, .. } = current;
            let work = &mut work[..frames];
            // A live input replaces the track's voices as the strip's source.
            match live {
                Some(live) => live.pull(work),
                None => capture.take_into(work),
            }
            for (out, input) in work.iter_mut().zip(inbox[..frames].iter()) {
                *out += *input;
            }
            inbox[..frames].fill(Frame::ZERO);
            mute_gain.apply(work, if *muted { 0.0 } else { 1.0 });
            for step in chain.iter_mut() {
                let Ok(mut module) = step.cell.try_lock() else { continue };
                if module.is_send() {
                    if let Some(route) = step.route.as_mut() {
                        let share = &mut scratch[..frames];
                        share.fill(Frame::ZERO);
                        module.send_into(work, share);
                        Self::deliver(route, share, later, position + 1, &mut self.main, &mut self.aux);
                    }
                    continue;
                }
                let key = step.key_source.map(|source| &done[source].post[..frames]);
                module.process(work, dt, info, key);
            }
            post[..frames].copy_from_slice(work);
            meter.record(dsp::peak(work), dsp::rms(work));
            if *output_enabled {
                if let Some(route) = output.as_mut() {
                    Self::deliver(route, work, later, position + 1, &mut self.main, &mut self.aux);
                }
            }
        }
    }
}
