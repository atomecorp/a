// The keymap answers « which sounds does this note play? »: the zones a note
// and velocity fall in, and for each, the takes its stack picks. Draw state
// (round-robin counters, the seeded random) lives here, sized once, so the
// same seed replays the same performance. It also holds the instrument's
// markers (markers.rs) and the draws of its composed notes (composed.rs), and
// the instrument's keyswitch range: the keys that choose which zones sound.

use crate::composed::StepDraws;
use crate::markers::{Marker, MarkerTable};
use crate::sample::SampleBank;
use crate::zone::{midi_velocity, Draw, Stack, Zone, MAX_OUTPUTS, MAX_PLAYERS};
use std::f32::consts::FRAC_PI_2;

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Pick {
    // The zone that owns the take (a borrowed take keeps its own root).
    pub zone: usize,
    pub take: usize,
    pub level: f32,
}

pub const NO_PICK: Pick = Pick { zone: 0, take: 0, level: 0.0 };

pub struct Keymap {
    zones: Vec<Zone>,
    neighbours: Vec<Vec<usize>>,
    counters: Vec<usize>,
    last: Vec<usize>,
    release_counters: Vec<usize>,
    random: u64,
    markers: MarkerTable,
    steps: StepDraws,
    switches: Option<Switches>,
}

// Keys `low..=high` are keyswitches; `default` is the one chosen before any is pressed.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Switches {
    pub low: u8,
    pub high: u8,
    pub default: u8,
}

impl Switches {
    pub fn contains(&self, note: u8) -> bool {
        (self.low..=self.high).contains(&note)
    }
}

impl Keymap {
    // Checks every zone against the bank; built off the audio thread.
    pub fn new(zones: Vec<Zone>, bank: &SampleBank, seed: u64) -> Result<Self, String> {
        Self::with_markers(zones, Vec::new(), bank, seed)
    }

    // `markers`: the table the segments' marker spans index.
    pub fn with_markers(zones: Vec<Zone>, markers: Vec<Marker>, bank: &SampleBank, seed: u64) -> Result<Self, String> {
        let markers = MarkerTable::new(markers);
        for (index, zone) in zones.iter().enumerate() {
            if zone.key_low > zone.key_high || zone.velocity_low > zone.velocity_high || zone.key_high > 127 || zone.velocity_high > 127 {
                return Err(format!("zone {index}: empty key or velocity range"));
            }
            match &zone.composed {
                None if zone.takes.is_empty() => return Err(format!("zone {index}: no take")),
                Some(_) if !zone.takes.is_empty() => return Err(format!("zone {index}: a composed note plays its steps, not takes")),
                _ => {}
            }
            for segment in zone.segments() {
                let data = bank.get(segment.sample).ok_or_else(|| format!("zone {index}: sample {} is not in the bank", segment.sample))?;
                segment.validate(data).map_err(|reason| format!("zone {index}: {reason}"))?;
                markers.check(segment.markers, segment.start, segment.end).map_err(|reason| format!("zone {index}: {reason}"))?;
            }
            if let Some(composed) = &zone.composed {
                composed.validate(&markers).map_err(|reason| format!("zone {index}: {reason}"))?;
            }
            match &zone.stack {
                Stack::Mix(levels) if levels.len() != zone.takes.len() || levels.len() > MAX_PLAYERS => {
                    return Err(format!("zone {index}: a mix has one level per take, {MAX_PLAYERS} at most"));
                }
                _ => {}
            }
            if zone.takes.iter().any(|take| take.stretch != zone.takes[0].stretch) {
                return Err(format!("zone {index}: its takes share one stretch (one stretcher per voice)"));
            }
            if zone.output as usize >= MAX_OUTPUTS {
                return Err(format!("zone {index}: output {} past the {MAX_OUTPUTS} an instrument has", zone.output));
            }
            if let Some(&wrong) = zone.cuts.iter().find(|&&cut| cut >= zones.len() || cut == index) {
                return Err(format!("zone {index}: cannot cut zone {wrong}"));
            }
        }
        let neighbours = zones
            .iter()
            .enumerate()
            .map(|(index, zone)| {
                if !zone.borrow_neighbours || zone.composed.is_some() || !matches!(zone.stack, Stack::Alternate(_)) {
                    return Vec::new();
                }
                zones
                    .iter()
                    .enumerate()
                    .filter(|(other_index, other)| {
                        *other_index != index
                            && other.composed.is_none()
                            && matches!(other.stack, Stack::Alternate(_))
                            && other.velocity_low == zone.velocity_low
                            && other.velocity_high == zone.velocity_high
                            && (other.key_high as i32 + 1 == zone.key_low as i32 || zone.key_high as i32 + 1 == other.key_low as i32)
                    })
                    .map(|(other_index, _)| other_index)
                    .collect()
            })
            .collect();
        let count = zones.len();
        let steps = StepDraws::new(&zones, seed);
        Ok(Self { zones, neighbours, counters: vec![0; count], last: vec![usize::MAX; count], release_counters: vec![0; count], random: seed.max(1), markers, steps, switches: None })
    }

