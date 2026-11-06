//! Compositor-owned menu targets. The front captures the composed workspace;
//! the face captures the existing UI records; the back captures the surface
//! background alone (what a turning plate reveals); the back blur is that same
//! background reduced into a blur pyramid, the only thing a plate's glass
//! blurs: never the live workspace, where the home's tiles are laid again
//! under the plates while they turn back. None includes the flip.
//! A level turn (`mystic_style.z`, a grid's submenu, page or return) keeps the
//! face shown so far as the front: the plates turn from that level to the next,
//! never back to the workspace (the two face targets swap, nothing is copied).
use crate::{
    procedural_sdf::ProceduralSdfMaterial,
    render_math::atome_camera_projection,
    types::AtomeBevyRendererConfig,
    workspace_backdrop::{blur_pyramid_image, capture_image},
    workspace_blur::{backdrop_capture_pixel_size, pyramid::BlurCapture},
};
use bevy::{
    camera::{ClearColorConfig, RenderTarget, visibility::RenderLayers},
    prelude::*,
    render::render_resource::TextureFormat,
};

pub const MENU_FACE_LAYER: usize = 2;
pub const MENU_OVERLAY_LAYER: usize = 3;
/// The surface background (background.rs) also lives here, beside layer 0.
pub const MENU_BACKGROUND_LAYER: usize = 4;

#[derive(Resource)]
pub struct MenuCapture {
    front: Handle<Image>,
    face: Handle<Image>,
    back: Handle<Image>,
    back_blur_capture: Handle<Image>,
    back_blur: Handle<Image>,
    spare: Handle<Image>,
    cameras: [Entity; 4],
    size: UVec2,
    geometry: [Vec4; 24],
    epoch: f32,
    warmup: u8,
    face_warmup: u8,
}

fn target(images: &mut Assets<Image>, size: UVec2) -> Handle<Image> {
    let mut image = Image::new_target_texture(size.x, size.y, TextureFormat::Rgba8UnormSrgb, None);
    image.data = None;
    images.add(image)
}

fn release(world: &mut World) {
    if let Some(capture) = world.remove_resource::<MenuCapture>() {
        for camera in capture.cameras {
            world.despawn(camera);
        }
        let mut images = world.resource_mut::<Assets<Image>>();
        images.remove(capture.front.id());
        images.remove(capture.face.id());
        images.remove(capture.back.id());
        images.remove(capture.back_blur_capture.id());
        images.remove(capture.back_blur.id());
        images.remove(capture.spare.id());
    }
}

