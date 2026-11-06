//! The web renderer's linear band lenses (`atome_bevy_renderer_core::linear_lens_band`): the browser
//! describes a band once and sends the finger's target; the renderer steps the spring on its own frames
//! and lays the records' poses itself, asking the next animation frame while the lens moves.
//!
//! The queries a gesture asks while it slides (the tool under the finger, a tool's cell) answer at once
//! from the lens's own model, outside the renderer's frame.
use atome_bevy_renderer_core::AtomeRendererDiagnostics;
use atome_bevy_renderer_core::linear_lens::{LinearLensRecordSpec, LinearLensSpec};
use atome_bevy_renderer_core::linear_lens_band::LinearLensBand;
use bevy::prelude::*;
use serde::Serialize;
use std::cell::RefCell;
use std::collections::HashMap;
use wasm_bindgen::prelude::*;

use super::frame_clock::wake_web_renderer;

#[derive(Default)]
struct WebLinearLenses {
    bands: HashMap<String, LinearLensBand>,
    /// Lenses replaced or detached: their records are laid back on their description at the next frame.
    closing: Vec<LinearLensBand>,
}

thread_local! {
    static WEB_LINEAR_LENSES: RefCell<WebLinearLenses> = RefCell::new(WebLinearLenses::default());
}

pub(crate) fn present_web_linear_lenses(world: &mut World) {
    let now_ms = world.resource::<Time<Real>>().elapsed_secs_f64() * 1000.0;
    let mut errors = Vec::new();
    let again = WEB_LINEAR_LENSES.with(|cell| {
        let mut lenses = cell.borrow_mut();
        for mut band in std::mem::take(&mut lenses.closing) {
            errors.extend(band.restore(world).err());
        }
        let mut again = false;
        for band in lenses.bands.values_mut() {
            match band.present(world, now_ms) {
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

fn with_band<T>(
    tree_id: &str,
    action: impl FnOnce(&mut LinearLensBand) -> T,
) -> Result<T, JsValue> {
    let result =
        WEB_LINEAR_LENSES.with(|cell| cell.borrow_mut().bands.get_mut(tree_id).map(action));
    result.ok_or_else(|| JsValue::from_str(&format!("bevy_linear_lens_missing:{tree_id}")))
}

fn changed<T>(result: T) -> T {
    wake_web_renderer();
    result
}

#[wasm_bindgen]
pub fn attach_atome_bevy_linear_lens(tree_id: String, spec: JsValue) -> Result<(), JsValue> {
    let spec: LinearLensSpec = serde_wasm_bindgen::from_value(spec)
        .map_err(|error| JsValue::from_str(&format!("bevy_linear_lens_spec_invalid:{error}")))?;
    WEB_LINEAR_LENSES.with(|cell| {
        let mut lenses = cell.borrow_mut();
        if let Some(previous) = lenses.bands.insert(tree_id, LinearLensBand::new(spec)) {
            lenses.closing.push(previous);
        }
    });
    wake_web_renderer();
    Ok(())
}

#[wasm_bindgen]
pub fn detach_atome_bevy_linear_lens(tree_id: String) {
    WEB_LINEAR_LENSES.with(|cell| {
        let mut lenses = cell.borrow_mut();
        if let Some(previous) = lenses.bands.remove(&tree_id) {
            lenses.closing.push(previous);
        }
    });
    wake_web_renderer();
}

/// Aims the lens at `index` (none: back to rest); the target sizes when the aim changed.
#[wasm_bindgen]
pub fn aim_atome_bevy_linear_lens(
    tree_id: String,
    index: Option<u32>,
    reduced_motion: bool,
) -> Result<Option<Vec<f64>>, JsValue> {
    with_band(&tree_id, |band| {
        band.set_target(index.map(|index| index as usize), reduced_motion)
            .then(|| band.target_sizes().to_vec())
    })
    .map(changed)
}

#[wasm_bindgen]
pub fn hover_atome_bevy_linear_lens(tree_id: String, value: f64) -> Result<Option<u32>, JsValue> {
    with_band(&tree_id, |band| {
        band.hover_at(value).map(|index| index as u32)
    })
}

/// A tool's cell `[x, y, size]` on the geometry aimed at.
#[wasm_bindgen]
pub fn cell_atome_bevy_linear_lens(
    tree_id: String,
    index: u32,
) -> Result<Option<Vec<f64>>, JsValue> {
    with_band(&tree_id, |band| {
        band.centre_of(index as usize)
            .map(|cell| vec![cell.x, cell.y, cell.size])
    })
}

#[wasm_bindgen]
pub fn rest_atome_bevy_linear_lens(tree_id: String) -> Result<(), JsValue> {
    with_band(&tree_id, LinearLensBand::snap_to_rest).map(changed)
}

#[wasm_bindgen]
pub fn rebase_atome_bevy_linear_lens(tree_id: String, delta: f64) -> Result<(), JsValue> {
    with_band(&tree_id, |band| band.rebase(delta)).map(changed)
}

/// The band's records described again at rest: each tool's records with their new rest boxes.
#[wasm_bindgen]
pub fn refresh_atome_bevy_linear_lens(tree_id: String, records: JsValue) -> Result<(), JsValue> {
    let records: Vec<Vec<LinearLensRecordSpec>> = serde_wasm_bindgen::from_value(records)
        .map_err(|error| JsValue::from_str(&format!("bevy_linear_lens_records_invalid:{error}")))?;
    with_band(&tree_id, |band| band.refresh(records)).map(changed)
}

#[derive(Serialize)]
struct LinearLensMeasure {
    hovered: Option<usize>,
    at_rest: bool,
    animating: bool,
    frames: u32,
    patches: u32,
    target: Vec<f64>,
    cells: Vec<[f64; 3]>,
}

#[wasm_bindgen]
pub fn measure_atome_bevy_linear_lens(tree_id: String) -> Result<JsValue, JsValue> {
    let measure = with_band(&tree_id, |band| {
        let (frames, patches) = band.counters();
        LinearLensMeasure {
            hovered: band.hovered(),
            at_rest: band.is_at_rest(),
            animating: band.animating(),
            frames,
            patches,
            target: band.target_sizes().to_vec(),
            cells: band
                .current_cells()
                .iter()
                .map(|cell| [cell.x, cell.y, cell.size])
                .collect(),
        }
    })?;
    serde_wasm_bindgen::to_value(&measure).map_err(|error| JsValue::from_str(&error.to_string()))
}
