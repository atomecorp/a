//! An image whose strip carries media effects keeps its sprite (its clip, its
//! opacity, its resource updates stay the sprite's), but the sprite pipeline
//! no longer draws it: its extracted sprite is taken out of `ExtractedSprites`
//! and drawn here, by the media effects shader (`media_fx_image.wgsl`), at the
//! same place, size, crop and depth. An image without effects never comes here.

use std::any::TypeId;

use bevy::{
    core_pipeline::core_2d::{CORE_2D_DEPTH_FORMAT, Transparent2d},
    ecs::system::lifetimeless::SRes,
    image::Image,
    math::{Affine3A, FloatOrd},
    platform::collections::HashSet,
    prelude::*,
    render::{
        Extract, ExtractSchedule, Render, RenderApp, RenderStartup, RenderSystems,
        extract_resource::ExtractResourcePlugin,
        render_asset::RenderAssets,
        render_phase::{
            AddRenderCommand, DrawFunctions, PhaseItem, PhaseItemExtraIndex, RenderCommand,
            RenderCommandResult, SetItemPipeline, TrackedRenderPass, ViewSortedRenderPhases,
        },
        render_resource::{
            BindGroup, BindGroupEntries, BindGroupLayoutDescriptor, BindGroupLayoutEntries,
            BlendState, ColorTargetState, ColorWrites, CompareFunction, DepthBiasState,
            DepthStencilState, FilterMode, FragmentState, MultisampleState, PipelineCache,
            PrimitiveState, RenderPipelineDescriptor, Sampler, SamplerBindingType,
            SamplerDescriptor, ShaderStages, SpecializedRenderPipeline, SpecializedRenderPipelines,
            StencilFaceState, StencilState, TextureFormat, TextureSampleType, VertexState,
            binding_types::{sampler, texture_2d, texture_3d, uniform_buffer_sized},
        },
        renderer::{RenderDevice, RenderQueue},
        sync_world::MainEntity,
        texture::GpuImage,
        view::{ExtractedView, RenderVisibleEntities},
    },
    sprite_render::{
        ExtractedSpriteKind, ExtractedSprites, Mesh2dPipeline, SetMesh2dViewBindGroup,
        SpriteSystems, init_mesh_2d_pipeline,
    },
};

use crate::frame_uniforms::FrameUniforms;

use super::{
    AtomeMediaFx, MediaFxStack,
    clock::MediaFxClock,
    lut::{AtomeLutLibrary, CubeLut, resolve_lut},
    media_fx_shader_source, media_fx_uniform_bytes,
};

const IMAGE_FX_SHADER: &str = include_str!("../../assets/shaders/media_fx_image.wgsl");

/// The 2×2×2 identity cube bound where a draw has no LUT: the `lut` slot reads
/// `info.z` and leaves the colour as it is until the chain's file is loaded.
#[derive(Resource, Clone)]
pub(crate) struct MediaFxLutPlaceholder(pub Handle<Image>);

#[derive(Resource)]
struct ImageFxShader(Handle<Shader>);

struct ExtractedImageFx {
    main_entity: MainEntity,
    render_entity: Entity,
    transform: GlobalTransform,
    color: LinearRgba,
    image: AssetId<Image>,
    flip_x: bool,
    flip_y: bool,
    rect: Option<Rect>,
    custom_size: Option<Vec2>,
    anchor: Vec2,
    stack: MediaFxStack,
}

#[derive(Resource, Default)]
struct ExtractedImageFxDraws(Vec<ExtractedImageFx>);

#[derive(Resource, Default)]
struct PreparedImageFx(bevy::platform::collections::HashMap<MainEntity, BindGroup>);

#[derive(Resource, Default)]
struct ImageFxUniforms(FrameUniforms<MainEntity>);

#[derive(Resource)]
struct ImageFxPipeline {
    view_layout: BindGroupLayoutDescriptor,
    layout: BindGroupLayoutDescriptor,
    shader: Handle<Shader>,
    lut_sampler: Sampler,
}

#[derive(Clone, Copy, PartialEq, Eq, Hash)]
struct ImageFxPipelineKey {
    format: TextureFormat,
    samples: u32,
}

type DrawImageFx = (
    SetItemPipeline,
    SetMesh2dViewBindGroup<0>,
    SetImageFxBindGroup<1>,
    DrawImageFxQuad,
);

