use crate::{
    media_window::AtomeMediaWindow,
    render_ops::{apply_spawn, apply_style, apply_transform},
    types::{AtomeRenderNode, AtomeStylePatch, AtomeTransformPatch},
    video_external_texture::{AtomeVideoExternalTexture, AtomeVideoQuad},
    video_external_texture_tests::{star_mask, video_mesh_uvs, video_node, world_with_video_assets},
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
        clip_rect: None, clip_rotation: 0.0, clip_rounded_rects: vec![], clip_fades: vec![],
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

/// The cut-out's coverage: (width, height, alpha at a pixel) of its mask image.
fn window_mask(world: &World, entity: Entity) -> Option<(u32, u32, Vec<u8>)> {
    let handle = world.get::<AtomeMediaWindow>(entity).unwrap().mask_texture.clone()?;
    let image = world.resource::<Assets<Image>>().get(&handle).expect("the mask image must exist");
    let size = image.texture_descriptor.size;
    let alpha = image.data.as_ref().expect("the mask carries pixels").chunks(4).map(|px| px[3]).collect();
    Some((size.width, size.height, alpha))
}

fn alpha_at(mask: &(u32, u32, Vec<u8>), x: u32, y: u32) -> u8 {
    mask.2[(y * mask.0 + x) as usize]
}

fn style(id: &str, json: serde_json::Value) -> AtomeStylePatch {
    let mut value = json;
    value["id"] = serde_json::Value::String(id.to_string());
    serde_json::from_value(value).unwrap()
}

#[test]
fn a_rounded_media_window_cuts_out_its_own_shape_and_keeps_its_corners() {
    let mut world = world_with_video_assets();
    let node = AtomeRenderNode { corner_radius: 12.0, ..window_node("window_rounded") };
    let entity = apply_spawn(&mut world, node).unwrap();
    let mask = window_mask(&world, entity).expect("a rounded window binds its shape mask");
    assert_eq!((mask.0, mask.1), (160, 90), "baked at the Atome's logical size");
    assert_eq!(alpha_at(&mask, 0, 0), 0, "outside the radius the canvas is kept");
    assert_eq!(alpha_at(&mask, 159, 89), 0);
    assert_eq!(alpha_at(&mask, 80, 45), 255, "inside, the canvas is erased");
    assert_eq!(alpha_at(&mask, 12, 0), 255, "the straight edge is cut out up to the box");
}

#[test]
fn a_square_media_window_binds_the_opaque_mask_path() {
    let mut world = world_with_video_assets();
    let entity = apply_spawn(&mut world, window_node("window_square")).unwrap();
    assert!(window_mask(&world, entity).is_none(), "no texture: the 1x1 white mask covers the box");
}

#[test]
fn a_media_window_mask_follows_a_resize_rounding_and_mask_patches() {
    let mut world = world_with_video_assets();
    let node = AtomeRenderNode { corner_radius: 12.0, ..window_node("window_live") };
    let entity = apply_spawn(&mut world, node).unwrap();
    apply_transform(&mut world, AtomeTransformPatch {
        id: "window_live".to_string(), logical_position: [30.0, 40.0], logical_size: [320.0, 180.0],
        clip_rect: None, clip_rotation: 0.0, clip_rounded_rects: vec![], clip_fades: vec![],
        scale: [1.0, 1.0], rotation: 0.0, origin: [0.0, 0.0],
    }).unwrap();
    let mask = window_mask(&world, entity).unwrap();
    assert_eq!((mask.0, mask.1), (320, 180), "re-cut at the new size, corners never stretched");
    assert_eq!(alpha_at(&mask, 0, 0), 0);
    assert_eq!(alpha_at(&mask, 6, 0), 0, "the 12 px arc keeps its radius at the new size");
    apply_style(&mut world, style("window_live", serde_json::json!({ "corner_radius": 0.0 }))).unwrap();
    assert!(window_mask(&world, entity).is_none(), "the rounding removed, the window is square again");
    let mut masked = style("window_live", serde_json::json!({}));
    masked.mask = Some(Some(star_mask(320.0, 180.0)));
    apply_style(&mut world, masked).unwrap();
    let starred = window_mask(&world, entity).expect("a resolved Atome mask cuts the window");
    assert_eq!(alpha_at(&starred, 0, 0), 0, "a star leaves the box corners");
    assert_eq!(alpha_at(&starred, 160, 90), 255, "and cuts out its centre");
}
