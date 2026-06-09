use bevy::{
    asset::RenderAssetUsages,
    image::Image,
    prelude::*,
    render::{
        extract_component::{ExtractComponent, ExtractComponentPlugin},
        render_resource::{Extent3d, TextureDimension, TextureFormat, TextureUsages},
    },
};
#[cfg(target_arch = "wasm32")]
use std::collections::HashMap;

use crate::types::AtomeRenderNode;

const VIDEO_TEXTURE_FORMAT: TextureFormat = TextureFormat::Rgba8Unorm;

#[derive(Clone, Debug, Component, ExtractComponent)]
pub struct AtomeVideoTexture {
    pub id: String,
    pub handle: Handle<Image>,
}

pub struct AtomeVideoTexturePlugin;

#[cfg(target_arch = "wasm32")]
#[derive(Default, Resource)]
struct AtomeVideoFrameCopies {
    copied_versions: HashMap<String, u32>,
    copied_attempts: HashMap<String, u32>,
}

impl Plugin for AtomeVideoTexturePlugin {
    fn build(&self, app: &mut App) {
        app.add_plugins(ExtractComponentPlugin::<AtomeVideoTexture>::default());

        #[cfg(target_arch = "wasm32")]
        if let Some(render_app) = app.get_sub_app_mut(bevy::render::RenderApp) {
            use bevy::render::{Render, RenderSystems};

            render_app
                .init_resource::<AtomeVideoFrameCopies>()
                .add_systems(
                    Render,
                    copy_video_sources_to_bevy_textures
                        .in_set(RenderSystems::PrepareResourcesFlush),
                );
        }
    }
}

pub fn video_image_handle_from_node(
    images: &mut Assets<Image>,
    node: &AtomeRenderNode,
) -> Option<Handle<Image>> {
    if node.kind != "video"
        || node
            .source
            .as_ref()
            .is_none_or(|value| value.trim().is_empty())
    {
        return None;
    }
    video_image_handle_from_size(images, node.texture_size.unwrap_or([
        node.logical_size[0].max(1.0).round() as u32,
        node.logical_size[1].max(1.0).round() as u32,
    ]))
}

pub fn video_image_handle_from_size(
    images: &mut Assets<Image>,
    texture_size: [u32; 2],
) -> Option<Handle<Image>> {
    let width = texture_size[0].max(1);
    let height = texture_size[1].max(1);
    let mut image = Image::new_uninit(
        Extent3d {
            width,
            height,
            depth_or_array_layers: 1,
        },
        TextureDimension::D2,
        VIDEO_TEXTURE_FORMAT,
        RenderAssetUsages::default(),
    );
    image.texture_descriptor.usage |= TextureUsages::RENDER_ATTACHMENT;
    Some(images.add(image))
}

pub fn video_texture_component_from_node(
    node: &AtomeRenderNode,
    handle: &Handle<Image>,
) -> Option<AtomeVideoTexture> {
    if node.kind != "video"
        || node
            .source
            .as_ref()
            .is_none_or(|value| value.trim().is_empty())
    {
        return None;
    }
    Some(AtomeVideoTexture {
        id: node.id.clone(),
        handle: handle.clone(),
    })
}

pub fn update_video_texture_handle_for_node(
    world: &mut World,
    entity: Entity,
    node: &AtomeRenderNode,
    handle: &Handle<Image>,
) {
    if let Some(component) = video_texture_component_from_node(node, handle) {
        world.entity_mut(entity).insert(component);
    }
}

