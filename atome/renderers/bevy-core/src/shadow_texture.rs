use crate::shape_sdf::AtomeShapeSilhouette;
use crate::texture::AtomeCornerRadii;
use crate::types::{AtomeShadowKind, AtomeShadowStyle};

/// La silhouette d'un rectangle arrondi : ce que TOUTES les ombres etaient avant
/// l'outil Shape, et ce que restent celles des medias, du texte et du son.
fn rect_silhouette(width: f32, height: f32, corner_radii: AtomeCornerRadii) -> AtomeShapeSilhouette {
    AtomeShapeSilhouette::rect(width, height, corner_radii)
}

const GAUSSIAN_SIGMA_RATIO: f32 = 0.5;
const GAUSSIAN_TAIL_SIGMAS: f32 = 3.0;

pub(crate) fn channel_to_u8(value: f32) -> u8 {
    (value.clamp(0.0, 1.0) * 255.0).round() as u8
}

pub(crate) fn shadow_padding(blur: f32) -> u32 {
    let sigma = blur.max(0.0) * GAUSSIAN_SIGMA_RATIO;
    (sigma * GAUSSIAN_TAIL_SIGMAS).ceil() as u32
}

fn gaussian_kernel(blur: f32) -> Vec<f32> {
    let sigma = blur.max(0.0) * GAUSSIAN_SIGMA_RATIO;
    let radius = shadow_padding(blur) as i32;
    let mut weights = Vec::with_capacity((radius * 2 + 1) as usize);
    let mut total = 0.0;
    for offset in -radius..=radius {
        let distance = offset as f32;
        let weight = (-0.5 * (distance / sigma).powi(2)).exp();
        weights.push(weight);
        total += weight;
    }
    weights.iter_mut().for_each(|weight| *weight /= total);
    weights
}

/// Index range `[start, end)` of outputs whose tap `index` samples inside
/// `0..len`: `output + index - radius` must lie in `0..len`.
fn tap_range(index: usize, radius: usize, len: usize) -> Option<(usize, usize)> {
    let start = radius.saturating_sub(index);
    let end = (len + radius).saturating_sub(index).min(len);
    (start < end).then_some((start, end))
}

/// Separable gaussian pass. Taps are applied one at a time over contiguous
/// runs: every output still sums exactly the same in-range terms in the same
/// order (kernel index ascending, out-of-range taps skipped), so the result is
/// bit-identical to the per-pixel form, without a bounds test per tap. The
/// per-pixel form made the first opening of a shadowed panel freeze for
/// ~400 ms on the main thread (WASM).
///
/// A row (horizontal pass) or a column (vertical pass) identical, bit for bit,
/// to its neighbour gives an identical output, so it is computed once and
/// copied. A rounded rectangle — every panel, card and button shadow — is
/// identical along its straight edges: the work drops from the shadow's area to
/// its corners and borders (a panel shell stacks three blurs of up to 119 taps).
fn convolve_axis(source: &[f32], width: usize, height: usize, kernel: &[f32], horizontal: bool) -> Vec<f32> {
    let radius = kernel.len() / 2;
    let mut result = vec![0.0_f32; source.len()];
    if width == 0 || height == 0 {
        return result;
    }
    if horizontal {
        let mut computed: Option<usize> = None;
        for y in 0..height {
            let row = &source[y * width..(y + 1) * width];
            if let Some(previous) = computed {
                if same_bits(row, &source[previous * width..(previous + 1) * width]) {
                    result.copy_within(previous * width..(previous + 1) * width, y * width);
                    continue;
                }
            }
            convolve_row(row, &mut result[y * width..(y + 1) * width], kernel, radius);
            computed = Some(y);
        }
        return result;
    }
    // Columns equal to their left neighbour on every row share its output.
    let mut repeats = vec![true; width];
    repeats[0] = false;
    for row in source.chunks_exact(width) {
        for x in 1..width {
            if repeats[x] && row[x].to_bits() != row[x - 1].to_bits() {
                repeats[x] = false;
            }
        }
    }
    let distinct: Vec<usize> = (0..width).filter(|&x| !repeats[x]).collect();
    if distinct.len() == width {
        convolve_columns(source, &mut result, width, height, kernel, radius);
        return result;
    }
    let compact_width = distinct.len();
    let mut compact = vec![0.0_f32; compact_width * height];
    for (row, out) in source.chunks_exact(width).zip(compact.chunks_exact_mut(compact_width)) {
        for (value, &x) in out.iter_mut().zip(&distinct) {
            *value = row[x];
        }
    }
    let mut compact_result = vec![0.0_f32; compact.len()];
    convolve_columns(&compact, &mut compact_result, compact_width, height, kernel, radius);
    let mut next = 0;
    let owners: Vec<usize> = repeats.iter().map(|&repeat| {
        if !repeat {
            next += 1;
        }
        next - 1
    }).collect();
    for (out, compact_row) in result.chunks_exact_mut(width).zip(compact_result.chunks_exact(compact_width)) {
        for (value, &owner) in out.iter_mut().zip(&owners) {
            *value = compact_row[owner];
        }
    }
    result
}

