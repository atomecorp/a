//! What a scene3d atome's pass (`gpu.rs`) draws at a time code, computed in the main world from the description
//! alone: the camera (the file's first, else one framed on the whole scene), the lights, and one draw per mesh
//! with its world matrix and material. Opaque meshes come first, blended ones after, the farthest first.

use std::f32::consts::{FRAC_PI_2, PI};
use std::sync::Arc;

use bevy::{image::Image, prelude::*};

use super::animate::{Scene3dTrack, framing, local_track, world_matrices};
use atome_usd::scene::{MAX_SCENE_LIGHTS, UsdLightKind, UsdNodeContent, UsdScene};

/// `Frame` of `scene3d.wgsl`: view-projection, camera, ambient, counts, then the lights (two vec4 each).
pub const FRAME_FLOATS: usize = 16 + 4 + 4 + 4 + MAX_SCENE_LIGHTS * 8;
/// `Draw` of `scene3d.wgsl`: model, normal matrix, base, emissive, params.
pub const DRAW_FLOATS: usize = 16 + 16 + 4 + 4 + 4;
/// The ambient light of the previous PBR path (Bevy's `AmbientLight` brightness 0.12 at unit exposure).
const AMBIENT: f32 = 0.12;
/// UsdGeomGprim's colour when nothing is bound: the schema's 18 % grey.
const DEFAULT_GREY: [f32; 3] = [0.18, 0.18, 0.18];

#[derive(Clone, Copy, Debug)]
enum ViewCamera {
    File {
        node: usize,
        fov: f32,
        near: f32,
    },
    Framed {
        transform: Transform,
        fov: f32,
        near: f32,
    },
}

/// The still part of a 3D view, made once when its scene arrives.
#[derive(Debug)]
pub struct Scene3dView {
    tracks: Vec<Scene3dTrack>,
    /// Turns a Z-up file Y-up.
    root: Mat4,
    camera: ViewCamera,
}

pub struct Scene3dDraw {
    pub mesh: usize,
    pub texture: Option<usize>,
    pub uniform: [f32; DRAW_FLOATS],
}

/// One image to draw again: its size is the image's, checked against the GPU image before drawing.
pub struct Scene3dJob {
    pub image: AssetId<Image>,
    pub size: [u32; 2],
    pub source: String,
    pub scene: Arc<UsdScene>,
    pub frame: [f32; FRAME_FLOATS],
    pub draws: Vec<Scene3dDraw>,
}

impl Scene3dView {
    pub fn new(scene: &UsdScene) -> Self {
        let root_rotation = if scene.z_up {
            Quat::from_rotation_x(-FRAC_PI_2)
        } else {
            Quat::IDENTITY
        };
        let file_camera =
            scene
                .nodes
                .iter()
                .enumerate()
                .find_map(|(node, prim)| match prim.content {
                    UsdNodeContent::Camera(index) => Some(ViewCamera::File {
                        node,
                        fov: scene.cameras[index].vertical_fov_radians,
                        near: scene.cameras[index].near,
                    }),
                    _ => None,
                });
        let camera = file_camera.unwrap_or_else(|| {
            let (transform, projection) = framing(scene, root_rotation);
            ViewCamera::Framed {
                transform,
                fov: projection.fov,
                near: projection.near,
            }
        });
        Self {
            tracks: scene
                .nodes
                .iter()
                .map(|node| Scene3dTrack(local_track(&node.local)))
                .collect(),
            root: Mat4::from_quat(root_rotation),
            camera,
        }
    }

