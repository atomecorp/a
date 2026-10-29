// Compiled mix graph: strips in dependency order, each with its module chain,
// its routes (sends, routed ports of a split, output) and their latency-
// compensation delays, plus the key lanes that carry sidechains. A route or a
// key reaching a strip already processed closes a loop, which is allowed
// (D27): it goes through a Return that delivers it RETURN_FRAMES later. An IN
// module (D-S3) mixes a source into its chain at its level: a live input or an
// instrument output from the chunk's source buses (source_bus.rs), or a
// strip's post-chain signal on a lane like a key's — the same chunk when that
// strip runs earlier, else through a return (a loop through IN is allowed).

use crate::dsp::{self, DelayLine, SmoothedGain};
use crate::module::ModuleBox;
pub use crate::graph_order::{compensation, dependency_order};
use crate::graph_order::{ports_of, strip_routes, Layout};
use crate::program::{ModuleSpec, Program, Target};
use crate::source_bus::{Feeds, SourceBus, StripSource};
use crate::return_ring::ReturnRing;
use crate::shared::{CaptureSlot, StripMeter};
use kira::Frame;
use std::collections::HashMap;
use std::sync::Arc;

pub const MAX_BLOCK: usize = 4096;
// A loop closes through this fixed delay; a graph with a loop renders in
// chunks no longer than it, so a return always lands in a later chunk.
pub const RETURN_FRAMES: usize = 128;
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum RouteTarget {
    Main,
    Strip(usize),
    Device(u16),
    Return(usize),
}

pub struct Route {
    pub target: RouteTarget,
    pub delay: Option<DelayLine>,
}

// Where a key travels: a buffer filled earlier in the same chunk, or a return.
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Lane {
    Direct(usize),
    Return(usize),
}

// What an IN module reads: a source bus (feed, output), or a strip on a lane.
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum MixIn {
    Bus(usize, usize),
    Lane(Lane),
}

pub struct ChainStep {
    pub module_id: String,
    pub module: Option<ModuleBox>,
    // Where the module runs in the graph before this one; taken on the swap.
    pub adopt: Option<(usize, usize)>,
    pub send: Option<Route>,
    // Routed ports (a port may go to several places) and which ports leave.
    pub ports: Vec<(usize, Route)>,
    pub routed: Vec<bool>,
    // Ports read as a key elsewhere (port 0 is the module's own output).
    pub taps: Vec<(usize, Lane)>,
    pub key: Option<Lane>,
    pub mix: Option<MixIn>,
}

impl ChainStep {
    fn splits(&self) -> bool {
        !self.ports.is_empty() || self.taps.iter().any(|(port, _)| *port > 0)
    }
}

pub struct StripRuntime {
    pub id: String,
    pub capture: Arc<CaptureSlot>,
    pub source: StripSource,
    pub meter: Arc<StripMeter>,
    pub chain: Vec<ChainStep>,
    pub output: Option<Route>,
    pub output_enabled: bool,
    pub muted: bool,
    mute_gain: SmoothedGain,
    inbox: Vec<Frame>,
    inbox_return: Option<usize>,
    // Taps of the strip's post-chain signal (a strip chosen as a key).
    post_taps: Vec<Lane>,
    work: Vec<Frame>,
    scratch: Vec<Frame>,
    key: Vec<Frame>,
}

pub struct Graph {
    pub strips: Vec<StripRuntime>,
    pub main: Vec<Frame>,
    pub aux: Vec<(u16, Vec<Frame>)>,
    feeds: Vec<SourceBus>,
    lanes: Vec<Vec<Frame>>,
    rings: Vec<ReturnRing>,
    clock: usize,
    chunk: usize,
    pub automation: crate::automation::Automation,
}

pub enum StepModule {
    Fresh(ModuleBox),
    Adopt(usize, usize),
}

pub struct StripParts {
    pub id: String,
    pub capture: Arc<CaptureSlot>,
    pub source: StripSource,
    pub meter: Arc<StripMeter>,
    pub modules: Vec<StepModule>,
}