fn same_bits(a: &[f32], b: &[f32]) -> bool {
    a.iter().zip(b).all(|(x, y)| x.to_bits() == y.to_bits())
}

fn convolve_row(row: &[f32], out: &mut [f32], kernel: &[f32], radius: usize) {
    let width = row.len();
    for (index, &weight) in kernel.iter().enumerate() {
        let Some((start, end)) = tap_range(index, radius, width) else { continue };
        let shifted = &row[start + index - radius..end + index - radius];
        for (value, sample) in out[start..end].iter_mut().zip(shifted) {
            *value += sample * weight;
        }
    }
}

fn convolve_columns(source: &[f32], result: &mut [f32], width: usize, height: usize, kernel: &[f32], radius: usize) {
    for (index, &weight) in kernel.iter().enumerate() {
        let Some((start, end)) = tap_range(index, radius, height) else { continue };
        for y in start..end {
            let sample_y = y + index - radius;
            let samples = &source[sample_y * width..(sample_y + 1) * width];
            for (value, sample) in result[y * width..(y + 1) * width].iter_mut().zip(samples) {
                *value += sample * weight;
            }
        }
    }
}

/// Builds a shadow from the alpha that is actually painted after masking.
/// This is the path used by masked atoms: deriving it from the pre-mask
/// rectangle would bring back a rectangular shadow around a star/circle mask.
pub(crate) fn build_shadow_texture_rgba_for_alpha(
    source_rgba: &[u8],
    source_width: u32,
    source_height: u32,
    shadow: AtomeShadowStyle,
) -> Option<(u32, u32, Vec<u8>)> {
    if source_width == 0 || source_height == 0 || shadow.color[3] <= 0.0 {
        return None;
    }
    let blur_padding = if shadow.kind == AtomeShadowKind::Drop { shadow_padding(shadow.blur) } else { 0 };
    let spread_padding = shadow.spread.max(0.0).ceil() as u32;
    let padding = blur_padding.max(spread_padding) as usize;
    let width = source_width as usize + padding * 2;
    let height = source_height as usize + padding * 2;
    let mut base = vec![0.0; width * height];
    for y in 0..source_height as usize {
        for x in 0..source_width as usize {
            let source_offset = (y * source_width as usize + x) * 4 + 3;
            if source_offset < source_rgba.len() {
                base[(y + padding) * width + x + padding] = source_rgba[source_offset] as f32 / 255.0;
            }
        }
    }
    let alpha = if shadow.kind == AtomeShadowKind::Drop && shadow.blur > 0.0 {
        let kernel = gaussian_kernel(shadow.blur);
        let horizontal = convolve_axis(&base, width, height, &kernel, true);
        convolve_axis(&horizontal, width, height, &kernel, false)
    } else if spread_padding > 0 {
        let radius = spread_padding as isize;
        let mut grown = vec![0.0_f32; width * height];
        for y in 0..height {
            for x in 0..width {
                let mut value = 0.0_f32;
                for dy in -radius..=radius {
                    for dx in -radius..=radius {
                        let sx = x as isize + dx;
                        let sy = y as isize + dy;
                        if sx >= 0 && sy >= 0 && sx < width as isize && sy < height as isize {
                            value = value.max(base[sy as usize * width + sx as usize]);
                        }
                    }
                }
                grown[y * width + x] = if shadow.invert {
                    value * (1.0 - base[y * width + x])
                } else {
                    value
                };
            }
        }
        grown
    } else {
        base
    };
    let mut rgba = vec![0; width * height * 4];
    for (index, value) in alpha.into_iter().enumerate() {
        let offset = index * 4;
        rgba[offset] = channel_to_u8(shadow.color[0]);
        rgba[offset + 1] = channel_to_u8(shadow.color[1]);
        rgba[offset + 2] = channel_to_u8(shadow.color[2]);
        let cutout = if shadow.kind == AtomeShadowKind::Drop {
            let x = index % width;
            let y = index / width;
            let owner_x = x as f32 - padding as f32 + shadow.offset_x - shadow.spread;
            let owner_y = y as f32 - padding as f32 + shadow.offset_y - shadow.spread;
            if owner_x >= 0.0 && owner_y >= 0.0
                && owner_x < source_width as f32 && owner_y < source_height as f32 {
                source_rgba[(owner_y as usize * source_width as usize + owner_x as usize) * 4 + 3] as f32 / 255.0
            } else { 0.0 }
        } else { 0.0 };
        rgba[offset + 3] = channel_to_u8(shadow.color[3] * value * (1.0 - cutout));
    }
    Some((width as u32, height as u32, rgba))
}

