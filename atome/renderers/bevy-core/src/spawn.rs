use bevy::{image::Image, prelude::*, text::TextBounds};

use crate::{
    render_math::{atome_rect_transform, color_from_rgba, depth_for_layer},
    selection_overlay::rebuild_selection_overlay,
    texture::image_handle_from_texture,
    types::*,
};

fn color_for_node(node: &AtomeRenderNode) -> [f32; 4] {
    node.color.unwrap_or([0.24, 0.55, 0.92, 1.0])
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
    AtomeLayer,
    AtomeRenderKind,
    AtomeTextMetadata,
    AtomeMediaSource,
    AtomeWaveformPeaks,
    AtomeSelected,
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
        AtomeLayer(node.layer),
        AtomeRenderKind(node.kind.clone()),
        AtomeTextMetadata(node.text.clone()),
        AtomeMediaSource(node.source.clone()),
        AtomeWaveformPeaks(node.peaks.clone().unwrap_or_default()),
        AtomeSelected(node.selected.unwrap_or(false)),
        Visibility::Visible,
        atome_rect_transform(
            node.logical_position[0],
            node.logical_position[1],
            width,
            height,
            surface_width,
            surface_height,
            depth_for_layer(node.layer),
        ),
    )
}

pub fn spawn_node_in_world(world: &mut World, node: AtomeRenderNode) -> Result<Entity, String> {
    let entity = {
        let texture_handle = if node.texture.is_some() {
            let mut images = world
                .get_resource_mut::<Assets<Image>>()
                .ok_or_else(|| "bevy_image_assets_required".to_string())?;
            Some(image_handle_from_texture(
                &mut images,
                &node.texture,
                &node.id,
            )?)
        } else {
            None
        };
        let (surface_width, surface_height) = {
            let config = world.resource::<AtomeBevyRendererConfig>();
            (config.width, config.height)
        };
        spawn_node_with_texture_handle(
            world,
            node.clone(),
            texture_handle,
            surface_width,
            surface_height,
        )?
    };
    world
        .resource_mut::<AtomeEntityTable>()
        .by_id
        .insert(node.id, entity);
    rebuild_selection_overlay(world, entity)?;
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
    let size = Vec2::new(width, height);
    let entity = match node.kind.as_str() {
        "shape" => world
            .spawn((
                node_base_components(&node, width, height, surface_width, surface_height),
                Sprite::from_color(color_from_rgba(color), size),
            ))
            .id(),
        "text" => {
            if let Some(handle) = texture_handle {
                let mut sprite = Sprite::from_image(handle);
                sprite.custom_size = Some(size);
                sprite.color = Color::WHITE;
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
                            font_size: height.min(32.0).max(12.0),
                            ..default()
                        },
                        TextColor(color_from_rgba(color)),
                        TextBounds::from(size),
                    ))
                    .id()
            }
        }
        "image" | "video" => {
            let _source = node
                .source
                .clone()
                .filter(|value| !value.trim().is_empty())
                .ok_or_else(|| format!("bevy_media_source_required:{}", node.id))?;
            let has_texture = texture_handle.is_some();
            let mut sprite = if let Some(handle) = texture_handle {
                Sprite::from_image(handle)
            } else {
                Sprite::from_color(color_from_rgba(color), size)
            };
            sprite.custom_size = Some(size);
            if has_texture {
                sprite.color = Color::WHITE;
            }
            world
                .spawn((
                    node_base_components(&node, width, height, surface_width, surface_height),
                    sprite,
                ))
                .id()
        }
        "audio_waveform" => {
            let has_texture = texture_handle.is_some();
            let mut sprite = if let Some(handle) = texture_handle {
                Sprite::from_image(handle)
            } else {
                Sprite::from_color(color_from_rgba(color), size)
            };
            sprite.custom_size = Some(size);
            if has_texture {
                sprite.color = Color::WHITE;
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
    Ok(entity)
}
