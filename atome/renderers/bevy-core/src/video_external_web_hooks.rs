// The page hooks the external-texture renderer reads and calls (bevy_video_stream_source_runtime.js,
// bevy_perf_diagnostics_runtime.js).
use wasm_bindgen::{JsCast, JsValue};

pub(crate) fn hidden_video_source_for_id(id: &str) -> Option<wgpu::ExternalImageSource> {
    let window = web_sys::window()?;
    let lookup = js_sys::Reflect::get(
        window.as_ref(),
        &JsValue::from_str("__EVE_BEVY_VIDEO_SOURCE_FOR_ID__"),
    )
    .ok()?
    .dyn_into::<js_sys::Function>()
    .ok()?;
    let source = lookup.call1(window.as_ref(), &JsValue::from_str(id)).ok()?;
    if let Some(video) = source.dyn_ref::<web_sys::HtmlVideoElement>() {
        return (video.ready_state() >= web_sys::HtmlMediaElement::HAVE_CURRENT_DATA)
            .then(|| wgpu::ExternalImageSource::HTMLVideoElement(video.clone()));
    }
    source
        .dyn_into::<web_sys::VideoFrame>()
        .ok()
        .map(wgpu::ExternalImageSource::VideoFrame)
}

// The page's video runtime owns the report (bevy_video_stream_source_runtime.js), installed with
// the source lookup the import just used.
pub(crate) fn report_video_import_refused(id: &str, error: &JsValue) {
    let hook = web_sys::window()
        .and_then(|window| {
            js_sys::Reflect::get(
                window.as_ref(),
                &JsValue::from_str("__EVE_BEVY_VIDEO_IMPORT_REFUSED__"),
            )
            .ok()
        })
        .and_then(|value| value.dyn_into::<js_sys::Function>().ok())
        .expect(
            "__EVE_BEVY_VIDEO_IMPORT_REFUSED__ is installed with __EVE_BEVY_VIDEO_SOURCE_FOR_ID__",
        );
    hook.call2(&JsValue::NULL, &JsValue::from_str(id), error)
        .expect("__EVE_BEVY_VIDEO_IMPORT_REFUSED__ reports without throwing");
}

pub(crate) fn record_video_external_event(name: &str, id: &str) {
    let Some(window) = web_sys::window() else {
        return;
    };
    let Ok(callback) = js_sys::Reflect::get(
        window.as_ref(),
        &JsValue::from_str("__EVE_BEVY_PERF_RECORD__"),
    ) else {
        return;
    };
    let Ok(function) = callback.dyn_into::<js_sys::Function>() else {
        return;
    };
    let detail = js_sys::Object::new();
    let _ = js_sys::Reflect::set(&detail, &JsValue::from_str("id"), &JsValue::from_str(id));
    let _ = function.call2(window.as_ref(), &JsValue::from_str(name), detail.as_ref());
}
