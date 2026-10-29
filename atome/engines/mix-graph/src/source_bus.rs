// What strips and IN modules read besides their own tracks: live inputs and
// instruments. Each is pulled or rendered once per chunk, at its start, into
// buses every reader copies: a microphone heard on two strips is consumed
// once, and an instrument whose outputs play on several strips (D-S2) renders
// once. Buses are sized when the program is applied, never on the render thread.

use crate::graph::MAX_BLOCK;
use crate::instrument::{InstrumentSlot, Instruments};
use crate::program::{InputSpec, MixSource, Program};
use crate::shared::{CaptureSlot, LiveInput};
use kira::Frame;
use std::collections::HashMap;
use std::sync::Arc;

pub enum Feed {
    Live(Arc<LiveInput>),
    Instrument(Arc<InstrumentSlot>),
}

pub struct SourceBus {
    feed: Feed,
    pub buses: Vec<Vec<Frame>>,
}

impl SourceBus {
    // Render thread: this chunk of the source into its buses.
    pub fn fill(&mut self, frames: usize) {
        match &self.feed {
            Feed::Live(live) => live.pull(&mut self.buses[0][..frames]),
            Feed::Instrument(slot) => slot.render(&mut self.buses, frames),
        }
    }
}

// What a strip plays: its track's voices, or one bus of a source.
pub enum StripSource {
    Track,
    Bus { feed: usize, output: usize },
}

impl StripSource {
    pub fn pull(&self, capture: &CaptureSlot, offset: usize, feeds: &[SourceBus], out: &mut [Frame]) {
        match self {
            StripSource::Track => capture.read_at(offset, out),
            StripSource::Bus { feed, output } => out.copy_from_slice(&feeds[*feed].buses[*output][..out.len()]),
        }
    }
}

#[derive(Clone, PartialEq, Eq, Hash)]
enum FeedKey {
    Live(String),
    Instrument(String),
}

// The sources of one program: each live input and instrument once, with the
// buses its readers need (an instrument: up to the highest output read).
pub struct Feeds {
    index: HashMap<FeedKey, usize>,
    pub buses: Vec<SourceBus>,
}

impl Feeds {
    // Control thread, at apply: `live(device)` and `instruments` give the shared
    // inputs and slots, which outlive the graph.
    pub fn plan(program: &Program, live: &mut dyn FnMut(&str) -> Arc<LiveInput>, instruments: &mut Instruments, sample_rate: u32) -> Result<Self, String> {
        let mut wanted: Vec<(FeedKey, usize)> = Vec::new();
        let mut want = |key: FeedKey, output: usize| match wanted.iter_mut().find(|(known, _)| *known == key) {
            Some((_, outputs)) => *outputs = (*outputs).max(output + 1),
            None => wanted.push((key, output + 1)),
        };
        for strip in &program.strips {
            match &strip.input {
                InputSpec::LiveAudio { device_id } => want(FeedKey::Live(device_id.clone()), 0),
                InputSpec::Instrument { instrument_id, output } => want(FeedKey::Instrument(instrument_id.clone()), *output),
                InputSpec::Track => {}
            }
            for module in &strip.chain {
                match &module.source {
                    Some(MixSource::LiveAudio { device_id }) => want(FeedKey::Live(device_id.clone()), 0),
                    Some(MixSource::Instrument { instrument_id, output }) => want(FeedKey::Instrument(instrument_id.clone()), *output),
                    _ => {}
                }
            }
        }
        let mut index = HashMap::with_capacity(wanted.len());
        let mut buses = Vec::with_capacity(wanted.len());
        for (key, outputs) in wanted {
            let feed = match &key {
                FeedKey::Live(device) => Feed::Live(live(device)),
                FeedKey::Instrument(id) => {
                    instruments.check_output(id, outputs - 1)?;
                    Feed::Instrument(instruments.slot(id, sample_rate)?)
                }
            };
            index.insert(key, buses.len());
            buses.push(SourceBus { feed, buses: (0..outputs).map(|_| vec![Frame::ZERO; MAX_BLOCK]).collect() });
        }
        Ok(Self { index, buses })
    }

    // The outputs read per instrument (what its later descriptions must keep).
    pub fn routed(&self) -> HashMap<String, usize> {
        self.index.iter().filter_map(|(key, at)| match key {
            FeedKey::Instrument(id) => Some((id.clone(), self.buses[*at].buses.len())),
            FeedKey::Live(_) => None,
        }).collect()
    }

    pub fn devices(&self) -> impl Iterator<Item = &str> {
        self.index.keys().filter_map(|key| match key {
            FeedKey::Live(device) => Some(device.as_str()),
            FeedKey::Instrument(_) => None,
        })
    }

    pub fn strip_source(&self, input: &InputSpec) -> StripSource {
        match input {
            InputSpec::Track => StripSource::Track,
            InputSpec::LiveAudio { device_id } => StripSource::Bus { feed: self.index[&FeedKey::Live(device_id.clone())], output: 0 },
            InputSpec::Instrument { instrument_id, output } => StripSource::Bus { feed: self.index[&FeedKey::Instrument(instrument_id.clone())], output: *output },
        }
    }

    // The bus an IN module reads; a strip source travels on a lane (graph.rs).
    pub fn module_bus(&self, source: &MixSource) -> Option<(usize, usize)> {
        match source {
            MixSource::LiveAudio { device_id } => Some((self.index[&FeedKey::Live(device_id.clone())], 0)),
            MixSource::Instrument { instrument_id, output } => Some((self.index[&FeedKey::Instrument(instrument_id.clone())], *output)),
            MixSource::Strip { .. } => None,
        }
    }
}