pub(crate) fn lut_placeholder_image() -> Image {
    let mut table = Vec::with_capacity(8);
    for b in 0..2 {
        for g in 0..2 {
            for r in 0..2 {
                table.push([r as f32, g as f32, b as f32]);
            }
        }
    }
    CubeLut {
        size: 2,
        domain_min: [0.0; 3],
        domain_max: [1.0; 3],
        table,
    }
    .image()
}

pub(crate) fn build_image_fx_renderer(app: &mut App) {
    let Some(mut shaders) = app.world_mut().get_resource_mut::<Assets<Shader>>() else {
        return;
    };
    let shader = shaders.add(Shader::from_wgsl(
        media_fx_shader_source(IMAGE_FX_SHADER),
        file!(),
    ));
    let Some(mut images) = app.world_mut().get_resource_mut::<Assets<Image>>() else {
        return;
    };
    let placeholder = images.add(lut_placeholder_image());
    app.add_plugins(ExtractResourcePlugin::<AtomeLutLibrary>::default());
    let Some(render_app) = app.get_sub_app_mut(RenderApp) else {
        return;
    };
    render_app
        .insert_resource(ImageFxShader(shader))
        .insert_resource(MediaFxLutPlaceholder(placeholder))
        .init_resource::<ExtractedImageFxDraws>()
        .init_resource::<PreparedImageFx>()
        .init_resource::<ImageFxUniforms>()
        .init_resource::<SpecializedRenderPipelines<ImageFxPipeline>>()
        .add_render_command::<Transparent2d, DrawImageFx>()
        .add_systems(
            RenderStartup,
            init_image_fx_pipeline.after(init_mesh_2d_pipeline),
        )
        .add_systems(
            ExtractSchedule,
            extract_image_fx.after(SpriteSystems::ExtractSprites),
        )
        .add_systems(
            Render,
            (
                queue_image_fx.in_set(RenderSystems::Queue),
                prepare_image_fx.in_set(RenderSystems::PrepareBindGroups),
            ),
        );
}

/// Takes the images carrying effects out of the sprite pipeline's list.
fn extract_image_fx(
    mut sprites: ResMut<ExtractedSprites>,
    mut draws: ResMut<ExtractedImageFxDraws>,
    effects: Extract<Query<&AtomeMediaFx>>,
) {
    draws.0.clear();
    sprites.sprites.retain(|sprite| {
        let Ok(fx) = effects.get(sprite.main_entity) else {
            return true;
        };
        let ExtractedSpriteKind::Single {
            anchor,
            rect,
            custom_size,
            ..
        } = sprite.kind
        else {
            return true;
        };
        draws.0.push(ExtractedImageFx {
            main_entity: sprite.main_entity.into(),
            render_entity: sprite.render_entity,
            transform: sprite.transform,
            color: sprite.color,
            image: sprite.image_handle_id,
            flip_x: sprite.flip_x,
            flip_y: sprite.flip_y,
            rect,
            custom_size,
            anchor,
            stack: fx.0.clone(),
        });
        false
    });
}

fn init_image_fx_pipeline(
    mut commands: Commands,
    render_device: Res<RenderDevice>,
    mesh2d_pipeline: Res<Mesh2dPipeline>,
    shader: Res<ImageFxShader>,
) {
    let layout = BindGroupLayoutDescriptor::new(
        "atome_image_fx_layout",
        &BindGroupLayoutEntries::sequential(
            ShaderStages::VERTEX_FRAGMENT,
            (
                texture_2d(TextureSampleType::Float { filterable: true }),
                sampler(SamplerBindingType::Filtering),
                uniform_buffer_sized(false, None),
                texture_3d(TextureSampleType::Float { filterable: true }),
                sampler(SamplerBindingType::Filtering),
                uniform_buffer_sized(false, None),
            ),
        ),
    );
    let lut_sampler = render_device.create_sampler(&SamplerDescriptor {
        label: Some("atome_media_fx_lut_sampler"),
        mag_filter: FilterMode::Linear,
        min_filter: FilterMode::Linear,
        ..default()
    });
    commands.insert_resource(ImageFxPipeline {
        view_layout: mesh2d_pipeline.view_layout.clone(),
        layout,
        shader: shader.0.clone(),
        lut_sampler,
    });
}

