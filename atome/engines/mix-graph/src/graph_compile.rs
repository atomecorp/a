// Compiling a program into a graph (graph.rs): order, loops, keys, IN
// sources, routes with their compensation and channel maps, widths and
// modulation. Every refusal is explicit: a port a module lacks, a key on a
// module that takes none, an IN without a source, a width a strip cannot
// have, a key or an IN across more than two channels, a route between widths
// with no map, an output channel the device lacks, a modulation of something
// that is not a modulatable parameter.

use crate::dsp::{DelayLine, SmoothedGain};
use crate::graph::{
    ChainStep, Graph, Lane, MAX_BLOCK, MixIn, RETURN_FRAMES, StepModule, StripParts, StripRuntime,
    compensation, dependency_order,
};
use crate::graph_order::{Layout, ports_of, strip_routes};
use crate::modulation::Modulation;
use crate::program::{ModuleSpec, Program, Target};
use crate::return_ring::ReturnRing;
use crate::route_delivery::{Route, RouteTarget};
use crate::source_bus::Feeds;
use crate::wide::{ChannelMap, Wide, check_width, pairs_of, plan_map};
use kira::Frame;
use std::collections::HashMap;

// A key, a tap or an IN carries one pair: at most a stereo strip.
fn narrow(what: &str, strip: &str, channels: usize) -> Result<(), String> {
    match channels <= 2 {
        true => Ok(()),
        false => Err(format!(
            "{what}: strip {strip} has {channels} channels; a key or an IN reads a mono or stereo strip"
        )),
    }
}

