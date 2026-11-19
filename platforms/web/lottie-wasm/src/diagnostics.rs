//! What drawing the Lottie atomes costs, for the probes and the hosts' diagnostics: the scene encoding per frame
//! (velato, CPU), vello's submission and the canvas hand-over (CPU), and the completion as the queue reports it
//! (GPU). One record for the module, read and reset by `read_lottie_diagnostics` / `reset_lottie_diagnostics`.
use std::cell::RefCell;

use serde::Serialize;

#[derive(Clone, Debug, Default, Serialize)]
pub struct LottieDiagnostics {
    /// Players whose atome plays.
    pub active: usize,
    /// Players alive, playing or paused (each freed when its atome leaves the scene).
    pub players: usize,
    pub frames_built: u64,
    pub frames_drawn: u64,
    /// The frame index (from `ip`) last encoded.
    pub last_frame: u64,
    pub scene_build_ms: f64,
    pub scene_build_max_ms: f64,
    /// vello's passes, the premultiplying blit and their submission.
    pub gpu_encode_ms: f64,
    pub gpu_encode_max_ms: f64,
    /// The canvas handed over as an `ImageBitmap`.
    pub transfer_ms: f64,
    pub transfer_max_ms: f64,
    /// Submission to completion of the last drawn frame.
    pub gpu_done_ms: f64,
    pub gpu_done_max_ms: f64,
    /// The module's WebGPU device and vello's pipelines made (`init_lottie_gpu`).
    pub gpu_init_ms: f64,
    pub last_error: Option<String>,
}

// The module runs on the page's one thread.
thread_local! {
    static DIAGNOSTICS: RefCell<LottieDiagnostics> = RefCell::new(LottieDiagnostics::default());
}

pub(crate) fn record(update: impl FnOnce(&mut LottieDiagnostics)) {
    DIAGNOSTICS.with(|cell| update(&mut cell.borrow_mut()));
}

pub fn read() -> LottieDiagnostics {
    DIAGNOSTICS.with(|cell| cell.borrow().clone())
}

/// Clears the maxima and counters (a probe's measuring window starts here); `active`, `players` and `gpu_init_ms` are
/// kept.
pub fn reset() -> LottieDiagnostics {
    let before = read();
    record(|diagnostics| {
        *diagnostics = LottieDiagnostics {
            active: diagnostics.active,
            players: diagnostics.players,
            gpu_init_ms: diagnostics.gpu_init_ms,
            ..LottieDiagnostics::default()
        };
    });
    before
}
