//! One USD file (usda, usdc or usdz bytes) composed by `openusd` and read into a `UsdScene`: the Xform
//! hierarchy (time samples pre-sampled), meshes, UsdPreviewSurface materials, lights and cameras. What the
//! renderer cannot show is named in the scene's report, never silently dropped.

use std::collections::HashMap;
use std::sync::Arc;

use anyhow::{Context, Result, bail};
use openusd::gf;
use openusd::schemas::geom::{Imageable, Xformable};
use openusd::sdf::{self, Value};
use openusd::usd::{self, Prim, SchemaBase, SchemaKind, TimeCode};

use crate::mesh::{read_at, read_mesh};
use crate::resolver::{MemoryResolver, root_identifier};
use crate::scene::*;

/// Any prim seen through `Xformable` (its `xformOpOrder`, empty when unauthored).
struct XformView(Prim);
impl SchemaBase for XformView {
    const KIND: SchemaKind = SchemaKind::ConcreteTyped;
    fn prim(&self) -> &Prim {
        &self.0
    }
}
impl Imageable for XformView {}
impl Xformable for XformView {}

pub fn detect_format(bytes: &[u8]) -> Result<&'static str> {
    if bytes.starts_with(b"PK\x03\x04") {
        Ok("usdz")
    } else if bytes.starts_with(b"PXR-USDC") {
        Ok("usdc")
    } else if bytes.starts_with(b"#usda") {
        Ok("usda")
    } else {
        bail!("scene3d_format_unknown")
    }
}

pub fn load_usd(bytes: Vec<u8>) -> Result<UsdScene> {
    let format = detect_format(&bytes)?;
    let root = root_identifier(format);
    let resolver = MemoryResolver::new(root.clone(), Arc::new(bytes));
    let stage = usd::Stage::builder()
        .resolver(resolver.clone())
        .open(&root)
        .context("scene3d_stage_open_failed")?;
    let mut loader = Loader {
        stage: &stage,
        resolver: &resolver,
        scene: UsdScene::default(),
        materials: HashMap::new(),
    };
    loader.read_metadata(format)?;
    for child in stage.prim(sdf::Path::abs_root()).children()? {
        loader.visit(&child, None, None)?;
    }
    let mut scene = loader.scene;
    scene.report.prims = scene.nodes.len();
    scene.report.meshes = scene.meshes.len();
    scene.report.triangles = scene.meshes.iter().map(|mesh| mesh.indices.len() / 3).sum();
    scene.report.materials = scene.materials.len();
    scene.report.textures = scene.textures.len();
    scene.report.lights = scene.lights.len();
    if scene.lights.len() > crate::scene::MAX_SCENE_LIGHTS {
        let shown = crate::scene::MAX_SCENE_LIGHTS;
        scene.report.lose(format!(
            "lights past the first {shown} (not shading the scene)"
        ));
    }
    scene.report.cameras = scene.cameras.len();
    scene.report.duration_seconds = scene.duration_seconds();
    if scene.meshes.is_empty() {
        bail!("scene3d_no_mesh");
    }
    Ok(scene)
}

pub(crate) struct Loader<'a> {
    pub(crate) stage: &'a usd::Stage,
    pub(crate) resolver: &'a MemoryResolver,
    pub(crate) scene: UsdScene,
    pub(crate) materials: HashMap<String, Option<usize>>,
}

pub(crate) fn vec3(value: gf::Vec3f) -> [f32; 3] {
    [value.x, value.y, value.z]
}

