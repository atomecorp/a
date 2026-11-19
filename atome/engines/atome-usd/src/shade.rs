//! The materials and textures of a USD scene: `UsdPreviewSurface` read into a `UsdMaterial`, its diffuse texture
//! decoded from the file's package (`scene.rs`). What is not drawn is written in the report.

use anyhow::Result;
use openusd::schemas::shade::{Channel, read_preview_surface};
use openusd::sdf;

use crate::load::{Loader, vec3};
use crate::resolver::normalize_relative;
use crate::scene::{UsdMaterial, UsdTexture};

impl Loader<'_> {
    pub(crate) fn material(&mut self, path: &str) -> Result<Option<usize>> {
        if let Some(index) = self.materials.get(path) {
            return Ok(*index);
        }
        let surface = read_preview_surface(self.stage, &sdf::Path::new(path)?)?;
        let index = match surface {
            None => {
                self.scene.report.lose(format!("material {path}: no UsdPreviewSurface (MaterialX, MDL or custom shaders are not drawn)"));
                None
            }
            Some(surface) => {
                let base_color_texture = match surface.diffuse_color.texture() {
                    Some(file) => self.texture(file),
                    None => None,
                };
                for (name, channel) in [
                    ("normal", surface.normal.is_set()),
                    ("occlusion", surface.occlusion.is_set()),
                    ("clearcoat", surface.clearcoat.is_set()),
                ] {
                    if channel {
                        self.scene.report.lose(format!("UsdPreviewSurface {name}"));
                    }
                }
                if surface.metallic.texture().is_some()
                    || surface.roughness.texture().is_some()
                    || surface.emissive_color.texture().is_some()
                {
                    self.scene.report.lose(
                        "metallic, roughness or emissive textures (their scalar defaults are used)"
                            .into(),
                    );
                }
                let scalar = |channel: &Channel<f32>, default: f32| {
                    channel.value().copied().unwrap_or(default)
                };
                self.scene.materials.push(UsdMaterial {
                    path: path.to_string(),
                    // A connected diffuseColor takes the texture's colour as it is (UsdUVTexture's
                    // scale 1, bias 0); else the authored value, else the schema's 18 % grey.
                    base_color: if base_color_texture.is_some() {
                        [1.0, 1.0, 1.0]
                    } else {
                        surface
                            .diffuse_color
                            .value()
                            .copied()
                            .map(vec3)
                            .unwrap_or([0.18, 0.18, 0.18])
                    },
                    base_color_texture,
                    metallic: scalar(&surface.metallic, 0.0),
                    roughness: scalar(&surface.roughness, 0.5),
                    emissive: surface
                        .emissive_color
                        .value()
                        .copied()
                        .map(vec3)
                        .unwrap_or([0.0, 0.0, 0.0]),
                    opacity: scalar(&surface.opacity, 1.0),
                });
                Some(self.scene.materials.len() - 1)
            }
        };
        self.materials.insert(path.to_string(), index);
        Ok(index)
    }

    fn texture(&mut self, file: &str) -> Option<usize> {
        let authored = file.trim_matches('@');
        let inner = match openusd::ar::split_package_relative_path_inner(authored) {
            Some((_, inner)) => inner,
            None => normalize_relative(authored),
        };
        if let Some(index) = self
            .scene
            .textures
            .iter()
            .position(|texture| texture.path == inner)
        {
            return Some(index);
        }
        let decoded = self
            .resolver
            .package_entry(&inner)
            .map_err(anyhow::Error::from)
            .and_then(|bytes| Ok(image::load_from_memory(&bytes)?.to_rgba8()));
        match decoded {
            Ok(image) => {
                let (width, height) = image.dimensions();
                self.scene.textures.push(UsdTexture {
                    path: inner,
                    width,
                    height,
                    rgba: image.into_raw(),
                });
                Some(self.scene.textures.len() - 1)
            }
            Err(error) => {
                self.scene.report.lose(format!("texture {inner}: {error}"));
                None
            }
        }
    }
}
