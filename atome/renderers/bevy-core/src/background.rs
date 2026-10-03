use bevy::{
    asset::RenderAssetUsages,
    image::{Image, ImageAddressMode, ImageFilterMode, ImageSampler, ImageSamplerDescriptor},
    mesh::{Indices, Mesh, Mesh2d},
    prelude::*,
    render::render_resource::PrimitiveTopology,
};

use crate::{
    render_math::{color_from_rgba, BEVY_LAYER_DEPTH_LIMIT},
    texture::image_handle_from_texture,
    types::{
        AtomeColorFilters, AtomeSurfaceBackground, AtomeSurfaceBackgroundImage,
        AtomeSurfaceBackgroundPatch, AtomeSurfaceBackgroundVideo, AtomeSurfaceBackgroundVisual,
        AtomeBevyRendererConfig, AtomeTransition,
    },
    video_external_texture::AtomeVideoExternalTexture,
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
/// lays tiles. A file tiled at its own size (`explicit_tile`) starts at the
/// top-left corner, like a CSS `background-repeat`: growing or rotating the
/// surface only reveals more tiles, the ones already on screen never move. The
/// bundled wallpaper keeps its screen-relative tile, centred on the surface.
pub(crate) fn tile_source_rect(
    surface_width: f32,
    surface_height: f32,
    device_pixel_ratio: f32,
    texture_size: [u32; 2],
    explicit_tile: Option<Vec2>,
) -> Rect {
    let [texture_width, texture_height] = texture_size;
    let texture = Vec2::new(texture_width.max(1) as f32, texture_height.max(1) as f32);
    let surface = Vec2::new(surface_width.max(1.0), surface_height.max(1.0));
    if let Some(tile) = explicit_tile {
        return Rect::from_corners(Vec2::ZERO, surface / tile.max(Vec2::ONE) * texture);
    }
    let tile = tile_size(surface_width, surface_height, device_pixel_ratio, texture_size);
    let span = surface / tile * texture;
    let centre = texture * 0.5;
    Rect::from_corners(centre - span * 0.5, centre + span * 0.5)
}

fn surface_source_rect(
    surface_width: f32,
    surface_height: f32,
    device_pixel_ratio: f32,
    tiled: bool,
    texture_size: Option<[u32; 2]>,
    explicit_tile: Option<Vec2>,
) -> Option<Rect> {
    match (tiled, texture_size) {
        (true, Some(size)) => Some(tile_source_rect(surface_width, surface_height, device_pixel_ratio, size, explicit_tile)),
        _ => cover_source_rect(surface_width, surface_height, texture_size),
    }
}

/// The quad and UVs of an animated wallpaper. Tiled: the quad covers the
/// surface and its UVs run past 1, one unit per tile from the top-left corner
/// (the video shader wraps them). Otherwise the whole video, undistorted and
/// centred, like a `contain` image.
pub(crate) fn video_background_geometry(
    surface_width: f32,
    surface_height: f32,
    video: &AtomeSurfaceBackgroundVideo,
) -> (Vec2, [f32; 4]) {
    let surface = Vec2::new(surface_width.max(1.0), surface_height.max(1.0));
    if video.tiled {
        let tile = video
            .tile_size
            .unwrap_or_else(|| Vec2::new(video.video_size[0].max(1) as f32, video.video_size[1].max(1) as f32))
            .max(Vec2::ONE);
        let span = surface / tile;
        return (surface, [0.0, 0.0, span.x, span.y]);
    }
    (contain_size(surface_width, surface_height, video.video_size), [0.0, 0.0, 1.0, 1.0])
}

fn video_background_mesh(size: Vec2, uv: [f32; 4]) -> Mesh {
    let half = size * 0.5;
    let [left, top, width, height] = uv;
    let (right, bottom) = (left + width, top + height);
    let mut mesh = Mesh::new(PrimitiveTopology::TriangleList, RenderAssetUsages::default());
    mesh.insert_attribute(
        Mesh::ATTRIBUTE_POSITION,
        vec![
            [-half.x, -half.y, 0.0],
            [half.x, -half.y, 0.0],
            [-half.x, half.y, 0.0],
            [half.x, half.y, 0.0],
        ],
    );
    mesh.insert_attribute(
        Mesh::ATTRIBUTE_UV_0,
        vec![[left, bottom], [right, bottom], [left, top], [right, top]],
    );
    mesh.insert_indices(Indices::U32(vec![0, 1, 2, 2, 1, 3]));
    mesh
}

fn video_background_mesh_handle(
    world: &mut World,
    surface_width: f32,
    surface_height: f32,
    video: &AtomeSurfaceBackgroundVideo,
) -> Result<Handle<Mesh>, String> {
    let (size, uv) = video_background_geometry(surface_width, surface_height, video);
    let mut meshes = world
        .get_resource_mut::<Assets<Mesh>>()
        .ok_or_else(|| "bevy_mesh_assets_required".to_string())?;
    Ok(meshes.add(video_background_mesh(size, uv)))
}

// Below every atome layer (depth_for_layer clamps there), above the fill.
const BACKGROUND_VIDEO_LAYER: i32 = -(BEVY_LAYER_DEPTH_LIMIT as i32);

fn spawn_background_video(
    world: &mut World,
    patch: &AtomeSurfaceBackgroundPatch,
    surface_width: f32,
    surface_height: f32,
) -> Result<(), String> {
    let Some(source) = patch.video_source() else {
        return Ok(());
    };
    let video = AtomeSurfaceBackgroundVideo {
        video_size: [source.width, source.height],
        tile_size: patch.explicit_tile_size(),
        tiled: patch.is_video_tile(),
    };
    let mesh = video_background_mesh_handle(world, surface_width, surface_height, &video)?;
    world.spawn((
        video,
        Mesh2d(mesh),
        AtomeVideoExternalTexture {
            id: source.id.clone(),
            layer: BACKGROUND_VIDEO_LAYER,
            opacity: 1.0,
            uv_rect: [0.0, 0.0, 1.0, 1.0],
            filters: AtomeColorFilters::identity(),
            transition: AtomeTransition::none(),
            mask_texture: None,
        },
        Transform::from_translation(Vec3::new(0.0, 0.0, BACKGROUND_IMAGE_DEPTH)),
        Visibility::Visible,
    ));
    Ok(())
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
        .query_filtered::<Entity, Or<(With<AtomeSurfaceBackgroundImage>, With<AtomeSurfaceBackgroundVideo>)>>()
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
    let (surface_width, surface_height, device_pixel_ratio) = {
        let config = world.resource::<AtomeBevyRendererConfig>();
        (config.width, config.height, config.device_pixel_ratio)
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
    spawn_background_video(world, &patch, surface_width, surface_height)?;
    let tiled = patch.is_tile();
    let tile_size = patch.explicit_tile_size();
    let rect = surface_source_rect(surface_width, surface_height, device_pixel_ratio, tiled, fill_size, tile_size);
    let components = (
        AtomeSurfaceBackground,
        AtomeSurfaceBackgroundVisual {
            signature: patch.signature,
            texture_size: fill_size,
            image_handle: fill_handle,
            tiled,
            tile_size,
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
        sprite.rect = surface_source_rect(
            surface_width,
            surface_height,
            device_pixel_ratio,
            visual.tiled,
            visual.texture_size,
            visual.tile_size,
        );
    }
    let mut images = world.query::<(&mut Sprite, &AtomeSurfaceBackgroundImage)>();
    for (mut sprite, image) in images.iter_mut(world) {
        sprite.custom_size = Some(contain_size(surface_width, surface_height, image.texture_size));
    }
    // A video quad is rebuilt at the new size: more tiles, never a stretch.
    let videos: Vec<(Entity, AtomeSurfaceBackgroundVideo)> = world
        .query::<(Entity, &AtomeSurfaceBackgroundVideo)>()
        .iter(world)
        .map(|(entity, video)| (entity, video.clone()))
        .collect();
    for (entity, video) in videos {
        if let Ok(mesh) = video_background_mesh_handle(world, surface_width, surface_height, &video) {
            world.entity_mut(entity).insert(Mesh2d(mesh));
        }
    }
}
