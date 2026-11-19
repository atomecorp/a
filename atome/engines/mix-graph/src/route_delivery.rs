// Where a strip's route delivers its signal (graph.rs): the main mix, another strip's inbox (IN), a device's channel
// pair, physical output channels one by one, or a return closing a loop — each after its compensation delay. An OUT
// on mono 1–4 (R-183) sums the pair to one channel, (L+R)/2 on the left or the right, the other one left untouched.
// A route of another width lays its channels through its map (wide.rs) into a staging chunk first.

use crate::dsp::DelayLine;
use crate::graph::StripRuntime;
use crate::return_ring::ReturnRing;
use crate::wide::{ChannelMap, Wide, scatter};
use kira::Frame;

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum RouteTarget {
    Main(Option<u8>), // `mono`: one channel of the pair (`add_into`)
    Strip(usize),
    Device(u16, Option<u8>),
    // The first of the destination's returns, one per pair.
    Return(usize),
    // Physical channels: pair 0 is the main mix, pair k the device's pair k.
    Outputs,
}

pub struct Route {
    pub target: RouteTarget,
    // One per pair of the signal, when the route is compensated.
    pub delay: Vec<DelayLine>,
    pub map: ChannelMap,
    pub source_channels: usize,
    // The destination's layout when the map is not `Same`.
    pub staging: Option<Wide>,
    pub mono_destination: bool,
}

#[allow(clippy::too_many_arguments)]
pub(crate) fn deliver(
    route: &mut Route,
    signal: &mut [Frame],
    frames: usize,
    later: &mut [StripRuntime],
    first_later: usize,
    main: &mut [Frame],
    aux: &mut [(u16, Vec<Frame>)],
    offset: usize,
    rings: &mut [ReturnRing],
    clock: usize,
) {
    for (pair, delay) in route.delay.iter_mut().enumerate() {
        delay.process(&mut signal[pair * frames..(pair + 1) * frames]);
    }
    let (data, pairs): (&[Frame], usize) = match (&route.map, route.staging.as_mut()) {
        (ChannelMap::Each(pairs), Some(staging)) => {
            let count = staging.pairs;
            let span = staging.span_mut(frames);
            scatter(
                pairs,
                signal,
                route.source_channels,
                frames,
                span,
                route.mono_destination,
            );
            (span, count)
        }
        _ => {
            let count = signal.len() / frames;
            (signal, count)
        }
    };
    let lane = |pair: usize| &data[pair * frames..(pair + 1) * frames];
    // A mapped route already laid its channels: the pair goes as it is.
    let same = route.map == ChannelMap::Same;
    match route.target {
        RouteTarget::Main(mono) => add_into(main, lane(0), mono.filter(|_| same)),
        RouteTarget::Device(channel, mono) => {
            let mono = mono.filter(|_| same);
            if let Some((_, buffer)) = aux.iter_mut().find(|(candidate, _)| *candidate == channel) {
                add_into(&mut buffer[offset..offset + frames], lane(0), mono);
            }
        }
        RouteTarget::Strip(position) => {
            let inbox = later[position - first_later].inbox.span_mut(frames);
            for pair in 0..pairs {
                add_into(
                    &mut inbox[pair * frames..(pair + 1) * frames],
                    lane(pair),
                    None,
                );
            }
        }
        RouteTarget::Return(first) => {
            for pair in 0..pairs {
                rings[first + pair].add(clock, lane(pair));
            }
        }
        RouteTarget::Outputs => {
            add_into(main, lane(0), None);
            for pair in 1..pairs {
                if let Some((_, buffer)) = aux
                    .iter_mut()
                    .find(|(candidate, _)| usize::from(*candidate) == pair)
                {
                    add_into(&mut buffer[offset..offset + frames], lane(pair), None);
                }
            }
        }
    }
}

pub fn add_into(destination: &mut [Frame], signal: &[Frame], mono: Option<u8>) {
    let pairs = destination.iter_mut().zip(signal.iter());
    match mono {
        None => pairs.for_each(|(out, input)| *out += *input),
        Some(0) => pairs.for_each(|(out, input)| out.left += (input.left + input.right) * 0.5),
        Some(_) => pairs.for_each(|(out, input)| out.right += (input.left + input.right) * 0.5),
    }
}
