//! Restored login light material on the shared Bevy presentation camera.
use bevy::{
    asset::{load_internal_asset, uuid_handle}, prelude::*, reflect::TypePath,
    render::{render_resource::{AsBindGroup, ShaderType, BlendState, BlendComponent, BlendFactor, BlendOperation, RenderPipelineDescriptor}, RenderApp},
    shader::{Shader, ShaderRef}, mesh::MeshVertexBufferLayoutRef,
    sprite_render::{Material2d, Material2dPlugin, Material2dKey, AlphaMode2d},
};
use crate::{types::AtomeProceduralSdf, video_external_texture::video_quad_mesh_handle_from_size,
    workspace_backdrop::MENU_PRESENTATION_LAYER};

const SHADER: Handle<Shader> = uuid_handle!("75764bd7-2375-4ba1-a0d7-f405c5fb8289");
#[derive(Clone, Copy, Debug, ShaderType)]
pub struct LoginLightUniform { pub parameters: [Vec4; 24] }
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub struct LoginLightKey { pub screen: bool }

#[derive(Asset, TypePath, AsBindGroup, Debug, Clone)]
#[bind_group_data(LoginLightKey)]
pub struct LoginLightMaterial {
    #[uniform(0)] pub uniform: LoginLightUniform,
    #[texture(1)] #[sampler(2)] pub logo: Handle<Image>,
}
impl From<&LoginLightMaterial> for LoginLightKey {
    fn from(material: &LoginLightMaterial) -> Self { Self { screen: material.uniform.parameters[0].w > 0.5 } }
}
impl Material2d for LoginLightMaterial {
    fn fragment_shader() -> ShaderRef { SHADER.into() }
    fn alpha_mode(&self) -> AlphaMode2d { AlphaMode2d::Blend }
    fn specialize(descriptor: &mut RenderPipelineDescriptor, _layout: &MeshVertexBufferLayoutRef,
        key: Material2dKey<Self>) -> Result<(), bevy::render::render_resource::SpecializedMeshPipelineError> {
        if key.bind_group_data.screen {
            if let Some(fragment) = descriptor.fragment.as_mut() {
                for target in fragment.targets.iter_mut().flatten() {
                    target.blend = Some(BlendState {
                        color: BlendComponent { src_factor: BlendFactor::One, dst_factor: BlendFactor::OneMinusSrc, operation: BlendOperation::Add },
                        alpha: BlendComponent { src_factor: BlendFactor::One, dst_factor: BlendFactor::OneMinusSrcAlpha, operation: BlendOperation::Add },
                    });
                }
            }
        }
        Ok(())
    }
}
pub struct LoginLightPlugin;
impl Plugin for LoginLightPlugin {
    fn build(&self, app: &mut App) {
        app.init_resource::<Assets<Shader>>();
        load_internal_asset!(app, SHADER, "assets/shaders/login_light.wgsl", Shader::from_wgsl);
        app.init_resource::<Assets<LoginLightMaterial>>();
        if app.get_sub_app_mut(RenderApp).is_some() { app.add_plugins(Material2dPlugin::<LoginLightMaterial>::default()); }
    }
}
pub fn insert(world: &mut World, entity: Entity, size: [f32; 2], contract: AtomeProceduralSdf,
    logo: Option<Handle<Image>>) -> Result<(), String> {
    let logo = logo.ok_or("bevy_login_light_logo_texture_required")?;
    let mesh = video_quad_mesh_handle_from_size(&mut world.resource_mut::<Assets<Mesh>>(), size, [0.0, 0.0, 1.0, 1.0]);
    let uniform = LoginLightUniform { parameters: contract.surface_parameters.map(Vec4::from_array) };
    let material = world.resource_mut::<Assets<LoginLightMaterial>>().add(LoginLightMaterial { uniform, logo });
    world.entity_mut(entity).insert((Mesh2d(mesh), MeshMaterial2d(material),
        bevy::camera::visibility::RenderLayers::layer(MENU_PRESENTATION_LAYER)));
    Ok(())
}
pub fn resize(world: &mut World, entity: Entity, size: [f32; 2]) -> Result<(), String> {
    let mesh = video_quad_mesh_handle_from_size(&mut world.resource_mut::<Assets<Mesh>>(), size, [0.0, 0.0, 1.0, 1.0]);
    world.entity_mut(entity).insert(Mesh2d(mesh));
    Ok(())
}
pub fn patch(world: &mut World, entity: Entity, contract: AtomeProceduralSdf) -> Result<(), String> {
    let handle = world.get::<MeshMaterial2d<LoginLightMaterial>>(entity)
        .ok_or("bevy_login_light_material_required")?.0.clone();
    let mut materials = world.resource_mut::<Assets<LoginLightMaterial>>();
    materials.get_mut(&handle).ok_or("bevy_login_light_material_missing")?.uniform.parameters = contract.surface_parameters.map(Vec4::from_array);
    Ok(())
}
