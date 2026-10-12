use bevy::{
    prelude::*,
    render::error_handler::{RenderError, RenderErrorHandler, RenderErrorPolicy},
};
use std::cell::RefCell;

thread_local! {
    /// First wgpu error that stopped the renderer; survives diagnostics resets.
    static WEB_RENDER_ERROR: RefCell<String> = const { RefCell::new(String::new()) };
}

/// Bevy's default policy (quit on any wgpu error, since continuing may strobe),
/// keeping the error for JavaScript. Otherwise the page only sees a canvas that
/// stopped presenting while every readiness state still reads "ready".
pub(crate) fn handler() -> RenderErrorHandler {
    RenderErrorHandler(record_and_quit)
}

fn record_and_quit(error: &RenderError, main_world: &mut World, _: &mut World) -> RenderErrorPolicy {
    WEB_RENDER_ERROR.with(|cell| {
        let mut recorded = cell.borrow_mut();
        if recorded.is_empty() {
            *recorded = format!("{:?}: {}", error.ty, error.description);
        }
    });
    main_world.write_message(AppExit::error());
    RenderErrorPolicy::StopRendering
}

pub(crate) fn recorded_render_error() -> String {
    WEB_RENDER_ERROR.with(|cell| cell.borrow().clone())
}
