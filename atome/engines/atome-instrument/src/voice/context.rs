// What a voice reads and reports to while it renders: the instrument's samples,
// tables, keymap (its markers), action queue and controllers, and its clock.

use crate::action_queue::{ActionQueue, FiredMarker};
use crate::interp::SincTables;
use crate::keymap::Keymap;
use crate::reading::Source;
use crate::sample::SampleBank;

pub struct Context<'a> {
    pub bank: &'a SampleBank,
    pub tables: &'a SincTables,
    pub keymap: &'a mut Keymap,
    pub actions: &'a ActionQueue,
    pub generation: u16,
    pub controllers: &'a [f32; 128],
    // The instrument's rendered-frame clock at the first frame rendered.
    pub now: u64,
}

impl<'a> Context<'a> {
    // How a player reads `sample` through its ring `ring`.
    pub fn source(&self, sample: usize, ring: usize) -> Source<'a> {
        self.bank.source(sample, ring, self.actions)
    }

    // A marker crossed at `frame` by note `note`: counted in the note's
    // `crossings`; when « When » lets it fire, reported if it names a command.
    // Answers its label when it fired.
    pub(super) fn fire(
        &mut self,
        crossings: &mut [u32],
        marker: usize,
        note: u8,
        frame: u64,
    ) -> Option<u16> {
        let count = self.keymap.markers_mut().fires(marker, crossings)?;
        let fired = *self.keymap.markers().get(marker);
        if fired.reports {
            self.actions.push(FiredMarker {
                marker: marker as u32,
                generation: self.generation,
                note,
                count,
                frame,
            });
        }
        Some(fired.label)
    }
}
