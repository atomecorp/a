#import bevy_sprite::mesh2d_functions

// A media window: the Atome's quad erases the canvas down to full transparency
// (blend = destination-out) so the page element laid UNDER the canvas (an
// official player that WebGPU cannot sample) shows through it. Whatever is
// drawn later — an Atome above in z order, a menu, a panel — paints over the
// window as usual.

// The Atome's shape (its corner radii, its variant, its resolved mask) in the
// quad's UV space, the same contract as video_external.wgsl bindings 3-4. A
// window covering its whole box binds a 1x1 white mask: one path, no branch.
@group(2) @binding(0) var mask_texture: texture_2d<f32>;
@group(2) @binding(1) var mask_sampler: sampler;

struct Vertex {
    @builtin(instance_index) instance_index: u32,
    @location(0) position: vec3<f32>,
    @location(1) uv: vec2<f32>,
};

struct VertexOutput {
    @builtin(position) clip_position: vec4<f32>,
    @location(0) uv: vec2<f32>,
};

@vertex
fn vertex(vertex: Vertex) -> VertexOutput {
    var out: VertexOutput;
    let model = mesh2d_functions::get_world_from_local(vertex.instance_index);
    out.clip_position = mesh2d_functions::mesh2d_position_local_to_clip(
        model,
        vec4<f32>(vertex.position, 1.0)
    );
    out.uv = vertex.uv;
    return out;
}

// The output alpha is the coverage: the destination-out blend keeps
// `1 - coverage` of the canvas, so inside the shape it becomes (0,0,0,0) and
// the rounded edge is anti-aliased. Outside the shape nothing is written: what
// lies under the corners (wallpaper, Atomes below) stays.
@fragment
fn fragment(in: VertexOutput) -> @location(0) vec4<f32> {
    let coverage = clamp(textureSample(mask_texture, mask_sampler, in.uv).a, 0.0, 1.0);
    if (coverage <= 0.0) {
        discard;
    }
    return vec4<f32>(0.0, 0.0, 0.0, coverage);
}
