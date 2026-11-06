// An atome's spatial mask drawn on the GPU (spatial_mask_gpu.rs), byte for byte the textures `shape_texture.rs`
// bakes on the CPU: the mask's coverage in its target's coordinates (`mask_texture_for_target`), the product of every
// layer's own coverage (each placed by its own transforms, or stretched over the target), rounded to a byte; and,
// when a source is cut by it (`apply_spatial_mask_to_texture`), that source's alpha byte times the coverage byte of
// the nearest coverage texel, divided by 255 — a silhouette's mask (white) or a texture (its colours kept).
// The pass writes the bytes through a plain (non-sRGB) view of an sRGB texture, so colours cross untouched.
#import bevy_core_pipeline::fullscreen_vertex_shader::FullscreenVertexOutput
#import atome::shape_sdf::{Silhouette, coverage}

struct SpatialMask {
    // x, y: the output's texels; z, w: the coverage texture's texels (the mask's target).
    sizes: vec4<f32>,
    // x: the source (0 the coverage alone, 1 a silhouette, 2 a texture); y: the layers' count.
    source: vec4<f32>,
    // The source silhouette (source 1).
    shape: vec4<f32>,
    radii: vec4<f32>,
    geometry: vec4<f32>,
}

@group(0) @binding(0) var<uniform> job: SpatialMask;
// One row per layer, ENTRY_TEXELS texels each (spatial_mask_gpu.rs#layer_texels).
@group(0) @binding(1) var layers: texture_2d<f32>;
// Every layer's alpha bitmap, one after another, read as a line wrapped at ALPHA_WIDTH texels.
@group(0) @binding(2) var alpha_bitmaps: texture_2d<f32>;
// The texture cut (source 2), read through its plain view.
@group(0) @binding(3) var source_texture: texture_2d<f32>;

const ALPHA_WIDTH: u32 = 2048u;
const DEGREES: f32 = 0.017453292;
// A point no scale reaches (the CPU writes f32::MAX): outside every silhouette and bitmap alike. Not f32::MAX
// itself, which naga writes back as a decimal the browser refuses.
const FAR: f32 = 1e30;
const EPSILON: f32 = 1.1920929e-7;

fn layer(index: i32, texel: i32) -> vec4<f32> {
    return textureLoad(layers, vec2<i32>(texel, index), 0);
}

fn turned(point: vec2<f32>, degrees: f32) -> vec2<f32> {
    let angle = degrees * DEGREES;
    return vec2<f32>(point.x * cos(angle) - point.y * sin(angle), point.x * sin(angle) + point.y * cos(angle));
}

fn alpha_at(offset: f32, width: f32, x: f32, y: f32) -> f32 {
    let index = u32(offset) + u32(y) * u32(width) + u32(x);
    return textureLoad(alpha_bitmaps, vec2<u32>(index % ALPHA_WIDTH, index / ALPHA_WIDTH), 0).r;
}

// One layer's own coverage at `target_point` of a target of `target_dims` texels (shape_texture.rs#resolved_mask_coverage).
fn own_coverage(index: i32, target_point: vec2<f32>, target_dims: vec2<f32>) -> f32 {
    let flags = layer(index, 0);
    let extent = layer(index, 1);
    let more = layer(index, 2);
    let silhouette = Silhouette(vec4<f32>(extent.xy, flags.z, flags.w), layer(index, 3), vec4<f32>(extent.zw, more.x, 0.0));
    let size = max(extent.xy, vec2<f32>(1.0));
    let bitmap = vec2<f32>(more.z, more.w);
    if (flags.x < 0.5) {
        let stretched = target_point * size / target_dims;
        if (flags.y > 0.5) {
            let x = clamp(floor(stretched.x), 0.0, bitmap.x - 1.0);
            let y = clamp(floor(stretched.y), 0.0, bitmap.y - 1.0);
            return alpha_at(more.y, bitmap.x, x, y);
        }
        return coverage(silhouette, stretched);
    }
    // Placed: the target's point in the world (its transforms), then in the source's box (the inverse of its own).
    let target_moves = layer(index, 4);
    let target_turn = layer(index, 5);
    let source_moves = layer(index, 6);
    let origins = layer(index, 7);
    let target_size = max(origins.zw, vec2<f32>(1.0));
    let target_pivot = target_size * target_turn.yz;
    let world = target_moves.xy + target_pivot + turned((target_point - target_pivot) * target_moves.zw, target_turn.x);
    let source_pivot = size * origins.xy;
    let relative = turned(world - source_moves.xy - source_pivot, -target_turn.w);
    var unscaled = vec2<f32>(FAR);
    if (abs(source_moves.z) > EPSILON) {
        unscaled.x = relative.x / source_moves.z;
    }
    if (abs(source_moves.w) > EPSILON) {
        unscaled.y = relative.y / source_moves.w;
    }
    let placed = unscaled + source_pivot;
    if (flags.y > 0.5) {
        if (placed.x < 0.0 || placed.y < 0.0 || placed.x >= bitmap.x || placed.y >= bitmap.y) {
            return 0.0;
        }
        return alpha_at(more.y, bitmap.x, floor(placed.x), floor(placed.y));
    }
    return coverage(silhouette, placed);
}

fn to_byte(value: f32) -> u32 {
    return u32(floor(clamp(value, 0.0, 1.0) * 255.0 + 0.5));
}

@fragment
fn masked(in: FullscreenVertexOutput) -> @location(0) vec4<f32> {
    let pixel = floor(in.position.xy);
    let out_size = job.sizes.xy;
    let mask_size = job.sizes.zw;
    let mask_texel = clamp(floor((pixel + vec2<f32>(0.5)) * mask_size / out_size), vec2<f32>(0.0), mask_size - vec2<f32>(1.0));
    let target_point = mask_texel + vec2<f32>(0.5);
    var resolved = 1.0;
    for (var index = 0; index < i32(job.source.y); index += 1) {
        resolved = resolved * own_coverage(index, target_point, mask_size);
    }
    let mask_byte = to_byte(resolved);
    let kind = i32(job.source.x + 0.5);
    if (kind == 0) {
        return vec4<f32>(1.0, 1.0, 1.0, f32(mask_byte) / 255.0);
    }
    if (kind == 1) {
        let silhouette = Silhouette(job.shape, job.radii, job.geometry);
        let own = to_byte(coverage(silhouette, pixel + vec2<f32>(0.5)));
        return vec4<f32>(1.0, 1.0, 1.0, f32(own * mask_byte / 255u) / 255.0);
    }
    let texel = textureLoad(source_texture, vec2<i32>(pixel), 0);
    let own = to_byte(texel.a);
    return vec4<f32>(texel.rgb, f32(own * mask_byte / 255u) / 255.0);
}
