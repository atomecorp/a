#[cfg(test)]
mod tests;
mod types;

pub use types::*;

use crate::texture::image_handle_from_texture;
use bevy::input::mouse::MouseWheel;
use bevy::camera::visibility::RenderLayers;
use bevy::prelude::*;
use bevy::text::{Font, FontSize, FontSource};
use bevy::ui::{
    percent, px, widget::ImageNode, BoxShadow, GlobalZIndex, RelativeCursorPosition,
    ScrollPosition, ShadowStyle,
};
use crate::workspace_backdrop::FLOWER_PRESENTATION_LAYER;

// Tracks the previous frame's Interaction + node-local cursor position so
// press/release/drag can be derived without an entity-keyed Local<HashMap>
// (which would leak across despawns).
#[derive(Component)]
struct AtomeUiInteractionState {
    interaction: Interaction,
    position: Vec2,
}

impl Default for AtomeUiInteractionState {
    fn default() -> Self {
        Self {
            interaction: Interaction::None,
            position: Vec2::ZERO,
        }
    }
}

#[derive(Clone, Component)]
struct AtomeUiBaseColors {
    background: Option<Color>,
    text: Option<Color>,
    image: Option<Color>,
    shadows: Option<Vec<Color>>,
}

pub struct AtomeBevyUiPlugin;

impl Plugin for AtomeBevyUiPlugin {
    fn build(&self, app: &mut App) {
        app.init_resource::<AtomeUiEntityTable>()
            .init_resource::<AtomeUiDiagnostics>()
            .init_resource::<AtomeUiFontTable>()
            .init_resource::<AtomeUiEventQueue>()
            .init_resource::<Assets<Image>>()
            // Idempotent: a no-op if `InputPlugin` (DefaultPlugins) already
            // registered it. Required standalone too — some app builders in
            // this crate run `AtomeBevyRendererPlugin` without DefaultPlugins.
            .add_message::<MouseWheel>()
            .add_systems(Update, collect_ui_interactions);
    }
}

fn finite(value: f32, fallback: f32) -> f32 {
    if value.is_finite() {
        value
    } else {
        fallback
    }
}

fn normalized_id(value: &str, error: &str) -> Result<String, String> {
    let id = value.trim();
    if id.is_empty() {
        return Err(error.to_string());
    }
    Ok(id.to_string())
}

fn color(value: Option<[f32; 4]>, fallback: Color) -> Color {
    let Some(rgba) = value else {
        return fallback;
    };
    Color::srgba(
        finite(rgba[0], 0.0).clamp(0.0, 1.0),
        finite(rgba[1], 0.0).clamp(0.0, 1.0),
        finite(rgba[2], 0.0).clamp(0.0, 1.0),
        finite(rgba[3], 1.0).clamp(0.0, 1.0),
    )
}

fn rect(values: Option<[f32; 4]>) -> UiRect {
    let Some([left, right, top, bottom]) = values else {
        return UiRect::default();
    };
    UiRect {
        left: px(finite(left, 0.0)),
        right: px(finite(right, 0.0)),
        top: px(finite(top, 0.0)),
        bottom: px(finite(bottom, 0.0)),
    }
}

fn flex_direction(kind: &str, value: &Option<String>) -> FlexDirection {
    match value
        .as_deref()
        .unwrap_or(kind)
        .trim()
        .to_ascii_lowercase()
        .as_str()
    {
        "row" | "tab_bar" | "segmented_control" => FlexDirection::Row,
        _ => FlexDirection::Column,
    }
}

fn align_items(value: &Option<String>) -> AlignItems {
    match value
        .as_deref()
        .unwrap_or("")
        .trim()
        .to_ascii_lowercase()
        .as_str()
    {
        "start" | "flex_start" | "flex-start" => AlignItems::FlexStart,
        "end" | "flex_end" | "flex-end" => AlignItems::FlexEnd,
        "stretch" => AlignItems::Stretch,
        _ => AlignItems::Center,
    }
}

