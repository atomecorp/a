use bevy::{camera::ScalingMode, prelude::*};

use crate::types::{default_transform_origin, default_transform_scale};

pub const BEVY_LAYER_DEPTH_LIMIT: f32 = 900.0;

pub fn color_from_rgba(color: [f32; 4]) -> Color {
    Color::srgba(color[0], color[1], color[2], color[3])
}

pub fn depth_for_layer(layer: i32) -> f32 {
    (layer as f32).clamp(-BEVY_LAYER_DEPTH_LIMIT, BEVY_LAYER_DEPTH_LIMIT)
}

pub fn atome_camera_projection(surface_width: f32, surface_height: f32) -> Projection {
    Projection::Orthographic(OrthographicProjection {
        scaling_mode: ScalingMode::Fixed {
            width: surface_width.max(1.0),
            height: surface_height.max(1.0),
        },
        ..OrthographicProjection::default_2d()
    })
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
    atome_rect_transform_with_local(
        x,
        y,
        width,
        height,
        surface_width,
        surface_height,
        z,
        default_transform_scale(),
        0.0,
        default_transform_origin(),
    )
}

pub fn atome_rect_transform_with_local(
    x: f32,
    y: f32,
    width: f32,
    height: f32,
    surface_width: f32,
    surface_height: f32,
    z: f32,
    scale: [f32; 2],
    rotation_degrees: f32,
    origin: [f32; 2],
) -> Transform {
    let base_translation = Vec3::new(
        x + width / 2.0 - surface_width / 2.0,
        surface_height / 2.0 - y - height / 2.0,
        z,
    );
    let scale_x = if scale[0].is_finite() { scale[0] } else { 1.0 };
    let scale_y = if scale[1].is_finite() { scale[1] } else { 1.0 };
    let rotation = if rotation_degrees.is_finite() {
        Quat::from_rotation_z(-rotation_degrees.to_radians())
    } else {
        Quat::IDENTITY
    };
    let origin_x = if origin[0].is_finite() {
        origin[0]
    } else {
        0.0
    };
    let origin_y = if origin[1].is_finite() {
        origin[1]
    } else {
        0.0
    };
    let local_origin = Vec3::new(
        (origin_x - 0.5) * width.max(1.0),
        (0.5 - origin_y) * height.max(1.0),
        0.0,
    );
    let transformed_origin =
        rotation * Vec3::new(local_origin.x * scale_x, local_origin.y * scale_y, 0.0);
    let mut transform =
        Transform::from_translation(base_translation + local_origin - transformed_origin);
    transform.rotation = rotation;
    transform.scale = Vec3::new(scale_x, scale_y, 1.0);
    transform
}
