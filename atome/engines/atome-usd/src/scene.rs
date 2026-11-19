//! What a USD file describes, read once into plain data (`load.rs`) and free of Bevy: the reader builds it in its own
//! WASM module, the renderer (bevy-core `scene3d/`) receives it encoded (`codec.rs`) and builds entities from it.
//! Matrices are USD's: row-major, row-vector convention (a point is `p · M`, the translation in elements 12..14).

use serde::Serialize;

pub type UsdMatrix = [f64; 16];

/// The lights the renderer shades with (bevy-core `scene3d/`, its pass's uniform array); past them, the report says so.
pub const MAX_SCENE_LIGHTS: usize = 8;

#[derive(Clone, Debug, Default)]
pub struct UsdScene {
    /// `upAxis = "Z"`: the renderer turns the scene so that its Z points up (Bevy is Y-up).
    pub z_up: bool,
    pub meters_per_unit: f64,
    pub start_time_code: f64,
    pub end_time_code: f64,
    pub time_codes_per_second: f64,
    /// Every prim drawn or placing something drawn, parents before children.
    pub nodes: Vec<UsdNode>,
    pub meshes: Vec<UsdMesh>,
    pub materials: Vec<UsdMaterial>,
    pub textures: Vec<UsdTexture>,
    pub lights: Vec<UsdLight>,
    pub cameras: Vec<UsdCamera>,
    pub report: UsdReport,
}

impl UsdScene {
    /// The scene's length in seconds (0 for a still scene).
    pub fn duration_seconds(&self) -> f64 {
        if self.time_codes_per_second > 0.0 && self.end_time_code > self.start_time_code {
            (self.end_time_code - self.start_time_code) / self.time_codes_per_second
        } else {
            0.0
        }
    }

    /// The time code shown at `progress` (0..1) of the scene's length.
    pub fn time_code_at(&self, progress: f32) -> f64 {
        let progress = if progress.is_finite() {
            f64::from(progress.clamp(0.0, 1.0))
        } else {
            0.0
        };
        self.start_time_code + (self.end_time_code - self.start_time_code).max(0.0) * progress
    }
}

#[derive(Clone, Debug)]
pub struct UsdNode {
    pub path: String,
    pub parent: Option<usize>,
    /// `!resetXformStack!`: the node ignores its parents' transforms.
    pub resets_xform: bool,
    pub local: UsdXformTrack,
    pub content: UsdNodeContent,
}

#[derive(Clone, Debug)]
pub enum UsdXformTrack {
    Static(UsdMatrix),
    /// The local matrix at each authored time code of its ops, sorted by time.
    Sampled(Vec<(f64, UsdMatrix)>),
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum UsdNodeContent {
    Group,
    Mesh(usize),
    Light(usize),
    Camera(usize),
}

/// A mesh laid face-varying: one vertex per face corner, so normals and UVs of every interpolation map to it,
/// triangulated as fans, counter-clockwise.
#[derive(Clone, Debug, Default)]
pub struct UsdMesh {
    pub positions: Vec<[f32; 3]>,
    pub normals: Option<Vec<[f32; 3]>>,
    pub uvs: Option<Vec<[f32; 2]>>,
    pub indices: Vec<u32>,
    pub material: Option<usize>,
    /// `primvars:displayColor` (constant), used when no material is bound.
    pub display_color: Option<[f32; 3]>,
    pub double_sided: bool,
}

#[derive(Clone, Debug)]
pub struct UsdMaterial {
    pub path: String,
    pub base_color: [f32; 3],
    pub base_color_texture: Option<usize>,
    pub metallic: f32,
    pub roughness: f32,
    pub emissive: [f32; 3],
    pub opacity: f32,
}

#[derive(Clone, Debug)]
pub struct UsdTexture {
    pub path: String,
    pub width: u32,
    pub height: u32,
    pub rgba: Vec<u8>,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum UsdLightKind {
    Distant,
    Sphere { radius: f32 },
    Rect { width: f32, height: f32 },
    Disk { radius: f32 },
}

#[derive(Clone, Copy, Debug)]
pub struct UsdLight {
    pub kind: UsdLightKind,
    pub color: [f32; 3],
    /// `inputs:intensity · 2^inputs:exposure`.
    pub intensity: f32,
}

#[derive(Clone, Copy, Debug)]
pub struct UsdCamera {
    pub vertical_fov_radians: f32,
    pub near: f32,
    pub far: f32,
}

/// What the import kept and what it could not show, returned to the importer as it is.
#[derive(Clone, Debug, Default, Serialize)]
pub struct UsdReport {
    pub format: String,
    pub prims: usize,
    pub meshes: usize,
    pub triangles: usize,
    pub materials: usize,
    pub textures: usize,
    pub lights: usize,
    pub cameras: usize,
    pub animated_nodes: usize,
    pub time_samples: usize,
    pub start_time_code: f64,
    pub end_time_code: f64,
    pub time_codes_per_second: f64,
    pub duration_seconds: f64,
    pub up_axis: String,
    pub meters_per_unit: f64,
    /// One line per feature of the file the renderer does not show (a prim type, a shader, skinning...).
    pub lost: Vec<String>,
}

impl UsdReport {
    pub fn lose(&mut self, what: String) {
        if !self.lost.contains(&what) {
            self.lost.push(what);
        }
    }
}
