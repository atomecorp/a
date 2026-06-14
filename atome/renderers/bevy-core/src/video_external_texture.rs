use bevy::{
    asset::RenderAssetUsages,
    mesh::{Indices, Mesh, Mesh2d},
    prelude::*,
    render::{
        extract_component::{ExtractComponent, ExtractComponentPlugin},
        render_resource::PrimitiveTopology,
    },
};

use crate::types::{normalize_opacity, normalize_uv_rect, AtomeRenderNode};

#[derive(Clone, Debug, Component, ExtractComponent)]
pub struct AtomeVideoExternalTexture {
    pub id: String,
    pub layer: i32,
    pub opacity: f32,
    pub uv_rect: [f32; 4],
}

pub struct AtomeVideoExternalTexturePlugin;

impl Plugin for AtomeVideoExternalTexturePlugin {
    fn build(&self, app: &mut App) {
        app.add_plugins(ExtractComponentPlugin::<AtomeVideoExternalTexture>::default());

        #[cfg(target_arch = "wasm32")]
        crate::video_external_web::build_web_external_texture_renderer(app);
    }
}

pub fn video_external_texture_component_from_node(
    node: &AtomeRenderNode,
) -> Option<AtomeVideoExternalTexture> {
    if node.kind != "video"
        || node
            .source
            .as_ref()
            .is_none_or(|value| value.trim().is_empty())
    {
        return None;
    }
    Some(AtomeVideoExternalTexture {
        id: node.id.clone(),
        layer: node.layer,
        opacity: normalize_opacity(node.opacity),
        uv_rect: normalize_uv_rect(node.uv_rect),
    })
}

fn video_quad_uvs(uv_rect: [f32; 4]) -> Vec<[f32; 2]> {
    let [x, y, width, height] = normalize_uv_rect(Some(uv_rect));
    let left = x;
    let right = x + width;
    let top = y;
    let bottom = y + height;
    vec![[left, bottom], [right, bottom], [left, top], [right, top]]
}

pub fn insert_video_external_texture_component_for_node(
    world: &mut World,
    entity: Entity,
    node: &AtomeRenderNode,
) {
    if let Some(component) = video_external_texture_component_from_node(node) {
        world.entity_mut(entity).insert(component);
    }
}

pub fn video_quad_mesh_handle_from_size(
    meshes: &mut Assets<Mesh>,
    logical_size: [f32; 2],
    uv_rect: [f32; 4],
) -> Handle<Mesh> {
    let width = logical_size[0].max(1.0);
    let height = logical_size[1].max(1.0);
    let half_width = width / 2.0;
    let half_height = height / 2.0;
    let mut mesh = Mesh::new(
        PrimitiveTopology::TriangleList,
        RenderAssetUsages::default(),
    );
    mesh.insert_attribute(
        Mesh::ATTRIBUTE_POSITION,
        vec![
            [-half_width, -half_height, 0.0],
            [half_width, -half_height, 0.0],
            [-half_width, half_height, 0.0],
            [half_width, half_height, 0.0],
        ],
    );
    mesh.insert_attribute(Mesh::ATTRIBUTE_UV_0, video_quad_uvs(uv_rect));
    mesh.insert_indices(Indices::U32(vec![0, 1, 2, 2, 1, 3]));
    meshes.add(mesh)
}

