// The native Kira audio engine on iOS (todo/audio_to_finalize §6.1): the same
// engine and commands as the Tauri desktop app (atome-audio-engine), called by
// the Swift bridge with the command name and its JSON arguments. One static
// library holds both Rust boundaries (two Rust staticlibs would duplicate std).

use std::ffi::{c_char, CStr, CString};
use std::path::Path;

fn read(text: *const c_char) -> Option<String> {
    if text.is_null() {
        return None;
    }
    // SAFETY: the Swift caller passes NUL-terminated UTF-8 strings it owns for the call.
    unsafe { CStr::from_ptr(text) }.to_str().ok().map(str::to_owned)
}

fn reply(value: serde_json::Value) -> *mut c_char {
    CString::new(value.to_string()).map(CString::into_raw).unwrap_or(std::ptr::null_mut())
}

/// Runs one audio command; returns `{"ok":true,"result":…}` or `{"ok":false,"error":…}`
/// as a string the caller releases with `atome_ios_audio_string_free`.
#[no_mangle]
pub extern "C" fn atome_ios_audio_command(name: *const c_char, args_json: *const c_char, project_root: *const c_char) -> *mut c_char {
    let Some(name) = read(name) else { return reply(serde_json::json!({ "ok": false, "error": "audio_command_name_missing" })) };
    let args = match read(args_json).map(|text| serde_json::from_str::<serde_json::Value>(&text)) {
        Some(Ok(args)) => args,
        Some(Err(error)) => return reply(serde_json::json!({ "ok": false, "error": format!("audio_command_args_json: {error}") })),
        None => serde_json::json!({}),
    };
    let root = read(project_root).filter(|root| !root.is_empty());
    match atome_audio_engine::commands::dispatch(&name, &args, root.as_deref().map(Path::new)) {
        Ok(result) => reply(serde_json::json!({ "ok": true, "result": result })),
        Err(error) => reply(serde_json::json!({ "ok": false, "error": error })),
    }
}

#[no_mangle]
pub extern "C" fn atome_ios_audio_string_free(text: *mut c_char) {
    if !text.is_null() {
        // SAFETY: `text` was returned by `atome_ios_audio_command` (CString::into_raw).
        drop(unsafe { CString::from_raw(text) });
    }
}

/// AUv3: runs the engine on the plugin host's clock (`host_output`): the
/// render block pulls frames with `atome_ios_audio_host_render`.
#[no_mangle]
pub extern "C" fn atome_ios_audio_host_start(sample_rate: u32) -> bool {
    atome_audio_engine::host_output::use_host_output(sample_rate);
    atome_audio_engine::playback::init().is_ok()
}

/// Real-time: fills `frames` frames of `left`/`right` (host buffers) with the
/// engine's output; `host_ns` is the host instant of the first frame.
#[no_mangle]
pub extern "C" fn atome_ios_audio_host_render(left: *mut f32, right: *mut f32, frames: u32, host_ns: i64) -> u32 {
    if left.is_null() || right.is_null() || frames == 0 {
        return 0;
    }
    // SAFETY: the render block passes two buffers of at least `frames` floats it owns for the call.
    let (left, right) = unsafe { (std::slice::from_raw_parts_mut(left, frames as usize), std::slice::from_raw_parts_mut(right, frames as usize)) };
    atome_audio_engine::host_output::render(left, right, host_ns) as u32
}
