use crate::texture::rounded_rect_signed_distance;

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

fn convolve_axis(source: &[f32], width: usize, height: usize, kernel: &[f32], horizontal: bool) -> Vec<f32> {
    let radius = (kernel.len() / 2) as isize;
    let mut result = vec![0.0; source.len()];
    for y in 0..height {
        for x in 0..width {
            let mut alpha = 0.0;
            for (index, weight) in kernel.iter().enumerate() {
                let offset = index as isize - radius;
                let sample_x = if horizontal { x as isize + offset } else { x as isize };
                let sample_y = if horizontal { y as isize } else { y as isize + offset };
                if sample_x >= 0 && sample_x < width as isize && sample_y >= 0 && sample_y < height as isize {
                    alpha += source[sample_y as usize * width + sample_x as usize] * weight;
                }
            }
            result[y * width + x] = alpha;
        }
    }
    result
}

pub(crate) fn build_gaussian_shadow_texture_rgba(
    color: [f32; 4],
    width: f32,
    height: f32,
    corner_radius: f32,
    blur: f32,
) -> Option<(u32, u32, Vec<u8>)> {
    if blur <= 0.0 || color[3] <= 0.0 {
        return None;
    }
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
            let distance = rounded_rect_signed_distance(x, y, shape_width, shape_height, corner_radius);
            mask[py * image_width + px] = (0.5 - distance).clamp(0.0, 1.0);
        }
    }
    let kernel = gaussian_kernel(blur);
    let horizontal = convolve_axis(&mask, image_width, image_height, &kernel, true);
    let alpha = convolve_axis(&horizontal, image_width, image_height, &kernel, false);
    let mut rgba = vec![0; image_width * image_height * 4];
    for (index, value) in alpha.iter().enumerate() {
        let offset = index * 4;
        rgba[offset] = channel_to_u8(color[0]);
        rgba[offset + 1] = channel_to_u8(color[1]);
        rgba[offset + 2] = channel_to_u8(color[2]);
        rgba[offset + 3] = channel_to_u8(color[3] * value);
    }
    Some((image_width as u32, image_height as u32, rgba))
}
