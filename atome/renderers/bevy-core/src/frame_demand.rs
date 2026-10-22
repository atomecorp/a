//! One owner for the cadence the renderer's own animations need: the next frame
//! of an animated PNG, a progress ring moving on its own clock.
//!
//! The web loop runs in `Reactive` mode: a frame happens when something wakes it
//! or when its wait elapses (frame_clock.rs). An animation the renderer draws by
//! itself has no wake of its own, so each source states the time it needs its
//! next frame by (`request`), and `apply_frame_demand` shortens the wait to the
//! nearest deadline, then gives back the modes it found once no source asks.
//! Two sources saving and restoring the modes each on their own would restore
//! each other's shortened wait: the save and the restore live here only.
use std::collections::HashMap;
use std::time::Duration;

use bevy::{
    prelude::*,
    winit::{UpdateMode, WinitSettings},
};

#[derive(Resource, Default)]
pub struct AtomeFrameDemand {
    deadlines: HashMap<&'static str, f64>,
    saved_modes: Option<(UpdateMode, UpdateMode)>,
}

impl AtomeFrameDemand {
    /// `deadline`: the `Time<Real>` second by which `source` needs a frame; `None` when it needs none.
    pub fn request(&mut self, source: &'static str, deadline: Option<f64>) {
        match deadline {
            Some(at) => {
                self.deadlines.insert(source, at);
            }
            None => {
                self.deadlines.remove(source);
            }
        }
    }

    pub fn active(&self) -> bool {
        !self.deadlines.is_empty()
    }
}

/// A deadline only ever shortens a `Reactive` wait: a faster cadence already in force is kept.
pub fn with_frame_deadline(mut mode: UpdateMode, interval: Duration) -> UpdateMode {
    if let UpdateMode::Reactive { ref mut wait, .. } = mode {
        *wait = (*wait).min(interval);
    }
    mode
}

pub fn apply_frame_demand(
    time: Res<Time<Real>>,
    mut demand: ResMut<AtomeFrameDemand>,
    settings: Option<ResMut<WinitSettings>>,
) {
    let Some(mut settings) = settings else {
        return;
    };
    let now = time.elapsed_secs_f64();
    if let Some(deadline) = demand.deadlines.values().copied().reduce(f64::min) {
        let (focused, unfocused) =
            *demand.saved_modes.get_or_insert((settings.focused_mode, settings.unfocused_mode));
        let interval = Duration::from_secs_f64((deadline - now).clamp(0.001, 1.0));
        settings.focused_mode = with_frame_deadline(focused, interval);
        settings.unfocused_mode = with_frame_deadline(unfocused, interval);
    } else if let Some((focused, unfocused)) = demand.saved_modes.take() {
        settings.focused_mode = focused;
        settings.unfocused_mode = unfocused;
    }
}
