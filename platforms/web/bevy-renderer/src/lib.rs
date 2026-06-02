use bevy::{
    asset::RenderAssetUsages,
    image::Image,
    prelude::*,
    render::render_resource::{Extent3d, TextureDimension, TextureFormat},
    text::TextBounds,
    window::{CompositeAlphaMode, PresentMode, Window, WindowPlugin},
};
use std::cell::RefCell;

mod exports;
mod render_ops;
mod selection_overlay;
mod types;
pub(crate) use render_ops::*;
use selection_overlay::rebuild_selection_overlay;
use types::*;

const BEVY_LAYER_DEPTH_LIMIT: f32 = 900.0;

thread_local! {
    static WEB_PENDING_OPS: RefCell<Vec<WebAtomeRenderOp>> = RefCell::new(Vec::new());
}

fn queue_web_op(op: WebAtomeRenderOp) {
    WEB_PENDING_OPS.with(|cell| cell.borrow_mut().push(op));
}

fn drain_web_ops() -> Vec<WebAtomeRenderOp> {
    WEB_PENDING_OPS.with(|cell| cell.borrow_mut().drain(..).collect())
}

struct WebBevyRendererPlugin {
    config: WebBevyRendererConfig,
}

impl Plugin for WebBevyRendererPlugin {
    fn build(&self, app: &mut App) {
        app.insert_resource(self.config.clone())
            .init_resource::<WebAtomeEntityTable>()
            .init_resource::<WebBevyRendererDiagnostics>()
            .init_resource::<Assets<Image>>()
            .insert_resource(ClearColor(Color::NONE))
            .add_systems(Startup, spawn_web_atome_scene)
            .add_systems(Update, apply_pending_web_ops);
    }
}

fn color_for_node(node: &WebAtomeRenderNode) -> [f32; 4] {
    node.color.unwrap_or([0.24, 0.55, 0.92, 1.0])
}

pub(crate) fn color_from_rgba(color: [f32; 4]) -> Color {
    Color::srgba(color[0], color[1], color[2], color[3])
}

pub(crate) fn depth_for_layer(layer: i32) -> f32 {
    -(layer as f32).clamp(-BEVY_LAYER_DEPTH_LIMIT, BEVY_LAYER_DEPTH_LIMIT)
}

fn image_from_texture(texture: &WebAtomeTexture, id: &str) -> Result<Image, String> {
    if texture.width == 0 || texture.height == 0 {
        return Err(format!("bevy_texture_dimension_required:{id}"));
    }
    let expected_len = texture.width as usize * texture.height as usize * 4;
    if texture.rgba.len() != expected_len {
        return Err(format!("bevy_texture_rgba_length_invalid:{id}"));
    }
    Ok(Image::new(
        Extent3d {
            width: texture.width,
            height: texture.height,
            depth_or_array_layers: 1,
        },
        TextureDimension::D2,
        texture.rgba.clone(),
        TextureFormat::Rgba8UnormSrgb,
        RenderAssetUsages::default(),
    ))
}

pub(crate) fn image_handle_from_texture(
    images: &mut Assets<Image>,
    texture: &Option<WebAtomeTexture>,
    id: &str,
) -> Result<Handle<Image>, String> {
    let texture = texture
        .as_ref()
        .ok_or_else(|| format!("bevy_texture_required:{id}"))?;
    Ok(images.add(image_from_texture(texture, id)?))
}

fn atome_transform(
    node: &WebAtomeRenderNode,
    width: f32,
    height: f32,
    surface_width: f32,
    surface_height: f32,
) -> Transform {
    Transform::from_translation(Vec3::new(
        node.logical_position[0] + width / 2.0 - surface_width / 2.0,
        surface_height / 2.0 - node.logical_position[1] - height / 2.0,
        depth_for_layer(node.layer),
    ))
}

fn node_base_components(
    node: &WebAtomeRenderNode,
    width: f32,
    height: f32,
    surface_width: f32,
    surface_height: f32,
) -> (
    AtomeEntityId,
    AtomeParentEntityId,
    AtomeLogicalPosition,
    AtomeLogicalSize,
    AtomeLayer,
    AtomeRenderKind,
    AtomeTextMetadata,
    AtomeMediaSource,
    AtomeWaveformPeaks,
    AtomeSelected,
    Visibility,
    Transform,
) {
    (
        AtomeEntityId(node.id.clone()),
        AtomeParentEntityId(node.parent_id.clone()),
        AtomeLogicalPosition {
            x: node.logical_position[0],
            y: node.logical_position[1],
        },
        AtomeLogicalSize { width, height },
        AtomeLayer(node.layer),
        AtomeRenderKind(node.kind.clone()),
        AtomeTextMetadata(node.text.clone()),
        AtomeMediaSource(node.source.clone()),
        AtomeWaveformPeaks(node.peaks.clone().unwrap_or_default()),
        AtomeSelected(node.selected.unwrap_or(false)),
        Visibility::Visible,
        atome_transform(node, width, height, surface_width, surface_height),
    )
}

