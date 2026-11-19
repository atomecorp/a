//! Mip 0 of the workspace pyramid taken from a view's frame, inside the ordered
//! 2D pass: every capture texel is the exact area average of the view pixels it
//! covers (`backdrop_snapshot.wgsl`). Bevy's blit reads one pixel per texel with
//! a non-filtering sampler, which quantized every edge under a record's glass to
//! the capture grid (R-189).
use super::{WORKSPACE_BACKDROP_DOWNSCALE, pyramid::PYRAMID_FORMAT};
use bevy::{
    asset::{load_internal_asset, uuid_handle},
    camera::CompositingSpace,
    core_pipeline::FullscreenShader,
    prelude::*,
    render::{
        RenderApp, RenderStartup,
        render_resource::{
            BindGroup, BindGroupEntries, BindGroupLayoutDescriptor, BindGroupLayoutEntries,
            ColorTargetState, ColorWrites, FragmentState, PipelineCache, RenderPipelineDescriptor,
            ShaderStages, SpecializedRenderPipeline, SpecializedRenderPipelines, TextureSampleType,
            TextureView, binding_types::texture_2d,
        },
        renderer::RenderDevice,
    },
    shader::{Shader, ShaderDefVal},
};

const BACKDROP_SNAPSHOT_SHADER_HANDLE: Handle<Shader> =
    uuid_handle!("ae4c98dc-05c9-4715-9e83-44f6d3856962");

/// The reduction's layout and vertex stage; specialized by the view's compositing space.
#[derive(Resource)]
pub(super) struct SnapshotReduction {
    layout: BindGroupLayoutDescriptor,
    fullscreen: FullscreenShader,
}

pub(super) fn install(app: &mut App) {
    load_internal_asset!(
        app,
        BACKDROP_SNAPSHOT_SHADER_HANDLE,
        "assets/shaders/backdrop_snapshot.wgsl",
        Shader::from_wgsl
    );
    if let Some(render_app) = app.get_sub_app_mut(RenderApp) {
        render_app
            .init_resource::<SpecializedRenderPipelines<SnapshotReduction>>()
            .add_systems(RenderStartup, init_snapshot_reduction);
    }
}

fn init_snapshot_reduction(mut commands: Commands, fullscreen: Res<FullscreenShader>) {
    commands.insert_resource(SnapshotReduction {
        layout: BindGroupLayoutDescriptor::new(
            "backdrop_snapshot_layout",
            &BindGroupLayoutEntries::single(
                ShaderStages::FRAGMENT,
                texture_2d(TextureSampleType::Float { filterable: false }),
            ),
        ),
        fullscreen: fullscreen.clone(),
    });
}

impl SnapshotReduction {
    pub(super) fn bind_group(
        &self,
        device: &RenderDevice,
        cache: &PipelineCache,
        view_frame: &TextureView,
    ) -> BindGroup {
        device.create_bind_group(
            "backdrop_snapshot",
            &cache.get_bind_group_layout(&self.layout),
            &BindGroupEntries::single(view_frame),
        )
    }
}

impl SpecializedRenderPipeline for SnapshotReduction {
    /// The view frame's colour space; the pyramid is always linear.
    type Key = Option<CompositingSpace>;

    fn specialize(&self, key: Self::Key) -> RenderPipelineDescriptor {
        let mut shader_defs = vec![ShaderDefVal::UInt(
            "BACKDROP_DOWNSCALE".into(),
            WORKSPACE_BACKDROP_DOWNSCALE,
        )];
        match key {
            Some(CompositingSpace::Srgb) => shader_defs.push("SRGB_TO_LINEAR".into()),
            Some(CompositingSpace::Oklab) => shader_defs.push("OKLAB_TO_LINEAR".into()),
            Some(CompositingSpace::Linear) | None => {}
        }
        RenderPipelineDescriptor {
            label: Some("backdrop_snapshot".into()),
            layout: vec![self.layout.clone()],
            vertex: self.fullscreen.to_vertex_state(),
            fragment: Some(FragmentState {
                shader: BACKDROP_SNAPSHOT_SHADER_HANDLE,
                shader_defs,
                targets: vec![Some(ColorTargetState {
                    format: PYRAMID_FORMAT,
                    blend: None,
                    write_mask: ColorWrites::ALL,
                })],
                ..default()
            }),
            ..default()
        }
    }
}