/// La meme ombre portee, mais pour une silhouette quelconque : une etoile
/// projette une ombre d'etoile, un polygone une ombre de polygone.
pub(crate) fn build_gaussian_shadow_texture_rgba_for_silhouette(
    silhouette: &AtomeShapeSilhouette,
    color: [f32; 4],
    blur: f32,
    owner_cutout: Option<(&AtomeShapeSilhouette, [f32; 2])>,
) -> Option<(u32, u32, Vec<u8>)> {
    let (width, height) = (silhouette.width, silhouette.height);
    // Blur the complete shadow silhouette first. Knock out the owner afterwards,
    // in owner coordinates: its hole must not travel with a shifted shadow.
    if color[3] <= 0.0 {
        return None;
    }
    let blur = blur.max(0.0);
    let padding = shadow_padding(blur) as usize;
    let shape_width = width.max(1.0);
    let shape_height = height.max(1.0);
    let image_width = shape_width.ceil() as usize + padding * 2;
    let image_height = shape_height.ceil() as usize + padding * 2;
    let mut mask = vec![0.0; image_width * image_height];
    for py in 0..image_height {
        let y = py as f32 + 0.5 - padding as f32;
        for px in 0..image_width {
            let x = px as f32 + 0.5 - padding as f32;
            let distance = silhouette.signed_distance(x, y);
            mask[py * image_width + px] = (0.5 - distance).clamp(0.0, 1.0);
        }
    }
    let alpha = if blur > 0.0 {
        let kernel = gaussian_kernel(blur);
        let horizontal = convolve_axis(&mask, image_width, image_height, &kernel, true);
        convolve_axis(&horizontal, image_width, image_height, &kernel, false)
    } else {
        // Sans flou, la rampe d'un demi-pixel deja presente dans le masque suffit :
        // elle est l'antialiasing du contour, exactement comme le bloc.
        mask.clone()
    };
    let rgb = [channel_to_u8(color[0]), channel_to_u8(color[1]), channel_to_u8(color[2])];
    let mut rgba = vec![0; image_width * image_height * 4];
    for (index, value) in alpha.iter().enumerate() {
        let offset = index * 4;
        let visible_alpha = owner_cutout.map_or(*value, |(owner, offset)| {
            let x = (index % image_width) as f32 + 0.5 - padding as f32 + offset[0];
            let y = (index / image_width) as f32 + 0.5 - padding as f32 + offset[1];
            value * (owner.signed_distance(x, y) + 0.5).clamp(0.0, 1.0)
        });
        rgba[offset..offset + 3].copy_from_slice(&rgb);
        rgba[offset + 3] = channel_to_u8(color[3] * visible_alpha);
    }
    Some((image_width as u32, image_height as u32, rgba))
}

/// The HARD silhouette of the block shadow: no gaussian, no sigma, no blur.
///
/// `invert` asks for the inner shadow: the band BETWEEN the silhouette grown by
/// `spread` and the silhouette itself. With no spread there is no band, which is
/// exactly what an inner shadow with neither blur nor spread is: invisible.
pub fn build_block_shadow_texture_rgba(
    color: [f32; 4],
    width: f32,
    height: f32,
    corner_radii: AtomeCornerRadii,
    spread: f32,
    invert: bool,
) -> Option<(u32, u32, Vec<u8>)> {
    build_block_shadow_texture_rgba_for_silhouette(
        &rect_silhouette(width, height, corner_radii),
        color,
        spread,
        invert,
    )
}

