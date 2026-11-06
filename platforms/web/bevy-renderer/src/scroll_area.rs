//! The web renderer's scroll areas (`atome_bevy_renderer_core::scroll_area`): the browser describes a UI
//! tree's lists at rest and sends the finger (press, drag, release) or a wheel's notch; the renderer moves
//! the lists, glides and bounces them on its own frames and lays their records' poses, asking the next
//! animation frame while a list moves. The browser reads where each list is (`poll`) to tell the tree's
//! listeners and, once a list rests, to describe the tree again at that offset.
use atome_bevy_renderer_core::AtomeRendererDiagnostics;
use atome_bevy_renderer_core::scroll_area::{ScrollTree, ScrollTreeSpec};
use atome_bevy_renderer_core::scroll_motion::ScrollMotion;
use bevy::prelude::*;
use std::cell::RefCell;
use std::collections::HashMap;
use wasm_bindgen::prelude::*;

use super::frame_clock::wake_web_renderer;

#[derive(Default)]
struct WebScrollTrees {
    trees: HashMap<String, ScrollTree>,
    /// Trees detached: their records are laid back on their description at the next frame.
    closing: Vec<ScrollTree>,
}

thread_local! {
    static WEB_SCROLL_TREES: RefCell<WebScrollTrees> = RefCell::new(WebScrollTrees::default());
}

pub(crate) fn present_web_scroll_areas(world: &mut World) {
    let now_ms = world.resource::<Time<Real>>().elapsed_secs_f64() * 1000.0;
    let mut errors = Vec::new();
    let again = WEB_SCROLL_TREES.with(|cell| {
        let mut scroll = cell.borrow_mut();
        for mut tree in std::mem::take(&mut scroll.closing) {
            errors.extend(tree.restore(world).err());
        }
        let mut again = false;
        for tree in scroll.trees.values_mut() {
            match tree.present(world, now_ms) {
                Ok(moving) => again |= moving,
                Err(error) => errors.push(error),
            }
        }
        again
    });
    if let Some(error) = errors.pop() {
        world.resource_mut::<AtomeRendererDiagnostics>().last_error = Some(error);
    }
    if again {
        wake_web_renderer();
    }
}

fn with_motion<T>(
    tree_id: &str,
    area: &str,
    action: impl FnOnce(&mut ScrollMotion) -> T,
) -> Result<T, JsValue> {
    let result = WEB_SCROLL_TREES.with(|cell| {
        cell.borrow_mut()
            .trees
            .get_mut(tree_id)
            .and_then(|tree| tree.motion_mut(area))
            .map(action)
    });
    let result = result
        .ok_or_else(|| JsValue::from_str(&format!("bevy_scroll_area_missing:{tree_id}:{area}")))?;
    wake_web_renderer();
    Ok(result)
}

/// The tree described (again) at rest: its lists and the records each one moves.
#[wasm_bindgen]
pub fn describe_atome_bevy_scroll_tree(tree_id: String, spec: JsValue) -> Result<(), JsValue> {
    let spec: ScrollTreeSpec = serde_wasm_bindgen::from_value(spec)
        .map_err(|error| JsValue::from_str(&format!("bevy_scroll_tree_spec_invalid:{error}")))?;
    WEB_SCROLL_TREES.with(|cell| {
        let mut scroll = cell.borrow_mut();
        match scroll.trees.get_mut(&tree_id) {
            Some(tree) => tree.describe(spec),
            None => {
                scroll.trees.insert(tree_id, ScrollTree::new(spec));
            }
        }
    });
    wake_web_renderer();
    Ok(())
}

#[wasm_bindgen]
pub fn detach_atome_bevy_scroll_tree(tree_id: String) {
    WEB_SCROLL_TREES.with(|cell| {
        let mut scroll = cell.borrow_mut();
        if let Some(previous) = scroll.trees.remove(&tree_id) {
            scroll.closing.push(previous);
        }
    });
    wake_web_renderer();
}

/// A press on a list still gliding: true, and a glide stops where it shows.
#[wasm_bindgen]
pub fn catch_atome_bevy_scroll(tree_id: String, area: String) -> Result<bool, JsValue> {
    with_motion(&tree_id, &area, ScrollMotion::catch_glide)
}

/// `at`: the pointer event's time (ms), the drag's own clock.
#[wasm_bindgen]
pub fn press_atome_bevy_scroll(
    tree_id: String,
    area: String,
    y: f64,
    at: f64,
) -> Result<(), JsValue> {
    with_motion(&tree_id, &area, |motion| motion.press(y, at))
}

#[wasm_bindgen]
pub fn drag_atome_bevy_scroll(
    tree_id: String,
    area: String,
    y: f64,
    at: f64,
) -> Result<(), JsValue> {
    with_motion(&tree_id, &area, |motion| motion.drag(y, at))
}

#[wasm_bindgen]
pub fn release_atome_bevy_scroll(tree_id: String, area: String, at: f64) -> Result<(), JsValue> {
    with_motion(&tree_id, &area, |motion| motion.release(at))
}

#[wasm_bindgen]
pub fn wheel_atome_bevy_scroll(tree_id: String, area: String, delta: f64) -> Result<(), JsValue> {
    with_motion(&tree_id, &area, |motion| motion.wheel(delta))
}

/// Every list of the tree: the offset it shows and whether it still moves.
#[wasm_bindgen]
pub fn poll_atome_bevy_scroll(tree_id: String) -> Result<JsValue, JsValue> {
    let report = WEB_SCROLL_TREES.with(|cell| {
        cell.borrow()
            .trees
            .get(&tree_id)
            .map(|tree| (tree.report(), tree.patches()))
    });
    let (areas, patches) =
        report.ok_or_else(|| JsValue::from_str(&format!("bevy_scroll_tree_missing:{tree_id}")))?;
    #[derive(serde::Serialize)]
    struct Poll {
        areas: Vec<atome_bevy_renderer_core::scroll_area::ScrollAreaReport>,
        patches: u32,
    }
    serde_wasm_bindgen::to_value(&Poll { areas, patches })
        .map_err(|error| JsValue::from_str(&error.to_string()))
}