impl Loader<'_> {
    fn read_metadata(&mut self, format: &str) -> Result<()> {
        let up = self
            .stage
            .stage_metadata("upAxis")?
            .and_then(|value| value.try_as_token())
            .map(|token| token.as_str().to_string());
        let scene = &mut self.scene;
        scene.z_up = up.as_deref() == Some("Z");
        scene.meters_per_unit = self
            .stage
            .stage_metadata("metersPerUnit")?
            .and_then(|value| value.try_as_double())
            .unwrap_or(0.01);
        scene.start_time_code = self.stage.start_time_code();
        scene.end_time_code = self.stage.end_time_code().max(scene.start_time_code);
        scene.time_codes_per_second = self.stage.time_codes_per_second();
        let report = &mut scene.report;
        report.format = format.to_string();
        report.up_axis = up.unwrap_or_else(|| "Y".into());
        report.meters_per_unit = scene.meters_per_unit;
        report.start_time_code = scene.start_time_code;
        report.end_time_code = scene.end_time_code;
        report.time_codes_per_second = scene.time_codes_per_second;
        Ok(())
    }

    fn start(&self) -> TimeCode {
        TimeCode::new(self.scene.start_time_code)
    }

    fn visit(
        &mut self,
        prim: &Prim,
        parent: Option<usize>,
        inherited_material: Option<String>,
    ) -> Result<()> {
        let type_name = prim
            .type_name()?
            .map(|name| name.as_str().to_string())
            .unwrap_or_default();
        let token = |name: &str| -> Result<Option<String>> {
            Ok(prim
                .attribute(name)
                .get::<Value>()?
                .and_then(|value| value.try_as_token())
                .map(|token| token.as_str().to_string()))
        };
        if !prim.is_active()? || token("visibility")?.as_deref() == Some("invisible") {
            return Ok(());
        }
        if matches!(token("purpose")?.as_deref(), Some("guide" | "proxy")) {
            return Ok(());
        }
        let content = match type_name.as_str() {
            "Material" | "Shader" | "NodeGraph" | "GeomSubset" | "Skeleton" | "SkelAnimation"
            | "BlendShape" => return Ok(()),
            "" | "Xform" | "Scope" => UsdNodeContent::Group,
            "SkelRoot" => {
                self.scene
                    .report
                    .lose("UsdSkel skinning (meshes drawn in their bind pose)".into());
                UsdNodeContent::Group
            }
            "Mesh" => match self.mesh(prim, inherited_material.as_deref()) {
                Ok(index) => UsdNodeContent::Mesh(index),
                Err(error) => {
                    self.scene
                        .report
                        .lose(format!("mesh {}: {error:#}", prim.path().as_str()));
                    UsdNodeContent::Group
                }
            },
            "DistantLight" | "SphereLight" | "RectLight" | "DiskLight" => {
                UsdNodeContent::Light(self.light(prim, &type_name)?)
            }
            "Camera" => UsdNodeContent::Camera(self.camera(prim)?),
            other => {
                self.scene.report.lose(format!("prim type {other}"));
                return Ok(());
            }
        };
        if prim.is_instance()? {
            self.scene
                .report
                .lose("scene-graph instancing (instance prototypes not drawn)".into());
        }
        let (local, resets_xform) = self.local_track(prim)?;
        self.scene.nodes.push(UsdNode {
            path: prim.path().as_str().to_string(),
            parent,
            resets_xform,
            local,
            content,
        });
        let index = self.scene.nodes.len() - 1;
        let material = self.direct_binding(prim)?.or(inherited_material);
        for child in prim.children()? {
            self.visit(&child, Some(index), material.clone())?;
        }
        Ok(())
    }

    fn local_track(&mut self, prim: &Prim) -> Result<(UsdXformTrack, bool)> {
        let view = XformView(prim.clone());
        let order = view.xform_op_order()?.unwrap_or_default();
        let mut times: Vec<f64> = Vec::new();
        for op in order.iter().filter(|op| op.as_str() != "!resetXformStack!") {
            let name = op.trim_start_matches("!invert!");
            if let Some(samples) = prim.attribute(name).time_samples()? {
                times.extend(samples.iter().map(|(time, _)| *time));
            }
        }
        times.sort_by(f64::total_cmp);
        times.dedup();
        let resets = view.resets_xform_stack()?;
        if times.len() < 2 {
            return Ok((
                UsdXformTrack::Static(view.local_to_parent_transform(self.start())?.0),
                resets,
            ));
        }
        self.scene.report.animated_nodes += 1;
        self.scene.report.time_samples += times.len();
        let samples = times
            .into_iter()
            .map(|time| Ok((time, view.local_to_parent_transform(TimeCode::new(time))?.0)))
            .collect::<Result<Vec<_>>>()?;
        Ok((UsdXformTrack::Sampled(samples), resets))
    }

    fn direct_binding(&self, prim: &Prim) -> Result<Option<String>> {
        Ok(prim
            .relationship("material:binding")
            .targets()?
            .first()
            .map(|path| path.as_str().to_string()))
    }

    fn mesh(&mut self, prim: &Prim, inherited: Option<&str>) -> Result<usize> {
        if prim
            .attribute("points")
            .time_samples()?
            .is_some_and(|samples| samples.len() > 1)
        {
            self.scene
                .report
                .lose("point animation (meshes drawn at the first time code)".into());
        }
        if !prim.relationship("skel:skeleton").targets()?.is_empty() {
            self.scene
                .report
                .lose("UsdSkel skinning (meshes drawn in their bind pose)".into());
        }
        let mut mesh = read_mesh(prim, self.start(), &mut self.scene.report)?;
        let binding = self
            .direct_binding(prim)?
            .or_else(|| inherited.map(str::to_string));
        mesh.material = match binding {
            Some(path) => self.material(&path)?,
            None => None,
        };
        self.scene.meshes.push(mesh);
        Ok(self.scene.meshes.len() - 1)
    }

    fn light(&mut self, prim: &Prim, type_name: &str) -> Result<usize> {
        let start = self.start();
        let float = |names: [&str; 2], default: f32| -> Result<f32> {
            for name in names {
                if let Some(value) = read_at::<f32>(prim, name, start)? {
                    return Ok(value);
                }
            }
            Ok(default)
        };
        let color = read_at::<gf::Vec3f>(prim, "inputs:color", start)?
            .or(read_at::<gf::Vec3f>(prim, "color", start)?)
            .map(vec3)
            .unwrap_or([1.0, 1.0, 1.0]);
        let intensity = float(["inputs:intensity", "intensity"], 1.0)?
            * 2f32.powf(float(["inputs:exposure", "exposure"], 0.0)?);
        let kind = match type_name {
            "DistantLight" => UsdLightKind::Distant,
            "SphereLight" => UsdLightKind::Sphere {
                radius: float(["inputs:radius", "radius"], 0.5)?,
            },
            "RectLight" => {
                self.scene
                    .report
                    .lose("RectLight (drawn as a point light)".into());
                UsdLightKind::Rect {
                    width: float(["inputs:width", "width"], 1.0)?,
                    height: float(["inputs:height", "height"], 1.0)?,
                }
            }
            _ => {
                self.scene
                    .report
                    .lose("DiskLight (drawn as a point light)".into());
                UsdLightKind::Disk {
                    radius: float(["inputs:radius", "radius"], 0.5)?,
                }
            }
        };
        self.scene.lights.push(UsdLight {
            kind,
            color,
            intensity,
        });
        Ok(self.scene.lights.len() - 1)
    }

    fn camera(&mut self, prim: &Prim) -> Result<usize> {
        let start = self.start();
        // The schema's defaults (UsdGeomCamera): a 50 mm lens on a 15.2908 mm high aperture.
        let focal = read_at::<f32>(prim, "focalLength", start)?.unwrap_or(50.0);
        let aperture = read_at::<f32>(prim, "verticalAperture", start)?.unwrap_or(15.2908);
        let clipping = read_at::<gf::Vec2f>(prim, "clippingRange", start)?
            .map(|range| [range.x, range.y])
            .unwrap_or([1.0, 1_000_000.0]);
        if read_at::<Value>(prim, "projection", start)?
            .and_then(|value| value.try_as_token())
            .is_some_and(|token| token.as_str() == "orthographic")
        {
            self.scene
                .report
                .lose("orthographic camera (drawn in perspective)".into());
        }
        self.scene.cameras.push(UsdCamera {
            vertical_fov_radians: 2.0 * (aperture / (2.0 * focal.max(f32::EPSILON))).atan(),
            near: clipping[0].max(1e-4),
            far: clipping[1].max(clipping[0] + 1e-3),
        });
        Ok(self.scene.cameras.len() - 1)
    }
}