pub fn insert_video_quad_mesh(
    world: &mut World,
    entity: Entity,
    logical_size: [f32; 2],
    uv_rect: [f32; 4],
) -> Result<(), String> {
    let handle = {
        let mut meshes = world
            .get_resource_mut::<Assets<Mesh>>()
            .ok_or_else(|| "bevy_mesh_assets_required".to_string())?;
        video_quad_mesh_handle_from_size(&mut meshes, logical_size, uv_rect)
    };
    world.entity_mut(entity).insert(Mesh2d(handle));
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        render_math::depth_for_layer,
        render_ops::{
            apply_resource, apply_spawn, apply_style, apply_transform, apply_video_track,
            remove_video_track, update_video_transform,
        },
        types::{
            default_uv_rect, AtomeBevyRendererConfig, AtomeEntityTable, AtomeLayer,
            AtomeLocalTransform, AtomeLogicalPosition, AtomeLogicalSize, AtomeMediaSource,
            AtomeRenderNode, AtomeRendererDiagnostics, AtomeResourcePatch, AtomeStylePatch,
            AtomeTransformPatch, AtomeVideoTrack, AtomeVideoTransformPatch,
        },
    };
    use bevy::{
        math::EulerRot, mesh::VertexAttributeValues, render::batching::NoAutomaticBatching,
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
            color: Some([0.1, 0.2, 0.3, 1.0]),
            text: None,
            source: Some("/fixtures/video.mp4".to_string()),
            texture_size: Some([320, 180]),
            uv_rect: None,
            texture: None,
            peaks: None,
            playback_progress: None,
            selected: None,
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
                selected: None,
                opacity: Some(0.35),
                playback_progress: None,
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
                selected: None,
                opacity: Some(2.0),
                playback_progress: None,
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
    fn video_track_api_spawns_reuses_and_removes_external_texture_entities() {
        let mut world = world_with_video_assets();
        let track = AtomeVideoTrack {
            id: "track_video".to_string(),
            source: "/fixtures/track.mp4".to_string(),
            logical_position: [15.0, 25.0],
            logical_size: [200.0, 112.0],
            scale: [1.0, 1.0],
            rotation: 0.0,
            origin: [0.0, 0.0],
            layer: 5,
            opacity: 0.7,
            uv_rect: Some([0.25, 0.0, 0.5, 1.0]),
        };

        apply_video_track(&mut world, track.clone()).unwrap();

        let entity = world.resource::<AtomeEntityTable>().by_id["track_video"];
        assert!(world.get::<AtomeVideoExternalTexture>(entity).is_some());
        assert!(world.get::<Mesh2d>(entity).is_some());
        assert!(world.get::<Sprite>(entity).is_none());
        assert_eq!(world.resource::<Assets<Image>>().len(), 0);

        let mut updated = track;
        updated.source = "/fixtures/updated.mp4".to_string();
        updated.logical_position = [30.0, 45.0];
        updated.logical_size = [320.0, 180.0];
        updated.scale = [1.2, 0.8];
        updated.rotation = 18.0;
        updated.origin = [0.5, 0.5];
        updated.layer = 9;
        apply_video_track(&mut world, updated).unwrap();

        assert_eq!(
            world.get::<AtomeMediaSource>(entity).unwrap().0.as_deref(),
            Some("/fixtures/updated.mp4")
        );
        assert_eq!(world.get::<AtomeLogicalPosition>(entity).unwrap().x, 30.0);
        assert_eq!(world.get::<AtomeLogicalSize>(entity).unwrap().width, 320.0);
        assert_eq!(
            world.get::<AtomeLocalTransform>(entity).unwrap().scale,
            [1.2, 0.8]
        );
        assert_eq!(
            world.get::<AtomeLocalTransform>(entity).unwrap().rotation,
            18.0
        );
        assert_eq!(world.get::<AtomeLayer>(entity).unwrap().0, 9);
        assert_eq!(
            world
                .get::<AtomeVideoExternalTexture>(entity)
                .unwrap()
                .layer,
            9
        );
        assert_eq!(
            world
                .get::<AtomeVideoExternalTexture>(entity)
                .unwrap()
                .opacity,
            0.7
        );
        assert_eq!(
            world
                .get::<AtomeVideoExternalTexture>(entity)
                .unwrap()
                .uv_rect,
            [0.25, 0.0, 0.5, 1.0]
        );

        remove_video_track(&mut world, "track_video").unwrap();
        assert!(!world
            .resource::<AtomeEntityTable>()
            .by_id
            .contains_key("track_video"));
    }

    #[test]
    fn video_track_layer_updates_compositor_depth_for_overlapping_tracks() {
        let mut world = world_with_video_assets();
        let lower = AtomeVideoTrack {
            id: "lower_video".to_string(),
            source: "/fixtures/lower.mp4".to_string(),
            logical_position: [80.0, 90.0],
            logical_size: [320.0, 180.0],
            scale: [1.0, 1.0],
            rotation: 0.0,
            origin: [0.0, 0.0],
            layer: 1,
            opacity: 1.0,
            uv_rect: None,
        };
        let upper = AtomeVideoTrack {
            id: "upper_video".to_string(),
            source: "/fixtures/upper.mp4".to_string(),
            logical_position: [80.0, 90.0],
            logical_size: [320.0, 180.0],
            scale: [1.0, 1.0],
            rotation: 0.0,
            origin: [0.0, 0.0],
            layer: 7,
            opacity: 1.0,
            uv_rect: None,
        };

        apply_video_track(&mut world, lower.clone()).unwrap();
        apply_video_track(&mut world, upper.clone()).unwrap();

        let lower_entity = world.resource::<AtomeEntityTable>().by_id["lower_video"];
        let upper_entity = world.resource::<AtomeEntityTable>().by_id["upper_video"];
        assert_eq!(
            world.get::<Transform>(lower_entity).unwrap().translation.z,
            depth_for_layer(1)
        );
        assert_eq!(
            world.get::<Transform>(upper_entity).unwrap().translation.z,
            depth_for_layer(7)
        );
        assert_ne!(
            world.get::<Transform>(lower_entity).unwrap().translation.z,
            world.get::<Transform>(upper_entity).unwrap().translation.z
        );
        assert!(
            world.get::<Transform>(upper_entity).unwrap().translation.z
                > world.get::<Transform>(lower_entity).unwrap().translation.z
        );

        let mut promoted = lower;
        promoted.layer = 12;
        apply_video_track(&mut world, promoted).unwrap();

        assert_eq!(
            world.get::<AtomeLayer>(lower_entity).unwrap().0,
            12,
            "video track layer must update the stored compositor layer"
        );
        assert_eq!(
            world.get::<Transform>(lower_entity).unwrap().translation.z,
            depth_for_layer(12),
            "video track layer must update Bevy depth used for ordering"
        );
        assert_eq!(
            world
                .get::<AtomeVideoExternalTexture>(lower_entity)
                .unwrap()
                .layer,
            12,
            "video external texture extraction must carry the current compositor layer"
        );
        assert_eq!(
            world.get::<Transform>(upper_entity).unwrap().translation.z,
            depth_for_layer(7)
        );
        assert!(
            world.get::<Transform>(lower_entity).unwrap().translation.z
                > world.get::<Transform>(upper_entity).unwrap().translation.z
        );
    }

    #[test]
    fn video_transform_api_updates_only_video_entities() {
        let mut world = world_with_video_assets();
        let entity = apply_spawn(&mut world, video_node("external_track_transform")).unwrap();

        update_video_transform(
            &mut world,
            AtomeVideoTransformPatch {
                id: "external_track_transform".to_string(),
                logical_position: [48.0, 64.0],
                logical_size: [240.0, 135.0],
                scale: [0.75, 1.25],
                rotation: -12.0,
                origin: [0.5, 0.5],
            },
        )
        .unwrap();

        assert_eq!(world.get::<AtomeLogicalPosition>(entity).unwrap().x, 48.0);
        assert_eq!(world.get::<AtomeLogicalSize>(entity).unwrap().height, 135.0);
        assert_eq!(
            world.get::<AtomeLocalTransform>(entity).unwrap().scale,
            [0.75, 1.25]
        );
        assert_eq!(
            world.get::<AtomeLocalTransform>(entity).unwrap().rotation,
            -12.0
        );

        apply_spawn(
            &mut world,
            AtomeRenderNode {
                id: "shape_not_video".to_string(),
                kind: "shape".to_string(),
                parent_id: None,
                logical_position: [0.0, 0.0],
                logical_size: [20.0, 20.0],
                scale: [1.0, 1.0],
                rotation: 0.0,
                origin: [0.0, 0.0],
                layer: 1,
                opacity: 1.0,
                color: None,
                text: None,
                source: None,
                texture_size: None,
                uv_rect: None,
                texture: None,
                peaks: None,
                playback_progress: None,
                selected: None,
            },
        )
        .unwrap();

        let error = update_video_transform(
            &mut world,
            AtomeVideoTransformPatch {
                id: "shape_not_video".to_string(),
                logical_position: [1.0, 2.0],
                logical_size: [30.0, 30.0],
                scale: [1.0, 1.0],
                rotation: 0.0,
                origin: [0.0, 0.0],
            },
        )
        .unwrap_err();

        assert_eq!(
            error,
            "bevy_video_track_entity_kind_invalid:shape_not_video"
        );
    }
}
