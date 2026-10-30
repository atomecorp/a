import { getTauriSttBridge } from './service_support.js';
import { writeVoiceDiagnostic } from './telemetry.js';

const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, Number(value) || 0));
export const normalizeNativeInputRms = (rawRms, previous = 0) => {
    const amplitude = Math.max(0.000001, Number(rawRms) || 0);
    const decibels = 20 * Math.log10(amplitude);
    const normalized = clamp((decibels + 56) / 25);
    const target = normalized < 0.04 ? 0 : normalized;
    const factor = target > previous ? 0.72 : 0.14;
    return clamp(previous + (target - previous) * factor);
};

const HEARD_PEAK = 0.7, HEARD_DECAY_MS = 450;

// Owns the ephemeral microphone-analysis lifecycle for voice sessions.
export const createVoiceInputMeterRuntime = ({ env = globalThis, sessionRuntime, sttProvider = '' } = {}) => {
    const meters = new Map();
    const listeners = new Set();

    const publish = (frame) => {
        listeners.forEach((listener) => {
            try { listener(frame); } catch (_) { }
        });
    };

    const stop = async (sessionId) => {
        const meter = meters.get(String(sessionId));
        if (!meter) return;
        meters.delete(String(sessionId));
        await meter.stop();
        publish({ session_id: sessionId, rms: 0, active: false });
        sessionRuntime.publishEvent(sessionId, 'voice.input.state', { state: 'stopped' });
    };

    const startNativeSttMeter = async (sessionId, purpose) => {
        const bridge = getTauriSttBridge(env);
        if (typeof bridge?.onAudioLevel !== 'function') throw new Error('native_input_level_unavailable');
        let accepting = true;
        let smoothedRms = 0;
        let reportedBucket = -1;
        let activePublished = false;
        const unlisten = await bridge.onAudioLevel((frame = {}) => {
            if (!accepting) return;
            if (!activePublished) {
                activePublished = true;
                sessionRuntime.publishEvent(sessionId, 'voice.input.state', { state: 'active', purpose });
            }
            const rms = normalizeNativeInputRms(frame?.rms, smoothedRms);
            smoothedRms = rms;
            const bucket = Math.max(0, Math.min(4, Math.floor(rms * 4)));
            if (bucket !== reportedBucket) {
                reportedBucket = bucket;
                writeVoiceDiagnostic(env, 'voice.microphone.level', {
                    session_id: sessionId,
                    purpose,
                    raw_rms: Number(frame?.rms || 0),
                    normalized_rms: rms,
                    bucket
                });
            }
            publish({
                session_id: sessionId,
                rms,
                active: true,
                purpose
            });
        });
        return {
            async start() { },
            async stop() {
                accepting = false;
                if (typeof unlisten === 'function') await unlisten();
            }
        };
    };

    // Browser speech recognition owns the microphone: a second capture opened beside
    // it (getUserMedia) receives silence on WebKit (iOS) and makes the system lower
    // eVe's voice. The level then follows what the recognizer hears: each word it
    // recognizes lifts it, and it falls back between words.
    const startRecognitionMeter = (sessionId, purpose) => {
        let level = 0, frame = 0, last = 0;
        const tick = (now) => {
            level = Math.max(0, level - ((now - last) / HEARD_DECAY_MS) * HEARD_PEAK);
            last = now;
            publish({ session_id: sessionId, rms: level, active: true, purpose });
            frame = level > 0 ? env.requestAnimationFrame(tick) : 0;
        };
        const unsubscribe = sessionRuntime.subscribe((event) => {
            if (event?.session_id !== sessionId || event.type !== 'voice.stt.partial') return;
            level = HEARD_PEAK;
            if (!frame) { last = env.performance.now(); frame = env.requestAnimationFrame(tick); }
        });
        return {
            async start() { },
            async stop() {
                unsubscribe();
                if (frame) env.cancelAnimationFrame(frame);
                frame = 0;
            }
        };
    };

    // `provider`: the recognizer this session listens with (free dictation may take another than `sttProvider`).
    const start = async (sessionId, { purpose = 'user_turn', provider = sttProvider } = {}) => {
        if (meters.has(String(sessionId))) return;
        let meter;
        try {
            meter = provider === 'tauri_plugin_stt'
                ? await startNativeSttMeter(sessionId, purpose)
                : startRecognitionMeter(sessionId, purpose);
            meters.set(String(sessionId), meter);
            await meter.start();
            sessionRuntime.publishEvent(sessionId, 'voice.input.state', {
                state: provider === 'tauri_plugin_stt' ? 'armed' : 'active',
                purpose
            });
        } catch (error) {
            meters.delete(String(sessionId));
            await meter?.stop?.();
            sessionRuntime.publishEvent(sessionId, 'voice.input.state', {
                state: 'unavailable',
                error: error?.message || String(error)
            });
        }
    };

    return Object.freeze({
        start,
        stop,
        subscribe(listener) {
            if (typeof listener !== 'function') return () => { };
            listeners.add(listener);
            return () => listeners.delete(listener);
        }
    });
};
