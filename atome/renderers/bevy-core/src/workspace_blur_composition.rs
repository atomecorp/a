//! Ordered snapshots inside the shared 2D pass. A material never samples the
//! attachment it is drawing into, itself, or a later item in the sorted phase.
use super::{backdrop_blur_lod, WORKSPACE_BACKDROP_DOWNSCALE, WORKSPACE_BLUR_MIP_PHASE};
use crate::{
    backdrop_surface::BackdropSurfaceMaterial, procedural_sdf::ProceduralSdfMaterial,
    workspace_backdrop::AtomeWorkspaceBackdrop,
};
use bevy::{
    core_pipeline::{
        blit::{BlitPipeline, BlitPipelineKey},
        core_2d::{main_opaque_pass_2d, main_transparent_pass_2d, Transparent2d},
        mip_generation::{generate_mips_for_phase, MipGenerationJobs, MipGenerationPipelines},
        Core2d, Core2dSystems,
    },
    ecs::schedule::ScheduleCleanupPolicy,
    mesh::VertexAttributeValues,
    platform::collections::HashMap,
    prelude::*,
    render::{
        camera::ExtractedCamera,
        render_asset::RenderAssets,
        render_phase::{PhaseItem, ViewSortedRenderPhases},
        render_resource::{
            BindGroup, CachedRenderPipelineId, LoadOp, Operations, PipelineCache,
            RenderPassColorAttachment, RenderPassDescriptor, SpecializedRenderPipelines, StoreOp,
            TextureView, TextureViewDescriptor, TextureViewId,
        },
        renderer::{RenderContext, RenderDevice, ViewQuery},
        texture::GpuImage,
        view::{ExtractedView, ViewDepthTexture, ViewTarget},
        Extract, ExtractSchedule, Render, RenderApp, RenderSystems,
    },
};
use std::ops::Range;

#[derive(Clone, Copy, Debug)]
pub(crate) struct SampleRegion {
    pub paint: Rect,
    pub sample: Rect,
}

/// Disposable render extraction, derived from actual clipped meshes/materials.
#[derive(Resource, Default)]
struct SampleRegions(HashMap<Entity, SampleRegion>);

#[derive(Component)]
struct SnapshotPipeline {
    pipeline: CachedRenderPipelineId,
    key: BlitPipelineKey,
    source: TextureViewId,
    pyramid: TextureViewId,
    bind_group: BindGroup,
    mip_zero: TextureView,
}

pub(super) fn install(app: &mut App) {
    let render_app = app.sub_app_mut(RenderApp);
    render_app
        .init_resource::<SampleRegions>()
        .add_systems(ExtractSchedule, extract_sample_regions)
        .add_systems(
            Render,
            prepare_snapshots.in_set(RenderSystems::PrepareBindGroups),
        );
    render_app
        .world_mut()
        .schedule_scope(Core2d, |world, schedule| {
            let removed = schedule
                .remove_systems_in_set(
                    main_transparent_pass_2d,
                    world,
                    ScheduleCleanupPolicy::RemoveSystemsOnly,
                )
                .expect("shared transparent pass must be registered");
            assert_eq!(
                removed, 1,
                "exactly one shared transparent pass must be replaced"
            );
        });
    render_app.add_systems(
        Core2d,
        compose_transparent_pass
            .in_set(Core2dSystems::MainPass)
            .after(main_opaque_pass_2d),
    );
}

pub(crate) fn mesh_region(
    mesh: &Mesh,
    transform: &GlobalTransform,
    radius: f32,
    dpr: f32,
    refraction: f32,
) -> Option<SampleRegion> {
    let VertexAttributeValues::Float32x3(positions) = mesh.attribute(Mesh::ATTRIBUTE_POSITION)?
    else {
        return None;
    };
    if positions.is_empty() {
        return None;
    }
    let mut min = Vec2::splat(f32::INFINITY);
    let mut max = Vec2::splat(f32::NEG_INFINITY);
    for point in positions {
        let world = transform
            .transform_point(Vec3::from_array(*point))
            .truncate();
        min = min.min(world);
        max = max.max(world);
    }
    let paint = Rect { min, max };
    // The upper interpolated B-spline mip can reach two texels on either side.
    // Include its full support and refraction, not just the nominal blur radius.
    let upper = (backdrop_blur_lod(radius, dpr) - 0.4).max(0.0).ceil();
    let padding = (2.0 * upper.exp2() + 1.0) * WORKSPACE_BACKDROP_DOWNSCALE as f32 / dpr.max(1.0)
        + refraction.abs() / dpr.max(1.0);
    Some(SampleRegion {
        paint,
        sample: Rect {
            min: min - Vec2::splat(padding),
            max: max + Vec2::splat(padding),
        },
    })
}

