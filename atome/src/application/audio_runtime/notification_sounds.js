import { getAudioPlaybackAPI } from './audio_playback_api.js';

// The sounds that announce what a person sends: a ding for a message, another
// for an audio or video message, and one ring per call mode that repeats until
// the call is answered, declined or missed; and the ringtones a calendar alarm
// rings until it is stopped. Files: atome/src/assets/audios/notifications and
// atome/src/assets/audios/alarms (CC0, see their READMEs). They play on the
// canonical playback route, so Kira renders them on Web, Tauri and iOS alike.
const SOUND_ROOT = new URL('../../assets/audios/', import.meta.url);
// The alarm ringtones, gentlest first; `alarm_<id>` is also the name of the iOS copy AlarmKit plays.
export const ALARM_RINGTONES = Object.freeze(['gentle', 'chime', 'birds', 'bells', 'gong', 'clock']);
export const alarmRingtoneSound = (ringtone) => {
    if (!ALARM_RINGTONES.includes(ringtone)) throw new Error(`alarm_ringtone_unknown:${ringtone}`);
    return `alarm_${ringtone}`;
};
// Each sound and the period of its ring: one ring, then the silence before the next one
// (a ringtone that already lasts its period loops without a gap).
const SOUNDS = Object.freeze({
    message: { file: 'notifications/message.mp3' },
    media_message: { file: 'notifications/media_message.mp3' },
    visio_call: { file: 'notifications/visio_call_ring.mp3', ringPeriodMs: 3000 },
    audio_call: { file: 'notifications/audio_call_ring.mp3', ringPeriodMs: 3000 },
    alarm_gentle: { file: 'alarms/alarm_gentle.mp3', ringPeriodMs: 3000 },
    alarm_chime: { file: 'alarms/alarm_chime.mp3', ringPeriodMs: 6500 },
    alarm_birds: { file: 'alarms/alarm_birds.mp3', ringPeriodMs: 10000 },
    alarm_bells: { file: 'alarms/alarm_bells.mp3', ringPeriodMs: 10000 },
    alarm_gong: { file: 'alarms/alarm_gong.mp3', ringPeriodMs: 8500 },
    alarm_clock: { file: 'alarms/alarm_clock.mp3', ringPeriodMs: 6000 }
});
const SOURCE_LAYER = 'notification_sound';

export const createNotificationSoundPlayer = ({ env = globalThis, audio = getAudioPlaybackAPI(env), fetchImpl = (url) => env.fetch(url) } = {}) => {
    // A sound is decoded once and stays loaded: the next ding starts at once.
    const loaded = new Map();
    let ring = null;
    const load = (name) => {
        const file = SOUNDS[name]?.file;
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
            const period = SOUNDS[name]?.ringPeriodMs;
            if (!period) throw new Error(`notification_sound_not_a_ring:${name}`);
            const previous = ring;
            const current = { name, started: false, timer: env.setInterval(() => {
                if (ring === current) void start(name).catch((error) => console.error('[notification-sound] ring failed', error));
            }, period) };
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
