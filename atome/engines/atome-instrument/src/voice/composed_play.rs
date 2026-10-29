// A voice playing a composed note (composed.rs): the drawn segment of the
// current step on player 0, and during a crossfade the segment it leaves on
// player 1 (two players per voice, equal power). Transitions are taken at the
// frame their trigger happens: a player stops its run on the frame that
// crossed a marker or wrapped its loop, a duration ends a run on its frame, and
// key releases, tied notes and controllers (applied between two renders, at
// their event's frame) are taken at the start of the next render.
//
// Within one frame the crossed markers fire in order (markers.rs); the first
// whose label a transition names moves the note, the others still fire their
// commands. Then, if nothing moved: the loop's passes, the segment's end, the
// step's duration. A step entered checks its velocity and controller
// thresholds at once, at most once per step for one entry chain.

use super::{reading_step, Context, Voice, CHOKE_MS};
use crate::composed::{Follow, Transition, Trigger};
use crate::markers::Hits;
use crate::segment::LoopMode;
use crate::voice::Shape;
use crate::zone::midi_velocity;
use atome_dsp::{envelope, Processor};
use std::f32::consts::FRAC_PI_2;

// A crossfade is mixed in runs of this many frames (stack buffers, no allocation).
const FADE_RUN: usize = 64;

#[derive(Debug, Clone, Copy)]
pub(super) struct Composition {
    pub on: bool,
    // The current segment is done and nothing follows: the note ends.
    pub ended: bool,
    // Stopped or fading out: no transition is taken any more.
    stopping: bool,
    // Events applied between renders, taken at the next frame rendered.
    pub release: bool,
    pub legato: bool,
    pub controller: bool,
    step: usize,
    take: usize,
    // Frames played in this step, and when its duration transition is due.
    entered: u64,
    due: u64,
    // Crossfade frames left, of `fade_total` (player 1 fading out).
    fade: usize,
    fade_total: usize,
}

impl Composition {
    pub const IDLE: Self = Self {
        on: false, ended: false, stopping: false, release: false, legato: false, controller: false,
        step: 0, take: 0, entered: 0, due: u64::MAX, fade: 0, fade_total: 0,
    };
}

impl Voice {
    #[allow(clippy::too_many_arguments)]
    pub fn start_composed(&mut self, context: &mut Context, zone: usize, note: u8, velocity: f32, level: f32, shape: Shape, transpose: f32) {
        self.zone = zone;
        self.holds_gate = false;
        self.count = 0;
        self.begin(note, velocity, level, shape, false);
        self.composition = Composition { on: true, ..Composition::IDLE };
        self.enter(context, 0, None, 0.0);
        self.settle(context);
        self.begin_stretch(context, note as f32 + transpose);
    }

    // The step's segment starts on player 0; the one playing fades out on
    // player 1 over `fade_ms`. `take`: the same segment again (a repeat).
    fn enter(&mut self, context: &mut Context, step: usize, take: Option<usize>, fade_ms: f32) {
        let take = take.unwrap_or_else(|| context.keymap.draw_step(self.zone, step, self.note, self.velocity));
        let zone = context.keymap.zone(self.zone);
        let composed = zone.composed.as_ref().expect("a composed zone");
        let segment = composed.steps[step].segments[take];
        let rate = self.sample_rate;
        let due = composed.transitions.iter().filter(|transition| transition.leaves(step))
            .filter_map(|transition| match transition.trigger {
                Trigger::Duration { ms } => Some(((ms * 0.001 * rate).round() as u64).max(1)),
                _ => None,
            })
            .min()
            .unwrap_or(u64::MAX);
        let gain = atome_dsp::db_to_amplitude(zone.gain_db);
        let data = context.bank.get(segment.sample).expect("keymap checked its samples");
        self.fade_from_current(fade_ms);
        self.players[0].start(segment, data, self.velocity, self.level * gain);
        if self.stretching {
            self.root = segment.root;
        }
        self.composition = Composition { step, take, entered: 0, due, ..self.composition };
    }

    // Player 0 moves to player 1 to fade out, unless the fade is nil or it is silent.
    fn fade_from_current(&mut self, fade_ms: f32) {
        let frames = (fade_ms * 0.001 * self.sample_rate).round() as usize;
        if frames > 0 && self.count > 0 && !self.players[0].is_finished() {
            // The player fading out keeps its ring; the next segment reads through player 1's.
            let spare = self.players[1].ring();
            self.players[1] = self.players[0];
            self.players[0].set_ring(spare);
            self.composition.fade = frames;
            self.composition.fade_total = frames;
            self.count = 2;
        } else {
            self.composition.fade = 0;
            self.count = 1;
        }
    }

