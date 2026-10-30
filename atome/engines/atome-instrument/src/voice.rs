// One sounding note of one zone: up to four takes read together (a mix, a
// layer seam), or a composed note's segment and the one it fades from
// (voice/composed_play.rs), shaped by the amplitude envelope. The markers its
// segments cross fire here (their « When » counted per note). A voice is
// preallocated and reused; starting, releasing and choking it never allocates.

mod composed_play;

use crate::action_queue::{ActionQueue, FiredMarker};
use crate::interp::SincTables;
use crate::keymap::{Keymap, Pick};
use crate::markers::Hits;
use crate::reading::Source;
use crate::sample::{SampleBank, SampleData};
use crate::segment::{LoopMode, SegmentPlayer};
use crate::zone::{ZoneFilter, MAX_PLAYERS};
use composed_play::Composition;
use atome_dsp::biquad::{Coefficients, Section};
use atome_dsp::envelope::{self, Envelope};
use atome_dsp::{Processor, Smoothed, StereoBlock};
#[cfg(not(target_arch = "wasm32"))]
use crate::stretch::VoiceStretch;

// Control rate of the pitch (glide, bend): the reading step is set every 32 frames.
pub const CONTROL_FRAMES: usize = 32;
const CHOKE_MS: f32 = 3.0;

// What a voice reads and reports to while it renders.
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
    fn fire(&mut self, crossings: &mut [u32], marker: usize, note: u8, frame: u64) -> Option<u16> {
        let count = self.keymap.markers_mut().fires(marker, crossings)?;
        let fired = *self.keymap.markers().get(marker);
        if fired.reports {
            self.actions.push(FiredMarker { marker: marker as u32, generation: self.generation, note, count, frame });
        }
        Some(fired.label)
    }
}

// The reading step of `segment`'s sample for a pitch in semitones.
fn reading_step(data: &SampleData, sample_rate: f32, pitch: f32, root: u8, tune_cents: f32) -> f64 {
    data.sample_rate as f64 / sample_rate as f64 * 2f64.powf((pitch - root as f32 + tune_cents / 100.0) as f64 / 12.0)
}

#[derive(Debug, Clone, Copy)]
pub struct Shape {
    pub attack_ms: f32,
    pub decay_ms: f32,
    pub sustain: f32,
    pub release_ms: f32,
    pub glide_ms: f32,
}

pub struct Voice {
    players: [SegmentPlayer; MAX_PLAYERS],
    count: usize,
    envelope: Envelope,
    pitch: Smoothed,
    sample_rate: f32,
    pub active: bool,
    pub zone: usize,
    pub note: u8,
    pub velocity: f32,
    pub level: f32,
    pub trigger: u64,
    pub key_down: bool,
    pub sustained: bool,
    pub choking: bool,
    pub one_shot: bool,
    pub started_at: u64,
    // A sustain loop plays its own release: the key going up does not close the envelope.
    holds_gate: bool,
    // Stretched segments: the takes are read at the note's pitch into the stretcher,
    // which keeps the segment's duration.
    #[cfg(not(target_arch = "wasm32"))]
    stretcher: Option<VoiceStretch>,
    stretching: bool,
    factor: f32,
    root: u8,
    tail: usize,
    #[cfg(not(target_arch = "wasm32"))]
    input_left: Vec<f32>,
    #[cfg(not(target_arch = "wasm32"))]
    input_right: Vec<f32>,
    // Crossings of each marker of the instrument during this note.
    crossings: Vec<u32>,
    composition: Composition,
    // Its zone's filter (zone.rs), designed at the note: one section per side.
    filter: Option<Coefficients>,
    filter_sections: [Section; 2],
}

impl Voice {
    // Its players read through rings `base..base + MAX_PLAYERS` of a streaming bank.
    pub fn with_rings(base: usize) -> Self {
        let mut voice = Self::new();
        for (slot, player) in voice.players.iter_mut().enumerate() {
            player.set_ring(base + slot);
        }
        voice
    }

