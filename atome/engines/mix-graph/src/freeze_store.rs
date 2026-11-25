// The stems an engine holds (R-370), and their renders: shared by the native engine (audio-engine/src/freeze.rs)
// and the Web engine (audio-wasm/src/freeze.rs). A render is a job advanced a slice at a time (`StemJob::advance`),
// so the engine renders only while it has room — natively on a low-priority thread that waits while the load is
// high, on the Web between two pumps of the page — and is dropped at any slice without a trace. Stems live in memory
// only, within a budget: a stem is a derivative the engine can render again, never something kept for a person.

use crate::MixGraph;
use crate::freeze::{BYTES_PER_FRAME, Stem};
use crate::freeze_plan::stem_plan;
use crate::load_meter::LoadMeter;
use crate::offline_render::{ClipStore, OfflineRenderer, RenderPlan};
use kira::Frame;
use serde_json::{Value, json};
use std::collections::HashMap;
use std::sync::Arc;

/// A render goes on only while the engine's load is under this (rule 19: 39 %).
pub const RENDER_LOAD_CEILING: f32 = 0.39;
/// The frames rendered between two looks at the load (0.1 s at 48 kHz).
pub const RENDER_SLICE_FRAMES: usize = 4_800;

/// What the stems may hold by default: 377 MiB (rule 19), about 18 minutes of stereo at 48 kHz.
pub const DEFAULT_BUDGET_BYTES: usize = 377 * 1024 * 1024;

/// A stem being rendered.
pub struct StemJob {
    renderer: OfflineRenderer,
    stem: Stem,
    total: u64,
    buffer: Vec<Frame>,
}

impl StemJob {
    /// The job of `strip_id`'s stem standing for its first `steps` steps, from the page's whole render plan, with
    /// the clips and samples `store_for` gathers for the stem's plan; and its key.
    pub fn new(
        plan_json: &str,
        strip_id: &str,
        steps: usize,
        store_for: impl FnOnce(&RenderPlan) -> Result<ClipStore, String>,
    ) -> Result<Self, String> {
        let stem = stem_plan(plan_json, strip_id, steps)?;
        let store = store_for(&stem.plan)?;
        let renderer = OfflineRenderer::new(&stem.plan, &store)?;
        let total = stem.plan.duration_frames;
        Ok(Self {
            renderer,
            stem: Stem::with_capacity(&stem.key, stem.plan.rate, steps, total as usize),
            total,
            buffer: Vec::new(),
        })
    }

    pub fn key(&self) -> &str {
        &self.stem.key
    }

    /// What the finished stem will hold.
    pub fn bytes(&self) -> usize {
        self.total as usize * BYTES_PER_FRAME
    }

    /// Renders up to `frames` more frames: true once the stem is whole (`finish` then gives it).
    pub fn advance(&mut self, frames: usize) -> Result<bool, String> {
        self.buffer.resize(frames.max(1), Frame::ZERO);
        let rendered = self.renderer.render_into(&mut self.buffer)?;
        self.stem.push(&self.buffer[..rendered]);
        Ok(rendered == 0 || self.stem.frames() as u64 >= self.total)
    }

    /// How far it is, 0 to 1.
    pub fn progress(&self) -> f64 {
        self.stem.frames() as f64 / self.total.max(1) as f64
    }

    pub fn finish(self) -> Stem {
        self.stem
    }
}

/// The stems rendered, by key, within a budget.
pub struct StemStore {
    stems: HashMap<String, Arc<Stem>>,
    budget: usize,
}

impl Default for StemStore {
    fn default() -> Self {
        Self {
            stems: HashMap::new(),
            budget: DEFAULT_BUDGET_BYTES,
        }
    }
}

impl StemStore {
    pub fn get(&self, key: &str) -> Option<Arc<Stem>> {
        self.stems.get(key).cloned()
    }

    pub fn used(&self) -> usize {
        self.stems.values().map(|stem| stem.bytes()).sum()
    }

    pub fn budget(&self) -> usize {
        self.budget
    }

    pub fn set_budget(&mut self, bytes: usize) {
        self.budget = bytes;
    }

    /// Whether a stem of `bytes` more fits.
    pub fn has_room(&self, bytes: usize) -> Result<(), String> {
        match self.used() + bytes <= self.budget {
            true => Ok(()),
            false => Err("freeze_budget_full".into()),
        }
    }

    pub fn keep(&mut self, stem: Stem) -> Result<Arc<Stem>, String> {
        self.has_room(stem.bytes())?;
        let stem = Arc::new(stem);
        self.stems.insert(stem.key.to_string(), stem.clone());
        Ok(stem)
    }

    /// Forgets every stem but those `keys` name (the stems of the project open, still valid).
    pub fn retain(&mut self, keys: &[String]) {
        self.stems
            .retain(|key, _| keys.iter().any(|kept| kept == key));
    }
}

/// A render's state, as the page reads it.
#[derive(Clone, Debug, PartialEq)]
pub struct RenderReport {
    pub strip_id: String,
    pub key: String,
    pub progress: f64,
    pub ready: bool,
    pub error: Option<String>,
}

struct Render {
    report: RenderReport,
    // None once finished or failed, or while the engine renders it.
    job: Option<StemJob>,
}

