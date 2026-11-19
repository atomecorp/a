//! The module's own WebGPU device, apart from the renderer's: vello rasterizes a frame with compute passes into an
//! `Rgba8Unorm` storage texture (straight alpha), one blit premultiplies it into the player's `OffscreenCanvas`, and
//! the canvas is handed over as an `ImageBitmap`. The renderer copies that bitmap on its own device
//! (`copyExternalImageToTexture`) and turns it back into the straight alpha its sprites blend (bevy-core
//! `browser_texture.rs`): the frame never comes back to the CPU.
use std::{cell::RefCell, num::NonZeroUsize, rc::Rc};

use vello::{AaConfig, AaSupport, RenderParams, RendererOptions, Scene};
use wasm_bindgen::prelude::*;

/// The format vello writes and the canvas holds (a canvas accepts `rgba8unorm`).
const FORMAT: wgpu::TextureFormat = wgpu::TextureFormat::Rgba8Unorm;

#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(js_namespace = performance)]
    pub(crate) fn now() -> f64;
}

pub(crate) struct LottieGpu {
    instance: wgpu::Instance,
    device: wgpu::Device,
    queue: wgpu::Queue,
    renderer: RefCell<vello::Renderer>,
    /// Straight alpha in, premultiplied out: `rgb × a`, `a` kept.
    premultiply: wgpu::util::TextureBlitter,
}

thread_local! {
    static GPU: RefCell<Option<Rc<LottieGpu>>> = const { RefCell::new(None) };
}

fn premultiplying_blend() -> wgpu::BlendState {
    wgpu::BlendState {
        color: wgpu::BlendComponent {
            src_factor: wgpu::BlendFactor::SrcAlpha,
            dst_factor: wgpu::BlendFactor::Zero,
            operation: wgpu::BlendOperation::Add,
        },
        alpha: wgpu::BlendComponent::REPLACE,
    }
}

/// Makes the device and vello's pipelines once; a second call finds them made.
pub(crate) async fn init() -> Result<(), String> {
    if GPU.with(|gpu| gpu.borrow().is_some()) {
        return Ok(());
    }
    let started = now();
    let instance = wgpu::Instance::new(wgpu::InstanceDescriptor {
        backends: wgpu::Backends::BROWSER_WEBGPU,
        ..wgpu::InstanceDescriptor::new_without_display_handle()
    });
    let adapter = instance
        .request_adapter(&wgpu::RequestAdapterOptions::default())
        .await
        .map_err(|error| format!("lottie_gpu_adapter_unavailable:{error}"))?;
    let (device, queue) = adapter
        .request_device(&wgpu::DeviceDescriptor {
            label: Some("lottie"),
            ..Default::default()
        })
        .await
        .map_err(|error| format!("lottie_gpu_device_unavailable:{error}"))?;
    let renderer = vello::Renderer::new(
        &device,
        RendererOptions {
            use_cpu: false,
            antialiasing_support: AaSupport::area_only(),
            num_init_threads: NonZeroUsize::new(1),
            pipeline_cache: None,
        },
    )
    .map_err(|error| format!("lottie_vello_init:{error}"))?;
    let premultiply = wgpu::util::TextureBlitterBuilder::new(&device, FORMAT)
        .blend_state(premultiplying_blend())
        .build();
    let gpu = LottieGpu {
        instance,
        device,
        queue,
        renderer: RefCell::new(renderer),
        premultiply,
    };
    GPU.with(|slot| *slot.borrow_mut() = Some(Rc::new(gpu)));
    let elapsed = now() - started;
    crate::diagnostics::record(|diagnostics| diagnostics.gpu_init_ms = elapsed);
    Ok(())
}

pub(crate) fn gpu() -> Result<Rc<LottieGpu>, String> {
    GPU.with(|gpu| gpu.borrow().clone())
        .ok_or_else(|| "lottie_gpu_not_initialized".to_string())
}

/// A player's canvas and vello's target, at the size of the atome's texture.
pub(crate) struct LottieCanvas {
    canvas: web_sys::OffscreenCanvas,
    surface: wgpu::Surface<'static>,
    target: wgpu::TextureView,
    size: [u32; 2],
}

