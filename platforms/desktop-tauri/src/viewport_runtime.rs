use tauri::{Manager, Runtime, WebviewWindow, Window, WindowEvent};

fn logical_viewport_size(width: u32, height: u32, scale_factor: f64) -> Option<(f64, f64)> {
    if width == 0 || height == 0 || !scale_factor.is_finite() || scale_factor <= 0.0 {
        return None;
    }
    Some((width as f64 / scale_factor, height as f64 / scale_factor))
}

pub fn publish_native_viewport<R: Runtime>(window: &Window<R>, event: &WindowEvent) {
    let WindowEvent::Resized(size) = event else {
        return;
    };
    let scale_factor = window.scale_factor().unwrap_or(1.0);
    let Some((width, height)) = logical_viewport_size(size.width, size.height, scale_factor) else {
        return;
    };
    if let Some(webview) = window.app_handle().get_webview_window(window.label()) {
        publish_viewport(&webview, width, height);
    }
}

pub fn publish_current_webview_viewport<R: Runtime>(webview: &WebviewWindow<R>) {
    let Ok(size) = webview.inner_size() else {
        return;
    };
    let scale_factor = webview.scale_factor().unwrap_or(1.0);
    let Some((width, height)) = logical_viewport_size(size.width, size.height, scale_factor) else {
        return;
    };
    publish_viewport(webview, width, height);
}

fn publish_viewport<R: Runtime>(webview: &WebviewWindow<R>, width: f64, height: f64) {
    let script = format!(
        "window.__EVE_NATIVE_VIEWPORT__={{width:{width},height:{height}}};window.dispatchEvent(new CustomEvent('eve:native-viewport-resize',{{detail:window.__EVE_NATIVE_VIEWPORT__}}));"
    );
    let _ = webview.eval(&script);
}

#[cfg(test)]
mod tests {
    use super::logical_viewport_size;

    #[test]
    fn native_pixels_are_published_as_css_logical_viewport_units() {
        assert_eq!(logical_viewport_size(1600, 1136, 2.0), Some((800.0, 568.0)));
        assert_eq!(logical_viewport_size(0, 1136, 2.0), None);
    }
}
