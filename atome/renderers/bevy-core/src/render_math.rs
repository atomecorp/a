use bevy::prelude::*;

pub const BEVY_LAYER_DEPTH_LIMIT: f32 = 900.0;

pub fn color_from_rgba(color: [f32; 4]) -> Color {
    Color::srgba(color[0], color[1], color[2], color[3])
}

pub fn depth_for_layer(layer: i32) -> f32 {
    -(layer as f32).clamp(-BEVY_LAYER_DEPTH_LIMIT, BEVY_LAYER_DEPTH_LIMIT)
}

pub fn atome_rect_transform(
    x: f32,
    y: f32,
    width: f32,
    height: f32,
    surface_width: f32,
    surface_height: f32,
    z: f32,
) -> Transform {
    Transform::from_translation(Vec3::new(
        x + width / 2.0 - surface_width / 2.0,
        surface_height / 2.0 - y - height / 2.0,
        z,
    ))
}
