//! A `Mesh` prim read into a face-varying, triangulated `UsdMesh` (`scene.rs`).

use anyhow::{Context, Result, bail};
use openusd::sdf::Value;
use openusd::usd::{Prim, TimeCode};

use crate::scene::{UsdMesh, UsdReport};

/// An attribute's value at `time` (its default when it has no time samples).
pub(crate) fn read_at<T>(prim: &Prim, name: &str, time: TimeCode) -> Result<Option<T>>
where
    T: TryFrom<Value>,
    T::Error: std::error::Error + Send + Sync + 'static,
{
    prim.attribute(name)
        .get_at(time)
        .with_context(|| format!("{}.{name}", prim.path().as_str()))
}

/// An `int[]` attribute (`openusd` 0.6 decodes no `Vec<i32>` through `TryFrom`).
fn read_ints(prim: &Prim, name: &str, time: TimeCode) -> Result<Option<Vec<i32>>> {
    match read_at::<Value>(prim, name, time)? {
        None => Ok(None),
        Some(Value::IntVec(values)) => Ok(Some(values)),
        Some(other) => bail!(
            "{}.{name}: int[] expected, got {other:?}",
            prim.path().as_str()
        ),
    }
}

fn interpolation(prim: &Prim, name: &str) -> Result<Option<String>> {
    Ok(prim
        .attribute(name)
        .get_metadata::<Value>("interpolation")?
        .and_then(|value| value.try_as_token())
        .map(|token| token.as_str().to_string()))
}

fn token(prim: &Prim, name: &str) -> Result<Option<String>> {
    Ok(prim
        .attribute(name)
        .get::<Value>()?
        .and_then(|value| value.try_as_token())
        .map(|token| token.as_str().to_string()))
}

/// One primvar laid per face corner: `values[i]` for corner `corner` of face `face` whose point is `point`.
struct CornerLayout<'a> {
    interpolation: &'a str,
    indices: Option<&'a [i32]>,
}

impl CornerLayout<'_> {
    fn element(&self, corner: usize, face: usize, point: usize) -> Option<usize> {
        let element = match self.interpolation {
            "faceVarying" => corner,
            "uniform" => face,
            "constant" => 0,
            _ => point,
        };
        match self.indices {
            Some(indices) => indices
                .get(element)
                .and_then(|index| usize::try_from(*index).ok()),
            None => Some(element),
        }
    }
}