fn extract_sample_regions(
    mut regions: ResMut<SampleRegions>,
    meshes: Extract<Res<Assets<Mesh>>>,
    glass_assets: Extract<Res<Assets<BackdropSurfaceMaterial>>>,
    sdf_assets: Extract<Res<Assets<ProceduralSdfMaterial>>>,
    glass: Extract<
        Query<(
            Entity,
            &Mesh2d,
            &GlobalTransform,
            &MeshMaterial2d<BackdropSurfaceMaterial>,
        )>,
    >,
    sdf: Extract<
        Query<(
            Entity,
            &Mesh2d,
            &GlobalTransform,
            &MeshMaterial2d<ProceduralSdfMaterial>,
        )>,
    >,
) {
    regions.0.clear();
    for (entity, mesh, transform, handle) in &glass {
        if let (Some(mesh), Some(material)) = (meshes.get(&mesh.0), glass_assets.get(&handle.0)) {
            if let Some(region) = mesh_region(
                mesh,
                transform,
                material.uniform.blur.x,
                material.uniform.blur.y,
                0.0,
            ) {
                regions.0.insert(entity, region);
            }
        }
    }
    for (entity, mesh, transform, handle) in &sdf {
        if let (Some(mesh), Some(material)) = (meshes.get(&mesh.0), sdf_assets.get(&handle.0)) {
            if material.uniform.gesture.z > 0.0 {
                if let Some(region) = mesh_region(
                    mesh,
                    transform,
                    material.uniform.gesture.z,
                    material.uniform.shape.z,
                    material.uniform.optics.x,
                ) {
                    regions.0.insert(entity, region);
                }
            }
        }
    }
}

fn prepare_snapshots(
    mut commands: Commands,
    backdrop: Res<AtomeWorkspaceBackdrop>,
    gpu_images: Res<RenderAssets<GpuImage>>,
    blit: Res<BlitPipeline>,
    device: Res<RenderDevice>,
    mut cache: ResMut<PipelineCache>,
    mut pipelines: ResMut<SpecializedRenderPipelines<BlitPipeline>>,
    views: Query<(Entity, &ViewTarget, Option<&SnapshotPipeline>)>,
) {
    let Some(pyramid) = gpu_images.get(backdrop.image.id()) else {
        return;
    };
    for (entity, target, previous) in &views {
        let source = target.main_texture_view();
        let key = BlitPipelineKey {
            target_format: pyramid.texture_descriptor.format,
            blend_state: None,
            samples: 1,
            source_space: target.compositing_space,
        };
        if previous.is_some_and(|p| {
            p.source == source.id() && p.pyramid == pyramid.texture_view.id() && p.key == key
        }) {
            continue;
        }
        let pipeline = pipelines.specialize(&cache, &blit, key);
        cache.block_on_render_pipeline(pipeline);
        let mip_zero = pyramid.texture.create_view(&TextureViewDescriptor {
            label: Some("ordered_backdrop_mip_zero"),
            base_mip_level: 0,
            mip_level_count: Some(1),
            ..default()
        });
        commands.entity(entity).insert(SnapshotPipeline {
            pipeline,
            key,
            source: source.id(),
            pyramid: pyramid.texture_view.id(),
            bind_group: blit.create_bind_group(&device, source, &cache),
            mip_zero,
        });
    }
}

fn overlaps(a: Rect, b: Rect) -> bool {
    a.min.x < b.max.x && a.max.x > b.min.x && a.min.y < b.max.y && a.max.y > b.min.y
}

/// Only consecutive surfaces with independent sample footprints share a capture.
pub(crate) fn composition_ranges(
    items: impl IntoIterator<Item = (usize, Option<SampleRegion>)>,
    len: usize,
) -> Vec<(Range<usize>, bool)> {
    let mut result = Vec::new();
    let mut start = 0;
    let mut glass_group = false;
    let mut painted: Vec<Rect> = Vec::new();
    for (index, sample) in items {
        let split = match sample {
            Some(region) => !glass_group || painted.iter().any(|p| overlaps(region.sample, *p)),
            None => glass_group,
        };
        if split {
            if index > start {
                result.push((start..index, glass_group));
            }
            start = index;
            painted.clear();
        }
        glass_group = sample.is_some();
        if let Some(region) = sample {
            painted.push(region.paint);
        }
    }
    if start < len {
        result.push((start..len, glass_group));
    }
    result
}

