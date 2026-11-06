// A silhouette's signed distance on the GPU: the distances of `shape_sdf.rs` (rounded rectangle, ellipse, star,
// regular polygon, the vertices rounded), written again here once for every pass that cuts by a silhouette — a
// shape's own mask (`shape_silhouette.wgsl`) and a spatial mask's sources (`spatial_mask.wgsl`).
// `tests/rendering/shape_mask_gpu_twin.rs` and `tests/rendering/spatial_mask_gpu_twin.rs` keep both in step.
#define_import_path atome::shape_sdf

struct Silhouette {
    // x, y: the silhouette's box (px); z: its variant (0 rectangle, 1 ellipse, 2 star, 3 polygon); w: vertex rounding.
    shape: vec4<f32>,
    // The rectangle's corner radii: top left, top right, bottom right, bottom left.
    radii: vec4<f32>,
    // x: the star's branches, y: its inner radius (share of the outer), z: the polygon's sides.
    geometry: vec4<f32>,
}

const TAU: f32 = 6.283185307179586;

fn rounded_rect_distance(p: vec2<f32>, size: vec2<f32>, radii: vec4<f32>) -> f32 {
    let half = size * 0.5;
    let left = p.x < half.x;
    let top = p.y < half.y;
    var radius = radii.z;
    if (left && top) {
        radius = radii.x;
    } else if (!left && top) {
        radius = radii.y;
    } else if (left && !top) {
        radius = radii.w;
    }
    radius = min(min(max(radius, 0.0), size.x * 0.5), size.y * 0.5);
    let d = abs(p - half) - (half - vec2<f32>(radius));
    let outside = length(max(d, vec2<f32>(0.0)));
    return outside + min(max(d.x, d.y), 0.0) - radius;
}

fn segment_distance(p: vec2<f32>, a: vec2<f32>, b: vec2<f32>) -> f32 {
    let ab = b - a;
    let length_squared = dot(ab, ab);
    var t = 0.0;
    if (length_squared > 1.1920929e-7) {
        t = clamp(dot(p - a, ab) / length_squared, 0.0, 1.0);
    }
    return length(p - (a + ab * t));
}

// One edge of a closed contour, shortened by `rounding` at both ends, each vertex a disc of that radius.
fn rounded_edge_distance(p: vec2<f32>, a: vec2<f32>, b: vec2<f32>, rounding_in: f32) -> f32 {
    let rounding = max(rounding_in, 0.0);
    let ab = b - a;
    let edge = length(ab);
    if (edge <= 1.1920929e-7) {
        return 3.4e38;
    }
    let direction = ab / edge;
    let trim = min(rounding, edge * 0.5);
    let start = a + direction * trim;
    let end = b - direction * trim;
    let along = end - start;
    let side = along.x * (p - start).y - along.y * (p - start).x;
    let distance = segment_distance(p, start, end);
    var best = distance;
    if (side > 0.0) {
        best = -distance;
    }
    if (rounding > 0.0) {
        best = min(best, length(p - a) - rounding);
        best = min(best, length(p - b) - rounding);
    }
    return best;
}

// The point folded into one sector of the `branches`-fold symmetry, on the first peak's side. Returns the folded
// point and the sector's half angle.
fn folded_sector(p: vec2<f32>, branches: f32) -> vec3<f32> {
    let n = max(branches, 3.0);
    let sector = TAU / n;
    let half = sector * 0.5;
    let angle = atan2(p.y, p.x);
    let shifted = angle + half;
    let folded = shifted - sector * floor(shifted / sector) - half;
    let radius = length(p);
    return vec3<f32>(radius * cos(folded), abs(radius * sin(folded)), half);
}

fn signed_distance(silhouette: Silhouette, p: vec2<f32>) -> f32 {
    let size = max(silhouette.shape.xy, vec2<f32>(1.0));
    let variant = i32(silhouette.shape.z + 0.5);
    if (variant == 0) {
        return rounded_rect_distance(p, size, silhouette.radii);
    }
    // The shape's frame: the image goes down, the frame up, the first peak pointing to the top of the screen.
    let local = vec2<f32>(-(p.y - size.y * 0.5), p.x - size.x * 0.5);
    let radius = min(size.x, size.y) * 0.5;
    if (variant == 1) {
        let vertical = size.y * 0.5;
        let horizontal = size.x * 0.5;
        let scaled = length(vec2<f32>(local.x / vertical, local.y / horizontal)) - 1.0;
        return scaled * min(vertical, horizontal);
    }
    if (variant == 2) {
        let folded = folded_sector(local, silhouette.geometry.x);
        let inner = radius * silhouette.geometry.y;
        let tip = vec2<f32>(radius, 0.0);
        let notch = vec2<f32>(inner * cos(folded.z), inner * abs(sin(folded.z)));
        return rounded_edge_distance(folded.xy, tip, notch, silhouette.shape.w);
    }
    let folded = folded_sector(local, silhouette.geometry.z);
    let vertex = vec2<f32>(radius, 0.0);
    let apothem = radius * cos(folded.z);
    let neighbour = vec2<f32>(apothem * cos(folded.z), abs(apothem * sin(folded.z)));
    return rounded_edge_distance(folded.xy, vertex, neighbour, silhouette.shape.w);
}

// The silhouette's coverage at `p`: `shape_sdf.rs#coverage`, the half-pixel ramp of its contour.
fn coverage(silhouette: Silhouette, p: vec2<f32>) -> f32 {
    return clamp(0.5 - signed_distance(silhouette, p), 0.0, 1.0);
}
