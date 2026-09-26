//! Decoupe EXACTE d'un atome dont l'angle differe de celui de sa page.
//!
//! Un sprite ne sait se couper qu'en rectangle droit dans son propre repere. Quand
//! la page et l'atome n'ont pas le meme angle, la decoupe ramenee dans le repere de
//! l'atome est un quadrilatere tourne : sa boite englobante laissait deborder les
//! coins de l'atome hors de la page. Ici on calcule le vrai polygone visible
//! (atome ∩ page, tous deux convexes) et on le dessine en maillage :
//! - video et verre (deja des maillages) : le maillage devient le polygone ;
//! - sprite (image, forme, texte en texture, onde) : un maillage « relais » prend
//!   la place du sprite, que l'on reduit a une taille nulle.

use bevy::{
    asset::RenderAssetUsages,
    camera::visibility::RenderLayers,
    image::Image,
    mesh::{Indices, Mesh, Mesh2d},
    prelude::*,
    render::render_resource::PrimitiveTopology,
    sprite_render::{ColorMaterial, MeshMaterial2d},
};

/// Tolerance angulaire (degres) sous laquelle page et atome sont consideres alignes :
/// la decoupe rectangle droite est alors exacte.
const ALIGNED_EPSILON_DEGREES: f32 = 0.01;

/// Relais de dessin d'un sprite coupe en polygone. Porte par l'atome.
#[derive(Component, Clone, Copy, Debug)]
pub struct AtomeClipPolygonProxy(pub Entity);

/// Marque l'entite relais (jamais une entite d'atome).
#[derive(Component, Clone, Copy, Debug)]
pub struct AtomeClipPolygonProxyOf(pub Entity);

/// Derniere geometrie de polygone posee sur un maillage : evite de re-televerser
/// le meme maillage a chaque image d'un geste. Porte l'identite du maillage : un
/// quad refait en entier ailleurs (redimensionnement, nouvelle source) a un autre
/// identifiant et doit etre recoupe.
#[derive(Component, Clone, PartialEq, Debug)]
pub struct AtomeClipPolygonMesh(pub Vec<[f32; 4]>, pub AssetId<Mesh>);

/// Vrai quand la decoupe, ramenee dans le repere de l'atome, reste un rectangle
/// droit (angles egaux a un quart de tour pres) : le chemin rectangle suffit.
pub(crate) fn clip_is_axis_aligned(atom_rotation: f32, clip_rotation: f32) -> bool {
    let relative = (clip_rotation - atom_rotation).rem_euclid(90.0);
    relative < ALIGNED_EPSILON_DEGREES || 90.0 - relative < ALIGNED_EPSILON_DEGREES
}

fn cross(a: Vec2, b: Vec2) -> f32 {
    a.x * b.y - a.y * b.x
}

/// Sutherland-Hodgman : `subject` coupe par le polygone convexe `clip`.
/// Les deux polygones sont convexes ; le resultat aussi (possiblement vide).
pub(crate) fn clip_convex_polygon(subject: &[Vec2], clip: &[Vec2]) -> Vec<Vec2> {
    if clip.len() < 3 {
        return Vec::new();
    }
    // Sens du polygone de coupe : un point est « dedans » s'il est du meme cote
    // que l'interieur pour chaque arete.
    let area: f32 = (0..clip.len()).map(|i| cross(clip[i], clip[(i + 1) % clip.len()])).sum();
    let orientation = if area >= 0.0 { 1.0 } else { -1.0 };
    let mut output = subject.to_vec();
    for i in 0..clip.len() {
        if output.is_empty() {
            break;
        }
        let a = clip[i];
        let b = clip[(i + 1) % clip.len()];
        let edge = b - a;
        let side = |p: Vec2| cross(edge, p - a) * orientation;
        let input = std::mem::take(&mut output);
        for j in 0..input.len() {
            let current = input[j];
            let previous = input[(j + input.len() - 1) % input.len()];
            let current_in = side(current) >= 0.0;
            let previous_in = side(previous) >= 0.0;
            if current_in != previous_in {
                let sp = side(previous);
                let sc = side(current);
                let t = sp / (sp - sc);
                output.push(previous + (current - previous) * t);
            }
            if current_in {
                output.push(current);
            }
        }
    }
    output
}

