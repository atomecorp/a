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

use crate::{
    types::AtomeBackdropStyle,
    video_external_texture::{
        video_quad_mesh_from_size, video_quad_mesh_handle_from_size,
    },
    workspace_backdrop::{set_workspace_backdrop_enabled, AtomeWorkspaceBackdrop, MENU_PRESENTATION_LAYER},
    workspace_blur::backdrop_blur_lod,
};

const BACKDROP_SURFACE_SHADER_HANDLE: Handle<Shader> = uuid_handle!("c7a899e6-7d4b-4fd3-82cb-53c7e11f99bf");

#[derive(Clone, Copy, Debug, ShaderType)]
pub struct BackdropSurfaceUniform {
    /// x/y: logical size, z: corner radius, w: the record opacity. The glass is
    /// a visual like any other: at opacity 0 it must vanish, blur and tint both.
    pub size_radius: Vec4,
    pub tint: Vec4,
    /// x: public logical radius, y: device pixel ratio, z: sampled mip level,
    /// w: tint fade (share of the tint alpha removed at the bottom edge).
    pub blur: Vec4,
}

#[derive(Asset, TypePath, AsBindGroup, Debug, Clone)]
pub struct BackdropSurfaceMaterial {
    #[uniform(0)]
    pub uniform: BackdropSurfaceUniform,
    #[texture(1)]
    #[sampler(2)]
    pub backdrop: Handle<Image>,
}

impl Material2d for BackdropSurfaceMaterial {
    fn fragment_shader() -> ShaderRef {
        BACKDROP_SURFACE_SHADER_HANDLE.into()
    }

    fn alpha_mode(&self) -> AlphaMode2d {
        AlphaMode2d::Blend
    }
}

pub struct BackdropSurfacePlugin;

impl Plugin for BackdropSurfacePlugin {
    fn build(&self, app: &mut App) {
        app.init_resource::<Assets<Shader>>();
        load_internal_asset!(
            app,
            BACKDROP_SURFACE_SHADER_HANDLE,
            "assets/shaders/backdrop_surface.wgsl",
            Shader::from_wgsl
        );
        app.init_resource::<Assets<BackdropSurfaceMaterial>>();
        if app.get_sub_app_mut(RenderApp).is_some() {
            app.add_plugins(Material2dPlugin::<BackdropSurfaceMaterial>::default());
        }
    }
}

fn material_from_contract(
    contract: AtomeBackdropStyle,
    logical_size: [f32; 2],
    corner_radius: f32,
    backdrop: Handle<Image>,
    device_pixel_ratio: f32,
    opacity: f32,
) -> BackdropSurfaceMaterial {
    let style = contract.normalized().expect("validated backdrop style");
    BackdropSurfaceMaterial {
        uniform: BackdropSurfaceUniform {
            size_radius: Vec4::new(
                logical_size[0].max(1.0),
                logical_size[1].max(1.0),
                corner_radius.max(0.0),
                opacity.clamp(0.0, 1.0),
            ),
            tint: Vec4::from_array(style.tint),
            blur: Vec4::new(
                style.blur_px,
                device_pixel_ratio,
                backdrop_blur_lod(style.blur_px, device_pixel_ratio),
                style.tint_fade,
            ),
        },
        backdrop,
    }
}

pub fn insert_backdrop_surface(
    world: &mut World,
    entity: Entity,
    logical_size: [f32; 2],
    corner_radius: f32,
    contract: AtomeBackdropStyle,
) -> Result<(), String> {
    let style = contract.normalized().ok_or_else(|| "bevy_backdrop_style_invalid".to_string())?;
    let backdrop = world
        .get_resource::<AtomeWorkspaceBackdrop>()
        .map(|state| state.image.clone())
        .ok_or_else(|| "bevy_workspace_backdrop_required".to_string())?;
    let device_pixel_ratio = world
        .get_resource::<crate::types::AtomeBevyRendererConfig>()
        .map(|config| config.device_pixel_ratio)
        .unwrap_or(1.0);
    let opacity = world.get::<crate::components::AtomeVisualOpacity>(entity).map(|value| value.0).unwrap_or(1.0);
    let mesh = {
        let mut meshes =
            world.get_resource_mut::<Assets<Mesh>>().ok_or_else(|| "bevy_mesh_assets_required".to_string())?;
        video_quad_mesh_handle_from_size(&mut meshes, logical_size, [0.0, 0.0, 1.0, 1.0])
    };
    let material = {
        let mut materials = world
            .get_resource_mut::<Assets<BackdropSurfaceMaterial>>()
            .ok_or_else(|| "bevy_backdrop_surface_assets_required".to_string())?;
        materials.add(material_from_contract(style, logical_size, corner_radius, backdrop, device_pixel_ratio, opacity))
    };
    world.entity_mut(entity).insert((
        Mesh2d(mesh),
        MeshMaterial2d(material),
        bevy::camera::visibility::RenderLayers::layer(MENU_PRESENTATION_LAYER),
    ));
    refresh_workspace_backdrop_enabled(world)
}