impl Graph {
    pub fn compile(program: &Program, parts: Vec<StripParts>, feeds: Feeds, module_latency: &dyn Fn(&ModuleSpec) -> usize) -> Result<Graph, String> {
        let layout = Layout::new(program)?;
        let order = dependency_order(program)?;
        let delays = compensation(program, &order, module_latency)?;
        let count = program.strips.len();
        let mut position = vec![0usize; count];
        for (at, index) in order.iter().enumerate() {
            position[*index] = at;
        }
        // Loops: one return per strip reached backwards, one lane per key.
        let mut rings: Vec<ReturnRing> = Vec::new();
        let mut inbox_return: Vec<Option<usize>> = vec![None; count];
        let mut lanes: Vec<Vec<Frame>> = Vec::new();
        let mut keys: HashMap<(usize, usize), Lane> = HashMap::new();
        let mut mixes: HashMap<(usize, usize), MixIn> = HashMap::new();
        let mut taps: HashMap<(usize, usize), Vec<(usize, Lane)>> = HashMap::new();
        let mut post_taps: Vec<Vec<Lane>> = vec![Vec::new(); count];
        for (index, strip) in program.strips.iter().enumerate() {
            for (step, module) in strip.chain.iter().enumerate() {
                for port in &module.outputs {
                    if port.port >= ports_of(module) {
                        return Err(format!("mix module {} has no port {}", module.id, port.port));
                    }
                }
                if (module.kind == "input") != module.source.is_some() {
                    return Err(format!("mix module {}: an IN module and only it reads a source", module.id));
                }
                if let Some(source) = &module.source {
                    let mix = match (layout.mix_source(source)?, feeds.module_bus(source)) {
                        (Some(from), _) => {
                            let lane = if position[from] < position[index] {
                                lanes.push(vec![Frame::ZERO; MAX_BLOCK]);
                                Lane::Direct(lanes.len() - 1)
                            } else {
                                rings.push(ReturnRing::new());
                                Lane::Return(rings.len() - 1)
                            };
                            post_taps[from].push(lane);
                            MixIn::Lane(lane)
                        }
                        (None, Some((feed, output))) => MixIn::Bus(feed, output),
                        (None, None) => return Err(format!("mix module {} has no source", module.id)),
                    };
                    mixes.insert((index, step), mix);
                }
                let Some(key) = &module.key else { continue };
                if module.kind != crate::dsp_module::MODULE_TYPE || !crate::dsp_module::kind_of(module)?.takes_key() {
                    return Err(format!("mix module {} takes no key", module.id));
                }
                let (from, port) = layout.key_source(key)?;
                let forward = position[from] < position[index] || (from == index && port.is_some_and(|(source, _)| source < step));
                let lane = if forward {
                    lanes.push(vec![Frame::ZERO; MAX_BLOCK]);
                    Lane::Direct(lanes.len() - 1)
                } else {
                    rings.push(ReturnRing::new());
                    Lane::Return(rings.len() - 1)
                };
                keys.insert((index, step), lane);
                match port {
                    Some((source, port)) => {
                        let source_spec = &program.strips[from].chain[source];
                        if port >= ports_of(source_spec) {
                            return Err(format!("mix module {} has no port {port}", source_spec.id));
                        }
                        taps.entry((from, source)).or_default().push((port, lane));
                    }
                    None => post_taps[from].push(lane),
                }
            }
            for (_, target) in strip_routes(strip) {
                if let Some(to) = target.map(|target| layout.target(target)).transpose()?.flatten() {
                    if position[to] <= position[index] && inbox_return[to].is_none() {
                        rings.push(ReturnRing::new());
                        inbox_return[to] = Some(rings.len() - 1);
                    }
                }
            }
        }
        let mut parts: Vec<Option<StripParts>> = parts.into_iter().map(Some).collect();
        let mut aux_channels: Vec<u16> = Vec::new();
        let mut strips = Vec::with_capacity(count);
        for &index in &order {
            let spec = &program.strips[index];
            let part = parts[index].take().ok_or("mix strip parts missing")?;
            let mut route_delays = delays[index].iter().copied();
            let mut route = |target: Option<&Target>| -> Result<Option<Route>, String> {
                let frames = route_delays.next().unwrap_or(0);
                let Some(target) = target else { return Ok(None) };
                let target = match target {
                    Target::Main => RouteTarget::Main,
                    Target::Device { channel } => {
                        if !aux_channels.contains(channel) {
                            aux_channels.push(*channel);
                        }
                        RouteTarget::Device(*channel)
                    }
                    Target::Strip { id } => {
                        let to = layout.strip(id)?;
                        match position[to] > position[index] {
                            true => RouteTarget::Strip(position[to]),
                            false => RouteTarget::Return(inbox_return[to].expect("a return for every backward route")),
                        }
                    }
                };
                Ok(Some(Route { target, delay: (frames > 0).then(|| DelayLine::new(frames)) }))
            };
            let mut chain = Vec::with_capacity(spec.chain.len());
            for (step, (module, built)) in spec.chain.iter().zip(part.modules).enumerate() {
                let send = match module.kind.as_str() {
                    "send" => route(module.target.as_ref())?,
                    _ => None,
                };
                let mut ports = Vec::with_capacity(module.outputs.len());
                let mut routed = vec![false; ports_of(module)];
                for port in &module.outputs {
                    ports.push((port.port, route(Some(&port.target))?.expect("a port route has a target")));
                    routed[port.port] = true;
                }
                let (module_box, adopt) = match built {
                    StepModule::Fresh(module) => (Some(module), None),
                    StepModule::Adopt(strip, at) => (None, Some((strip, at))),
                };
                chain.push(ChainStep {
                    module_id: module.id.clone(),
                    module: module_box,
                    adopt,
                    send,
                    ports,
                    routed,
                    taps: taps.remove(&(index, step)).unwrap_or_default(),
                    key: keys.get(&(index, step)).copied(),
                    mix: mixes.get(&(index, step)).copied(),
                });
            }
            let output = route(spec.output.as_ref())?;
            strips.push(StripRuntime {
                id: spec.id.clone(),
                capture: part.capture,
                source: part.source,
                meter: part.meter,
                chain,
                output,
                output_enabled: spec.output_enabled,
                muted: spec.muted,
                mute_gain: SmoothedGain::new(if spec.muted { 0.0 } else { 1.0 }),
                inbox: vec![Frame::ZERO; MAX_BLOCK],
                inbox_return: inbox_return[index],
                post_taps: std::mem::take(&mut post_taps[index]),
                work: vec![Frame::ZERO; MAX_BLOCK],
                scratch: vec![Frame::ZERO; MAX_BLOCK],
                key: vec![Frame::ZERO; MAX_BLOCK],
            });
        }
        let chunk = if rings.is_empty() { MAX_BLOCK } else { RETURN_FRAMES };
        Ok(Graph {
            strips,
            main: vec![Frame::ZERO; MAX_BLOCK],
            aux: aux_channels.into_iter().map(|channel| (channel, vec![Frame::ZERO; MAX_BLOCK])).collect(),
            feeds: feeds.buses,
            lanes,
            rings,
            clock: 0,
            chunk,
            automation: Default::default(),
        })
    }