    pub fn new() -> Self {
        Self {
            players: [SegmentPlayer::IDLE; MAX_PLAYERS],
            count: 0,
            envelope: Envelope::new(),
            pitch: Smoothed::new(60.0, 0.0),
            sample_rate: 48_000.0,
            active: false,
            zone: 0,
            note: 60,
            velocity: 0.0,
            level: 0.0,
            trigger: 0,
            key_down: false,
            sustained: false,
            choking: false,
            one_shot: false,
            started_at: 0,
            holds_gate: false,
            #[cfg(not(target_arch = "wasm32"))]
            stretcher: None,
            stretching: false,
            factor: 1.0,
            root: 60,
            tail: 0,
            #[cfg(not(target_arch = "wasm32"))]
            input_left: Vec::new(),
            #[cfg(not(target_arch = "wasm32"))]
            input_right: Vec::new(),
            crossings: Vec::new(),
            composition: Composition::IDLE,
            filter: None,
            filter_sections: [Section::default(); 2],
        }
    }

    // `stretch`: the keymap has stretched segments, so this voice gets a
    // stretcher; `markers`: the instrument's marker count.
    pub fn prepare(&mut self, sample_rate: f32, max_block: usize, stretch: bool, markers: usize) {
        self.sample_rate = sample_rate;
        self.crossings = vec![0; markers];
        self.envelope.prepare(sample_rate, max_block);
        #[cfg(not(target_arch = "wasm32"))]
        if stretch {
            let stretcher = VoiceStretch::new(max_block);
            self.input_left = vec![0.0; stretcher.input_capacity()];
            self.input_right = vec![0.0; stretcher.input_capacity()];
            self.stretcher = Some(stretcher);
        }
        #[cfg(target_arch = "wasm32")]
        assert!(!stretch, "the keymap refuses stretched segments on this platform");
    }

    #[allow(clippy::too_many_arguments)]
    pub fn start(&mut self, context: &mut Context, picks: &[Pick], note: u8, velocity: f32, level: f32, shape: Shape, one_shot: bool, transpose: f32) {
        self.count = 0;
        self.holds_gate = false;
        self.composition = Composition::IDLE;
        let zones = context.keymap.zones();
        for pick in picks {
            let take = if one_shot { zones[pick.zone].release_takes[pick.take] } else { zones[pick.zone].takes[pick.take] };
            let data = context.bank.get(take.sample).expect("keymap checked its samples");
            let gain = atome_dsp::db_to_amplitude(zones[pick.zone].gain_db);
            self.players[self.count].start(take, data, velocity, pick.level * level * gain);
            self.holds_gate |= matches!(take.looping, Some(spec) if spec.mode == LoopMode::Sustain);
            self.count += 1;
        }
        self.begin(note, velocity, level, shape, one_shot);
        self.begin_stretch(context, note as f32 + transpose);
    }

    // The envelope, pitch and flags of a new note.
    fn begin(&mut self, note: u8, velocity: f32, level: f32, shape: Shape, one_shot: bool) {
        self.crossings.fill(0);
        self.pitch = Smoothed::new(note as f32, shape.glide_ms.max(0.1));
        self.pitch.prepare(self.sample_rate);
        self.envelope.reset();
        let (attack, decay, sustain) = if one_shot { (0.1, 1.0, 1.0) } else { (shape.attack_ms, shape.decay_ms, shape.sustain) };
        self.envelope.set_param(envelope::ATTACK_MS, attack);
        self.envelope.set_param(envelope::DECAY_MS, decay);
        self.envelope.set_param(envelope::SUSTAIN, sustain);
        self.envelope.set_param(envelope::RELEASE_MS, shape.release_ms);
        self.envelope.set_param(envelope::GATE, 1.0);
        self.active = true;
        self.note = note;
        self.velocity = velocity;
        self.level = level;
        self.key_down = !one_shot;
        self.sustained = false;
        self.choking = false;
        self.one_shot = one_shot;
    }

