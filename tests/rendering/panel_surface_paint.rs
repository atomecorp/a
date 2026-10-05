use crate::{
    shape_sdf::*,
    surface_paint::{
        AtomeSurfacePaint, GradientStop, InsetShadow, LinearGradient, SurfaceBorder, SurfacePaint,
    },
    *,
};
use bevy::{image::Image, prelude::*};

fn silhouette(width: f32, height: f32, radius: f32) -> AtomeShapeSilhouette {
    AtomeShapeSilhouette {
        geometry: AtomeShapeGeometry::default(),
        width,
        height,
        corner_radii: [radius; 4],
    }
}
fn gradient(angle: f32) -> SurfacePaint {
    SurfacePaint {
        gradient: Some(LinearGradient {
            angle,
            stops: vec![
                GradientStop {
                    offset: 0.0,
                    color: [1.0, 0.0, 0.0, 1.0],
                },
                GradientStop {
                    offset: 1.0,
                    color: [0.0, 0.0, 1.0, 1.0],
                },
            ],
        }),
        ..Default::default()
    }
}
fn pixel(texture: &AtomeTexture, x: u32, y: u32) -> &[u8] {
    let offset = ((y * texture.width + x) * 4) as usize;
    &texture.rgba[offset..offset + 4]
}
fn world() -> World {
    let mut world = World::new();
    world.insert_resource(AtomeEntityTable::default());
    world.insert_resource(AtomeBevyRendererConfig::empty(640.0, 480.0));
    world.insert_resource(AtomeRendererDiagnostics::default());
    world.insert_resource(Assets::<Image>::default());
    world
}
fn shape(id: &str) -> AtomeRenderNode {
    serde_json::from_value(
        serde_json::json!({ "id": id, "kind": "shape", "logical_position": [20,30],
        "logical_size": [100,40], "layer": 2, "color": [0.1,0.2,0.3,1.0] }),
    )
    .unwrap()
}
fn image(world: &World, entity: Entity) -> &Image {
    world
        .resource::<Assets<Image>>()
        .get(&world.get::<Sprite>(entity).unwrap().image)
        .unwrap()
}

#[test]
fn css_angles_and_rounded_coverage_use_the_existing_silhouette() {
    let texture = gradient(90.0).texture(&silhouette(100.0, 40.0, 10.0), [1.0; 4]);
    assert!(pixel(&texture, 10, 20)[0] > pixel(&texture, 90, 20)[0]);
    assert!(pixel(&texture, 10, 20)[2] < pixel(&texture, 90, 20)[2]);
    assert_eq!(pixel(&texture, 0, 0)[3], 0);
    assert_eq!(pixel(&texture, 50, 20)[3], 255);
    let vertical = gradient(0.0).texture(&silhouette(100.0, 40.0, 0.0), [1.0; 4]);
    assert!(pixel(&vertical, 50, 38)[0] > pixel(&vertical, 50, 1)[0]);
}

#[test]
fn inset_blur_darkens_the_inside_edge_without_painting_outside() {
    let paint = SurfacePaint {
        inset_shadows: vec![InsetShadow {
            color: [0.0, 0.0, 0.0, 0.8],
            blur: 8.0,
            spread: 0.0,
            offset: [0.0, 3.0],
        }],
        ..Default::default()
    };
    let texture = paint.texture(&silhouette(100.0, 40.0, 10.0), [1.0; 4]);
    assert!(pixel(&texture, 50, 1)[0] < pixel(&texture, 50, 5)[0]);
    assert!(pixel(&texture, 50, 5)[0] < pixel(&texture, 50, 20)[0]);
    assert_eq!(pixel(&texture, 0, 0)[3], 0);
    assert_eq!(pixel(&texture, 50, 20)[3], 255);
}

#[test]
fn border_can_cover_a_transparent_fill_without_filling_the_middle() {
    let paint = SurfacePaint {
        border: Some(SurfaceBorder {
            width: 2.0,
            color: [1.0; 4],
            colors: Some([[1.0; 4], [1.0; 4], [1.0, 1.0, 1.0, 0.25], [1.0; 4]]),
        }),
        ..Default::default()
    };
    let texture = paint.texture(&silhouette(100.0, 40.0, 0.0), [0.0; 4]);
    assert_eq!(pixel(&texture, 50, 0)[3], 255);
    assert_eq!(pixel(&texture, 50, 20)[3], 0);
    assert_eq!(pixel(&texture, 50, 39)[3], 64);
}