/// Polygone visible de l'atome, dans son repere propre (boite non tournee, coin
/// haut-gauche = 0,0, y vers le bas). Vide = entierement coupe.
pub(crate) fn visible_polygon_in_atom_frame(size: [f32; 2], clip_corners: &[Vec2; 4]) -> Vec<Vec2> {
    let atom = [
        Vec2::new(0.0, 0.0),
        Vec2::new(size[0], 0.0),
        Vec2::new(size[0], size[1]),
        Vec2::new(0.0, size[1]),
    ];
    let polygon = clip_convex_polygon(&atom, clip_corners);
    let area: f32 = (0..polygon.len())
        .map(|i| cross(polygon[i], polygon[(i + 1) % polygon.len()]))
        .sum::<f32>()
        .abs()
        * 0.5;
    if polygon.len() < 3 || area < 0.01 {
        return Vec::new();
    }
    polygon
}

/// Boite englobante [x, y, w, h] d'un polygone (repere de l'atome).
pub(crate) fn polygon_bounds(polygon: &[Vec2]) -> [f32; 4] {
    let min = polygon.iter().fold(Vec2::splat(f32::INFINITY), |acc, value| acc.min(*value));
    let max = polygon.iter().fold(Vec2::splat(f32::NEG_INFINITY), |acc, value| acc.max(*value));
    [min.x, min.y, max.x - min.x, max.y - min.y]
}

/// Maillage en eventail du polygone, centre sur la boite `visible` (repere de
/// l'atome) comme le quad qu'il remplace ; `uv_of` donne l'UV d'un point.
pub(crate) fn polygon_mesh(
    polygon: &[Vec2],
    visible: [f32; 4],
    uv_of: impl Fn(Vec2) -> [f32; 2],
) -> (Mesh, Vec<[f32; 4]>) {
    let center = Vec2::new(visible[0] + visible[2] / 2.0, visible[1] + visible[3] / 2.0);
    let positions: Vec<[f32; 3]> =
        polygon.iter().map(|p| [p.x - center.x, center.y - p.y, 0.0]).collect();
    let uvs: Vec<[f32; 2]> = polygon.iter().map(|p| uv_of(*p)).collect();
    let mut indices = Vec::with_capacity((polygon.len().saturating_sub(2)) * 3);
    for i in 1..polygon.len().saturating_sub(1) {
        indices.extend_from_slice(&[0u32, i as u32, i as u32 + 1]);
    }
    let key = positions.iter().zip(uvs.iter()).map(|(p, uv)| [p[0], p[1], uv[0], uv[1]]).collect();
    let mut mesh = Mesh::new(PrimitiveTopology::TriangleList, RenderAssetUsages::default());
    mesh.insert_attribute(Mesh::ATTRIBUTE_POSITION, positions);
    mesh.insert_attribute(Mesh::ATTRIBUTE_UV_0, uvs);
    mesh.insert_indices(Indices::U32(indices));
    (mesh, key)
}

/// Remplace EN PLACE le maillage de l'entite par le polygone (video, verre).
pub(crate) fn write_polygon_into_entity_mesh(
    world: &mut World,
    entity: Entity,
    mesh: Mesh,
    key: Vec<[f32; 4]>,
) -> Result<(), String> {
    let handle = world
        .get::<Mesh2d>(entity)
        .map(|value| value.0.clone())
        .ok_or_else(|| "bevy_clip_polygon_mesh_missing".to_string())?;
    if world.get::<AtomeClipPolygonMesh>(entity).is_some_and(|current| current.0 == key && current.1 == handle.id()) {
        return Ok(());
    }
    let replacement = {
        let mut meshes = world
            .get_resource_mut::<Assets<Mesh>>()
            .ok_or_else(|| "bevy_mesh_assets_required".to_string())?;
        if meshes.contains(&handle) {
            if let Some(mut current) = meshes.get_mut(&handle) {
                *current = mesh;
            }
            None
        } else {
            Some(meshes.add(mesh))
        }
    };
    let id = match replacement {
        Some(added) => {
            let id = added.id();
            world.entity_mut(entity).insert(Mesh2d(added));
            id
        }
        None => handle.id(),
    };
    world
        .entity_mut(entity)
        .insert(AtomeClipPolygonMesh(key, id))
        // Le garde de decoupe rectangle de la video ne decrit plus le maillage.
        .remove::<crate::clip::AtomeVideoClipMesh>();
    Ok(())
}

