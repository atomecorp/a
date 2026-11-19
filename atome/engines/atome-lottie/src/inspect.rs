//! What a Lottie file holds, counted from its JSON before anything is drawn: its timing, its layers, shapes,
//! keyframes, masks and mattes. The features the renderer does not draw are added by `prepare` as it meets
//! them (`unsupported`, feature name → occurrences). The report is data on the atome, never shown.
use std::collections::BTreeMap;

use serde::Serialize;
use serde_json::Value;

use crate::archive::LottieContainer;

#[derive(Clone, Debug, Serialize, PartialEq)]
pub struct LottieReport {
    pub container: LottieContainer,
    pub version: String,
    pub frame_rate: f64,
    pub in_point: f64,
    pub out_point: f64,
    /// `(op - ip) / fr`.
    pub duration_seconds: f64,
    pub width: u32,
    pub height: u32,
    /// Every layer, those of the precompositions included.
    pub layer_count: usize,
    pub layer_types: BTreeMap<String, usize>,
    pub shape_count: usize,
    pub shape_types: BTreeMap<String, usize>,
    pub keyframe_count: usize,
    /// Keyframes eased by a bezier (`i`/`o`), and held ones (`h: 1`).
    pub eased_keyframe_count: usize,
    pub hold_keyframe_count: usize,
    pub precomposition_count: usize,
    pub mask_count: usize,
    pub matte_count: usize,
    pub unsupported: BTreeMap<String, usize>,
}

impl LottieReport {
    pub(crate) fn note(&mut self, feature: &str) {
        *self.unsupported.entry(feature.to_string()).or_insert(0) += 1;
    }
}

fn number(root: &Value, key: &str) -> Result<f64, String> {
    root.get(key)
        .and_then(Value::as_f64)
        .filter(|value| value.is_finite())
        .ok_or_else(|| format!("lottie_field_missing:{key}"))
}

pub(crate) fn layer_type_name(ty: u64) -> String {
    match ty {
        0 => "precomposition".into(),
        1 => "solid".into(),
        2 => "image".into(),
        3 => "null".into(),
        4 => "shape".into(),
        5 => "text".into(),
        6 => "audio".into(),
        13 => "camera".into(),
        15 => "data".into(),
        other => format!("type_{other}"),
    }
}

pub fn inspect(root: &Value, container: LottieContainer) -> Result<LottieReport, String> {
    let frame_rate = number(root, "fr")?;
    let in_point = number(root, "ip")?;
    let out_point = number(root, "op")?;
    if frame_rate <= 0.0 || out_point <= in_point {
        return Err("lottie_timing_invalid".into());
    }
    let width = number(root, "w")?;
    let height = number(root, "h")?;
    if width < 1.0 || height < 1.0 || width > 16384.0 || height > 16384.0 {
        return Err("lottie_size_invalid".into());
    }
    let mut report = LottieReport {
        container,
        version: root
            .get("v")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string(),
        frame_rate,
        in_point,
        out_point,
        duration_seconds: (out_point - in_point) / frame_rate,
        width: width.round() as u32,
        height: height.round() as u32,
        layer_count: 0,
        layer_types: BTreeMap::new(),
        shape_count: 0,
        shape_types: BTreeMap::new(),
        keyframe_count: 0,
        eased_keyframe_count: 0,
        hold_keyframe_count: 0,
        precomposition_count: 0,
        mask_count: 0,
        matte_count: 0,
        unsupported: BTreeMap::new(),
    };
    let mut layer_sets: Vec<&Vec<Value>> = root
        .get("layers")
        .and_then(Value::as_array)
        .into_iter()
        .collect();
    if layer_sets.is_empty() {
        return Err("lottie_field_missing:layers".into());
    }
    for asset in root
        .get("assets")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
    {
        if let Some(layers) = asset.get("layers").and_then(Value::as_array) {
            report.precomposition_count += 1;
            layer_sets.push(layers);
        }
    }
    for layer in layer_sets.into_iter().flatten() {
        count_layer(layer, &mut report);
    }
    count_keyframes(root, &mut report);
    Ok(report)
}

fn count_layer(layer: &Value, report: &mut LottieReport) {
    report.layer_count += 1;
    let ty = layer.get("ty").and_then(Value::as_u64).unwrap_or(u64::MAX);
    *report.layer_types.entry(layer_type_name(ty)).or_insert(0) += 1;
    report.mask_count += layer
        .get("masksProperties")
        .and_then(Value::as_array)
        .map_or(0, Vec::len);
    if layer
        .get("tt")
        .and_then(Value::as_u64)
        .is_some_and(|mode| mode > 0)
    {
        report.matte_count += 1;
    }
    count_shapes(layer.get("shapes"), report);
}

fn count_shapes(items: Option<&Value>, report: &mut LottieReport) {
    for item in items.and_then(Value::as_array).into_iter().flatten() {
        report.shape_count += 1;
        let ty = item.get("ty").and_then(Value::as_str).unwrap_or("?");
        *report.shape_types.entry(ty.to_string()).or_insert(0) += 1;
        count_shapes(item.get("it"), report);
    }
}

/// An animated property is `{ "a": 1, "k": [keyframe…] }`, its keyframes carrying their time `t` (bodymovin 4
/// files omit `a`: the keyframes alone tell it).
fn count_keyframes(value: &Value, report: &mut LottieReport) {
    match value {
        Value::Object(object) => {
            if let Some(keys) = object.get("k").and_then(Value::as_array) {
                for key in keys.iter().filter(|key| key.get("t").is_some()) {
                    report.keyframe_count += 1;
                    if key.get("h").and_then(Value::as_u64) == Some(1) {
                        report.hold_keyframe_count += 1;
                    } else if key.get("i").is_some() && key.get("o").is_some() {
                        report.eased_keyframe_count += 1;
                    }
                }
            }
            object
                .values()
                .for_each(|child| count_keyframes(child, report));
        }
        Value::Array(items) => items
            .iter()
            .for_each(|child| count_keyframes(child, report)),
        _ => {}
    }
}
