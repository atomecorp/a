//! The browser side of `browser_texture.rs`: the staged bitmaps, the textures waiting for their copy and the
//! render-world pass that copies and converts them before any camera draws.
use std::{
    cell::{Cell, RefCell},
    collections::HashMap,
};

use bevy::{
    asset::{RenderAssetUsages, load_internal_asset, uuid_handle},
    core_pipeline::{FullscreenShader, schedule::camera_driver},
    image::ImageSampler,
    prelude::*,
    render::{
        ExtractSchedule, MainWorld, RenderApp, RenderStartup,
        render_asset::RenderAssets,
        render_resource::{
            BindGroupEntries, BindGroupLayoutDescriptor, BindGroupLayoutEntries,
            CachedRenderPipelineId, ColorTargetState, ColorWrites, Extent3d, FragmentState,
            PipelineCache, RenderPipelineDescriptor, ShaderStages, ShaderType, Texture,
            TextureDescriptor, TextureDimension, TextureFormat, TextureSampleType, TextureUsages,
            TextureViewDescriptor, UniformBuffer,
            binding_types::{texture_2d, uniform_buffer},
        },
        renderer::{RenderContext, RenderDevice, RenderGraph, RenderGraphSystems, RenderQueue},
        texture::GpuImage,
    },
    shader::Shader,
};
use wasm_bindgen::{JsCast, JsValue};

use crate::{
    shape_shadow_gpu::{pass, pipelines_ready},
    types::AtomeTexture,
};

const BROWSER_TEXTURE_SHADER_HANDLE: Handle<Shader> =
    uuid_handle!("8d2b6f14-3c7a-4e95-a1d0-6b9e2f4c8a37");
/// The texture every renderer samples (as the CPU path uploaded it), written through its raw view.
const TARGET_FORMAT: TextureFormat = TextureFormat::Rgba8UnormSrgb;
const RAW_FORMAT: TextureFormat = TextureFormat::Rgba8Unorm;

#[derive(Clone, Copy, Debug, Default, ShaderType)]
struct BrowserTextureUniform {
    mask: Vec4,
}

/// One texture to fill: its image, the bitmap the GPU copies and the spatial mask's coverage, if any.
struct BrowserTextureJob {
    image: AssetId<Image>,
    source: wgpu::ExternalImageSource,
    width: u32,
    height: u32,
    mask: Option<AtomeTexture>,
}

// The renderer runs on the page's one thread: the bitmaps never leave it.
thread_local! {
    static STAGED: RefCell<HashMap<u32, wgpu::ExternalImageSource>> = RefCell::new(HashMap::new());
    static NEXT_SLOT: Cell<u32> = const { Cell::new(1) };
    static JOBS: RefCell<Vec<BrowserTextureJob>> = const { RefCell::new(Vec::new()) };
}

/// Stages every browser image of a payload sent to the renderer (ops, one op's node or patch, a scene): a
/// texture painted by the browser travels as its `ImageBitmap` (`texture.bitmap`), kept here under a slot that
/// replaces it (`texture.external`) until the op naming it makes its texture.
pub fn stage_browser_images(value: &JsValue) -> Result<(), String> {
    if let Some(items) = value.dyn_ref::<js_sys::Array>() {
        return items
            .iter()
            .try_for_each(|item| stage_browser_images(&item));
    }
    if !value.is_object() {
        return Ok(());
    }
    stage_texture(&field(value, "texture")?)?;
    for carrier in ["node", "patch"] {
        let carrier = field(value, carrier)?;
        if carrier.is_object() {
            stage_texture(&field(&carrier, "texture")?)?;
        }
    }
    let nodes = field(value, "nodes")?;
    if nodes.is_array() {
        stage_browser_images(&nodes)?;
    }
    Ok(())
}

fn field(value: &JsValue, name: &str) -> Result<JsValue, String> {
    js_sys::Reflect::get(value, &JsValue::from_str(name))
        .map_err(|_| format!("bevy_texture_browser_payload_unreadable:{name}"))
}

fn stage_texture(texture: &JsValue) -> Result<(), String> {
    if !texture.is_object() {
        return Ok(());
    }
    let bitmap = field(texture, "bitmap")?;
    if bitmap.is_undefined() {
        return Ok(());
    }
    let bitmap = bitmap
        .dyn_into::<web_sys::ImageBitmap>()
        .map_err(|_| "bevy_texture_browser_source_invalid".to_string())?;
    let slot = NEXT_SLOT.with(|next| {
        let slot = next.get();
        next.set(slot.wrapping_add(1).max(1));
        slot
    });
    STAGED.with(|staged| {
        staged
            .borrow_mut()
            .insert(slot, wgpu::ExternalImageSource::ImageBitmap(bitmap))
    });
    let object = texture.unchecked_ref::<js_sys::Object>();
    js_sys::Reflect::set(object, &JsValue::from_str("external"), &JsValue::from(slot))
        .and_then(|_| js_sys::Reflect::delete_property(object, &JsValue::from_str("bitmap")))
        .map(|_| ())
        .map_err(|_| "bevy_texture_browser_payload_unwritable".to_string())
}

