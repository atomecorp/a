//! The JSON made readable by velato 0.12, every change named in the report. Velato refuses a whole file
//! for one layer or shape type it does not know (text, zig-zag…) and stops the program on a few
//! constructs (`todo!`/`unimplemented!`: a layer without rotation, a 3D rotation, a shape transform's split
//! position, the Add and Hard Mix blend modes). These are taken out or given the value the Lottie format
//! defines for them; what is not drawn is counted in `unsupported`. A bodymovin 4 file gets the `a` of its
//! animated properties (format 5). Nothing else is altered.
use serde_json::{Value, json};

use crate::inspect::{LottieReport, layer_type_name};

/// The shape items velato draws (group, rectangle, ellipse, path, star, fill, stroke, gradient fill and
/// stroke, transform, repeater, trim path).
const DRAWN_SHAPES: &[&str] = &[
    "gr", "rc", "el", "sh", "sr", "fl", "st", "gf", "gs", "tr", "rp", "tm",
];
/// Repeated copies of one shape, nested repeaters multiplied: velato expands them all every frame.
const MAX_REPEATED_COPIES: f64 = 4096.0;

pub fn prepare(root: &mut Value, report: &mut LottieReport) -> Result<(), String> {
    crate::bodymovin4::mark_keyframed(root);
    if root.get("chars").is_some() || root.get("fonts").is_some() {
        report.note("text_fonts");
    }
    if let Some(layers) = root.get_mut("layers").and_then(Value::as_array_mut) {
        prepare_layers(layers, report)?;
    }
    for asset in root
        .get_mut("assets")
        .and_then(Value::as_array_mut)
        .into_iter()
        .flatten()
    {
        if let Some(layers) = asset.get_mut("layers").and_then(Value::as_array_mut) {
            prepare_layers(layers, report)?;
        }
    }
    Ok(())
}

fn prepare_layers(layers: &mut Vec<Value>, report: &mut LottieReport) -> Result<(), String> {
    layers.retain(|layer| {
        let ty = layer.get("ty").and_then(Value::as_u64).unwrap_or(u64::MAX);
        let kept = ty <= 4;
        if !kept {
            report.note(&format!("{}_layer", layer_type_name(ty)));
        }
        kept
    });
    for layer in layers.iter_mut() {
        prepare_layer(layer, report)?;
    }
    Ok(())
}

fn truthy(value: Option<&Value>) -> bool {
    value.is_some_and(|value| value.as_u64() == Some(1) || value.as_bool() == Some(true))
}

fn prepare_layer(layer: &mut Value, report: &mut LottieReport) -> Result<(), String> {
    if layer.get("ty").and_then(Value::as_u64) == Some(2) {
        report.note("image_layer");
    }
    if truthy(layer.get("ddd")) {
        report.note("3d_layer");
    }
    if truthy(layer.get("ao")) {
        report.note("auto_orient");
    }
    if truthy(layer.get("mb")) {
        report.note("motion_blur");
    }
    if layer
        .get("sr")
        .and_then(Value::as_f64)
        .is_some_and(|stretch| stretch != 1.0)
    {
        report.note("time_stretch");
    }
    for (key, feature) in [
        ("ef", "effect"),
        ("sy", "layer_style"),
        ("masksProperties", "layer_mask"),
    ] {
        for _ in layer
            .get(key)
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
        {
            report.note(feature);
        }
    }
    if let Some(transform) = layer.get_mut("ks").and_then(Value::as_object_mut) {
        if transform.contains_key("rx") || transform.contains_key("ry") {
            report.note("3d_rotation");
        }
        if !transform.contains_key("r") {
            // The format's rotation is 0 when absent; a 3D layer's 2D rotation is its `rz`.
            let rotation = transform
                .get("rz")
                .cloned()
                .unwrap_or(json!({ "a": 0, "k": 0 }));
            transform.insert("r".into(), rotation);
        }
        if position_has_tangents(transform.get("p")) {
            report.note("position_path_tangents");
        }
    }
    neutralize_blend_modes(layer, report);
    count_expressions(layer, report);
    if let Some(shapes) = layer.get_mut("shapes").and_then(Value::as_array_mut) {
        prepare_shapes(shapes, report, 1.0)?;
    }
    Ok(())
}

/// A motion path (`ti`/`to` tangents not all zero): velato moves the layer straight between keyframes.
fn position_has_tangents(position: Option<&Value>) -> bool {
    let Some(keys) = position
        .filter(|position| truthy(position.get("a")))
        .and_then(|position| position.get("k"))
        .and_then(Value::as_array)
    else {
        return false;
    };
    keys.iter().any(|key| {
        ["ti", "to"].iter().any(|name| {
            key.get(*name)
                .and_then(Value::as_array)
                .is_some_and(|values| values.iter().any(|v| v.as_f64().is_some_and(|v| v != 0.0)))
        })
    })
}

