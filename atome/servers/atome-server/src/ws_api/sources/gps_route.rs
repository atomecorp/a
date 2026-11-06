// A Valhalla itinerary made the one compact route the GPS keeps (server/gps_provider.js
// `normalizeValhallaRoute`, with atome/src/squirrel/gps/route_geometry.js and
// navigation_engine.js `validGpsPoint` / `validateNavigationRoute`, ported). Valhalla polyline6 is
// the canonical compact geometry; decoded points are projections. Every error is a GPS_ERRORS code.
use super::common::{length, number, plain};
use crate::vault_router::js;
use serde_json::{Value as JsonValue, json};

const INVALID: &str = "INVALID_PROVIDER_RESPONSE";
// A JavaScript TypeError (`null.shape`): no GPS code.
const UNAVAILABLE: &str = "PROVIDER_UNAVAILABLE";

/// `validGpsPoint(point)`: its latitude and longitude, both numbers within range.
pub(super) fn point(value: &JsonValue) -> Option<(f64, f64)> {
    let lat = value.get("lat")?.as_f64()?;
    let lon = value.get("lon")?.as_f64()?;
    valid(lat, lon).then_some((lat, lon))
}

pub(super) fn valid(lat: f64, lon: f64) -> bool {
    lat.is_finite() && lon.is_finite() && lat.abs() <= 90.0 && lon.abs() <= 180.0
}

/// `decodeGpsShape(shape)`.
fn decode(shape: Option<&JsonValue>) -> Result<Vec<(f64, f64)>, &'static str> {
    let Some(JsonValue::String(shape)) = shape else {
        return Err(INVALID);
    };
    let units: Vec<u16> = shape.encode_utf16().collect();
    if units.len() > 1_000_000 {
        return Err(INVALID);
    }
    let mut index = 0;
    let read = |index: &mut usize| -> Result<i64, &'static str> {
        let (mut value, mut shift) = (0_i32, 0_u32);
        loop {
            if *index >= units.len() || shift > 30 {
                return Err(INVALID);
            }
            let byte = i32::from(units[*index]) - 63;
            *index += 1;
            if !(0..=63).contains(&byte) {
                return Err(INVALID);
            }
            value |= (byte & 31).wrapping_shl(shift);
            shift += 5;
            if byte < 32 {
                break;
            }
        }
        Ok(i64::from(if value & 1 == 1 {
            !(value >> 1)
        } else {
            value >> 1
        }))
    };
    let (mut lat, mut lon, mut points) = (0_i64, 0_i64, Vec::new());
    while index < units.len() {
        lat += read(&mut index)?;
        lon += read(&mut index)?;
        points.push((lat as f64 / 1e6, lon as f64 / 1e6));
        if points.len() > 50_000 {
            return Err(INVALID);
        }
    }
    Ok(points)
}

// `Math.round(x)`: half up.
fn round(x: f64) -> f64 {
    let floor = x.floor();
    if x - floor >= 0.5 { floor + 1.0 } else { floor }
}

// `ToInt32(x)`, as a shift reads its operand.
fn int32(x: f64) -> i32 {
    if x.is_finite() {
        (x.trunc() % 4_294_967_296.0) as i64 as u32 as i32
    } else {
        0
    }
}

/// `encodeGpsShape(points)`.
fn encode(points: &[(f64, f64)]) -> String {
    let mut shape: Vec<u16> = Vec::new();
    let mut write = |delta: f64| {
        let doubled = int32(delta).wrapping_shl(1);
        let mut value = i64::from(if delta < 0.0 { !doubled } else { doubled });
        while value >= 32 {
            shape.push(((32 | (value & 31)) + 63) as u16);
            value = i64::from((value as u32) >> 5);
        }
        shape.push((value + 63).rem_euclid(65_536) as u16);
    };
    let (mut lat, mut lon) = (0.0, 0.0);
    for (point_lat, point_lon) in points {
        let (a, b) = (round(point_lat * 1e6), round(point_lon * 1e6));
        write(a - lat);
        write(b - lon);
        (lat, lon) = (a, b);
    }
    String::from_utf16_lossy(&shape)
}

// `offset + value`: a string, an array or an object concatenate (never a valid number), a missing
// value is NaN.
fn plus(total: f64, value: Option<&JsonValue>) -> f64 {
    match value {
        Some(JsonValue::Number(number)) => total + number.as_f64().unwrap_or(f64::NAN),
        Some(JsonValue::Null) => total,
        Some(JsonValue::Bool(flag)) => total + f64::from(u8::from(*flag)),
        _ => f64::NAN,
    }
}