fn justify_content(value: &Option<String>) -> JustifyContent {
    match value
        .as_deref()
        .unwrap_or("")
        .trim()
        .to_ascii_lowercase()
        .as_str()
    {
        "start" | "flex_start" | "flex-start" => JustifyContent::FlexStart,
        "end" | "flex_end" | "flex-end" => JustifyContent::FlexEnd,
        "space_between" | "space-between" => JustifyContent::SpaceBetween,
        "space_around" | "space-around" => JustifyContent::SpaceAround,
        "space_evenly" | "space-evenly" => JustifyContent::SpaceEvenly,
        _ => JustifyContent::Center,
    }
}

fn overflow(value: &Option<String>) -> Overflow {
    match value
        .as_deref()
        .unwrap_or("")
        .trim()
        .to_ascii_lowercase()
        .as_str()
    {
        "scroll" => Overflow::scroll(),
        "scroll_x" | "scroll-x" => Overflow::scroll_x(),
        "scroll_y" | "scroll-y" => Overflow::scroll_y(),
        "hidden" => Overflow::hidden(),
        "clip" => Overflow::clip(),
        _ => Overflow::visible(),
    }
}

fn node_layout(kind: &str, style: &AtomeUiStyle) -> Node {
    let mut node = Node {
        flex_direction: flex_direction(kind, &style.flex_direction),
        align_items: align_items(&style.align_items),
        justify_content: justify_content(&style.justify_content),
        overflow: overflow(&style.overflow),
        padding: rect(style.padding),
        margin: rect(style.margin),
        border: rect(style.border),
        row_gap: px(finite(style.gap.unwrap_or(0.0), 0.0)),
        column_gap: px(finite(style.gap.unwrap_or(0.0), 0.0)),
        flex_grow: finite(style.flex_grow.unwrap_or(0.0), 0.0).max(0.0),
        ..default()
    };
    if kind == "root" {
        node.position_type = PositionType::Absolute;
        node.width = percent(100);
        node.height = percent(100);
    }
    if kind == "spacer" && style.flex_grow.is_none() {
        node.flex_grow = 1.0;
    }
    if kind == "divider" && style.size.is_none() {
        node.height = px(1.0);
        node.width = percent(100);
    }
    if let Some([x, y]) = style.position {
        node.position_type = PositionType::Absolute;
        node.left = px(finite(x, 0.0));
        node.top = px(finite(y, 0.0));
    }
    if let Some([width, height]) = style.size {
        node.width = px(finite(width, 1.0).max(1.0));
        node.height = px(finite(height, 1.0).max(1.0));
    }
    if let Some([width, height]) = style.min_size {
        node.min_width = px(finite(width, 0.0).max(0.0));
        node.min_height = px(finite(height, 0.0).max(0.0));
    }
    if let Some([width, height]) = style.max_size {
        node.max_width = px(finite(width, 0.0).max(0.0));
        node.max_height = px(finite(height, 0.0).max(0.0));
    }
    if let Some(radius) = style.radius {
        node.border_radius = BorderRadius::all(px(finite(radius, 0.0).max(0.0)));
    }
    if let Some([top_left, top_right, bottom_right, bottom_left]) = style.radius_corners {
        node.border_radius = BorderRadius {
            top_left: px(finite(top_left, 0.0).max(0.0)),
            top_right: px(finite(top_right, 0.0).max(0.0)),
            bottom_right: px(finite(bottom_right, 0.0).max(0.0)),
            bottom_left: px(finite(bottom_left, 0.0).max(0.0)),
        };
    }
    node
}

fn box_shadow(shadow: &AtomeUiShadow) -> BoxShadow {
    BoxShadow(vec![ShadowStyle {
        color: color(Some(shadow.color), Color::NONE),
        x_offset: px(finite(shadow.offset[0], 0.0)),
        y_offset: px(finite(shadow.offset[1], 0.0)),
        spread_radius: px(finite(shadow.spread, 0.0)),
        blur_radius: px(finite(shadow.blur, 0.0).max(0.0)),
    }])
}

