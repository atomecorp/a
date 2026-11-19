// The slice Motif (todo/slicer_cahier_2026-11-15.md §2, §3.5): how the slices of a sound play, compiled to the
// pieces of a non-destructive edit (eVe/domains/sample_edit/edit_pieces.js) that the edit's offline render lays end
// to end. Each step plays one slice — the step's own (order « free ») or the one the order draws — cut at the step's
// length (gate), its force a gain, its pitch in semitones (length kept), turned when reversed, replayed N times
// within the step (roll), played or not by its chance. Every draw comes from the Motif's seed: the same Motif always
// gives the same sound, on every platform. A swing delays every odd step by a share of a step.
use crate::{INVALID_ARGUMENT, KernelError, Result};
use serde::{Deserialize, Serialize};

pub const STEPS_MAX: usize = 64;
pub const ROLL_MAX: u32 = 8;
pub const PITCH_RANGE: f64 = 24.0;
pub const SWING_MAX: f64 = 75.0;

/// One step: the slice it plays (its index; none = a rest), force 1..127, pitch −24..24, roll 1..8, chance 0..100.
#[derive(Debug, Clone, Deserialize)]
pub struct MotifStep {
    #[serde(default)]
    pub slice: Option<u32>,
    #[serde(default = "default_force")]
    pub force: u32,
    #[serde(default)]
    pub pitch: f64,
    #[serde(default = "one")]
    pub roll: u32,
    #[serde(default = "full_chance")]
    pub chance: u32,
    #[serde(default)]
    pub reverse: bool,
}

/// What a slice does after it played, in the order « follow » (the Cells' Follow Actions, one vocabulary).
#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum Follow {
    Next,
    Previous,
    Repeat,
    Random,
    Stop,
    Target { target: u32 },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Order {
    Free,
    Original,
    Reverse,
    Random,
    RandomNoRepeat,
    Follow,
}

#[derive(Debug, Clone, Deserialize)]
pub struct Motif {
    pub steps: Vec<MotifStep>,
    #[serde(default = "free")]
    pub order: Order,
    #[serde(default)]
    pub seed: u32,
    /// Percent of a step every odd step starts late (0..75).
    #[serde(default)]
    pub swing: f64,
    /// Per slice index, its follow action (absent = next).
    #[serde(default)]
    pub follows: Vec<Option<Follow>>,
}

/// A slice of the source, frames `[start, end)`.
#[derive(Debug, Clone, Copy, Deserialize)]
pub struct SliceRange {
    pub start: u64,
    pub end: u64,
}

/// A piece of the edit, in edit_pieces.js's shape.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum Piece {
    Source {
        start: u64,
        end: u64,
        reverse: bool,
        gain_db: f64,
        pitch: f64,
        ramps: Vec<[f64; 2]>,
    },
    Silence {
        frames: u64,
    },
}

const fn default_force() -> u32 {
    99
}
const fn one() -> u32 {
    1
}
const fn full_chance() -> u32 {
    100
}
const fn free() -> Order {
    Order::Free
}

/// SplitMix64: one small, exact generator, the same numbers everywhere.
struct Draws(u64);

impl Draws {
    fn next(&mut self) -> u64 {
        self.0 = self.0.wrapping_add(0x9E37_79B9_7F4A_7C15);
        let mut z = self.0;
        z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
        z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
        z ^ (z >> 31)
    }
    /// An index in `0..count`.
    fn below(&mut self, count: usize) -> usize {
        (self.next() % count as u64) as usize
    }
    /// A percent in `0..100`.
    fn percent(&mut self) -> u32 {
        (self.next() % 100) as u32
    }
}

fn invalid(message: impl Into<String>) -> KernelError {
    KernelError::new(INVALID_ARGUMENT, message)
}

fn check(motif: &Motif, slices: &[SliceRange], source_frames: u64) -> Result<()> {
    if slices.is_empty() {
        return Err(invalid(
            "a Motif plays the slices of a sound: one slice at least",
        ));
    }
    if motif.steps.is_empty() || motif.steps.len() > STEPS_MAX {
        return Err(invalid(format!("a Motif has 1..{STEPS_MAX} steps")));
    }
    if !(0.0..=SWING_MAX).contains(&motif.swing) {
        return Err(invalid(format!(
            "swing is 0..{SWING_MAX} percent of a step"
        )));
    }
    if slices
        .iter()
        .any(|slice| slice.start >= slice.end || slice.end > source_frames)
    {
        return Err(invalid(
            "every slice lies in the source, its start before its end",
        ));
    }
    for (index, step) in motif.steps.iter().enumerate() {
        if step
            .slice
            .is_some_and(|slice| slice as usize >= slices.len())
        {
            return Err(invalid(format!(
                "steps[{index}].slice names no slice of the sound"
            )));
        }
        if !(1..=127).contains(&step.force)
            || !(1..=ROLL_MAX).contains(&step.roll)
            || step.chance > 100
        {
            return Err(invalid(format!(
                "steps[{index}]: force 1..127, roll 1..{ROLL_MAX}, chance 0..100"
            )));
        }
        if !step.pitch.is_finite() || step.pitch.abs() > PITCH_RANGE {
            return Err(invalid(format!(
                "steps[{index}].pitch is −{PITCH_RANGE}..{PITCH_RANGE} semitones"
            )));
        }
    }
    for (index, follow) in motif.follows.iter().enumerate() {
        if let Some(Follow::Target { target }) = follow
            && *target as usize >= slices.len()
        {
            return Err(invalid(format!(
                "follows[{index}] targets no slice of the sound"
            )));
        }
    }
    Ok(())
}

