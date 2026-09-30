// Les retouches NON destructives d'un objet deja pose : l'arrondi, la variante
// de forme et l'ombre. Elles arrivent toutes par le patch de STYLE, donc
// l'entite garde son identite : c'est au renderer de re-peindre la silhouette
// et de refaire l'ombre, sinon l'ecran garde la valeur de la creation.

use bevy::{image::Image, prelude::*};

use crate::*;
use crate::shape_sdf::{AtomeShapeGeometry, AtomeShapeSilhouette, AtomeShapeVariant};

fn shape_node(id: &str) -> AtomeRenderNode {
    AtomeRenderNode {
        project_space: false,
        id: id.to_string(),
        kind: "shape".to_string(),
        parent_id: None,
        logical_position: [12.0, 24.0],
        logical_size: [120.0, 50.0],
        clip_rect: None,
        clip_rotation: 0.0,
        scale: [1.0, 1.0],
        rotation: 0.0,
        origin: [0.0, 0.0],
        layer: 3,
        opacity: 1.0,
        corner_radius: 0.0,
        corner_radii: None,
        shape_variant: None,
        star_branches: None,
        star_inner_radius: None,
        polygon_sides: None,
        mask: None,
        mask_source: false,
        shadow: None,
        backdrop: None,
        presentation: false,
        menu_plane: 0,
        color: Some([0.1, 0.2, 0.3, 1.0]),
        text: None,
        source: None,
        texture_size: None,
        uv_rect: None,
        texture: None,
        peaks: None,
        playback_progress: None,
        selected: None,
        filters: None,
        transition: None,
        procedural: None,
    }
}

fn test_world() -> World {
    let mut world = World::new();
    world.insert_resource(AtomeEntityTable::default());
    world.insert_resource(AtomeBevyRendererConfig::empty(640.0, 480.0));
    world.insert_resource(AtomeRendererDiagnostics::default());
    world.insert_resource(Assets::<Image>::default());
    world
}

fn style_patch(id: &str) -> AtomeStylePatch {
    AtomeStylePatch {
        id: id.to_string(),
        color: None,
        shadow: None,
        backdrop: None,
        selected: None,
        opacity: None,
        playback_progress: None,
        filters: None,
        transition: None,
        procedural: None,
        corner_radius: None,
        corner_radii: None,
        shape_variant: None,
        star_branches: None,
        star_inner_radius: None,
        polygon_sides: None,
        mask: None,
    }
}

fn sprite_image(world: &World, entity: Entity) -> Handle<Image> {
    world.get::<Sprite>(entity).expect("shape sprite").image.clone()
}

fn drop_shadow() -> AtomeShadowStyle {
    AtomeShadowStyle {
        kind: crate::types::AtomeShadowKind::Drop,
        color: [0.0, 0.0, 0.0, 0.5],
        blur: 10.0,
        offset_x: 4.0,
        offset_y: 6.0,
        spread: 0.0,
        invert: false,
    }
}

#[test]
fn removing_the_rounding_repaints_square_corners_on_a_live_shape() {
    let mut world = test_world();
    let entity = apply_spawn(
        &mut world,
        AtomeRenderNode { corner_radius: 12.0, ..shape_node("live_rounding") },
    )
    .unwrap();
    assert_eq!(world.get::<AtomeCornerRadius>(entity).unwrap().0, [12.0; 4]);
    assert_ne!(sprite_image(&world, entity), Handle::default(), "un arrondi se peint par un masque");

    apply_style(
        &mut world,
        AtomeStylePatch {
            corner_radius: Some(0.0),
            corner_radii: Some(None),
            ..style_patch("live_rounding")
        },
    )
    .unwrap();

    assert_eq!(world.get::<AtomeCornerRadius>(entity).unwrap().0, [0.0; 4]);
    assert_eq!(
        sprite_image(&world, entity),
        Handle::default(),
        "sans arrondi la forme redevient un simple aplat colore"
    );
}

#[test]
fn putting_the_rounding_back_keeps_the_very_same_entity() {
    let mut world = test_world();
    let entity = apply_spawn(&mut world, shape_node("live_rounding_back")).unwrap();

    apply_style(
        &mut world,
        AtomeStylePatch { corner_radius: Some(9.0), ..style_patch("live_rounding_back") },
    )
    .unwrap();

    assert_eq!(world.get::<AtomeCornerRadius>(entity).unwrap().0, [9.0; 4]);
    assert_ne!(sprite_image(&world, entity), Handle::default());
    assert_eq!(
        world.resource::<AtomeEntityTable>().by_id.get("live_rounding_back").copied(),
        Some(entity),
        "l'arrondi est non destructif : l'atome n'est jamais re-cree"
    );
}

#[test]
fn changing_the_variant_live_rebuilds_the_silhouette() {
    let mut world = test_world();
    let entity = apply_spawn(&mut world, shape_node("live_variant")).unwrap();
    assert_eq!(sprite_image(&world, entity), Handle::default());

    apply_style(
        &mut world,
        AtomeStylePatch {
            shape_variant: Some("star".to_string()),
            star_branches: Some(7),
            ..style_patch("live_variant")
        },
    )
    .unwrap();

    let profile = world.get::<AtomeShapeProfile>(entity).unwrap().0;
    assert_eq!(profile.variant.as_str(), "star");
    assert_eq!(profile.star_branches, 7);
    assert_ne!(sprite_image(&world, entity), Handle::default(), "une etoile se peint par son masque");
}