impl Graph {
    // `output_channels`: the channels the output device has (Outputs routes).
    pub fn compile(
        program: &Program,
        parts: Vec<StripParts>,
        feeds: Feeds,
        module_latency: &dyn Fn(&ModuleSpec) -> usize,
        output_channels: usize,
    ) -> Result<Graph, String> {
        let layout = Layout::new(program)?;
        let order = dependency_order(program)?;
        let delays = compensation(program, &order, module_latency)?;
        let count = program.strips.len();
        let widths = program
            .strips
            .iter()
            .map(|strip| check_width(&strip.id, strip.channels))
            .collect::<Result<Vec<usize>, String>>()?;
        let mut position = vec![0usize; count];
        for (at, index) in order.iter().enumerate() {
            position[*index] = at;
        }
        let mut modulation = Modulation::compile(program, &layout, &position)?;
        // Loops: returns per strip reached backwards, one lane per key.
        let mut rings: Vec<ReturnRing> = Vec::new();
        let mut inbox_return: Vec<Option<usize>> = vec![None; count];
        let mut lanes: Vec<Vec<Frame>> = Vec::new();
        let mut keys: HashMap<(usize, usize), Lane> = HashMap::new();
        let mut mixes: HashMap<(usize, usize), MixIn> = HashMap::new();
        let mut taps: HashMap<(usize, usize), Vec<(usize, Lane)>> = HashMap::new();
        let mut post_taps: Vec<Vec<Lane>> = vec![Vec::new(); count];
        let mut lane = |forward: bool, rings: &mut Vec<ReturnRing>| match forward {
            true => {
                lanes.push(vec![Frame::ZERO; MAX_BLOCK]);
                Lane::Direct(lanes.len() - 1)
            }
            false => {
                rings.push(ReturnRing::new());
                Lane::Return(rings.len() - 1)
            }
        };
        for (index, strip) in program.strips.iter().enumerate() {
            for (step, module) in strip.chain.iter().enumerate() {
                for port in &module.outputs {
                    if port.port >= ports_of(module) {
                        return Err(format!(
                            "mix module {} has no port {}",
                            module.id, port.port
                        ));
                    }
                }
                if (module.kind == "input") != module.source.is_some() {
                    return Err(format!(
                        "mix module {}: an IN module and only it reads a source",
                        module.id
                    ));
                }
                if let Some(source) = &module.source {
                    narrow(&format!("IN {}", module.id), &strip.id, widths[index])?;
                    let mix = match (layout.mix_source(source)?, feeds.module_bus(source)) {
                        (Some(from), _) => {
                            narrow(
                                &format!("IN {}", module.id),
                                &program.strips[from].id,
                                widths[from],
                            )?;
                            let at = lane(position[from] < position[index], &mut rings);
                            post_taps[from].push(at);
                            MixIn::Lane(at)
                        }
                        (None, Some((feed, output))) => MixIn::Bus(feed, output),
                        (None, None) => {
                            return Err(format!("mix module {} has no source", module.id));
                        }
                    };
                    mixes.insert((index, step), mix);
                }
                let Some(key) = &module.key else { continue };
                if module.kind != crate::dsp_module::MODULE_TYPE
                    || !crate::dsp_module::kind_of(module)?.takes_key()
                {
                    return Err(format!("mix module {} takes no key", module.id));
                }
                let (from, port) = layout.key_source(key)?;
                narrow(
                    &format!("key of {}", module.id),
                    &program.strips[from].id,
                    widths[from],
                )?;
                let forward = position[from] < position[index]
                    || (from == index && port.is_some_and(|(source, _)| source < step));
                let at = lane(forward, &mut rings);
                keys.insert((index, step), at);
                match port {
                    Some((source, port)) => {
                        let source_spec = &program.strips[from].chain[source];
                        if port >= ports_of(source_spec) {
                            return Err(format!(
                                "mix module {} has no port {port}",
                                source_spec.id
                            ));
                        }
                        taps.entry((from, source)).or_default().push((port, at));
                    }
                    None => post_taps[from].push(at),
                }
            }
            for (_, target) in strip_routes(strip) {
                if let Some(to) = target
                    .map(|target| layout.target(target))
                    .transpose()?
                    .flatten()
                    && position[to] <= position[index]
                    && inbox_return[to].is_none()
                {
                    inbox_return[to] = Some(rings.len());
                    for _ in 0..pairs_of(widths[to]) {
                        rings.push(ReturnRing::new());
                    }
                }
            }
        }
        let mut parts: Vec<Option<StripParts>> = parts.into_iter().map(Some).collect();
        let mut aux_channels: Vec<u16> = Vec::new();
        let mut strips = Vec::with_capacity(count);
        for &index in &order {
            let spec = &program.strips[index];
            let channels = widths[index];
            let pairs = pairs_of(channels);
            let part = parts[index].take().ok_or("mix strip parts missing")?;
            let mut route_delays = delays.delays[index].iter().copied();
            let mut route = |what: &str,
                             target: Option<&Target>|
             -> Result<Option<Route>, String> {
                let frames = route_delays.next().unwrap_or(0);
                let Some(target) = target else {
                    return Ok(None);
                };
                let what = format!("mix route {what} of strip {}", spec.id);
                let listed = target.channel_map();
                let (target, destination) = match target {
                    Target::Main { mono, .. } => (RouteTarget::Main(*mono), Some(2)),
                    Target::Device { channel, mono, .. } => {
                        if !aux_channels.contains(channel) {
                            aux_channels.push(*channel);
                        }
                        (RouteTarget::Device(*channel, *mono), Some(2))
                    }
                    Target::Strip { id, .. } => {
                        let to = layout.strip(id)?;
                        let target = match position[to] > position[index] {
                            true => RouteTarget::Strip(position[to]),
                            false => RouteTarget::Return(
                                inbox_return[to].expect("a return for every backward route"),
                            ),
                        };
                        (target, Some(widths[to]))
                    }
                    Target::Outputs { channels: listed } => {
                        if let Some(channel) = listed
                            .iter()
                            .find(|channel| usize::from(**channel) >= output_channels)
                        {
                            return Err(format!(
                                "{what}: output channel {} is not available, the output device has {output_channels}",
                                channel + 1
                            ));
                        }
                        for pair in listed
                            .iter()
                            .map(|channel| channel / 2)
                            .filter(|pair| *pair > 0)
                        {
                            if !aux_channels.contains(&pair) {
                                aux_channels.push(pair);
                            }
                        }
                        (RouteTarget::Outputs, None)
                    }
                };
                let side = match target {
                    RouteTarget::Main(side) | RouteTarget::Device(_, side) => side,
                    _ => None,
                };
                let map = match (side, channels) {
                    (None, _) => plan_map(&what, channels, destination, listed)?,
                    (Some(_), 2) => ChannelMap::Same,
                    (Some(side), 1) => ChannelMap::Each(vec![(0, u16::from(side.min(1)))]),
                    (Some(_), _) => {
                        return Err(format!(
                            "{what}: a mono output takes a mono or stereo signal, not {channels} channels"
                        ));
                    }
                };
                let staging = match &map {
                    ChannelMap::Same => None,
                    ChannelMap::Each(pairs) => {
                        let reach = match destination {
                            Some(width) => width,
                            None => pairs
                                .iter()
                                .map(|(_, to)| usize::from(*to) + 1)
                                .max()
                                .unwrap_or(2),
                        };
                        Some(Wide::new(pairs_of(reach)))
                    }
                };
                Ok(Some(Route {
                    target,
                    delay: match frames {
                        0 => Vec::new(),
                        frames => (0..pairs).map(|_| DelayLine::new(frames)).collect(),
                    },
                    map,
                    source_channels: channels,
                    staging,
                    mono_destination: destination == Some(1),
                }))
            };
            let mut chain = Vec::with_capacity(spec.chain.len());
            for (step, (module, built)) in spec.chain.iter().zip(part.modules).enumerate() {
                let send = match module.kind.as_str() {
                    "send" => route(&format!("send {}", module.id), module.target.as_ref())?,
                    _ => None,
                };
                let mut ports = Vec::with_capacity(module.outputs.len());
                let mut routed = vec![false; ports_of(module)];
                for port in &module.outputs {
                    let what = format!("port {} of {}", port.port, module.id);
                    ports.push((
                        port.port,
                        route(&what, Some(&port.target))?.expect("a port route has a target"),
                    ));
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
                    controls_out: modulation.writes.remove(&(index, step)).unwrap_or_default(),
                    mods: modulation.reads.remove(&(index, step)).unwrap_or_default(),
                });
            }
            let output = route("output", spec.output.as_ref())?;
            strips.push(StripRuntime {
                id: spec.id.clone(),
                capture: part.capture,
                source: part.source,
                meter: part.meter,
                chain,
                output,
                output_enabled: spec.output_enabled,
                muted: spec.muted,
                channels,
                mute_gain: (0..pairs)
                    .map(|_| SmoothedGain::new(if spec.muted { 0.0 } else { 1.0 }))
                    .collect(),
                inbox: Wide::new(pairs),
                inbox_return: inbox_return[index],
                post_taps: std::mem::take(&mut post_taps[index]),
                work: Wide::new(pairs),
                scratch: Wide::new(pairs),
                key: vec![Frame::ZERO; MAX_BLOCK],
            });
        }
        let chunk = if rings.is_empty() {
            MAX_BLOCK
        } else {
            RETURN_FRAMES
        };
        Ok(Graph {
            output_latency: delays.output_latency,
            strips,
            main: vec![Frame::ZERO; MAX_BLOCK],
            aux: aux_channels
                .into_iter()
                .map(|channel| (channel, vec![Frame::ZERO; MAX_BLOCK]))
                .collect(),
            feeds: feeds.buses,
            lanes,
            rings,
            controls: modulation.lanes,
            clock: 0,
            chunk,
            automation: Default::default(),
        })
    }
}
