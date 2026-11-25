export const KIRA_AUDIO_COMMANDS = Object.freeze({
    PLAY_INSTANCE: 'audio_play_instance',
    STOP_INSTANCE: 'audio_stop_instance'
});

const safeString = (value) => String(value ?? '').trim();
const finiteNumber = (value, defaultValue = 0) => {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : defaultValue;
};
// An absent value stays absent: `Number(null)` is 0, which turned "play to
// the end" (`durationSeconds: null`) into a 1 ms play — silent playback on iOS.
const optionalNumber = (value) => (
    value === null || value === undefined || value === '' ? NaN : Number(value)
);
const optionalPositiveNumber = (value) => {
    const numeric = optionalNumber(value);
    return Number.isFinite(numeric) ? Math.max(0.001, numeric) : null;
};
const optionalNonNegativeNumber = (value) => {
    const numeric = optionalNumber(value);
    return Number.isFinite(numeric) ? Math.max(0, numeric) : null;
};
const clamp = (value, min, max) => Math.min(max, Math.max(min, Number(value) || 0));

// The timeline window of a scheduled voice, rendered on every frame by the
// engine (atome-mix-graph `VoiceEnvelope`): null when absent or empty.
export const normalizeKiraVoiceEnvelope = (input) => {
    if (!input || typeof input !== 'object') return null;
    const durationSeconds = Number(input.durationSeconds ?? input.duration_seconds);
    if (!(durationSeconds > 0) || !Number.isFinite(durationSeconds)) return null;
    const decayStart = optionalNumber(input.decayStartSeconds ?? input.decay_start_seconds);
    return {
        offsetSeconds: Math.max(0, finiteNumber(input.offsetSeconds ?? input.offset_seconds, 0)),
        durationSeconds,
        fadeInSeconds: Math.max(0, finiteNumber(input.fadeInSeconds ?? input.fade_in_seconds, 0)),
        fadeOutSeconds: Math.max(0, finiteNumber(input.fadeOutSeconds ?? input.fade_out_seconds, 0)),
        // Where a loop pass stops the voice before the clip's end.
        endSeconds: optionalNonNegativeNumber(input.endSeconds ?? input.end_seconds),
        // A cell's attack (from the clip time its cell started) and release (to the voice's end).
        attackStartSeconds: finiteNumber(input.attackStartSeconds ?? input.attack_start_seconds, 0),
        attackSeconds: Math.max(0, finiteNumber(input.attackSeconds ?? input.attack_seconds, 0)),
        releaseSeconds: Math.max(0, finiteNumber(input.releaseSeconds ?? input.release_seconds, 0)),
        // The rest of a cell's ADSR: after the attack, down to the sustain level in the decay.
        decayStartSeconds: Number.isFinite(decayStart) ? decayStart : null,
        decaySeconds: Math.max(0, finiteNumber(input.decaySeconds ?? input.decay_seconds, 0)),
        sustainLevel: clamp(input.sustainLevel ?? input.sustain_level ?? 1, 0, 1)
    };
};

// A warped voice's time map (mix-graph warp_voice.rs): `[[clip_seconds, source_seconds]…]`, its pitch, and whether the
// pitch follows the speed (`tape`, a take's speed curve in Bande); the engine validates the map and refuses a voice
// whose map it cannot play.
const normalizeKiraVoiceWarp = (warp) => {
    if (warp === undefined || warp === null) return null;
    if (typeof warp !== 'object' || !Array.isArray(warp.points)) throw new Error('kira_voice_warp_points_required');
    return {
        points: warp.points.map((point) => [Number(point?.[0]), Number(point?.[1])]),
        pitchSemitones: finiteNumber(warp.pitchSemitones ?? warp.pitch_semitones, 0),
        tape: warp.tape === true
    };
};

export const normalizeKiraPlayInstancePayload = (input = {}) => {
    const source = input && typeof input === 'object' ? input : {};
    const assetId = safeString(source.assetId || source.asset_id || source.id || source.clipId || source.clip_id);
    const voiceId = safeString(source.voiceId || source.voice_id || assetId);
    return {
        assetId,
        voiceId,
        startSeconds: Math.max(0, finiteNumber(source.startSeconds ?? source.start_seconds ?? source.start, 0)),
        durationSeconds: optionalPositiveNumber(source.durationSeconds ?? source.duration_seconds ?? source.duration),
        gain: clamp(source.gain ?? 1, 0.000001, 16),
        pan: clamp(source.pan ?? 0, -1, 1),
        rate: Math.max(0.0001, finiteNumber(source.rate, 1)),
        loopStartSeconds: optionalNonNegativeNumber(source.loopStartSeconds ?? source.loop_start_seconds),
        loopEndSeconds: optionalNonNegativeNumber(source.loopEndSeconds ?? source.loop_end_seconds),
        // Mixer strip whose sub-track plays the voice (`<track_id>:audio`).
        stripId: safeString(source.stripId ?? source.strip_id) || null,
        // Played backwards, from its window's end to its start.
        reverse: source.reverse === true,
        warp: normalizeKiraVoiceWarp(source.warp)
    };
};