/// The slice each step plays (None: a rest), as the order and the seed decide.
fn played_slices(motif: &Motif, count: usize, draws: &mut Draws) -> Vec<Option<usize>> {
    let steps = motif.steps.len();
    match motif.order {
        Order::Free => motif
            .steps
            .iter()
            .map(|step| step.slice.map(|slice| slice as usize))
            .collect(),
        Order::Original => (0..steps).map(|index| Some(index % count)).collect(),
        Order::Reverse => (0..steps)
            .map(|index| Some(count - 1 - index % count))
            .collect(),
        Order::Random => (0..steps).map(|_| Some(draws.below(count))).collect(),
        Order::RandomNoRepeat => {
            let mut out = Vec::with_capacity(steps);
            let mut bag: Vec<usize> = Vec::new();
            while out.len() < steps {
                if bag.is_empty() {
                    bag = (0..count).collect();
                }
                let mut at = draws.below(bag.len());
                // A new bag never starts with the slice the last one ended on.
                if count > 1 && bag.len() == count && out.last() == Some(&Some(bag[at])) {
                    at = (at + 1) % bag.len();
                }
                out.push(Some(bag.swap_remove(at)));
            }
            out
        }
        Order::Follow => {
            let mut out = Vec::with_capacity(steps);
            let mut current = motif.steps[0]
                .slice
                .map_or(Some(0), |slice| Some(slice as usize));
            for _ in 0..steps {
                out.push(current);
                current = current.and_then(|slice| {
                    match motif
                        .follows
                        .get(slice)
                        .cloned()
                        .flatten()
                        .unwrap_or(Follow::Next)
                    {
                        Follow::Next => Some((slice + 1) % count),
                        Follow::Previous => Some((slice + count - 1) % count),
                        Follow::Repeat => Some(slice),
                        Follow::Stop => None,
                        Follow::Target { target } => Some(target as usize),
                        Follow::Random if count > 1 => {
                            let other = draws.below(count - 1);
                            Some(if other >= slice { other + 1 } else { other })
                        }
                        Follow::Random => Some(slice),
                    }
                });
            }
            out
        }
    }
}

/// `length` frames of the slice, from its start (or ending at its end when reversed), as pieces in result order:
/// a fade-in head, the body, a fade-out tail (each `fade` frames, shorter when the part is), then silence to `part`.
fn slice_part(slice: SliceRange, step: &MotifStep, part: u64, fade: u64, out: &mut Vec<Piece>) {
    let played = part.min(slice.end - slice.start);
    let gain_db = 20.0 * (f64::from(step.force) / 127.0).log10();
    // The played window: the slice's first `played` frames, or its last ones when reversed (heard from its end).
    let first = if step.reverse {
        slice.end - played
    } else {
        slice.start
    };
    let window = |from: u64, to: u64, ramp: [f64; 2]| {
        let (start, end) = if step.reverse {
            (first + played - to, first + played - from)
        } else {
            (first + from, first + to)
        };
        Piece::Source {
            start,
            end,
            reverse: step.reverse,
            gain_db,
            pitch: step.pitch,
            ramps: if ramp == [1.0, 1.0] {
                Vec::new()
            } else {
                vec![ramp]
            },
        }
    };
    // A pitched piece is resynthesised whole by the stretcher: it is never cut into fades.
    let edge = if step.pitch == 0.0 {
        fade.min(played / 3)
    } else {
        0
    };
    if edge > 0 {
        out.push(window(0, edge, [0.0, 1.0]));
        out.push(window(edge, played - edge, [1.0, 1.0]));
        out.push(window(played - edge, played, [1.0, 0.0]));
    } else {
        out.push(window(0, played, [1.0, 1.0]));
    }
    if part > played {
        out.push(Piece::Silence {
            frames: part - played,
        });
    }
}

/// The Motif as pieces: `step_frames` the length of a step, `fade_frames` the anti-click fade at each slice edge.
pub fn compile(
    motif: &Motif,
    slices: &[SliceRange],
    source_frames: u64,
    step_frames: u64,
    fade_frames: u64,
) -> Result<Vec<Piece>> {
    check(motif, slices, source_frames)?;
    // The shortest step (an odd one under the largest swing) still holds one frame per hit of the largest roll.
    if step_frames < 4 * u64::from(ROLL_MAX) {
        return Err(invalid(format!(
            "a step lasts {} frames at least",
            4 * ROLL_MAX
        )));
    }
    let mut draws = Draws(u64::from(motif.seed));
    let played = played_slices(motif, slices.len(), &mut draws);
    let steps = motif.steps.len() as u64;
    // Step i starts at i·step, an odd one late by the swing; the Motif's end stays steps·step.
    let swing = |index: u64| -> u64 {
        if index >= steps {
            return steps * step_frames;
        }
        let late = if index % 2 == 1 {
            (motif.swing / 100.0 * step_frames as f64).round() as u64
        } else {
            0
        };
        index * step_frames + late
    };
    let mut out = Vec::new();
    for (index, (step, slice)) in motif.steps.iter().zip(played).enumerate() {
        let length = swing(index as u64 + 1) - swing(index as u64);
        let heard = draws.percent() < step.chance;
        let Some(slice) = slice.filter(|_| heard) else {
            out.push(Piece::Silence { frames: length });
            continue;
        };
        let roll = u64::from(step.roll);
        for hit in 0..roll {
            let part = length / roll + u64::from(hit + 1 == roll) * (length % roll);
            slice_part(slices[slice], step, part, fade_frames, &mut out);
        }
    }
    Ok(out)
}
