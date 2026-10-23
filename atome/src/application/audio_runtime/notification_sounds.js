import { getAudioPlaybackAPI } from './audio_playback_api.js';

// The sounds that announce what a person sends: a ding for a message, another
// for an audio or video message, and one ring per call mode that repeats until
// the call is answered, declined or missed. Files: atome/src/assets/audios/notifications
// (CC0, see its README). They play on the canonical playback route, so Kira
// renders them on Web, Tauri and iOS alike.
const SOUND_ROOT = new URL('../../assets/audios/notifications/', import.meta.url);
const SOUND_FILES = Object.freeze({
    message: 'message.mp3',
    media_message: 'media_message.mp3',
    visio_call: 'visio_call_ring.mp3',
    audio_call: 'audio_call_ring.mp3'
});
// One ring, then the silence before the next one.
const RING_PERIOD_MS = 3000;
const SOURCE_LAYER = 'notification_sound';

export const createNotificationSoundPlayer = ({ env = globalThis, audio = getAudioPlaybackAPI(env), fetchImpl = (url) => env.fetch(url) } = {}) => {
    // A sound is decoded once and stays loaded: the next ding starts at once.
    const loaded = new Map();
    let ring = null;
    const load = (name) => {
        const file = SOUND_FILES[name];
        if (!file) return Promise.reject(new Error(`notification_sound_unknown:${name}`));
        if (!loaded.has(name)) {
            const assetId = `__notification_sound_${name}`;
            loaded.set(name, fetchImpl(new URL(file, SOUND_ROOT).href).then(async (response) => {
                if (!response.ok) throw new Error(`notification_sound_unavailable:${name}`);
                const bytes = new Uint8Array(await response.arrayBuffer());
                await audio.loadTransientAsset({ assetId, bytes, source_layer: SOURCE_LAYER });
                return assetId;
            }).catch((error) => { loaded.delete(name); throw error; }));
        }
        return loaded.get(name);
    };
    // One voice per sound: a new start replaces the one still sounding.
    const voiceOf = (name) => `__notification_sound_voice_${name}`;
    const start = async (name) => audio.startVoice({ assetId: await load(name), voiceId: voiceOf(name), source_layer: SOURCE_LAYER });
    const stopRing = async () => {
        const current = ring;
        ring = null;
        if (!current) return;
        env.clearInterval(current.timer);
        // A ring still loading has no voice yet: `ring()` silences it once it starts.
        if (current.started) await audio.stopVoice({ voiceId: voiceOf(current.name), source_layer: SOURCE_LAYER });
    };
    return Object.freeze({
        play: (name) => start(name),
        // Rings until `stopRing()`; a new ring replaces the current one. The ring is
        // owned at once, so a stop that comes while its sound still loads is not missed.
        async ring(name) {
            const previous = ring;
            const current = { name, started: false, timer: env.setInterval(() => {
                if (ring === current) void start(name).catch((error) => console.error('[notification-sound] ring failed', error));
            }, RING_PERIOD_MS) };
            ring = current;
            if (previous) {
                env.clearInterval(previous.timer);
                if (previous.started && previous.name !== name) await audio.stopVoice({ voiceId: voiceOf(previous.name), source_layer: SOURCE_LAYER });
            }
            await start(name);
            current.started = true;
            if (ring?.name !== name) await audio.stopVoice({ voiceId: voiceOf(name), source_layer: SOURCE_LAYER });
        },
        stopRing,
        isRinging: () => ring !== null
    });
};

// The single player of the page.
export const getNotificationSoundPlayer = (env = globalThis) => (env.__eveNotificationSounds ||= createNotificationSoundPlayer({ env }));
