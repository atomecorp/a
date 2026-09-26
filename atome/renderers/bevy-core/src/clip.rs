use bevy::{image::Image, prelude::*, sprite_render::MeshMaterial2d};

use crate::{
    backdrop_surface::crop_backdrop_surface,
    clip_polygon::{
        clip_is_axis_aligned, polygon_bounds, polygon_mesh, remove_sprite_polygon_proxy,
        upsert_sprite_polygon_proxy, visible_polygon_in_atom_frame, write_polygon_into_entity_mesh,
        AtomeClipPolygonMesh,
    },
    components::*,
    render_math::{atome_rect_transform_with_local, depth_for_layer},
    video_external_texture::{insert_clipped_video_quad_mesh, AtomeVideoExternalTexture, AtomeVideoQuad},
};

/// Derniere decoupe posee sur le quad video : taille visible + sous-rectangle UV.
/// Une video n'est pas un sprite mais un MAILLAGE : sans ce chemin, elle
/// traversait une page sans jamais etre coupee. Le garde evite de reconstruire
/// (et de re-televerser) le maillage a chaque image d'un geste.
#[derive(Component, Clone, Copy, PartialEq, Debug)]
pub struct AtomeVideoClipMesh(pub [f32; 6]);

// Trace de diagnostic, lue par la page via le collecteur de perf existant.
#[cfg(target_arch = "wasm32")]
fn trace_video_clip(stage: &str) {
    use wasm_bindgen::{JsCast, JsValue};
    let Some(window) = web_sys::window() else { return };
    let Ok(callback) = js_sys::Reflect::get(window.as_ref(), &JsValue::from_str("__EVE_BEVY_PERF_RECORD__")) else { return };
    let Ok(function) = callback.dyn_into::<js_sys::Function>() else { return };
    let detail = js_sys::Object::new();
    let _ = function.call2(window.as_ref(), &JsValue::from_str(stage), detail.as_ref());
}

#[cfg(not(target_arch = "wasm32"))]
fn trace_video_clip(_stage: &str) {}

fn apply_video_clip_mesh(
    world: &mut World,
    entity: Entity,
    original: [f32; 4],
    visible: [f32; 4],
) -> Result<(), String> {
    // Le quad porte son propre rectangle d'origine ; le composant de texture
    // externe n'est qu'un repli (il peut manquer le temps que la source arrive).
    let Some(base) = world
        .get::<AtomeVideoQuad>(entity)
        .map(|quad| quad.0)
        .or_else(|| {
            world
                .get::<AtomeVideoExternalTexture>(entity)
                .map(|video| video.uv_rect)
        })
    else {
        return Ok(());
    };
    let start_x = ((visible[0] - original[0]) / original[2]).clamp(0.0, 1.0);
    let start_y = ((visible[1] - original[1]) / original[3]).clamp(0.0, 1.0);
    let end_x = ((visible[0] + visible[2] - original[0]) / original[2]).clamp(0.0, 1.0);
    let end_y = ((visible[1] + visible[3] - original[1]) / original[3]).clamp(0.0, 1.0);
    let uv = [
        base[0] + base[2] * start_x,
        base[1] + base[3] * start_y,
        base[2] * (end_x - start_x).max(0.0),
        base[3] * (end_y - start_y).max(0.0),
    ];
    let next = AtomeVideoClipMesh([visible[2], visible[3], uv[0], uv[1], uv[2], uv[3]]);
    if world.get::<AtomeVideoClipMesh>(entity).copied() == Some(next) {
        return Ok(());
    }
    insert_clipped_video_quad_mesh(world, entity, [visible[2], visible[3]], uv)?;
    trace_video_clip(&format!(
        "bevy.video.clip.applied.{}x{}.of.{}x{}",
        visible[2].round() as i32,
        visible[3].round() as i32,
        original[2].round() as i32,
        original[3].round() as i32
    ));
    world.entity_mut(entity).insert(next);
    Ok(())
}