/// La meme silhouette DURE, pour une forme quelconque : l'ombre d'une etoile a
/// ses pointes, et son `invert` decoupe le meme contour.
pub(crate) fn build_block_shadow_texture_rgba_for_silhouette(
    silhouette: &AtomeShapeSilhouette,
    color: [f32; 4],
    spread: f32,
    invert: bool,
) -> Option<(u32, u32, Vec<u8>)> {
    let (width, height, corner_radii) =
        (silhouette.width, silhouette.height, silhouette.corner_radii);
    if color[3] <= 0.0 {
        return None;
    }
    let padding = spread.max(0.0).ceil() as usize;
    let shape_width = width.max(1.0);
    let shape_height = height.max(1.0);
    let image_width = shape_width.ceil() as usize + padding * 2;
    let image_height = shape_height.ceil() as usize + padding * 2;
    let grown_width = shape_width + padding as f32 * 2.0;
    let grown_height = shape_height + padding as f32 * 2.0;
    let grown_radii = corner_radii.map(|radius| radius.max(0.0) + padding as f32);
    // Les deux silhouettes de la bande inversee : celle qui a grandi de `spread`
    // et l'objet lui-meme, decale du meme rembourrage.
    let grown = AtomeShapeSilhouette {
        width: grown_width,
        height: grown_height,
        corner_radii: grown_radii,
        geometry: silhouette.geometry,
    };
    let mut rgba = vec![0; image_width * image_height * 4];
    let mut painted = false;
    for py in 0..image_height {
        // The texture IS the grown silhouette: its own frame starts at the
        // grown rect's origin, and the object sits `padding` inside it.
        let y = py as f32 + 0.5;
        for px in 0..image_width {
            let x = px as f32 + 0.5;
            let outer = grown.signed_distance(x, y);
            let visible = if invert {
                // The interior of the object is its own hole: only the band the
                // spread grows around it is painted. Both rects share the same
                // centre, so the inner one is simply recessed by the padding.
                outer <= 0.0
                    && silhouette.signed_distance(x - padding as f32, y - padding as f32) >= 0.0
            } else {
                outer <= 0.0
            };
            if !visible {
                continue;
            }
            painted = true;
            let offset = (py * image_width + px) * 4;
            rgba[offset] = channel_to_u8(color[0]);
            rgba[offset + 1] = channel_to_u8(color[1]);
            rgba[offset + 2] = channel_to_u8(color[2]);
            rgba[offset + 3] = channel_to_u8(color[3]);
        }
    }
    if !painted {
        return None;
    }
    Some((image_width as u32, image_height as u32, rgba))
}

pub(crate) fn build_gaussian_shadow_texture_rgba(
    color: [f32; 4],
    width: f32,
    height: f32,
    corner_radii: AtomeCornerRadii,
    blur: f32,
) -> Option<(u32, u32, Vec<u8>)> {
    build_gaussian_shadow_texture_rgba_for_silhouette(
        &rect_silhouette(width, height, corner_radii), color, blur, None,
    )
}

pub fn build_gaussian_outer_shadow_texture_rgba(
    color: [f32; 4],
    width: f32,
    height: f32,
    corner_radii: AtomeCornerRadii,
    blur: f32,
) -> Option<(u32, u32, Vec<u8>)> {
    build_gaussian_outer_shadow_texture_rgba_for_silhouette(
        &rect_silhouette(width, height, corner_radii),
        color,
        blur,
    )
}

pub(crate) fn build_gaussian_outer_shadow_texture_rgba_for_silhouette(
    silhouette: &AtomeShapeSilhouette,
    color: [f32; 4],
    blur: f32,
) -> Option<(u32, u32, Vec<u8>)> {
    let (width, height) = (silhouette.width, silhouette.height);
    if blur <= 0.0 || color[3] <= 0.0 {
        return None;
    }
    let padding = shadow_padding(blur) as usize;
    let shape_width = width.max(1.0);
    let shape_height = height.max(1.0);
    let image_width = shape_width.ceil() as usize + padding * 2;
    let image_height = shape_height.ceil() as usize + padding * 2;
    let sigma = blur.max(0.001) * GAUSSIAN_SIGMA_RATIO;
    let mut rgba = vec![0; image_width * image_height * 4];
    for py in 0..image_height {
        let y = py as f32 + 0.5 - padding as f32;
        for px in 0..image_width {
            let x = px as f32 + 0.5 - padding as f32;
            let distance = silhouette.signed_distance(x, y);
            // The owner paints the interior. Rendering only outside the exact
            // silhouette gives the halo a visible contact edge without a
            // spread-created gap or any change to the owner's fill.
            let exterior_alpha = if distance >= 0.0 {
                (-0.5 * (distance / sigma).powi(2)).exp()
            } else {
                0.0
            };
            let offset = (py * image_width + px) * 4;
            rgba[offset] = channel_to_u8(color[0]);
            rgba[offset + 1] = channel_to_u8(color[1]);
            rgba[offset + 2] = channel_to_u8(color[2]);
            rgba[offset + 3] = channel_to_u8(color[3] * exterior_alpha);
        }
    }
    Some((image_width as u32, image_height as u32, rgba))
}

#[cfg(test)]
#[path = "../../../../tests/rendering/shadow_texture_convolution.rs"]
mod convolution_equivalence_tests;