#[test]
fn removing_the_shadow_removes_the_overlay_of_a_live_object() {
    let mut world = test_world();
    let entity = apply_spawn(
        &mut world,
        AtomeRenderNode { shadow: Some(drop_shadow()), ..shape_node("live_shadow") },
    )
    .unwrap();
    assert!(
        world
            .get::<AtomeShapeShadowOverlay>(entity)
            .map(|overlay| !overlay.entities.is_empty())
            .unwrap_or(false),
        "une ombre posee se peint"
    );

    // Some(None) est ce que le diff envoie quand l'outil Ombre RETIRE l'ombre :
    // le renderer doit alors la retirer, pas ignorer le patch.
    apply_style(&mut world, AtomeStylePatch { shadow: Some(None), ..style_patch("live_shadow") }).unwrap();

    assert!(world.get::<AtomeShapeShadow>(entity).unwrap().0.is_none());
    assert!(
        world
            .get::<AtomeShapeShadowOverlay>(entity)
            .map(|overlay| overlay.entities.is_empty())
            .unwrap_or(true),
        "retirer l'ombre retire son calque"
    );
}

// --- Le RETRAIT passe par le fil : un patch JSON porte `null` a la cle de la
// retouche. C'est la seule chose qui distingue « l'outil a retire l'ombre »
// de « ce patch ne parle pas de l'ombre ». Sans la deserialisation dediee,
// serde confond les deux et le retrait ne quitte jamais l'ecran.

