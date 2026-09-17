use bevy::{
    core_pipeline::{
        mip_generation::{generate_mips_for_phase, MipGenerationJobs, MipGenerationPhaseId, MipGenerationPipelines},
        Core2d, Core2dSystems,
    },
    prelude::*,
    render::{
        extract_component::ExtractComponentPlugin,
        extract_resource::ExtractResourcePlugin,
        render_asset::RenderAssets,
        render_resource::PipelineCache,
        renderer::{RenderContext, ViewQuery},
        texture::GpuImage,
        Extract, ExtractSchedule, RenderApp,
    },
};

use crate::workspace_backdrop::{AtomeWorkspaceBackdrop, AtomeWorkspaceCamera};

/// Linear reduction applied before building the GPU blur pyramid. Capturing at
/// quarter resolution removes detail that a backdrop blur would discard while
/// reducing both capture bandwidth and every following mip level by 16x.
pub const WORKSPACE_BACKDROP_DOWNSCALE: u32 = 4;
const WORKSPACE_BLUR_MIP_PHASE: MipGenerationPhaseId = MipGenerationPhaseId(0xA70);

pub fn backdrop_capture_pixel_size(surface_pixel_size: UVec2) -> UVec2 {
    UVec2::new(
        surface_pixel_size.x.div_ceil(WORKSPACE_BACKDROP_DOWNSCALE),
        surface_pixel_size.y.div_ceil(WORKSPACE_BACKDROP_DOWNSCALE),
    )
}

/// Full mip count, bounded by Bevy's single-pass downsampler capacity.
pub fn backdrop_mip_level_count(pixel_size: UVec2) -> u32 {
    (u32::BITS - pixel_size.max_element().max(1).leading_zeros()).min(12)
}

/// Converts a public logical-pixel radius into an interpolated pyramid level.
pub fn backdrop_blur_lod(logical_radius_px: f32, device_pixel_ratio: f32) -> f32 {
    let radius_in_capture_texels =
        logical_radius_px.clamp(0.0, 128.0) * device_pixel_ratio.max(1.0) / WORKSPACE_BACKDROP_DOWNSCALE as f32;
    (radius_in_capture_texels.max(0.5) * 2.0).log2().max(0.0)
}

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
            blur_radius_px: 48.0,
            refraction_px: 24.0,
            glass_mix: 1.0,
            rim_refraction_start: 0.20,
            halo_opacity: 0.10,
        }
    }
}

impl AssistantOpticsSettings {
    pub fn normalized(self) -> Self {
        Self {
            blur_radius_px: self.blur_radius_px.clamp(0.0, 128.0),
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

/// Recomputes only the per-material LOD when the WebView DPR changes. Public
/// radii remain stored on their owning material; no global radius can leak from
/// one panel to another.
pub fn refresh_backdrop_blur_metrics(world: &mut World, device_pixel_ratio: f32) {
    if let Some(mut materials) = world.get_resource_mut::<Assets<crate::backdrop_surface::BackdropSurfaceMaterial>>() {
        for (_, material) in materials.iter_mut() {
            let logical_radius = material.uniform.blur.x;
            material.uniform.blur.y = device_pixel_ratio;
            material.uniform.blur.z = backdrop_blur_lod(logical_radius, device_pixel_ratio);
        }
    }
    if let Some(mut materials) = world.get_resource_mut::<Assets<crate::procedural_sdf::ProceduralSdfMaterial>>() {
        for (_, material) in materials.iter_mut() {
            material.uniform.shape.z = device_pixel_ratio.max(1.0);
            material.uniform.shape.w = backdrop_blur_lod(material.uniform.gesture.z, device_pixel_ratio);
        }
    }
}

pub struct WorkspaceBlurPlugin;

impl Plugin for WorkspaceBlurPlugin {
    fn build(&self, app: &mut App) {
        app.init_resource::<AssistantOpticsSettings>();
        if app.get_sub_app_mut(RenderApp).is_none() {
            return;
        }
        app.add_plugins((
            ExtractResourcePlugin::<AtomeWorkspaceBackdrop>::default(),
            ExtractComponentPlugin::<AtomeWorkspaceCamera>::default(),
        ));
        app.sub_app_mut(RenderApp)
            .add_systems(ExtractSchedule, enqueue_workspace_blur_mips)
            .add_systems(Core2d, generate_workspace_blur_mips.in_set(Core2dSystems::PostProcess));
    }
}

fn enqueue_workspace_blur_mips(backdrop: Extract<Res<AtomeWorkspaceBackdrop>>, mut jobs: ResMut<MipGenerationJobs>) {
    if backdrop.enabled {
        jobs.add(WORKSPACE_BLUR_MIP_PHASE, backdrop.image.id());
    }
}

fn generate_workspace_blur_mips(
    _capture_view: ViewQuery<(), With<AtomeWorkspaceCamera>>,
    backdrop: Res<AtomeWorkspaceBackdrop>,
    jobs: Res<MipGenerationJobs>,
    pipeline_cache: Res<PipelineCache>,
    pipelines: Option<Res<MipGenerationPipelines>>,
    gpu_images: Res<RenderAssets<GpuImage>>,
    mut context: RenderContext,
) {
    let Some(pipelines) = pipelines else {
        return;
    };
    let (Some(capture), Some(pyramid)) =
        (gpu_images.get(backdrop.capture_image.id()), gpu_images.get(backdrop.image.id()))
    else {
        return;
    };
    context.command_encoder().copy_texture_to_texture(
        capture.texture.as_image_copy(),
        pyramid.texture.as_image_copy(),
        capture.texture_descriptor.size,
    );
    generate_mips_for_phase(WORKSPACE_BLUR_MIP_PHASE, &jobs, &pipeline_cache, &pipelines, &gpu_images, &mut context);
}
