use bevy::{
    image::Image,
    prelude::*,
    render::batching::NoAutomaticBatching,
    text::{FontSize, TextBounds},
};

use crate::{
    backdrop_surface::insert_backdrop_surface,
    clip::apply_entity_clip,
    procedural_sdf::insert_procedural_sdf,
    render_math::{atome_rect_transform_with_local, color_from_rgba, depth_for_layer},
    selection_overlay::rebuild_selection_overlay,
    shape_sdf::{
        apply_spatial_mask_to_texture, cached_image_handle_from_shape_mask, shape_mask_texture,
        AtomeShapeSilhouette,
    },
    shape_shadow_overlay::rebuild_shape_shadow_overlay,
    texture::{
        image_handle_from_texture, uniform_corner_radii, AtomeCornerRadii,
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
        waveform_progress: AtomeWaveformPlaybackProgress(node.playback_progress.map(|value| value.clamp(0.0, 1.0))),
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

/// A node may carry per-corner radii instead of the uniform scalar. A partially
/// rounded shape has `corner_radius == 0.0`, so the mask must be selected on the
/// resolved radii rather than on the scalar alone.
pub(crate) fn effective_corner_radii(node: &AtomeRenderNode) -> AtomeCornerRadii {
    node.corner_radii
        .unwrap_or_else(|| uniform_corner_radii(node.corner_radius))
}

/// La silhouette complete d'un noeud : sa variante, ses reglages, sa boite et
/// son arrondi resolu. Le meme objet sert au masque ET a l'ombre, pour qu'une
/// etoile ne puisse pas projeter l'ombre d'un carre.
pub(crate) fn shape_silhouette_for_node(node: &AtomeRenderNode) -> AtomeShapeSilhouette {
    AtomeShapeSilhouette {
        geometry: node.shape_geometry(),
        width: node.logical_size[0].max(1.0),
        height: node.logical_size[1].max(1.0),
        corner_radii: effective_corner_radii(node),
    }
}

/// Le masque alpha d'un noeud, quand sa projection en a resolu un.
fn node_mask(node: &AtomeRenderNode) -> Option<AtomeMaskStyle> {
    node.mask.clone().and_then(AtomeMaskStyle::normalized)
}

/// Une texture decoupee par la silhouette du masque : l'alpha est compose ICI,
/// sur le CPU, dans la texture qui part a la carte graphique. Le noeud garde son
/// materiau, sa pose et ses calques ; seule sa couverture change — et une image
/// sans masque n'est jamais recopiee.
fn masked_texture(texture: &AtomeTexture, mask: Option<&AtomeMaskStyle>) -> Option<AtomeTexture> {
    match mask {
        Some(mask) => Some(apply_spatial_mask_to_texture(texture, mask)),
        None => None,
    }
}

pub(crate) fn texture_handle_for_node(
    images: &mut Assets<Image>,
    node: &AtomeRenderNode,
) -> Result<Option<Handle<Image>>, String> {
    if node.kind == "video" {
        return Ok(None);
    }
    let mask = node_mask(node);
    if let Some(source) = node.texture.as_ref() {
        return match masked_texture(source, mask.as_ref()) {
            Some(masked) => Ok(Some(image_handle_from_texture(images, &Some(masked), &node.id)?)),
            None => Ok(Some(image_handle_from_texture(images, &node.texture, &node.id)?)),
        };
    }
    let silhouette = shape_silhouette_for_node(node);
    // Un masque demande une texture a decouper : meme un rectangle plein en
    // recoit une, sinon l'alpha du masque n'aurait rien a multiplier et la
    // forme restait entiere.
    if node.kind == "shape" && (silhouette.requires_mask() || mask.is_some()) {
        let texture = shape_mask_texture(&silhouette);
        let texture = masked_texture(&texture, mask.as_ref()).unwrap_or(texture);
        return Ok(Some(image_handle_from_texture(images, &Some(texture), &node.id)?));
    }
    Ok(None)
}

pub(crate) fn texture_handle_for_node_in_world(
    world: &mut World,
    node: &AtomeRenderNode,
) -> Result<Option<Handle<Image>>, String> {
    let silhouette = shape_silhouette_for_node(node);
    // Une forme SANS texture ET sans masque se sert du cache : c'est le cas de
    // tres loin le plus frequent (chaque carre arrondi de l'interface).
    if node.kind == "shape"
        && node.texture.is_none()
        && silhouette.requires_mask()
        && node_mask(node).is_none()
    {
        return Ok(Some(cached_image_handle_from_shape_mask(world, &silhouette, &node.id)?));
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
                let entity = world
                    .spawn(node_base_components(&node, width, height, surface_width, surface_height))
                    .id();
                insert_backdrop_surface(world, entity, [width, height], node.corner_radius, backdrop)?;
                entity
            } else {
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
            if let Some(texture) = node.texture.as_ref() {
                sprite.rect = crate::texture::sprite_rect_from_uv(node.uv_rect, texture.width, texture.height);
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
        "audio_waveform" => {
            let mut sprite = if let Some(handle) = texture_handle {
                Sprite::from_image(handle)
            } else {
                Sprite::from_color(color_from_rgba(color), size)
            };
            sprite.custom_size = Some(size);
            if let Some(texture) = node.texture.as_ref() {
                sprite.rect = crate::texture::sprite_rect_from_uv(node.uv_rect, texture.width, texture.height);
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
            insert_procedural_sdf(world, entity, [width, height], contract)?;
            entity
        }
        other => return Err(format!("bevy_render_kind_unsupported:{other}")),
    };
    world.entity_mut(entity).insert((
        AtomeVisualColor(visual_color),
        AtomeVisualOpacity(normalize_opacity(node.opacity)),
        AtomeCornerRadius(effective_corner_radii(&node)),
        AtomeClipRect(node.clip_rect),
        AtomeClipRotation(node.clip_rotation),
    ));
    if let Some(source_rect) = world.get::<Sprite>(entity).map(|sprite| sprite.rect) {
        world.entity_mut(entity).insert(AtomeSpriteSourceRect(source_rect));
    }
    if node.project_space {
        world.entity_mut(entity).insert(crate::project_view::AtomeProjectSpace);
    }
    if node.presentation {
        world.entity_mut(entity).insert(bevy::camera::visibility::RenderLayers::layer(
            crate::workspace_backdrop::MENU_PRESENTATION_LAYER,
        ));
    }
    if node.menu_plane > 0 {
        world.entity_mut(entity).insert(bevy::camera::visibility::RenderLayers::layer(
            if node.menu_plane == 1 { crate::mystic_capture::MENU_FACE_LAYER }
            else { crate::mystic_capture::MENU_OVERLAY_LAYER },
        ));
    }
    if let Some(texture) = &node.texture {
        if let Err(error) = crate::animated_png::install_animation(world, entity, texture) {
            world.despawn(entity);
            return Err(error);
        }
    }
    Ok(entity)
}
