//! A progress ring drawn by the GPU (render kind `progress_ring`, design validated
//! on 2026-10-22 for the Sport card's timed steps): an annulus filling its node's
//! square, its lit arc running clockwise from 12 o'clock to the progress, the
//! rest in its track colour, both ends cut straight.
//!
//! The progress is sent once with its rate (a fraction per second, negative while
//! the ring empties, 0 when frozen); from then on the arc moves on Bevy's own
//! clock. While it moves, the ring asks only the frames that advance it by half a
//! pixel of arc (#frame_demand.rs): no image per step, no JS work per frame.
use std::f64::consts::PI;

use bevy::{
    asset::{load_internal_asset, uuid_handle},
    prelude::*,
    reflect::TypePath,
    render::{
        render_resource::{AsBindGroup, ShaderType},
        RenderApp,
    },
    shader::{Shader, ShaderRef},
    sprite_render::{AlphaMode2d, Material2d, Material2dPlugin},
};
use serde::Deserialize;

use crate::{frame_demand::AtomeFrameDemand, video_external_texture::video_quad_mesh_handle_from_size};

const SHADER: Handle<Shader> = uuid_handle!("0f77173a-3776-4793-ac9c-a57d5d20eca7");
// Half a pixel of arc per frame reads as continuous; never faster than the
// display, never slower than the loop's own failsafe.
const ARC_STEP_PX: f64 = 0.5;
const FRAME_MIN_S: f64 = 1.0 / 60.0;
const FRAME_MAX_S: f64 = 0.5;

/// What the scene sends: colours in sRGB, the ring's width in logical pixels,
/// the progress (0..1), its rate per second, and the wall-clock time (Unix ms)
/// at which that progress was true — absent, it is true on arrival. With it, the
/// contract stays the same for a whole step (no patch each time the card is
/// drawn) and a ring spawned mid-step starts where the step really is.
#[derive(Clone, Copy, Debug, Deserialize, PartialEq)]
pub struct AtomeProgressRing {
    pub color: [f32; 4],
    pub track: [f32; 4],
    pub width: f32,
    pub progress: f32,
    #[serde(default)]
    pub rate: f32,
    #[serde(default)]
    pub at_ms: Option<f64>,
}

#[cfg(target_arch = "wasm32")]
fn wall_clock_ms() -> f64 {
    js_sys::Date::now()
}

#[cfg(not(target_arch = "wasm32"))]
fn wall_clock_ms() -> f64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|elapsed| elapsed.as_secs_f64() * 1000.0)
        .unwrap_or(0.0)
}

#[derive(Clone, Copy, Debug, ShaderType)]
pub struct ProgressRingUniform {
    pub color: Vec4,
    pub track: Vec4,
    /// Node width, node height, ring width (logical px), progress.
    pub shape: Vec4,
    /// Opacity of the node; the other components are unused.
    pub opacity: Vec4,
}

#[derive(Asset, TypePath, AsBindGroup, Debug, Clone)]
pub struct ProgressRingMaterial {
    #[uniform(0)]
    pub uniform: ProgressRingUniform,
}

impl Material2d for ProgressRingMaterial {
    fn fragment_shader() -> ShaderRef {
        SHADER.into()
    }
    fn alpha_mode(&self) -> AlphaMode2d {
        AlphaMode2d::Blend
    }
}

/// The ring as last sent, and when (`Time<Real>` seconds) its progress was true.
#[derive(Component, Clone, Copy, Debug)]
pub struct AtomeProgressRingState {
    ring: AtomeProgressRing,
    since: f64,
    size: [f32; 2],
    opacity: f32,
}

impl AtomeProgressRingState {
    fn progress_at(&self, now: f64) -> f32 {
        (self.ring.progress as f64 + self.ring.rate as f64 * (now - self.since)).clamp(0.0, 1.0) as f32
    }
    fn moving(&self, progress: f32) -> bool {
        (self.ring.rate < 0.0 && progress > 0.0) || (self.ring.rate > 0.0 && progress < 1.0)
    }
    fn uniform(&self, progress: f32) -> ProgressRingUniform {
        let linear = |rgba: [f32; 4]| {
            let color = Color::srgba(rgba[0], rgba[1], rgba[2], rgba[3]).to_linear();
            Vec4::new(color.red, color.green, color.blue, color.alpha)
        };
        ProgressRingUniform {
            color: linear(self.ring.color),
            track: linear(self.ring.track),
            shape: Vec4::new(self.size[0], self.size[1], self.ring.width.max(0.5), progress),
            opacity: Vec4::new(self.opacity.clamp(0.0, 1.0), 0.0, 0.0, 0.0),
        }
    }
}

pub struct ProgressRingPlugin;