/// The stems an engine holds and the renders it has under way: one per engine, the native engine's behind a lock
/// on its render thread, the Web engine's on the page's thread.
#[derive(Default)]
pub struct Renders {
    store: StemStore,
    renders: Vec<Render>,
}

impl Renders {
    fn render_mut(&mut self, key: &str) -> Option<&mut Render> {
        self.renders
            .iter_mut()
            .find(|render| render.report.key == key)
    }

    /// A stem asked for: rendered later, unless it already is or is under way; its key and whether it is ready.
    pub fn offer(&mut self, strip_id: &str, job: StemJob) -> Result<(String, bool), String> {
        let key = job.key().to_string();
        if self.store.get(&key).is_some() {
            return Ok((key, true));
        }
        if self
            .render_mut(&key)
            .is_some_and(|render| render.report.error.is_none())
        {
            return Ok((key, false));
        }
        self.store.has_room(job.bytes())?;
        self.renders.retain(|render| render.report.key != key);
        self.renders.push(Render {
            report: RenderReport {
                strip_id: strip_id.to_string(),
                key: key.clone(),
                progress: 0.0,
                ready: false,
                error: None,
            },
            job: Some(job),
        });
        Ok((key, false))
    }

    pub fn has_pending(&self) -> bool {
        self.renders.iter().any(|render| render.job.is_some())
    }

    /// The first render under way, taken out to be advanced without holding the engine's renders.
    pub fn take_next(&mut self) -> Option<(String, StemJob)> {
        self.renders.iter_mut().find_map(|render| {
            render
                .job
                .take()
                .map(|job| (render.report.key.clone(), job))
        })
    }

    /// A render advanced: kept for later, or, finished, its stem kept; dropped if forgotten meanwhile.
    pub fn put_back(&mut self, key: &str, job: StemJob, whole: bool) {
        if self.render_mut(key).is_none() {
            return;
        }
        if !whole {
            if let Some(render) = self.render_mut(key) {
                render.report.progress = job.progress();
                render.job = Some(job);
            }
            return;
        }
        let kept = self.store.keep(job.finish()).map(|_| ());
        if let Some(render) = self.render_mut(key) {
            render.report.progress = 1.0;
            render.report.ready = kept.is_ok();
            render.report.error = kept.err();
        }
    }

    pub fn fail(&mut self, key: &str, error: String) {
        if let Some(render) = self.render_mut(key) {
            render.report.error = Some(error);
        }
    }

    pub fn stem(&self, key: &str) -> Result<Arc<Stem>, String> {
        self.store
            .get(key)
            .ok_or_else(|| format!("freeze_stem_missing:{key}"))
    }

    pub fn reports(&self) -> Vec<RenderReport> {
        self.renders
            .iter()
            .map(|render| render.report.clone())
            .collect()
    }

    pub fn store(&self) -> &StemStore {
        &self.store
    }

    /// Forgets every stem and render but those `keys` name.
    pub fn retain(&mut self, keys: &[String]) {
        self.store.retain(keys);
        self.renders
            .retain(|render| keys.contains(&render.report.key));
    }
}

/// `{ plan, strip_id }` asked of an engine: the stem of the strip's first `steps` steps (`MixGraph::freezable_steps`
/// on the graph the engine plays, read before, as `store_for` reads the engine itself), offered to `renders`; its
/// key, whether it is ready and the steps it stands for.
pub fn offer_strip(
    renders: &mut Renders,
    steps: usize,
    plan_json: &str,
    strip_id: &str,
    store_for: impl FnOnce(&RenderPlan) -> Result<ClipStore, String>,
) -> Result<Value, String> {
    let job = StemJob::new(plan_json, strip_id, steps, store_for)?;
    let (key, ready) = renders.offer(strip_id, job)?;
    Ok(json!({ "success": true, "key": key, "ready": ready, "steps": steps }))
}

/// What an engine says of its load and its freezes (`freeze_status`).
pub fn status(graph: &MixGraph, renders: &Renders) -> Value {
    let reading = LoadMeter::global().read();
    json!({
        "success": true,
        "load": reading.load,
        "peak": reading.peak,
        "loads": graph.strip_loads().iter().map(|load| json!({ "strip_id": load.strip_id, "load": load.load })).collect::<Vec<_>>(),
        "frozen": graph.frozen_strips().iter().map(|strip| json!({ "strip_id": strip.strip_id, "key": strip.key, "mix": strip.mix })).collect::<Vec<_>>(),
        "renders": renders.reports().iter().map(|render| json!({
            "strip_id": render.strip_id,
            "key": render.key,
            "progress": render.progress,
            "ready": render.ready,
            "error": render.error,
        })).collect::<Vec<_>>(),
        "used_bytes": renders.store().used(),
        "budget_bytes": renders.store().budget(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_store_keeps_stems_within_its_budget() {
        let mut store = StemStore::default();
        store.set_budget(BYTES_PER_FRAME * 10);
        let stem = |key: &str, frames: usize| Stem::new(key, 48_000, 1, &vec![Frame::ZERO; frames]);
        store.keep(stem("a", 6)).expect("fits");
        assert!(matches!(store.keep(stem("b", 6)), Err(error) if error == "freeze_budget_full"));
        store.keep(stem("c", 4)).expect("fits");
        assert_eq!(store.used(), BYTES_PER_FRAME * 10);
        store.retain(&["c".to_string()]);
        assert!(store.get("a").is_none() && store.get("c").is_some());
    }
}