    // The zone's filter for this note (its cutoff following key and velocity), or none.
    pub fn set_filter(&mut self, filter: Option<ZoneFilter>, note: u8, velocity: f32) {
        self.filter = filter.map(|filter| Coefficients::design(filter.shape, self.sample_rate, filter.cutoff_for(note, velocity), filter.q, 0.0));
        self.filter_sections = [Section::default(); 2];
    }

    // A one-shot zone's note: the key let go no longer ends it, its takes play to their end.
    pub fn play_to_end(&mut self) {
        self.key_down = false;
        self.one_shot = true;
    }

    fn filter_block(&mut self, left: &mut [f32], right: &mut [f32]) {
        let Some(coefficients) = self.filter else { return };
        let [left_section, right_section] = &mut self.filter_sections;
        for sample in left.iter_mut() {
            *sample = left_section.tick(&coefficients, *sample);
        }
        for sample in right.iter_mut() {
            *sample = right_section.tick(&coefficients, *sample);
        }
    }

    // A note on stretched segments primes its stretcher with the first one.
    fn begin_stretch(&mut self, context: &mut Context, pitch: f32) {
        let first = *self.players[0].segment();
        self.stretching = first.is_stretched();
        if self.stretching {
            self.factor = first.stretch;
            self.root = first.root;
            self.tail = 0;
            self.prime(context, pitch);
        }
    }

    // Legato: the same voice glides to another note, nothing restarts (a
    // composed note may follow its « legato » transition).
    pub fn glide_to(&mut self, note: u8) {
        self.note = note;
        self.pitch.set(note as f32);
        self.composition.legato |= self.composition.on;
    }

    // A controller moved: a composed note checks its controller transitions.
    pub fn controller_moved(&mut self) {
        self.composition.controller |= self.composition.on;
    }

    pub fn release(&mut self) {
        self.key_down = false;
        self.sustained = false;
        if self.composition.on {
            // Taken at the next frame rendered: the release's own frame.
            self.composition.release = true;
            return;
        }
        for player in &mut self.players[..self.count] {
            player.release();
        }
        if !self.holds_gate {
            self.envelope.set_param(envelope::GATE, 0.0);
        }
    }

    // Silenced within a few milliseconds: a choke, or a voice stolen for a new note.
    pub fn choke(&mut self) {
        self.choking = true;
        self.key_down = false;
        self.envelope.set_param(envelope::RELEASE_MS, CHOKE_MS);
        self.envelope.set_param(envelope::GATE, 0.0);
    }

    // Adds this voice into `left`/`right` (scratch the caller cleared).
    // `transpose` is the bend plus the instrument's tuning, in semitones.
    pub fn render(&mut self, context: &mut Context, transpose: f32, left: &mut [f32], right: &mut [f32]) {
        if self.stretching {
            self.render_stretched(context, transpose, left, right);
            return;
        }
        let frames = left.len();
        let mut at = 0;
        while at < frames {
            let end = (at + CONTROL_FRAMES).min(frames);
            let mut pitch = 0.0;
            for _ in at..end {
                pitch = self.pitch.tick();
            }
            self.read(context, pitch + transpose, at, &mut left[at..end], &mut right[at..end]);
            at = end;
        }
        self.filter_block(left, right);
        self.envelope.process(&mut StereoBlock::new(left, right));
        if self.envelope.is_idle() || self.finished() {
            self.active = false;
        }
    }

    fn finished(&self) -> bool {
        if self.composition.on {
            return self.composition.ended;
        }
        self.players[..self.count].iter().all(SegmentPlayer::is_finished)
    }

    // Reads the note's segments at `pitch` (semitones, the note plus bend and
    // tuning) into `left`/`right`, `at` frames into this render.
    fn read(&mut self, context: &mut Context, pitch: f32, at: usize, left: &mut [f32], right: &mut [f32]) {
        if self.composition.on {
            self.read_composed(context, pitch, at, left, right);
            return;
        }
        let mut hits = Hits::default();
        for player in &mut self.players[..self.count] {
            let segment = *player.segment();
            let source = context.source(segment.sample, player.ring());
            let step = reading_step(source.data(), self.sample_rate, pitch, segment.root, segment.tune_cents);
            let mut done = 0;
            while done < left.len() && !player.is_finished() {
                let markers = context.keymap.markers().span(segment.markers);
                done += player.render(&source, context.tables, step, markers, &mut left[done..], &mut right[done..], &mut hits);
                let frame = context.now + (at + done) as u64;
                for &index in hits.markers() {
                    context.fire(&mut self.crossings, segment.markers.first as usize + index as usize, self.note, frame);
                }
            }
        }
    }

