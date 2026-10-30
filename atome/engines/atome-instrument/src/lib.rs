// eVe instruments: a polyphonic generator is a `Processor` whose input is
// notes. The host schedules note events at their frame inside the next block;
// the instrument splits the block there, so a note lands on its exact frame.
// Nothing here allocates, locks or does IO once built: voices, players and
// scratch buffers are sized when the instrument is made, off the audio thread.
// A long sample streams from its source: its heads in memory, the rest read by
// a worker thread into rings the voices own (residency.rs, stream.rs).

pub mod action_queue;
pub mod composed;
pub mod event;
pub mod interp;
pub mod keymap;
pub mod markers;
pub mod pool;
pub mod reading;
pub mod residency;
pub mod sample;
pub mod sampler;
pub mod segment;
pub mod stream;
#[cfg(not(target_arch = "wasm32"))]
pub mod stretch;
pub mod voice;
pub mod zone;

pub use action_queue::{ActionQueue, FiredMarker};
pub use composed::{Composed, Follow, Step, StepDraw, Transition, Trigger};
pub use event::{EventKind, NoteEvent};
pub use keymap::{Keymap, Switches};
pub use markers::{Marker, MarkerKind, MarkerSpan, When};
pub use sample::{SampleBank, SampleData, Span, SpanFrames};
pub use sampler::{Sampler, VoiceMode};
pub use segment::{LoopMode, LoopSpec, Playback, Segment};
pub use stream::{FrameSource, Streams};
pub use zone::{Draw, Stack, Zone, ZoneFilter};