pub(crate) fn spawn_node_in_world(
    world: &mut World,
    node: WebAtomeRenderNode,
) -> Result<Entity, String> {
    let entity = {
        let texture_handle = if node.texture.is_some() {
            let mut images = world
                .get_resource_mut::<Assets<Image>>()
                .ok_or_else(|| "bevy_image_assets_required".to_string())?;
            Some(image_handle_from_texture(
                &mut images,
                &node.texture,
                &node.id,
            )?)
        } else {
            None
        };
        let (surface_width, surface_height) = {
            let config = world.resource::<WebBevyRendererConfig>();
            (config.width, config.height)
        };
        spawn_node_with_texture_handle(
            world,
            node.clone(),
            texture_handle,
            surface_width,
            surface_height,
        )?
    };
    world
        .resource_mut::<WebAtomeEntityTable>()
        .by_id
        .insert(node.id, entity);
    rebuild_selection_overlay(world, entity)?;
    Ok(entity)
}

fn spawn_node_with_texture_handle(
    world: &mut World,
    node: WebAtomeRenderNode,
    texture_handle: Option<Handle<Image>>,
    surface_width: f32,
    surface_height: f32,
) -> Result<Entity, String> {
    let width = node.logical_size[0].max(1.0);
    let height = node.logical_size[1].max(1.0);
    let color = color_for_node(&node);
    let size = Vec2::new(width, height);
    let entity = match node.kind.as_str() {
        "shape" => world
            .spawn((
                node_base_components(&node, width, height, surface_width, surface_height),
                Sprite::from_color(color_from_rgba(color), size),
            ))
            .id(),
        "text" => {
            if let Some(handle) = texture_handle {
                let mut sprite = Sprite::from_image(handle);
                sprite.custom_size = Some(size);
                sprite.color = Color::WHITE;
                world
                    .spawn((
                        node_base_components(&node, width, height, surface_width, surface_height),
                        sprite,
                    ))
                    .id()
            } else {
                world
                    .spawn((
                        node_base_components(&node, width, height, surface_width, surface_height),
                        Text2d::new(node.text.clone().unwrap_or_default()),
                        TextFont {
                            font_size: height.min(32.0).max(12.0),
                            ..default()
                        },
                        TextColor(color_from_rgba(color)),
                        TextBounds::from(size),
                    ))
                    .id()
            }
        }
        "image" | "video" => {
            let _source = node
                .source
                .clone()
                .filter(|value| !value.trim().is_empty())
                .ok_or_else(|| format!("bevy_media_source_required:{}", node.id))?;
            let has_texture = texture_handle.is_some();
            let mut sprite = if let Some(handle) = texture_handle {
                Sprite::from_image(handle)
            } else {
                Sprite::from_color(color_from_rgba(color), size)
            };
            sprite.custom_size = Some(size);
            if has_texture {
                sprite.color = Color::WHITE;
            }
            world
                .spawn((
                    node_base_components(&node, width, height, surface_width, surface_height),
                    sprite,
                ))
                .id()
        }
        "audio_waveform" => {
            let has_texture = texture_handle.is_some();
            let mut sprite = if let Some(handle) = texture_handle {
                Sprite::from_image(handle)
            } else {
                Sprite::from_color(color_from_rgba(color), size)
            };
            sprite.custom_size = Some(size);
            if has_texture {
                sprite.color = Color::WHITE;
            }
            world
                .spawn((
                    node_base_components(&node, width, height, surface_width, surface_height),
                    sprite,
                ))
                .id()
        }
        other => return Err(format!("bevy_render_kind_unsupported:{other}")),
    };
    Ok(entity)
}

