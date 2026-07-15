use bevy::{
    camera::{visibility::RenderLayers, ClearColorConfig, RenderTarget},
    prelude::*,
    render::render_resource::TextureFormat,
};

use crate::{render_math::atome_camera_projection, types::AtomeBevyRendererConfig};
use crate::{
    video_external_texture::video_quad_mesh_handle_from_size,
    workspace_blur::{
        spawn_workspace_blur_pipeline, AssistantOpticsSettings, WorkspaceBlurMaterial,
        WorkspaceBlurPipeline,
    },
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

#[derive(Component)]
pub struct AtomeWorkspaceCamera;

#[derive(Component)]
pub struct AtomeWorkspaceBackdropVisual;

#[derive(Resource, Clone)]
pub struct AtomeWorkspaceBackdrop {
    pub image: Handle<Image>,
    pub camera: Entity,
    pub visual: Entity,
    pub enabled: bool,
    pub pixel_size: UVec2,
    pub blur: WorkspaceBlurPipeline,
}

fn target_image(width: u32, height: u32) -> Image {
    Image::new_target_texture(
        width.max(1),
        height.max(1),
        TextureFormat::Rgba8Unorm,
        Some(TextureFormat::Rgba8UnormSrgb),
    )
}

pub fn spawn_workspace_backdrop(
    commands: &mut Commands,
    images: &mut Assets<Image>,
    meshes: &mut Assets<Mesh>,
    blur_materials: &mut Assets<WorkspaceBlurMaterial>,
    config: &AtomeBevyRendererConfig,
    optics: AssistantOpticsSettings,
) -> AtomeWorkspaceBackdrop {
    let pixel_size = UVec2::new(config.pixel_width.max(1), config.pixel_height.max(1));
    let image = images.add(target_image(pixel_size.x, pixel_size.y));
    let blur = spawn_workspace_blur_pipeline(
        commands,
        images,
        meshes,
        blur_materials,
        config,
        image.clone(),
        || target_image(pixel_size.x, pixel_size.y),
        optics,
    );
    let camera = commands
        .spawn((
            Camera2d,
            Camera {
                order: -3,
                is_active: false,
                clear_color: ClearColorConfig::Custom(Color::NONE),
                ..default()
            },
            RenderTarget::Image(image.clone().into()),
            atome_camera_projection(config.width, config.height),
            RenderLayers::layer(WORKSPACE_CAPTURE_LAYER),
            AtomeWorkspaceCamera,
        ))
        .id();
    let mut sprite = Sprite::from_image(image.clone());
    sprite.custom_size = Some(Vec2::new(config.width, config.height));
    let visual = commands
        .spawn((
            sprite,
            Transform::from_xyz(0.0, 0.0, -5_000.0),
            Visibility::Hidden,
            RenderLayers::layer(FLOWER_PRESENTATION_LAYER),
            AtomeWorkspaceBackdropVisual,
        ))
        .id();
    AtomeWorkspaceBackdrop {
        image,
        camera,
        visual,
        enabled: false,
        pixel_size,
        blur,
    }
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
    for camera in [state.blur.horizontal_camera, state.blur.vertical_camera] {
        world
            .get_mut::<Camera>(camera)
            .ok_or_else(|| "bevy_workspace_blur_camera_missing".to_string())?
            .is_active = enabled;
    }
    for quad in [state.blur.horizontal_quad, state.blur.vertical_quad] {
        *world
            .get_mut::<Visibility>(quad)
            .ok_or_else(|| "bevy_workspace_blur_quad_missing".to_string())? = if enabled {
            Visibility::Visible
        } else {
            Visibility::Hidden
        };
    }
    *world
        .get_mut::<Visibility>(state.visual)
        .ok_or_else(|| "bevy_workspace_backdrop_visual_missing".to_string())? = Visibility::Hidden;
    let presentation = RenderLayers::layer(WORKSPACE_CAPTURE_LAYER)
        .with(FLOWER_PRESENTATION_LAYER);
    let presentation_camera = world
        .query_filtered::<Entity, With<AtomePresentationCamera>>()
        .iter(world)
        .next()
        .ok_or_else(|| "bevy_presentation_camera_missing".to_string())?;
    world.entity_mut(presentation_camera).insert(presentation);
    world.resource_mut::<AtomeWorkspaceBackdrop>().enabled = enabled;
    Ok(())
}

pub fn resize_workspace_backdrop(
    world: &mut World,
    logical_size: Vec2,
    pixel_size: UVec2,
) -> Result<(), String> {
    let Some(state) = world.get_resource::<AtomeWorkspaceBackdrop>().cloned() else {
        return Ok(());
    };
    if state.pixel_size != pixel_size {
        let replacement = || target_image(pixel_size.x, pixel_size.y);
        let mut images = world.resource_mut::<Assets<Image>>();
        for image in [
            &state.image,
            &state.blur.horizontal_image,
            &state.blur.vertical_image,
        ] {
            images
                .insert(image.id(), replacement())
                .map_err(|error| format!("bevy_workspace_backdrop_resize_failed:{error}"))?;
        }
        world.resource_mut::<AtomeWorkspaceBackdrop>().pixel_size = pixel_size;
    }
    world
        .get_mut::<Sprite>(state.visual)
        .ok_or_else(|| "bevy_workspace_backdrop_sprite_missing".to_string())?
        .custom_size = Some(logical_size);
    let mesh = {
        let mut meshes = world.resource_mut::<Assets<Mesh>>();
        video_quad_mesh_handle_from_size(
            &mut meshes,
            [logical_size.x, logical_size.y],
            [0.0, 0.0, 1.0, 1.0],
        )
    };
    for quad in [state.blur.horizontal_quad, state.blur.vertical_quad] {
        world.entity_mut(quad).insert(Mesh2d(mesh.clone()));
    }
    Ok(())
}