fn scroll_position(scroll: &[f32; 2]) -> ScrollPosition {
    ScrollPosition(Vec2::new(finite(scroll[0], 0.0), finite(scroll[1], 0.0)))
}

fn ui_transform(style: &AtomeUiStyle) -> UiTransform {
    let translation = style.translation.unwrap_or([0.0, 0.0]);
    let scale = style.scale.unwrap_or([1.0, 1.0]);
    let origin = style.origin.unwrap_or([0.5, 0.5]);
    let rotation = Rot2::degrees(finite(style.rotation.unwrap_or(0.0), 0.0));
    let size = style.size.unwrap_or([0.0, 0.0]);
    let pivot = Vec2::new(
        (finite(origin[0], 0.5) - 0.5) * finite(size[0], 0.0),
        (finite(origin[1], 0.5) - 0.5) * finite(size[1], 0.0),
    );
    let scaled_pivot = Vec2::new(
        pivot.x * finite(scale[0], 1.0),
        pivot.y * finite(scale[1], 1.0),
    );
    let origin_compensation = pivot - rotation * scaled_pivot;
    UiTransform {
        translation: Val2::px(
            finite(translation[0], 0.0) + origin_compensation.x,
            finite(translation[1], 0.0) + origin_compensation.y,
        ),
        scale: Vec2::new(finite(scale[0], 1.0), finite(scale[1], 1.0)),
        rotation,
    }
}

// Extras shared by every spawned node kind; applied after the base bundle so
// one op = one code path (box shadow, programmatic scroll offset).
fn insert_style_extras(world: &mut World, entity: Entity, style: &AtomeUiStyle) {
    world.entity_mut(entity).insert(ui_transform(style));
    if let Some(shadow) = &style.shadow {
        world.entity_mut(entity).insert(box_shadow(shadow));
    }
    if let Some(scroll) = &style.scroll {
        world.entity_mut(entity).insert(scroll_position(scroll));
    }
}

fn is_text_kind(kind: &str) -> bool {
    matches!(kind, "label" | "text" | "empty_state")
}

fn is_image_kind(kind: &str) -> bool {
    matches!(kind, "icon" | "image")
}

fn is_button_kind(kind: &str) -> bool {
    matches!(
        kind,
        "button"
            | "icon_button"
            | "toggle"
            | "checkbox"
            | "radio"
            | "segmented_control"
            | "tab"
            | "accordion"
            | "section_header"
            | "collapsible_group"
            | "text_input"
            | "number_input"
            | "password_input"
            | "search_input"
            | "select"
            | "dropdown"
            | "slider"
            | "tool_slider"
            | "stepper"
            | "color_swatch"
            | "color_picker_stub"
            | "drag_handle"
            | "resize_handle"
    )
}

fn text_font(world: &World, style: &AtomeUiStyle) -> TextFont {
    let mut font = TextFont {
        font_size: FontSize::Px(finite(style.font_size.unwrap_or(12.0), 12.0).max(1.0)),
        ..default()
    };
    // Only an explicit weight opts a node into the registered font table: the
    // existing UI keeps the default face untouched. The weight attribute must
    // accompany the handle: cosmic-text resolves faces per family+attributes,
    // and the static Roboto TTFs all declare the same family.
    if let Some(weight) = style.font_weight {
        let clamped = weight.clamp(1.0, 1000.0) as u16;
        if let Some(handle) = world
            .get_resource::<AtomeUiFontTable>()
            .and_then(|table| table.handle_for_weight(clamped))
        {
            font.font = FontSource::Handle(handle);
            font.weight = bevy::text::FontWeight(clamped);
        }
    }
    font
}

