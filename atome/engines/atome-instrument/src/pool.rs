// The voices of an instrument, made once. A new note takes a free voice; past
// the polyphony it steals one — the oldest already released, else the oldest —
// which fades out in a few milliseconds while the new note starts beside it.

use crate::voice::Voice;
use crate::zone::MAX_PLAYERS;

pub struct VoicePool {
    voices: Vec<Voice>,
}

impl VoicePool {
    // `capacity` exceeds the largest polyphony by a margin for the voices still fading.
    pub fn new(capacity: usize) -> Self {
        // Voice `v` reads through rings `v × MAX_PLAYERS..` of a streaming bank.
        Self { voices: (0..capacity).map(|index| Voice::with_rings(index * MAX_PLAYERS)).collect() }
    }

    pub fn voices(&self) -> &[Voice] {
        &self.voices
    }

    pub fn voices_mut(&mut self) -> &mut [Voice] {
        &mut self.voices
    }

    pub fn sounding(&self) -> usize {
        self.voices.iter().filter(|voice| voice.active && !voice.choking).count()
    }

    // A voice to start a note on, after stealing one if `polyphony` is reached.
    pub fn take(&mut self, polyphony: usize) -> usize {
        if self.sounding() >= polyphony.max(1) {
            let victim = self
                .voices
                .iter()
                .enumerate()
                .filter(|(_, voice)| voice.active && !voice.choking)
                .min_by_key(|(_, voice)| (voice.key_down || voice.sustained, voice.started_at))
                .map(|(index, _)| index);
            if let Some(index) = victim {
                self.voices[index].choke();
            }
        }
        if let Some(index) = self.voices.iter().position(|voice| !voice.active) {
            return index;
        }
        // Every voice is busy, even fading ones: the oldest is cut short.
        self.voices.iter().enumerate().min_by_key(|(_, voice)| (!voice.choking, voice.started_at)).map(|(index, _)| index).expect("a pool has voices")
    }
}