fn sprite_texture(sprite: &Sprite) -> Option<Handle<Image>> {
    (sprite.image != Handle::<Image>::default()).then(|| sprite.image.clone())
}

/// Pose (ou met a jour) le relais d'un sprite coupe en polygone. Le sprite garde
/// ses donnees (image, couleur) mais n'occupe plus rien : c'est le relais qui peint.
pub(crate) fn upsert_sprite_polygon_proxy(
    world: &mut World,
    entity: Entity,
    mesh: Mesh,
    key: Vec<[f32; 4]>,
    transform: Transform,
) -> Result<(), String> {
    if world.get_resource::<Assets<ColorMaterial>>().is_none() || world.get_resource::<Assets<Mesh>>().is_none() {
        return Ok(());
    }
    let Some((texture, color)) = world.get::<Sprite>(entity).map(|sprite| (sprite_texture(sprite), sprite.color)) else {
        return Ok(());
    };
    if let Some(mut sprite) = world.get_mut::<Sprite>(entity) {
        sprite.custom_size = Some(Vec2::ZERO);
    }
    let visibility = world.get::<Visibility>(entity).copied().unwrap_or_default();
    let layers = world.get::<RenderLayers>(entity).cloned();
    let existing = world
        .get::<AtomeClipPolygonProxy>(entity)
        .map(|proxy| proxy.0)
        .filter(|proxy| world.get_entity(*proxy).is_ok());
    let proxy = match existing {
        Some(proxy) => proxy,
        None => {
            let material = world
                .resource_mut::<Assets<ColorMaterial>>()
                .add(ColorMaterial { color, texture: texture.clone(), ..default() });
            let mesh_handle = world.resource_mut::<Assets<Mesh>>().add(Mesh::new(
                PrimitiveTopology::TriangleList,
                RenderAssetUsages::default(),
            ));
            let proxy = world
                .spawn((
                    Mesh2d(mesh_handle),
                    MeshMaterial2d(material),
                    transform,
                    GlobalTransform::from(transform),
                    visibility,
                    AtomeClipPolygonProxyOf(entity),
                ))
                .id();
            world.entity_mut(entity).insert(AtomeClipPolygonProxy(proxy));
            proxy
        }
    };
    world.entity_mut(proxy).insert((transform, GlobalTransform::from(transform), visibility));
    match layers {
        Some(layers) => {
            world.entity_mut(proxy).insert(layers);
        }
        None => {
            world.entity_mut(proxy).remove::<RenderLayers>();
        }
    }
    write_polygon_into_entity_mesh(world, proxy, mesh, key)?;
    sync_proxy_material(world, proxy, texture, color);
    Ok(())
}

fn sync_proxy_material(world: &mut World, proxy: Entity, texture: Option<Handle<Image>>, color: Color) {
    let Some(handle) = world.get::<MeshMaterial2d<ColorMaterial>>(proxy).map(|value| value.0.clone()) else {
        return;
    };
    let Some(mut materials) = world.get_resource_mut::<Assets<ColorMaterial>>() else { return };
    let stale = materials.get(&handle).is_none_or(|material| material.color != color || material.texture != texture);
    if stale {
        if let Some(mut material) = materials.get_mut(&handle) {
            material.color = color;
            material.texture = texture;
        }
    }
}

/// Retire le relais : l'atome redevient un sprite ordinaire.
pub(crate) fn remove_sprite_polygon_proxy(world: &mut World, entity: Entity) {
    let Some(proxy) = world.get::<AtomeClipPolygonProxy>(entity).map(|value| value.0) else {
        return;
    };
    if world.get_entity(proxy).is_ok() {
        world.despawn(proxy);
    }
    if world.get_entity(entity).is_ok() {
        world.entity_mut(entity).remove::<AtomeClipPolygonProxy>();
    }
}