// Registers an embedded TTF (bytes come from a local same-origin asset, never
// a network fetch) as the UI face for `weight`.
pub fn register_ui_font(world: &mut World, weight: u16, bytes: Vec<u8>) -> Result<(), String> {
    let font = Font::from_bytes(bytes);
    world.init_resource::<AtomeUiFontTable>();
    let handle = {
        let mut fonts = world
            .get_resource_mut::<Assets<Font>>()
            .ok_or_else(|| "bevy_ui_font_assets_required".to_string())?;
        fonts.add(font)
    };
    world
        .resource_mut::<AtomeUiFontTable>()
        .insert(weight, handle);
    Ok(())
}

fn insert_text_extras(world: &mut World, entity: Entity, style: &AtomeUiStyle) {
    if let Some(line_height) = style.line_height {
        world.entity_mut(entity).insert(bevy::text::LineHeight::Px(
            finite(line_height, 0.0).max(1.0),
        ));
    }
}

fn text_layout(style: &AtomeUiStyle) -> TextLayout {
    TextLayout {
        justify: match style
            .text_align
            .as_deref()
            .unwrap_or("")
            .trim()
            .to_ascii_lowercase()
            .as_str()
        {
            "center" => Justify::Center,
            "right" => Justify::Right,
            _ => Justify::Left,
        },
        ..default()
    }
}

fn spawn_text_child(world: &mut World, parent: Entity, node: &AtomeUiNode) {
    let text = node.text.clone().unwrap_or_default();
    if text.is_empty() {
        return;
    }
    let text_entity = world
        .spawn((
            node_layout(&node.kind, &node.style),
            Text::new(text),
            text_font(world, &node.style),
            text_layout(&node.style),
            TextColor(color(node.style.color, Color::WHITE)),
        ))
        .id();
    insert_text_extras(world, text_entity, &node.style);
    world
        .entity_mut(text_entity)
        .insert(RenderLayers::layer(FLOWER_PRESENTATION_LAYER));
    world.entity_mut(parent).add_child(text_entity);
}

fn spawn_image_node(
    world: &mut World,
    id_component: AtomeUiNodeId,
    kind: &str,
    node: &AtomeUiNode,
) -> Result<Entity, String> {
    let texture = node
        .image
        .as_ref()
        .and_then(|image| image.texture.clone())
        .ok_or_else(|| format!("bevy_ui_image_texture_required:{}", node.id))?;
    let tint = node
        .image
        .as_ref()
        .and_then(|image| image.tint)
        .or(node.style.color);
    let opacity = node
        .image
        .as_ref()
        .and_then(|image| image.opacity)
        .unwrap_or(1.0);
    let handle = {
        let mut images = world
            .get_resource_mut::<Assets<Image>>()
            .ok_or_else(|| "bevy_image_assets_required".to_string())?;
        image_handle_from_texture(&mut images, &Some(texture), &node.id)?
    };
    Ok(world
        .spawn((
            id_component,
            node_layout(kind, &node.style),
            ImageNode::new(handle).with_color(color(
                tint.map(|[r, g, b, a]| [r, g, b, a * finite(opacity, 1.0).clamp(0.0, 1.0)]),
                Color::WHITE,
            )),
            BackgroundColor(color(node.style.background, Color::NONE)),
            BorderColor::all(color(node.style.border_color, Color::NONE)),
            ZIndex(node.style.z_index.unwrap_or(0)),
            GlobalZIndex(node.style.z_index.unwrap_or(0)),
        ))
        .id())
}