/// Drops the bitmaps no applied op claimed (an op that failed before its texture was made).
pub fn release_unclaimed_browser_texture_sources() {
    STAGED.with(|staged| staged.borrow_mut().clear());
}

pub(crate) fn queue_browser_texture(
    images: &mut Assets<Image>,
    texture: &AtomeTexture,
    id: &str,
    mask: Option<AtomeTexture>,
) -> Result<Handle<Image>, String> {
    let slot = texture
        .external
        .ok_or_else(|| format!("bevy_texture_browser_slot_required:{id}"))?;
    let source = STAGED
        .with(|staged| staged.borrow_mut().remove(&slot))
        .ok_or_else(|| format!("bevy_texture_browser_source_missing:{id}"))?;
    if texture.width == 0
        || texture.height == 0
        || source.width() != texture.width
        || source.height() != texture.height
    {
        return Err(format!("bevy_texture_browser_source_size_invalid:{id}"));
    }
    let mut image = Image::new_uninit(
        Extent3d {
            width: texture.width,
            height: texture.height,
            depth_or_array_layers: 1,
        },
        TextureDimension::D2,
        TARGET_FORMAT,
        RenderAssetUsages::default(),
    );
    image.texture_descriptor.usage =
        TextureUsages::TEXTURE_BINDING | TextureUsages::RENDER_ATTACHMENT;
    image.texture_descriptor.view_formats = &[RAW_FORMAT];
    image.sampler = ImageSampler::linear();
    let handle = images.add(image);
    JOBS.with(|jobs| {
        jobs.borrow_mut().push(BrowserTextureJob {
            image: handle.id(),
            source,
            width: texture.width,
            height: texture.height,
            mask,
        })
    });
    Ok(handle)
}

pub struct BrowserTexturePlugin;

impl Plugin for BrowserTexturePlugin {
    fn build(&self, app: &mut App) {
        load_internal_asset!(
            app,
            BROWSER_TEXTURE_SHADER_HANDLE,
            "assets/shaders/browser_texture.wgsl",
            Shader::from_wgsl
        );
        let Some(render_app) = app.get_sub_app_mut(RenderApp) else {
            return;
        };
        render_app
            .add_systems(RenderStartup, init_pipeline)
            .add_systems(ExtractSchedule, forget_dropped_textures)
            .add_systems(
                RenderGraph,
                fill_browser_textures
                    .in_set(RenderGraphSystems::Render)
                    .before(camera_driver),
            );
    }
}

#[derive(Resource)]
struct BrowserTexturePipeline {
    layout: BindGroupLayoutDescriptor,
    id: CachedRenderPipelineId,
    /// The coverage of an unmasked image: one white texel.
    no_mask: Texture,
}

fn init_pipeline(
    mut commands: Commands,
    fullscreen: Res<FullscreenShader>,
    cache: Res<PipelineCache>,
    device: Res<RenderDevice>,
    queue: Res<RenderQueue>,
) {
    let layout = BindGroupLayoutDescriptor::new(
        "browser_texture_layout",
        &BindGroupLayoutEntries::sequential(
            ShaderStages::FRAGMENT,
            (
                texture_2d(TextureSampleType::Float { filterable: false }),
                texture_2d(TextureSampleType::Float { filterable: false }),
                uniform_buffer::<BrowserTextureUniform>(false),
            ),
        ),
    );
    let id = cache.queue_render_pipeline(RenderPipelineDescriptor {
        label: Some("browser_texture".into()),
        layout: vec![layout.clone()],
        vertex: fullscreen.to_vertex_state(),
        fragment: Some(FragmentState {
            shader: BROWSER_TEXTURE_SHADER_HANDLE,
            entry_point: Some("convert".into()),
            targets: vec![Some(ColorTargetState {
                format: RAW_FORMAT,
                blend: None,
                write_mask: ColorWrites::ALL,
            })],
            ..default()
        }),
        ..default()
    });
    let no_mask =
        raw_texture_with_data(&device, &queue, 1, 1, &[255; 4], "browser_texture_no_mask");
    commands.insert_resource(BrowserTexturePipeline {
        layout,
        id,
        no_mask,
    });
}

