//! The web renderer's frame clock: how queued work becomes a rendered frame.
//!
//! The winit loop runs in `Reactive` mode (an idle heartbeat, not a display-rate
//! loop); a frame happens when something wakes it. Input-driven work wakes it
//! by requesting the window's next animation frame — input and decoder-paced
//! video frames alike — so each frame costs exactly one render.

use atome_bevy_renderer_core::AtomeRendererDiagnostics;
use bevy::platform::time::Instant;
use bevy::{
    prelude::*,
    window::WindowResized,
    winit::{EventLoopProxy, EventLoopProxyWrapper, UpdateMode, WinitSettings, WinitUserEvent},
};
use std::cell::{Cell, RefCell};
use std::time::Duration;

use super::WEB_DIAGNOSTICS;

thread_local! {
    pub(crate) static WEB_EVENT_LOOP_PROXY: RefCell<Option<EventLoopProxy<WinitUserEvent>>> = const { RefCell::new(None) };
    pub(crate) static WEB_WAKE_PENDING: RefCell<bool> = const { RefCell::new(false) };
    pub(crate) static WEB_FRAME_REQUESTED: RefCell<bool> = const { RefCell::new(false) };
    pub(crate) static WEB_WAKE_COALESCED: RefCell<bool> = const { RefCell::new(false) };
    pub(crate) static WEB_LAST_ACTIVITY: Cell<Option<Instant>> = const { Cell::new(None) };
}

/// Interval of the idle heartbeat, *not* a frame budget.
///
/// `UpdateMode::Reactive { wait }` runs a full `app.update()` — extract, render
/// and present included — every time `wait` elapses, whether or not anything
/// changed. A 16 ms wait therefore meant ~60 full redraws per second on a
/// completely static workspace, which is what made the device heat up with no
/// finger on the screen.
///
/// Frames are driven by wakes instead: every path that queues work
/// (`queue_web_ops`, `queue_web_ui_ops`, `request_web_redraw`,
/// `notify_web_video_frame`) calls `wake_web_renderer`, and the JS runtime
/// already batches those on `requestAnimationFrame`. Interaction therefore
/// still renders at display rate — and, being rAF-driven, in step with the
/// compositor rather than a free-running timer.
///
/// This wait is only a failsafe: it bounds how long a frame the browser never
/// delivered (hidden document) can leave the surface stale, without returning
/// to a display-rate idle loop.
pub(crate) const WEB_IDLE_HEARTBEAT_MS: u64 = 500;

/// Quiet time after the last wake before the heartbeat stretches.
///
/// The 500 ms failsafe still matters right after work stops: work that
/// completes over later updates without waking (a pipeline first needed by
/// the last frame, a GPU readback) lands on those ticks. Once nothing has
/// woken the renderer for this long, the workspace is settled.
pub(crate) const WEB_IDLE_SETTLE_MS: u64 = 3_000;

/// Heartbeat of a settled workspace: one full render every 10 s instead of two
/// per second (measured on iPhone 2026-10-09: 2 renders/s with no input).
/// Every source of change wakes the renderer itself, which renders at once
/// whatever this wait is.
pub(crate) const WEB_SETTLED_HEARTBEAT_MS: u64 = 10_000;

pub(crate) fn web_winit_settings() -> WinitSettings {
    WinitSettings {
        focused_mode: UpdateMode::reactive(Duration::from_millis(WEB_IDLE_HEARTBEAT_MS)),
        unfocused_mode: UpdateMode::reactive(Duration::from_millis(WEB_IDLE_HEARTBEAT_MS)),
    }
}

fn note_web_activity() {
    WEB_LAST_ACTIVITY.with(|cell| cell.set(Some(Instant::now())));
}

/// Chooses the idle wait at the end of each tick: the failsafe heartbeat while
/// work is recent, the settled heartbeat once the workspace has been quiet for
/// `WEB_IDLE_SETTLE_MS`. A playing animated PNG shortens the wait itself
/// (`animated_png::advance_animations`) and keeps that control until it ends.
pub(crate) fn adapt_web_idle_heartbeat(
    mut settings: ResMut<WinitSettings>,
    diagnostics: Option<Res<AtomeRendererDiagnostics>>,
    mut resized: MessageReader<WindowResized>,
) {
    if resized.read().count() > 0 {
        note_web_activity();
    }
    if diagnostics.is_some_and(|diagnostics| diagnostics.apng_active > 0) {
        return;
    }
    let now = Instant::now();
    let last_activity = WEB_LAST_ACTIVITY.with(|cell| {
        cell.get().unwrap_or_else(|| {
            cell.set(Some(now));
            now
        })
    });
    let wait = Duration::from_millis(
        if now.duration_since(last_activity) >= Duration::from_millis(WEB_IDLE_SETTLE_MS) {
            WEB_SETTLED_HEARTBEAT_MS
        } else {
            WEB_IDLE_HEARTBEAT_MS
        },
    );
    let with_wait = |mut mode: UpdateMode| {
        if let UpdateMode::Reactive { wait: ref mut current, .. } = mode {
            *current = wait;
        }
        mode
    };
    let (focused, unfocused) = (with_wait(settings.focused_mode), with_wait(settings.unfocused_mode));
    if focused != settings.focused_mode || unfocused != settings.unfocused_mode {
        settings.focused_mode = focused;
        settings.unfocused_mode = unfocused;
    }
}

