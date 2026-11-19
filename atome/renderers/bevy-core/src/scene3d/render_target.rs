//! The image a scene3d atome's pass draws into: its quad's texture, sized to the quad in physical pixels.

use bevy::{
    image::Image,
    prelude::*,
    render::render_resource::{Extent3d, TextureFormat},
};

/// The longest side of a 3D view's image: past it the quad samples the image down.
const MAX_TARGET_SIDE: f32 = 2048.0;

pub fn target_size(logical: [f32; 2], device_pixel_ratio: f32) -> UVec2 {
    let ratio = if device_pixel_ratio.is_finite() && device_pixel_ratio > 0.0 {
        device_pixel_ratio
    } else {
        1.0
    };
    let scale = (MAX_TARGET_SIDE / (logical[0].max(logical[1]) * ratio).max(1.0)).min(1.0) * ratio;
    UVec2::new(
        (logical[0] * scale).round().clamp(1.0, MAX_TARGET_SIDE) as u32,
        (logical[1] * scale).round().clamp(1.0, MAX_TARGET_SIDE) as u32,
    )
}

pub fn new_target(images: &mut Assets<Image>, size: UVec2) -> Handle<Image> {
    images.add(Image::new_target_texture(
        size.x,
        size.y,
        TextureFormat::Rgba8UnormSrgb,
        None,
    ))
}

/// Follows the quad when it is resized; true when the image changed size and must be drawn again.
pub fn resize_target(images: &mut Assets<Image>, handle: &Handle<Image>, size: UVec2) -> bool {
    let Some(mut image) = images.get_mut(handle) else {
        return false;
    };
    if image.width() == size.x && image.height() == size.y {
        return false;
    }
    image.resize(Extent3d {
        width: size.x,
        height: size.y,
        depth_or_array_layers: 1,
    });
    true
}
