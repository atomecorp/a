//! A shape longer than the device's textures (R-295: a 16 482 px clip on the iPad's zoomed Timeline)
//! gets a mask and a shadow that fit them, laid at its own size: the GPU never refuses them, which
//! stopped the whole renderer.
use bevy::prelude::*;

use crate::{
    shape_sdf::AtomeShapeSilhouette,
    shape_shadow_cache::cached_shape_shadow_handle,
    shape_texture::{cached_image_handle_from_shape_mask, density_within, texture_side_limit},
    types::{AtomeShadowKind, AtomeShadowStyle},
};

fn world() -> World {
    let mut world = World::new();
    world.init_resource::<Assets<Image>>();
    world
}

fn size_of(world: &World, handle: &Handle<Image>) -> (u32, u32) {
    let size = world
        .resource::<Assets<Image>>()
        .get(handle)
        .expect("an image")
        .texture_descriptor
        .size;
    (size.width, size.height)
}

#[test]
fn a_box_within_the_limit_keeps_one_texel_per_px() {
    assert_eq!(density_within(8192, [8192.0, 45.0]), 1.0);
    assert!((density_within(8192, [16384.0, 45.0]) - 0.5).abs() < 1e-6);
}

#[test]
fn a_rounded_shape_longer_than_the_textures_gets_a_mask_that_fits() {
    let mut world = world();
    let limit = texture_side_limit(&world);
    let clip = AtomeShapeSilhouette::rect(16482.0, 45.0, [3.0; 4]);
    let handle = cached_image_handle_from_shape_mask(&mut world, &clip, "clip").expect("a mask");
    let (width, height) = size_of(&world, &handle);
    assert!(width <= limit, "{width} > {limit}");
    assert!((1..=45).contains(&height));
    let short = AtomeShapeSilhouette::rect(300.0, 45.0, [3.0; 4]);
    let handle = cached_image_handle_from_shape_mask(&mut world, &short, "short").expect("a mask");
    assert_eq!(size_of(&world, &handle), (300, 45));
}

#[test]
fn its_drop_shadow_fits_and_is_laid_at_the_shape_size() {
    let mut world = world();
    let limit = texture_side_limit(&world);
    let shadow = AtomeShadowStyle {
        kind: AtomeShadowKind::Drop,
        color: [0.0, 0.0, 0.0, 0.34],
        blur: 24.0,
        offset_x: 0.0,
        offset_y: 0.0,
        spread: 0.0,
        invert: false,
        follows_alpha: false,
    };
    let clip = AtomeShapeSilhouette::rect(16482.0, 45.0, [3.0; 4]);
    let (handle, laid, margin) = cached_shape_shadow_handle(&mut world, shadow, &clip)
        .expect("a shadow")
        .expect("a visible shadow");
    let (width, _) = size_of(&world, &handle);
    assert!(width <= limit, "{width} > {limit}");
    // Its texture rounds up to whole texels at a density under 1: a few px at most.
    assert!(
        (laid.x - (16482.0 + margin * 2.0)).abs() < 4.0,
        "{laid:?} {margin}"
    );
    let short = AtomeShapeSilhouette::rect(300.0, 45.0, [3.0; 4]);
    let (_, laid, margin) = cached_shape_shadow_handle(&mut world, shadow, &short)
        .unwrap()
        .unwrap();
    assert_eq!(laid, Vec2::new(300.0 + margin * 2.0, 45.0 + margin * 2.0));
}
