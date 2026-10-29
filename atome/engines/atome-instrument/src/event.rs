// Note events dated to the frame inside the next block. The list is sized once;
// scheduling on the audio thread never allocates (an overflow is counted, not grown).

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum EventKind {
    // `velocity` is normalized 0..1 (MIDI 1..127 → 1/127..1).
    NoteOn { note: u8, velocity: f32 },
    NoteOff { note: u8 },
    Sustain { down: bool },
    // Pitch bend in semitones, already scaled by the bend range.
    PitchBend { semitones: f32 },
    // A MIDI controller moved, `value` normalized 0..1 (composed-note thresholds).
    Controller { number: u8, value: f32 },
    AllNotesOff,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct NoteEvent {
    pub offset: u32,
    pub kind: EventKind,
}

impl NoteEvent {
    pub fn note_on(offset: u32, note: u8, velocity: f32) -> Self {
        Self { offset, kind: EventKind::NoteOn { note, velocity } }
    }

    pub fn note_off(offset: u32, note: u8) -> Self {
        Self { offset, kind: EventKind::NoteOff { note } }
    }
}

pub struct EventList {
    events: Vec<NoteEvent>,
    dropped: usize,
}

impl EventList {
    pub fn with_capacity(capacity: usize) -> Self {
        Self { events: Vec::with_capacity(capacity), dropped: 0 }
    }

    // Keeps the list ordered by offset; equal offsets keep their arrival order.
    pub fn push(&mut self, event: NoteEvent) {
        if self.events.len() == self.events.capacity() {
            self.dropped += 1;
            return;
        }
        let at = self.events.partition_point(|queued| queued.offset <= event.offset);
        self.events.insert(at, event);
    }

    pub fn as_slice(&self) -> &[NoteEvent] {
        &self.events
    }

    pub fn clear(&mut self) {
        self.events.clear();
    }

    // Events refused because the list was full (a host that floods a block).
    pub fn dropped(&self) -> usize {
        self.dropped
    }
}