impl SpecializedRenderPipeline for ImageFxPipeline {
    type Key = ImageFxPipelineKey;
    fn specialize(&self, key: Self::Key) -> RenderPipelineDescriptor {
        RenderPipelineDescriptor {
            vertex: VertexState {
                shader: self.shader.clone(),
                buffers: vec![],
                ..default()
            },
            fragment: Some(FragmentState {
                shader: self.shader.clone(),
                targets: vec![Some(ColorTargetState {
                    format: key.format,
                    blend: Some(BlendState::ALPHA_BLENDING),
                    write_mask: ColorWrites::ALL,
                })],
                ..default()
            }),
            layout: vec![self.view_layout.clone(), self.layout.clone()],
            primitive: PrimitiveState::default(),
            depth_stencil: Some(DepthStencilState {
                format: CORE_2D_DEPTH_FORMAT,
                depth_write_enabled: Some(false),
                depth_compare: Some(CompareFunction::GreaterEqual),
                stencil: StencilState {
                    front: StencilFaceState::IGNORE,
                    back: StencilFaceState::IGNORE,
                    read_mask: 0,
                    write_mask: 0,
                },
                bias: DepthBiasState {
                    constant: 0,
                    slope_scale: 0.0,
                    clamp: 0.0,
                },
            }),
            multisample: MultisampleState {
                count: key.samples,
                mask: !0,
                alpha_to_coverage_enabled: false,
            },
            label: Some("atome_image_fx_pipeline".into()),
            ..default()
        }
    }
}

fn queue_image_fx(
    draw_functions: Res<DrawFunctions<Transparent2d>>,
    pipeline: Option<Res<ImageFxPipeline>>,
    mut pipelines: ResMut<SpecializedRenderPipelines<ImageFxPipeline>>,
    pipeline_cache: Res<PipelineCache>,
    draws: Res<ExtractedImageFxDraws>,
    mut phases: ResMut<ViewSortedRenderPhases<Transparent2d>>,
    views: Query<(&RenderVisibleEntities, &ExtractedView, &Msaa)>,
) {
    let Some(pipeline) = pipeline else {
        return;
    };
    if draws.0.is_empty() {
        return;
    }
    let draw_function = draw_functions.read().id::<DrawImageFx>();
    for (visible, view, msaa) in &views {
        let Some(phase) = phases.get_mut(&view.retained_view_entity) else {
            continue;
        };
        let Some(sprites) = visible.classes.get(&TypeId::of::<Sprite>()) else {
            continue;
        };
        let shown: HashSet<MainEntity> = sprites.iter_visible().map(|(_, main)| *main).collect();
        let pipeline_id = pipelines.specialize(
            &pipeline_cache,
            &pipeline,
            ImageFxPipelineKey {
                format: view.target_format,
                samples: msaa.samples(),
            },
        );
        for draw in draws
            .0
            .iter()
            .filter(|draw| shown.contains(&draw.main_entity))
        {
            phase.add_transient(Transparent2d {
                entity: (draw.render_entity, draw.main_entity),
                draw_function,
                pipeline: pipeline_id,
                sort_key: FloatOrd(draw.transform.translation().z),
                batch_range: 0..1,
                extra_index: PhaseItemExtraIndex::None,
                extracted_index: usize::MAX,
                indexed: false,
            });
        }
    }
}

/// The sprite's quad and texture rectangle, computed as the sprite pipeline
/// does (`bevy_sprite_render::prepare_sprite_image_bind_groups`), and the
/// rectangle as the effects read it (top-left corner, extent).
fn image_quad(draw: &ExtractedImageFx, image_size: Vec2) -> (Mat4, Vec4, Vec2, [f32; 4]) {
    let mut quad_size = image_size;
    let mut uv = match draw.rect {
        Some(rect) => {
            quad_size = rect.size();
            Vec4::new(
                rect.min.x / image_size.x,
                rect.max.y / image_size.y,
                rect.size().x / image_size.x,
                -rect.size().y / image_size.y,
            )
        }
        None => Vec4::new(0.0, 1.0, 1.0, -1.0),
    };
    if draw.flip_x {
        uv.x += uv.z;
        uv.z *= -1.0;
    }
    if draw.flip_y {
        uv.y += uv.w;
        uv.w *= -1.0;
    }
    let quad_size = draw.custom_size.unwrap_or(quad_size);
    let affine = draw.transform.affine()
        * Affine3A::from_scale_rotation_translation(
            quad_size.extend(1.0),
            Quat::IDENTITY,
            (quad_size * (-draw.anchor - Vec2::splat(0.5))).extend(0.0),
        );
    let shown = [uv.x, uv.y + uv.w, uv.z, -uv.w];
    (Mat4::from(affine), uv, quad_size, shown)
}