    // Reads `frames` input frames at this pitch into the stretcher's input buffers, from `at`.
    #[cfg(not(target_arch = "wasm32"))]
    fn read_takes(&mut self, context: &mut Context, pitch: f32, at: usize, frames: usize) {
        let mut left = std::mem::take(&mut self.input_left);
        let mut right = std::mem::take(&mut self.input_right);
        left[at..at + frames].fill(0.0);
        right[at..at + frames].fill(0.0);
        self.read(context, pitch, at, &mut left[at..at + frames], &mut right[at..at + frames]);
        self.input_left = left;
        self.input_right = right;
    }

    // How fast the first take is read at this pitch, relative to its own rate.
    #[cfg(not(target_arch = "wasm32"))]
    fn speed(&self, pitch: f32) -> f32 {
        2f32.powf((pitch - self.root as f32) / 12.0)
    }

    #[cfg(not(target_arch = "wasm32"))]
    fn prime(&mut self, context: &mut Context, pitch: f32) {
        let ratio = VoiceStretch::ratio(self.factor, self.speed(pitch));
        let (opening, ahead) = self.stretcher.as_ref().expect("a stretched keymap prepares a stretcher per voice").priming_frames(ratio);
        self.read_takes(context, pitch, 0, opening + ahead);
        let stretcher = self.stretcher.as_mut().expect("prepared");
        let (left, right) = (&self.input_left, &self.input_right);
        stretcher.prime((&left[..opening], &right[..opening]), (&left[opening..opening + ahead], &right[opening..opening + ahead]), ratio);
    }

    #[cfg(target_arch = "wasm32")]
    fn prime(&mut self, _context: &mut Context, _pitch: f32) {
        unreachable!("the keymap refuses stretched segments on this platform");
    }

    #[cfg(not(target_arch = "wasm32"))]
    fn render_stretched(&mut self, context: &mut Context, transpose: f32, left: &mut [f32], right: &mut [f32]) {
        let frames = left.len();
        let mut at = 0;
        while at < frames {
            let end = (at + CONTROL_FRAMES).min(frames);
            let mut pitch = 0.0;
            for _ in at..end {
                pitch = self.pitch.tick();
            }
            let pitch = pitch + transpose;
            let ratio = VoiceStretch::ratio(self.factor, self.speed(pitch));
            let input = self.stretcher.as_mut().expect("prepared").input_for(end - at, ratio);
            self.read_takes(context, pitch, 0, input);
            if self.finished() {
                self.tail += end - at;
            }
            let stretcher = self.stretcher.as_mut().expect("prepared");
            stretcher.process((&self.input_left[..input], &self.input_right[..input]), &mut left[at..end], &mut right[at..end]);
            at = end;
        }
        self.filter_block(left, right);
        self.envelope.process(&mut StereoBlock::new(left, right));
        let ringing = self.stretcher.as_ref().expect("prepared").tail_frames();
        if self.envelope.is_idle() || self.tail >= ringing {
            self.active = false;
        }
    }

    #[cfg(target_arch = "wasm32")]
    fn render_stretched(&mut self, _context: &mut Context, _transpose: f32, _left: &mut [f32], _right: &mut [f32]) {
        unreachable!("the keymap refuses stretched segments on this platform");
    }

    // Started on a stretched take: its stretcher was primed at the note.
    pub fn is_stretching(&self) -> bool {
        self.stretching
    }

    pub fn players(&self) -> &[SegmentPlayer] {
        &self.players[..self.count]
    }
}

impl Default for Voice {
    fn default() -> Self {
        Self::new()
    }
}
