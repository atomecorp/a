//! The screen under a window, in CSS px per millimetre at zoom 1 (R-280): published with the viewport (`cssPxPerMm`) so
//! eVe zooms the page and lays every tool, tile and text at the iPhone's physical size on every monitor
//! (`eVe/elements/system_ui_physical_scale.js`), which then asks the zoom back through `viewport_zoom_set`. The screen is
//! the one under the window's centre; its millimetres come from the system (its EDID): CoreGraphics on macOS, the raw
//! DPI on Windows, GDK's monitor on Linux and the BSDs (Android: the Kotlin host, `MainActivity`, publishes its own).
#![allow(
    unsafe_code,
    reason = "C ABI with the system's display APIs (CoreGraphics, user32/shcore, GDK)"
)]
use tauri::{Runtime, WebviewWindow};

// A screen whose EDID gives no size (0 mm) or a false one (a projector, some TVs) tells nothing: the page keeps its px.
const PLAUSIBLE_CSS_PX_PER_MM: std::ops::RangeInclusive<f64> = 2.0..=12.0;

/// The density of the screen under `webview`'s centre, or `None` where its system tells none.
pub fn css_px_per_mm<R: Runtime>(webview: &WebviewWindow<R>) -> Option<f64> {
    let scale = webview.scale_factor().ok()?;
    let position = webview.outer_position().ok()?;
    let size = webview.outer_size().ok()?;
    let centre = (
        f64::from(position.x) + f64::from(size.width) / 2.0,
        f64::from(position.y) + f64::from(size.height) / 2.0,
    );
    platform::css_px_per_mm(centre, scale)
        .filter(|density| PLAUSIBLE_CSS_PX_PER_MM.contains(density))
}

/// The page's zoom, asked by `system_ui_physical_scale.js`: a CSS px laid at the iPhone's physical size.
#[tauri::command]
pub fn viewport_zoom_set<R: Runtime>(webview: WebviewWindow<R>, zoom: f64) -> Result<(), String> {
    if !(zoom.is_finite() && (0.25..=4.0).contains(&zoom)) {
        return Err("viewport_zoom_invalid".into());
    }
    webview.set_zoom(zoom).map_err(|error| error.to_string())
}

// `centre`: physical px in the desktop's coordinates, `scale`: the window's px per point.
#[cfg(target_os = "macos")]
mod platform {
    #[repr(C)]
    #[derive(Clone, Copy)]
    struct CgPoint {
        x: f64,
        y: f64,
    }
    #[repr(C)]
    #[derive(Clone, Copy)]
    struct CgSize {
        width: f64,
        height: f64,
    }
    #[repr(C)]
    #[derive(Clone, Copy)]
    struct CgRect {
        origin: CgPoint,
        size: CgSize,
    }
    #[link(name = "CoreGraphics", kind = "framework")]
    unsafe extern "C" {
        fn CGGetDisplaysWithPoint(
            point: CgPoint,
            max: u32,
            displays: *mut u32,
            matching: *mut u32,
        ) -> i32;
        fn CGDisplayBounds(display: u32) -> CgRect;
        fn CGDisplayScreenSize(display: u32) -> CgSize;
    }

    // tao's physical position is the window's points (top-left origin of the main display) times its scale: the
    // global display space CoreGraphics reads, once divided back. A CSS px at zoom 1 is a point.
    pub(super) fn css_px_per_mm((x, y): (f64, f64), scale: f64) -> Option<f64> {
        let point = CgPoint {
            x: x / scale,
            y: y / scale,
        };
        let (mut display, mut matching) = (0_u32, 0_u32);
        // SAFETY: one display id written into `display`, its count into `matching`.
        let status =
            unsafe { CGGetDisplaysWithPoint(point, 1, &raw mut display, &raw mut matching) };
        if status != 0 || matching == 0 {
            return None;
        }
        // SAFETY: plain value queries on a display id CoreGraphics just returned.
        let (bounds, millimetres) =
            unsafe { (CGDisplayBounds(display), CGDisplayScreenSize(display)) };
        (millimetres.width > 0.0).then(|| bounds.size.width / millimetres.width)
    }
}

