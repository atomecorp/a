use crate::video_external_texture::*;
use crate::{
    render_math::depth_for_layer,
    render_ops::{apply_resource, apply_spawn, apply_style, apply_transform},
    types::{
        default_uv_rect, AtomeBevyRendererConfig, AtomeColorFilters, AtomeEntityTable,
        AtomeLocalTransform, AtomeRenderNode, AtomeRendererDiagnostics, AtomeResourcePatch,
        AtomeSelectionOverlay, AtomeStylePatch, AtomeTransformPatch, AtomeTransition,
    },
};
use bevy::{
    math::EulerRot, mesh::VertexAttributeValues, prelude::*, render::batching::NoAutomaticBatching,
};

fn video_node(id: &str) -> AtomeRenderNode {
    AtomeRenderNode {
        id: id.to_string(),
        kind: "video".to_string(),
        parent_id: None,
        logical_position: [10.0, 20.0],
        logical_size: [160.0, 90.0],
        scale: [1.0, 1.0],
        rotation: 0.0,
        origin: [0.0, 0.0],
        layer: 2,
        opacity: 0.65,
        corner_radius: 0.0,
        shadow: None,
        backdrop: None,
        presentation: false,
        color: Some([0.1, 0.2, 0.3, 1.0]),
        text: None,
        source: Some("/fixtures/video.mp4".to_string()),
        texture_size: Some([320, 180]),
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

fn world_with_video_assets() -> World {
    let mut world = World::new();
    world.insert_resource(AtomeEntityTable::default());
    world.insert_resource(AtomeBevyRendererConfig::empty(640.0, 480.0));
    world.insert_resource(AtomeRendererDiagnostics::default());
    world.insert_resource(Assets::<Image>::default());
    world.insert_resource(Assets::<Mesh>::default());
    world
}

fn video_mesh_uvs(world: &World, entity: Entity) -> Vec<[f32; 2]> {
    let mesh_handle = &world.get::<Mesh2d>(entity).unwrap().0;
    let mesh = world
        .resource::<Assets<Mesh>>()
        .get(mesh_handle)
        .expect("video mesh should exist");
    let Some(VertexAttributeValues::Float32x2(values)) = mesh.attribute(Mesh::ATTRIBUTE_UV_0)
    else {
        panic!("video mesh should carry Float32x2 UVs");
    };
    values.clone()
}

fn assert_uvs_near(actual: Vec<[f32; 2]>, expected: Vec<[f32; 2]>) {
    assert_eq!(actual.len(), expected.len());
    for (actual_uv, expected_uv) in actual.iter().zip(expected.iter()) {
        assert!(
            (actual_uv[0] - expected_uv[0]).abs() < 0.00001,
            "u: {actual_uv:?} != {expected_uv:?}"
        );
        assert!(
            (actual_uv[1] - expected_uv[1]).abs() < 0.00001,
            "v: {actual_uv:?} != {expected_uv:?}"
        );
    }
}

fn assert_near(actual: f32, expected: f32) {
    assert!((actual - expected).abs() < 0.0001, "{actual} != {expected}");
}

#[test]
fn video_nodes_spawn_external_texture_mesh_without_bevy_image_copy_target() {
    let mut world = world_with_video_assets();

    let entity = apply_spawn(&mut world, video_node("external_video")).unwrap();

    let video = world.get::<AtomeVideoExternalTexture>(entity).unwrap();
    assert_eq!(video.layer, 2);
    assert_eq!(video.opacity, 0.65);
    assert_eq!(video.uv_rect, default_uv_rect());
    assert!(world.get::<Mesh2d>(entity).is_some());
    assert!(world.get::<NoAutomaticBatching>(entity).is_some());
    assert!(world.get::<Sprite>(entity).is_none());
    assert_eq!(world.resource::<Assets<Image>>().len(), 0);
    assert_eq!(world.resource::<Assets<Mesh>>().len(), 1);
}

#[test]
fn video_nodes_spawn_external_texture_mesh_with_cropped_uv_rect() {
    let mut world = world_with_video_assets();
    let mut node = video_node("external_uv_rect");
    node.uv_rect = Some([0.25, 0.125, 0.5, 0.75]);

    let entity = apply_spawn(&mut world, node).unwrap();

    let video = world.get::<AtomeVideoExternalTexture>(entity).unwrap();
    assert_eq!(video.uv_rect, [0.25, 0.125, 0.5, 0.75]);
    assert_uvs_near(
        video_mesh_uvs(&world, entity),
        vec![[0.25, 0.875], [0.75, 0.875], [0.25, 0.125], [0.75, 0.125]],
    );
}

#[test]
fn video_transform_resizes_external_texture_mesh_without_sprite_state() {
    let mut world = world_with_video_assets();
    let entity = apply_spawn(&mut world, video_node("external_resized")).unwrap();
    let original_mesh = world.get::<Mesh2d>(entity).unwrap().0.id();

    apply_transform(
        &mut world,
        AtomeTransformPatch {
            id: "external_resized".to_string(),
            logical_position: [30.0, 40.0],
            logical_size: [320.0, 180.0],
            scale: [1.0, 1.0],
            rotation: 0.0,
            origin: [0.0, 0.0],
        },
    )
    .unwrap();

    let updated_mesh = world.get::<Mesh2d>(entity).unwrap().0.id();
    assert_ne!(original_mesh, updated_mesh);
    assert!(world.get::<Sprite>(entity).is_none());
}

#[test]
fn video_translation_reuses_external_texture_mesh_asset() {
    let mut world = world_with_video_assets();
    let entity = apply_spawn(&mut world, video_node("external_translated")).unwrap();
    let original_mesh = world.get::<Mesh2d>(entity).unwrap().0.id();
    let original_asset_count = world.resource::<Assets<Mesh>>().len();

    for step in 1..=16 {
        apply_transform(
            &mut world,
            AtomeTransformPatch {
                id: "external_translated".to_string(),
                logical_position: [10.0 + step as f32, 20.0 + step as f32 * 2.0],
                logical_size: [160.0, 90.0],
                scale: [1.0, 1.0],
                rotation: 0.0,
                origin: [0.0, 0.0],
            },
        )
        .unwrap();
    }

    assert_eq!(world.get::<Mesh2d>(entity).unwrap().0.id(), original_mesh);
    assert_eq!(world.resource::<Assets<Mesh>>().len(), original_asset_count);
}

#[test]
fn selected_video_translation_reuses_overlay_entities_and_texture() {
    let mut world = world_with_video_assets();
    let mut node = video_node("selected_external_translated");
    node.selected = Some(true);
    let entity = apply_spawn(&mut world, node).unwrap();
    let original_overlay = world.get::<AtomeSelectionOverlay>(entity).unwrap().clone();
    let original_positions = original_overlay
        .entities
        .iter()
        .map(|overlay_entity| world.get::<Transform>(*overlay_entity).unwrap().translation)
        .collect::<Vec<_>>();
    let original_image_count = world.resource::<Assets<Image>>().len();

    apply_transform(
        &mut world,
        AtomeTransformPatch {
            id: "selected_external_translated".to_string(),
            logical_position: [42.0, 57.0],
            logical_size: [160.0, 90.0],
            scale: [1.0, 1.0],
            rotation: 0.0,
            origin: [0.0, 0.0],
        },
    )
    .unwrap();

    let translated_overlay = world.get::<AtomeSelectionOverlay>(entity).unwrap();
    assert_eq!(translated_overlay.entities, original_overlay.entities);
    assert_eq!(translated_overlay.image_handles, original_overlay.image_handles);
    assert_eq!(world.resource::<Assets<Image>>().len(), original_image_count);
    for (index, overlay_entity) in translated_overlay.entities.iter().enumerate() {
        let translated = world.get::<Transform>(*overlay_entity).unwrap().translation;
        assert_near(translated.x, original_positions[index].x + 32.0);
        assert_near(translated.y, original_positions[index].y - 37.0);
        assert_near(translated.z, original_positions[index].z);
    }
}

#[test]
fn video_transform_preserves_external_texture_uv_rect() {
    let mut world = world_with_video_assets();
    let mut node = video_node("external_uv_transform");
    node.uv_rect = Some([0.1, 0.2, 0.6, 0.5]);
    let entity = apply_spawn(&mut world, node).unwrap();

    apply_transform(
        &mut world,
        AtomeTransformPatch {
            id: "external_uv_transform".to_string(),
            logical_position: [30.0, 40.0],
            logical_size: [320.0, 180.0],
            scale: [1.0, 1.0],
            rotation: 0.0,
            origin: [0.0, 0.0],
        },
    )
    .unwrap();

    assert_eq!(
        world
            .get::<AtomeVideoExternalTexture>(entity)
            .unwrap()
            .uv_rect,
        [0.1, 0.2, 0.6, 0.5]
    );
    assert_uvs_near(
        video_mesh_uvs(&world, entity),
        vec![[0.1, 0.7], [0.7, 0.7], [0.1, 0.2], [0.7, 0.2]],
    );
}

#[test]
fn video_transform_applies_scale_rotation_and_preserves_them_on_surface_resize() {
    let mut world = world_with_video_assets();
    let entity = apply_spawn(&mut world, video_node("external_rotated")).unwrap();

    apply_transform(
        &mut world,
        AtomeTransformPatch {
            id: "external_rotated".to_string(),
            logical_position: [30.0, 40.0],
            logical_size: [320.0, 180.0],
            scale: [1.5, 0.75],
            rotation: 30.0,
            origin: [0.5, 0.5],
        },
    )
    .unwrap();

    let local = world.get::<AtomeLocalTransform>(entity).unwrap();
    assert_eq!(local.scale, [1.5, 0.75]);
    assert_eq!(local.rotation, 30.0);
    assert_eq!(local.origin, [0.5, 0.5]);
    let transform = world.get::<Transform>(entity).unwrap();
    assert_eq!(
        transform.translation,
        Vec3::new(-130.0, 110.0, depth_for_layer(2))
    );
    assert_eq!(transform.scale, Vec3::new(1.5, 0.75, 1.0));
    let (_, _, z_rotation) = transform.rotation.to_euler(EulerRot::XYZ);
    assert_near(z_rotation, -30.0_f32.to_radians());

    crate::render_ops::apply_surface(
        &mut world,
        crate::types::AtomeSurfacePatch {
            width: 800.0,
            height: 600.0,
            pixel_width: None,
            pixel_height: None,
            device_pixel_ratio: None,
        },
    )
    .unwrap();

    let resized_transform = world.get::<Transform>(entity).unwrap();
    assert_eq!(
        resized_transform.translation,
        Vec3::new(-210.0, 170.0, depth_for_layer(2))
    );
    assert_eq!(resized_transform.scale, Vec3::new(1.5, 0.75, 1.0));
    let (_, _, resized_rotation) = resized_transform.rotation.to_euler(EulerRot::XYZ);
    assert_near(resized_rotation, -30.0_f32.to_radians());
}

#[test]
fn video_resource_patch_keeps_external_texture_route() {
    let mut world = world_with_video_assets();
    let entity = apply_spawn(&mut world, video_node("external_resource")).unwrap();

    apply_resource(
        &mut world,
        AtomeResourcePatch {
            id: "external_resource".to_string(),
            source: Some("/fixtures/replaced.mp4".to_string()),
            texture_size: Some([478, 850]),
            uv_rect: None,
            texture: None,
            peaks: None,
        },
    )
    .unwrap();

    assert!(world.get::<AtomeVideoExternalTexture>(entity).is_some());
    assert_eq!(
        world
            .get::<AtomeVideoExternalTexture>(entity)
            .unwrap()
            .layer,
        2
    );
    assert_eq!(
        world
            .get::<AtomeVideoExternalTexture>(entity)
            .unwrap()
            .opacity,
        0.65
    );
    assert_eq!(
        world
            .get::<AtomeVideoExternalTexture>(entity)
            .unwrap()
            .uv_rect,
        default_uv_rect()
    );
    assert!(world.get::<Mesh2d>(entity).is_some());
    assert!(world.get::<Sprite>(entity).is_none());
    assert_eq!(world.resource::<Assets<Image>>().len(), 0);
}

#[test]
fn video_resource_patch_updates_external_texture_uv_rect_mesh() {
    let mut world = world_with_video_assets();
    let entity = apply_spawn(&mut world, video_node("external_resource_uv")).unwrap();

    apply_resource(
        &mut world,
        AtomeResourcePatch {
            id: "external_resource_uv".to_string(),
            source: Some("/fixtures/replaced.mp4".to_string()),
            texture_size: Some([478, 850]),
            uv_rect: Some(Some([0.2, 0.1, 0.4, 0.5])),
            texture: None,
            peaks: None,
        },
    )
    .unwrap();

    assert_eq!(
        world
            .get::<AtomeVideoExternalTexture>(entity)
            .unwrap()
            .uv_rect,
        [0.2, 0.1, 0.4, 0.5]
    );
    assert_uvs_near(
        video_mesh_uvs(&world, entity),
        vec![[0.2, 0.6], [0.6, 0.6], [0.2, 0.1], [0.6, 0.1]],
    );

    apply_resource(
        &mut world,
        AtomeResourcePatch {
            id: "external_resource_uv".to_string(),
            source: Some("/fixtures/replaced.mp4".to_string()),
            texture_size: Some([478, 850]),
            uv_rect: Some(None),
            texture: None,
            peaks: None,
        },
    )
    .unwrap();

    assert_eq!(
        world
            .get::<AtomeVideoExternalTexture>(entity)
            .unwrap()
            .uv_rect,
        default_uv_rect()
    );
    assert_uvs_near(
        video_mesh_uvs(&world, entity),
        vec![[0.0, 1.0], [1.0, 1.0], [0.0, 0.0], [1.0, 0.0]],
    );
}

#[test]
fn video_style_patch_updates_external_texture_opacity() {
    let mut world = world_with_video_assets();
    let entity = apply_spawn(&mut world, video_node("external_opacity")).unwrap();

    apply_style(
        &mut world,
        AtomeStylePatch {
            id: "external_opacity".to_string(),
            color: None,
            shadow: None,
            backdrop: None,
            selected: None,
            opacity: Some(0.35),
            playback_progress: None,
            filters: None,
            transition: None,
            procedural: None,
        },
    )
    .unwrap();

    assert_eq!(
        world
            .get::<AtomeVideoExternalTexture>(entity)
            .unwrap()
            .opacity,
        0.35
    );

    apply_style(
        &mut world,
        AtomeStylePatch {
            id: "external_opacity".to_string(),
            color: None,
            shadow: None,
            backdrop: None,
            selected: None,
            opacity: Some(2.0),
            playback_progress: None,
            filters: None,
            transition: None,
            procedural: None,
        },
    )
    .unwrap();

    assert_eq!(
        world
            .get::<AtomeVideoExternalTexture>(entity)
            .unwrap()
            .opacity,
        1.0
    );
}

#[test]
fn video_node_carries_and_clamps_color_filters() {
    let mut world = world_with_video_assets();

    // In-range filters survive verbatim through spawn.
    let entity = apply_spawn(
        &mut world,
        AtomeRenderNode {
            filters: Some(AtomeColorFilters {
                brightness: 1.5,
                grayscale: 1.0,
                hue: 1.0,
                ..AtomeColorFilters::identity()
            }),
            ..video_node("filtered")
        },
    )
    .unwrap();
    assert_eq!(
        world
            .get::<AtomeVideoExternalTexture>(entity)
            .unwrap()
            .filters,
        AtomeColorFilters {
            brightness: 1.5,
            grayscale: 1.0,
            hue: 1.0,
            ..AtomeColorFilters::identity()
        }
    );

    // Out-of-range / non-finite filters are clamped to renderable ranges.
    let clamped = apply_spawn(
        &mut world,
        AtomeRenderNode {
            filters: Some(AtomeColorFilters {
                brightness: -0.5,
                contrast: f32::NAN,
                saturate: 2.0,
                grayscale: 2.0,
                sepia: -1.0,
                invert: 5.0,
                hue: 0.5,
            }),
            ..video_node("clamped_filters")
        },
    )
    .unwrap();
    assert_eq!(
        world
            .get::<AtomeVideoExternalTexture>(clamped)
            .unwrap()
            .filters,
        AtomeColorFilters {
            brightness: 0.0,
            contrast: 1.0,
            saturate: 2.0,
            grayscale: 1.0,
            sepia: 0.0,
            invert: 1.0,
            hue: 0.5,
        }
    );

    // Absent filters default to identity (zero regression).
    let plain = apply_spawn(&mut world, video_node("plain_filters")).unwrap();
    assert_eq!(
        world
            .get::<AtomeVideoExternalTexture>(plain)
            .unwrap()
            .filters,
        AtomeColorFilters::identity()
    );
}

#[test]
fn video_style_patch_updates_color_filters() {
    let mut world = world_with_video_assets();
    let entity = apply_spawn(&mut world, video_node("filter_style")).unwrap();
    assert_eq!(
        world
            .get::<AtomeVideoExternalTexture>(entity)
            .unwrap()
            .filters,
        AtomeColorFilters::identity()
    );

    apply_style(
        &mut world,
        AtomeStylePatch {
            id: "filter_style".to_string(),
            color: None,
            shadow: None,
            backdrop: None,
            selected: None,
            opacity: None,
            playback_progress: None,
            filters: Some(AtomeColorFilters {
                sepia: 1.0,
                invert: 3.0,
                ..AtomeColorFilters::identity()
            }),
            transition: None,
            procedural: None,
        },
    )
    .unwrap();
    assert_eq!(
        world
            .get::<AtomeVideoExternalTexture>(entity)
            .unwrap()
            .filters,
        AtomeColorFilters {
            sepia: 1.0,
            invert: 1.0,
            ..AtomeColorFilters::identity()
        }
    );
}

#[test]
fn video_node_and_style_carry_normalized_transition() {
    let mut world = world_with_video_assets();

    // Out-of-range transition is clamped on spawn (kind snapped, progress
    // and softness clamped, role binarized).
    let entity = apply_spawn(
        &mut world,
        AtomeRenderNode {
            transition: Some(AtomeTransition {
                kind: 9.0,
                progress: 2.0,
                role: 0.3,
                softness: 5.0,
            }),
            ..video_node("transitioning")
        },
    )
    .unwrap();
    assert_eq!(
        world
            .get::<AtomeVideoExternalTexture>(entity)
            .unwrap()
            .transition,
        AtomeTransition {
            kind: 3.0,
            progress: 1.0,
            role: 0.0,
            softness: 1.0,
        }
    );

    // Absent transition defaults to none (zero regression).
    let plain = apply_spawn(&mut world, video_node("plain_transition")).unwrap();
    assert_eq!(
        world
            .get::<AtomeVideoExternalTexture>(plain)
            .unwrap()
            .transition,
        AtomeTransition::none()
    );

    // Style patch updates the live transition (fade-out at progress 0.5).
    apply_style(
        &mut world,
        AtomeStylePatch {
            id: "plain_transition".to_string(),
            color: None,
            shadow: None,
            backdrop: None,
            selected: None,
            opacity: None,
            playback_progress: None,
            filters: None,
            transition: Some(AtomeTransition {
                kind: 1.0,
                progress: 0.5,
                role: 1.0,
                softness: 0.0,
            }),
            procedural: None,
        },
    )
    .unwrap();
    assert_eq!(
        world
            .get::<AtomeVideoExternalTexture>(plain)
            .unwrap()
            .transition,
        AtomeTransition {
            kind: 1.0,
            progress: 0.5,
            role: 1.0,
            softness: 0.0,
        }
    );
}
