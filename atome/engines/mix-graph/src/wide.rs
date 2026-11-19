// Strips of 1, 2, 4 or 8 channels (R-191). A strip's signal is a few stereo
// pairs: channels 2p and 2p + 1 travel as pair p, so every stereo module runs
// once per pair with the same settings, and a stereo strip is exactly one
// pair, as before. A mono strip keeps its one channel on both sides of its
// pair; read as a channel, a mono strip is the mean of its pair.
//
// A route moves channels by a declared map: the same width goes pair by pair;
// a mono signal goes to every channel; anything else needs the route's own
// channel list, so a wider signal never folds silently into a narrower one.

use crate::graph::MAX_BLOCK;
use kira::Frame;

pub const WIDTHS: [u8; 4] = [1, 2, 4, 8];
pub const MAX_PAIRS: usize = 4;

pub fn pairs_of(channels: usize) -> usize {
    channels.div_ceil(2)
}

pub fn check_width(strip: &str, channels: u8) -> Result<usize, String> {
    match WIDTHS.contains(&channels) {
        true => Ok(channels as usize),
        false => Err(format!(
            "mix strip {strip} has {channels} channels: a strip has 1, 2, 4 or 8"
        )),
    }
}

// Up to MAX_BLOCK frames of each of `pairs` pairs; a chunk of `frames` frames
// lays pair p at [p × frames, (p + 1) × frames).
pub struct Wide {
    data: Vec<Frame>,
    pub pairs: usize,
}

impl Wide {
    pub fn new(pairs: usize) -> Self {
        Self {
            data: vec![Frame::ZERO; pairs.max(1) * MAX_BLOCK],
            pairs,
        }
    }

    pub fn span(&self, frames: usize) -> &[Frame] {
        &self.data[..self.pairs * frames]
    }

    pub fn span_mut(&mut self, frames: usize) -> &mut [Frame] {
        &mut self.data[..self.pairs * frames]
    }

    pub fn pair(&self, pair: usize, frames: usize) -> &[Frame] {
        &self.data[pair * frames..(pair + 1) * frames]
    }

    pub fn pair_mut(&mut self, pair: usize, frames: usize) -> &mut [Frame] {
        &mut self.data[pair * frames..(pair + 1) * frames]
    }
}

pub fn pair_of(span: &mut [Frame], pair: usize, frames: usize) -> &mut [Frame] {
    &mut span[pair * frames..(pair + 1) * frames]
}

// How a route lays its channels into its destination.
#[derive(Debug, PartialEq)]
pub enum ChannelMap {
    // Same width: pair by pair (a stereo route, bit for bit as before).
    Same,
    // (source channel, destination channel), each added once.
    Each(Vec<(usize, u16)>),
}

// `destination` is None for physical outputs: the list names their channels.
pub fn plan_map(
    what: &str,
    source: usize,
    destination: Option<usize>,
    listed: Option<&[u16]>,
) -> Result<ChannelMap, String> {
    let Some(listed) = listed else {
        let destination = destination.unwrap_or(2);
        return match (source, destination) {
            (from, to) if from == to => Ok(ChannelMap::Same),
            (1, to) => Ok(ChannelMap::Each(
                (0..to).map(|channel| (0, channel as u16)).collect(),
            )),
            (from, to) => Err(format!(
                "{what}: a {from}-channel signal into {to} channels needs its channel map"
            )),
        };
    };
    if let (Some(limit), Some(channel)) = (
        destination,
        listed
            .iter()
            .find(|channel| usize::from(**channel) >= destination.unwrap_or(0)),
    ) {
        return Err(format!(
            "{what}: channel {} does not exist (the destination has {limit})",
            channel + 1
        ));
    }
    match (source, listed.len()) {
        (1, count) if count >= 1 => Ok(ChannelMap::Each(
            listed.iter().map(|channel| (0, *channel)).collect(),
        )),
        (from, count) if from == count => Ok(ChannelMap::Each(
            listed.iter().copied().enumerate().collect(),
        )),
        (from, count) => Err(format!(
            "{what}: {count} channels listed for a {from}-channel signal"
        )),
    }
}

// The value of `channel` of a `channels`-wide chunk at `index`.
#[inline]
fn sample(span: &[Frame], frames: usize, channels: usize, channel: usize, index: usize) -> f32 {
    if channels == 1 {
        let frame = span[index];
        return (frame.left + frame.right) * 0.5;
    }
    let frame = span[(channel / 2) * frames + index];
    if channel.is_multiple_of(2) {
        frame.left
    } else {
        frame.right
    }
}

// Lays `signal` into `staging` (cleared first) by `pairs`. A mono destination
// holds its channel on both sides.
pub fn scatter(
    pairs: &[(usize, u16)],
    signal: &[Frame],
    source_channels: usize,
    frames: usize,
    staging: &mut [Frame],
    mono_destination: bool,
) {
    staging.fill(Frame::ZERO);
    for &(from, to) in pairs {
        let to = usize::from(to);
        let lane = &mut staging[(to / 2) * frames..(to / 2 + 1) * frames];
        for (index, out) in lane.iter_mut().enumerate() {
            let value = sample(signal, frames, source_channels, from, index);
            if mono_destination {
                out.left += value;
                out.right += value;
            } else if to.is_multiple_of(2) {
                out.left += value;
            } else {
                out.right += value;
            }
        }
    }
}
