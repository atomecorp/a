// A note on or off on the voices: poly starts a voice per matching zone; mono and
// legato keep a stack of held notes (the last one sounds, legato glides to it);
// a zone's cuts choke what they name; the key let go sounds its release take,
// quieter the longer it was held. A keyswitch key chooses which switched zones
// sound and plays nothing unless a zone covers it; a one-shot zone ignores the
// key let go; a zone's filter is set on each voice it starts.
use super::{Sampler, VoiceMode, HELD_NOTES, POLYPHONY, TUNE_CENTS};
use crate::keymap::{Pick, NO_PICK};
use crate::zone::{midi_velocity, MAX_PLAYERS};

impl Sampler {
    pub(super) fn note_on(&mut self, note: u8, velocity: f32) {
        if self.keymap.switches().is_some_and(|switches| switches.contains(note)) {
            self.switch = note;
            if !self.sounds(note, Some(velocity)) {
                return;
            }
        }
        if self.mode() == VoiceMode::Poly {
            self.start_note(note, velocity);
            return;
        }
        let previous = self.held_count;
        self.forget(note);
        if self.held_count < HELD_NOTES {
            self.held[self.held_count] = note;
            self.held_count += 1;
        }
        self.held_velocity = velocity;
        if self.mode() == VoiceMode::Legato && previous > 0 && self.glide_held(note) {
            return;
        }
        self.cut_held();
        self.start_note(note, velocity);
    }

    pub(super) fn note_off(&mut self, note: u8) {
        if self.keymap.switches().is_some_and(|switches| switches.contains(note)) && !self.sounds(note, None) {
            return;
        }
        if self.mode() != VoiceMode::Poly && self.held_count > 0 {
            let was_top = self.held[self.held_count - 1] == note;
            self.forget(note);
            if was_top && self.held_count > 0 {
                let back = self.held[self.held_count - 1];
                if self.mode() == VoiceMode::Legato && self.glide_held(back) {
                    return;
                }
                self.cut_held();
                self.start_note(back, self.held_velocity);
                return;
            }
        }
        let now = self.now;
        let sample_rate = self.sample_rate;
        // (zone, voice level, seconds held) of each voice the key lets go.
        let mut releases: [(usize, f32, f32); 8] = [(0, 0.0, 0.0); 8];
        let mut release_count = 0;
        for voice in self.pool.voices_mut().iter_mut() {
            if !voice.active || !voice.key_down || voice.note != note || voice.one_shot {
                continue;
            }
            if release_count < releases.len() {
                let held = (now - voice.started_at) as f32 / sample_rate;
                releases[release_count] = (voice.zone, voice.level, held);
                release_count += 1;
            }
            if self.sustain_down {
                voice.key_down = false;
                voice.sustained = true;
            } else {
                voice.release();
            }
        }
        for &(zone, level, held) in &releases[..release_count] {
            self.trigger_release(zone, note, level, held);
        }
    }

    // A release take sounds quieter the longer the key was held.
    pub(super) fn trigger_release(&mut self, zone: usize, note: u8, level: f32, held_seconds: f32) {
        let Some(take) = self.keymap.pick_release(zone) else { return };
        let decay = self.keymap.zone(zone).release_decay_s.max(0.001);
        let picks = [Pick { zone, take, level: 1.0 }];
        let shape = self.shape();
        let index = self.pool.take(self.values[POLYPHONY as usize] as usize);
        let transpose = self.bend + self.values[TUNE_CENTS as usize] / 100.0;
        let voice = &mut self.pool.voices_mut()[index];
        voice.start(&mut context!(self), &picks, note, 1.0, level * (-held_seconds / decay).exp(), shape, true, transpose);
        voice.set_filter(self.keymap.zone(zone).filter, note, 1.0);
        self.primes += voice.is_stretching() as usize;
        voice.zone = zone;
        voice.started_at = self.now;
    }

    pub(super) fn start_note(&mut self, note: u8, velocity: f32) {
        self.triggers += 1;
        let level = self.velocity_level(velocity);
        let shape = self.shape();
        let polyphony = self.values[POLYPHONY as usize] as usize;
        let midi = midi_velocity(velocity);
        let transpose = self.bend + self.values[TUNE_CENTS as usize] / 100.0;
        for zone in 0..self.keymap.len() {
            if !self.keymap.zone(zone).contains(note, midi) || self.keymap.zone(zone).switch.is_some_and(|key| key != self.switch) {
                continue;
            }
            for cut in 0..self.keymap.zone(zone).cuts.len() {
                let target = self.keymap.zone(zone).cuts[cut];
                for voice in self.pool.voices_mut().iter_mut().filter(|voice| voice.active && voice.zone == target && !voice.choking) {
                    voice.choke();
                }
            }
            let index = self.pool.take(polyphony);
            if self.keymap.zone(zone).composed.is_some() {
                self.pool.voices_mut()[index].start_composed(&mut context!(self), zone, note, velocity, level, shape, transpose);
            } else {
                let mut picks = [NO_PICK; MAX_PLAYERS];
                let count = self.keymap.pick(zone, velocity, &mut picks);
                self.pool.voices_mut()[index].start(&mut context!(self), &picks[..count], note, velocity, level, shape, false, transpose);
            }
            let voice = &mut self.pool.voices_mut()[index];
            let played = self.keymap.zone(zone);
            voice.set_filter(played.filter, note, velocity);
            if played.one_shot {
                voice.play_to_end();
            }
            self.primes += voice.is_stretching() as usize;
            voice.zone = zone;
            voice.trigger = self.triggers;
            voice.started_at = self.now;
        }
    }

    // Legato: the held voices glide to `note`; false when none is held.
    pub(super) fn glide_held(&mut self, note: u8) -> bool {
        let trigger = self.triggers;
        let mut glided = false;
        for voice in self.pool.voices_mut().iter_mut().filter(|voice| voice.active && voice.key_down && voice.trigger == trigger) {
            voice.glide_to(note);
            glided = true;
        }
        glided
    }

    pub(super) fn cut_held(&mut self) {
        for voice in self.pool.voices_mut().iter_mut().filter(|voice| voice.active && !voice.one_shot && !voice.choking) {
            voice.choke();
        }
    }

    // Some zone (for the current keyswitch) plays this note, at this velocity or at any.
    fn sounds(&self, note: u8, velocity: Option<f32>) -> bool {
        self.keymap.zones().iter().any(|zone| zone.switch.is_none_or(|key| key == self.switch) && match velocity {
            Some(velocity) => zone.contains(note, midi_velocity(velocity)),
            None => (zone.key_low..=zone.key_high).contains(&note),
        })
    }

    pub(super) fn forget(&mut self, note: u8) {
        if let Some(at) = self.held[..self.held_count].iter().position(|&held| held == note) {
            self.held.copy_within(at + 1..self.held_count, at);
            self.held_count -= 1;
        }
    }
}