    // Render thread: takes over the modules the previous graph ran, so their
    // state survives the edit. Moves boxes only, never allocates.
    pub fn adopt(&mut self, previous: &mut Graph) {
        for strip in &mut self.strips {
            for step in &mut strip.chain {
                if let Some((at, index)) = step.adopt.take() {
                    step.module = previous.strips.get_mut(at).and_then(|strip| strip.chain.get_mut(index)).and_then(|step| step.module.take());
                }
            }
        }
    }

    // Where each module sits (position, step) once this graph runs.
    pub fn locations(&self) -> impl Iterator<Item = (&str, (usize, usize))> {
        self.strips.iter().enumerate().flat_map(|(at, strip)| strip.chain.iter().enumerate().map(move |(index, step)| (step.module_id.as_str(), (at, index))))
    }

    // Control thread: the fresh modules of a graph the render thread never took.
    pub fn take_fresh(&mut self) -> Vec<(String, ModuleBox)> {
        let mut fresh = Vec::new();
        for strip in &mut self.strips {
            for step in &mut strip.chain {
                if step.adopt.is_none() {
                    if let Some(module) = step.module.take() {
                        fresh.push((step.module_id.clone(), module));
                    }
                }
            }
        }
        fresh
    }

    fn write_lane(lanes: &mut [Vec<Frame>], rings: &mut [ReturnRing], clock: usize, lane: Lane, signal: &[Frame]) {
        match lane {
            Lane::Direct(index) => lanes[index][..signal.len()].copy_from_slice(signal),
            Lane::Return(index) => rings[index].add(clock, signal),
        }
    }

    #[allow(clippy::too_many_arguments)]
    fn deliver(route: &mut Route, signal: &mut [Frame], later: &mut [StripRuntime], first_later: usize, main: &mut [Frame], aux: &mut [(u16, Vec<Frame>)], offset: usize, rings: &mut [ReturnRing], clock: usize) {
        if let Some(delay) = route.delay.as_mut() {
            delay.process(signal);
        }
        let frames = signal.len();
        let destination: &mut [Frame] = match route.target {
            RouteTarget::Main => main,
            RouteTarget::Strip(position) => &mut later[position - first_later].inbox[..frames],
            RouteTarget::Device(channel) => match aux.iter_mut().find(|(candidate, _)| *candidate == channel) {
                Some((_, buffer)) => &mut buffer[offset..offset + frames],
                None => return,
            },
            RouteTarget::Return(index) => return rings[index].add(clock, signal),
        };
        for (out, input) in destination.iter_mut().zip(signal.iter()) {
            *out += *input;
        }
    }