fn spawn_ui_node(
    world: &mut World,
    tree_id: &str,
    node: &AtomeUiNode,
    parent: Option<Entity>,
) -> Result<Entity, String> {
    let node_id = normalized_id(&node.id, "bevy_ui_node_id_required")?;
    let kind = normalized_id(&node.kind, "bevy_ui_node_kind_required")?;
    if world
        .resource::<AtomeUiEntityTable>()
        .by_id
        .contains_key(&node_id)
    {
        return Err(format!("bevy_ui_node_duplicate_id:{node_id}"));
    }
    let id_component = AtomeUiNodeId {
        tree_id: tree_id.to_string(),
        node_id: node_id.clone(),
        kind: kind.clone(),
    };
    let entity = if is_text_kind(&kind) {
        world
            .spawn((
                id_component,
                node_layout(&kind, &node.style),
                Text::new(node.text.clone().unwrap_or_default()),
                text_font(world, &node.style),
                text_layout(&node.style),
                TextColor(color(node.style.color, Color::WHITE)),
            ))
            .id()
    } else if is_image_kind(&kind) {
        spawn_image_node(world, id_component, &kind, node)?
    } else {
        let mut entity = world.spawn((
            id_component,
            node_layout(&kind, &node.style),
            BackgroundColor(color(node.style.background, Color::NONE)),
            BorderColor::all(color(node.style.border_color, Color::NONE)),
            ZIndex(node.style.z_index.unwrap_or(0)),
            GlobalZIndex(node.style.z_index.unwrap_or(0)),
        ));
        if is_button_kind(&kind) {
            entity.insert((
                Button,
                Interaction::None,
                RelativeCursorPosition::default(),
                AtomeUiInteractionState::default(),
            ));
        }
        entity.id()
    };
    insert_style_extras(world, entity, &node.style);
    world
        .entity_mut(entity)
        .insert(RenderLayers::layer(FLOWER_PRESENTATION_LAYER));
    if is_text_kind(&kind) {
        insert_text_extras(world, entity, &node.style);
    }
    world
        .resource_mut::<AtomeUiEntityTable>()
        .by_id
        .insert(node_id, entity);
    if let Some(parent_entity) = parent {
        world.entity_mut(parent_entity).add_child(entity);
    }
    if !is_text_kind(&kind) && !is_image_kind(&kind) {
        spawn_text_child(world, entity, node);
    }
    for child in &node.children {
        spawn_ui_node(world, tree_id, child, Some(entity))?;
    }
    Ok(entity)
}

fn unmount_tree(world: &mut World, id: &str) -> Result<(), String> {
    let tree_id = normalized_id(id, "bevy_ui_tree_id_required")?;
    let root = world
        .resource_mut::<AtomeUiEntityTable>()
        .roots
        .remove(&tree_id)
        .ok_or_else(|| format!("bevy_ui_tree_missing:{tree_id}"))?;
    world.entity_mut(root).despawn();
    let stale_ids: Vec<String> = world
        .resource::<AtomeUiEntityTable>()
        .by_id
        .iter()
        .filter_map(|(id, entity)| world.get_entity(*entity).is_err().then(|| id.clone()))
        .collect();
    let mut table = world.resource_mut::<AtomeUiEntityTable>();
    for id in stale_ids {
        table.by_id.remove(&id);
    }
    Ok(())
}

// Mount-time group opacity: parent first, so a child's own opacity then
// refines its subtree relative to freshly captured base colors.
fn apply_tree_opacity(world: &mut World, node: &AtomeUiNode) -> Result<(), String> {
    if let Some(opacity) = node.style.opacity {
        set_subtree_opacity(world, &node.id, opacity)?;
    }
    for child in &node.children {
        apply_tree_opacity(world, child)?;
    }
    Ok(())
}

fn mount_tree(world: &mut World, tree: AtomeUiTree) -> Result<(), String> {
    let tree_id = normalized_id(&tree.id, "bevy_ui_tree_id_required")?;
    if world
        .resource::<AtomeUiEntityTable>()
        .roots
        .contains_key(&tree_id)
    {
        return Err(format!("bevy_ui_tree_duplicate:{tree_id}"));
    }
    let root = spawn_ui_node(world, &tree_id, &tree.root, None)?;
    world
        .resource_mut::<AtomeUiEntityTable>()
        .roots
        .insert(tree_id, root);
    apply_tree_opacity(world, &tree.root)
}

