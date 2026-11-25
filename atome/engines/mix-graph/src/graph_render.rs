// Rendering a compiled graph (graph.rs), one chunk at a time. A graph with
// automation or modulation renders in control steps of CONTROL_FRAMES frames
// aligned on the rendered-frame clock, its automation evaluated at the start
// of each: the same program sounds the same whatever the host's block size.
// Without either, chunks stay as long as the block (or a loop's return).

use crate::automation::StripTransport;
use crate::automation::transport_at;
use crate::dsp;
use crate::freeze::FreezeSlot;
use crate::graph::{ChainStep, Graph, Lane, MAX_BLOCK, MixIn, StripRuntime};
use crate::load_meter::now_ns;
use crate::modulation::CONTROL_FRAMES;
use crate::return_ring::ReturnRing;
use crate::route_delivery::deliver;
use crate::source_bus::StripSource;
use crate::wide::Wide;
use crate::wide::pair_of;
use kira::Frame;

fn write_lane(
    lanes: &mut [Vec<Frame>],
    rings: &mut [ReturnRing],
    clock: usize,
    lane: Lane,
    signal: &[Frame],
) {
    match lane {
        Lane::Direct(index) => lanes[index][..signal.len()].copy_from_slice(signal),
        Lane::Return(index) => rings[index].add(clock, signal),
    }
}

// A frozen strip's stem blended into its first pair (freeze.rs), at the timeline position of each frame of the chunk.
fn blend_stem(
    freeze: &FreezeSlot,
    work: &mut Wide,
    transport: Option<&StripTransport>,
    frames: usize,
    at: u64,
    sample_rate: f64,
) {
    freeze.blend(pair_of(work.span_mut(frames), 0, frames), |index| {
        transport.and_then(|transport| transport.seconds_at(at + index as u64, sample_rate))
    });
}

impl Graph {
    fn stepped(&self) -> bool {
        !self.automation.is_empty() || !self.controls.is_empty()
    }

    // Runs one block of `frames` frames, the first being rendered frame
    // `frame`, and leaves the main mix in `self.main`.
    pub fn process(&mut self, frames: usize, frame: u64, sample_rate: f64) {
        let frames = frames.min(MAX_BLOCK);
        self.main[..frames].fill(Frame::ZERO);
        for (_, buffer) in &mut self.aux {
            buffer[..frames].fill(Frame::ZERO);
        }
        let stepped = self.stepped();
        let mut offset = 0;
        while offset < frames {
            let mut length = (frames - offset).min(self.chunk);
            if stepped {
                let at = frame + offset as u64;
                let into = (at % CONTROL_FRAMES as u64) as usize;
                length = length.min(CONTROL_FRAMES - into);
                // Evaluated on the step's first frame only, never where a block cuts a step.
                if into == 0 {
                    self.automation.run(at, sample_rate);
                }
            }
            self.process_chunk(offset, length, frame + offset as u64, sample_rate);
            offset += length;
            self.clock = self.clock.wrapping_add(length);
        }
        for strip in &self.strips {
            strip.capture.finish();
        }
    }