export const normalizeKiraStopInstancePayload = (input = {}) => ({
    voiceId: safeString(
        typeof input === 'string'
            ? input
            : ((input && typeof input === 'object')
                ? (input.voiceId || input.voice_id || input.id || input.clipId || input.clip_id)
                : '')
    )
});

export const buildTauriKiraAudioPayload = (command = '', input = {}) => {
    const normalizedCommand = safeString(command);
    if (normalizedCommand === KIRA_AUDIO_COMMANDS.PLAY_INSTANCE) {
        const payload = normalizeKiraPlayInstancePayload(input);
        return {
            assetId: payload.assetId,
            voiceId: payload.voiceId,
            startSeconds: payload.startSeconds,
            durationSeconds: payload.durationSeconds,
            gain: payload.gain,
            pan: payload.pan,
            rate: payload.rate,
            loopStartSeconds: payload.loopStartSeconds,
            loopEndSeconds: payload.loopEndSeconds,
            stripId: payload.stripId,
            reverse: payload.reverse,
            warp: payload.warp
        };
    }
    if (normalizedCommand === KIRA_AUDIO_COMMANDS.STOP_INSTANCE) {
        const payload = normalizeKiraStopInstancePayload(input);
        return { voiceId: payload.voiceId };
    }
    return input && typeof input === 'object' ? { ...input } : {};
};

export const buildFacadeKiraAudioPayload = (command = '', input = {}) => {
    const normalizedCommand = safeString(command);
    if (normalizedCommand === KIRA_AUDIO_COMMANDS.PLAY_INSTANCE) {
        const payload = normalizeKiraPlayInstancePayload(input);
        return {
            asset_id: payload.assetId,
            voice_id: payload.voiceId,
            start_seconds: payload.startSeconds,
            duration_seconds: payload.durationSeconds,
            gain: payload.gain,
            pan: payload.pan,
            rate: payload.rate,
            loop_start_seconds: payload.loopStartSeconds,
            loop_end_seconds: payload.loopEndSeconds,
            strip_id: payload.stripId
        };
    }
    if (normalizedCommand === KIRA_AUDIO_COMMANDS.STOP_INSTANCE) {
        const payload = normalizeKiraStopInstancePayload(input);
        return { voice_id: payload.voiceId };
    }
    return input && typeof input === 'object' ? { ...input } : {};
};

// The voices started on their exact rendered frames, in the engine's words (mix-graph `ScheduledVoice`): a live
// schedule's (`schedule_instances`) and a project's proxy plan's (`render_proxy`, R-349) alike.
export const buildKiraScheduledVoices = (list = []) => list.map((arg) => {
    const payload = normalizeKiraPlayInstancePayload(arg);
    const frame = Number(arg?.startRenderFrame);
    if (!payload.assetId || !payload.voiceId || !Number.isFinite(frame)) {
        throw new Error('[backend.kira] schedule_instances requires asset, voice and frame');
    }
    return { ...buildTauriKiraAudioPayload(KIRA_AUDIO_COMMANDS.PLAY_INSTANCE, payload),
        startRenderFrame: Math.max(0, Math.round(frame)), envelope: normalizeKiraVoiceEnvelope(arg.envelope) };
});

// A clip's bytes for a native engine (Tauri, iOS): one base64 string, the one binary form a script message carries,
// never a JSON array of numbers (a 90 MB AIFF sent as `Array.from(bytes)` grew into gigabytes and killed the iOS app,
// 16 Nov. 2026). `Uint8Array.prototype.toBase64` is the encoder of every engine's WebView (WebKit 18.2+, Chromium 140+).
export const buildNativeClipBytesPayload = (id, bytes) => {
    if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0) throw new Error('native_clip_bytes_required');
    if (typeof bytes.toBase64 !== 'function') throw new Error('native_clip_bytes_base64_encoder_missing');
    return { id, bytesBase64: bytes.toBase64() };
};

// A sound's bytes for `audio_probe_duration_from_bytes` (its length read from its container, never decoded).
export const buildNativeProbeDurationPayload = (bytes) => {
    const { bytesBase64 } = buildNativeClipBytesPayload('', bytes);
    return { bytesBase64 };
};