#[cfg(target_os = "windows")]
mod platform {
    const MM_PER_INCH: f64 = 25.4;

    #[repr(C)]
    struct Point {
        x: i32,
        y: i32,
    }
    const MONITOR_DEFAULTTONEAREST: u32 = 2;
    const MDT_RAW_DPI: i32 = 2;
    #[link(name = "user32")]
    unsafe extern "system" {
        fn MonitorFromPoint(point: Point, flags: u32) -> isize;
    }
    #[link(name = "shcore")]
    unsafe extern "system" {
        fn GetDpiForMonitor(monitor: isize, kind: i32, dpi_x: *mut u32, dpi_y: *mut u32) -> i32;
    }

    // The raw DPI is the panel's own dots per inch (its EDID); a CSS px at zoom 1 is `scale` of them.
    pub(super) fn css_px_per_mm((x, y): (f64, f64), scale: f64) -> Option<f64> {
        #[allow(
            clippy::cast_possible_truncation,
            reason = "a desktop coordinate in px"
        )]
        let point = Point {
            x: x.round() as i32,
            y: y.round() as i32,
        };
        // SAFETY: a value query; the handle is only passed back to shcore.
        let monitor = unsafe { MonitorFromPoint(point, MONITOR_DEFAULTTONEAREST) };
        if monitor == 0 {
            return None;
        }
        let (mut dpi_x, mut dpi_y) = (0_u32, 0_u32);
        // SAFETY: two integers written into `dpi_x` and `dpi_y`.
        let status =
            unsafe { GetDpiForMonitor(monitor, MDT_RAW_DPI, &raw mut dpi_x, &raw mut dpi_y) };
        (status == 0 && dpi_x > 0).then(|| f64::from(dpi_x) / scale / MM_PER_INCH)
    }
}

#[cfg(any(
    target_os = "linux",
    target_os = "dragonfly",
    target_os = "freebsd",
    target_os = "netbsd",
    target_os = "openbsd"
))]
mod platform {
    use std::ffi::c_void;

    #[repr(C)]
    struct GdkRectangle {
        x: i32,
        y: i32,
        width: i32,
        height: i32,
    }
    #[link(name = "gdk-3")]
    unsafe extern "C" {
        fn gdk_display_get_default() -> *mut c_void;
        fn gdk_display_get_monitor_at_point(display: *mut c_void, x: i32, y: i32) -> *mut c_void;
        fn gdk_monitor_get_width_mm(monitor: *mut c_void) -> i32;
        fn gdk_monitor_get_geometry(monitor: *mut c_void, geometry: *mut GdkRectangle);
    }

    // GDK lays monitors in application px (a CSS px at zoom 1): the window's physical centre divided by its scale.
    // Called on the main thread, as every GTK call (window events, page loads).
    pub(super) fn css_px_per_mm((x, y): (f64, f64), scale: f64) -> Option<f64> {
        // SAFETY: the default display of the running GTK application, or null.
        let display = unsafe { gdk_display_get_default() };
        if display.is_null() {
            return None;
        }
        #[allow(
            clippy::cast_possible_truncation,
            reason = "a desktop coordinate in application px"
        )]
        let (x, y) = ((x / scale).round() as i32, (y / scale).round() as i32);
        // SAFETY: the display is live; GDK returns the nearest monitor, owned by it.
        let monitor = unsafe { gdk_display_get_monitor_at_point(display, x, y) };
        if monitor.is_null() {
            return None;
        }
        let mut geometry = GdkRectangle {
            x: 0,
            y: 0,
            width: 0,
            height: 0,
        };
        // SAFETY: plain queries on a live monitor; the geometry is written into `geometry`.
        let millimetres = unsafe {
            gdk_monitor_get_geometry(monitor, &raw mut geometry);
            gdk_monitor_get_width_mm(monitor)
        };
        (millimetres > 0).then(|| f64::from(geometry.width) / f64::from(millimetres))
    }
}