/// Le relais suit l'atome a chaque image : pose, profondeur (calque), visibilite,
/// couleur/opacite et texture. Ces changements passent par des chemins (style,
/// calque, visibilite) qui ne repassent pas par la decoupe.
pub fn sync_clip_polygon_proxies(world: &mut World) {
    let pairs: Vec<(Entity, Entity)> = world
        .query::<(Entity, &AtomeClipPolygonProxy)>()
        .iter(world)
        .map(|(entity, proxy)| (entity, proxy.0))
        .collect();
    for (entity, proxy) in pairs {
        if world.get_entity(proxy).is_err() {
            world.entity_mut(entity).remove::<AtomeClipPolygonProxy>();
            continue;
        }
        let transform = world.get::<Transform>(entity).copied().unwrap_or_default();
        let visibility = world.get::<Visibility>(entity).copied().unwrap_or_default();
        if world.get::<Transform>(proxy).copied() != Some(transform) {
            world.entity_mut(proxy).insert((transform, GlobalTransform::from(transform)));
        }
        if world.get::<Visibility>(proxy).copied() != Some(visibility) {
            world.entity_mut(proxy).insert(visibility);
        }
        if let Some((texture, color)) = world.get::<Sprite>(entity).map(|sprite| (sprite_texture(sprite), sprite.color)) {
            sync_proxy_material(world, proxy, texture, color);
        }
    }
}

#[cfg(test)]
mod clip_polygon_tests {
    use super::*;

    fn rotated_rect(x: f32, y: f32, w: f32, h: f32, degrees: f32, pivot: Vec2) -> [Vec2; 4] {
        let (sin, cos) = degrees.to_radians().sin_cos();
        [Vec2::new(x, y), Vec2::new(x + w, y), Vec2::new(x + w, y + h), Vec2::new(x, y + h)].map(|p| {
            let d = p - pivot;
            pivot + Vec2::new(d.x * cos - d.y * sin, d.x * sin + d.y * cos)
        })
    }

    #[test]
    fn equal_angles_keep_the_rectangle_path() {
        assert!(clip_is_axis_aligned(30.0, 30.0));
        assert!(clip_is_axis_aligned(0.0, 90.0));
        assert!(!clip_is_axis_aligned(20.0, 0.0));
    }

    #[test]
    fn a_tilted_clip_cuts_the_corner_the_bounding_box_let_through() {
        // Atome 100x100 ; decoupe = carre 100x100 tourne de 45° autour du centre.
        let clip = rotated_rect(0.0, 0.0, 100.0, 100.0, 45.0, Vec2::new(50.0, 50.0));
        let polygon = visible_polygon_in_atom_frame([100.0, 100.0], &clip);
        assert_eq!(polygon.len(), 8, "octogone : les 4 coins de l'atome sont coupes");
        // Le coin (0,0) de l'atome est hors de la decoupe : aucun sommet ne s'en approche.
        assert!(polygon.iter().all(|p| p.length() > 20.0));
        // La boite englobante, elle, couvrait tout l'atome : c'etait le bug.
        let bounds = polygon_bounds(&polygon);
        assert!((bounds[2] - 100.0).abs() < 0.01 && (bounds[3] - 100.0).abs() < 0.01);
    }

    #[test]
    fn an_atom_outside_the_clip_has_no_visible_polygon() {
        let clip = rotated_rect(500.0, 500.0, 50.0, 50.0, 30.0, Vec2::new(500.0, 500.0));
        assert!(visible_polygon_in_atom_frame([100.0, 100.0], &clip).is_empty());
    }

    #[test]
    fn the_polygon_mesh_is_a_triangle_fan_with_matching_uvs() {
        let polygon = vec![Vec2::new(0.0, 0.0), Vec2::new(100.0, 0.0), Vec2::new(0.0, 50.0)];
        let (mesh, key) = polygon_mesh(&polygon, [0.0, 0.0, 100.0, 50.0], |p| [p.x / 100.0, p.y / 50.0]);
        assert_eq!(mesh.indices().map(|value| value.len()), Some(3));
        assert_eq!(key[0], [-50.0, 25.0, 0.0, 0.0], "coin haut-gauche : y vers le haut en Bevy");
        assert_eq!(key[2], [-50.0, -25.0, 0.0, 1.0]);
    }