#[test]
fn equal_materials_share_textures_and_resize_keeps_the_entity_and_opacity() {
    let mut world = world();
    let mut first = shape("paint_first");
    first.surface_paint = Some(gradient(145.0));
    first.opacity = 0.4;
    let mut second = shape("paint_second");
    second.surface_paint = first.surface_paint.clone();
    let entity = apply_spawn(&mut world, first).unwrap();
    let other = apply_spawn(&mut world, second).unwrap();
    let first_handle = world.get::<Sprite>(entity).unwrap().image.clone();
    assert_eq!(first_handle, world.get::<Sprite>(other).unwrap().image);
    assert!((world.get::<Sprite>(entity).unwrap().color.alpha() - 0.4).abs() < 0.001);
    apply_transform(
        &mut world,
        serde_json::from_value(serde_json::json!({"id":"paint_first",
        "logical_position":[20,30],"logical_size":[160,50]}))
        .unwrap(),
    )
    .unwrap();
    assert_eq!(
        world.resource::<AtomeEntityTable>().by_id["paint_first"],
        entity
    );
    assert_ne!(first_handle, world.get::<Sprite>(entity).unwrap().image);
    assert_eq!(image(&world, entity).texture_descriptor.size.width, 160);
    assert!((world.get::<Sprite>(entity).unwrap().color.alpha() - 0.4).abs() < 0.001);
}

#[test]
fn removing_paint_restores_the_legacy_fill_and_keeps_selection_and_geometry() {
    let mut world = world();
    let mut node = shape("remove_paint");
    node.surface_paint = Some(gradient(145.0));
    node.selected = Some(true);
    node.corner_radius = 8.0;
    let entity = apply_spawn(&mut world, node).unwrap();
    let position = world.get::<Transform>(entity).unwrap().translation;
    apply_style(
        &mut world,
        serde_json::from_value(serde_json::json!({"id":"remove_paint","surface_paint":null}))
            .unwrap(),
    )
    .unwrap();
    assert!(world.get::<AtomeSurfacePaint>(entity).unwrap().0.is_none());
    assert!(world.get::<AtomeSelected>(entity).unwrap().0);
    assert_eq!(
        world.get::<Transform>(entity).unwrap().translation,
        position
    );
    let color = world.get::<Sprite>(entity).unwrap().color.to_srgba();
    assert!((color.red - 0.1).abs() < 0.001);
    assert_eq!(image(&world, entity).texture_descriptor.size.width, 100);
}

#[test]
fn ordinary_texture_color_patches_do_not_replace_the_media_texture() {
    let mut world = world();
    let mut node = shape("legacy_texture");
    node.texture = Some(AtomeTexture {
        width: 1,
        height: 1,
        rgba: vec![12, 34, 56, 255],
        animation: None,
    });
    let entity = apply_spawn(&mut world, node).unwrap();
    let handle = world.get::<Sprite>(entity).unwrap().image.clone();
    apply_style(
        &mut world,
        serde_json::from_value(
            serde_json::json!({"id":"legacy_texture","color":[0.4,0.3,0.2,1.0]}),
        )
        .unwrap(),
    )
    .unwrap();
    assert_eq!(handle, world.get::<Sprite>(entity).unwrap().image);
    assert_eq!(
        image(&world, entity).data.as_ref().unwrap(),
        &vec![12, 34, 56, 255]
    );
}

#[test]
fn painted_surfaces_preserve_the_resolved_mask_across_color_resize_and_removal() {
    let mut world = world();
    let mut node = shape("masked_paint");
    node.surface_paint = Some(gradient(145.0));
    let mask = AtomeMaskStyle {
        source_id: "fixture".into(),
        mode: "alpha".into(),
        silhouette: silhouette(2.0, 1.0, 0.0),
        alpha: vec![0, 255],
        placement: None,
        layers: vec![],
    };
    node.mask = Some(mask);
    let entity = apply_spawn(&mut world, node).unwrap();
    let alpha = |world: &World| image(world, entity).data.as_ref().unwrap()[3];
    assert_eq!(alpha(&world), 0);
    apply_style(
        &mut world,
        serde_json::from_value(serde_json::json!({"id":"masked_paint","color":[1,1,1,1]})).unwrap(),
    )
    .unwrap();
    assert_eq!(alpha(&world), 0);
    apply_transform(
        &mut world,
        serde_json::from_value(serde_json::json!({"id":"masked_paint",
        "logical_position":[20,30],"logical_size":[160,50]}))
        .unwrap(),
    )
    .unwrap();
    assert_eq!(alpha(&world), 0);
    apply_style(
        &mut world,
        serde_json::from_value(serde_json::json!({"id":"masked_paint","surface_paint":null}))
            .unwrap(),
    )
    .unwrap();
    assert_eq!(alpha(&world), 0);
    assert!(image(&world, entity)
        .data
        .as_ref()
        .unwrap()
        .chunks_exact(4)
        .any(|pixel| pixel[3] > 0));
}

#[test]
fn malformed_paint_is_rejected_before_spawning_and_signed_spread_survives_normalization() {
    let mut world = world();
    let mut node = shape("invalid_paint");
    let mut paint = gradient(145.0);
    paint.gradient.as_mut().unwrap().stops.reverse();
    node.surface_paint = Some(paint);
    assert!(apply_spawn(&mut world, node).is_err());
    assert!(!world
        .resource::<AtomeEntityTable>()
        .by_id
        .contains_key("invalid_paint"));
    let shadow: AtomeShadowStyle =
        serde_json::from_value(serde_json::json!({"color":[0,0,0,0.4],"blur":6,"spread":-3}))
            .unwrap();
    assert_eq!(shadow.normalized().unwrap().spread, -3.0);
}
