//! A document script's engine (eVe/domains/script/script_worker.js): one run per worker, `prepare` then `run`.
//! The script reaches nothing but its document's snapshot; the module's linear memory is capped (build.rs), so a
//! script that allocates past it traps and the worker reports SCRIPT_MEMORY, the page untouched.
mod doc;
mod engine;

use std::cell::RefCell;

pub use engine::{Engine, Failure};
use wasm_bindgen::prelude::wasm_bindgen;

thread_local! { static ENGINE: RefCell<Option<Engine>> = const { RefCell::new(None) }; }

/// Prepares the run: `request` the JSON `{ snapshot, limits }`, `runtime` Opal's runtime for Ruby. An empty string
/// when ready, else the failure's JSON.
#[wasm_bindgen]
pub fn prepare(request: &str, runtime: Option<String>) -> String {
    match Engine::prepare(request, runtime.as_deref()) {
        Ok(engine) => {
            ENGINE.with(|slot| *slot.borrow_mut() = Some(engine));
            String::new()
        }
        Err(failure) => failure.to_json(),
    }
}

/// Runs the prepared script's code: the outcome's JSON (engine.rs#Engine::run).
#[wasm_bindgen]
pub fn run(code: &str) -> String {
    ENGINE.with(|slot| match slot.borrow_mut().take() {
        Some(mut engine) => engine.run(code),
        None => Failure {
            error: "SCRIPT_NOT_PREPARED",
            detail: String::new(),
        }
        .to_json(),
    })
}
