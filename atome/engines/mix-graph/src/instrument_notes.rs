// The markers and composed notes of an instrument description
// (kernel/instrument_schema.js), turned into `atome-instrument`'s: markers
// gathered into one table (each segment's run sorted by frame, then creation),
// their ids interned as labels shared across segments, transitions resolved
// to step indices. The table's facts the host needs to run a fired command
// (Q7: the command runs outside the audio thread) are kept in `MarkerInfo`.

use crate::instrument_spec::SegmentSpec;
use atome_instrument::{Composed, Follow, Marker, MarkerKind, MarkerSpan, Step, StepDraw, Transition, Trigger, When};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Clone, Debug, Deserialize)]
pub struct MarkerSpec {
    pub id: String,
    pub frame: usize,
    pub kind: String,
    pub when: WhenSpec,
    #[serde(default)]
    pub action: Option<ActionRef>,
    #[serde(default)]
    pub priority: i32,
    #[serde(default)]
    pub delay_ms: f32,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum WhenSpec {
    Once,
    EveryPass,
    EveryN { n: u32 },
    AtNth { n: u32 },
    OncePerVoice,
}

// The command a marker names; its input stays with the description the host keeps.
#[derive(Clone, Debug, Deserialize)]
pub struct ActionRef {
    pub command: String,
}

#[derive(Clone, Debug, Deserialize)]
pub struct ComposedSpec {
    pub steps: Vec<StepSpec>,
    #[serde(default)]
    pub transitions: Vec<TransitionSpec>,
}

#[derive(Clone, Debug, Deserialize)]
pub struct StepSpec {
    pub id: String,
    pub draw: String,
    pub segments: Vec<SegmentSpec>,
}

#[derive(Clone, Debug, Deserialize)]
pub struct TransitionSpec {
    pub from: Option<String>,
    pub trigger: TriggerSpec,
    pub follow: FollowSpec,
    #[serde(default)]
    pub fade_ms: f32,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum TriggerSpec {
    SegmentEnd,
    Marker { marker_id: String },
    Passes { count: u32 },
    NoteOff,
    Legato,
    Velocity { above: u8 },
    Controller { number: u8, above: f32 },
    Duration { ms: f32 },
}

#[derive(Clone, Debug, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum FollowSpec {
    Next,
    Previous,
    Stop,
    Repeat,
    Target { target_step: String },
    Random,
    JumpMarker { marker_id: String },
    Draw,
    NoteOff,
    Fade,
}

// What a host needs of a fired marker: where it lies and the command it names.
#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct MarkerInfo {
    pub zone_id: String,
    // takes/<index>, release_takes/<index> or steps/<step id>/<index>.
    pub segment: String,
    pub marker_id: String,
    pub command: Option<String>,
    pub priority: i32,
    pub delay_ms: f32,
}

#[derive(Default)]
pub struct MarkerBuilder {
    markers: Vec<Marker>,
    infos: Vec<MarkerInfo>,
    labels: HashMap<String, u16>,
}

impl MarkerBuilder {
    // A segment's markers join the table, sorted by frame (creation order kept on a frame).
    pub fn span(&mut self, specs: &[MarkerSpec], zone_id: &str, segment: &str) -> Result<MarkerSpan, String> {
        let at = format!("zone {zone_id} {segment}");
        let mut order: Vec<&MarkerSpec> = specs.iter().collect();
        order.sort_by_key(|spec| spec.frame);
        let first = self.markers.len() as u32;
        for (index, spec) in order.iter().enumerate() {
            if order[..index].iter().any(|other| other.id == spec.id) {
                return Err(format!("{at}: marker id {} is used twice", spec.id));
            }
            let kind = match spec.kind.as_str() {
                "slice" => MarkerKind::Slice,
                "loop_point" => MarkerKind::LoopPoint,
                "action" => MarkerKind::Action,
                other => return Err(format!("{at}: marker kind {other} is unknown")),
            };
            if kind == MarkerKind::Action && spec.action.is_none() {
                return Err(format!("{at}: action marker {} names no command", spec.id));
            }
            let when = match spec.when {
                WhenSpec::Once => When::Once,
                WhenSpec::EveryPass => When::EveryPass,
                WhenSpec::EveryN { n } => When::Every(n),
                WhenSpec::AtNth { n } => When::Nth(n),
                WhenSpec::OncePerVoice => When::OncePerVoice,
            };
            let next = self.labels.len();
            let label = *self.labels.entry(spec.id.clone()).or_insert(u16::try_from(next).map_err(|_| "an instrument names 65 536 marker ids at most".to_string())?);
            self.markers.push(Marker { frame: spec.frame, kind, when, label, reports: spec.action.is_some() });
            self.infos.push(MarkerInfo {
                zone_id: zone_id.to_string(), segment: segment.to_string(), marker_id: spec.id.clone(),
                command: spec.action.as_ref().map(|action| action.command.clone()), priority: spec.priority, delay_ms: spec.delay_ms,
            });
        }
        Ok(MarkerSpan { first, len: order.len() as u32 })
    }

