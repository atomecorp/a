use bevy::{
    image::{Image, ImageAddressMode, ImageFilterMode, ImageSampler, ImageSamplerDescriptor},
    prelude::*,
};

use crate::{
    render_math::{color_from_rgba, BEVY_LAYER_DEPTH_LIMIT},
    texture::image_handle_from_texture,
    types::{
        AtomeSurfaceBackground, AtomeSurfaceBackgroundImage, AtomeSurfaceBackgroundPatch,
        AtomeSurfaceBackgroundVisual, AtomeBevyRendererConfig,
    },
};

const BACKGROUND_DEPTH: f32 = -BEVY_LAYER_DEPTH_LIMIT - 1.0;
// Still below every atome layer: the image only has to sit above its own fill.
const BACKGROUND_IMAGE_DEPTH: f32 = BACKGROUND_DEPTH + 0.5;

fn cover_source_rect(
    surface_width: f32,
    surface_height: f32,
    texture_size: Option<[u32; 2]>,
) -> Option<Rect> {
    let Some([texture_width, texture_height]) = texture_size else {
        return None;
    };
    if texture_width == 0 || texture_height == 0 {
        return None;
    }
    let texture = Vec2::new(texture_width as f32, texture_height as f32);
    let surface_aspect = surface_width.max(1.0) / surface_height.max(1.0);
    let texture_aspect = texture.x / texture.y;
    let crop_size = if texture_aspect > surface_aspect {
        Vec2::new(texture.y * surface_aspect, texture.y)
    } else {
        Vec2::new(texture.x, texture.x / surface_aspect)
    };
    let inset = (texture - crop_size) * 0.5;
    Some(Rect::from_corners(inset, inset + crop_size))
}

// A tile is sized from the screen, not from the file: about 60 % of the
// longest side, never under 480 nor over 900 logical px, so the pattern reads
// the same on a phone and on a desktop. It is never blown up past 1.5x its
// native pixels, which would make it soft.
const TILE_SCREEN_FRACTION: f32 = 0.6;
const TILE_MIN_SIDE: f32 = 480.0;
const TILE_MAX_SIDE: f32 = 900.0;
const TILE_MAX_UPSCALE: f32 = 1.5;

pub(crate) fn tile_size(surface_width: f32, surface_height: f32, device_pixel_ratio: f32, texture_size: [u32; 2]) -> Vec2 {
    let [texture_width, texture_height] = texture_size;
    let texture = Vec2::new(texture_width.max(1) as f32, texture_height.max(1) as f32);
    let longest = surface_width.max(surface_height).max(1.0);
    let native = texture.max_element() / device_pixel_ratio.max(0.1);
    let side = (longest * TILE_SCREEN_FRACTION)
        .clamp(TILE_MIN_SIDE, TILE_MAX_SIDE)
        .min(native * TILE_MAX_UPSCALE)
        .max(1.0);
    texture * (side / texture.max_element())
}

/// The texture region the full-surface sprite samples so the repeat sampler
/// lays tiles of `tile_size`, one tile centred on the surface centre.
fn tile_source_rect(surface_width: f32, surface_height: f32, device_pixel_ratio: f32, texture_size: [u32; 2]) -> Rect {
    let [texture_width, texture_height] = texture_size;
    let texture = Vec2::new(texture_width.max(1) as f32, texture_height.max(1) as f32);
    let tile = tile_size(surface_width, surface_height, device_pixel_ratio, texture_size);
    let span = Vec2::new(surface_width.max(1.0), surface_height.max(1.0)) / tile * texture;
    let centre = texture * 0.5;
    Rect::from_corners(centre - span * 0.5, centre + span * 0.5)
}

fn surface_source_rect(world: &World, tiled: bool, texture_size: Option<[u32; 2]>) -> Option<Rect> {
    let config = world.resource::<AtomeBevyRendererConfig>();
    match (tiled, texture_size) {
        (true, Some(size)) => Some(tile_source_rect(config.width, config.height, config.device_pixel_ratio, size)),
        _ => cover_source_rect(config.width, config.height, texture_size),
    }
}

fn set_repeat_sampler(images: &mut Assets<Image>, handle: &Handle<Image>) {
    if let Some(mut image) = images.get_mut(handle) {
        image.sampler = ImageSampler::Descriptor(ImageSamplerDescriptor {
            address_mode_u: ImageAddressMode::Repeat,
            address_mode_v: ImageAddressMode::Repeat,
            mag_filter: ImageFilterMode::Linear,
            min_filter: ImageFilterMode::Linear,
            ..default()
        });
    }
}

/// The largest size with the texture's aspect that fits inside the surface:
/// the whole image stays visible and is never stretched.
pub(crate) fn contain_size(surface_width: f32, surface_height: f32, texture_size: [u32; 2]) -> Vec2 {
    let surface = Vec2::new(surface_width.max(1.0), surface_height.max(1.0));
    let [texture_width, texture_height] = texture_size;
    if texture_width == 0 || texture_height == 0 {
        return surface;
    }
    let texture = Vec2::new(texture_width as f32, texture_height as f32);
    let scale = (surface.x / texture.x).min(surface.y / texture.y);
    texture * scale
}