pub fn sync_menu_capture(world: &mut World) {
    let handles: Vec<_> = world
        .query::<&MeshMaterial2d<ProceduralSdfMaterial>>()
        .iter(world)
        .map(|m| m.0.clone())
        .collect();
    let menu = handles.into_iter().find(|handle| {
        world
            .resource::<Assets<ProceduralSdfMaterial>>()
            .get(handle)
            .is_some_and(|m| m.uniform.surface_style.x > 2.5)
    });
    let Some(handle) = menu else {
        release(world);
        return;
    };
    let config = world.resource::<AtomeBevyRendererConfig>().clone();
    let size = UVec2::new(config.pixel_width.max(1), config.pixel_height.max(1));
    let (geometry, moving, epoch, level_turn) = {
        let materials = world.resource::<Assets<ProceduralSdfMaterial>>();
        let m = materials.get(&handle).unwrap();
        (
            m.uniform.mystic_tiles,
            m.uniform
                .mystic_tile_motion
                .iter()
                .any(|t| t.x > 0.0 && t.x < 1.0),
            m.uniform.mystic_count.w,
            m.uniform.mystic_style.z > 0.5,
        )
    };
    if world
        .get_resource::<MenuCapture>()
        .is_some_and(|c| c.size != size)
    {
        release(world);
    }
    if !world.contains_resource::<MenuCapture>() {
        // The back blur is laid at the workspace backdrop's resolution, so a
        // plate's blur radius (`backdrop_blur_lod`) reads the same level there.
        let blur_size = backdrop_capture_pixel_size(size);
        let (front, face, back, spare, back_blur_capture, back_blur) = {
            let mut images = world.resource_mut::<Assets<Image>>();
            (
                target(&mut images, size),
                target(&mut images, size),
                target(&mut images, size),
                target(&mut images, size),
                images.add(capture_image(blur_size.x, blur_size.y)),
                images.add(blur_pyramid_image(blur_size.x, blur_size.y)),
            )
        };
        let spawn = |world: &mut World, image: Handle<Image>, order, layers| {
            world
                .spawn((
                    Camera2d,
                    Camera {
                        order,
                        clear_color: ClearColorConfig::Custom(Color::NONE),
                        ..default()
                    },
                    Msaa::Off,
                    RenderTarget::Image(image.into()),
                    atome_camera_projection(config.width, config.height),
                    layers,
                ))
                .id()
        };
        // Workspace blur is ready at -3. Capture the composed dashboard/panels at
        // -2; the regular presentation at 0 then samples these two targets.
        let cameras = [
            spawn(world, front.clone(), -2, RenderLayers::layer(0).with(1)),
            spawn(
                world,
                face.clone(),
                -1,
                RenderLayers::layer(MENU_FACE_LAYER),
            ),
            spawn(
                world,
                back.clone(),
                -4,
                RenderLayers::layer(MENU_BACKGROUND_LAYER),
            ),
            spawn(
                world,
                back_blur_capture.clone(),
                -5,
                RenderLayers::layer(MENU_BACKGROUND_LAYER),
            ),
        ];
        world.entity_mut(cameras[3]).insert(BlurCapture {
            capture: back_blur_capture.clone(),
            pyramid: back_blur.clone(),
        });
        world.insert_resource(MenuCapture {
            front,
            face,
            back,
            back_blur_capture,
            back_blur,
            spare,
            cameras,
            size,
            geometry: [Vec4::ZERO; 24],
            epoch: -1.0,
            warmup: 2,
            face_warmup: 2,
        });
    }
    let face_changed = world
        .query::<(Ref<Sprite>, &RenderLayers)>()
        .iter(world)
        .any(|(sprite, layers)| {
            layers.intersects(&RenderLayers::layer(MENU_FACE_LAYER)) && sprite.is_changed()
        });
    let text_changed = world
        .query::<(Ref<Text2d>, &RenderLayers)>()
        .iter(world)
        .any(|(text, layers)| {
            layers.intersects(&RenderLayers::layer(MENU_FACE_LAYER)) && text.is_changed()
        });
    // A record of the face moved or was rescaled (the Mystic Auto-size lens
    // patches transforms only): the face must be re-captured with it.
    let face_moved = world
        .query_filtered::<(Ref<Transform>, &RenderLayers), Without<Camera>>()
        .iter(world)
        .any(|(transform, layers)| {
            layers.intersects(&RenderLayers::layer(MENU_FACE_LAYER)) && transform.is_changed()
        });
    let (front, face, back, back_blur, cameras, refresh_front, refresh_face, retarget) = {
        let mut capture = world.resource_mut::<MenuCapture>();
        // A new epoch (opening, page, palette) re-captures the workspace. A
        // geometry change alone (the Auto-size lens, every frame it animates)
        // only moves the plates over the SAME workspace: re-capturing it would
        // re-render the whole scene each frame for nothing.
        let mut retarget = false;
        if capture.epoch != epoch {
            let turning_level = level_turn && capture.epoch >= 0.0;
            capture.geometry = geometry;
            capture.epoch = epoch;
            capture.face_warmup = 2;
            if turning_level {
                // The face shown so far becomes the front; the next level is drawn in the spare target.
                let shown = capture.face.clone();
                let previous_front = std::mem::replace(&mut capture.front, shown);
                capture.face = std::mem::replace(&mut capture.spare, previous_front);
                capture.warmup = 0;
            } else {
                capture.warmup = 2;
            }
            retarget = true;
        } else if capture.geometry != geometry {
            capture.geometry = geometry;
            capture.face_warmup = 2;
        }
        let front_active = capture.warmup > 0;
        capture.warmup = capture.warmup.saturating_sub(1);
        let face_active = capture.face_warmup > 0;
        capture.face_warmup = capture.face_warmup.saturating_sub(1);
        (
            capture.front.clone(),
            capture.face.clone(),
            capture.back.clone(),
            capture.back_blur.clone(),
            capture.cameras,
            front_active,
            front_active || face_active || moving || face_changed || text_changed || face_moved,
            retarget,
        )
    };
    // The workspace and face cameras draw into whatever targets are front and face now.
    if retarget {
        for (camera, image) in [(cameras[0], front.clone()), (cameras[1], face.clone())] {
            if let Some(mut render_target) = world.get_mut::<RenderTarget>(camera) {
                *render_target = RenderTarget::Image(image.into());
            }
        }
    }
    // The background and its blur are captured with the workspace, at the same instants.
    for (camera, active) in
        cameras
            .into_iter()
            .zip([refresh_front, refresh_face, refresh_front, refresh_front])
    {
        if let Some(mut component) = world.get_mut::<Camera>(camera) {
            component.is_active = active;
        }
    }
    let unchanged = world
        .resource::<Assets<ProceduralSdfMaterial>>()
        .get(&handle)
        .is_some_and(|m| {
            m.menu_front == front
                && m.menu_face == face
                && m.menu_back == back
                && m.menu_back_blur == back_blur
        });
    if unchanged {
        return;
    }
    let mut materials = world.resource_mut::<Assets<ProceduralSdfMaterial>>();
    if let Some(mut material) = materials.get_mut(&handle) {
        if material.menu_front != front {
            material.menu_front = front;
        }
        if material.menu_face != face {
            material.menu_face = face;
        }
        if material.menu_back != back {
            material.menu_back = back;
        }
        if material.menu_back_blur != back_blur {
            material.menu_back_blur = back_blur;
        }
    };
}

#[cfg(test)]
#[path = "../../../../tests/rendering/mystic_capture.rs"]
mod tests;