fn raw_texture(device: &RenderDevice, width: u32, height: u32, label: &'static str) -> Texture {
    device.create_texture(&texture_descriptor(width, height, label))
}

fn raw_texture_with_data(
    device: &RenderDevice,
    queue: &RenderQueue,
    width: u32,
    height: u32,
    data: &[u8],
    label: &'static str,
) -> Texture {
    device.create_texture_with_data(
        queue,
        &texture_descriptor(width, height, label),
        wgpu::util::TextureDataOrder::LayerMajor,
        data,
    )
}

fn texture_descriptor(width: u32, height: u32, label: &'static str) -> TextureDescriptor<'static> {
    TextureDescriptor {
        label: Some(label),
        size: Extent3d {
            width,
            height,
            depth_or_array_layers: 1,
        },
        mip_level_count: 1,
        sample_count: 1,
        dimension: TextureDimension::D2,
        format: RAW_FORMAT,
        // RENDER_ATTACHMENT: required of a copyExternalImageToTexture destination.
        usage: TextureUsages::TEXTURE_BINDING
            | TextureUsages::COPY_DST
            | TextureUsages::RENDER_ATTACHMENT,
        view_formats: &[],
    }
}

/// A texture replaced before the GPU filled it (a text typed faster than frames) is never filled.
fn forget_dropped_textures(main_world: Res<MainWorld>) {
    let images = main_world.resource::<Assets<Image>>();
    JOBS.with(|jobs| jobs.borrow_mut().retain(|job| images.contains(job.image)));
}

fn fill_browser_textures(
    pipeline: Option<Res<BrowserTexturePipeline>>,
    cache: Res<PipelineCache>,
    gpu_images: Res<RenderAssets<GpuImage>>,
    device: Res<RenderDevice>,
    queue: Res<RenderQueue>,
    mut ctx: RenderContext,
) -> Result<(), BevyError> {
    let Some(pipeline) = pipeline else {
        return Ok(());
    };
    if JOBS.with(|jobs| jobs.borrow().is_empty())
        || !pipelines_ready(&cache, &[pipeline.id], "browser_texture")?
    {
        return Ok(());
    }
    let Some(render_pipeline) = cache.get_render_pipeline(pipeline.id) else {
        return Ok(());
    };
    let layout = cache.get_bind_group_layout(&pipeline.layout);
    let jobs = JOBS.with(|jobs| std::mem::take(&mut *jobs.borrow_mut()));
    // A texture the GPU does not hold yet waits for a later frame.
    let waiting = jobs
        .into_iter()
        .filter_map(|job| {
            let Some(target) = gpu_images.get(job.image) else {
                return Some(job);
            };
            let copied = raw_texture(&device, job.width, job.height, "browser_texture_copy");
            queue.copy_external_image_to_texture(
                &wgpu::CopyExternalImageSourceInfo {
                    source: job.source.clone(),
                    origin: wgpu::Origin2d::ZERO,
                    flip_y: false,
                },
                wgpu::CopyExternalImageDestInfo {
                    texture: &*copied,
                    mip_level: 0,
                    origin: wgpu::Origin3d::ZERO,
                    aspect: wgpu::TextureAspect::All,
                    color_space: wgpu::PredefinedColorSpace::Srgb,
                    premultiplied_alpha: true,
                },
                Extent3d {
                    width: job.width,
                    height: job.height,
                    depth_or_array_layers: 1,
                },
            );
            let mask = job.mask.as_ref().map(|mask| {
                raw_texture_with_data(
                    &device,
                    &queue,
                    mask.width,
                    mask.height,
                    &mask.rgba,
                    "browser_texture_mask",
                )
            });
            let mut buffer = UniformBuffer::from(BrowserTextureUniform {
                mask: Vec4::new(f32::from(u8::from(mask.is_some())), 0.0, 0.0, 0.0),
            });
            buffer.write_buffer(&device, &queue);
            let Some(binding) = buffer.binding() else {
                return Some(job);
            };
            let source_view = copied.create_view(&TextureViewDescriptor::default());
            let mask_view = mask
                .as_ref()
                .unwrap_or(&pipeline.no_mask)
                .create_view(&TextureViewDescriptor::default());
            let bind_group = device.create_bind_group(
                "browser_texture",
                &layout,
                &BindGroupEntries::sequential((&source_view, &mask_view, binding)),
            );
            let target_view = target.texture.create_view(&TextureViewDescriptor {
                format: Some(RAW_FORMAT),
                ..default()
            });
            pass(
                &mut ctx,
                "browser_texture",
                &target_view,
                render_pipeline,
                &bind_group,
            );
            None
        })
        .collect::<Vec<_>>();
    JOBS.with(|jobs| jobs.borrow_mut().extend(waiting));
    Ok(())
}