/// The full-surface sprite: the cover-cropped wallpaper, or — for a `contain`
/// wallpaper — the backdrop that fills the bands (a plain colour without one).
fn background_sprite(
    patch: &AtomeSurfaceBackgroundPatch,
    images: &mut Assets<Image>,
) -> Result<(Sprite, Option<Handle<Image>>, Option<[u32; 2]>), String> {
    let fill = if patch.is_contain() { &patch.backdrop } else { &patch.texture };
    if let Some(texture) = fill.as_ref() {
        let handle = image_handle_from_texture(images, fill, "surface_background")?;
        if patch.is_tile() {
            set_repeat_sampler(images, &handle);
        }
        let mut sprite = Sprite::from_image(handle.clone());
        sprite.color = Color::WHITE;
        Ok((sprite, Some(handle), Some([texture.width, texture.height])))
    } else {
        Ok((Sprite::from_color(color_from_rgba(patch.color), Vec2::ONE), None, None))
    }
}

fn despawn_background_images(world: &mut World) {
    let entities: Vec<Entity> = world
        .query_filtered::<Entity, With<AtomeSurfaceBackgroundImage>>()
        .iter(world)
        .collect();
    for entity in entities {
        world.despawn(entity);
    }
}

fn spawn_background_image(
    world: &mut World,
    patch: &AtomeSurfaceBackgroundPatch,
    surface_width: f32,
    surface_height: f32,
) -> Result<(), String> {
    let Some(texture) = patch.texture.as_ref() else {
        return Ok(());
    };
    let texture_size = [texture.width, texture.height];
    let handle = {
        let mut images = world
            .get_resource_mut::<Assets<Image>>()
            .ok_or_else(|| "bevy_image_assets_required".to_string())?;
        image_handle_from_texture(&mut images, &patch.texture, "surface_background_image")?
    };
    let mut sprite = Sprite::from_image(handle.clone());
    sprite.color = Color::WHITE;
    sprite.custom_size = Some(contain_size(surface_width, surface_height, texture_size));
    world.spawn((
        AtomeSurfaceBackgroundImage { texture_size, image_handle: handle },
        sprite,
        Transform::from_translation(Vec3::new(0.0, 0.0, BACKGROUND_IMAGE_DEPTH)),
    ));
    Ok(())
}

pub fn apply_surface_background(
    world: &mut World,
    patch: AtomeSurfaceBackgroundPatch,
) -> Result<Entity, String> {
    let existing = world
        .query_filtered::<Entity, With<AtomeSurfaceBackground>>()
        .iter(world)
        .next();
    let (surface_width, surface_height) = {
        let config = world.resource::<AtomeBevyRendererConfig>();
        (config.width, config.height)
    };
    let (sprite, fill_handle, fill_size) = {
        let mut images = world
            .get_resource_mut::<Assets<Image>>()
            .ok_or_else(|| "bevy_image_assets_required".to_string())?;
        background_sprite(&patch, &mut images)?
    };
    despawn_background_images(world);
    if patch.is_contain() {
        spawn_background_image(world, &patch, surface_width, surface_height)?;
    }
    let tiled = patch.is_tile();
    let rect = surface_source_rect(world, tiled, fill_size);
    let components = (
        AtomeSurfaceBackground,
        AtomeSurfaceBackgroundVisual {
            signature: patch.signature,
            texture_size: fill_size,
            image_handle: fill_handle,
            tiled,
        },
        Sprite {
            custom_size: Some(Vec2::new(surface_width, surface_height)),
            rect,
            ..sprite
        },
        Transform::from_translation(Vec3::new(0.0, 0.0, BACKGROUND_DEPTH)),
    );
    if let Some(entity) = existing {
        world.entity_mut(entity).insert(components);
        Ok(entity)
    } else {
        Ok(world.spawn(components).id())
    }
}

pub fn resize_surface_background(world: &mut World) {
    let (surface_width, surface_height, device_pixel_ratio) = {
        let config = world.resource::<AtomeBevyRendererConfig>();
        (config.width, config.height, config.device_pixel_ratio)
    };
    let mut query = world.query::<(&mut Sprite, &AtomeSurfaceBackgroundVisual)>();
    for (mut sprite, visual) in query.iter_mut(world) {
        sprite.custom_size = Some(Vec2::new(surface_width, surface_height));
        sprite.rect = match (visual.tiled, visual.texture_size) {
            (true, Some(size)) => Some(tile_source_rect(surface_width, surface_height, device_pixel_ratio, size)),
            _ => cover_source_rect(surface_width, surface_height, visual.texture_size),
        };
    }
    let mut images = world.query::<(&mut Sprite, &AtomeSurfaceBackgroundImage)>();
    for (mut sprite, image) in images.iter_mut(world) {
        sprite.custom_size = Some(contain_size(surface_width, surface_height, image.texture_size));
    }
}
