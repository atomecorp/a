//! A 3D scene atome (`scene3d`): its USD file, read by the USD module (`atome-usd`, its own WASM module), arrives
//! here encoded (`atome_usd::codec`) and is drawn by the atome's own pass (`gpu.rs`, `scene3d.wgsl`) into an image
//! that is the atome's ordinary 2D quad texture. The project scene's single canvas, z-order, clip, gestures,
//! selection and rect hit test stay those of any image. Each source's scene is registered once by the host
//! (`register_scene3d_source`); the node's playback position (its `playback_progress`) is the scene's clock.

mod animate;
mod frame;
mod gpu;
mod pipeline;
mod render_target;

use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use atome_usd::scene::UsdScene;
use bevy::{image::Image, prelude::*};

use crate::types::{
    AtomeBevyRendererConfig, AtomeLogicalSize, AtomeRenderNode, AtomeWaveformPlaybackProgress,
    normalize_opacity,
};
use frame::{Scene3dJob, Scene3dView};

/// Scenes registered by the host call, waiting for the next frame to join `Scene3dSources`.
static STAGED_SOURCES: Mutex<Vec<(String, Arc<UsdScene>)>> = Mutex::new(Vec::new());

/// Makes an encoded scene (`atome_usd::codec::encode_scene`) the scene of every scene3d node whose `source` is
/// `source`.
pub fn register_scene3d_source(source: String, scene_bytes: &[u8]) -> Result<(), String> {
    if source.trim().is_empty() {
        return Err("scene3d_source_required".into());
    }
    let scene = atome_usd::codec::decode_scene(scene_bytes)?;
    STAGED_SOURCES
        .lock()
        .map_err(|_| "scene3d_sources_poisoned".to_string())?
        .push((source, Arc::new(scene)));
    Ok(())
}

#[derive(Resource, Default)]
pub struct Scene3dSources(HashMap<String, Arc<UsdScene>>);

/// The images to draw again this frame, taken by the render world (`gpu.rs`), and how many there still wait for
/// their GPU image.
#[derive(Resource, Default)]
struct Scene3dJobs {
    jobs: Vec<Scene3dJob>,
    gpu_waiting: usize,
}

/// The 3D view of a scene3d node: its image, its source, and once the source is there, its view.
#[derive(Component, Debug)]
pub struct AtomeScene3d {
    pub source: String,
    pub target: Handle<Image>,
    view: Option<Scene3dView>,
    /// Built or resized since its image was last drawn.
    dirty: bool,
}

/// The quad of a scene3d node: a sprite of its render image, transparent until the scene is built.
pub(crate) fn insert_scene3d(
    world: &mut World,
    entity: Entity,
    node: &AtomeRenderNode,
    size: [f32; 2],
) -> Result<(), String> {
    let source = node
        .source
        .clone()
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| format!("bevy_media_source_required:{}", node.id))?;
    let ratio = world
        .resource::<AtomeBevyRendererConfig>()
        .device_pixel_ratio;
    let target = render_target::new_target(
        &mut world.resource_mut::<Assets<Image>>(),
        render_target::target_size(size, ratio),
    );
    let mut sprite = Sprite::from_image(target.clone());
    sprite.custom_size = Some(Vec2::new(size[0], size[1]));
    sprite.color = Color::srgba(1.0, 1.0, 1.0, normalize_opacity(node.opacity));
    world.entity_mut(entity).insert((
        sprite,
        AtomeScene3d {
            source,
            target,
            view: None,
            dirty: false,
        },
    ));
    Ok(())
}

pub struct Scene3dPlugin;

impl Plugin for Scene3dPlugin {
    fn build(&self, app: &mut App) {
        app.init_resource::<Scene3dSources>()
            .init_resource::<Scene3dJobs>()
            .add_systems(
                Update,
                (build_pending_views, follow_quad_size, queue_scene_frames)
                    .chain()
                    .before(crate::frame_demand::apply_frame_demand),
            );
        gpu::add_render_systems(app);
    }
}

fn build_pending_views(mut sources: ResMut<Scene3dSources>, mut views: Query<&mut AtomeScene3d>) {
    let staged = std::mem::take(
        &mut *STAGED_SOURCES
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner()),
    );
    if !staged.is_empty() {
        sources.0.extend(staged);
    }
    for mut view in &mut views {
        if view.view.is_some() {
            continue;
        }
        if let Some(scene) = sources.0.get(&view.source) {
            view.view = Some(Scene3dView::new(scene));
            view.dirty = true;
        }
    }
}

fn follow_quad_size(
    config: Res<AtomeBevyRendererConfig>,
    mut images: ResMut<Assets<Image>>,
    mut views: Query<(&mut AtomeScene3d, &AtomeLogicalSize), Changed<AtomeLogicalSize>>,
) {
    for (mut view, size) in &mut views {
        let target =
            render_target::target_size([size.width, size.height], config.device_pixel_ratio);
        if render_target::resize_target(&mut images, &view.target, target) {
            view.dirty = true;
        }
    }
}

/// A view built, resized or moved in time is drawn again; the frames keep coming while a job waits for its image.
fn queue_scene_frames(world: &mut World) {
    let mut views = world.query::<(
        Entity,
        &AtomeScene3d,
        Option<Ref<AtomeWaveformPlaybackProgress>>,
    )>();
    let due: Vec<Entity> = views
        .iter(world)
        .filter(|(_, view, progress)| {
            view.view.is_some() && (view.dirty || progress.as_ref().is_some_and(Ref::is_changed))
        })
        .map(|(entity, _, _)| entity)
        .collect();
    for entity in due {
        let progress = progress_of(world, entity);
        let Some(view) = world.get::<AtomeScene3d>(entity) else {
            continue;
        };
        let (Some(scene), Some(image)) = (
            world.resource::<Scene3dSources>().0.get(&view.source),
            world.resource::<Assets<Image>>().get(&view.target),
        ) else {
            continue;
        };
        let job = view.view.as_ref().map(|still| {
            still.job(
                scene,
                &view.source,
                view.target.id(),
                image.size(),
                scene.time_code_at(progress),
            )
        });
        if let Some(job) = job {
            world.resource_mut::<Scene3dJobs>().jobs.push(job);
        }
        if let Some(mut view) = world.get_mut::<AtomeScene3d>(entity) {
            view.dirty = false;
        }
    }
    let waiting = world.resource::<Scene3dJobs>().gpu_waiting > 0;
    let now = world.resource::<Time<Real>>().elapsed_secs_f64();
    world
        .resource_mut::<crate::frame_demand::AtomeFrameDemand>()
        .request("scene3d_waiting", waiting.then_some(now));
}

fn progress_of(world: &World, entity: Entity) -> f32 {
    world
        .get::<AtomeWaveformPlaybackProgress>(entity)
        .and_then(|value| value.0)
        .unwrap_or(0.0)
}
