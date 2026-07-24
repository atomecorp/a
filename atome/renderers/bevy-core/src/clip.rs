use bevy::{image::Image, prelude::*};

use crate::{
    components::*,
    render_math::{atome_rect_transform_with_local, depth_for_layer},
};

fn intersection(rect: [f32; 4], clip: [f32; 4]) -> Option<[f32; 4]> {
    let left = rect[0].max(clip[0]);
    let top = rect[1].max(clip[1]);
    let right = (rect[0] + rect[2]).min(clip[0] + clip[2]);
    let bottom = (rect[1] + rect[3]).min(clip[1] + clip[3]);
    (right > left && bottom > top).then_some([left, top, right - left, bottom - top])
}

pub fn apply_entity_clip(world: &mut World, entity: Entity) -> Result<(), String> {
    let position = *world
        .get::<AtomeLogicalPosition>(entity)
        .ok_or_else(|| "bevy_clip_position_missing".to_string())?;
    let size = *world
        .get::<AtomeLogicalSize>(entity)
        .ok_or_else(|| "bevy_clip_size_missing".to_string())?;
    let clip = world.get::<AtomeClipRect>(entity).and_then(|value| value.0);
    let local = world
        .get::<AtomeLocalTransform>(entity)
        .copied()
        .unwrap_or_default();
    let layer = world.get::<AtomeLayer>(entity).map(|value| value.0).unwrap_or(0);
    let (surface_width, surface_height) = {
        let config = world.resource::<AtomeBevyRendererConfig>();
        (config.width, config.height)
    };
    let original = [position.x, position.y, size.width, size.height];
    let intersection = clip.and_then(|value| intersection(original, value));
    let clipped_out = clip.is_some() && intersection.is_none();
    let visible = intersection.unwrap_or(original);

    if let Some(mut visibility) = world.get_mut::<Visibility>(entity) {
        *visibility = if clipped_out {
            Visibility::Hidden
        } else {
            Visibility::Visible
        };
    }
    if clipped_out {
        return Ok(());
    }

    let transform = atome_rect_transform_with_local(
        visible[0],
        visible[1],
        visible[2],
        visible[3],
        surface_width,
        surface_height,
        depth_for_layer(layer),
        local.scale,
        local.rotation,
        local.origin,
    );
    world.entity_mut(entity).insert(transform);
    world
        .entity_mut(entity)
        .insert(GlobalTransform::from(transform));

    let source_rect = world
        .get::<AtomeSpriteSourceRect>(entity)
        .map(|value| value.0)
        .unwrap_or(None);
    let image_size = world
        .get::<Sprite>(entity)
        .and_then(|sprite| world.get_resource::<Assets<Image>>()?.get(&sprite.image))
        .map(|image| Vec2::new(image.width() as f32, image.height() as f32));
    if let Some(mut sprite) = world.get_mut::<Sprite>(entity) {
        sprite.custom_size = Some(Vec2::new(visible[2], visible[3]));
        if clip.is_none() {
            sprite.rect = source_rect;
        } else if let Some(texture_size) = image_size {
            let base = source_rect.unwrap_or(Rect::from_corners(Vec2::ZERO, texture_size));
            let start = Vec2::new(
                (visible[0] - original[0]) / original[2],
                (visible[1] - original[1]) / original[3],
            );
            let end = Vec2::new(
                (visible[0] + visible[2] - original[0]) / original[2],
                (visible[1] + visible[3] - original[1]) / original[3],
            );
            let base_size = base.size();
            sprite.rect = Some(Rect::from_corners(
                base.min + base_size * start,
                base.min + base_size * end,
            ));
        }
    }
    Ok(())
}
