use atome_bevy_renderer_core::{AtomeBevyRendererConfig, AtomeRenderScene};
use std::ffi::{c_char, CStr};

const ABI_VERSION: u32 = 1;
const RENDERER_MODE_LINKED_NO_PRESENTER: &[u8] = b"linked_no_presenter\0";
const ERROR_NONE: u32 = 0;
const ERROR_NULL_SCENE_JSON: u32 = 1;
const ERROR_INVALID_UTF8: u32 = 2;
const ERROR_INVALID_JSON: u32 = 3;
const ERROR_INVALID_DIMENSIONS: u32 = 4;

#[repr(C)]
pub struct AtomeIosBevyRendererStatus {
    pub abi_version: u32,
    pub rust_compiled: u8,
    pub rust_linked: u8,
    pub bevy_core_linked: u8,
    pub presentable: u8,
    pub renderer_mode: *const c_char,
}

#[repr(C)]
pub struct AtomeIosBevySceneProbe {
    pub abi_version: u32,
    pub success: u8,
    pub scene_decode_ok: u8,
    pub rust_compiled: u8,
    pub rust_linked: u8,
    pub bevy_core_linked: u8,
    pub presentable: u8,
    pub node_count: u32,
    pub media_node_count: u32,
    pub texture_node_count: u32,
    pub source_node_count: u32,
    pub text_node_count: u32,
    pub width: f64,
    pub height: f64,
    pub error_code: u32,
    pub renderer_mode: *const c_char,
}

fn linked_no_presenter_mode() -> *const c_char {
    RENDERER_MODE_LINKED_NO_PRESENTER.as_ptr().cast()
}

#[no_mangle]
pub extern "C" fn atome_ios_bevy_renderer_status() -> AtomeIosBevyRendererStatus {
    let _config = AtomeBevyRendererConfig::empty(1.0, 1.0);
    AtomeIosBevyRendererStatus {
        abi_version: ABI_VERSION,
        rust_compiled: 1,
        rust_linked: 1,
        bevy_core_linked: 1,
        presentable: 0,
        renderer_mode: linked_no_presenter_mode(),
    }
}

#[no_mangle]
pub extern "C" fn atome_ios_bevy_scene_probe(
    scene_json: *const c_char,
    width: f64,
    height: f64,
) -> AtomeIosBevySceneProbe {
    if !width.is_finite() || !height.is_finite() || width <= 0.0 || height <= 0.0 {
        return scene_probe_error(width, height, ERROR_INVALID_DIMENSIONS);
    }
    if scene_json.is_null() {
        return scene_probe_error(width, height, ERROR_NULL_SCENE_JSON);
    }
    let raw = unsafe { CStr::from_ptr(scene_json) };
    let Ok(json) = raw.to_str() else {
        return scene_probe_error(width, height, ERROR_INVALID_UTF8);
    };
    let Ok(scene) = serde_json::from_str::<AtomeRenderScene>(json) else {
        return scene_probe_error(width, height, ERROR_INVALID_JSON);
    };
    let _config = AtomeBevyRendererConfig::new(width as f32, height as f32, scene.clone());
    scene_probe_success(scene, width, height)
}

fn scene_probe_error(width: f64, height: f64, error_code: u32) -> AtomeIosBevySceneProbe {
    AtomeIosBevySceneProbe {
        abi_version: ABI_VERSION,
        success: 0,
        scene_decode_ok: 0,
        rust_compiled: 1,
        rust_linked: 1,
        bevy_core_linked: 1,
        presentable: 0,
        node_count: 0,
        media_node_count: 0,
        texture_node_count: 0,
        source_node_count: 0,
        text_node_count: 0,
        width,
        height,
        error_code,
        renderer_mode: linked_no_presenter_mode(),
    }
}

fn scene_probe_success(scene: AtomeRenderScene, width: f64, height: f64) -> AtomeIosBevySceneProbe {
    let mut media_node_count = 0;
    let mut texture_node_count = 0;
    let mut source_node_count = 0;
    let mut text_node_count = 0;
    for node in &scene.nodes {
        let kind = node.kind.trim().to_ascii_lowercase();
        if kind == "image" || kind == "video" || kind == "audio_waveform" {
            media_node_count += 1;
        }
        if kind == "text" {
            text_node_count += 1;
        }
        if node.texture.is_some() {
            texture_node_count += 1;
        }
        if node
            .source
            .as_ref()
            .map(|value| !value.trim().is_empty())
            .unwrap_or(false)
        {
            source_node_count += 1;
        }
    }
    AtomeIosBevySceneProbe {
        abi_version: ABI_VERSION,
        success: 1,
        scene_decode_ok: 1,
        rust_compiled: 1,
        rust_linked: 1,
        bevy_core_linked: 1,
        presentable: 0,
        node_count: scene.nodes.len() as u32,
        media_node_count,
        texture_node_count,
        source_node_count,
        text_node_count,
        width,
        height,
        error_code: ERROR_NONE,
        renderer_mode: linked_no_presenter_mode(),
    }
}