fn intersection(rect: [f32; 4], clip: [f32; 4]) -> Option<[f32; 4]> {
    let left = rect[0].max(clip[0]);
    let top = rect[1].max(clip[1]);
    let right = (rect[0] + rect[2]).min(clip[0] + clip[2]);
    let bottom = (rect[1] + rect[3]).min(clip[1] + clip[3]);
    (right > left && bottom > top).then_some([left, top, right - left, bottom - top])
}

// Rotation ecran (y vers le bas, sens horaire pour un angle positif), comme
// `atome_rect_transform_with_local` une fois ramene en coordonnees logiques.
fn rotate_screen(point: Vec2, degrees: f32) -> Vec2 {
    let (sin, cos) = degrees.to_radians().sin_cos();
    Vec2::new(point.x * cos - point.y * sin, point.x * sin + point.y * cos)
}

/// Les 4 coins de la decoupe ramenes dans le repere PROPRE de l'atome (boite non
/// tournee, coin haut-gauche = 0,0). La decoupe vit dans le repere de sa page
/// (`clip_rotation`) ; l'atome pivote de `local.rotation` autour de son `origin`.
pub(crate) fn clip_corners_in_atom_frame(
    position: [f32; 2],
    size: [f32; 2],
    local: AtomeLocalTransform,
    clip: [f32; 4],
    clip_rotation: f32,
) -> [Vec2; 4] {
    let origin = Vec2::new(local.origin[0] * size[0], local.origin[1] * size[1]);
    let pivot = Vec2::new(position[0], position[1]) + origin;
    let scale = Vec2::new(
        if local.scale[0].abs() > f32::EPSILON { local.scale[0] } else { 1.0 },
        if local.scale[1].abs() > f32::EPSILON { local.scale[1] } else { 1.0 },
    );
    [
        Vec2::new(clip[0], clip[1]),
        Vec2::new(clip[0] + clip[2], clip[1]),
        Vec2::new(clip[0] + clip[2], clip[1] + clip[3]),
        Vec2::new(clip[0], clip[1] + clip[3]),
    ]
    .map(|corner| {
        let screen = rotate_screen(corner, clip_rotation);
        origin + rotate_screen(screen - pivot, -local.rotation) / scale
    })
}

/// Boite englobante de la decoupe dans le repere de l'atome : exacte quand les
/// deux angles sont egaux (page tournee avec ses membres). Sinon la decoupe exacte
/// est un polygone, voir `clip_polygon`.
pub(crate) fn clip_in_atom_frame(
    position: [f32; 2],
    size: [f32; 2],
    local: AtomeLocalTransform,
    clip: [f32; 4],
    clip_rotation: f32,
) -> [f32; 4] {
    let corners = clip_corners_in_atom_frame(position, size, local, clip, clip_rotation);
    let min = corners.iter().fold(Vec2::splat(f32::INFINITY), |acc, value| acc.min(*value));
    let max = corners.iter().fold(Vec2::splat(f32::NEG_INFINITY), |acc, value| acc.max(*value));
    [min.x, min.y, max.x - min.x, max.y - min.y]
}

/// Polygone visible quand la decoupe n'est PAS un rectangle droit dans le repere
/// de l'atome (angles differents). `None` = le chemin rectangle est exact
/// (angles alignes, ou atome entierement dans la decoupe).
fn visible_polygon_for_clip(
    position: [f32; 2],
    size: [f32; 2],
    local: AtomeLocalTransform,
    clip: [f32; 4],
    clip_rotation: f32,
) -> Option<Vec<Vec2>> {
    if clip_is_axis_aligned(local.rotation, clip_rotation) {
        return None;
    }
    let corners = clip_corners_in_atom_frame(position, size, local, clip, clip_rotation);
    let polygon = visible_polygon_in_atom_frame(size, &corners);
    let whole = polygon.len() == 4 && {
        let bounds = polygon_bounds(&polygon);
        bounds[0].abs() < 0.01 && bounds[1].abs() < 0.01
            && (bounds[2] - size[0]).abs() < 0.01 && (bounds[3] - size[1]).abs() < 0.01
    };
    (!whole).then_some(polygon)
}