    pub fn job(
        &self,
        scene: &Arc<UsdScene>,
        source: &str,
        image: AssetId<Image>,
        size: UVec2,
        time_code: f64,
    ) -> Scene3dJob {
        let world = world_matrices(scene, &self.tracks, self.root, time_code);
        let (eye, fov, near) = match self.camera {
            ViewCamera::File { node, fov, near } => (world[node], fov, near),
            ViewCamera::Framed {
                transform,
                fov,
                near,
            } => (transform.to_matrix(), fov, near),
        };
        let aspect = size.x as f32 / size.y.max(1) as f32;
        // Reverse Z with no far plane, as Bevy's perspective cameras: depth cleared to 0, nearer is greater.
        let projection = Mat4::perspective_infinite_reverse_rh(fov, aspect, near.max(1e-4));
        let view = eye.inverse();
        let eye_position = eye.w_axis.truncate();
        let forward = -eye.z_axis.truncate().normalize_or_zero();
        let mut frame = [0f32; FRAME_FLOATS];
        frame[..16].copy_from_slice(&(projection * view).to_cols_array());
        frame[16..19].copy_from_slice(&eye_position.to_array());
        frame[20..23].copy_from_slice(&[AMBIENT; 3]);
        let lights = scene_lights(scene, &world, forward);
        frame[24] = lights.len() as f32;
        for (index, (position, color)) in lights.iter().enumerate() {
            let at = 28 + index * 8;
            frame[at..at + 4].copy_from_slice(&position.to_array());
            frame[at + 4..at + 7].copy_from_slice(&color.to_array());
        }
        let mut draws: Vec<(bool, f32, Scene3dDraw)> = scene
            .nodes
            .iter()
            .enumerate()
            .filter_map(|(node, prim)| match prim.content {
                UsdNodeContent::Mesh(mesh) => Some(mesh_draw(scene, mesh, world[node], view)),
                _ => None,
            })
            .collect();
        draws.sort_by(|a, b| a.0.cmp(&b.0).then(a.1.total_cmp(&b.1)));
        Scene3dJob {
            image,
            size: [size.x, size.y],
            source: source.to_string(),
            scene: scene.clone(),
            frame,
            draws: draws.into_iter().map(|(_, _, draw)| draw).collect(),
        }
    }
}

/// Each light as (toward the light or its position, radiance factor), with the factor that gives the previous
/// PBR path's result at unit exposure: a white diffuse surface facing a distant light of intensity `I` shows `I`.
/// No light in the file: the viewer's light from the camera, as USD viewers do.
fn scene_lights(scene: &UsdScene, world: &[Mat4], forward: Vec3) -> Vec<(Vec4, Vec3)> {
    if scene.lights.is_empty() {
        return vec![((-forward).extend(0.0), Vec3::ONE)];
    }
    scene
        .nodes
        .iter()
        .enumerate()
        .filter_map(|(node, prim)| match prim.content {
            UsdNodeContent::Light(index) => Some((world[node], scene.lights[index])),
            _ => None,
        })
        .take(MAX_SCENE_LIGHTS)
        .map(|(matrix, light)| {
            let color = Vec3::from_array(light.color) * light.intensity;
            let position = matrix.w_axis.truncate().extend(1.0);
            match light.kind {
                // A distant light shines along its -Z.
                UsdLightKind::Distant => (
                    matrix
                        .transform_vector3(Vec3::Z)
                        .normalize_or_zero()
                        .extend(0.0),
                    color,
                ),
                UsdLightKind::Sphere { radius } | UsdLightKind::Disk { radius } => {
                    (position, color * radius * radius)
                }
                UsdLightKind::Rect { width, height } => {
                    (position, color * width * height / (PI * PI))
                }
            }
        })
        .collect()
}

/// (blended, view depth for the sort, draw).
fn mesh_draw(scene: &UsdScene, index: usize, model: Mat4, view: Mat4) -> (bool, f32, Scene3dDraw) {
    let mesh = &scene.meshes[index];
    let material = mesh
        .material
        .and_then(|material| scene.materials.get(material));
    let (base, opacity, emissive, metallic, roughness, texture) = match material {
        Some(material) => (
            material.base_color,
            material.opacity,
            material.emissive,
            material.metallic,
            material.roughness,
            material.base_color_texture.filter(|_| mesh.uvs.is_some()),
        ),
        None => (
            mesh.display_color.unwrap_or(DEFAULT_GREY),
            1.0,
            [0.0; 3],
            0.0,
            0.5,
            None,
        ),
    };
    let blended = opacity < 1.0;
    let mut uniform = [0f32; DRAW_FLOATS];
    uniform[..16].copy_from_slice(&model.to_cols_array());
    uniform[16..32].copy_from_slice(&model.inverse().transpose().to_cols_array());
    uniform[32..36].copy_from_slice(&[base[0], base[1], base[2], opacity]);
    uniform[36..40].copy_from_slice(&[emissive[0], emissive[1], emissive[2], metallic]);
    uniform[40] = roughness;
    uniform[41] = f32::from(u8::from(mesh.double_sided));
    uniform[42] = f32::from(u8::from(blended));
    // Farthest first among blended meshes: the most negative view-space z.
    let depth = (view * model).w_axis.z;
    (
        blended,
        if blended { depth } else { 0.0 },
        Scene3dDraw {
            mesh: index,
            texture,
            uniform,
        },
    )
}

#[cfg(test)]
#[path = "../../../../../tests/rendering/scene3d_frame.rs"]
mod tests;