fn ensure_ui_resources(world: &mut World) {
    world.init_resource::<AtomeUiEntityTable>();
    world.init_resource::<AtomeUiDiagnostics>();
    world.init_resource::<AtomeUiEventQueue>();
    world.init_resource::<Assets<Image>>();
}

fn update_tree(world: &mut World, tree: AtomeUiTree) -> Result<(), String> {
    let tree_id = normalized_id(&tree.id, "bevy_ui_tree_id_required")?;
    if world
        .resource::<AtomeUiEntityTable>()
        .roots
        .contains_key(&tree_id)
    {
        unmount_tree(world, &tree_id)?;
    }
    mount_tree(world, tree)
}

// The UI pass targets the camera's physical viewport, which can differ from
// the CSS canvas size: exposing it lets the JS runtime pre-scale logical
// trees by the exact effective ratio.
fn ui_viewport_size(world: &mut World) -> (u32, u32) {
    let mut query = world.query::<&Camera>();
    query
        .iter(world)
        .find_map(|camera| camera.physical_viewport_size())
        .map(|size| (size.x, size.y))
        .unwrap_or((0, 0))
}

// Temporary-turned-permanent ground-truth diagnostic: exposes the real
// window cursor position and which nodes Bevy's OWN `ui_focus_system`
// currently considers hovered/pressed, independent of our event queue —
// lets a probe tell "input never reached Bevy" apart from "events were
// dropped after the fact".
fn debug_cursor_and_hovered_nodes(world: &mut World) -> (Option<[f32; 2]>, Vec<String>) {
    let cursor_position = world
        .query::<&Window>()
        .iter(world)
        .find_map(|window| window.cursor_position())
        .map(|position| [position.x, position.y]);
    let hovered = world
        .query::<(&AtomeUiNodeId, &Interaction)>()
        .iter(world)
        .filter(|(_, interaction)| **interaction != Interaction::None)
        .map(|(id, _)| id.node_id.clone())
        .collect();
    (cursor_position, hovered)
}

fn refresh_diagnostics(world: &mut World, error: Option<String>) {
    let (viewport_width, viewport_height) = ui_viewport_size(world);
    let (cursor_position, hovered_node_ids) = debug_cursor_and_hovered_nodes(world);
    let table = world.resource::<AtomeUiEntityTable>();
    let queued_events = world.resource::<AtomeUiEventQueue>().events.len();
    let next = AtomeUiDiagnostics {
        mounted_trees: table.roots.len(),
        mounted_nodes: table.by_id.len(),
        applied_ops: world.resource::<AtomeUiDiagnostics>().applied_ops,
        queued_events,
        viewport_width,
        viewport_height,
        cursor_position,
        hovered_node_ids,
        last_error: error,
    };
    *world.resource_mut::<AtomeUiDiagnostics>() = next;
}

fn node_entity(world: &World, id: &str) -> Result<Entity, String> {
    world
        .resource::<AtomeUiEntityTable>()
        .by_id
        .get(id)
        .copied()
        .ok_or_else(|| format!("bevy_ui_node_missing:{id}"))
}