impl LottieCanvas {
    pub(crate) fn new(gpu: &LottieGpu, size: [u32; 2]) -> Result<Self, String> {
        let canvas = web_sys::OffscreenCanvas::new(size[0], size[1])
            .map_err(|_| "lottie_canvas_create_failed".to_string())?;
        let surface = gpu
            .instance
            .create_surface(wgpu::SurfaceTarget::OffscreenCanvas(canvas.clone()))
            .map_err(|error| format!("lottie_canvas_surface_failed:{error}"))?;
        surface.configure(
            &gpu.device,
            &wgpu::SurfaceConfiguration {
                usage: wgpu::TextureUsages::RENDER_ATTACHMENT,
                format: FORMAT,
                width: size[0],
                height: size[1],
                present_mode: wgpu::PresentMode::Fifo,
                desired_maximum_frame_latency: 2,
                alpha_mode: wgpu::CompositeAlphaMode::PreMultiplied,
                view_formats: Vec::new(),
            },
        );
        let target = gpu
            .device
            .create_texture(&wgpu::TextureDescriptor {
                label: Some("lottie_vello_target"),
                size: wgpu::Extent3d {
                    width: size[0],
                    height: size[1],
                    depth_or_array_layers: 1,
                },
                mip_level_count: 1,
                sample_count: 1,
                dimension: wgpu::TextureDimension::D2,
                format: FORMAT,
                usage: wgpu::TextureUsages::STORAGE_BINDING | wgpu::TextureUsages::TEXTURE_BINDING,
                view_formats: &[],
            })
            .create_view(&wgpu::TextureViewDescriptor::default());
        Ok(Self {
            canvas,
            surface,
            target,
            size,
        })
    }

    /// Draws `scene` and hands the canvas over as the frame's bitmap.
    pub(crate) fn draw(
        &self,
        gpu: &LottieGpu,
        scene: &Scene,
    ) -> Result<web_sys::ImageBitmap, String> {
        let started = now();
        let params = RenderParams {
            base_color: vello::peniko::color::palette::css::TRANSPARENT,
            width: self.size[0],
            height: self.size[1],
            antialiasing_method: AaConfig::Area,
        };
        gpu.renderer
            .borrow_mut()
            .render_to_texture(&gpu.device, &gpu.queue, scene, &self.target, &params)
            .map_err(|error| format!("lottie_vello_render:{error}"))?;
        let frame = match self.surface.get_current_texture() {
            wgpu::CurrentSurfaceTexture::Success(frame)
            | wgpu::CurrentSurfaceTexture::Suboptimal(frame) => frame,
            _ => return Err("lottie_canvas_texture_unavailable".into()),
        };
        let view = frame
            .texture
            .create_view(&wgpu::TextureViewDescriptor::default());
        let mut encoder = gpu
            .device
            .create_command_encoder(&wgpu::CommandEncoderDescriptor {
                label: Some("lottie_premultiply"),
            });
        gpu.premultiply
            .copy(&gpu.device, &mut encoder, &self.target, &view);
        gpu.queue.submit([encoder.finish()]);
        frame.present();
        let submitted = now();
        gpu.queue.on_submitted_work_done(move || {
            let done = now() - submitted;
            crate::diagnostics::record(|diagnostics| {
                diagnostics.gpu_done_ms = done;
                diagnostics.gpu_done_max_ms = diagnostics.gpu_done_max_ms.max(done);
            });
        });
        let bitmap = self
            .canvas
            .transfer_to_image_bitmap()
            .map_err(|_| "lottie_canvas_transfer_failed".to_string())?;
        let transferred = now();
        crate::diagnostics::record(|diagnostics| {
            let encode = submitted - started;
            let transfer = transferred - submitted;
            diagnostics.frames_drawn = diagnostics.frames_drawn.saturating_add(1);
            diagnostics.gpu_encode_ms = encode;
            diagnostics.gpu_encode_max_ms = diagnostics.gpu_encode_max_ms.max(encode);
            diagnostics.transfer_ms = transfer;
            diagnostics.transfer_max_ms = diagnostics.transfer_max_ms.max(transfer);
        });
        Ok(bitmap)
    }
}
