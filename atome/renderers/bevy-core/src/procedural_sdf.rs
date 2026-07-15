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

use crate::workspace_backdrop::{
    set_workspace_backdrop_enabled, AtomeWorkspaceBackdrop, FLOWER_PRESENTATION_LAYER,
};
use crate::workspace_blur::AssistantOpticsSettings;
use crate::{types::AtomeProceduralSdf, video_external_texture::video_quad_mesh_handle_from_size};

const PROCEDURAL_SDF_SHADER_HANDLE: Handle<Shader> =
    uuid_handle!("aedaf527-1d86-49dd-bfea-e27453fa6932");

#[derive(Clone, Copy, Debug, ShaderType)]
pub struct ProceduralSdfUniform {
    pub morph: Vec4,
    pub dynamics: Vec4,
    pub transition: Vec4,
    pub optics: Vec4,
    pub contact: Vec4,
    pub destructive: Vec4,
    pub gesture: Vec4,
    pub geometry: Vec4,
    pub shape: Vec4,
}

#[derive(Asset, TypePath, AsBindGroup, Debug, Clone)]
pub struct ProceduralSdfMaterial {
    #[uniform(0)]
    pub uniform: ProceduralSdfUniform,
    #[texture(1)]
    #[sampler(2)]
    pub original_backdrop: Handle<Image>,
    #[texture(3)]
    #[sampler(4)]
    pub blurred_backdrop: Handle<Image>,
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

fn material_from_contract(
    contract: AtomeProceduralSdf,
    original_backdrop: Handle<Image>,
    blurred_backdrop: Handle<Image>,
    optics: Vec4,
) -> ProceduralSdfMaterial {
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
            optics,
            contact: Vec4::new(
                normalized.contact[0],
                normalized.contact[1],
                normalized.attraction,
                normalized.stretch,
            ),
            destructive: Vec4::new(
                normalized.destructive_direction[0],
                normalized.destructive_direction[1],
                normalized.destructive_mode,
                normalized.destructive_progress,
            ),
            gesture: Vec4::new(normalized.gesture_velocity, 0.0, 0.0, 0.0),
            geometry: Vec4::new(
                normalized.surface_size[0],
                normalized.surface_size[1],
                normalized.assistant_center[0],
                normalized.assistant_center[1],
            ),
            shape: Vec4::new(normalized.assistant_size, 0.0, 0.0, 0.0),
        },
        original_backdrop,
        blurred_backdrop,
    }
}

pub fn insert_procedural_sdf(
    world: &mut World,
    entity: Entity,
    logical_size: [f32; 2],
    contract: AtomeProceduralSdf,
) -> Result<(), String> {
    let (original_backdrop, blurred_backdrop) = world
        .get_resource::<AtomeWorkspaceBackdrop>()
        .map(|state| (state.image.clone(), state.blur.vertical_image.clone()))
        .ok_or_else(|| "bevy_workspace_backdrop_required".to_string())?;
    let optics = world
        .get_resource::<AssistantOpticsSettings>()
        .copied()
        .unwrap_or_default()
        .sdf_uniform(
            world
                .get_resource::<crate::types::AtomeBevyRendererConfig>()
                .map(|config| config.device_pixel_ratio)
                .unwrap_or(1.0),
        );
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
        materials.add(material_from_contract(
            contract,
            original_backdrop,
            blurred_backdrop,
            optics,
        ))
    };
    world.entity_mut(entity).insert((
        Mesh2d(mesh),
        MeshMaterial2d(material),
        bevy::camera::visibility::RenderLayers::layer(FLOWER_PRESENTATION_LAYER),
    ));
    set_workspace_backdrop_enabled(world, true)?;
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
    let original_backdrop = material.original_backdrop.clone();
    let blurred_backdrop = material.blurred_backdrop.clone();
    let optics = material.uniform.optics;
    *material = material_from_contract(contract, original_backdrop, blurred_backdrop, optics);
    Ok(())
}
