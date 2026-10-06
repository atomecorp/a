use bevy::{image::Image, prelude::*};
use crate::{components::AtomeShapeShadowOverlay, shape_shadow_overlay_tests::{shape_node, test_world}, *};

#[test]
fn outer_shadow_leaves_transparent_owner_clear_for_shifted_and_spread_shapes() {
    for (offset_x, offset_y, spread) in [(0.0, 0.0, 0.0), (16.0, 12.0, 4.0), (-12.0, -8.0, 2.0)] {
        let mut world = test_world();
        let shadow = AtomeShadowStyle {
            color: [0.0, 0.0, 0.0, 0.45], blur: 8.0, offset_x, offset_y, spread,
            kind: AtomeShadowKind::Drop, invert: false,
        };
        let entity = apply_spawn(&mut world, AtomeRenderNode {
            color: Some([0.2, 0.4, 0.8, 0.2]), corner_radius: 10.0,
            shadow: Some(shadow), ..shape_node("transparent_owner")
        }).unwrap();
        let overlay = world.get::<AtomeShapeShadowOverlay>(entity).unwrap();
        let texture = world.resource::<Assets<Image>>().get(&overlay.image_handles[0]).unwrap();
        let width = texture.texture_descriptor.size.width as usize;
        let height = texture.texture_descriptor.size.height as usize;
        let data = texture.data.as_ref().unwrap();
        // Every pixel well inside the owner remains clear, independently of
        // where the shadow silhouette was moved or expanded.
        for owner_y in 12..38 {
            for owner_x in 12..108 {
                let px = (owner_x as f32 + 12.0 + spread - offset_x) as usize;
                let py = (owner_y as f32 + 12.0 + spread - offset_y) as usize;
                if px < width && py < height {
                    assert_eq!(data[(py * width + px) * 4 + 3], 0, "owner pixel {owner_x},{owner_y}");
                }
            }
        }
        assert!(data.chunks_exact(4).any(|pixel| pixel[3] > 0), "the exterior shadow must survive");
    }
}

#[test]
fn shifted_outer_shadow_keeps_contact_without_moving_the_owner_cutout() {
    let mut world = test_world();
    let entity = apply_spawn(&mut world, AtomeRenderNode {
        corner_radius: 10.0,
        shadow: Some(AtomeShadowStyle {
            color: [0.0, 0.0, 0.0, 1.0], blur: 8.0, offset_x: 16.0, offset_y: 0.0,
            spread: 0.0, kind: AtomeShadowKind::Drop, invert: false,
        }), ..shape_node("shifted_owner")
    }).unwrap();
    let overlay = world.get::<AtomeShapeShadowOverlay>(entity).unwrap();
    let texture = world.resource::<Assets<Image>>().get(&overlay.image_handles[0]).unwrap();
    let width = texture.texture_descriptor.size.width as usize;
    let data = texture.data.as_ref().unwrap();
    let at_owner = |x: usize| data[(37 * width + x + 12 - 16) * 4 + 3];
    assert_eq!(at_owner(110), 0);
    assert!(at_owner(121) > 100, "no travelling hole may erase the contact shadow");
}

#[test]
fn masked_outer_shadow_removes_only_the_actual_owner_alpha() {
    let mut source = vec![0; 60 * 40 * 4];
    for y in 8..32 { for x in 8..52 { source[(y * 60 + x) * 4 + 3] = 255; } }
    let style = AtomeShadowStyle {
        color: [0.0, 0.0, 0.0, 1.0], blur: 8.0, offset_x: 10.0, offset_y: 0.0,
        spread: 0.0, kind: AtomeShadowKind::Drop, invert: false,
    };
    let (width, _, rgba) = crate::shadow_texture::build_shadow_texture_rgba_for_alpha(&source, 60, 40, style).unwrap();
    let at_owner = |x: usize| rgba[((20 + 12) * width as usize + x + 12 - 10) * 4 + 3];
    assert_eq!(at_owner(40), 0);
    assert!(at_owner(54) > 100);
}
