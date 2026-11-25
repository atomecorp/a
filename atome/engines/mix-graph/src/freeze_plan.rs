// A strip's stem plan (R-370): from the page's render plan of the whole timeline (the one a project's proxy renders,
// project_proxy_plan.js), the plan of what a stem of `strip_id` stands for — the strip alone, its chain cut after
// the steps the stem replaces, sent to the main output unmuted (mute and everything after stay live), its voices,
// its instrument and that instrument's notes — and its key: a hash of that plan written canonically (keys sorted),
// leaving out what does not change the sound (the voices' ids, a transport's play state), with the stem format.
// The same description gives the same key on every device and every run; any change gives another.

use crate::offline_render::RenderPlan;
use serde_json::Value;

// Bumped when a stem of the same description would sound different (the engine's rendering changed).
const STEM_FORMAT: &str = "stem-1";

/// What a stem of a strip is rendered from, and the key it is known by.
pub struct StemPlan {
    pub plan: RenderPlan,
    pub key: String,
}

fn invalid(reason: impl std::fmt::Display) -> String {
    format!("freeze_plan_invalid:{reason}")
}

fn text<'a>(value: &'a Value, key: &str) -> Option<&'a str> {
    value.get(key).and_then(Value::as_str)
}

/// The plan of `strip_id`'s stem standing for its first `steps` chain steps, and its key.
pub fn stem_plan(plan_json: &str, strip_id: &str, steps: usize) -> Result<StemPlan, String> {
    let mut plan: Value = serde_json::from_str(plan_json).map_err(invalid)?;
    let program = plan
        .get_mut("program")
        .and_then(Value::as_object_mut)
        .ok_or_else(|| invalid("program missing"))?;
    let mut strip = program
        .get("strips")
        .and_then(Value::as_array)
        .and_then(|strips| {
            strips
                .iter()
                .find(|strip| text(strip, "id") == Some(strip_id))
        })
        .cloned()
        .ok_or_else(|| format!("freeze_strip_missing:{strip_id}"))?;
    let fields = strip.as_object_mut().ok_or_else(|| invalid("strip"))?;
    if let Some(chain) = fields.get_mut("chain").and_then(Value::as_array_mut) {
        if chain.len() < steps {
            return Err(format!("freeze_stem_stale:{strip_id}"));
        }
        chain.truncate(steps);
    } else if steps > 0 {
        return Err(format!("freeze_stem_stale:{strip_id}"));
    }
    fields.insert("output".into(), serde_json::json!({ "kind": "main" }));
    fields.insert("output_enabled".into(), Value::Bool(true));
    fields.insert("muted".into(), Value::Bool(false));
    let transport = text(&strip, "transport").map(str::to_string);
    let instrument = strip
        .get("input")
        .filter(|input| text(input, "kind") == Some("instrument"))
        .and_then(|input| text(input, "instrument_id"))
        .map(str::to_string);
    program.insert("strips".into(), Value::Array(vec![strip]));
    if let Some(transports) = program.get_mut("transports").and_then(Value::as_array_mut) {
        transports.retain(|spec| transport.is_some() && text(spec, "id") == transport.as_deref());
    }
    let keep = |list: &mut Value, keeps: &dyn Fn(&Value) -> bool| {
        if let Some(items) = list.as_array_mut() {
            items.retain(|item| keeps(item));
        }
    };
    if let Some(voices) = plan.get_mut("voices") {
        keep(voices, &|voice| text(voice, "stripId") == Some(strip_id));
    }
    let heard =
        |item: &Value| instrument.is_some() && text(item, "instrument_id") == instrument.as_deref();
    let heard_spec =
        |item: &Value| instrument.is_some() && text(item, "id") == instrument.as_deref();
    if let Some(events) = plan.get_mut("events") {
        keep(events, &heard);
    }
    if let Some(instruments) = plan.get_mut("instruments") {
        keep(instruments, &heard_spec);
    }
    let key = stem_key(&plan);
    let plan = serde_json::from_value(plan).map_err(invalid)?;
    Ok(StemPlan { plan, key })
}

// What changes from one compile or one playback to the next without changing the sound.
fn is_incidental(path_parent: &str, key: &str) -> bool {
    matches!(
        (path_parent, key),
        ("voices", "voiceId") | ("transports", "epoch" | "playing" | "seconds")
    )
}

fn canonical(value: &Value, parent: &str, out: &mut String) {
    match value {
        Value::Object(map) => {
            let mut keys: Vec<&String> = map
                .keys()
                .filter(|key| !is_incidental(parent, key))
                .collect();
            keys.sort();
            out.push('{');
            for (index, key) in keys.iter().enumerate() {
                if index > 0 {
                    out.push(',');
                }
                out.push_str(&Value::String((*key).clone()).to_string());
                out.push(':');
                canonical(&map[*key], key, out);
            }
            out.push('}');
        }
        Value::Array(items) => {
            out.push('[');
            for (index, item) in items.iter().enumerate() {
                if index > 0 {
                    out.push(',');
                }
                // An array's items keep the array's name: a voice is under "voices".
                canonical(item, parent, out);
            }
            out.push(']');
        }
        other => out.push_str(&other.to_string()),
    }
}

// FNV-1a over 128 bits: stable on every platform and every run (std's hashers promise neither).
fn fnv128(bytes: &[u8]) -> u128 {
    const OFFSET: u128 = 0x6c62272e07bb014262b821756295c58d;
    const PRIME: u128 = 0x0000000001000000000000000000013B;
    bytes.iter().fold(OFFSET, |hash, byte| {
        (hash ^ u128::from(*byte)).wrapping_mul(PRIME)
    })
}

/// The key of a stem plan: its canonical text and the stem format, hashed.
pub fn stem_key(plan: &Value) -> String {
    let mut text = String::from(STEM_FORMAT);
    canonical(plan, "", &mut text);
    format!("{:032x}", fnv128(text.as_bytes()))
}

#[cfg(test)]
#[path = "freeze_plan_tests.rs"]
mod tests;