impl Plugin for ProgressRingPlugin {
    fn build(&self, app: &mut App) {
        app.init_resource::<Assets<Shader>>();
        load_internal_asset!(app, SHADER, "assets/shaders/progress_ring.wgsl", Shader::from_wgsl);
        app.init_resource::<Assets<ProgressRingMaterial>>();
        if app.get_sub_app_mut(RenderApp).is_some() {
            app.add_plugins(Material2dPlugin::<ProgressRingMaterial>::default());
        }
        app.add_systems(Update, advance_progress_rings.before(crate::frame_demand::apply_frame_demand));
    }
}

fn now(world: &World) -> f64 {
    world.get_resource::<Time<Real>>().map(|time| time.elapsed_secs_f64()).unwrap_or(0.0)
}

/// The `Time<Real>` second at which the ring's progress was true.
fn since(world: &World, ring: &AtomeProgressRing) -> f64 {
    now(world) - ring.at_ms.map(|at| ((wall_clock_ms() - at) / 1000.0).max(0.0)).unwrap_or(0.0)
}

fn write_uniform(world: &mut World, entity: Entity, state: AtomeProgressRingState) -> Result<(), String> {
    let handle = world
        .get::<MeshMaterial2d<ProgressRingMaterial>>(entity)
        .ok_or("bevy_progress_ring_material_required")?
        .0
        .clone();
    let progress = state.progress_at(now(world));
    world
        .resource_mut::<Assets<ProgressRingMaterial>>()
        .get_mut(&handle)
        .ok_or("bevy_progress_ring_material_missing")?
        .uniform = state.uniform(progress);
    world.entity_mut(entity).insert(state);
    Ok(())
}

pub fn insert(world: &mut World, entity: Entity, size: [f32; 2], ring: AtomeProgressRing, opacity: f32) -> Result<(), String> {
    let state = AtomeProgressRingState { ring, since: since(world, &ring), size, opacity };
    let progress = state.progress_at(now(world));
    let mesh = video_quad_mesh_handle_from_size(&mut world.resource_mut::<Assets<Mesh>>(), size, [0.0, 0.0, 1.0, 1.0]);
    let material = world
        .resource_mut::<Assets<ProgressRingMaterial>>()
        .add(ProgressRingMaterial { uniform: state.uniform(progress) });
    world.entity_mut(entity).insert((Mesh2d(mesh), MeshMaterial2d(material), state));
    Ok(())
}

/// A new progress, rate or look: the arc restarts from what was just sent.
pub fn patch(world: &mut World, entity: Entity, ring: AtomeProgressRing) -> Result<(), String> {
    let state = *world.get::<AtomeProgressRingState>(entity).ok_or("bevy_progress_ring_state_required")?;
    let since = since(world, &ring);
    write_uniform(world, entity, AtomeProgressRingState { ring, since, ..state })
}

/// The node's new size; nothing to do for an entity that is not a ring.
pub fn resize(world: &mut World, entity: Entity, size: [f32; 2]) -> Result<(), String> {
    let Some(state) = world.get::<AtomeProgressRingState>(entity).copied() else {
        return Ok(());
    };
    let mesh = video_quad_mesh_handle_from_size(&mut world.resource_mut::<Assets<Mesh>>(), size, [0.0, 0.0, 1.0, 1.0]);
    world.entity_mut(entity).insert(Mesh2d(mesh));
    write_uniform(world, entity, AtomeProgressRingState { size, ..state })
}

/// The node's opacity (a paused step dims its disc and ring); nothing to do for an entity that is not a ring.
pub fn set_opacity(world: &mut World, entity: Entity, opacity: f32) -> Result<(), String> {
    let Some(state) = world.get::<AtomeProgressRingState>(entity).copied() else {
        return Ok(());
    };
    write_uniform(world, entity, AtomeProgressRingState { opacity, ..state })
}

pub fn advance_progress_rings(
    time: Res<Time<Real>>,
    rings: Query<(&MeshMaterial2d<ProgressRingMaterial>, &AtomeProgressRingState, Option<&Visibility>)>,
    mut materials: ResMut<Assets<ProgressRingMaterial>>,
    mut demand: ResMut<AtomeFrameDemand>,
) {
    let now = time.elapsed_secs_f64();
    let mut next: Option<f64> = None;
    for (handle, state, visibility) in &rings {
        if state.ring.rate == 0.0 || visibility == Some(&Visibility::Hidden) {
            continue;
        }
        let progress = state.progress_at(now);
        if let Some(mut material) = materials.get_mut(&handle.0) {
            material.uniform.shape.w = progress;
        }
        if !state.moving(progress) {
            continue;
        }
        let middle_radius = (state.size[0].min(state.size[1]) - state.ring.width) as f64 * 0.5;
        let arc_px_per_s = state.ring.rate.abs() as f64 * 2.0 * PI * middle_radius.max(1.0);
        let step = (ARC_STEP_PX / arc_px_per_s).clamp(FRAME_MIN_S, FRAME_MAX_S);
        next = Some(next.map_or(now + step, |at| at.min(now + step)));
    }
    demand.request("progress_ring", next);
}
