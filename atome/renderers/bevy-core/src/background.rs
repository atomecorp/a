use bevy::{image::Image, prelude::*};

use crate::{
    render_math::{color_from_rgba, BEVY_LAYER_DEPTH_LIMIT},
    texture::image_handle_from_texture,
    types::{
        AtomeBevyRendererConfig, AtomeSurfaceBackground, AtomeSurfaceBackgroundPatch,
        AtomeSurfaceBackgroundVisual,
    },
};

const BACKGROUND_DEPTH: f32 = -BEVY_LAYER_DEPTH_LIMIT - 1.0;

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

fn background_sprite(
    patch: &AtomeSurfaceBackgroundPatch,
    images: &mut Assets<Image>,
) -> Result<(Sprite, Option<Handle<Image>>), String> {
    if patch.texture.is_some() {
        let handle = image_handle_from_texture(images, &patch.texture, "surface_background")?;
        let mut sprite = Sprite::from_image(handle.clone());
        sprite.color = Color::WHITE;
        Ok((sprite, Some(handle)))
    } else {
        Ok((
            Sprite::from_color(color_from_rgba(patch.color), Vec2::ONE),
            None,
        ))
    }
}

fn background_components(
    patch: AtomeSurfaceBackgroundPatch,
    sprite: Sprite,
    texture_handle: Option<Handle<Image>>,
    surface_width: f32,
    surface_height: f32,
) -> (
    AtomeSurfaceBackground,
    AtomeSurfaceBackgroundVisual,
    Sprite,
    Transform,
) {
    let texture_size = patch.texture_size();
    let size = Vec2::new(surface_width, surface_height);
    let source_rect = cover_source_rect(surface_width, surface_height, texture_size);
    (
        AtomeSurfaceBackground,
        AtomeSurfaceBackgroundVisual {
            signature: patch.signature,
            texture_size,
            image_handle: texture_handle,
        },
        Sprite {
            custom_size: Some(size),
            rect: source_rect,
            ..sprite
        },
        Transform::from_translation(Vec3::new(0.0, 0.0, BACKGROUND_DEPTH)),
    )
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
    let (sprite, texture_handle) = {
        let mut images = world
            .get_resource_mut::<Assets<Image>>()
            .ok_or_else(|| "bevy_image_assets_required".to_string())?;
        background_sprite(&patch, &mut images)?
    };
    let components =
        background_components(patch, sprite, texture_handle, surface_width, surface_height);
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
}
