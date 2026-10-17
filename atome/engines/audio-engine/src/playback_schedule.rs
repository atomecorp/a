// Sample-accurate voice starts on the native engine (todo/timeline v1.6): the
// voice's sound is built now, and the render thread starts it on its exact
// rendered frame (see `scheduled_backend.rs`).

use super::playback::{build_voice_sound, start_voice, ENGINE};
use super::scheduled_backend;
use atome_mix_graph::voice::{VoiceRequest, VoiceSound};

pub fn schedule_instance(
    asset_id: &str,
    voice_id: &str,
    request: &VoiceRequest,
    start_render_frame: u64,
    strip_id: Option<&str>,
) -> Result<u64, String> {
    let sound = {
        let mut guard = ENGINE.write().map_err(|e| format!("Lock error: {e}"))?;
        let engine = guard.as_mut().ok_or("Audio engine not initialized")?;
        engine.mix.route_voice(voice_id, strip_id);
        // Reachable later for a late end (`audio_set_voice_end`).
        build_voice_sound(engine, asset_id, request)?.controlled(voice_id)
    };
    Ok(scheduled_backend::schedule(voice_id, sound, start_render_frame))
}

// Called by the render thread at the exact frame a scheduled voice is due.
pub(super) fn start_due_voice(voice_id: &str, sound: VoiceSound) {
    if let Ok(mut guard) = ENGINE.write() {
        if let Some(engine) = guard.as_mut() {
            if let Err(error) = start_voice(engine, voice_id, voice_id, sound) {
                eprintln!("[audio_engine::schedule] voice {voice_id} failed to start: {error}");
            }
        }
    }
}

pub fn render_clock() -> Option<scheduled_backend::RenderClock> {
    scheduled_backend::render_clock()
}
