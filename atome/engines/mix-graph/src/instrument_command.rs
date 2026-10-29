// The instrument commands every host forwards as they come from the JS side
// (backend.kira.js): native through `audio_instrument`, the Web engine and the
// direct path's worklet with the same JSON. Samples are loaded by each host
// (a file decoded natively, PCM decoded by the page on the Web).

use crate::instrument_actions::DrainedActions;
use crate::instrument_spec::InstrumentSpec;
use crate::MixGraph;
use atome_instrument::EventKind;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Deserialize)]
#[serde(tag = "command", rename_all = "snake_case")]
pub enum InstrumentCommand {
    Set { instrument: InstrumentSpec },
    Remove { instrument_id: String },
    UnloadSample { sample_id: String },
    // A note now, or at `frame` of the instrument's own rendered-frame clock.
    Event { instrument_id: String, event: NoteKind, #[serde(default)] frame: Option<u64> },
    Param { instrument_id: String, name: String, value: f32 },
    Clock { instrument_id: String },
    // The command markers fired since the last drain (Q7: the host runs them).
    DrainActions { instrument_id: String },
}

// What a command answers: nothing, the instrument's clock, or the fired markers.
#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(untagged)]
pub enum InstrumentAnswer {
    Done,
    Frames(u64),
    Actions(DrainedActions),
}

#[derive(Clone, Copy, Debug, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum NoteKind {
    // MIDI velocity 1..127.
    NoteOn { note: u8, velocity: u8 },
    NoteOff { note: u8 },
    Sustain { down: bool },
    PitchBend { semitones: f32 },
    // MIDI controller `number` at `value` 0..127.
    Controller { number: u8, value: u8 },
    AllNotesOff,
}

fn event_kind(kind: NoteKind) -> Result<EventKind, String> {
    let note = |note: u8| if note <= 127 { Ok(note) } else { Err(format!("note {note} is outside 0..127")) };
    Ok(match kind {
        NoteKind::NoteOn { note: key, velocity } => EventKind::NoteOn { note: note(key)?, velocity: f32::from(velocity.clamp(1, 127)) / 127.0 },
        NoteKind::NoteOff { note: key } => EventKind::NoteOff { note: note(key)? },
        NoteKind::Sustain { down } => EventKind::Sustain { down },
        NoteKind::PitchBend { semitones } => EventKind::PitchBend { semitones },
        NoteKind::Controller { number, value } => EventKind::Controller { number: note(number)?, value: f32::from(value.min(127)) / 127.0 },
        NoteKind::AllNotesOff => EventKind::AllNotesOff,
    })
}

// Runs a command on `graph`; `Clock` answers the instrument's rendered frames,
// `DrainActions` the markers it fired.
pub fn run(graph: &mut MixGraph, command: InstrumentCommand) -> Result<InstrumentAnswer, String> {
    let done = |_| InstrumentAnswer::Done;
    match command {
        InstrumentCommand::Set { instrument } => graph.set_instrument(instrument).map(done),
        InstrumentCommand::Remove { instrument_id } => {
            graph.instruments().remove(&instrument_id);
            Ok(InstrumentAnswer::Done)
        }
        InstrumentCommand::UnloadSample { sample_id } => graph.instruments().unload_sample(&sample_id).map(done),
        InstrumentCommand::Event { instrument_id, event, frame } => graph.instruments_ref().event(&instrument_id, event_kind(event)?, frame).map(done),
        InstrumentCommand::Param { instrument_id, name, value } => graph.instruments_ref().set_param(&instrument_id, &name, value).map(done),
        InstrumentCommand::Clock { instrument_id } => graph.instruments_ref().rendered_frames(&instrument_id).map(InstrumentAnswer::Frames),
        InstrumentCommand::DrainActions { instrument_id } => graph.instruments_ref().drain_actions(&instrument_id).map(InstrumentAnswer::Actions),
    }
}
