use bevy::{
    asset::RenderAssetUsages,
    image::{Image, ImageSampler},
    prelude::*,
    render::render_resource::{Extent3d, TextureDimension, TextureFormat},
};

use crate::types::AtomeTexture;

fn image_from_texture(texture: &AtomeTexture, id: &str) -> Result<Image, String> {
    if texture.width == 0 || texture.height == 0 {
        return Err(format!("bevy_texture_dimension_required:{id}"));
    }
    let expected_len = texture.width as usize * texture.height as usize * 4;
    if texture.rgba.len() != expected_len {
        return Err(format!("bevy_texture_rgba_length_invalid:{id}"));
    }
    let mut image = Image::new(
        Extent3d {
            width: texture.width,
            height: texture.height,
            depth_or_array_layers: 1,
        },
        TextureDimension::D2,
        texture.rgba.clone(),
        TextureFormat::Rgba8UnormSrgb,
        RenderAssetUsages::default(),
    );
    image.sampler = ImageSampler::linear();
    Ok(image)
}

pub fn image_handle_from_texture(
    images: &mut Assets<Image>,
    texture: &Option<AtomeTexture>,
    id: &str,
) -> Result<Handle<Image>, String> {
    let texture = texture
        .as_ref()
        .ok_or_else(|| format!("bevy_texture_required:{id}"))?;
    Ok(images.add(image_from_texture(texture, id)?))
}

pub(crate) fn rounded_rect_signed_distance(
    x: f32,
    y: f32,
    width: f32,
    height: f32,
    radius: f32,
) -> f32 {
    let width = width.max(1.0);
    let height = height.max(1.0);
    let radius = radius.max(0.0).min(width / 2.0).min(height / 2.0);
    let half_width = width / 2.0;
    let half_height = height / 2.0;
    let dx = (x - half_width).abs() - (half_width - radius);
    let dy = (y - half_height).abs() - (half_height - radius);
    let outside_x = dx.max(0.0);
    let outside_y = dy.max(0.0);
    let outside = (outside_x.powi(2) + outside_y.powi(2)).sqrt();
    outside + dx.max(dy).min(0.0) - radius
}

fn rounded_rect_alpha(x: u32, y: u32, width: u32, height: u32, radius: f32) -> u8 {
    if radius <= 0.0 {
        return 255;
    }
    let px = x as f32 + 0.5;
    let py = y as f32 + 0.5;
    let edge = -rounded_rect_signed_distance(px, py, width as f32, height as f32, radius);
    if edge >= 0.5 {
        255
    } else if edge <= -0.5 {
        0
    } else {
        ((edge + 0.5) * 255.0).round().clamp(0.0, 255.0) as u8
    }
}

pub fn image_handle_from_rounded_rect_mask(
    images: &mut Assets<Image>,
    width: f32,
    height: f32,
    radius: f32,
    id: &str,
) -> Result<Handle<Image>, String> {
    let width = width.ceil().max(1.0) as u32;
    let height = height.ceil().max(1.0) as u32;
    let mut rgba = vec![255; width as usize * height as usize * 4];
    for y in 0..height {
        for x in 0..width {
            let alpha = rounded_rect_alpha(x, y, width, height, radius);
            rgba[(y as usize * width as usize + x as usize) * 4 + 3] = alpha;
        }
    }
    Ok(images.add(image_from_texture(
        &AtomeTexture {
            width,
            height,
            rgba,
        },
        id,
    )?))
}