    // Runs one block of `frames` frames and leaves the main mix in `self.main`.
    pub fn process(&mut self, frames: usize) {
        let frames = frames.min(MAX_BLOCK);
        self.main[..frames].fill(Frame::ZERO);
        for (_, buffer) in &mut self.aux {
            buffer[..frames].fill(Frame::ZERO);
        }
        let mut offset = 0;
        while offset < frames {
            let length = (frames - offset).min(self.chunk);
            self.process_chunk(offset, length);
            offset += length;
            self.clock = self.clock.wrapping_add(length);
        }
        for strip in &self.strips {
            strip.capture.finish();
        }
    }

    fn process_chunk(&mut self, offset: usize, frames: usize) {
        let Graph { strips, main, aux, feeds, lanes, rings, clock, .. } = self;
        let clock = *clock;
        let main = &mut main[offset..offset + frames];
        for feed in feeds.iter_mut() {
            feed.fill(frames);
        }
        for position in 0..strips.len() {
            let (current, later) = strips[position..].split_first_mut().expect("strip at position");
            let StripRuntime { capture, source, chain, output, output_enabled, muted, mute_gain, inbox, inbox_return, post_taps, work, scratch, key, meter, .. } = current;
            let work = &mut work[..frames];
            source.pull(capture, offset, feeds, work);
            for (out, input) in work.iter_mut().zip(inbox[..frames].iter()) {
                *out += *input;
            }
            inbox[..frames].fill(Frame::ZERO);
            if let Some(ring) = inbox_return {
                rings[*ring].take(clock, work);
            }
            mute_gain.apply(work, if *muted { 0.0 } else { 1.0 });
            for step in chain.iter_mut() {
                let splits = step.splits();
                let Some(module) = step.module.as_mut() else { continue };
                let share = &mut scratch[..frames];
                if module.is_send() {
                    if let Some(route) = step.send.as_mut() {
                        share.fill(Frame::ZERO);
                        module.send_into(work, share);
                        Self::deliver(route, share, later, position + 1, main, aux, offset, rings, clock);
                    }
                    continue;
                }
                if let Some(mix) = step.mix {
                    match mix {
                        MixIn::Bus(feed, output) => share.copy_from_slice(&feeds[feed].buses[output][..frames]),
                        MixIn::Lane(Lane::Direct(index)) => share.copy_from_slice(&lanes[index][..frames]),
                        MixIn::Lane(Lane::Return(index)) => {
                            share.fill(Frame::ZERO);
                            rings[index].take(clock, share);
                        }
                    }
                    module.send_into(share, work);
                    for (_, lane) in &step.taps {
                        Self::write_lane(lanes, rings, clock, *lane, work);
                    }
                    continue;
                }
                let key_signal: Option<&[Frame]> = match step.key {
                    Some(Lane::Direct(index)) => Some(&lanes[index][..frames]),
                    Some(Lane::Return(index)) => {
                        let key = &mut key[..frames];
                        key.fill(Frame::ZERO);
                        rings[index].take(clock, key);
                        Some(key)
                    }
                    None => None,
                };
                if !splits {
                    module.process(work, key_signal);
                    for (_, lane) in &step.taps {
                        Self::write_lane(lanes, rings, clock, *lane, work);
                    }
                    continue;
                }
                let split = module.process_split(work, key_signal);
                let port_signal = |port: usize, out: &mut [Frame], work: &[Frame]| {
                    match port {
                        0 => out.copy_from_slice(work),
                        _ => {
                            out.fill(Frame::ZERO);
                            if split {
                                module.add_port(port, out);
                            }
                        }
                    }
                };
                for (port, lane) in &step.taps {
                    port_signal(*port, share, work);
                    Self::write_lane(lanes, rings, clock, *lane, share);
                }
                for (port, route) in step.ports.iter_mut() {
                    port_signal(*port, share, work);
                    Self::deliver(route, share, later, position + 1, main, aux, offset, rings, clock);
                }
                // What stays in the strip: every port not sent elsewhere.
                if step.routed[0] {
                    work.fill(Frame::ZERO);
                }
                if split {
                    for (port, routed) in step.routed.iter().enumerate().skip(1) {
                        if !routed {
                            module.add_port(port, work);
                        }
                    }
                }
            }
            for lane in post_taps.iter() {
                Self::write_lane(lanes, rings, clock, *lane, work);
            }
            meter.record(dsp::peak(work), dsp::rms(work));
            if *output_enabled {
                if let Some(route) = output.as_mut() {
                    Self::deliver(route, work, later, position + 1, main, aux, offset, rings, clock);
                }
            }
        }
    }
}
