use bevy::{
    asset::RenderAssetUsages,
    mesh::{Indices, Mesh, Mesh2d},
    prelude::*,
    render::render_resource::PrimitiveTopology,
};

use crate::{
    render_math::{color_from_rgba, BEVY_LAYER_DEPTH_LIMIT},
    texture::image_handle_from_texture,
    types::{
        AtomeColorFilters, AtomeSurfaceBackground,
        AtomeSurfaceBackgroundPatch, AtomeSurfaceBackgroundVideo, AtomeSurfaceBackgroundVisual,
        AtomeBevyRendererConfig, AtomeTransition,
    },
    video_external_texture::AtomeVideoExternalTexture,
};

const BACKGROUND_DEPTH: f32 = -BEVY_LAYER_DEPTH_LIMIT - 1.0;
// The video sits above its base colour, below every atome layer.
const BACKGROUND_VIDEO_DEPTH: f32 = BACKGROUND_DEPTH + 0.5;

pub(crate) fn cover_source_rect(
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

pub(crate) fn video_background_geometry(
    surface_width: f32,
    surface_height: f32,
    video: &AtomeSurfaceBackgroundVideo,
) -> (Vec2, [f32; 4]) {
    let surface = Vec2::new(surface_width.max(1.0), surface_height.max(1.0));
    let texture = Vec2::new(video.video_size[0].max(1) as f32, video.video_size[1].max(1) as f32);
    let crop = cover_source_rect(surface.x, surface.y, Some(video.video_size))
        .unwrap_or(Rect::from_corners(Vec2::ZERO, texture));
    let origin = crop.min / texture;
    let span = crop.size() / texture;
    (surface, [origin.x, origin.y, span.x, span.y])
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
        Transform::from_translation(Vec3::new(0.0, 0.0, BACKGROUND_VIDEO_DEPTH)),
        Visibility::Visible,
    ));
    Ok(())
}

fn background_sprite(
    patch: &AtomeSurfaceBackgroundPatch,
    images: &mut Assets<Image>,
) -> Result<(Sprite, Option<Handle<Image>>, Option<[u32; 2]>), String> {
    let fill = &patch.texture;
    if let Some(texture) = fill.as_ref() {
        let handle = image_handle_from_texture(images, fill, "surface_background")?;
        let mut sprite = Sprite::from_image(handle.clone());
        sprite.color = Color::WHITE;
        Ok((sprite, Some(handle), Some([texture.width, texture.height])))
    } else {
        Ok((Sprite::from_color(color_from_rgba(patch.color), Vec2::ONE), None, None))
    }
}

fn despawn_background_videos(world: &mut World) {
    let entities: Vec<Entity> = world
        .query_filtered::<Entity, With<AtomeSurfaceBackgroundVideo>>()
        .iter(world)
        .collect();
    for entity in entities {
        world.despawn(entity);
    }
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
    despawn_background_videos(world);
    spawn_background_video(world, &patch, surface_width, surface_height)?;
    let components = (
        AtomeSurfaceBackground,
        AtomeSurfaceBackgroundVisual {
            signature: patch.signature,
            texture_size: fill_size,
            image_handle: fill_handle,
        },
        Sprite {
            custom_size: Some(Vec2::new(surface_width, surface_height)),
            rect: cover_source_rect(surface_width, surface_height, fill_size),
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
    let (surface_width, surface_height) = {
        let config = world.resource::<AtomeBevyRendererConfig>();
        (config.width, config.height)
    };
    let mut query = world.query::<(&mut Sprite, &AtomeSurfaceBackgroundVisual)>();
    for (mut sprite, visual) in query.iter_mut(world) {
        sprite.custom_size = Some(Vec2::new(surface_width, surface_height));
        sprite.rect = cover_source_rect(surface_width, surface_height, visual.texture_size);
    }
    // Rebuild the video quad with the centred crop for the new surface size.
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
