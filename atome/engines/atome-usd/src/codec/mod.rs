//! A `UsdScene` as bytes, from the reader's WASM module to the renderer's: little-endian, versioned, read with every
//! length checked. The report does not travel (the importer reads it from the reader directly).
//!
//! Layout: `AUSD`, the version (u16), the scene's header (z_up, meters per unit, start, end, codes per second), then
//! its nodes, meshes, materials, textures, lights and cameras, each list prefixed by its length (u32).

mod bytes;

use crate::scene::*;
use bytes::{Read, Reader, Writer};

const MAGIC: &[u8; 4] = b"AUSD";
pub const SCENE_CODEC_VERSION: u16 = 1;

fn write_mesh(out: &mut Writer, mesh: &UsdMesh) {
    out.list(&mesh.positions, |out, item| out.f32s(item));
    out.bool(mesh.normals.is_some());
    if let Some(normals) = &mesh.normals {
        out.list(normals, |out, item| out.f32s(item));
    }
    out.bool(mesh.uvs.is_some());
    if let Some(uvs) = &mesh.uvs {
        out.list(uvs, |out, item| out.f32s(item));
    }
    out.list(&mesh.indices, |out, item| out.u32(*item));
    out.option_index(mesh.material);
    out.bool(mesh.display_color.is_some());
    if let Some(color) = &mesh.display_color {
        out.f32s(color);
    }
    out.bool(mesh.double_sided);
}

fn read_mesh(input: &mut Reader) -> Read<UsdMesh> {
    let positions = input.list(12, Reader::f32s)?;
    let normals = if input.bool()? {
        Some(input.list(12, Reader::f32s)?)
    } else {
        None
    };
    let uvs = if input.bool()? {
        Some(input.list(8, Reader::f32s)?)
    } else {
        None
    };
    Ok(UsdMesh {
        positions,
        normals,
        uvs,
        indices: input.list(4, Reader::u32)?,
        material: input.option_index()?,
        display_color: if input.bool()? {
            Some(input.f32s()?)
        } else {
            None
        },
        double_sided: input.bool()?,
    })
}

fn write_light(out: &mut Writer, light: &UsdLight) {
    match light.kind {
        UsdLightKind::Distant => out.u8(0),
        UsdLightKind::Sphere { radius } => {
            out.u8(1);
            out.f32(radius);
        }
        UsdLightKind::Rect { width, height } => {
            out.u8(2);
            out.f32(width);
            out.f32(height);
        }
        UsdLightKind::Disk { radius } => {
            out.u8(3);
            out.f32(radius);
        }
    }
    out.f32s(&light.color);
    out.f32(light.intensity);
}

fn read_light(input: &mut Reader) -> Read<UsdLight> {
    let kind = match input.u8()? {
        0 => UsdLightKind::Distant,
        1 => UsdLightKind::Sphere {
            radius: input.f32()?,
        },
        2 => UsdLightKind::Rect {
            width: input.f32()?,
            height: input.f32()?,
        },
        3 => UsdLightKind::Disk {
            radius: input.f32()?,
        },
        other => return Err(format!("scene3d_codec_light_invalid:{other}")),
    };
    Ok(UsdLight {
        kind,
        color: input.f32s()?,
        intensity: input.f32()?,
    })
}

fn write_node(out: &mut Writer, node: &UsdNode) {
    out.str(&node.path);
    out.option_index(node.parent);
    out.bool(node.resets_xform);
    match &node.local {
        UsdXformTrack::Static(matrix) => {
            out.u8(0);
            out.matrix(matrix);
        }
        UsdXformTrack::Sampled(samples) => {
            out.u8(1);
            out.list(samples, |out, (time, matrix)| {
                out.f64(*time);
                out.matrix(matrix);
            });
        }
    }
    let (tag, index) = match node.content {
        UsdNodeContent::Group => (0, 0),
        UsdNodeContent::Mesh(index) => (1, index),
        UsdNodeContent::Light(index) => (2, index),
        UsdNodeContent::Camera(index) => (3, index),
    };
    out.u8(tag);
    out.index(index);
}

fn read_node(input: &mut Reader) -> Read<UsdNode> {
    let path = input.str()?;
    let parent = input.option_index()?;
    let resets_xform = input.bool()?;
    let local = match input.u8()? {
        0 => UsdXformTrack::Static(input.matrix()?),
        1 => UsdXformTrack::Sampled(input.list(136, |input| Ok((input.f64()?, input.matrix()?)))?),
        other => return Err(format!("scene3d_codec_track_invalid:{other}")),
    };
    let tag = input.u8()?;
    let index = input.index()?;
    let content = match tag {
        0 => UsdNodeContent::Group,
        1 => UsdNodeContent::Mesh(index),
        2 => UsdNodeContent::Light(index),
        3 => UsdNodeContent::Camera(index),
        other => return Err(format!("scene3d_codec_content_invalid:{other}")),
    };
    Ok(UsdNode {
        path,
        parent,
        resets_xform,
        local,
        content,
    })
}

