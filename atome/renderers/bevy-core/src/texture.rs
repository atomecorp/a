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