// `leg.summary?.length`: a text's or a list's own length, an object's field.
fn summary_length(summary: Option<&JsonValue>) -> f64 {
    match summary {
        Some(JsonValue::Object(fields)) => number(fields.get("length")),
        Some(JsonValue::String(text)) => length(text) as f64,
        Some(JsonValue::Array(items)) => items.len() as f64,
        _ => f64::NAN,
    }
}

struct Maneuver {
    instruction: JsonValue,
    begin: f64,
    end: f64,
    distance_m: f64,
    duration_s: Option<JsonValue>,
}

fn whole(value: f64) -> bool {
    value.is_finite() && value.fract() == 0.0
}

fn measure(value: f64) -> bool {
    value.is_finite() && value >= 0.0
}

/// `normalizeValhallaRoute(payload, calculatedAt)`.
pub(super) fn normalize(
    payload: &JsonValue,
    calculated_at: &str,
) -> Result<JsonValue, &'static str> {
    let trip = payload.get("trip");
    let legs = trip
        .and_then(|trip| trip.get("legs"))
        .and_then(JsonValue::as_array)
        .filter(|legs| !legs.is_empty());
    let status = trip
        .and_then(|trip| trip.get("status"))
        .and_then(JsonValue::as_f64);
    let (Some(legs), Some(0.0)) = (legs, status) else {
        return Err(
            if payload.get("error_code").and_then(JsonValue::as_f64) == Some(442.0) {
                "NO_ROUTE"
            } else {
                INVALID
            },
        );
    };
    let (mut points, mut maneuvers, mut via_indices) = (Vec::new(), Vec::new(), Vec::new());
    let (mut distance_m, mut duration_s) = (0.0, 0.0);
    for (index, leg) in legs.iter().enumerate() {
        if leg.is_null() {
            return Err(UNAVAILABLE);
        }
        let decoded = decode(leg.get("shape"))?;
        let offset = points.len() as f64;
        points.extend(decoded);
        let Some(steps) = leg.get("maneuvers").and_then(JsonValue::as_array) else {
            return Err(INVALID);
        };
        for step in steps {
            if step.is_null() {
                return Err(UNAVAILABLE);
            }
            maneuvers.push(Maneuver {
                instruction: js::first(step, &["verbal_pre_transition_instruction", "instruction"])
                    .cloned()
                    .unwrap_or_else(|| json!("")),
                begin: plus(offset, step.get("begin_shape_index")),
                end: plus(offset, step.get("end_shape_index")),
                distance_m: number(step.get("length")) * 1000.0,
                duration_s: step.get("time").map(plain),
            });
        }
        let summary = leg.get("summary");
        distance_m += summary_length(summary) * 1000.0;
        duration_s = plus(duration_s, summary.and_then(|summary| summary.get("time")));
        if index + 1 < legs.len() {
            via_indices.push(points.len() - 1);
        }
    }
    let shape = encode(&points);
    let compact = json!({
        "maneuvers": maneuvers.iter().map(|step| {
            let mut fields = serde_json::Map::new();
            fields.insert("instruction".into(), plain(&step.instruction));
            fields.insert("begin".into(), js::number_json(step.begin));
            fields.insert("end".into(), js::number_json(step.end));
            fields.insert("distance_m".into(), js::number_json(step.distance_m));
            if let Some(duration) = &step.duration_s {
                fields.insert("duration_s".into(), duration.clone());
            }
            JsonValue::Object(fields)
        }).collect::<Vec<_>>(),
        "via_indices": via_indices,
        "distance_m": js::number_json(distance_m),
        "duration_s": js::number_json(duration_s),
        "provider": "valhalla",
        "calculated_at": calculated_at,
        "shape": shape,
    });
    // Leave room for both the new value and immutable preimage in the vault IPC envelope.
    if compact.to_string().len() > 600_000 {
        return Err(INVALID);
    }
    // `validateNavigationRoute(compact)`.
    let decoded = decode(compact.get("shape"))?;
    let count = decoded.len() as f64;
    let valid_route = decoded.len() >= 2
        && decoded.iter().all(|(lat, lon)| valid(*lat, *lon))
        && measure(distance_m)
        && measure(duration_s)
        && via_indices.iter().enumerate().all(|(at, index)| {
            (*index as f64) < count && (at == 0 || *index > via_indices[at - 1])
        })
        && maneuvers.iter().all(|step| {
            whole(step.begin)
                && whole(step.end)
                && step.begin >= 0.0
                && step.end >= step.begin
                && step.end < count
                && step.instruction.is_string()
                && measure(step.distance_m)
                && step
                    .duration_s
                    .as_ref()
                    .and_then(JsonValue::as_f64)
                    .is_some_and(measure)
        });
    if !valid_route {
        return Err(INVALID);
    }
    Ok(compact)
}
