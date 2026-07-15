use crate::types::AtomeTexture;
use bevy::prelude::*;
use bevy::text::Font;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Clone, Debug, Component)]
pub struct AtomeUiNodeId {
    pub tree_id: String,
    pub node_id: String,
    pub kind: String,
}

// Registered UI font faces by weight (static TTFs: one handle per weight).
#[derive(Clone, Debug, Default, Resource)]
pub struct AtomeUiFontTable {
    pub by_weight: Vec<(u16, Handle<Font>)>,
}

impl AtomeUiFontTable {
    pub fn insert(&mut self, weight: u16, handle: Handle<Font>) {
        self.by_weight.retain(|(existing, _)| *existing != weight);
        self.by_weight.push((weight, handle));
        self.by_weight.sort_by_key(|(existing, _)| *existing);
    }

    pub fn handle_for_weight(&self, weight: u16) -> Option<Handle<Font>> {
        self.by_weight
            .iter()
            .min_by_key(|(existing, _)| existing.abs_diff(weight))
            .map(|(_, handle)| handle.clone())
    }
}

#[derive(Clone, Debug, Default, Resource)]
pub struct AtomeUiEntityTable {
    pub roots: HashMap<String, Entity>,
    pub by_id: HashMap<String, Entity>,
}

#[derive(Clone, Debug, Default, Resource, Serialize)]
pub struct AtomeUiDiagnostics {
    pub mounted_trees: usize,
    pub mounted_nodes: usize,
    pub applied_ops: usize,
    pub queued_events: usize,
    pub viewport_width: u32,
    pub viewport_height: u32,
    pub cursor_position: Option<[f32; 2]>,
    pub hovered_node_ids: Vec<String>,
    pub last_error: Option<String>,
}

#[derive(Clone, Debug, Resource, Default)]
pub struct AtomeUiEventQueue {
    pub events: Vec<AtomeUiEvent>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct AtomeUiEvent {
    pub tree_id: String,
    pub node_id: String,
    pub kind: String,
    pub event: String,
    /// Cursor position in node-local logical pixels (origin top-left of the
    /// node), valid for press/release/hover/blur/drag/wheel.
    pub x: f32,
    pub y: f32,
    /// Movement/scroll delta since the previous frame; zero for
    /// press/release/hover/blur, populated for drag and wheel.
    pub delta_x: f32,
    pub delta_y: f32,
}

#[derive(Clone, Debug, Deserialize)]
pub struct AtomeUiTree {
    pub id: String,
    pub root: AtomeUiNode,
}

#[derive(Clone, Debug, Deserialize)]
pub struct AtomeUiNode {
    pub id: String,
    pub kind: String,
    #[serde(default)]
    pub text: Option<String>,
    #[serde(default)]
    pub image: Option<AtomeUiImage>,
    #[serde(default)]
    pub style: AtomeUiStyle,
    #[serde(default)]
    pub children: Vec<AtomeUiNode>,
}

#[derive(Clone, Debug, Default, Deserialize)]
pub struct AtomeUiImage {
    #[serde(default)]
    pub source: Option<String>,
    #[serde(default)]
    pub fit: Option<String>,
    #[serde(default)]
    pub opacity: Option<f32>,
    #[serde(default)]
    pub tint: Option<[f32; 4]>,
    #[serde(default)]
    pub texture: Option<AtomeTexture>,
}

#[derive(Clone, Debug, Default, Deserialize)]
pub struct AtomeUiStyle {
    #[serde(default)]
    pub position: Option<[f32; 2]>,
    #[serde(default)]
    pub translation: Option<[f32; 2]>,
    #[serde(default)]
    pub scale: Option<[f32; 2]>,
    #[serde(default)]
    pub rotation: Option<f32>,
    #[serde(default)]
    pub origin: Option<[f32; 2]>,
    #[serde(default)]
    pub size: Option<[f32; 2]>,
    #[serde(default)]
    pub min_size: Option<[f32; 2]>,
    #[serde(default)]
    pub max_size: Option<[f32; 2]>,
    #[serde(default)]
    pub padding: Option<[f32; 4]>,
    #[serde(default)]
    pub margin: Option<[f32; 4]>,
    #[serde(default)]
    pub border: Option<[f32; 4]>,
    #[serde(default)]
    pub background: Option<[f32; 4]>,
    #[serde(default)]
    pub color: Option<[f32; 4]>,
    #[serde(default)]
    pub border_color: Option<[f32; 4]>,
    #[serde(default)]
    pub radius: Option<f32>,
    #[serde(default)]
    pub flex_direction: Option<String>,
    #[serde(default)]
    pub align_items: Option<String>,
    #[serde(default)]
    pub justify_content: Option<String>,
    #[serde(default)]
    pub gap: Option<f32>,
    #[serde(default)]
    pub flex_grow: Option<f32>,
    #[serde(default)]
    pub z_index: Option<i32>,
    #[serde(default)]
    pub overflow: Option<String>,
    #[serde(default)]
    pub font_size: Option<f32>,
    #[serde(default)]
    pub opacity: Option<f32>,
    #[serde(default)]
    pub radius_corners: Option<[f32; 4]>,
    #[serde(default)]
    pub shadow: Option<AtomeUiShadow>,
    #[serde(default)]
    pub scroll: Option<[f32; 2]>,
    #[serde(default)]
    pub text_align: Option<String>,
    #[serde(default)]
    pub line_height: Option<f32>,
    #[serde(default)]
    pub font_weight: Option<f32>,
}

#[derive(Clone, Debug, Default, Deserialize)]
pub struct AtomeUiShadow {
    pub color: [f32; 4],
    #[serde(default)]
    pub blur: f32,
    #[serde(default)]
    pub spread: f32,
    #[serde(default)]
    pub offset: [f32; 2],
}

#[derive(Clone, Debug, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum AtomeUiOp {
    MountTree { tree: AtomeUiTree },
    UpdateTree { tree: AtomeUiTree },
    UnmountTree { id: String },
    UpdateNodeStyle { id: String, style: AtomeUiStyle },
    SetSubtreeOpacity { id: String, opacity: f32 },
}
