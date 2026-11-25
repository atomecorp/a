// The native engine's track freeze (R-370): stems rendered on a low-priority thread while the engine has room, kept
// in memory within a budget, and heard in place of a strip's frozen part once the page asks (`freeze_apply`). The
// bookkeeping is mix-graph's (`freeze_store::Renders`), the Web engine's too; the page decides which strip to freeze
// and when (eVe domains/audio_freeze). A stem is a derivative: nothing here is ever stored for a person.
//
// Commands (args as JSON, results as JSON):
//   freeze_render { plan, strip_id }  a stem of the strip's freezable part is rendered (or already is)
//   freeze_apply  { strip_id, key }   the stem rendered under `key` is heard in place of the strip
//   freeze_thaw   { strip_id }        the strip plays live again, its stem fading out
//   freeze_status                     the load, its peak, each strip's share, the frozen strips, the renders
//   freeze_reset_peak                 a run starts: its peak is measured anew
//   freeze_retain { keys }            every stem and render but those named is forgotten

use super::playback::ENGINE;
use atome_mix_graph::freeze_store::{
    RENDER_LOAD_CEILING, RENDER_SLICE_FRAMES, Renders, offer_strip, status,
};
use atome_mix_graph::load_meter::{self, LoadMeter};
use serde_json::{Value, json};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, MutexGuard, OnceLock};
use std::time::{Duration, Instant};

// How long a render waits for room before looking at the load again.
const RENDER_WAIT: Duration = Duration::from_millis(34);

static RENDERS: OnceLock<Mutex<Renders>> = OnceLock::new();
static WORKER: AtomicBool = AtomicBool::new(false);
static CLOCK_START: OnceLock<Instant> = OnceLock::new();

fn renders() -> MutexGuard<'static, Renders> {
    RENDERS
        .get_or_init(Mutex::default)
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

fn clock_ns() -> u64 {
    CLOCK_START.get_or_init(Instant::now).elapsed().as_nanos() as u64
}

/// The engine starts: the graph's strip costs are timed on std's clock.
pub fn install_clock() {
    CLOCK_START.get_or_init(Instant::now);
    load_meter::set_clock(clock_ns);
}

fn text<'a>(args: &'a Value, field: &str) -> Result<&'a str, String> {
    args.get(field)
        .and_then(Value::as_str)
        .ok_or_else(|| format!("freeze_args_invalid:{field}"))
}

fn with_graph<T>(
    action: impl FnOnce(&mut atome_mix_graph::MixGraph) -> Result<T, String>,
) -> Result<T, String> {
    let mut guard = ENGINE
        .write()
        .map_err(|error| format!("Lock error: {error}"))?;
    let engine = guard.as_mut().ok_or("Audio engine not initialized")?;
    action(engine.mix.graph_mut())
}

// The worker renders the renders under way a slice at a time, waiting while the engine's load is high.
fn work() {
    loop {
        let Some((key, mut job)) = renders().take_next() else {
            WORKER.store(false, Ordering::Release);
            // A render offered while the worker was finishing found it running: look once more.
            if renders().has_pending() && !WORKER.swap(true, Ordering::AcqRel) {
                continue;
            }
            return;
        };
        if LoadMeter::global().read().load >= RENDER_LOAD_CEILING {
            renders().put_back(&key, job, false);
            std::thread::sleep(RENDER_WAIT);
            continue;
        }
        match job.advance(RENDER_SLICE_FRAMES) {
            Ok(whole) => renders().put_back(&key, job, whole),
            Err(error) => renders().fail(&key, error),
        }
    }
}

fn wake_worker() -> Result<(), String> {
    if WORKER.swap(true, Ordering::AcqRel) {
        return Ok(());
    }
    std::thread::Builder::new()
        .name("atome-freeze-render".into())
        .spawn(work)
        .map(|_| ())
        .map_err(|error| {
            WORKER.store(false, Ordering::Release);
            format!("freeze_worker_failed:{error}")
        })
}

fn render(args: &Value) -> Result<Value, String> {
    let strip_id = text(args, "strip_id")?;
    let plan = args.get("plan").ok_or("freeze_args_invalid:plan")?;
    let steps = with_graph(|graph| graph.freezable_steps(strip_id))?;
    // store_for reads the engine: no lock of it is held here.
    let offered = offer_strip(
        &mut renders(),
        steps,
        &plan.to_string(),
        strip_id,
        crate::render_proxy::store_for,
    )?;
    if renders().has_pending() {
        wake_worker()?;
    }
    Ok(offered)
}

fn apply(args: &Value) -> Result<Value, String> {
    let strip_id = text(args, "strip_id")?;
    let stem = renders().stem(text(args, "key")?)?;
    with_graph(|graph| graph.freeze_strip(strip_id, stem))?;
    Ok(json!({ "success": true }))
}

fn thaw(args: &Value) -> Result<Value, String> {
    let strip_id = text(args, "strip_id")?;
    with_graph(|graph| graph.thaw_strip(strip_id))?;
    Ok(json!({ "success": true }))
}

fn retain(args: &Value) -> Result<Value, String> {
    let keys: Vec<String> = args
        .get("keys")
        .and_then(Value::as_array)
        .ok_or("freeze_args_invalid:keys")?
        .iter()
        .filter_map(|key| key.as_str().map(str::to_string))
        .collect();
    renders().retain(&keys);
    Ok(json!({ "success": true }))
}

/// A freeze command by name (`freeze_render`, `freeze_apply`, …).
pub fn command(name: &str, args: &Value) -> Result<Value, String> {
    match name {
        "freeze_render" => render(args),
        "freeze_apply" => apply(args),
        "freeze_thaw" => thaw(args),
        "freeze_status" => with_graph(|graph| Ok(status(graph, &renders()))),
        "freeze_reset_peak" => {
            LoadMeter::global().reset_peak();
            Ok(json!({ "success": true }))
        }
        "freeze_retain" => retain(args),
        other => Err(format!("freeze_command_unknown:{other}")),
    }
}