#[test]
fn a_null_shadow_in_the_patch_is_a_removal_not_an_omission() {
    let removed: AtomeStylePatch =
        serde_json::from_str(r#"{"id":"wire","shadow":null}"#).expect("patch de retrait");
    assert_eq!(
        removed.shadow,
        Some(None),
        "`shadow: null` veut dire RETIRE ; serde le confondait avec « cle absente »"
    );

    let untouched: AtomeStylePatch =
        serde_json::from_str(r#"{"id":"wire"}"#).expect("patch muet");
    assert_eq!(untouched.shadow, None, "une cle absente ne touche pas a l'ombre");

    let posed: AtomeStylePatch = serde_json::from_str(
        r#"{"id":"wire","shadow":{"type":"drop","color":[0,0,0,0.5],"blur":8,"offset_x":2,"offset_y":2,"spread":0,"invert":false}}"#,
    )
    .expect("patch d'ombre");
    let shadow = posed.shadow.flatten().expect("une ombre posee");
    assert_eq!(shadow.blur, 8.0);
    assert_eq!(shadow.offset_x, 2.0);
}

#[test]
fn a_null_corner_radii_in_the_patch_is_a_removal_not_an_omission() {
    let removed: AtomeStylePatch =
        serde_json::from_str(r#"{"id":"wire","corner_radius":0.0,"corner_radii":null}"#)
            .expect("patch de retrait");
    assert_eq!(removed.corner_radius, Some(0.0));
    assert_eq!(
        removed.corner_radii,
        Some(None),
        "`corner_radii: null` veut dire RETIRE l'arrondi par coin"
    );

    let untouched: AtomeStylePatch = serde_json::from_str(r#"{"id":"wire"}"#).expect("patch muet");
    assert_eq!(untouched.corner_radii, None);

    let corners: AtomeStylePatch =
        serde_json::from_str(r#"{"id":"wire","corner_radii":[4,3,2,1]}"#).expect("patch par coin");
    assert_eq!(corners.corner_radii, Some(Some([4.0, 3.0, 2.0, 1.0])));
}

#[test]
fn deserializing_a_removal_patch_really_removes_the_shadow_from_a_live_object() {
    let mut world = test_world();
    let entity = apply_spawn(
        &mut world,
        AtomeRenderNode { shadow: Some(drop_shadow()), ..shape_node("wire_shadow") },
    )
    .unwrap();

    // Le patch traverse le meme chemin que la projection Web : la chaine JSON,
    // puis le style, puis la scene.
    let patch: AtomeStylePatch =
        serde_json::from_str(r#"{"id":"wire_shadow","shadow":null}"#).expect("patch de retrait");
    apply_style(&mut world, patch).unwrap();

    assert!(world.get::<AtomeShapeShadow>(entity).unwrap().0.is_none());
    assert!(
        world
            .get::<AtomeShapeShadowOverlay>(entity)
            .map(|overlay| overlay.entities.is_empty())
            .unwrap_or(true),
        "le retrait deserialise doit vider le calque d'ombre"
    );
}

#[test]
fn deserializing_a_removal_patch_really_removes_the_rounding_from_a_live_object() {
    let mut world = test_world();
    let entity = apply_spawn(
        &mut world,
        AtomeRenderNode { corner_radius: 14.0, ..shape_node("wire_rounding") },
    )
    .unwrap();
    assert_eq!(world.get::<AtomeCornerRadius>(entity).unwrap().0, [14.0; 4]);

    let patch: AtomeStylePatch =
        serde_json::from_str(r#"{"id":"wire_rounding","corner_radius":0.0,"corner_radii":null}"#)
            .expect("patch de retrait");
    apply_style(&mut world, patch).unwrap();

    assert_eq!(world.get::<AtomeCornerRadius>(entity).unwrap().0, [0.0; 4]);
    assert_eq!(
        sprite_image(&world, entity),
        Handle::default(),
        "sans arrondi la forme redevient un aplat colore"
    );
}

// --- Le MASQUE : ce que le renderer doit a la forme qui sert de source. -----

fn star_mask(width: f32, height: f32) -> AtomeMaskStyle {
    AtomeMaskStyle {
        source_id: "mask_star".to_string(),
        mode: "alpha".to_string(),
        alpha: vec![],
        placement: None,
        layers: vec![],
        silhouette: AtomeShapeSilhouette {
            geometry: AtomeShapeGeometry::new(AtomeShapeVariant::Star),
            width,
            height,
            corner_radii: [0.0; 4],
        },
    }
}

/// La forme qui sert de masque ne se repeint JAMAIS. La decoupe recalcule la
/// visibilite de tout noeud qu'elle touche, et rallumait la source : le contenu
/// etait bien coupe, mais la forme se repeignait par-dessus, et le masque
/// semblait sans effet.
#[test]
fn a_mask_source_never_comes_back_visible() {
    let mut world = test_world();
    let entity = apply_spawn(
        &mut world,
        AtomeRenderNode {
            mask_source: true,
            clip_rect: Some([0.0, 0.0, 640.0, 480.0]),
            ..shape_node("mask_source_hidden")
        },
    )
    .unwrap();

    assert!(
        world.get::<AtomeMaskSource>(entity).is_some(),
        "le role de source voyage avec l'entite, la decoupe le relit"
    );
    assert_eq!(
        world.get::<Visibility>(entity).copied(),
        Some(Visibility::Hidden),
        "la source coupe, elle ne se peint pas"
    );

    apply_visibility(
        &mut world,
        AtomeVisibilityPatch { id: "mask_source_hidden".to_string(), visible: true },
    )
    .unwrap();
    assert_eq!(
        world.get::<Visibility>(entity).copied(),
        Some(Visibility::Hidden),
        "un patch de visibilite ne rallume pas une source de masque"
    );
}

/// Un rectangle PLEIN n'a ni pointe ni arrondi : il ne demandait donc aucune
/// texture, et l'alpha du masque n'avait rien a multiplier — la forme restait
/// entiere. Un masque lui en donne une, decoupee.
#[test]
fn a_plain_shape_carrying_a_mask_is_really_cut() {
    let mut world = test_world();
    let entity = apply_spawn(
        &mut world,
        AtomeRenderNode { mask: Some(star_mask(120.0, 50.0)), ..shape_node("masked_rect") },
    )
    .unwrap();

    let handle = sprite_image(&world, entity);
    assert_ne!(handle, Handle::default(), "un masque exige une texture a decouper");
    let images = world.resource::<Assets<Image>>();
    let image = images.get(&handle).expect("la texture decoupee");
    let width = image.texture_descriptor.size.width as usize;
    let height = image.texture_descriptor.size.height as usize;
    let data = image.data.as_ref().expect("des pixels a decouper");
    let alpha = |x: usize, y: usize| data[(y * width + x) * 4 + 3];

    assert_eq!(alpha(0, 0), 0, "le coin de la boite est hors de l'etoile");
    assert_eq!(alpha(width / 2, height / 2), 255, "le centre de l'etoile reste plein");
}

#[test]
fn a_masked_object_shadow_uses_the_final_mask_alpha() {
    let mut world = test_world();
    let shadow = AtomeShadowStyle {
        kind: crate::types::AtomeShadowKind::Block,
        color: [0.0, 0.0, 0.0, 1.0],
        blur: 0.0,
        offset_x: 4.0,
        offset_y: 4.0,
        spread: 0.0,
        invert: false,
    };
    let entity = apply_spawn(
        &mut world,
        AtomeRenderNode {
            mask: Some(star_mask(120.0, 50.0)),
            shadow: Some(shadow),
            ..shape_node("masked_shadow")
        },
    ).unwrap();
    let handle = world
        .get::<AtomeShapeShadowOverlay>(entity)
        .and_then(|overlay| overlay.image_handles.first())
        .cloned()
        .expect("the masked shadow texture");
    let images = world.resource::<Assets<Image>>();
    let image = images.get(&handle).unwrap();
    let width = image.texture_descriptor.size.width as usize;
    let height = image.texture_descriptor.size.height as usize;
    let data = image.data.as_ref().unwrap();
    let alpha = |x: usize, y: usize| data[(y * width + x) * 4 + 3];
    assert_eq!(alpha(0, 0), 0, "the old rectangular shadow must not return");
    assert!(alpha(width / 2, height / 2) > 0, "the visible masked centre casts the shadow");
}