#[cfg(target_arch = "wasm32")]
fn copy_video_sources_to_bevy_textures(
    render_queue: Res<bevy::render::renderer::RenderQueue>,
    gpu_images: Res<bevy::render::render_asset::RenderAssets<bevy::render::texture::GpuImage>>,
    mut copies: ResMut<AtomeVideoFrameCopies>,
    videos: Query<&AtomeVideoTexture>,
) {
    for video in &videos {
        let Some(gpu_image) = gpu_images.get(&video.handle) else {
            continue;
        };
        let Some(source) = hidden_video_source_for_id(&video.id) else {
            continue;
        };
        let Some(frame_version) = hidden_video_frame_version_for_id(&video.id) else {
            continue;
        };
        if source.ready_state() < web_sys::HtmlMediaElement::HAVE_CURRENT_DATA {
            continue;
        }
        let source_width = source.video_width();
        let source_height = source.video_height();
        if source_width == 0 || source_height == 0 {
            continue;
        }
        let width = gpu_image.size.width.min(source_width);
        let height = gpu_image.size.height.min(source_height);
        let copied_version = copies.copied_versions.get(&video.id).copied();
        let copied_attempts = if copied_version == Some(frame_version) {
            copies.copied_attempts.get(&video.id).copied().unwrap_or(0)
        } else {
            0
        };
        let required_attempts = if source.paused() { 3 } else { 1 };
        if copied_version.is_some_and(|copied| copied >= frame_version)
            && copied_attempts >= required_attempts
        {
            continue;
        }
        let source_info = wgpu::CopyExternalImageSourceInfo {
            source: wgpu::ExternalImageSource::HTMLVideoElement(source),
            origin: wgpu::Origin2d::ZERO,
            flip_y: false,
        };
        let dest_info = wgpu::CopyExternalImageDestInfo {
            texture: &*gpu_image.texture,
            mip_level: 0,
            origin: wgpu::Origin3d::ZERO,
            aspect: wgpu::TextureAspect::All,
            color_space: wgpu::PredefinedColorSpace::Srgb,
            premultiplied_alpha: false,
        };
        render_queue.copy_external_image_to_texture(
            &source_info,
            dest_info,
            wgpu::Extent3d {
                width,
                height,
                depth_or_array_layers: 1,
            },
        );
        copies
            .copied_versions
            .insert(video.id.clone(), frame_version);
        copies
            .copied_attempts
            .insert(video.id.clone(), copied_attempts + 1);
        record_video_copy_event(
            "bevy.video.copy",
            &video.id,
            Some(frame_version),
        );
    }
}

#[cfg(target_arch = "wasm32")]
fn hidden_video_source_for_id(id: &str) -> Option<web_sys::HtmlVideoElement> {
    use wasm_bindgen::{JsCast, JsValue};

    let window = web_sys::window()?;
    let lookup = js_sys::Reflect::get(
        window.as_ref(),
        &JsValue::from_str("__EVE_BEVY_VIDEO_SOURCE_FOR_ID__"),
    )
    .ok()?
    .dyn_into::<js_sys::Function>()
    .ok()?;
    lookup
        .call1(window.as_ref(), &JsValue::from_str(id))
        .ok()?
        .dyn_into::<web_sys::HtmlVideoElement>()
        .ok()
}

#[cfg(target_arch = "wasm32")]
fn hidden_video_frame_version_for_id(id: &str) -> Option<u32> {
    use wasm_bindgen::{JsCast, JsValue};

    let window = web_sys::window()?;
    let lookup = js_sys::Reflect::get(
        window.as_ref(),
        &JsValue::from_str("__EVE_BEVY_VIDEO_FRAME_VERSION_FOR_ID__"),
    )
    .ok()?
    .dyn_into::<js_sys::Function>()
    .ok()?;
    let value = lookup.call1(window.as_ref(), &JsValue::from_str(id)).ok()?;
    let version = value.as_f64()?;
    if version.is_finite() && version > 0.0 {
        Some(version.min(u32::MAX as f64) as u32)
    } else {
        None
    }
}

#[cfg(target_arch = "wasm32")]
fn record_video_copy_event(name: &str, id: &str, frame_version: Option<u32>) {
    use wasm_bindgen::{JsCast, JsValue};

    let Some(window) = web_sys::window() else {
        return;
    };
    let Ok(callback) = js_sys::Reflect::get(
        window.as_ref(),
        &JsValue::from_str("__EVE_BEVY_PERF_RECORD__"),
    ) else {
        return;
    };
    let Ok(function) = callback.dyn_into::<js_sys::Function>() else {
        return;
    };
    let detail = js_sys::Object::new();
    let _ = js_sys::Reflect::set(&detail, &JsValue::from_str("id"), &JsValue::from_str(id));
    if let Some(version) = frame_version {
        let _ = js_sys::Reflect::set(
            &detail,
            &JsValue::from_str("frame_version"),
            &JsValue::from_f64(version as f64),
        );
    }
    let _ = function.call2(window.as_ref(), &JsValue::from_str(name), detail.as_ref());
}
