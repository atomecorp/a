use crate::{animated_png::PngAnimationSource, texture::rounded_rect_signed_distance};
use image::{imageops, RgbaImage};

pub fn frame_pixels(
    mut frame: RgbaImage,
    size: [u32; 2],
    source: &PngAnimationSource,
) -> Result<Vec<u8>, String> {
    let [sx, sy, sw, sh] = source.source_rect;
    let [dx, dy, dw, dh] = source.destination_rect;
    if sx < 0.0
        || sy < 0.0
        || sw <= 0.0
        || sh <= 0.0
        || dw <= 0.0
        || dh <= 0.0
        || sx.round() >= frame.width() as f32
        || sy.round() >= frame.height() as f32
        || sx + sw > frame.width() as f32 + 1.0
        || sy + sh > frame.height() as f32 + 1.0
        || dx < 0.0
        || dy < 0.0
        || dx + dw > size[0] as f32 + 0.01
        || dy + dh > size[1] as f32 + 0.01
    {
        return Err("bevy_apng_fit_out_of_bounds".into());
    }
    // Resize premultiplied pixels, then restore straight alpha for Bevy's
    // source-over texture contract. This avoids dark fringes on transparent PNGs.
    for pixel in frame.pixels_mut() {
        for channel in 0..3 {
            pixel[channel] = ((u16::from(pixel[channel]) * u16::from(pixel[3]) + 127) / 255) as u8;
        }
    }
    let crop = imageops::crop_imm(
        &frame,
        sx.round() as u32,
        sy.round() as u32,
        (sw.round() as u32)
            .max(1)
            .min(frame.width() - sx.round() as u32),
        (sh.round() as u32)
            .max(1)
            .min(frame.height() - sy.round() as u32),
    );
    let resized = imageops::resize(
        &crop.to_image(),
        dw.round().max(1.0) as u32,
        dh.round().max(1.0) as u32,
        imageops::FilterType::Triangle,
    );
    let mut output = RgbaImage::new(size[0], size[1]);
    imageops::replace(&mut output, &resized, dx.round() as i64, dy.round() as i64);
    for (x, y, pixel) in output.enumerate_pixels_mut() {
        let alpha = u16::from(pixel[3]);
        if alpha > 0 {
            for channel in 0..3 {
                pixel[channel] =
                    ((u16::from(pixel[channel]) * 255 + alpha / 2) / alpha).min(255) as u8;
            }
        }
        if let Some(tint) = source.tint {
            for channel in 0..3 {
                pixel[channel] = (tint[channel] * 255.0).round() as u8;
            }
        }
        pixel[3] =
            (pixel[3] as f32 * source.opacity.unwrap_or(1.0) * source.tint.map_or(1.0, |t| t[3]))
                .round() as u8;
        if source.corner_radius > 0.0 {
            let distance = rounded_rect_signed_distance(
                x as f32 + 0.5,
                y as f32 + 0.5,
                size[0] as f32,
                size[1] as f32,
                [source.corner_radius; 4],
            );
            pixel[3] = (pixel[3] as f32 * (0.5 - distance).clamp(0.0, 1.0)).round() as u8;
        }
    }
    Ok(output.into_raw())
}
