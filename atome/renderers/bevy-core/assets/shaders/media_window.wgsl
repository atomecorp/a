#import bevy_sprite::mesh2d_functions

// A media window: the Atome's quad writes full transparency (blend = replace)
// so the page element laid UNDER the canvas (an official player that WebGPU
// cannot sample) shows through it. Whatever is drawn later — an Atome above
// in z order, a menu, a panel — paints over the window as usual.

struct Vertex {
    @builtin(instance_index) instance_index: u32,
    @location(0) position: vec3<f32>,
    @location(1) uv: vec2<f32>,
};

struct VertexOutput {
    @builtin(position) clip_position: vec4<f32>,
};

@vertex
fn vertex(vertex: Vertex) -> VertexOutput {
    var out: VertexOutput;
    let model = mesh2d_functions::get_world_from_local(vertex.instance_index);
    out.clip_position = mesh2d_functions::mesh2d_position_local_to_clip(
        model,
        vec4<f32>(vertex.position, 1.0)
    );
    return out;
}

@fragment
fn fragment(in: VertexOutput) -> @location(0) vec4<f32> {
    return vec4<f32>(0.0, 0.0, 0.0, 0.0);
}