    fn label(&self, id: &str, at: &str) -> Result<u16, String> {
        self.labels.get(id).copied().ok_or_else(|| format!("{at}: no segment carries marker {id}"))
    }

    pub fn finish(self) -> (Vec<Marker>, Vec<MarkerInfo>) {
        (self.markers, self.infos)
    }
}

fn draw(draw: &str) -> Result<StepDraw, String> {
    Ok(match draw {
        "one" => StepDraw::One,
        "cycle" => StepDraw::Cycle,
        "random" => StepDraw::Random,
        "random_no_repeat" => StepDraw::RandomNoRepeat,
        "velocity" => StepDraw::Velocity,
        "note" => StepDraw::Note,
        other => return Err(format!("step draw {other} is unknown")),
    })
}

// A composed note whose steps' segments are already built (`steps`, in order);
// marker ids resolve to the labels the segments' markers took.
pub fn composed(spec: &ComposedSpec, steps: Vec<Vec<atome_instrument::Segment>>, markers: &MarkerBuilder, zone_id: &str) -> Result<Composed, String> {
    let index = |id: &str, at: &str| spec.steps.iter().position(|step| step.id == id).ok_or_else(|| format!("{at}: step {id} is unknown"));
    let transitions = spec.transitions.iter().enumerate().map(|(number, transition)| {
        let at = format!("zone {zone_id} transition {number}");
        let trigger = match &transition.trigger {
            TriggerSpec::SegmentEnd => Trigger::SegmentEnd,
            TriggerSpec::Marker { marker_id } => Trigger::Marker(markers.label(marker_id, &at)?),
            TriggerSpec::Passes { count } => Trigger::Passes(*count),
            TriggerSpec::NoteOff => Trigger::NoteOff,
            TriggerSpec::Legato => Trigger::Legato,
            TriggerSpec::Velocity { above } => Trigger::Velocity(*above),
            TriggerSpec::Controller { number, above } => Trigger::Controller { number: *number, above: *above },
            TriggerSpec::Duration { ms } => Trigger::Duration { ms: *ms },
        };
        let follow = match &transition.follow {
            FollowSpec::Next => Follow::Next,
            FollowSpec::Previous => Follow::Previous,
            FollowSpec::Stop => Follow::Stop,
            FollowSpec::Repeat => Follow::Repeat,
            FollowSpec::Target { target_step } => Follow::Target(index(target_step, &at)?),
            FollowSpec::Random => Follow::Random,
            FollowSpec::JumpMarker { marker_id } => Follow::JumpMarker(markers.label(marker_id, &at)?),
            FollowSpec::Draw => Follow::Draw,
            FollowSpec::NoteOff => Follow::NoteOff,
            FollowSpec::Fade => Follow::Fade,
        };
        let from = transition.from.as_deref().map(|from| index(from, &at)).transpose()?;
        Ok(Transition { from, trigger, follow, fade_ms: transition.fade_ms })
    }).collect::<Result<Vec<_>, String>>()?;
    let steps = spec.steps.iter().zip(steps).map(|(step, segments)| Ok(Step { segments, draw: draw(&step.draw)? })).collect::<Result<Vec<_>, String>>()?;
    Ok(Composed { steps, transitions })
}
