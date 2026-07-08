use bevy::{
    image::Image,
    prelude::*,
    render::batching::NoAutomaticBatching,
    text::{FontSize, TextBounds},
};

use crate::{
    render_math::{atome_rect_transform_with_local, color_from_rgba, depth_for_layer},
    selection_overlay::rebuild_selection_overlay,
    shape_shadow_overlay::rebuild_shape_shadow_overlay,
    texture::{
        cached_image_handle_from_rounded_rect_mask, image_handle_from_rounded_rect_mask,
        image_handle_from_texture,
    },
    types::*,
    video_external_texture::{
        insert_video_external_texture_component_for_node, insert_video_quad_mesh,
    },
    waveform_playback_overlay::rebuild_waveform_playback_overlay,
};

fn color_for_node(node: &AtomeRenderNode) -> [f32; 4] {
    node.color.unwrap_or([0.24, 0.55, 0.92, 1.0])
}

fn color_with_opacity(mut color: [f32; 4], opacity: f32) -> [f32; 4] {
    color[3] = color[3].clamp(0.0, 1.0) * normalize_opacity(opacity);
    color
}

fn white_with_opacity(opacity: f32) -> Color {
    color_from_rgba([1.0, 1.0, 1.0, normalize_opacity(opacity)])
}

fn texture_owns_sprite_color(kind: &str, has_texture: bool) -> bool {
    has_texture && matches!(kind, "image" | "text" | "audio_waveform")
}

fn visual_color_for_node(node: &AtomeRenderNode, has_texture: bool) -> [f32; 4] {
    if texture_owns_sprite_color(&node.kind, has_texture) {
        [1.0, 1.0, 1.0, 1.0]
    } else {
        color_for_node(node)
    }
}

fn node_base_components(
    node: &AtomeRenderNode,
    width: f32,
    height: f32,
    surface_width: f32,
    surface_height: f32,
) -> (
    AtomeEntityId,
    AtomeParentEntityId,
    AtomeLogicalPosition,
    AtomeLogicalSize,
    AtomeLocalTransform,
    AtomeLayer,
    AtomeRenderKind,
    AtomeTextMetadata,
    AtomeMediaSource,
    AtomeWaveformPeaks,
    AtomeWaveformPlaybackProgress,
    AtomeSelected,
    AtomeShapeShadow,
    Visibility,
    Transform,
) {
    (
        AtomeEntityId(node.id.clone()),
        AtomeParentEntityId(node.parent_id.clone()),
        AtomeLogicalPosition {
            x: node.logical_position[0],
            y: node.logical_position[1],
        },
        AtomeLogicalSize { width, height },
        AtomeLocalTransform::new(node.scale, node.rotation, node.origin),
        AtomeLayer(node.layer),
        AtomeRenderKind(node.kind.clone()),
        AtomeTextMetadata(node.text.clone()),
        AtomeMediaSource(node.source.clone()),
        AtomeWaveformPeaks(node.peaks.clone().unwrap_or_default()),
        AtomeWaveformPlaybackProgress(node.playback_progress.map(|value| value.clamp(0.0, 1.0))),
        AtomeSelected(node.selected.unwrap_or(false)),
        AtomeShapeShadow(node.shadow),
        Visibility::Visible,
        atome_rect_transform_with_local(
            node.logical_position[0],
            node.logical_position[1],
            width,
            height,
            surface_width,
            surface_height,
            depth_for_layer(node.layer),
            node.scale,
            node.rotation,
            node.origin,
        ),
    )
}

pub(crate) fn texture_handle_for_node(
    images: &mut Assets<Image>,
    node: &AtomeRenderNode,
) -> Result<Option<Handle<Image>>, String> {
    if node.kind == "video" {
        return Ok(None);
    }
    if node.texture.is_some() {
        return Ok(Some(image_handle_from_texture(
            images,
            &node.texture,
            &node.id,
        )?));
    }
    if node.kind == "shape" && node.corner_radius > 0.0 {
        return Ok(Some(image_handle_from_rounded_rect_mask(
            images,
            node.logical_size[0],
            node.logical_size[1],
            node.corner_radius,
            &node.id,
        )?));
    }
    Ok(None)
}

pub(crate) fn texture_handle_for_node_in_world(
    world: &mut World,
    node: &AtomeRenderNode,
) -> Result<Option<Handle<Image>>, String> {
    if node.kind == "shape" && node.texture.is_none() && node.corner_radius > 0.0 {
        return Ok(Some(cached_image_handle_from_rounded_rect_mask(
            world,
            node.logical_size[0],
            node.logical_size[1],
            node.corner_radius,
            &node.id,
        )?));
    }
    let mut images = world
        .get_resource_mut::<Assets<Image>>()
        .ok_or_else(|| "bevy_image_assets_required".to_string())?;
    texture_handle_for_node(&mut images, node)
}