fn compose_transparent_pass(
    world: &World,
    view: ViewQuery<(
        &ExtractedCamera,
        &ExtractedView,
        &ViewTarget,
        &ViewDepthTexture,
        Option<&SnapshotPipeline>,
    )>,
    phases: Res<ViewSortedRenderPhases<Transparent2d>>,
    regions: Res<SampleRegions>,
    jobs: Res<MipGenerationJobs>,
    cache: Res<PipelineCache>,
    mip_pipelines: Res<MipGenerationPipelines>,
    gpu_images: Res<RenderAssets<GpuImage>>,
    mut ctx: RenderContext,
) -> Result<(), BevyError> {
    let view_entity = view.entity();
    let (camera, extracted, target, depth, snapshot) = view.into_inner();
    let Some(phase) = phases.get(&extracted.retained_view_entity) else {
        return Ok(());
    };
    let ranges = composition_ranges(
        phase
            .items
            .values()
            .enumerate()
            .filter(|(_, item)| !item.batch_range().is_empty())
            .map(|(i, item)| (i, regions.0.get(&item.main_entity().id()).copied())),
        phase.items.len(),
    );
    if ranges.is_empty() || ranges.first().is_some_and(|(_, capture)| *capture) {
        // Preserve Bevy's camera clear even when no transparent items remain.
        // When glass is the first draw, commit this frame's camera clear before
        // sampling. Otherwise a fresh target reads black or the previous frame.
        let attachments = [Some(target.get_color_attachment())];
        ctx.command_encoder()
            .begin_render_pass(&RenderPassDescriptor {
                label: Some("ordered_backdrop_initial_clear"),
                color_attachments: &attachments,
                depth_stencil_attachment: Some(depth.get_attachment(StoreOp::Store)),
                timestamp_writes: None,
                occlusion_query_set: None,
                multiview_mask: None,
            });
    }
    for (range, capture) in ranges {
        if capture {
            let snapshot = snapshot.ok_or("ordered_backdrop_snapshot_unavailable")?;
            let pipeline = cache
                .get_render_pipeline(snapshot.pipeline)
                .ok_or("ordered_backdrop_pipeline_unavailable")?;
            {
                let attachments = [Some(RenderPassColorAttachment {
                    view: &snapshot.mip_zero,
                    resolve_target: None,
                    depth_slice: None,
                    ops: Operations {
                        load: LoadOp::Clear(default()),
                        store: StoreOp::Store,
                    },
                })];
                let mut pass = ctx
                    .command_encoder()
                    .begin_render_pass(&RenderPassDescriptor {
                        label: Some("ordered_backdrop_snapshot"),
                        color_attachments: &attachments,
                        depth_stencil_attachment: None,
                        timestamp_writes: None,
                        occlusion_query_set: None,
                        multiview_mask: None,
                    });
                pass.set_pipeline(pipeline);
                pass.set_bind_group(0, &snapshot.bind_group, &[]);
                pass.draw(0..3, 0..1);
            }
            generate_mips_for_phase(
                WORKSPACE_BLUR_MIP_PHASE,
                &jobs,
                &cache,
                &mip_pipelines,
                &gpu_images,
                &mut ctx,
            );
        }
        let attachments = [Some(target.get_color_attachment())];
        let mut pass = ctx.begin_tracked_render_pass(RenderPassDescriptor {
            label: Some("ordered_transparent_2d"),
            color_attachments: &attachments,
            depth_stencil_attachment: Some(depth.get_attachment(StoreOp::Store)),
            timestamp_writes: None,
            occlusion_query_set: None,
            multiview_mask: None,
        });
        if let Some(viewport) = &camera.viewport {
            pass.set_camera_viewport(viewport);
        }
        phase
            .render_range(&mut pass, world, view_entity, range)
            .map_err(|error| {
                BevyError::from(format!("ordered_transparent_2d_draw_failed: {error:?}"))
            })?;
    }
    Ok(())
}
