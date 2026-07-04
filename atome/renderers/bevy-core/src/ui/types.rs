use crate::types::AtomeTexture;
use bevy::prelude::*;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Clone, Debug, Component)]
pub struct AtomeUiNodeId {
    pub tree_id: String,
    pub node_id: String,
    pub kind: String,
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
    pub last_error: Option<String>,
}

#[derive(Clone, Debug, Resource, Default)]
pub struct AtomeUiEventQueue {
    pub events: Vec<AtomeUiEvent>,
}

#[derive(Clone, Debug, Serialize)]
pub struct AtomeUiEvent {
    pub tree_id: String,
    pub node_id: String,
    pub kind: String,
    pub event: String,
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
}

#[derive(Clone, Debug, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum AtomeUiOp {
    MountTree { tree: AtomeUiTree },
    UpdateTree { tree: AtomeUiTree },
    UnmountTree { id: String },
}