    // The keyswitch range; every zone's switch lies in it, and a zone has one only when the range exists.
    pub fn with_switches(mut self, switches: Option<Switches>) -> Result<Self, String> {
        if let Some(range) = switches {
            if range.low > range.high || range.high > 127 || !range.contains(range.default) {
                return Err(format!("keyswitches {}..{} cannot start on {}", range.low, range.high, range.default));
            }
        }
        for (index, zone) in self.zones.iter().enumerate() {
            match (zone.switch, switches) {
                (Some(key), Some(range)) if !range.contains(key) => return Err(format!("zone {index}: keyswitch {key} is outside the switch range")),
                (Some(key), None) => return Err(format!("zone {index}: keyswitch {key} without a switch range")),
                _ => {}
            }
        }
        self.switches = switches;
        Ok(self)
    }

    pub fn switches(&self) -> Option<Switches> {
        self.switches
    }

    pub fn stretches(&self) -> bool {
        self.zones.iter().any(|zone| zone.takes.iter().chain(zone.composed.iter().flat_map(|composed| composed.segments())).any(|take| take.is_stretched()))
    }

    pub fn markers(&self) -> &MarkerTable {
        &self.markers
    }

    pub fn markers_mut(&mut self) -> &mut MarkerTable {
        &mut self.markers
    }

    // The segment step `step` of composed zone `zone` plays for this note.
    pub fn draw_step(&mut self, zone: usize, step: usize, note: u8, velocity: f32) -> usize {
        self.steps.draw(zone, &self.zones[zone], step, note, velocity)
    }

    // A seeded draw in 0..count.
    pub fn draw_below(&mut self, count: usize) -> usize {
        self.steps.below(count)
    }

    // The outputs its zones sound on: one past the highest.
    pub fn outputs(&self) -> usize {
        self.zones.iter().map(|zone| zone.output as usize + 1).max().unwrap_or(1)
    }

    pub fn zones(&self) -> &[Zone] {
        &self.zones
    }

    pub fn zone(&self, index: usize) -> &Zone {
        &self.zones[index]
    }

    pub fn len(&self) -> usize {
        self.zones.len()
    }

    pub fn is_empty(&self) -> bool {
        self.zones.is_empty()
    }

    // Writes the takes zone `zone` plays for this velocity; returns how many.
    pub fn pick(&mut self, zone: usize, velocity: f32, out: &mut [Pick; MAX_PLAYERS]) -> usize {
        let stack = &self.zones[zone].stack;
        match stack {
            Stack::Alternate(draw) => {
                let draw = *draw;
                let own = self.zones[zone].takes.len();
                let total = own + self.neighbours[zone].iter().map(|&other| self.zones[other].takes.len()).sum::<usize>();
                let index = self.draw(zone, draw, total);
                out[0] = self.candidate(zone, index, own);
                1
            }
            Stack::Mix(levels) => {
                for (take, level) in levels.iter().enumerate() {
                    out[take] = Pick { zone, take, level: *level };
                }
                levels.len()
            }
            Stack::Layers { crossfade } => {
                let z = &self.zones[zone];
                let count = z.takes.len();
                let low = z.velocity_low as f32;
                let span = (z.velocity_high as f32 - low + 1.0) / count as f32;
                let at = midi_velocity(velocity) as f32 - low + 0.5;
                let layer = ((at / span) as usize).min(count - 1);
                let half = *crossfade as f32 * 0.5;
                // The nearest inner seam, if the velocity lies within half a crossfade of it.
                let seam = (at / span).round();
                let distance = at - seam * span;
                if half > 0.0 && seam >= 1.0 && (seam as usize) < count && distance.abs() < half {
                    let t = (distance + half) / (2.0 * half) * FRAC_PI_2;
                    let upper = seam as usize;
                    out[0] = Pick { zone, take: upper - 1, level: t.cos() };
                    out[1] = Pick { zone, take: upper, level: t.sin() };
                    return 2;
                }
                out[0] = Pick { zone, take: layer, level: 1.0 };
                1
            }
        }
    }

    // The take played at the key's release, if the zone has any.
    pub fn pick_release(&mut self, zone: usize) -> Option<usize> {
        let count = self.zones[zone].release_takes.len();
        if count == 0 {
            return None;
        }
        let take = self.release_counters[zone] % count;
        self.release_counters[zone] += 1;
        Some(take)
    }

    fn candidate(&self, zone: usize, mut index: usize, own: usize) -> Pick {
        if index < own {
            return Pick { zone, take: index, level: 1.0 };
        }
        index -= own;
        for &other in &self.neighbours[zone] {
            let takes = self.zones[other].takes.len();
            if index < takes {
                return Pick { zone: other, take: index, level: 1.0 };
            }
            index -= takes;
        }
        Pick { zone, take: 0, level: 1.0 }
    }

    fn draw(&mut self, zone: usize, draw: Draw, total: usize) -> usize {
        let index = match draw {
            Draw::Cycle => {
                let index = self.counters[zone] % total;
                self.counters[zone] += 1;
                index
            }
            Draw::Random => (self.next_random() % total as u64) as usize,
            Draw::RandomNoRepeat if total > 1 => {
                let mut index = (self.next_random() % (total as u64 - 1)) as usize;
                if index >= self.last[zone] {
                    index += 1;
                }
                index
            }
            Draw::RandomNoRepeat => 0,
        };
        self.last[zone] = index;
        index
    }

    fn next_random(&mut self) -> u64 {
        xorshift(&mut self.random)
    }
}

// xorshift64*: deterministic for a seed, no allocation.
pub(crate) fn xorshift(state: &mut u64) -> u64 {
    *state ^= *state >> 12;
    *state ^= *state << 25;
    *state ^= *state >> 27;
    state.wrapping_mul(0x2545_F491_4F6C_DD1D)
}
