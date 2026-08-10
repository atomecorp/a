const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, Number(value) || 0));

const rmsFor = (samples) => {
    if (!samples?.length) return 0;
    let energy = 0;
    for (let index = 0; index < samples.length; index += 1) {
        const sample = (samples[index] - 128) / 128;
        energy += sample * sample;
    }
    return Math.sqrt(energy / samples.length);
};

// Owns the ephemeral browser microphone analysis used by voice surfaces. It
// never stores audio, never feeds a renderer directly, and releases its track
// as soon as the listening session ends.
export const createVoiceInputMeter = ({ env = globalThis, onFrame = () => { } } = {}) => {
    let stream = null;
    let audioContext = null;
    let source = null;
    let analyser = null;
    let buffer = null;
    let frame = 0;
    let active = false;

    const stop = async () => {
        active = false;
        if (frame) env.cancelAnimationFrame?.(frame);
        frame = 0;
        source?.disconnect?.();
        analyser?.disconnect?.();
        stream?.getTracks?.().forEach((track) => track.stop?.());
        if (audioContext?.close) await audioContext.close();
        stream = null;
        audioContext = null;
        source = null;
        analyser = null;
        buffer = null;
    };

    const render = () => {
        if (!active || !analyser || !buffer) return;
        analyser.getByteTimeDomainData(buffer);
        try {
            onFrame({ rms: clamp(rmsFor(buffer) * 5), active: true });
        } catch (_) {
            // The meter is observational; a subscriber cannot own capture.
        }
        frame = env.requestAnimationFrame?.(render) || 0;
    };

    return Object.freeze({
        async start() {
            const mediaDevices = env?.navigator?.mediaDevices;
            const AudioContextCtor = env?.AudioContext || env?.webkitAudioContext;
            if (!mediaDevices?.getUserMedia) throw new Error('microphone_unavailable');
            if (typeof AudioContextCtor !== 'function') throw new Error('audio_context_unavailable');
            await stop();
            try {
                stream = await mediaDevices.getUserMedia({
                    audio: {
                        echoCancellation: true,
                        noiseSuppression: true,
                        autoGainControl: true,
                        channelCount: 1
                    }
                });
                audioContext = new AudioContextCtor();
                source = audioContext.createMediaStreamSource(stream);
                analyser = audioContext.createAnalyser();
                analyser.fftSize = 512;
                analyser.smoothingTimeConstant = 0.85;
                source.connect(analyser);
                buffer = new Uint8Array(analyser.fftSize);
                active = true;
                render();
                return true;
            } catch (error) {
                await stop();
                throw error;
            }
        },
        stop,
        getState: () => ({ active, hasStream: !!stream })
    });
};
