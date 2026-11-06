use bevy::{
    image::Image,
    prelude::*,
    render::batching::NoAutomaticBatching,
    text::{FontSize, TextBounds},
};

use crate::{
    backdrop_surface::insert_backdrop_surface,
    clip::apply_entity_clip,
    node_texture::{effective_corner_radii, texture_handle_for_node_in_world},
    procedural_sdf::insert_procedural_sdf,
    render_math::{atome_rect_transform_with_local, color_from_rgba, depth_for_layer},
    selection_overlay::rebuild_selection_overlay,
    shape_shadow_overlay::rebuild_shape_shadow_overlay,
    types::*,
    video_external_texture::{
        insert_video_external_texture_component_for_node, insert_video_quad_mesh,
    },
    waveform_playback_overlay::rebuild_waveform_playback_overlay,
};

pub(crate) fn color_for_node(node: &AtomeRenderNode) -> [f32; 4] {
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
) -> AtomeNodeBaseBundle {
    AtomeNodeBaseBundle {
        entity_id: AtomeEntityId(node.id.clone()),
        parent_entity_id: AtomeParentEntityId(node.parent_id.clone()),
        logical_position: AtomeLogicalPosition {
            x: node.logical_position[0],
            y: node.logical_position[1],
        },
        logical_size: AtomeLogicalSize { width, height },
        local_transform: AtomeLocalTransform::new(node.scale, node.rotation, node.origin),
        layer: AtomeLayer(node.layer),
        render_kind: AtomeRenderKind(node.kind.clone()),
        text_metadata: AtomeTextMetadata(node.text.clone()),
        media_source: AtomeMediaSource(node.source.clone()),
        waveform_peaks: AtomeWaveformPeaks(node.peaks.clone().unwrap_or_default()),
        waveform_progress: AtomeWaveformPlaybackProgress(
            node.playback_progress.map(|value| value.clamp(0.0, 1.0)),
        ),
        selected: AtomeSelected(node.selected.unwrap_or(false)),
        shape_shadow: AtomeShapeShadow(node.shadow),
        resolved_mask: AtomeResolvedMask(node.mask.clone().and_then(AtomeMaskStyle::normalized)),
        shape_profile: AtomeShapeProfile(node.shape_geometry()),
        visibility: Visibility::Visible,
        transform: atome_rect_transform_with_local(
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
    }
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
    apply_entity_clip(world, entity)?;
    // Une forme qui SERT de masque garde son atome, sa pose et sa selection :
    // seule sa peinture disparait, puisque c'est sa silhouette qui travaille.
    // L'extinction vient EN DERNIER : la decoupe ci-dessus recalcule la
    // visibilite de tout noeud qu'elle touche, et rallumait la source.
    if node.mask_source {
        world
            .entity_mut(entity)
            .insert((AtomeMaskSource, Visibility::Hidden));
        // La peinture disparue, son ombre disparait avec elle : le calque
        // d'ombre se construit sur la visibilite, qui vient de passer a
        // Hidden. Le contour de selection, lui, reste — c'est par lui qu'on
        // continue d'attraper la forme pour la remodeler.
        rebuild_shape_shadow_overlay(world, entity)?;
    }
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
            if let Some(backdrop) = node.backdrop {
                // Le verre lit l'opacite du noeud a sa creation : elle doit etre la
                // avant lui, sinon un verre ne a 0 (une UI qui va apparaitre en fondu)
                // s'affiche plein jusqu'au premier patch d'opacite.
                let entity = world
                    .spawn((
                        node_base_components(&node, width, height, surface_width, surface_height),
                        AtomeVisualOpacity(normalize_opacity(node.opacity)),
                    ))
                    .id();
                insert_backdrop_surface(
                    world,
                    entity,
                    [width, height],
                    node.corner_radius,
                    backdrop,
                )?;
                entity
            } else {
                let sprite = if let Some(handle) = texture_handle {
                    let mut sprite = Sprite::from_image(handle);
                    sprite.custom_size = Some(size);
                    sprite.color = if node.surface_paint.is_some() {
                        white_with_opacity(node.opacity)
                    } else {
                        color_from_rgba(visible_color)
                    };
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
                            font_size: FontSize::Px(height.clamp(12.0, 32.0)),
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
            if let Some(texture) = node.texture.as_ref() {
                sprite.rect = crate::texture::sprite_rect_from_uv(
                    node.uv_rect,
                    texture.width,
                    texture.height,
                );
            }
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
        // A media window: the Atome's own quad, cut out of the canvas so the
        // player laid under it shows through (see media_window.rs).
        "media_window" => {
            let entity = world
                .spawn((
                    node_base_components(&node, width, height, surface_width, surface_height),
                    NoAutomaticBatching,
                    crate::media_window::AtomeMediaWindow {
                        id: node.id.clone(),
                        mask_texture: None,
                    },
                ))
                .id();
            insert_video_quad_mesh(world, entity, [width, height], [0.0, 0.0, 1.0, 1.0])?;
            entity
        }
        "audio_waveform" => {
            let mut sprite = if let Some(handle) = texture_handle {
                Sprite::from_image(handle)
            } else {
                Sprite::from_color(color_from_rgba(color), size)
            };
            sprite.custom_size = Some(size);
            if let Some(texture) = node.texture.as_ref() {
                sprite.rect = crate::texture::sprite_rect_from_uv(
                    node.uv_rect,
                    texture.width,
                    texture.height,
                );
            }
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
        "procedural_sdf" => {
            let contract = node
                .procedural
                .ok_or_else(|| format!("bevy_procedural_sdf_contract_required:{}", node.id))?;
            let entity = world
                .spawn(node_base_components(
                    &node,
                    width,
                    height,
                    surface_width,
                    surface_height,
                ))
                .id();
            if contract.mode > 3.5 {
                crate::login_light::insert(
                    world,
                    entity,
                    [width, height],
                    contract,
                    texture_handle,
                )?;
            } else {
                insert_procedural_sdf(world, entity, [width, height], contract)?;
            }
            entity
        }
        // The Sport card's ring around its disc (progress_ring.rs).
        "progress_ring" => {
            let ring = node
                .progress_ring
                .ok_or_else(|| format!("bevy_progress_ring_contract_required:{}", node.id))?;
            let entity = world
                .spawn(node_base_components(
                    &node,
                    width,
                    height,
                    surface_width,
                    surface_height,
                ))
                .id();
            crate::progress_ring::insert(
                world,
                entity,
                [width, height],
                ring,
                normalize_opacity(node.opacity),
            )?;
            entity
        }
        other => return Err(format!("bevy_render_kind_unsupported:{other}")),
    };
    world
        .entity_mut(entity)
        .insert(crate::surface_paint::AtomeSurfacePaint(
            node.surface_paint.clone(),
        ));
    crate::backdrop_surface::sync_backdrop_surface_border(world, entity)?;
    world.entity_mut(entity).insert((
        AtomeVisualColor(visual_color),
        AtomeVisualOpacity(normalize_opacity(node.opacity)),
        AtomeCornerRadius(effective_corner_radii(&node)),
        AtomeClipRect(node.clip_rect),
        AtomeClipRotation(node.clip_rotation),
        AtomeClipRoundedRects(node.clip_rounded_rects),
        AtomeClipFades(node.clip_fades),
    ));
    // The cut-out takes the Atome's shape once its radii are on the entity.
    if node.kind == "media_window" {
        crate::media_window::refresh_media_window_mask(world, entity, &node.id)?;
    }
    if let Some(source_rect) = world.get::<Sprite>(entity).map(|sprite| sprite.rect) {
        world
            .entity_mut(entity)
            .insert(AtomeSpriteSourceRect(source_rect));
    }
    if node.project_space {
        world
            .entity_mut(entity)
            .insert(crate::project_view::AtomeProjectSpace);
    }
    if node.presentation {
        world
            .entity_mut(entity)
            .insert(bevy::camera::visibility::RenderLayers::layer(
                crate::workspace_backdrop::MENU_PRESENTATION_LAYER,
            ));
    }
    if node.menu_plane > 0 {
        world
            .entity_mut(entity)
            .insert(bevy::camera::visibility::RenderLayers::layer(
                if node.menu_plane == 1 {
                    crate::mystic_capture::MENU_FACE_LAYER
                } else {
                    crate::mystic_capture::MENU_OVERLAY_LAYER
                },
            ));
    }
    if let Some(texture) = &node.texture
        && let Err(error) = crate::animated_png::install_animation(world, entity, texture)
    {
        world.despawn(entity);
        return Err(error);
    }
    Ok(entity)
}
