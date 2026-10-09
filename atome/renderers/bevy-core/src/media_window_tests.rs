use crate::{
    media_window::AtomeMediaWindow,
    render_ops::{apply_spawn, apply_transform},
    types::{AtomeRenderNode, AtomeTransformPatch},
    video_external_texture::{AtomeVideoExternalTexture, AtomeVideoQuad},
    video_external_texture_tests::{video_mesh_uvs, video_node, world_with_video_assets},
};
use bevy::{mesh::VertexAttributeValues, prelude::*, render::batching::NoAutomaticBatching};

fn window_node(id: &str) -> AtomeRenderNode {
    AtomeRenderNode { kind: "media_window".to_string(), source: None, texture_size: None, ..video_node(id) }
}

fn quad_width(world: &World, entity: Entity) -> f32 {
    let mesh = world.resource::<Assets<Mesh>>().get(&world.get::<Mesh2d>(entity).unwrap().0).unwrap();
    let Some(VertexAttributeValues::Float32x3(positions)) = mesh.attribute(Mesh::ATTRIBUTE_POSITION) else {
        panic!("media window quad should carry positions");
    };
    positions[1][0] - positions[0][0]
}

#[test]
fn a_media_window_is_the_atome_quad_without_any_texture() {
    let mut world = world_with_video_assets();
    let entity = apply_spawn(&mut world, window_node("window")).unwrap();
    assert_eq!(world.get::<AtomeMediaWindow>(entity).unwrap().id, "window");
    assert!(world.get::<Mesh2d>(entity).is_some());
    assert_eq!(world.get::<AtomeVideoQuad>(entity).unwrap().0, [0.0, 0.0, 1.0, 1.0]);
    assert!(world.get::<NoAutomaticBatching>(entity).is_some());
    assert!(world.get::<Sprite>(entity).is_none(), "no poster sprite under the cut-out");
    assert!(world.get::<AtomeVideoExternalTexture>(entity).is_none(), "nothing to sample");
    assert_eq!(world.resource::<Assets<Image>>().len(), 0);
    assert!((quad_width(&world, entity) - 160.0).abs() < 0.001);
}

#[test]
fn a_media_window_follows_a_resize_of_its_atome() {
    let mut world = world_with_video_assets();
    let entity = apply_spawn(&mut world, window_node("window_resized")).unwrap();
    apply_transform(&mut world, AtomeTransformPatch {
        id: "window_resized".to_string(), logical_position: [30.0, 40.0], logical_size: [320.0, 180.0],
        clip_rect: None, clip_rotation: 0.0, clip_rounded_rects: vec![],
        scale: [1.0, 1.0], rotation: 0.0, origin: [0.0, 0.0],
    }).unwrap();
    assert!((quad_width(&world, entity) - 320.0).abs() < 0.001, "pinch or resize widens the cut-out");
}

#[test]
fn a_page_clips_a_media_window_like_a_video() {
    let mut world = world_with_video_assets();
    // The Atome spans x 10..170; the page keeps only x 10..90 (its left half).
    let node = AtomeRenderNode { clip_rect: Some([10.0, 20.0, 80.0, 90.0]), ..window_node("window_clipped") };
    let entity = apply_spawn(&mut world, node).unwrap();
    assert!((quad_width(&world, entity) - 80.0).abs() < 0.001, "only the visible part is cut out");
    let uvs = video_mesh_uvs(&world, entity);
    assert!(uvs.iter().all(|uv| uv[0] <= 0.5 + 0.00001));
}