pub fn apply_entity_clip(world: &mut World, entity: Entity) -> Result<(), String> {
    let position = *world
        .get::<AtomeLogicalPosition>(entity)
        .ok_or_else(|| "bevy_clip_position_missing".to_string())?;
    let size = *world
        .get::<AtomeLogicalSize>(entity)
        .ok_or_else(|| "bevy_clip_size_missing".to_string())?;
    let clip = world.get::<AtomeClipRect>(entity).and_then(|value| value.0);
    let clip_rotation = world.get::<AtomeClipRotation>(entity).map(|value| value.0).unwrap_or(0.0);
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
    // L'intersection se fait dans le repere de l'atome, puis on la replace a sa
    // position logique : les fractions UV ci-dessous restent valables telles quelles.
    // Angles differents : la decoupe exacte est un polygone ; son rectangle
    // englobant reste la « piece visible » du chemin rectangle (taille, pose, UV).
    let polygon = clip.and_then(|value| {
        visible_polygon_for_clip([position.x, position.y], [size.width, size.height], local, value, clip_rotation)
    });
    let intersection = match &polygon {
        Some(points) => (!points.is_empty()).then(|| polygon_bounds(points)),
        None => clip
            .map(|value| clip_in_atom_frame([position.x, position.y], [size.width, size.height], local, value, clip_rotation))
            .and_then(|value| intersection([0.0, 0.0, size.width, size.height], value)),
    }
    .map(|value| [position.x + value[0], position.y + value[1], value[2], value[3]]);
    let clipped_out = clip.is_some() && intersection.is_none();
    let visible = intersection.unwrap_or(original);
    // Le morceau visible pivote autour du pivot de l'atome ENTIER, pas du sien :
    // sinon un membre tourne et coupe se decalait.
    let visible_origin = [
        (position.x + local.origin[0] * size.width - visible[0]) / visible[2].max(f32::EPSILON),
        (position.y + local.origin[1] * size.height - visible[1]) / visible[3].max(f32::EPSILON),
    ];

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
        visible_origin,
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
    if let Some(points) = polygon.as_deref() {
        return apply_polygon_clip(world, entity, points, original, visible, image_size, source_rect, transform);
    }
    remove_sprite_polygon_proxy(world, entity);
    world.entity_mut(entity).remove::<AtomeClipPolygonMesh>();
    apply_video_clip_mesh(world, entity, original, visible)?;
    crop_backdrop_surface(
        world,
        entity,
        [visible[2], visible[3]],
        [
            (visible[0] - original[0]) / original[2],
            (visible[1] - original[1]) / original[3],
            visible[2] / original[2],
            visible[3] / original[3],
        ],
    )?;
    Ok(())
}

/// Dessine le polygone visible : maillage du relais pour un sprite, maillage propre
/// pour une video ou une surface de verre. Un texte sans texture garde la boite.
#[allow(clippy::too_many_arguments)]
fn apply_polygon_clip(
    world: &mut World,
    entity: Entity,
    polygon: &[Vec2],
    original: [f32; 4],
    visible: [f32; 4],
    image_size: Option<Vec2>,
    source_rect: Option<Rect>,
    transform: Transform,
) -> Result<(), String> {
    let size = Vec2::new(original[2].max(f32::EPSILON), original[3].max(f32::EPSILON));
    let local_visible = [visible[0] - original[0], visible[1] - original[1], visible[2], visible[3]];
    if world.get::<Sprite>(entity).is_some() {
        let (mesh, key) = polygon_mesh(polygon, local_visible, |p| {
            let fraction = p / size;
            match image_size {
                Some(texture_size) if texture_size.x > 0.0 && texture_size.y > 0.0 => {
                    let base = source_rect.unwrap_or(Rect::from_corners(Vec2::ZERO, texture_size));
                    let at = (base.min + base.size() * fraction) / texture_size;
                    [at.x, at.y]
                }
                _ => [fraction.x, fraction.y],
            }
        });
        return upsert_sprite_polygon_proxy(world, entity, mesh, key, transform);
    }
    let video_uv = world
        .get::<AtomeVideoQuad>(entity)
        .map(|quad| quad.0)
        .or_else(|| world.get::<AtomeVideoExternalTexture>(entity).map(|video| video.uv_rect));
    let is_backdrop = world
        .get::<MeshMaterial2d<crate::backdrop_surface::BackdropSurfaceMaterial>>(entity)
        .is_some();
    if video_uv.is_none() && !is_backdrop {
        return Ok(());
    }
    let base = video_uv.unwrap_or([0.0, 0.0, 1.0, 1.0]);
    let (mesh, key) = polygon_mesh(polygon, local_visible, |p| {
        let fraction = p / size;
        [base[0] + base[2] * fraction.x, base[1] + base[3] * fraction.y]
    });
    write_polygon_into_entity_mesh(world, entity, mesh, key)
}

