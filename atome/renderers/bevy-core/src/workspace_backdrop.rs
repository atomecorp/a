use bevy::{
    camera::{visibility::RenderLayers, ClearColorConfig, RenderTarget},
    image::{ImageSampler, ImageSamplerDescriptor},
    prelude::*,
    render::{
        extract_component::ExtractComponent,
        extract_resource::ExtractResource,
        render_resource::{TextureFormat, TextureUsages},
    },
};

use crate::{
    render_math::atome_camera_projection,
    types::AtomeBevyRendererConfig,
    workspace_blur::{backdrop_capture_pixel_size, backdrop_mip_level_count},
};

/// The only layer sampled by the backdrop capture camera.
///
/// Presentation content must never be placed here: sampling it again from a
/// backdrop surface would create a recursive, ghosted image.
pub const WORKSPACE_CAPTURE_LAYER: usize = 0;
/// Foreground UI which is rendered after the captured workspace.
pub const FLOWER_PRESENTATION_LAYER: usize = 1;

#[derive(Component)]
pub struct AtomePresentationCamera;

#[derive(Component, Clone, Copy, ExtractComponent)]
pub struct AtomeWorkspaceCamera;

#[derive(Resource, Clone, ExtractResource)]
pub struct AtomeWorkspaceBackdrop {
    pub capture_image: Handle<Image>,
    pub image: Handle<Image>,
    pub camera: Entity,
    pub enabled: bool,
    pub pixel_size: UVec2,
}

/// The workspace capture, and the ONLY colour space of the whole backdrop chain.
///
/// It is deliberately created WITHOUT an sRGB view. `blur_pyramid_image` derives
/// from this image and turns it into a STORAGE texture, and WebGPU refuses an
/// sRGB view on a texture that carries `STORAGE_BINDING` — creating that view
/// fails, which made every `ProceduralSdfMaterial` and `BackdropSurfaceMaterial`
/// bind group invalid and killed the entire presentation frame with no Rust-side
/// error at all. The capture, the pyramid and the two shaders that sample it now
/// all speak the same colour space, linear `Rgba8Unorm`: nothing encodes, nothing
/// decodes, and the mip pass averages real light instead of encoded bytes.
fn capture_image(width: u32, height: u32) -> Image {
    let mut image = Image::new_target_texture(
        width.max(1),
        height.max(1),
        TextureFormat::Rgba8Unorm,
        None,
    );
    image.texture_descriptor.usage |= TextureUsages::COPY_SRC;
    image.data = None;
    image
}

fn blur_pyramid_image(width: u32, height: u32) -> Image {
    let mut image = capture_image(width, height);
    image.texture_descriptor.mip_level_count = backdrop_mip_level_count(UVec2::new(width.max(1), height.max(1)));
    image.texture_descriptor.usage =
        TextureUsages::TEXTURE_BINDING | TextureUsages::COPY_DST | TextureUsages::STORAGE_BINDING;
    // A storage texture can never be viewed as sRGB, and the mip generation writes
    // every level through that same storage view. The view is therefore pinned to
    // the texture's own linear format here, in the one place that knows this image
    // is written by a compute pass.
    image.texture_descriptor.view_formats = &[];
    image.texture_view_descriptor = None;
    image.sampler = ImageSampler::Descriptor(ImageSamplerDescriptor::linear());
    image
}

pub fn spawn_workspace_backdrop(
    commands: &mut Commands,
    images: &mut Assets<Image>,
    config: &AtomeBevyRendererConfig,
) -> AtomeWorkspaceBackdrop {
    let pixel_size = UVec2::new(config.pixel_width.max(1), config.pixel_height.max(1));
    let capture_size = backdrop_capture_pixel_size(pixel_size);
    let capture_image = images.add(capture_image(capture_size.x, capture_size.y));
    let image = images.add(blur_pyramid_image(capture_size.x, capture_size.y));
    let camera = commands
        .spawn((
            Camera2d,
            Camera { order: -3, is_active: false, clear_color: ClearColorConfig::Custom(Color::NONE), ..default() },
            // The capture is only ever read back by the blur passes, which
            // average it anyway: multisampling it is pure wasted bandwidth.
            Msaa::Off,
            RenderTarget::Image(capture_image.clone().into()),
            atome_camera_projection(config.width, config.height),
            RenderLayers::layer(WORKSPACE_CAPTURE_LAYER),
            AtomeWorkspaceCamera,
        ))
        .id();
    AtomeWorkspaceBackdrop { capture_image, image, camera, enabled: false, pixel_size }
}

pub fn set_workspace_backdrop_enabled(world: &mut World, enabled: bool) -> Result<(), String> {
    let Some(state) = world.get_resource::<AtomeWorkspaceBackdrop>().cloned() else {
        return Ok(());
    };
    if state.enabled == enabled {
        return Ok(());
    }
    world
        .get_mut::<Camera>(state.camera)
        .ok_or_else(|| "bevy_workspace_backdrop_camera_missing".to_string())?
        .is_active = enabled;
    let presentation = RenderLayers::layer(WORKSPACE_CAPTURE_LAYER).with(FLOWER_PRESENTATION_LAYER).with(crate::mystic_capture::MENU_OVERLAY_LAYER);
    let presentation_camera = world
        .query_filtered::<Entity, With<AtomePresentationCamera>>()
        .iter(world)
        .next()
        .ok_or_else(|| "bevy_presentation_camera_missing".to_string())?;
    world.entity_mut(presentation_camera).insert(presentation);
    world.resource_mut::<AtomeWorkspaceBackdrop>().enabled = enabled;
    Ok(())
}

pub fn resize_workspace_backdrop(world: &mut World, _logical_size: Vec2, pixel_size: UVec2) -> Result<(), String> {
    let Some(state) = world.get_resource::<AtomeWorkspaceBackdrop>().cloned() else {
        return Ok(());
    };
    if state.pixel_size != pixel_size {
        let capture_size = backdrop_capture_pixel_size(pixel_size);
        let (capture_handle, pyramid_handle) = {
            let mut images = world.resource_mut::<Assets<Image>>();
            (
                images.add(capture_image(capture_size.x, capture_size.y)),
                images.add(blur_pyramid_image(capture_size.x, capture_size.y)),
            )
        };
        if world.get_entity(state.camera).is_err() {
            return Err("bevy_workspace_backdrop_camera_missing".to_string());
        }
        world.entity_mut(state.camera).insert(RenderTarget::Image(capture_handle.clone().into()));
        if let Some(mut materials) =
            world.get_resource_mut::<Assets<crate::backdrop_surface::BackdropSurfaceMaterial>>()
        {
            for (_, material) in materials.iter_mut() {
                material.backdrop = pyramid_handle.clone();
            }
        }
        if let Some(mut materials) =
            world.get_resource_mut::<Assets<crate::procedural_sdf::ProceduralSdfMaterial>>()
        {
            for (_, material) in materials.iter_mut() {
                material.backdrop = pyramid_handle.clone();
            }
        }
        {
            let mut backdrop = world.resource_mut::<AtomeWorkspaceBackdrop>();
            backdrop.capture_image = capture_handle;
            backdrop.image = pyramid_handle;
            backdrop.pixel_size = pixel_size;
        }
        let mut images = world.resource_mut::<Assets<Image>>();
        images.remove(state.capture_image.id());
        images.remove(state.image.id());
    }
    Ok(())
}
