//! The clock of the animated media effects (grain): the renderer's real time, or — while a video is made of the
//! project image after image (a shared project's MP4 proxy, R-349) — the instant the image shows, so the same
//! project gives the same images whatever the machine's pace. The instant crosses as an op
//! (`AtomeRenderOp::MediaClock`); `None` gives the real clock back.

use bevy::{
    prelude::*,
    render::{Extract, ExtractSchedule, RenderApp},
};
use serde::Deserialize;

/// The clock the effects read in the render world, wrapped to keep its precision.
#[derive(Resource, Clone, Copy, Default)]
pub(crate) struct MediaFxClock(pub f32);

/// The instant the effects are drawn at, in seconds; `None`: the renderer's real time.
#[derive(Resource, Clone, Copy, Debug, Default, PartialEq)]
pub struct MediaFxOfflineClock(pub Option<f64>);

#[derive(Clone, Copy, Debug, Deserialize, PartialEq)]
pub struct AtomeMediaClockPatch {
    #[serde(default)]
    pub seconds: Option<f64>,
}

pub fn apply_media_clock(world: &mut World, patch: AtomeMediaClockPatch) -> Result<(), String> {
    if let Some(seconds) = patch.seconds
        && !(seconds.is_finite() && seconds >= 0.0)
    {
        return Err(format!("media_clock_invalid:{seconds}"));
    }
    world.insert_resource(MediaFxOfflineClock(patch.seconds));
    Ok(())
}

/// The effects' time now: the offline instant while one is set, else the real time.
pub(crate) fn media_fx_seconds(real_seconds: f64, offline: MediaFxOfflineClock) -> f32 {
    (offline.0.unwrap_or(real_seconds) % 3600.0) as f32
}

fn extract_media_fx_clock(
    mut clock: ResMut<MediaFxClock>,
    time: Extract<Res<Time<Real>>>,
    offline: Extract<Res<MediaFxOfflineClock>>,
) {
    clock.0 = media_fx_seconds(time.elapsed_secs_f64(), **offline);
}

pub(crate) fn build_media_fx_clock(app: &mut App) {
    app.init_resource::<MediaFxOfflineClock>();
    let Some(render_app) = app.get_sub_app_mut(RenderApp) else {
        return;
    };
    render_app
        .init_resource::<MediaFxClock>()
        .add_systems(ExtractSchedule, extract_media_fx_clock);
}