#[cfg(test)]
mod video_clip_tests {
    use super::*;
    use crate::types::AtomeColorFilters;

    fn world_with_video(uv: [f32; 4]) -> (World, Entity) {
        let mut world = World::new();
        world.insert_resource(Assets::<Mesh>::default());
        let entity = world
            .spawn(AtomeVideoExternalTexture {
                id: "v1".to_string(),
                layer: 0,
                opacity: 1.0,
                uv_rect: uv,
                filters: AtomeColorFilters::identity(),
                transition: crate::types::AtomeTransition::none(),
            })
            .id();
        (world, entity)
    }

    #[test]
    fn a_video_outside_any_page_keeps_its_whole_quad() {
        let (mut world, entity) = world_with_video([0.0, 0.0, 1.0, 1.0]);
        let original = [10.0, 20.0, 200.0, 100.0];
        apply_video_clip_mesh(&mut world, entity, original, original).expect("clip");
        let applied = world.get::<AtomeVideoClipMesh>(entity).copied().expect("mesh state");
        assert_eq!(applied.0, [200.0, 100.0, 0.0, 0.0, 1.0, 1.0]);
    }

    #[test]
    fn a_video_cut_by_a_page_shrinks_its_quad_and_its_uv() {
        let (mut world, entity) = world_with_video([0.0, 0.0, 1.0, 1.0]);
        let original = [0.0, 0.0, 200.0, 100.0];
        // La page ne laisse voir que la moitie droite, moitie basse.
        let visible = [100.0, 50.0, 100.0, 50.0];
        apply_video_clip_mesh(&mut world, entity, original, visible).expect("clip");
        let applied = world.get::<AtomeVideoClipMesh>(entity).copied().expect("mesh state");
        assert_eq!(applied.0, [100.0, 50.0, 0.5, 0.5, 0.5, 0.5]);
    }

    #[test]
    fn a_cropped_source_stays_inside_its_own_uv_window() {
        let (mut world, entity) = world_with_video([0.25, 0.0, 0.5, 1.0]);
        let original = [0.0, 0.0, 100.0, 100.0];
        let visible = [50.0, 0.0, 50.0, 100.0];
        apply_video_clip_mesh(&mut world, entity, original, visible).expect("clip");
        let applied = world.get::<AtomeVideoClipMesh>(entity).copied().expect("mesh state");
        assert_eq!(applied.0, [50.0, 100.0, 0.5, 0.0, 0.25, 1.0]);
    }

    #[test]
    fn the_same_clip_twice_does_not_rebuild_the_mesh() {
        let (mut world, entity) = world_with_video([0.0, 0.0, 1.0, 1.0]);
        let original = [0.0, 0.0, 200.0, 100.0];
        let visible = [0.0, 0.0, 120.0, 100.0];
        apply_video_clip_mesh(&mut world, entity, original, visible).expect("clip");
        let first = world.resource::<Assets<Mesh>>().len();
        apply_video_clip_mesh(&mut world, entity, original, visible).expect("clip");
        assert_eq!(world.resource::<Assets<Mesh>>().len(), first,
            "une image de geste ne doit pas re-televerser le maillage");
    }