    // The first transition leaving the current step whose trigger `matches`.
    fn transition(&self, context: &Context, matches: impl Fn(Trigger) -> bool) -> Option<Transition> {
        let composed = context.keymap.zone(self.zone).composed.as_ref()?;
        composed.transitions.iter().find(|transition| transition.leaves(self.composition.step) && matches(transition.trigger)).copied()
    }

    fn follow(&mut self, context: &mut Context, transition: Transition) {
        let steps = context.keymap.zone(self.zone).composed.as_ref().map_or(1, |composed| composed.steps.len());
        let (step, fade) = (self.composition.step, transition.fade_ms);
        match transition.follow {
            Follow::Next if step + 1 < steps => self.enter(context, step + 1, None, fade),
            Follow::Next | Follow::Fade => self.fade_out(fade),
            Follow::Previous => self.enter(context, step.saturating_sub(1), None, fade),
            Follow::Target(target) => self.enter(context, target, None, fade),
            Follow::Random => {
                let target = context.keymap.draw_below(steps);
                self.enter(context, target, None, fade);
            }
            Follow::Draw => self.enter(context, step, None, fade),
            Follow::Repeat => self.enter(context, step, Some(self.composition.take), fade),
            Follow::JumpMarker(label) => self.jump(context, label, fade),
            Follow::Stop => {
                self.composition.stopping = true;
                self.choke();
            }
            Follow::NoteOff => {
                self.key_down = false;
                self.sustained = false;
                self.let_go(context);
            }
        }
    }

    // A jump inside the current segment to its marker named `label` (no marker fires).
    fn jump(&mut self, context: &mut Context, label: u16, fade_ms: f32) {
        let span = self.players[0].segment().markers;
        let Some(frame) = context.keymap.markers().span(span).iter().find(|marker| marker.label == label).map(|marker| marker.frame) else { return };
        self.fade_from_current(fade_ms);
        self.players[0].seek(frame);
    }

    // The note fades out over `fade_ms` (a few milliseconds at least) and takes no transition any more.
    fn fade_out(&mut self, fade_ms: f32) {
        self.composition.stopping = true;
        self.envelope.set_param(envelope::RELEASE_MS, fade_ms.max(CHOKE_MS));
        self.envelope.set_param(envelope::GATE, 0.0);
    }

    // The key is let go: a « note-off » transition leads on (the envelope stays
    // open, the step plays out), else the loops let go and the envelope closes
    // (a sustain loop keeps it open: the rest of its region is the release).
    fn let_go(&mut self, context: &mut Context) {
        if !self.composition.stopping {
            if let Some(transition) = self.transition(context, |trigger| trigger == Trigger::NoteOff) {
                self.follow(context, transition);
                self.settle(context);
                return;
            }
        }
        for player in &mut self.players[..self.count] {
            player.release();
        }
        if !matches!(self.players[0].segment().looping, Some(spec) if spec.mode == LoopMode::Sustain) {
            self.envelope.set_param(envelope::GATE, 0.0);
        }
    }

    // Thresholds met on entering a step (velocity, controllers) lead on at once.
    fn settle(&mut self, context: &mut Context) {
        let steps = context.keymap.zone(self.zone).composed.as_ref().map_or(0, |composed| composed.steps.len());
        let velocity = midi_velocity(self.velocity);
        let controllers = context.controllers;
        for _ in 0..steps {
            if self.composition.stopping {
                return;
            }
            let met = |trigger| match trigger {
                Trigger::Velocity(above) => velocity >= above,
                Trigger::Controller { number, above } => controllers[number as usize] >= above,
                _ => false,
            };
            let Some(transition) = self.transition(context, met) else { return };
            self.follow(context, transition);
        }
    }

    fn take_pending(&mut self, context: &mut Context) {
        if std::mem::take(&mut self.composition.release) {
            self.let_go(context);
        }
        if std::mem::take(&mut self.composition.legato) && !self.composition.stopping {
            if let Some(transition) = self.transition(context, |trigger| trigger == Trigger::Legato) {
                self.follow(context, transition);
                self.settle(context);
            }
        }
        if std::mem::take(&mut self.composition.controller) {
            self.settle(context);
        }
    }

