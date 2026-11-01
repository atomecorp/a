import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

// The media and model files a local feature reads on this device (R-104 §7): each entry is
// one capability of class `offline: local` and the exact files it needs, under the static
// root (`/`). The registry's `annotations.json` takes this list over (lot D1): an entry keeps
// this shape, `{ capability, files }` or `{ capability, index }`. Never a directory: a file is
// listed because its owner reads it (owner named on each entry), so a recording, a demo video
// or a precompressed copy lying beside it never enters the device's cache.
// Left out on purpose: `assets/videos/superman.mp4` (55 MB demo source of the video preset,
// `genesis.js`), the other videos (read by no code), the unpacked Vosk model (native only),
// the `.wasm.gz` / `.wasm.br` copies (the server's own encodings of a cached `.wasm`).
export const OFFLINE_LOCAL_RESOURCES = Object.freeze([
    // notification_sounds.js SOUNDS (ALARM_RINGTONES + notification dings), 0.8 MB.
    { capability: 'audio.alarm_and_notification_sounds', files: [
        'assets/audios/alarms/alarm_gentle.mp3', 'assets/audios/alarms/alarm_chime.mp3', 'assets/audios/alarms/alarm_birds.mp3',
        'assets/audios/alarms/alarm_bells.mp3', 'assets/audios/alarms/alarm_gong.mp3', 'assets/audios/alarms/alarm_clock.mp3',
        'assets/audios/notifications/message.mp3', 'assets/audios/notifications/media_message.mp3',
        'assets/audios/notifications/visio_call_ring.mp3', 'assets/audios/notifications/audio_call_ring.mp3'] },
    // fx_impulse_set.js BUNDLED_IMPULSES, 1.7 MB.
    { capability: 'audio.amp_cab_impulses', files: [
        'assets/impulses/cab_1x12_open.wav', 'assets/impulses/cab_2x12.wav', 'assets/impulses/cab_4x12_closed.wav',
        'assets/impulses/cab_bass_1x15.wav', 'assets/impulses/room_small.wav', 'assets/impulses/room_hall.wav',
        'assets/impulses/room_plate.wav'] },
    // audio_to_midi/engine.js: the weights of model.json, 0.7 MB.
    { capability: 'audio.audio_to_midi_model', files: ['assets/vendor/basic-pitch/model/group1-shard1of1.bin'] },
    // media_source_runtime.js BUNDLED_MEDIA_ASSET_BY_NAME: the sound preset and the missing-video placeholder, 0.5 MB.
    { capability: 'media.bundled_presets', files: ['assets/audios/riff.m4a', 'assets/videos/video_missing.mp4'] },
    // voice_lines.js: every pre-rendered sentence its index names (the offline sentence included), 17.8 MB.
    { capability: 'voice.lines_prerendered', index: 'assets/voice/lines_fr/index.json' },
    // local_tts_worker.js: eVe's Piper voice, 63 MB.
    { capability: 'voice.local_tts', files: ['assets/voice/fr_FR-siwis-medium/fr_FR-siwis-medium.onnx'] },
    // browser_voice_engine.js (Vosk model) + browser_voice_worker.js (Silero VAD), 44 MB.
    { capability: 'voice.browser_stt_vad', files: ['assets/voice/vosk/vosk-model-small-fr-0.22.tar.gz', 'assets/voice/vad/silero_vad.onnx'] },
    // wake_detector_worker.js, 2.4 MB.
    { capability: 'voice.wake_word', files: ['assets/voice/wake/melspectrogram.onnx', 'assets/voice/wake/embedding_model.onnx'] }
]);

// The files of every entry, relative to the static root. A listed file that is missing is a
// broken declaration: the server refuses to start rather than publish a manifest the
// service worker could never complete.
export async function resolveOfflineLocalFiles(staticRoot) {
    const files = [];
    for (const entry of OFFLINE_LOCAL_RESOURCES) {
        if (entry.index) {
            const { lines } = JSON.parse(await readFile(path.join(staticRoot, entry.index), 'utf8'));
            const folder = path.posix.dirname(entry.index);
            files.push(...Object.values(lines).map(line => path.posix.join(folder, line.file)));
        } else files.push(...entry.files);
    }
    for (const relative of files) {
        const info = await stat(path.join(staticRoot, relative)).catch(error => {
            if (error.code === 'ENOENT') throw new Error(`offline_local_resource_missing:${relative}`);
            throw error;
        });
        if (!info.isFile()) throw new Error(`offline_local_resource_missing:${relative}`);
    }
    return [...new Set(files)].sort();
}