fn spawn_web_atome_scene(
    mut commands: Commands,
    config: Res<WebBevyRendererConfig>,
    mut images: ResMut<Assets<Image>>,
) {
    commands.spawn(Camera2d);
    for node in &config.initial_nodes {
        let width = node.logical_size[0].max(1.0);
        let height = node.logical_size[1].max(1.0);
        let color = color_for_node(node);
        let node_id = node.id.clone();
        let size = Vec2::new(width, height);
        let entity = match node.kind.as_str() {
            "shape" => commands
                .spawn((
                    node_base_components(node, width, height, config.width, config.height),
                    Sprite::from_color(color_from_rgba(color), size),
                ))
                .id(),
            "text" => {
                if node.texture.is_some() {
                    let mut sprite = Sprite::from_image(
                        image_handle_from_texture(&mut images, &node.texture, &node.id)
                            .unwrap_or_else(|error| panic!("{error}")),
                    );
                    sprite.custom_size = Some(size);
                    sprite.color = Color::WHITE;
                    commands
                        .spawn((
                            node_base_components(node, width, height, config.width, config.height),
                            sprite,
                        ))
                        .id()
                } else {
                    commands
                        .spawn((
                            node_base_components(node, width, height, config.width, config.height),
                            Text2d::new(node.text.clone().unwrap_or_default()),
                            TextFont {
                                font_size: height.min(32.0).max(12.0),
                                ..default()
                            },
                            TextColor(color_from_rgba(color)),
                            TextBounds::from(size),
                        ))
                        .id()
                }
            }
            "image" | "video" => {
                let source = node.source.clone().unwrap_or_default();
                if source.trim().is_empty() {
                    panic!("bevy_media_source_required:{node_id}");
                }
                let mut sprite = if node.texture.is_some() {
                    Sprite::from_image(
                        image_handle_from_texture(&mut images, &node.texture, &node.id)
                            .unwrap_or_else(|error| panic!("{error}")),
                    )
                } else {
                    Sprite::from_color(color_from_rgba(color), size)
                };
                sprite.custom_size = Some(size);
                if node.texture.is_some() {
                    sprite.color = Color::WHITE;
                }
                commands
                    .spawn((
                        node_base_components(node, width, height, config.width, config.height),
                        sprite,
                    ))
                    .id()
            }
            "audio_waveform" => {
                let mut sprite = if node.texture.is_some() {
                    Sprite::from_image(
                        image_handle_from_texture(&mut images, &node.texture, &node.id)
                            .unwrap_or_else(|error| panic!("{error}")),
                    )
                } else {
                    Sprite::from_color(color_from_rgba(color), size)
                };
                sprite.custom_size = Some(size);
                if node.texture.is_some() {
                    sprite.color = Color::WHITE;
                }
                commands
                    .spawn((
                        node_base_components(node, width, height, config.width, config.height),
                        sprite,
                    ))
                    .id()
            }
            other => panic!("bevy_render_kind_unsupported:{other}"),
        };
        commands.queue(move |world: &mut World| {
            world
                .resource_mut::<WebAtomeEntityTable>()
                .by_id
                .insert(node_id, entity);
            if let Err(error) = rebuild_selection_overlay(world, entity) {
                world
                    .resource_mut::<WebBevyRendererDiagnostics>()
                    .last_error = Some(error);
            }
        });
    }
}

fn apply_pending_web_ops(world: &mut World) {
    for op in drain_web_ops() {
        match apply_render_op(world, op) {
            Ok(()) => {
                let mut diagnostics = world.resource_mut::<WebBevyRendererDiagnostics>();
                diagnostics.applied_ops += 1;
                diagnostics.last_error = None;
            }
            Err(error) => {
                world
                    .resource_mut::<WebBevyRendererDiagnostics>()
                    .last_error = Some(format!("{error:?}"));
            }
        }
    }
}

fn web_window_for_config(config: &WebBevyRendererConfig) -> Window {
    Window {
        canvas: Some(config.canvas_selector.clone()),
        fit_canvas_to_parent: false,
        prevent_default_event_handling: false,
        resolution: (config.width.round() as u32, config.height.round() as u32).into(),
        composite_alpha_mode: CompositeAlphaMode::PreMultiplied,
        present_mode: PresentMode::AutoVsync,
        title: "Atome Bevy Renderer".to_string(),
        transparent: true,
        visible: true,
        ..default()
    }
}

fn build_web_bevy_app(config: WebBevyRendererConfig) -> App {
    let window = web_window_for_config(&config);
    let mut app = App::new();
    app.add_plugins(DefaultPlugins.set(WindowPlugin {
        primary_window: Some(window),
        ..default()
    }))
    .add_plugins(WebBevyRendererPlugin { config });
    app
}

#[cfg(test)]
mod tests;
