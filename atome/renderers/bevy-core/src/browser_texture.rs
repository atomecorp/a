//! A browser image copied by the GPU into a texture (Rust-first step 6, text path T1).
//!
//! A text is painted by Canvas2D in the browser (system shaping and glyphs, emoji and every script). Its pixels
//! used to be read back to the CPU (`getImageData`), bled by a JavaScript pixel loop, copied into WASM and uploaded
//! again. Now the web glue stages the canvas's `ImageBitmap` under a slot (`AtomeTexture::external`); the texture
//! is created here without pixels and the render world copies the bitmap into it on the GPU
//! (`copyExternalImageToTexture`, premultiplied), then one fragment pass turns it into the straight alpha the
//! sprite pipeline blends, with the edge bleed and an optional spatial mask (`browser_texture.wgsl`). The
//! texture's contract is unchanged: same size, `Rgba8UnormSrgb`, linear sampling, the same bytes.
use bevy::prelude::*;

use crate::types::{AtomeMaskStyle, AtomeTexture};

/// The texture of a browser image staged for `texture.external`; a spatial mask's coverage
/// (`mask_texture_for_target`, at the mask's target size) is multiplied into its alpha as the CPU path does.
#[cfg(target_arch = "wasm32")]
pub(crate) fn browser_texture_image(
    images: &mut Assets<Image>,
    texture: &AtomeTexture,
    id: &str,
    mask: Option<&AtomeMaskStyle>,
) -> Result<Handle<Image>, String> {
    let coverage = mask.map(|mask| {
        let size = mask
            .placement
            .map_or([texture.width as f32, texture.height as f32], |placement| {
                placement.target_size
            });
        crate::shape_texture::mask_texture_for_target(mask, size)
    });
    crate::browser_texture_web::queue_browser_texture(images, texture, id, coverage)
}

/// Only a browser holds a browser image: a native renderer receives its pixels.
#[cfg(not(target_arch = "wasm32"))]
pub(crate) fn browser_texture_image(
    _images: &mut Assets<Image>,
    _texture: &AtomeTexture,
    id: &str,
    _mask: Option<&AtomeMaskStyle>,
) -> Result<Handle<Image>, String> {
    Err(format!("bevy_texture_browser_source_unsupported:{id}"))
}

#[cfg(target_arch = "wasm32")]
pub use crate::browser_texture_web::{
    BrowserTexturePlugin, release_unclaimed_browser_texture_sources, stage_browser_images,
};