    // Reads the composed note at `pitch` into `left`/`right`, `at` frames into this render.
    pub(super) fn read_composed(&mut self, context: &mut Context, pitch: f32, at: usize, left: &mut [f32], right: &mut [f32]) {
        self.take_pending(context);
        let frames = left.len();
        let mut done = 0;
        while done < frames && !self.composition.ended {
            let composition = self.composition;
            let mut run = frames - done;
            if composition.due != u64::MAX && !composition.stopping {
                run = run.min(composition.due.saturating_sub(composition.entered).max(1) as usize);
            }
            let (left, right) = (&mut left[done..done + run], &mut right[done..done + run]);
            let (rendered, hits) = if self.count == 2 { self.read_fading(context, pitch, left, right) } else { self.read_player(context, 0, pitch, left, right) };
            done += rendered;
            self.composition.entered += rendered as u64;
            self.after(context, &hits, context.now + (at + done) as u64);
        }
    }

    // Player `index` over `left`/`right`: player 0 stops on its first hit, player 1 (fading out) reads on, its markers silent.
    fn read_player(&mut self, context: &Context, index: usize, pitch: f32, left: &mut [f32], right: &mut [f32]) -> (usize, Hits) {
        let player = &mut self.players[index];
        let segment = *player.segment();
        let source = context.source(segment.sample, player.ring());
        let step = reading_step(source.data(), self.sample_rate, pitch, segment.root, segment.tune_cents);
        let mut hits = Hits::default();
        if index == 0 {
            let rendered = if player.is_finished() { 0 } else { player.render(&source, context.tables, step, context.keymap.markers().span(segment.markers), left, right, &mut hits) };
            return (rendered, hits);
        }
        let mut done = 0;
        while done < left.len() && !player.is_finished() {
            done += player.render(&source, context.tables, step, &[], &mut left[done..], &mut right[done..], &mut hits);
        }
        (left.len(), Hits::default())
    }

    // Both players into stack buffers, mixed with equal-power ramps.
    fn read_fading(&mut self, context: &Context, pitch: f32, left: &mut [f32], right: &mut [f32]) -> (usize, Hits) {
        let frames = left.len().min(FADE_RUN).min(self.composition.fade);
        let mut incoming = ([0.0f32; FADE_RUN], [0.0f32; FADE_RUN]);
        let mut outgoing = ([0.0f32; FADE_RUN], [0.0f32; FADE_RUN]);
        let (rendered, hits) = self.read_player(context, 0, pitch, &mut incoming.0[..frames], &mut incoming.1[..frames]);
        let run = if hits.any() { rendered } else { frames };
        self.read_player(context, 1, pitch, &mut outgoing.0[..run], &mut outgoing.1[..run]);
        let total = self.composition.fade_total as f32;
        let past = self.composition.fade_total - self.composition.fade;
        for index in 0..run {
            let (rise, fall) = ((past + index) as f32 / total * FRAC_PI_2).sin_cos();
            left[index] += incoming.0[index] * rise + outgoing.0[index] * fall;
            right[index] += incoming.1[index] * rise + outgoing.1[index] * fall;
        }
        self.composition.fade -= run;
        if self.composition.fade == 0 {
            self.count = 1;
        }
        (run, hits)
    }

    // What the run just played leads to: markers fired, then passes, the segment's end, the step's duration.
    fn after(&mut self, context: &mut Context, hits: &Hits, frame: u64) {
        let current = *self.players[0].segment();
        let (passes, finished) = (self.players[0].passes(), self.players[0].is_finished());
        let mut moved = false;
        for &index in hits.markers() {
            let Some(label) = context.fire(&mut self.crossings, current.markers.first as usize + index as usize, self.note, frame) else { continue };
            if moved || self.composition.stopping {
                continue;
            }
            if let Some(transition) = self.transition(context, |trigger| trigger == Trigger::Marker(label)) {
                self.follow(context, transition);
                moved = true;
            }
        }
        let open = |moved: bool, voice: &Self| !moved && !voice.composition.stopping;
        if open(moved, self) && hits.wrapped {
            if let Some(transition) = self.transition(context, |trigger| trigger == Trigger::Passes(passes)) {
                self.follow(context, transition);
                moved = true;
            }
        }
        if open(moved, self) && finished {
            if let Some(transition) = self.transition(context, |trigger| trigger == Trigger::SegmentEnd) {
                self.follow(context, transition);
                moved = true;
            }
        }
        let (entered, rate) = (self.composition.entered, self.sample_rate);
        if open(moved, self) && entered >= self.composition.due {
            let due = |trigger| matches!(trigger, Trigger::Duration { ms } if ((ms * 0.001 * rate).round() as u64).max(1) <= entered);
            if let Some(transition) = self.transition(context, due) {
                // A follow that stays in the step (a jump) counts its duration again.
                self.composition.entered = 0;
                self.follow(context, transition);
                moved = true;
            }
        }
        if moved {
            self.settle(context);
        } else if self.players[0].is_finished() && self.count < 2 {
            self.composition.ended = true;
        }
    }
}
