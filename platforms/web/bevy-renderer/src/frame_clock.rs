//! The web renderer's frame clock: how queued work becomes a rendered frame.
//!
//! The winit loop runs in `Reactive` mode (an idle heartbeat, not a display-rate
//! loop); a frame happens when something wakes it. Input-driven work wakes it
//! immediately through the event-loop proxy, decoder-paced video frames request
//! the next animation frame. Both must cost exactly the frames they need.

use bevy::{
    prelude::*,
    winit::{EventLoopProxy, EventLoopProxyWrapper, UpdateMode, WinitSettings, WinitUserEvent},
};
use std::cell::RefCell;
use std::time::Duration;

use super::WEB_DIAGNOSTICS;

thread_local! {
    pub(crate) static WEB_EVENT_LOOP_PROXY: RefCell<Option<EventLoopProxy<WinitUserEvent>>> = const { RefCell::new(None) };
    pub(crate) static WEB_WAKE_PENDING: RefCell<bool> = const { RefCell::new(false) };
    pub(crate) static WEB_WAKE_INFLIGHT: RefCell<bool> = const { RefCell::new(false) };
    pub(crate) static WEB_WAKE_COALESCED: RefCell<bool> = const { RefCell::new(false) };
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
/// (`queue_web_ops`, `queue_web_ui_ops`, `request_web_redraw`) calls
/// `wake_web_renderer`, video frames call `request_frame_paced_web_redraw`, and the JS runtime
/// already batches those on `requestAnimationFrame`. Interaction therefore
/// still renders at display rate — and, being rAF-driven, in step with the
/// compositor rather than a free-running timer.
///
/// This wait is only a failsafe: it bounds how long a dropped wake can leave
/// the surface stale and clears a stuck in-flight wake flag. WKWebView can
/// occasionally defer the async Winit user-event waker after a cold reload, so
/// keep the bound below the one-second interaction budget without returning to
/// a display-rate idle loop.
pub(crate) const WEB_IDLE_HEARTBEAT_MS: u64 = 500;

pub(crate) fn web_winit_settings() -> WinitSettings {
    WinitSettings {
        focused_mode: UpdateMode::reactive(Duration::from_millis(WEB_IDLE_HEARTBEAT_MS)),
        unfocused_mode: UpdateMode::reactive(Duration::from_millis(WEB_IDLE_HEARTBEAT_MS)),
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
// Wakes issued while a tick is already scheduled are merged into it rather than
// sent twice — the pending queues are drained wholesale, so a second event
// would only re-render an identical frame.
//
// Merging must not *drop* the wake, though. Delivering a `WakeUp` costs an
// extra event-loop turn (Bevy re-arms `window.request_redraw()` after each
// update), so a wake issued once per animation frame only lands every other
// frame: measured 60 wakes/s producing 30 ticks/s, against a loop that reaches
// 60 ticks/s when fed faster. A merged wake is therefore remembered and
// re-emitted once the tick completes, which pipelines one frame behind and
// restores full display-rate interaction.
//
// A wake can only ever be held until the next tick of any kind, and the
// heartbeat guarantees one — so a lost `WakeUp` cannot wedge the clock.
pub(crate) fn wake_web_renderer() {
    WEB_DIAGNOSTICS.with(|cell| {
        cell.borrow_mut().wake_calls += 1;
    });
    let already_scheduled = WEB_WAKE_INFLIGHT.with(|cell| cell.replace(true));
    if already_scheduled {
        WEB_WAKE_COALESCED.with(|cell| {
            *cell.borrow_mut() = true;
        });
        return;
    }
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

// Video frames are paced by their decoder, not by input: they need the next
// display frame, never an immediate tick. A `WakeUp` costs two full renders —
// the update it triggers, then the one bevy_winit forces by requesting a window
// redraw after every `WakeUp` — so a 12.5 fps video wallpaper rendered 25-37
// frames per second. Requesting the window redraw directly schedules a single
// `RedrawRequested` on the next animation frame, whose update drains the frame:
// one render per decoded frame, and none while the document is hidden.
//
// Before the window exists there is nothing to redraw yet; the startup wake
// queue (`wake_web_renderer`) already holds the request until it does.
pub(crate) fn request_frame_paced_web_redraw() {
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
            cell.borrow_mut().paced_redraws += 1;
        });
        return;
    }
    wake_web_renderer();
}