/// The scene as bytes (its report left out).
pub fn encode_scene(scene: &UsdScene) -> Vec<u8> {
    let mut out = Writer::default();
    out.0.extend_from_slice(MAGIC);
    out.0.extend_from_slice(&SCENE_CODEC_VERSION.to_le_bytes());
    out.bool(scene.z_up);
    for value in [
        scene.meters_per_unit,
        scene.start_time_code,
        scene.end_time_code,
        scene.time_codes_per_second,
    ] {
        out.f64(value);
    }
    out.list(&scene.nodes, write_node);
    out.list(&scene.meshes, write_mesh);
    out.list(&scene.materials, |out, material| {
        out.str(&material.path);
        out.f32s(&material.base_color);
        out.option_index(material.base_color_texture);
        out.f32(material.metallic);
        out.f32(material.roughness);
        out.f32s(&material.emissive);
        out.f32(material.opacity);
    });
    out.list(&scene.textures, |out, texture| {
        out.str(&texture.path);
        out.u32(texture.width);
        out.u32(texture.height);
        out.bytes(&texture.rgba);
    });
    out.list(&scene.lights, write_light);
    out.list(&scene.cameras, |out, camera| {
        out.f32(camera.vertical_fov_radians);
        out.f32(camera.near);
        out.f32(camera.far);
    });
    out.0
}

/// A scene from `encode_scene`'s bytes; every reference between its lists is checked (a node's mesh, a mesh's
/// material, a material's texture, a node's parent before it).
pub fn decode_scene(bytes: &[u8]) -> Read<UsdScene> {
    let mut input = Reader { bytes, at: 0 };
    if input.take(4)? != MAGIC {
        return Err("scene3d_codec_magic_invalid".into());
    }
    let version = u16::from_le_bytes(input.array()?);
    if version != SCENE_CODEC_VERSION {
        return Err(format!("scene3d_codec_version_unsupported:{version}"));
    }
    let z_up = input.bool()?;
    let [
        meters_per_unit,
        start_time_code,
        end_time_code,
        time_codes_per_second,
    ] = [input.f64()?, input.f64()?, input.f64()?, input.f64()?];
    let nodes = input.list(10, read_node)?;
    let meshes = input.list(16, read_mesh)?;
    let materials = input.list(40, |input| {
        Ok(UsdMaterial {
            path: input.str()?,
            base_color: input.f32s()?,
            base_color_texture: input.option_index()?,
            metallic: input.f32()?,
            roughness: input.f32()?,
            emissive: input.f32s()?,
            opacity: input.f32()?,
        })
    })?;
    let textures = input.list(16, |input| {
        let (path, width, height, rgba) =
            (input.str()?, input.u32()?, input.u32()?, input.bytes()?);
        if rgba.len() as u64 != u64::from(width) * u64::from(height) * 4 {
            return Err(format!("scene3d_codec_texture_size_invalid:{path}"));
        }
        Ok(UsdTexture {
            path,
            width,
            height,
            rgba,
        })
    })?;
    let lights = input.list(17, read_light)?;
    let cameras = input.list(12, |input| {
        Ok(UsdCamera {
            vertical_fov_radians: input.f32()?,
            near: input.f32()?,
            far: input.f32()?,
        })
    })?;
    if input.at != bytes.len() {
        return Err("scene3d_codec_trailing_bytes".into());
    }
    let scene = UsdScene {
        z_up,
        meters_per_unit,
        start_time_code,
        end_time_code,
        time_codes_per_second,
        nodes,
        meshes,
        materials,
        textures,
        lights,
        cameras,
        report: UsdReport::default(),
    };
    check_references(&scene)?;
    Ok(scene)
}

fn check_references(scene: &UsdScene) -> Read<()> {
    for (index, node) in scene.nodes.iter().enumerate() {
        if node.parent.is_some_and(|parent| parent >= index) {
            return Err(format!("scene3d_codec_parent_invalid:{}", node.path));
        }
        let fits = match node.content {
            UsdNodeContent::Group => true,
            UsdNodeContent::Mesh(mesh) => mesh < scene.meshes.len(),
            UsdNodeContent::Light(light) => light < scene.lights.len(),
            UsdNodeContent::Camera(camera) => camera < scene.cameras.len(),
        };
        if !fits {
            return Err(format!("scene3d_codec_content_index_invalid:{}", node.path));
        }
    }
    for mesh in &scene.meshes {
        let corners = mesh.positions.len();
        if mesh
            .material
            .is_some_and(|material| material >= scene.materials.len())
            || mesh.indices.iter().any(|index| *index as usize >= corners)
            || mesh
                .normals
                .as_ref()
                .is_some_and(|normals| normals.len() != corners)
            || mesh.uvs.as_ref().is_some_and(|uvs| uvs.len() != corners)
        {
            return Err("scene3d_codec_mesh_invalid".into());
        }
    }
    if scene.materials.iter().any(|material| {
        material
            .base_color_texture
            .is_some_and(|texture| texture >= scene.textures.len())
    }) {
        return Err("scene3d_codec_material_texture_invalid".into());
    }
    Ok(())
}
