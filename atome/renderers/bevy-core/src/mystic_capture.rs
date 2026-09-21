//! Compositor-owned menu targets. The front captures the composed workspace;
//! the back captures the existing UI records. Neither target includes the flip.
use bevy::{camera::{visibility::RenderLayers, ClearColorConfig, RenderTarget}, prelude::*,
    render::render_resource::TextureFormat};
use crate::{procedural_sdf::ProceduralSdfMaterial, render_math::atome_camera_projection,
    types::AtomeBevyRendererConfig};

pub const MENU_FACE_LAYER: usize = 2;
pub const MENU_OVERLAY_LAYER: usize = 3;

#[derive(Resource)]
pub struct MenuCapture {
    front: Handle<Image>,
    face: Handle<Image>,
    cameras: [Entity; 2],
    size: UVec2,
    geometry: [Vec4; 24],
    epoch: f32,
    warmup: u8,
}

fn target(images: &mut Assets<Image>, size: UVec2) -> Handle<Image> {
    let mut image = Image::new_target_texture(size.x, size.y, TextureFormat::Rgba8UnormSrgb, None);
    image.data = None;
    images.add(image)
}

fn release(world: &mut World) {
    if let Some(capture) = world.remove_resource::<MenuCapture>() {
        for camera in capture.cameras { world.despawn(camera); }
        let mut images = world.resource_mut::<Assets<Image>>();
        images.remove(capture.front.id());
        images.remove(capture.face.id());
    }
}

pub fn sync_menu_capture(world: &mut World) {
    let handles: Vec<_> = world.query::<&MeshMaterial2d<ProceduralSdfMaterial>>()
        .iter(world).map(|m| m.0.clone()).collect();
    let menu = handles.into_iter().find(|handle| world.resource::<Assets<ProceduralSdfMaterial>>()
        .get(handle).is_some_and(|m| m.uniform.surface_style.x > 2.5));
    let Some(handle) = menu else { release(world); return; };
    let config = world.resource::<AtomeBevyRendererConfig>().clone();
    let size = UVec2::new(config.pixel_width.max(1), config.pixel_height.max(1));
    let (geometry, moving, epoch) = {
        let materials = world.resource::<Assets<ProceduralSdfMaterial>>();
        let m = materials.get(&handle).unwrap();
        (m.uniform.mystic_tiles, m.uniform.mystic_tile_motion.iter().any(|t| t.x > 0.0 && t.x < 1.0), m.uniform.mystic_count.w)
    };
    if world.get_resource::<MenuCapture>().is_some_and(|c| c.size != size) { release(world); }
    if !world.contains_resource::<MenuCapture>() {
        let (front, face) = {
            let mut images = world.resource_mut::<Assets<Image>>();
            (target(&mut images, size), target(&mut images, size))
        };
        let spawn = |world: &mut World, image: Handle<Image>, order, layers| world.spawn((
            Camera2d, Camera { order, clear_color: ClearColorConfig::Custom(Color::NONE), ..default() },
            Msaa::Off, RenderTarget::Image(image.into()),
            atome_camera_projection(config.width, config.height), layers,
        )).id();
        // Workspace blur is ready at -3. Capture the composed dashboard/panels at
        // -2; the regular presentation at 0 then samples these two targets.
        let cameras = [spawn(world, front.clone(), -2, RenderLayers::layer(0).with(1)),
            spawn(world, face.clone(), -1, RenderLayers::layer(MENU_FACE_LAYER))];
        world.insert_resource(MenuCapture { front, face, cameras, size, geometry: [Vec4::ZERO; 24], epoch: -1.0, warmup: 2 });
    }
    let face_changed = world.query::<(Ref<Sprite>, &RenderLayers)>().iter(world)
        .any(|(sprite, layers)| layers.intersects(&RenderLayers::layer(MENU_FACE_LAYER)) && sprite.is_changed());
    let text_changed = world.query::<(Ref<Text2d>, &RenderLayers)>().iter(world)
        .any(|(text, layers)| layers.intersects(&RenderLayers::layer(MENU_FACE_LAYER)) && text.is_changed());
    let (front, face, cameras, refresh_front, refresh_face) = {
        let mut capture = world.resource_mut::<MenuCapture>();
        if capture.geometry != geometry || capture.epoch != epoch {
            capture.geometry = geometry; capture.epoch = epoch; capture.warmup = 2;
        }
        let front_active = capture.warmup > 0;
        capture.warmup = capture.warmup.saturating_sub(1);
        (capture.front.clone(), capture.face.clone(), capture.cameras, front_active, front_active || moving || face_changed || text_changed)
    };
    for (camera, active) in cameras.into_iter().zip([refresh_front, refresh_face]) {
        if let Some(mut component) = world.get_mut::<Camera>(camera) { component.is_active = active; }
    }
    let unchanged = world.resource::<Assets<ProceduralSdfMaterial>>().get(&handle)
        .is_some_and(|m| m.menu_front == front && m.menu_face == face);
    if unchanged { return; }
    let mut materials = world.resource_mut::<Assets<ProceduralSdfMaterial>>();
    if let Some(mut material) = materials.get_mut(&handle) {
        if material.menu_front != front { material.menu_front = front; }
        if material.menu_face != face { material.menu_face = face; }
    };
}

#[cfg(test)]
#[path = "../../../../tests/rendering/mystic_capture.rs"]
mod tests;