fn first_primvar<'a>(prim: &Prim, names: &'a [&'a str]) -> Result<Option<&'a str>> {
    for name in names {
        if prim.attribute(*name).get::<Value>()?.is_some()
            || prim.attribute(*name).time_samples()?.is_some()
        {
            return Ok(Some(name));
        }
    }
    Ok(None)
}

pub(crate) fn read_mesh(prim: &Prim, time: TimeCode, report: &mut UsdReport) -> Result<UsdMesh> {
    let path = prim.path().as_str().to_string();
    let points: Vec<[f32; 3]> =
        read_at(prim, "points", time)?.with_context(|| format!("{path}: points missing"))?;
    let counts = read_ints(prim, "faceVertexCounts", time)?
        .with_context(|| format!("{path}: faceVertexCounts missing"))?;
    let face_indices = read_ints(prim, "faceVertexIndices", time)?
        .with_context(|| format!("{path}: faceVertexIndices missing"))?;
    if counts
        .iter()
        .map(|count| usize::try_from(*count).unwrap_or(0))
        .sum::<usize>()
        != face_indices.len()
    {
        bail!("{path}: faceVertexCounts and faceVertexIndices disagree");
    }
    if token(prim, "subdivisionScheme")?.is_some_and(|scheme| scheme != "none") {
        report.lose("subdivision surfaces (drawn as their control mesh)".into());
    }
    if prim.children()?.iter().any(|child| {
        child
            .type_name()
            .ok()
            .flatten()
            .is_some_and(|name| name.as_str() == "GeomSubset")
    }) {
        report.lose("GeomSubset materials (the mesh takes its own binding)".into());
    }
    let normal_name = first_primvar(prim, &["primvars:normals", "normals"])?;
    let normal_values: Option<Vec<[f32; 3]>> = match normal_name {
        Some(name) => read_at(prim, name, time)?,
        None => None,
    };
    let normal_interp = match normal_name {
        Some(name) => interpolation(prim, name)?.unwrap_or_else(|| "vertex".into()),
        None => String::new(),
    };
    let normal_indices: Option<Vec<i32>> = match normal_name {
        Some(name) => read_ints(prim, &format!("{name}:indices"), time)?,
        None => None,
    };
    let uv_name = first_primvar(
        prim,
        &[
            "primvars:st",
            "primvars:UVMap",
            "primvars:st0",
            "primvars:uv",
        ],
    )?;
    let uv_values: Option<Vec<[f32; 2]>> = match uv_name {
        Some(name) => read_at(prim, name, time)?,
        None => None,
    };
    let uv_interp = match uv_name {
        Some(name) => interpolation(prim, name)?.unwrap_or_else(|| "vertex".into()),
        None => String::new(),
    };
    let uv_indices: Option<Vec<i32>> = match uv_name {
        Some(name) => read_ints(prim, &format!("{name}:indices"), time)?,
        None => None,
    };
    let normal_layout = CornerLayout {
        interpolation: &normal_interp,
        indices: normal_indices.as_deref(),
    };
    let uv_layout = CornerLayout {
        interpolation: &uv_interp,
        indices: uv_indices.as_deref(),
    };

    let mut mesh = UsdMesh {
        double_sided: prim
            .attribute("doubleSided")
            .get::<bool>()?
            .unwrap_or(false),
        display_color: read_at::<Vec<[f32; 3]>>(prim, "primvars:displayColor", time)?
            .and_then(|colors| colors.first().copied()),
        ..UsdMesh::default()
    };
    let mut normals = normal_values
        .as_ref()
        .map(|_| Vec::with_capacity(face_indices.len()));
    let mut uvs = uv_values
        .as_ref()
        .map(|_| Vec::with_capacity(face_indices.len()));
    let left_handed = token(prim, "orientation")?.is_some_and(|value| value == "leftHanded");
    let mut corner = 0usize;
    for (face, count) in counts.iter().enumerate() {
        let count = usize::try_from(*count).unwrap_or(0);
        let first = u32::try_from(mesh.positions.len()).context("scene3d_mesh_too_large")?;
        for _ in 0..count {
            let point = usize::try_from(face_indices[corner])
                .with_context(|| format!("{path}: negative index"))?;
            mesh.positions.push(
                *points
                    .get(point)
                    .with_context(|| format!("{path}: index {point} out of points"))?,
            );
            if let (Some(out), Some(values)) = (normals.as_mut(), normal_values.as_ref()) {
                let element = normal_layout
                    .element(corner, face, point)
                    .and_then(|index| values.get(index));
                out.push(
                    *element.with_context(|| format!("{path}: normals do not cover the mesh"))?,
                );
            }
            if let (Some(out), Some(values)) = (uvs.as_mut(), uv_values.as_ref()) {
                let [u, v] = *uv_layout
                    .element(corner, face, point)
                    .and_then(|index| values.get(index))
                    .with_context(|| format!("{path}: UVs do not cover the mesh"))?;
                // USD's st origin is the bottom left; a Bevy texture's is the top left.
                out.push([u, 1.0 - v]);
            }
            corner += 1;
        }
        for k in 1..count.saturating_sub(1) {
            let (b, c) = (first + k as u32, first + k as u32 + 1);
            if left_handed {
                mesh.indices.extend([first, c, b]);
            } else {
                mesh.indices.extend([first, b, c]);
            }
        }
    }
    // No authored normals: each face's own (Newell), so the face is lit flat as a polygon mesh is.
    mesh.normals =
        Some(normals.unwrap_or_else(|| face_normals(&mesh.positions, &counts, left_handed)));
    mesh.uvs = uvs;
    Ok(mesh)
}

/// `left_handed`: the corners turn clockwise around the face's front.
fn face_normals(positions: &[[f32; 3]], counts: &[i32], left_handed: bool) -> Vec<[f32; 3]> {
    let sign = if left_handed { -1.0 } else { 1.0 };
    let mut normals = Vec::with_capacity(positions.len());
    let mut first = 0usize;
    for count in counts {
        let count = usize::try_from(*count).unwrap_or(0);
        let corners = &positions[first..first + count];
        let mut normal = [0.0f32; 3];
        for (index, a) in corners.iter().enumerate() {
            let b = corners[(index + 1) % count];
            normal[0] += (a[1] - b[1]) * (a[2] + b[2]);
            normal[1] += (a[2] - b[2]) * (a[0] + b[0]);
            normal[2] += (a[0] - b[0]) * (a[1] + b[1]);
        }
        let length = (normal[0] * normal[0] + normal[1] * normal[1] + normal[2] * normal[2]).sqrt();
        let unit = if length > 0.0 {
            normal.map(|value| sign * value / length)
        } else {
            [0.0, 1.0, 0.0]
        };
        normals.extend(std::iter::repeat_n(unit, count));
        first += count;
    }
    normals
}
