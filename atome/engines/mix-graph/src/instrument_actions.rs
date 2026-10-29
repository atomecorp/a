// The command markers an instrument fired (Q7), as a host drains them off the
// audio thread: one queue per instrument, kept across its rebuilds, and the
// marker table of each build the queue may still hold reports from. A report
// from a build older than the last `KEPT_BUILDS` is counted as stale.

use crate::instrument_notes::MarkerInfo;
use atome_instrument::ActionQueue;
use serde::Serialize;
use std::collections::VecDeque;
use std::sync::Arc;

const QUEUE_CAPACITY: usize = 256;
const KEPT_BUILDS: usize = 4;

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct FiredAction {
    #[serde(flatten)]
    pub marker: MarkerInfo,
    pub note: u8,
    // The instrument's rendered-frame clock at the crossing.
    pub frame: u64,
    // The crossing's number within its note.
    pub count: u32,
}

#[derive(Clone, Debug, Default, PartialEq, Serialize)]
pub struct DrainedActions {
    pub actions: Vec<FiredAction>,
    // Firings the full queue refused, and reports from forgotten builds.
    pub dropped: usize,
    pub stale: usize,
    // Frames a streamed sample's ring could not supply in time (played silent),
    // and the source reads that failed (filled by a host that streams).
    pub starved: usize,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub failures: Vec<String>,
}

pub struct ActionBook {
    queue: Arc<ActionQueue>,
    generation: u16,
    builds: VecDeque<(u16, Vec<MarkerInfo>)>,
}

impl ActionBook {
    pub fn new() -> Self {
        Self { queue: Arc::new(ActionQueue::new(QUEUE_CAPACITY)), generation: 0, builds: VecDeque::with_capacity(KEPT_BUILDS) }
    }

    pub fn queue(&self) -> Arc<ActionQueue> {
        self.queue.clone()
    }

    pub fn generation(&self) -> u16 {
        self.generation
    }

    // A new build of the instrument: its generation, whose marker table is kept.
    pub fn record(&mut self, infos: Vec<MarkerInfo>) -> u16 {
        self.generation = self.generation.wrapping_add(1);
        if self.builds.len() == KEPT_BUILDS {
            self.builds.pop_front();
        }
        self.builds.push_back((self.generation, infos));
        self.generation
    }

    pub fn drain(&self) -> DrainedActions {
        let mut drained = DrainedActions { dropped: self.queue.take_dropped(), starved: self.queue.take_starved(), ..DrainedActions::default() };
        self.queue.drain(|fired| {
            let info = self.builds.iter().find(|(generation, _)| *generation == fired.generation).and_then(|(_, infos)| infos.get(fired.marker as usize));
            match info {
                Some(info) => drained.actions.push(FiredAction { marker: info.clone(), note: fired.note, frame: fired.frame, count: fired.count }),
                None => drained.stale += 1,
            }
        });
        drained
    }
}

impl Default for ActionBook {
    fn default() -> Self {
        Self::new()
    }
}