pub fn spawn_node_in_world(world: &mut World, node: AtomeRenderNode) -> Result<Entity, String> {
    let entity = {
        let texture_handle = texture_handle_for_node_in_world(world, &node)?;
        let (surface_width, surface_height) = {
            let config = world.resource::<AtomeBevyRendererConfig>();
            (config.width, config.height)
        };
        let entity = spawn_node_with_texture_handle(
            world,
            node.clone(),
            texture_handle.clone(),
            surface_width,
            surface_height,
        )?;
        insert_video_external_texture_component_for_node(world, entity, &node);
        entity
    };
    world
        .resource_mut::<AtomeEntityTable>()
        .by_id
        .insert(node.id, entity);
    rebuild_selection_overlay(world, entity)?;
    rebuild_shape_shadow_overlay(world, entity)?;
    rebuild_waveform_playback_overlay(world, entity)?;
    Ok(entity)
}

pub fn spawn_node_with_texture_handle(
    world: &mut World,
    node: AtomeRenderNode,
    texture_handle: Option<Handle<Image>>,
    surface_width: f32,
    surface_height: f32,
) -> Result<Entity, String> {
    let width = node.logical_size[0].max(1.0);
    let height = node.logical_size[1].max(1.0);
    let color = color_for_node(&node);
    let has_texture = texture_handle.is_some();
    let visual_color = visual_color_for_node(&node, has_texture);
    let visible_color = color_with_opacity(color, node.opacity);
    let size = Vec2::new(width, height);
    let entity = match node.kind.as_str() {
        "shape" => {
            let sprite = if let Some(handle) = texture_handle {
                let mut sprite = Sprite::from_image(handle);
                sprite.custom_size = Some(size);
                sprite.color = color_from_rgba(visible_color);
                sprite
            } else {
                Sprite::from_color(color_from_rgba(visible_color), size)
            };
            world
                .spawn((
                    node_base_components(&node, width, height, surface_width, surface_height),
                    sprite,
                ))
                .id()
        }
        "text" => {
            if let Some(handle) = texture_handle {
                let mut sprite = Sprite::from_image(handle);
                sprite.custom_size = Some(size);
                sprite.color = white_with_opacity(node.opacity);
                world
                    .spawn((
                        node_base_components(&node, width, height, surface_width, surface_height),
                        sprite,
                    ))
                    .id()
            } else {
                world
                    .spawn((
                        node_base_components(&node, width, height, surface_width, surface_height),
                        Text2d::new(node.text.clone().unwrap_or_default()),
                        TextFont {
                            font_size: FontSize::Px(height.min(32.0).max(12.0)),
                            ..default()
                        },
                        TextColor(color_from_rgba(visible_color)),
                        TextBounds::from(size),
                    ))
                    .id()
            }
        }
        "image" => {
            let _source = node
                .source
                .clone()
                .filter(|value| !value.trim().is_empty())
                .ok_or_else(|| format!("bevy_media_source_required:{}", node.id))?;
            let mut sprite = if let Some(handle) = texture_handle {
                Sprite::from_image(handle)
            } else {
                Sprite::from_color(color_from_rgba(color), size)
            };
            sprite.custom_size = Some(size);
            if has_texture {
                sprite.color = white_with_opacity(node.opacity);
            } else {
                sprite.color = color_from_rgba(visible_color);
            }
            world
                .spawn((
                    node_base_components(&node, width, height, surface_width, surface_height),
                    sprite,
                ))
                .id()
        }
        "video" => {
            let _source = node
                .source
                .clone()
                .filter(|value| !value.trim().is_empty())
                .ok_or_else(|| format!("bevy_media_source_required:{}", node.id))?;
            let entity = world
                .spawn((
                    node_base_components(&node, width, height, surface_width, surface_height),
                    NoAutomaticBatching,
                ))
                .id();
            insert_video_quad_mesh(
                world,
                entity,
                [width, height],
                normalize_uv_rect(node.uv_rect),
            )?;
            entity
        }
        "audio_waveform" => {
            let mut sprite = if let Some(handle) = texture_handle {
                Sprite::from_image(handle)
            } else {
                Sprite::from_color(color_from_rgba(color), size)
            };
            sprite.custom_size = Some(size);
            if has_texture {
                sprite.color = white_with_opacity(node.opacity);
            } else {
                sprite.color = color_from_rgba(visible_color);
            }
            world
                .spawn((
                    node_base_components(&node, width, height, surface_width, surface_height),
                    sprite,
                ))
                .id()
        }
        other => return Err(format!("bevy_render_kind_unsupported:{other}")),
    };
    world.entity_mut(entity).insert((
        AtomeVisualColor(visual_color),
        AtomeVisualOpacity(normalize_opacity(node.opacity)),
        AtomeCornerRadius(node.corner_radius.max(0.0)),
    ));
    Ok(entity)
}
