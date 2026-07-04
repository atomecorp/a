mod types;
#[cfg(test)]
mod tests;

pub use types::*;

use crate::texture::image_handle_from_texture;
use bevy::prelude::*;
use bevy::ui::{percent, px, widget::ImageNode, GlobalZIndex};

pub struct AtomeBevyUiPlugin;

impl Plugin for AtomeBevyUiPlugin {
    fn build(&self, app: &mut App) {
        app.init_resource::<AtomeUiEntityTable>()
            .init_resource::<AtomeUiDiagnostics>()
            .init_resource::<AtomeUiEventQueue>()
            .init_resource::<Assets<Image>>()
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
    node
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

fn spawn_text_child(world: &mut World, parent: Entity, node: &AtomeUiNode) {
    let text = node.text.clone().unwrap_or_default();
    if text.is_empty() {
        return;
    }
    let text_entity = world
        .spawn((
            node_layout(&node.kind, &node.style),
            Text::new(text),
            TextFont {
                font_size: finite(node.style.font_size.unwrap_or(12.0), 12.0).max(1.0),
                ..default()
            },
            TextColor(color(node.style.color, Color::WHITE)),
        ))
        .id();
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
    let tint = node.image.as_ref().and_then(|image| image.tint).or(node.style.color);
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
                TextFont {
                    font_size: finite(node.style.font_size.unwrap_or(12.0), 12.0).max(1.0),
                    ..default()
                },
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
            entity.insert((Button, Interaction::None));
        }
        entity.id()
    };
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
    Ok(())
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

fn refresh_diagnostics(world: &mut World, error: Option<String>) {
    let table = world.resource::<AtomeUiEntityTable>();
    let queued_events = world.resource::<AtomeUiEventQueue>().events.len();
    let next = AtomeUiDiagnostics {
        mounted_trees: table.roots.len(),
        mounted_nodes: table.by_id.len(),
        applied_ops: world.resource::<AtomeUiDiagnostics>().applied_ops,
        queued_events,
        last_error: error,
    };
    *world.resource_mut::<AtomeUiDiagnostics>() = next;
}

pub fn apply_ui_ops(world: &mut World, ops: Vec<AtomeUiOp>) {
    ensure_ui_resources(world);
    for op in ops {
        let result = match op {
            AtomeUiOp::MountTree { tree } => mount_tree(world, tree),
            AtomeUiOp::UpdateTree { tree } => update_tree(world, tree),
            AtomeUiOp::UnmountTree { id } => unmount_tree(world, &id),
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

fn collect_ui_interactions(
    mut events: ResMut<AtomeUiEventQueue>,
    mut diagnostics: ResMut<AtomeUiDiagnostics>,
    query: Query<(&AtomeUiNodeId, &Interaction), Changed<Interaction>>,
) {
    for (id, interaction) in &query {
        let event = match interaction {
            Interaction::Pressed => "activate",
            Interaction::Hovered => "hover",
            Interaction::None => "blur",
        };
        events.events.push(AtomeUiEvent {
            tree_id: id.tree_id.clone(),
            node_id: id.node_id.clone(),
            kind: id.kind.clone(),
            event: event.to_string(),
        });
    }
    diagnostics.queued_events = events.events.len();
}
