use bevy::{image::Image, prelude::*};

use crate::{
    render_math::color_from_rgba,
    texture::image_handle_from_texture,
    types::*,
    video_external_texture::{
        insert_video_external_texture_component_for_node, insert_video_quad_mesh,
    },
};

fn entity_for(world: &World, id: &str) -> Result<Entity, String> {
    world
        .resource::<AtomeEntityTable>()
        .by_id
        .get(id)
        .copied()
        .ok_or_else(|| format!("bevy_atome_entity_missing:{id}"))
}

pub(crate) fn texture_sprite_color(world: &mut World, entity: Entity) -> Color {
    let opacity = world
        .get::<AtomeVisualOpacity>(entity)
        .map(|value| value.0)
        .unwrap_or_else(default_opacity);
    if let Some(mut current) = world.get_mut::<AtomeVisualColor>(entity) {
        current.0 = [1.0, 1.0, 1.0, 1.0];
    }
    color_from_rgba([1.0, 1.0, 1.0, normalize_opacity(opacity)])
}

pub fn apply_resource(world: &mut World, patch: AtomeResourcePatch) -> Result<(), String> {
    let entity = entity_for(world, &patch.id)?;
    let source = patch
        .source
        .clone()
        .filter(|value| !value.trim().is_empty());
    if let Some(mut media_source) = world.get_mut::<AtomeMediaSource>(entity) {
        media_source.0 = source.clone();
    }
    if let Some(peaks) = patch.peaks {
        if let Some(mut waveform) = world.get_mut::<AtomeWaveformPeaks>(entity) {
            waveform.0 = peaks;
        }
    }
    let kind = world
        .get::<AtomeRenderKind>(entity)
        .map(|value| value.0.clone())
        .unwrap_or_default();
    if kind == "video" {
        let _source = source
            .as_ref()
            .ok_or_else(|| format!("bevy_media_source_required:{}", patch.id))?;
        let layer = world
            .get::<AtomeLayer>(entity)
            .map(|value| value.0)
            .unwrap_or(0);
        let opacity = world
            .get::<crate::video_external_texture::AtomeVideoExternalTexture>(entity)
            .map(|value| value.opacity)
            .unwrap_or_else(default_opacity);
        let current_uv_rect = world
            .get::<crate::video_external_texture::AtomeVideoExternalTexture>(entity)
            .map(|video| video.uv_rect)
            .unwrap_or_else(default_uv_rect);
        let current_filters = world
            .get::<crate::video_external_texture::AtomeVideoExternalTexture>(entity)
            .map(|value| value.filters);
        let current_transition = world
            .get::<crate::video_external_texture::AtomeVideoExternalTexture>(entity)
            .map(|value| value.transition);
        let local_transform = world
            .get::<AtomeLocalTransform>(entity)
            .copied()
            .unwrap_or_default();
        let uv_rect = match patch.uv_rect {
            Some(value) => normalize_uv_rect(value),
            None => current_uv_rect,
        };
        let size = world
            .get::<AtomeLogicalSize>(entity)
            .map(|value| [value.width, value.height])
            .unwrap_or([1.0, 1.0]);
        let node = AtomeRenderNode {
            id: patch.id,
            kind,
            parent_id: None,
            logical_position: [0.0, 0.0],
            logical_size: [1.0, 1.0],
            scale: local_transform.scale,
            rotation: local_transform.rotation,
            origin: local_transform.origin,
            layer,
            opacity,
            corner_radius: 0.0,
            shadow: None,
            color: None,
            text: None,
            source,
            texture_size: patch.texture_size,
            uv_rect: Some(uv_rect),
            texture: None,
            peaks: None,
            playback_progress: None,
            selected: None,
            filters: current_filters,
            transition: current_transition,
            procedural: None,
        };
        insert_video_external_texture_component_for_node(world, entity, &node);
        insert_video_quad_mesh(world, entity, size, uv_rect)?;
        return Ok(());
    }
    if kind == "image" || kind == "audio_waveform" {
        if kind == "image" {
            let _source =
                source.ok_or_else(|| format!("bevy_media_source_required:{}", patch.id))?;
        }
        let handle = {
            let mut images = world
                .get_resource_mut::<Assets<Image>>()
                .ok_or_else(|| "bevy_image_assets_required".to_string())?;
            image_handle_from_texture(&mut images, &patch.texture, &patch.id)?
        };
        let color = texture_sprite_color(world, entity);
        let mut sprite = world
            .get_mut::<Sprite>(entity)
            .ok_or_else(|| format!("bevy_resource_sprite_missing:{}", patch.id))?;
        sprite.image = handle;
        sprite.color = color;
    }
    Ok(())
}