    // `at`: the chunk's first rendered frame, where its rhythm effects stand.
    fn process_chunk(&mut self, offset: usize, frames: usize, at: u64, sample_rate: f64) {
        let Graph {
            strips,
            main,
            aux,
            feeds,
            feed_live,
            lanes,
            rings,
            controls,
            clock,
            ..
        } = self;
        let clock = *clock;
        let main = &mut main[offset..offset + frames];
        // Each strip takes its stem's news; a source only frozen strips read rests (an instrument heard through
        // stems alone is not computed: freeze.rs).
        feed_live.fill(false);
        for strip in strips.iter_mut() {
            strip.freeze_chunk = strip.freeze.begin();
            if let StripSource::Bus { feed, .. } = strip.source
                && strip.freeze_chunk.skipped.is_none()
            {
                feed_live[feed] = true;
            }
            for step in &strip.chain {
                if let Some(MixIn::Bus(feed, _)) = step.mix {
                    feed_live[feed] = true;
                }
            }
        }
        for (feed, live) in feeds.iter_mut().zip(feed_live.iter()) {
            match live {
                true => feed.fill(frames),
                false => feed.rest(frames),
            }
        }
        for position in 0..strips.len() {
            let (current, later) = strips[position..]
                .split_first_mut()
                .expect("strip at position");
            let started = now_ns();
            let frozen = current.freeze_chunk;
            let pairs = current.work.pairs;
            {
                let StripRuntime {
                    capture,
                    source,
                    inbox,
                    inbox_return,
                    work,
                    channels,
                    ..
                } = &mut *current;
                let work = work.span_mut(frames);
                work.fill(Frame::ZERO);
                if frozen.skipped.is_none() {
                    source.pull(capture, offset, feeds, pair_of(work, 0, frames));
                }
                let inbox = inbox.span_mut(frames);
                for (out, input) in work.iter_mut().zip(inbox.iter()) {
                    *out += *input;
                }
                inbox.fill(Frame::ZERO);
                if let Some(first) = *inbox_return {
                    for pair in 0..pairs {
                        rings[first + pair].take(clock, pair_of(work, pair, frames));
                    }
                }
                if *channels == 1 {
                    dsp::apply_mono(pair_of(work, 0, frames));
                }
            }
            let transport = transport_at(current.transport.as_ref(), at, sample_rate);
            for (index, step) in current.chain.iter_mut().enumerate() {
                if let Some(replaced) = frozen.replaced {
                    if index == replaced {
                        blend_stem(
                            &current.freeze,
                            &mut current.work,
                            current.transport.as_ref(),
                            frames,
                            at,
                            sample_rate,
                        );
                    }
                    if index < replaced && frozen.skipped.is_some() {
                        continue;
                    }
                }
                let ChainStep {
                    module,
                    send,
                    ports,
                    routed,
                    taps,
                    key,
                    mix,
                    controls_out,
                    mods,
                    ..
                } = step;
                let splits = !ports.is_empty() || taps.iter().any(|(port, _)| *port > 0);
                let Some(module) = module.as_mut() else {
                    continue;
                };
                module.set_transport(&transport);
                for read in mods.iter_mut() {
                    read.compute(&module.controls, controls, clock, frames);
                }
                module.begin();
                let work = current.work.span_mut(frames);
                let share = current.scratch.span_mut(frames);
                if module.is_send() {
                    if let Some(route) = send.as_mut() {
                        share.fill(Frame::ZERO);
                        for pair in 0..pairs {
                            module.send_into(
                                pair,
                                &work[pair * frames..(pair + 1) * frames],
                                pair_of(share, pair, frames),
                                mods,
                            );
                        }
                        deliver(
                            route,
                            share,
                            frames,
                            later,
                            position + 1,
                            main,
                            aux,
                            offset,
                            rings,
                            clock,
                        );
                    }
                    module.finish(frames);
                    continue;
                }
                if let Some(mix) = *mix {
                    let share = pair_of(share, 0, frames);
                    match mix {
                        MixIn::Bus(feed, output) => {
                            share.copy_from_slice(&feeds[feed].buses[output][..frames])
                        }
                        MixIn::Lane(Lane::Direct(index)) => {
                            share.copy_from_slice(&lanes[index][..frames])
                        }
                        MixIn::Lane(Lane::Return(index)) => {
                            share.fill(Frame::ZERO);
                            rings[index].take(clock, share);
                        }
                    }
                    module.send_into(0, share, pair_of(work, 0, frames), mods);
                    for (_, lane) in taps.iter() {
                        write_lane(lanes, rings, clock, *lane, &work[..frames]);
                    }
                    module.finish(frames);
                    continue;
                }
                let key_signal: Option<&[Frame]> = match *key {
                    Some(Lane::Direct(index)) => Some(&lanes[index][..frames]),
                    Some(Lane::Return(index)) => {
                        let key = &mut current.key[..frames];
                        key.fill(Frame::ZERO);
                        rings[index].take(clock, key);
                        Some(key)
                    }
                    None => None,
                };
                if !splits {
                    for pair in 0..pairs {
                        module.process(pair, pair_of(work, pair, frames), key_signal, false, mods);
                    }
                    for (_, lane) in taps.iter() {
                        write_lane(lanes, rings, clock, *lane, &work[..frames]);
                    }
                } else {
                    let mut split = false;
                    for pair in 0..pairs {
                        split = module.process(
                            pair,
                            pair_of(work, pair, frames),
                            key_signal,
                            true,
                            mods,
                        );
                    }
                    let port_signal =
                        |pair: usize, port: usize, out: &mut [Frame], work: &[Frame]| match port {
                            0 => out.copy_from_slice(&work[pair * frames..(pair + 1) * frames]),
                            _ => {
                                out.fill(Frame::ZERO);
                                if split {
                                    module.add_port(pair, port, out);
                                }
                            }
                        };
                    for (port, lane) in taps.iter() {
                        let out = pair_of(share, 0, frames);
                        port_signal(0, *port, out, work);
                        write_lane(lanes, rings, clock, *lane, out);
                    }
                    for (port, route) in ports.iter_mut() {
                        for pair in 0..pairs {
                            port_signal(pair, *port, pair_of(share, pair, frames), work);
                        }
                        deliver(
                            route,
                            share,
                            frames,
                            later,
                            position + 1,
                            main,
                            aux,
                            offset,
                            rings,
                            clock,
                        );
                    }
                    // What stays in the strip: every port not sent elsewhere.
                    if routed[0] {
                        work.fill(Frame::ZERO);
                    }
                    if split {
                        for (port, routed) in routed.iter().enumerate().skip(1) {
                            if !routed {
                                for pair in 0..pairs {
                                    module.add_port(pair, port, pair_of(work, pair, frames));
                                }
                            }
                        }
                    }
                }
                for (output, lane) in controls_out.iter() {
                    let values = match module.is_active() {
                        true => module.control(*output),
                        false => &[],
                    };
                    controls[*lane].write(clock, values, frames);
                }
                module.finish(frames);
            }
            if frozen.replaced == Some(current.chain.len()) {
                blend_stem(
                    &current.freeze,
                    &mut current.work,
                    current.transport.as_ref(),
                    frames,
                    at,
                    sample_rate,
                );
            }
            let StripRuntime {
                cost,
                output,
                output_enabled,
                muted,
                mute_gain,
                post_taps,
                work,
                meter,
                ..
            } = current;
            let work = work.span_mut(frames);
            for lane in post_taps.iter() {
                write_lane(lanes, rings, clock, *lane, &work[..frames]);
            }
            // A muted strip is silent on its own output only: its sends and taps keep feeding their buses and
            // keys (user, 15 Nov. 2026, R-179: a muted track sending to a bus still works).
            for (pair, gain) in mute_gain.iter_mut().enumerate() {
                gain.apply(pair_of(work, pair, frames), if *muted { 0.0 } else { 1.0 });
            }
            meter.record(dsp::channel_peaks(work), dsp::rms(work));
            if *output_enabled && let Some(route) = output.as_mut() {
                deliver(
                    route,
                    work,
                    frames,
                    later,
                    position + 1,
                    main,
                    aux,
                    offset,
                    rings,
                    clock,
                );
            }
            if let (Some(started), Some(ended)) = (started, now_ns()) {
                cost.record(ended.saturating_sub(started), frames);
            }
        }
    }
}