pub(crate) fn remember_event_loop_proxy(proxy: Option<Res<EventLoopProxyWrapper>>) {
    let Some(proxy) = proxy else {
        return;
    };
    let wrapper: &EventLoopProxyWrapper = &proxy;
    let event_loop_proxy: &EventLoopProxy<WinitUserEvent> = wrapper;
    WEB_EVENT_LOOP_PROXY.with(|cell| {
        *cell.borrow_mut() = Some(event_loop_proxy.clone());
    });
    WEB_WAKE_PENDING.with(|cell| {
        if cell.replace(false) {
            let _ = event_loop_proxy.send_event(WinitUserEvent::WakeUp);
        }
    });
}

// Wakes are the renderer's frame clock.
//
// The loop no longer self-ticks at display rate (see `web_winit_settings`), so
// a wake is what turns queued work into a frame. It must therefore never be
// dropped for being "too soon" — a time-based throttle here would cap the
// interactive frame rate at its own period.
//
// A wake requests the window's next animation frame: winit delivers it as one
// `RedrawRequested`, whose update drains every queue and renders once, in step
// with the compositor. Wakes issued before that frame starts are already
// covered by it, so only the first one requests; `web_frame_probe_begin`
// re-arms the request when the tick starts.
//
// The request is a frame, never a winit `WakeUp` user event. A `WakeUp` sent
// while the loop is running — from inside a tick — is queued behind
// `AboutToWait` and only processed on the loop's next turn: with nothing else
// asking for a frame, that turn was the 500 ms heartbeat, and every wake in
// between was merged into the stranded one. Interaction then rendered at
// 2 frames/s (measured 2026-10-07: 70-150 wakes/s, 2 ticks/s). A frame
// request cannot be stranded: the browser always delivers it.
//
// Requesting only once per frame also keeps the request cheap and safe:
// winit cancels and re-requests its animation frame on every call, so
// repeated calls from a callback running ahead of it would push it back one
// frame each time.
//
// A wake issued from a JavaScript animation callback that runs *before* the
// renderer's own callback in the same frame is merged into that frame — but
// then the next frame's wake runs after the tick re-armed the request, during
// the animation-frame phase, and can only request the frame after it: one tick
// every other frame (measured: Mystic opening at 30 frames/s). A merged wake
// is therefore remembered, and the tick that covered it requests the next
// frame itself (`continue_merged_wake`), which pipelines one frame ahead while
// work keeps arriving and costs a single idle frame once it stops.
pub(crate) fn wake_web_renderer() {
    note_web_activity();
    WEB_DIAGNOSTICS.with(|cell| {
        cell.borrow_mut().wake_calls += 1;
    });
    if WEB_FRAME_REQUESTED.with(|cell| cell.replace(true)) {
        WEB_WAKE_COALESCED.with(|cell| {
            *cell.borrow_mut() = true;
        });
        return;
    }
    if request_web_frame() {
        return;
    }
    // Before the window exists there is no frame to request: hand the wake to
    // the event loop instead (the startup ticks drain the queues).
    WEB_FRAME_REQUESTED.with(|cell| {
        *cell.borrow_mut() = false;
    });
    WEB_EVENT_LOOP_PROXY.with(|cell| {
        if let Some(proxy) = cell.borrow().as_ref() {
            if proxy.send_event(WinitUserEvent::WakeUp).is_err() {
                WEB_DIAGNOSTICS.with(|diagnostics| {
                    diagnostics.borrow_mut().wake_send_failures += 1;
                });
            }
        } else {
            WEB_WAKE_PENDING.with(|pending| {
                *pending.borrow_mut() = true;
            });
        }
    });
}

/// Called at the end of a tick: if a wake was merged into it, request the next
/// frame now (see `wake_web_renderer`).
pub(crate) fn continue_merged_wake() {
    if !WEB_WAKE_COALESCED.with(|cell| cell.replace(false)) {
        return;
    }
    if WEB_FRAME_REQUESTED.with(|cell| cell.replace(true)) {
        return;
    }
    if !request_web_frame() {
        WEB_FRAME_REQUESTED.with(|cell| {
            *cell.borrow_mut() = false;
        });
    }
}

fn request_web_frame() -> bool {
    let requested = bevy::winit::WINIT_WINDOWS.with(|cell| {
        let Ok(windows) = cell.try_borrow() else {
            return false;
        };
        let mut requested = false;
        for window in windows.windows.values() {
            window.request_redraw();
            requested = true;
        }
        requested
    });
    if requested {
        WEB_DIAGNOSTICS.with(|cell| {
            cell.borrow_mut().frame_requests += 1;
        });
    }
    requested
}