/// Add (16) and Hard Mix (17) have no vello blend mode: drawn as Normal (0).
fn neutralize_blend_modes(value: &mut Value, report: &mut LottieReport) {
    match value {
        Value::Object(object) => {
            match object.get("bm").and_then(Value::as_u64) {
                Some(16) => {
                    report.note("blend_mode_add");
                    object.insert("bm".into(), json!(0));
                }
                Some(17) => {
                    report.note("blend_mode_hard_mix");
                    object.insert("bm".into(), json!(0));
                }
                _ => {}
            }
            object
                .values_mut()
                .for_each(|child| neutralize_blend_modes(child, report));
        }
        Value::Array(items) => items
            .iter_mut()
            .for_each(|child| neutralize_blend_modes(child, report)),
        _ => {}
    }
}

/// An expression (`x`, JavaScript run by After Effects players) is not run: its property keeps its keyframes.
fn count_expressions(value: &Value, report: &mut LottieReport) {
    match value {
        Value::Object(object) => {
            if object.get("x").is_some_and(Value::is_string) {
                report.note("expression");
            }
            object
                .values()
                .for_each(|child| count_expressions(child, report));
        }
        Value::Array(items) => items
            .iter()
            .for_each(|child| count_expressions(child, report)),
        _ => {}
    }
}

fn shape_feature(ty: &str) -> String {
    match ty {
        "pb" => "shape_pucker_bloat".into(),
        "mm" => "shape_merge_paths".into(),
        "op" => "shape_offset_path".into(),
        "tw" => "shape_twist".into(),
        "rd" => "shape_rounded_corners".into(),
        "zz" => "shape_zig_zag".into(),
        "no" => "shape_no_style".into(),
        other => format!("shape_{other}"),
    }
}

fn prepare_shapes(
    items: &mut Vec<Value>,
    report: &mut LottieReport,
    copies: f64,
) -> Result<(), String> {
    items.retain(|item| {
        let ty = item.get("ty").and_then(Value::as_str).unwrap_or("?");
        let drawn = DRAWN_SHAPES.contains(&ty);
        if !drawn {
            report.note(&shape_feature(ty));
        }
        drawn
    });
    let mut copies = copies;
    for item in items.iter_mut() {
        match item.get("ty").and_then(Value::as_str).unwrap_or("") {
            "tr" => join_split_position(item)?,
            "st" | "gs"
                if item
                    .get("d")
                    .and_then(Value::as_array)
                    .is_some_and(|d| !d.is_empty()) =>
            {
                report.note("stroke_dash");
            }
            "rp" => {
                copies *= repeater_copies(item);
                if copies > MAX_REPEATED_COPIES {
                    return Err("lottie_repeater_copies_limit".into());
                }
            }
            _ => {}
        }
    }
    for item in items.iter_mut() {
        if let Some(children) = item.get_mut("it").and_then(Value::as_array_mut) {
            prepare_shapes(children, report, copies)?;
        }
    }
    Ok(())
}

/// The largest count of copies a repeater's `c` takes (static, or over its keyframes' values).
fn repeater_copies(item: &Value) -> f64 {
    let Some(count) = item.get("c") else {
        return 1.0;
    };
    let first = |value: &Value| {
        value
            .as_f64()
            .or_else(|| value.get(0).and_then(Value::as_f64))
    };
    let largest = match count.get("k") {
        Some(Value::Array(keys)) if truthy(count.get("a")) => keys
            .iter()
            .filter_map(|key| key.get("s").and_then(first))
            .fold(1.0_f64, f64::max),
        Some(value) => first(value).unwrap_or(1.0),
        None => 1.0,
    };
    largest.max(1.0)
}

/// A shape transform's split position (`p: { s: true, x, y }`) as the one position velato reads; an animated
/// split position cannot be joined without resampling its keyframes and is refused.
fn join_split_position(item: &mut Value) -> Result<(), String> {
    let Some(position) = item.get("p").filter(|position| truthy(position.get("s"))) else {
        return Ok(());
    };
    let still = |axis: &str| {
        position
            .get(axis)
            .filter(|value| !truthy(value.get("a")))
            .and_then(|value| value.get("k"))
            .and_then(|k| k.as_f64().or_else(|| k.get(0).and_then(Value::as_f64)))
    };
    let (Some(x), Some(y)) = (still("x"), still("y")) else {
        return Err("lottie_shape_split_position_animated".into());
    };
    item["p"] = json!({ "a": 0, "k": [x, y] });
    Ok(())
}