fn prepare_image_fx(
    render_device: Res<RenderDevice>,
    render_queue: Res<RenderQueue>,
    mut uniforms: ResMut<ImageFxUniforms>,
    pipeline: Option<Res<ImageFxPipeline>>,
    pipeline_cache: Res<PipelineCache>,
    gpu_images: Res<RenderAssets<GpuImage>>,
    placeholder: Res<MediaFxLutPlaceholder>,
    luts: Res<AtomeLutLibrary>,
    clock: Res<MediaFxClock>,
    draws: Res<ExtractedImageFxDraws>,
    mut prepared: ResMut<PreparedImageFx>,
) {
    prepared.0.clear();
    let Some(pipeline) = pipeline else {
        return;
    };
    let Some(placeholder) = gpu_images.get(&placeholder.0) else {
        return;
    };
    let layout = pipeline_cache.get_bind_group_layout(&pipeline.layout);
    for draw in &draws.0 {
        // An image still uploading is drawn next frame, as a sprite would be.
        let Some(image) = gpu_images.get(draw.image) else {
            continue;
        };
        let (world_from_local, uv, size, shown) = image_quad(draw, image.size_2d().as_vec2());
        let (lut_view, lut) = resolve_lut(&draw.stack, &luts, &gpu_images, placeholder);
        let fx_bytes =
            media_fx_uniform_bytes(Some(&draw.stack), size.to_array(), shown, clock.0, lut);
        let mut instance = Vec::with_capacity(24);
        instance.extend_from_slice(&world_from_local.to_cols_array());
        instance.extend_from_slice(&uv.to_array());
        instance.extend_from_slice(&draw.color.to_f32_array());
        let instance_bytes: Vec<u8> = instance
            .iter()
            .flat_map(|value| value.to_ne_bytes())
            .collect();
        let buffers = uniforms.0.write(
            &render_device,
            &render_queue,
            draw.main_entity,
            "atome_image_fx_params",
            &[&fx_bytes, &instance_bytes],
        );
        let bind_group = render_device.create_bind_group(
            "atome_image_fx_bind_group",
            &layout,
            &BindGroupEntries::sequential((
                &image.texture_view,
                &image.sampler,
                buffers[0].as_entire_binding(),
                lut_view,
                &pipeline.lut_sampler,
                buffers[1].as_entire_binding(),
            )),
        );
        prepared.0.insert(draw.main_entity, bind_group);
    }
    uniforms.0.release_unwritten();
}

struct SetImageFxBindGroup<const I: usize>;

impl<P: PhaseItem, const I: usize> RenderCommand<P> for SetImageFxBindGroup<I> {
    type Param = SRes<PreparedImageFx>;
    type ViewQuery = ();
    type ItemQuery = ();
    fn render<'w>(
        item: &P,
        _view: (),
        _entity: Option<()>,
        prepared: bevy::ecs::system::SystemParamItem<'w, '_, Self::Param>,
        pass: &mut TrackedRenderPass<'w>,
    ) -> RenderCommandResult {
        let Some(bind_group) = prepared.into_inner().0.get(&item.main_entity()) else {
            return RenderCommandResult::Skip;
        };
        pass.set_bind_group(I, bind_group, &[]);
        RenderCommandResult::Success
    }
}

struct DrawImageFxQuad;

impl<P: PhaseItem> RenderCommand<P> for DrawImageFxQuad {
    type Param = ();
    type ViewQuery = ();
    type ItemQuery = ();
    fn render<'w>(
        _item: &P,
        _view: (),
        _entity: Option<()>,
        _param: (),
        pass: &mut TrackedRenderPass<'w>,
    ) -> RenderCommandResult {
        pass.draw(0..6, 0..1);
        RenderCommandResult::Success
    }
}

#[cfg(test)]
pub(crate) fn image_quad_rect_for_tests(
    rect: Option<Rect>,
    custom_size: Option<Vec2>,
    image_size: Vec2,
) -> [f32; 4] {
    let draw = ExtractedImageFx {
        main_entity: MainEntity::from(Entity::PLACEHOLDER),
        render_entity: Entity::PLACEHOLDER,
        transform: GlobalTransform::IDENTITY,
        color: LinearRgba::WHITE,
        image: AssetId::default(),
        flip_x: false,
        flip_y: false,
        rect,
        custom_size,
        anchor: Vec2::ZERO,
        stack: MediaFxStack::default(),
    };
    image_quad(&draw, image_size).3
}
