//! A Lottie animation read once from its stored file (a bodymovin `.json` or a dotLottie `.lottie`),
//! inspected into a report kept on its atome, and timed: the renderer asks it the frame of a time.
//!
//! The file stays the description; nothing here keeps a rendered state. `load` prepares the JSON so the
//! vector engine (velato) can read every file without stopping on what it does not draw: the constructs it
//! cannot read are taken out and every one is named in the report (`unsupported`), never silently.
pub mod archive;
mod bodymovin4;
pub mod clock;
pub mod inspect;
mod prepare;

pub use clock::LottieClock;
pub use inspect::LottieReport;
pub use velato::{Composition, RenderSink, Renderer};

/// The largest file read (the stored original, compressed or not) and the largest animation JSON inflated
/// from a dotLottie.
pub const MAX_LOTTIE_BYTES: usize = 32 * 1024 * 1024;

/// A Lottie file ready to draw: its vector model, its clock and what was found in it.
#[derive(Debug)]
pub struct LoadedLottie {
    pub composition: Composition,
    pub clock: LottieClock,
    pub report: LottieReport,
}

/// Reads a Lottie file (JSON or dotLottie, told apart by its bytes), reports and prepares it, then builds
/// its vector model. Every refusal is an explicit `lottie_*` error.
pub fn load(bytes: &[u8]) -> Result<LoadedLottie, String> {
    let (container, json) = archive::animation_json(bytes)?;
    let mut value: serde_json::Value =
        serde_json::from_slice(&json).map_err(|error| format!("lottie_json_invalid:{error}"))?;
    let mut report = inspect::inspect(&value, container)?;
    prepare::prepare(&mut value, &mut report)?;
    let clock = LottieClock::from_report(&report)?;
    let composition =
        Composition::from_json(value).map_err(|error| format!("lottie_model_invalid:{error}"))?;
    Ok(LoadedLottie {
        composition,
        clock,
        report,
    })
}

/// The report alone (the import writes it on the atome): the same reading as `load`, model included, so a
/// file the renderer would refuse is refused at its import.
pub fn report(bytes: &[u8]) -> Result<LottieReport, String> {
    load(bytes).map(|loaded| loaded.report)
}