// In-place style patch: only the provided fields change, so animations
// (fade, scroll, tweened rects) cost one op per frame instead of a tree
// remount.
fn update_node_style(world: &mut World, id: &str, style: AtomeUiStyle) -> Result<(), String> {
    let entity = node_entity(world, &normalized_id(id, "bevy_ui_node_id_required")?)?;
    {
        let mut entity_mut = world.entity_mut(entity);
        if let Some(mut node) = entity_mut.get_mut::<Node>() {
            if let Some([x, y]) = style.position {
                node.position_type = PositionType::Absolute;
                node.left = px(finite(x, 0.0));
                node.top = px(finite(y, 0.0));
            }
            if let Some([width, height]) = style.size {
                node.width = px(finite(width, 1.0).max(1.0));
                node.height = px(finite(height, 1.0).max(1.0));
            }
            if let Some(radius) = style.radius {
                node.border_radius = BorderRadius::all(px(finite(radius, 0.0).max(0.0)));
            }
        }
        if let Some(background) = style.background {
            if let Some(mut current) = entity_mut.get_mut::<BackgroundColor>() {
                current.0 = color(Some(background), Color::NONE);
            }
        }
        if let Some(text_color) = style.color {
            if let Some(mut current) = entity_mut.get_mut::<TextColor>() {
                current.0 = color(Some(text_color), Color::WHITE);
            }
        }
        if let Some(z_index) = style.z_index {
            if let Some(mut current) = entity_mut.get_mut::<ZIndex>() {
                current.0 = z_index;
            }
            if let Some(mut current) = entity_mut.get_mut::<GlobalZIndex>() {
                current.0 = z_index;
            }
        }
        if let Some(scroll) = &style.scroll {
            entity_mut.insert(scroll_position(scroll));
        }
        if style.translation.is_some()
            || style.scale.is_some()
            || style.rotation.is_some()
            || style.origin.is_some()
        {
            entity_mut.insert(ui_transform(&style));
        }
        if let Some(shadow) = &style.shadow {
            entity_mut.insert(box_shadow(shadow));
        }
    }
    if let Some(opacity) = style.opacity {
        set_subtree_opacity(world, id, opacity)?;
    }
    Ok(())
}

fn scaled_alpha(base: Color, factor: f32) -> Color {
    base.with_alpha(base.alpha() * factor.clamp(0.0, 1.0))
}

// Group opacity: multiply every color alpha in the subtree by `opacity`,
// relative to the colors captured at spawn (idempotent per target value, so
// the fade emits one op per frame with the absolute opacity).
fn set_subtree_opacity(world: &mut World, id: &str, opacity: f32) -> Result<(), String> {
    let root = node_entity(world, &normalized_id(id, "bevy_ui_node_id_required")?)?;
    let factor = finite(opacity, 1.0);
    let mut stack = vec![root];
    while let Some(entity) = stack.pop() {
        if let Some(children) = world.get::<Children>(entity) {
            stack.extend(children.iter());
        }
        let mut entity_mut = world.entity_mut(entity);
        let base = match entity_mut.get::<AtomeUiBaseColors>() {
            Some(base) => base.clone(),
            None => {
                let captured = AtomeUiBaseColors {
                    background: entity_mut.get::<BackgroundColor>().map(|value| value.0),
                    text: entity_mut.get::<TextColor>().map(|value| value.0),
                    image: entity_mut.get::<ImageNode>().map(|value| value.color),
                    shadows: entity_mut
                        .get::<BoxShadow>()
                        .map(|value| value.0.iter().map(|shadow| shadow.color).collect()),
                };
                entity_mut.insert(captured.clone());
                captured
            }
        };
        if let (Some(base_color), Some(mut current)) =
            (base.background, entity_mut.get_mut::<BackgroundColor>())
        {
            current.0 = scaled_alpha(base_color, factor);
        }
        if let (Some(base_color), Some(mut current)) =
            (base.text, entity_mut.get_mut::<TextColor>())
        {
            current.0 = scaled_alpha(base_color, factor);
        }
        if let Some(base_color) = base.image {
            if let Some(mut current) = entity_mut.get_mut::<ImageNode>() {
                current.color = scaled_alpha(base_color, factor);
            }
        }
        if let Some(base_shadows) = &base.shadows {
            if let Some(mut current) = entity_mut.get_mut::<BoxShadow>() {
                for (shadow, base_color) in current.0.iter_mut().zip(base_shadows) {
                    shadow.color = scaled_alpha(*base_color, factor);
                }
            }
        }
    }
    Ok(())
}