    fn tilted_shape(rotation: f32) -> crate::AtomeRenderNode {
        crate::AtomeRenderNode {
            id: "tilted".to_string(), kind: "shape".to_string(), parent_id: None,
            logical_position: [100.0, 100.0], logical_size: [100.0, 100.0],
            // La page : un carre droit dont l'atome deborde une fois tourne.
            clip_rect: Some([100.0, 100.0, 100.0, 100.0]), clip_rotation: 0.0,
            scale: [1.0, 1.0], rotation, origin: [0.5, 0.5], layer: 3, opacity: 1.0,
            corner_radius: 0.0, corner_radii: None, shadow: None, backdrop: None,
            presentation: false, menu_plane: 0, color: Some([0.1, 0.2, 0.3, 1.0]),
            text: None, source: None, texture_size: None, uv_rect: None, texture: None,
            peaks: None, playback_progress: None, selected: None, filters: None,
            transition: None, procedural: None,
        }
    }

    fn transform_patch(rotation: f32) -> crate::AtomeTransformPatch {
        crate::AtomeTransformPatch {
            id: "tilted".to_string(), logical_position: [100.0, 100.0], logical_size: [100.0, 100.0],
            scale: [1.0, 1.0], rotation, origin: [0.5, 0.5],
            clip_rect: Some([100.0, 100.0, 100.0, 100.0]), clip_rotation: 0.0,
        }
    }

    #[test]
    fn a_rotated_member_of_a_straight_page_is_cut_on_the_page_edges() {
        let mut app = App::new();
        app.add_plugins(crate::AtomeBevyRendererPlugin::new(crate::AtomeBevyRendererConfig::empty(640.0, 480.0)));
        // En application, `DefaultPlugins` (SpriteRenderPlugin) fournit les ColorMaterial.
        app.world_mut().init_resource::<Assets<ColorMaterial>>();
        app.update();
        let entity = crate::apply_spawn(app.world_mut(), tilted_shape(30.0)).unwrap();
        let proxy = app.world().get::<AtomeClipPolygonProxy>(entity).expect("relais polygone").0;
        assert_eq!(app.world().get::<Sprite>(entity).unwrap().custom_size, Some(Vec2::ZERO),
            "le sprite ne peint plus : sinon ses coins sortent de la page");
        let handle = app.world().get::<Mesh2d>(proxy).unwrap().0.clone();
        let mesh = app.world().resource::<Assets<Mesh>>().get(&handle).unwrap();
        assert!(mesh.count_vertices() >= 5, "un carre tourne de 30° coupe par un carre droit = polygone");
        // Tous les sommets, ramenes a l'ecran, restent DANS la page.
        let global = app.world().get::<GlobalTransform>(proxy).copied().unwrap();
        let Some(bevy::mesh::VertexAttributeValues::Float32x3(positions)) = mesh.attribute(Mesh::ATTRIBUTE_POSITION) else {
            panic!("positions");
        };
        for p in positions {
            let world_point = global.transform_point(Vec3::from_array(*p));
            let screen = Vec2::new(world_point.x + 320.0, 240.0 - world_point.y);
            assert!(screen.x > 99.9 && screen.x < 200.1 && screen.y > 99.9 && screen.y < 200.1,
                "sommet hors page : {screen:?}");
        }
        app.update();
        assert_eq!(app.world().get::<Visibility>(proxy).copied(), Some(Visibility::Visible));

        // Redresse : le rectangle redevient exact, le relais disparait.
        crate::apply_transform(app.world_mut(), transform_patch(0.0)).unwrap();
        assert!(app.world().get::<AtomeClipPolygonProxy>(entity).is_none());
        assert!(app.world().get_entity(proxy).is_err());
        assert_eq!(app.world().get::<Sprite>(entity).unwrap().custom_size, Some(Vec2::new(100.0, 100.0)));

        // Retourne, puis supprime : le relais part avec l'atome.
        crate::apply_transform(app.world_mut(), transform_patch(12.0)).unwrap();
        let proxy = app.world().get::<AtomeClipPolygonProxy>(entity).expect("relais").0;
        crate::apply_despawn(app.world_mut(), "tilted").unwrap();
        assert!(app.world().get_entity(proxy).is_err());
    }
}