pub fn resize_backdrop_surface(world: &mut World, entity: Entity, logical_size: [f32; 2]) -> Result<(), String> {
    if world
        .get::<MeshMaterial2d<BackdropSurfaceMaterial>>(entity)
        .is_none()
    {
        return Ok(());
    }
    let mesh = {
        let mut meshes =
            world.get_resource_mut::<Assets<Mesh>>().ok_or_else(|| "bevy_mesh_assets_required".to_string())?;
        video_quad_mesh_handle_from_size(&mut meshes, logical_size, [0.0, 0.0, 1.0, 1.0])
    };
    world.entity_mut(entity).insert(Mesh2d(mesh));
    // The shader rebuilds the rounded rectangle from `mesh.uv * size_radius.xy`.
    // Left at the spawn size, a wider mesh stretched the corners by new/old
    // width (a widened ribbon tool drew a long flat arc instead of its radius).
    let handle = world
        .get::<MeshMaterial2d<BackdropSurfaceMaterial>>(entity)
        .map(|material| material.0.clone())
        .ok_or_else(|| "bevy_backdrop_surface_component_missing".to_string())?;
    let mut materials = world
        .get_resource_mut::<Assets<BackdropSurfaceMaterial>>()
        .ok_or_else(|| "bevy_backdrop_surface_assets_required".to_string())?;
    let mut material =
        materials.get_mut(&handle).ok_or_else(|| "bevy_backdrop_surface_material_missing".to_string())?;
    material.uniform.size_radius.x = logical_size[0].max(1.0);
    material.uniform.size_radius.y = logical_size[1].max(1.0);
    Ok(())
}

pub(crate) fn crop_backdrop_surface(
    world: &mut World,
    entity: Entity,
    visible_size: [f32; 2],
    uv_rect: [f32; 4],
) -> Result<(), String> {
    if world
        .get::<MeshMaterial2d<BackdropSurfaceMaterial>>(entity)
        .is_none()
    {
        return Ok(());
    }
    let handle = world
        .get::<Mesh2d>(entity)
        .map(|mesh| mesh.0.clone())
        .ok_or_else(|| "bevy_backdrop_surface_mesh_missing".to_string())?;
    let mut meshes = world
        .get_resource_mut::<Assets<Mesh>>()
        .ok_or_else(|| "bevy_mesh_assets_required".to_string())?;
    let mut mesh = meshes
        .get_mut(&handle)
        .ok_or_else(|| "bevy_backdrop_surface_mesh_asset_missing".to_string())?;
    *mesh = video_quad_mesh_from_size(visible_size, uv_rect);
    Ok(())
}

pub fn patch_backdrop_surface(world: &mut World, entity: Entity, contract: AtomeBackdropStyle) -> Result<(), String> {
    let style = contract.normalized().ok_or_else(|| "bevy_backdrop_style_invalid".to_string())?;
    let handle = world
        .get::<MeshMaterial2d<BackdropSurfaceMaterial>>(entity)
        .map(|material| material.0.clone())
        .ok_or_else(|| "bevy_backdrop_surface_component_missing".to_string())?;
    let device_pixel_ratio = world
        .get_resource::<crate::types::AtomeBevyRendererConfig>()
        .map(|config| config.device_pixel_ratio)
        .unwrap_or(1.0);
    let mut materials = world
        .get_resource_mut::<Assets<BackdropSurfaceMaterial>>()
        .ok_or_else(|| "bevy_backdrop_surface_assets_required".to_string())?;
    let mut material =
        materials.get_mut(&handle).ok_or_else(|| "bevy_backdrop_surface_material_missing".to_string())?;
    material.uniform.tint = Vec4::from_array(style.tint);
    material.uniform.blur =
        Vec4::new(style.blur_px, device_pixel_ratio, backdrop_blur_lod(style.blur_px, device_pixel_ratio), style.tint_fade);
    Ok(())
}

/// Follows the record opacity. Returns true when the glass switched between
/// shown and hidden, so the caller knows the capture camera may toggle.
pub fn sync_backdrop_surface_opacity(world: &mut World, entity: Entity, opacity: f32) -> bool {
    let Some(handle) = world.get::<MeshMaterial2d<BackdropSurfaceMaterial>>(entity).map(|material| material.0.clone())
    else {
        return false;
    };
    let Some(mut materials) = world.get_resource_mut::<Assets<BackdropSurfaceMaterial>>() else {
        return false;
    };
    let Some(mut material) = materials.get_mut(&handle) else {
        return false;
    };
    let next = opacity.clamp(0.0, 1.0);
    let was_visible = material.uniform.size_radius.w > 0.0;
    material.uniform.size_radius.w = next;
    was_visible != (next > 0.0)
}

pub fn refresh_workspace_backdrop_enabled(world: &mut World) -> Result<(), String> {
    let assistant_count =
        world.query::<&MeshMaterial2d<crate::procedural_sdf::ProceduralSdfMaterial>>().iter(world).count();
    // Hidden glass samples nothing: while every system surface is suspended (a
    // drag strips the chrome) the workspace is no longer captured twice.
    let visible_surface_count = {
        let handles: Vec<_> = world
            .query::<&MeshMaterial2d<BackdropSurfaceMaterial>>()
            .iter(world)
            .map(|material| material.0.clone())
            .collect();
        let materials = world.get_resource::<Assets<BackdropSurfaceMaterial>>();
        handles
            .iter()
            .filter(|handle| {
                materials
                    .and_then(|assets| assets.get(*handle))
                    .map(|material| material.uniform.size_radius.w > 0.0)
                    .unwrap_or(true)
            })
            .count()
    };
    set_workspace_backdrop_enabled(world, assistant_count + visible_surface_count > 0)
}
