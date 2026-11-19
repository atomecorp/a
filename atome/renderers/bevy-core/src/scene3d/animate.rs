//! The scene's clock: each animated node's local transform at a time code, interpolated between its authored
//! samples (translation and scale linearly, rotation spherically), and the auto-framed camera.

use bevy::{camera::PerspectiveProjection, prelude::*};

use atome_usd::scene::{UsdMatrix, UsdNodeContent, UsdScene, UsdXformTrack};

fn transform_of(matrix: &UsdMatrix) -> Transform {
    // USD is row-vector (`p · M`): its row-major array read as columns is Bevy's column-vector matrix.
    Transform::from_matrix(Mat4::from_cols_array(&matrix.map(|value| value as f32)))
}

pub fn local_track(track: &UsdXformTrack) -> Vec<(f64, Transform)> {
    match track {
        UsdXformTrack::Static(matrix) => vec![(0.0, transform_of(matrix))],
        UsdXformTrack::Sampled(samples) => samples
            .iter()
            .map(|(time, matrix)| (*time, transform_of(matrix)))
            .collect(),
    }
}

/// A node's samples, sorted by time code; one sample = a still node.
#[derive(Clone, Debug)]
pub struct Scene3dTrack(pub Vec<(f64, Transform)>);

impl Scene3dTrack {
    /// Held before the first sample and after the last, as USD's value resolution does.
    pub fn at(&self, time_code: f64) -> Transform {
        let samples = &self.0;
        let Some(first) = samples.first() else {
            return Transform::IDENTITY;
        };
        if samples.len() == 1 || time_code <= first.0 {
            return first.1;
        }
        let next = samples.partition_point(|(time, _)| *time <= time_code);
        if next >= samples.len() {
            return samples[samples.len() - 1].1;
        }
        let (t0, a) = samples[next - 1];
        let (t1, b) = samples[next];
        let s = ((time_code - t0) / (t1 - t0).max(f64::EPSILON)) as f32;
        Transform {
            translation: a.translation.lerp(b.translation, s),
            rotation: a.rotation.slerp(b.rotation, s),
            scale: a.scale.lerp(b.scale, s),
        }
    }
}

/// The world matrix of every node at `time_code`, under the root's turn.
pub fn world_matrices(
    scene: &UsdScene,
    tracks: &[Scene3dTrack],
    root: Mat4,
    time_code: f64,
) -> Vec<Mat4> {
    let mut world: Vec<Mat4> = Vec::with_capacity(scene.nodes.len());
    for (index, node) in scene.nodes.iter().enumerate() {
        let parent = match node.parent {
            Some(parent) if !node.resets_xform => world[parent],
            _ => root,
        };
        world.push(parent * tracks[index].at(time_code).to_matrix());
    }
    world
}

/// A camera looking at everything the scene shows at any of its sample times, from the front, a little above
/// and to the right, with 30° of vertical field.
pub fn framing(scene: &UsdScene, root_rotation: Quat) -> (Transform, PerspectiveProjection) {
    let tracks: Vec<Scene3dTrack> = scene
        .nodes
        .iter()
        .map(|node| Scene3dTrack(local_track(&node.local)))
        .collect();
    let mut times: Vec<f64> = tracks
        .iter()
        .flat_map(|track| track.0.iter().map(|(time, _)| *time))
        .collect();
    times.push(scene.start_time_code);
    times.push(scene.end_time_code);
    times.sort_by(f64::total_cmp);
    times.dedup();
    let root = Mat4::from_quat(root_rotation);
    let (mut min, mut max) = (Vec3::splat(f32::INFINITY), Vec3::splat(f32::NEG_INFINITY));
    for time in times {
        let world = world_matrices(scene, &tracks, root, time);
        for (index, node) in scene.nodes.iter().enumerate() {
            if let UsdNodeContent::Mesh(mesh) = node.content {
                for point in &scene.meshes[mesh].positions {
                    let p = world[index].transform_point3(Vec3::from_array(*point));
                    min = min.min(p);
                    max = max.max(p);
                }
            }
        }
    }
    let center = (min + max) * 0.5;
    let radius = ((max - min).length() * 0.5).max(1e-3);
    let fov = 30f32.to_radians();
    let distance = radius / (fov * 0.5).sin() * 1.05;
    let direction = Vec3::new(0.45, 0.35, 1.0).normalize();
    let eye = center + direction * distance;
    let transform = Transform::from_translation(eye).looking_at(center, Vec3::Y);
    let projection = PerspectiveProjection {
        fov,
        near: (distance - radius * 1.5).max(distance * 1e-3),
        far: distance + radius * 2.0,
        ..default()
    };
    (transform, projection)
}