    #[test]
    fn a_video_quad_is_clipped_even_without_its_external_texture_component() {
        // Le cas reel qui echouait : le quad existe, le composant de texture
        // externe non — la video traversait alors la page sans etre coupee.
        let mut world = World::new();
        world.insert_resource(Assets::<Mesh>::default());
        let entity = world.spawn(crate::video_external_texture::AtomeVideoQuad([0.0, 0.0, 1.0, 1.0])).id();
        apply_video_clip_mesh(&mut world, entity, [0.0, 0.0, 200.0, 100.0], [0.0, 0.0, 120.0, 100.0]).expect("clip");
        let applied = world.get::<AtomeVideoClipMesh>(entity).copied().expect("mesh state");
        assert_eq!(applied.0, [120.0, 100.0, 0.0, 0.0, 0.6, 1.0]);
    }

    #[test]
    fn clipping_twice_never_crops_its_own_crop() {
        let mut world = World::new();
        world.insert_resource(Assets::<Mesh>::default());
        let entity = world.spawn(crate::video_external_texture::AtomeVideoQuad([0.0, 0.0, 1.0, 1.0])).id();
        let original = [0.0, 0.0, 200.0, 100.0];
        apply_video_clip_mesh(&mut world, entity, original, [0.0, 0.0, 100.0, 100.0]).expect("clip");
        apply_video_clip_mesh(&mut world, entity, original, [0.0, 0.0, 50.0, 100.0]).expect("clip");
        let applied = world.get::<AtomeVideoClipMesh>(entity).copied().expect("mesh state");
        assert_eq!(applied.0, [50.0, 100.0, 0.0, 0.0, 0.25, 1.0], "le rectangle d origine reste la reference");
    }

    #[test]
    fn a_quad_rebuilt_at_full_size_forgets_its_clip_and_can_be_cut_again() {
        // Une mise a jour de ressource (source, lecture, filtres) refait le quad en
        // entier : la decoupe doit pouvoir etre reappliquee, sinon la video ressort
        // de sa page.
        let mut world = World::new();
        world.insert_resource(Assets::<Mesh>::default());
        let entity = world.spawn_empty().id();
        crate::video_external_texture::insert_video_quad_mesh(&mut world, entity, [200.0, 100.0], [0.0, 0.0, 1.0, 1.0]).expect("quad");
        let original = [0.0, 0.0, 200.0, 100.0];
        let visible = [0.0, 0.0, 140.0, 100.0];
        apply_video_clip_mesh(&mut world, entity, original, visible).expect("clip");
        assert!(world.get::<AtomeVideoClipMesh>(entity).is_some());
        crate::video_external_texture::insert_video_quad_mesh(&mut world, entity, [200.0, 100.0], [0.0, 0.0, 1.0, 1.0]).expect("rebuild");
        assert!(world.get::<AtomeVideoClipMesh>(entity).is_none(), "le quad refait oublie sa decoupe");
        let before = world.resource::<Assets<Mesh>>().len();
        apply_video_clip_mesh(&mut world, entity, original, visible).expect("clip again");
        assert_eq!(world.get::<AtomeVideoClipMesh>(entity).copied().map(|state| state.0), Some([140.0, 100.0, 0.0, 0.0, 0.7, 1.0]));
        assert!(world.resource::<Assets<Mesh>>().len() > before, "la decoupe est bien reposee");
    }

    #[test]
    fn an_entity_without_video_is_left_alone() {
        let mut world = World::new();
        world.insert_resource(Assets::<Mesh>::default());
        let entity = world.spawn_empty().id();
        apply_video_clip_mesh(&mut world, entity, [0.0, 0.0, 10.0, 10.0], [0.0, 0.0, 5.0, 5.0]).expect("clip");
        assert!(world.get::<AtomeVideoClipMesh>(entity).is_none());
    }
}
