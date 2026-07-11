use bevy::{
    asset::{load_internal_asset, uuid_handle},
    prelude::*,
    reflect::TypePath,
    render::{
        render_resource::{AsBindGroup, ShaderType},
        RenderApp,
    },
    shader::{Shader, ShaderRef},
    sprite_render::{AlphaMode2d, Material2d, Material2dPlugin},
};

use crate::{types::AtomeProceduralSdf, video_external_texture::video_quad_mesh_handle_from_size};

const PROCEDURAL_SDF_SHADER_HANDLE: Handle<Shader> =
    uuid_handle!("aedaf527-1d86-49dd-bfea-e27453fa6932");

#[derive(Clone, Copy, Debug, ShaderType)]
pub struct ProceduralSdfUniform {
    pub morph: Vec4,
    pub dynamics: Vec4,
    pub transition: Vec4,
}

#[derive(Asset, TypePath, AsBindGroup, Debug, Clone)]
pub struct ProceduralSdfMaterial {
    #[uniform(0)]
    pub uniform: ProceduralSdfUniform,
}

impl Material2d for ProceduralSdfMaterial {
    fn fragment_shader() -> ShaderRef {
        PROCEDURAL_SDF_SHADER_HANDLE.into()
    }

    fn alpha_mode(&self) -> AlphaMode2d {
        AlphaMode2d::Blend
    }
}

pub struct ProceduralSdfPlugin;

impl Plugin for ProceduralSdfPlugin {
    fn build(&self, app: &mut App) {
        app.init_resource::<Assets<Shader>>();
        load_internal_asset!(
            app,
            PROCEDURAL_SDF_SHADER_HANDLE,
            "assets/shaders/procedural_sdf.wgsl",
            Shader::from_wgsl
        );
        app.init_resource::<Assets<ProceduralSdfMaterial>>();
        if app.get_sub_app_mut(RenderApp).is_some() {
            app.add_plugins(Material2dPlugin::<ProceduralSdfMaterial>::default());
        }
    }
}

fn material_from_contract(contract: AtomeProceduralSdf) -> ProceduralSdfMaterial {
    let normalized = contract.normalized();
    ProceduralSdfMaterial {
        uniform: ProceduralSdfUniform {
            morph: Vec4::from_array(normalized.morph),
            dynamics: Vec4::new(
                normalized.phase,
                normalized.pulse,
                normalized.time,
                normalized.intensity,
            ),
            transition: Vec4::new(
                normalized.glow_reveal,
                normalized.core_reveal,
                normalized.shell_reveal,
                normalized.disappearing,
            ),
        },
    }
}

pub fn insert_procedural_sdf(
    world: &mut World,
    entity: Entity,
    logical_size: [f32; 2],
    contract: AtomeProceduralSdf,
) -> Result<(), String> {
    let mesh = {
        let mut meshes = world
            .get_resource_mut::<Assets<Mesh>>()
            .ok_or_else(|| "bevy_mesh_assets_required".to_string())?;
        video_quad_mesh_handle_from_size(&mut meshes, logical_size, [0.0, 0.0, 1.0, 1.0])
    };
    let material = {
        let mut materials = world
            .get_resource_mut::<Assets<ProceduralSdfMaterial>>()
            .ok_or_else(|| "bevy_procedural_sdf_assets_required".to_string())?;
        materials.add(material_from_contract(contract))
    };
    world
        .entity_mut(entity)
        .insert((Mesh2d(mesh), MeshMaterial2d(material)));
    Ok(())
}

pub fn resize_procedural_sdf(
    world: &mut World,
    entity: Entity,
    logical_size: [f32; 2],
) -> Result<(), String> {
    if world
        .get::<MeshMaterial2d<ProceduralSdfMaterial>>(entity)
        .is_none()
    {
        return Ok(());
    }
    let mesh = {
        let mut meshes = world
            .get_resource_mut::<Assets<Mesh>>()
            .ok_or_else(|| "bevy_mesh_assets_required".to_string())?;
        video_quad_mesh_handle_from_size(&mut meshes, logical_size, [0.0, 0.0, 1.0, 1.0])
    };
    world.entity_mut(entity).insert(Mesh2d(mesh));
    Ok(())
}

pub fn patch_procedural_sdf(
    world: &mut World,
    entity: Entity,
    contract: AtomeProceduralSdf,
) -> Result<(), String> {
    let handle = world
        .get::<MeshMaterial2d<ProceduralSdfMaterial>>(entity)
        .map(|material| material.0.clone())
        .ok_or_else(|| "bevy_procedural_sdf_component_missing".to_string())?;
    let mut materials = world
        .get_resource_mut::<Assets<ProceduralSdfMaterial>>()
        .ok_or_else(|| "bevy_procedural_sdf_assets_required".to_string())?;
    let mut material = materials
        .get_mut(&handle)
        .ok_or_else(|| "bevy_procedural_sdf_material_missing".to_string())?;
    *material = material_from_contract(contract);
    Ok(())
}
