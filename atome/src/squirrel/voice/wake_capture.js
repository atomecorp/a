import { getTauriInvoke, isTauriAudioRuntime, isIosHostAppRuntime } from '../../application/audio_runtime/runtime_audio_backend.js';
import { WAKE_FRAME_SAMPLES, WAKE_SAMPLE_RATE } from './wake_features.js';

const NATIVE_POLL_MS = 80;

export const isNativeWakeCapture = env => isTauriAudioRuntime(env) || isIosHostAppRuntime(env);

// Non-persistent 16 kHz PCM capture in 80 ms frames (int16 scale, Float32Array).
// Native hosts own the microphone through audio_wake_*; the browser resamples in
// a 16 kHz AudioContext. Audio is never stored: frames go straight to onFrame.
export const createWakeCapture = ({ env = globalThis, onFrame, onError }) => {
    let pending = new Float32Array(0), closed = false, stopCapture = async () => {};
    const deliver = (samples) => {
        const merged = new Float32Array(pending.length + samples.length);
        merged.set(pending); merged.set(samples, pending.length);
        let offset = 0;
        for (; offset + WAKE_FRAME_SAMPLES <= merged.length; offset += WAKE_FRAME_SAMPLES) onFrame(merged.slice(offset, offset + WAKE_FRAME_SAMPLES));
        pending = merged.slice(offset);
    };

    const startNative = async () => {
        const invoke = getTauriInvoke(env);
        if (!invoke) throw new Error('wake_native_capture_unavailable');
        // Android grants the microphone at run time (the STT plugin owns that permission; a desktop has it):
        // without it the native capture only delivered silence while eVe looked to be listening.
        if (isTauriAudioRuntime(env) && (await invoke('plugin:stt|request_permission'))?.microphone !== 'granted') throw new Error('microphone_permission_denied');
        if (closed) return;
        let timer = null, subscribed = true;
        stopCapture = async () => {
            if (timer !== null) env.clearTimeout(timer);
            timer = null;
            if (subscribed) { subscribed = false; await invoke('audio_wake_stop', {}); }
        };
        const read = async () => {
            if (closed) return;
            try {
                const data = await invoke('audio_wake_read', {});
                if (closed) return;
                if (data?.active !== true) throw new Error(data?.busy ? 'wake_capture_busy' : 'wake_capture_failed');
                if (data.overrun === true) throw new Error('wake_capture_overrun');
                if (data.samples?.length) deliver(Float32Array.from(data.samples));
                timer = env.setTimeout(read, NATIVE_POLL_MS);
            } catch (error) {
                if (!closed) onError(new Error(['wake_capture_busy', 'wake_capture_overrun'].includes(error.message) ? error.message : 'wake_capture_failed'));
            }
        };
        await invoke('audio_wake_start', { sampleRate: WAKE_SAMPLE_RATE });
        if (!closed) void read();
    };

    const startBrowser = async () => {
        const devices = env.navigator?.mediaDevices;
        if (!devices?.getUserMedia || !env.AudioContext || !env.AudioWorkletNode) throw new Error('wake_capture_failed');
        let stream = null, context = null;
        stopCapture = async () => {
            stream?.getTracks().forEach(track => track.stop());
            stream = null;
            if (context) { const current = context; context = null; await current.close(); }
        };
        stream = await devices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
        // A permission answered after close() releases its stream immediately.
        if (closed) return stopCapture();
        context = new env.AudioContext({ sampleRate: WAKE_SAMPLE_RATE });
        await context.audioWorklet.addModule('/src/squirrel/voice/wake_capture_worklet.js');
        if (closed) return stopCapture();
        const node = new env.AudioWorkletNode(context, 'wake-capture');
        node.port.onmessage = ({ data }) => { if (!closed) deliver(data); };
        context.createMediaStreamSource(stream).connect(node);
        await context.resume();
    };

    return Object.freeze({
        async start() {
            try { await (isNativeWakeCapture(env) ? startNative() : startBrowser()); }
            catch (error) {
                await stopCapture().catch(() => {});
                const code = String(error?.message || '');
                if (['NotAllowedError', 'SecurityError', 'PermissionError'].includes(error?.name) || code === 'microphone_permission_denied') throw new Error('microphone_permission_denied');
                throw new Error(code.startsWith('wake_') ? code : 'wake_capture_failed');
            }
        },
        async close() { closed = true; pending = new Float32Array(0); await stopCapture(); }
    });
};

export const wakeCaptureAvailable = async (env = globalThis) => {
    if (!isNativeWakeCapture(env)) return false;
    const data = await getTauriInvoke(env)('audio_wake_read', {});
    return data?.busy !== true && data?.failed !== true;
};