pub fn apply_ui_ops(world: &mut World, ops: Vec<AtomeUiOp>) {
    ensure_ui_resources(world);
    for op in ops {
        let result = match op {
            AtomeUiOp::MountTree { tree } => mount_tree(world, tree),
            AtomeUiOp::UpdateTree { tree } => update_tree(world, tree),
            AtomeUiOp::UnmountTree { id } => unmount_tree(world, &id),
            AtomeUiOp::UpdateNodeStyle { id, style } => update_node_style(world, &id, style),
            AtomeUiOp::SetSubtreeOpacity { id, opacity } => {
                set_subtree_opacity(world, &id, opacity)
            }
        };
        if let Err(error) = result {
            refresh_diagnostics(world, Some(error));
            return;
        }
        world.resource_mut::<AtomeUiDiagnostics>().applied_ops += 1;
    }
    refresh_diagnostics(world, None);
}

pub fn read_ui_diagnostics(world: &World) -> AtomeUiDiagnostics {
    if !world.contains_resource::<AtomeUiDiagnostics>() {
        return AtomeUiDiagnostics::default();
    }
    let mut diagnostics = world.resource::<AtomeUiDiagnostics>().clone();
    diagnostics.queued_events = world
        .get_resource::<AtomeUiEventQueue>()
        .map(|queue| queue.events.len())
        .unwrap_or(0);
    diagnostics
}

pub fn drain_ui_events(world: &mut World) -> Vec<AtomeUiEvent> {
    ensure_ui_resources(world);
    let events = world
        .resource_mut::<AtomeUiEventQueue>()
        .events
        .drain(..)
        .collect();
    refresh_diagnostics(world, None);
    events
}

// Runs every frame (NOT gated on `Changed<Interaction>`): a drag/wheel must
// still fire while a node stays `Pressed`/`Hovered` across many unchanged
// frames, which a change-detection filter would silently miss.
fn collect_ui_interactions(
    mut events: ResMut<AtomeUiEventQueue>,
    mut diagnostics: ResMut<AtomeUiDiagnostics>,
    mut wheel_events: MessageReader<MouseWheel>,
    mut query: Query<(
        &AtomeUiNodeId,
        &Interaction,
        &RelativeCursorPosition,
        &ComputedNode,
        &mut AtomeUiInteractionState,
    )>,
) {
    // MouseScrollUnit (Line vs Pixel) is not distinguished yet: both are
    // summed as raw delta, sufficient for the current consumers (drag-style
    // panning). A future consumer needing precise line-scroll semantics can
    // extend this.
    let wheel_delta = wheel_events
        .read()
        .fold(Vec2::ZERO, |acc, event| acc + Vec2::new(event.x, event.y));
    for (id, interaction, relative_cursor, computed_node, mut state) in &mut query {
        let position = relative_cursor
            .normalized
            .map(|value| value * computed_node.size)
            .unwrap_or(state.position);
        let mut push = |name: &str, delta: Vec2| {
            events.events.push(AtomeUiEvent {
                tree_id: id.tree_id.clone(),
                node_id: id.node_id.clone(),
                kind: id.kind.clone(),
                event: name.to_string(),
                x: position.x,
                y: position.y,
                delta_x: delta.x,
                delta_y: delta.y,
            });
        };
        match (state.interaction, *interaction) {
            (Interaction::None, Interaction::Hovered) => push("hover", Vec2::ZERO),
            (Interaction::Hovered, Interaction::None) => push("blur", Vec2::ZERO),
            (Interaction::None, Interaction::Pressed)
            | (Interaction::Hovered, Interaction::Pressed) => push("press", Vec2::ZERO),
            (Interaction::Pressed, Interaction::Hovered) => {
                push("release", Vec2::ZERO);
                push("activate", Vec2::ZERO);
            }
            (Interaction::Pressed, Interaction::None) => push("release", Vec2::ZERO),
            _ => {}
        }
        if *interaction == Interaction::Pressed {
            let delta = position - state.position;
            if delta.length_squared() > 0.0 {
                push("drag", delta);
            }
        }
        if *interaction != Interaction::None && wheel_delta != Vec2::ZERO {
            push("wheel", wheel_delta);
        }
        drop(push);
        state.interaction = *interaction;
        state.position = position;
    }
    diagnostics.queued_events = events.events.len();
}
