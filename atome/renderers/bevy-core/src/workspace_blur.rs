use bevy::{
    asset::{load_internal_asset, uuid_handle},
    camera::{visibility::RenderLayers, RenderTarget},
    prelude::*,
    reflect::TypePath,
    render::{
        render_resource::{AsBindGroup, ShaderType},
        RenderApp,
    },
    shader::{Shader, ShaderRef},
    sprite_render::{Material2d, Material2dPlugin},
};

use crate::{
    render_math::atome_camera_projection, types::AtomeBevyRendererConfig,
    video_external_texture::video_quad_mesh_handle_from_size,
};

const WORKSPACE_BLUR_SHADER_HANDLE: Handle<Shader> =
    uuid_handle!("d0d51834-814a-40c6-a889-cc3bcb5c3b37");
pub const HORIZONTAL_BLUR_LAYER: usize = 2;
pub const VERTICAL_BLUR_LAYER: usize = 3;

#[derive(Resource, Clone, Copy, Debug, PartialEq)]
pub struct AssistantOpticsSettings {
    pub blur_radius_px: f32,
    pub refraction_px: f32,
    pub glass_mix: f32,
    pub rim_refraction_start: f32,
    pub halo_opacity: f32,
}

impl Default for AssistantOpticsSettings {
    fn default() -> Self {
        Self {
            blur_radius_px: 16.0,
            refraction_px: 24.0,
            glass_mix: 0.48,
            rim_refraction_start: 0.20,
            halo_opacity: 0.10,
        }
    }
}

impl AssistantOpticsSettings {
    pub fn normalized(self) -> Self {
        Self {
            blur_radius_px: self.blur_radius_px.clamp(0.0, 32.0),
            refraction_px: self.refraction_px.clamp(0.0, 32.0),
            glass_mix: self.glass_mix.clamp(0.0, 1.0),
            rim_refraction_start: self.rim_refraction_start.clamp(0.0, 0.95),
            halo_opacity: self.halo_opacity.clamp(0.0, 0.10),
        }
    }

    pub fn sdf_uniform(self, device_pixel_ratio: f32) -> Vec4 {
        let settings = self.normalized();
        Vec4::new(
            settings.refraction_px * device_pixel_ratio.max(1.0),
            settings.glass_mix,
            settings.rim_refraction_start,
            settings.halo_opacity,
        )
    }
}

#[derive(Clone, Copy, Debug, ShaderType)]
pub struct WorkspaceBlurUniform {
    pub direction_radius: Vec4,
}

#[derive(Asset, TypePath, AsBindGroup, Debug, Clone)]
pub struct WorkspaceBlurMaterial {
    #[uniform(0)]
    pub uniform: WorkspaceBlurUniform,
    #[texture(1)]
    #[sampler(2)]
    pub source: Handle<Image>,
}

impl Material2d for WorkspaceBlurMaterial {
    fn fragment_shader() -> ShaderRef {
        WORKSPACE_BLUR_SHADER_HANDLE.into()
    }
}

pub struct WorkspaceBlurPlugin;

impl Plugin for WorkspaceBlurPlugin {
    fn build(&self, app: &mut App) {
        app.init_resource::<AssistantOpticsSettings>();
        app.init_resource::<Assets<Shader>>();
        load_internal_asset!(
            app,
            WORKSPACE_BLUR_SHADER_HANDLE,
            "assets/shaders/workspace_blur.wgsl",
            Shader::from_wgsl
        );
        app.init_resource::<Assets<WorkspaceBlurMaterial>>();
        if app.get_sub_app_mut(RenderApp).is_some() {
            app.add_plugins(Material2dPlugin::<WorkspaceBlurMaterial>::default());
        }
    }
}

#[derive(Clone)]
pub struct WorkspaceBlurPipeline {
    pub horizontal_image: Handle<Image>,
    pub vertical_image: Handle<Image>,
    pub horizontal_camera: Entity,
    pub vertical_camera: Entity,
    pub horizontal_quad: Entity,
    pub vertical_quad: Entity,
}

pub fn spawn_workspace_blur_pipeline(
    commands: &mut Commands,
    images: &mut Assets<Image>,
    meshes: &mut Assets<Mesh>,
    materials: &mut Assets<WorkspaceBlurMaterial>,
    config: &AtomeBevyRendererConfig,
    source: Handle<Image>,
    target_image: impl Fn() -> Image,
    settings: AssistantOpticsSettings,
) -> WorkspaceBlurPipeline {
    let horizontal_image = images.add(target_image());
    let vertical_image = images.add(target_image());
    let mesh = video_quad_mesh_handle_from_size(
        meshes,
        [config.width, config.height],
        [0.0, 0.0, 1.0, 1.0],
    );
    let radius = settings.normalized().blur_radius_px * config.device_pixel_ratio.max(1.0);
    let horizontal_material = materials.add(WorkspaceBlurMaterial {
        uniform: WorkspaceBlurUniform {
            direction_radius: Vec4::new(1.0, 0.0, radius, 0.0),
        },
        source,
    });
    let vertical_material = materials.add(WorkspaceBlurMaterial {
        uniform: WorkspaceBlurUniform {
            direction_radius: Vec4::new(0.0, 1.0, radius, 0.0),
        },
        source: horizontal_image.clone(),
    });
    let horizontal_quad = commands
        .spawn((
            Mesh2d(mesh.clone()),
            MeshMaterial2d(horizontal_material),
            Visibility::Hidden,
            RenderLayers::layer(HORIZONTAL_BLUR_LAYER),
        ))
        .id();
    let vertical_quad = commands
        .spawn((
            Mesh2d(mesh),
            MeshMaterial2d(vertical_material),
            Visibility::Hidden,
            RenderLayers::layer(VERTICAL_BLUR_LAYER),
        ))
        .id();
    let horizontal_camera = spawn_blur_camera(
        commands,
        config,
        -2,
        horizontal_image.clone(),
        HORIZONTAL_BLUR_LAYER,
    );
    let vertical_camera = spawn_blur_camera(
        commands,
        config,
        -1,
        vertical_image.clone(),
        VERTICAL_BLUR_LAYER,
    );
    WorkspaceBlurPipeline {
        horizontal_image,
        vertical_image,
        horizontal_camera,
        vertical_camera,
        horizontal_quad,
        vertical_quad,
    }
}

fn spawn_blur_camera(
    commands: &mut Commands,
    config: &AtomeBevyRendererConfig,
    order: isize,
    target: Handle<Image>,
    layer: usize,
) -> Entity {
    commands
        .spawn((
            Camera2d,
            Camera {
                order,
                is_active: false,
                ..default()
            },
            RenderTarget::Image(target.into()),
            atome_camera_projection(config.width, config.height),
            RenderLayers::layer(layer),
        ))
        .id()
}
