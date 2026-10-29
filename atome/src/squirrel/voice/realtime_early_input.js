// The voice heard from the touch on, before the voice session is up, is not lost.
//
// The microphone opens at the touch and feeds the session's outgoing track through a
// delay line: until the connection the line only keeps what is said; on the session's
// start it plays from the touch, then catches up by jumping over the pauses (never
// over a word) until it is live. GPT-Live's data channel refuses the page's events, so
// what was said has to reach it as audio, on its own track.
//
// While eVe says one of her own sentences the line hears silence (`mute`): her voice,
// played by the native engine, would otherwise be answered by the model.
const FRAME_MS = 30;
// A frame louder than this (RMS of the samples, -1..1) is speech.
const VOICED_RMS = 0.02;
// Speech heard before the connection counts once it lasts this long (not a click).
const HEARD_MS = 300;
// A pause is jumped only past this margin, so a word's edges are never cut.
const PAUSE_MARGIN_S = 0.15;
const MAX_DELAY_S = 60;

export const openRealtimeEarlyInput = async ({ env = globalThis, deviceId = '', onLevel = () => {} } = {}) => {
    const stream = await env.navigator.mediaDevices.getUserMedia({ audio: {
        echoCancellation: true, noiseSuppression: true, ...(deviceId ? { deviceId: { exact: deviceId } } : {}) } }).catch(error => {
        if (error.name === 'NotAllowedError') throw new Error('realtime_microphone_denied');
        if (error.name === 'NotFoundError') throw new Error('realtime_input_device_lost');
        throw error;
    });
    const context = new (env.AudioContext || env.webkitAudioContext)();
    void context.resume?.();
    const source = context.createMediaStreamSource(stream);
    const gate = context.createGain(), delay = context.createDelay(MAX_DELAY_S);
    const analyser = context.createAnalyser(), output = context.createMediaStreamDestination();
    analyser.fftSize = 1024;
    source.connect(gate); gate.connect(analyser); gate.connect(delay); delay.connect(output);
    delay.delayTime.value = 0;
    const samples = new Float32Array(analyser.fftSize);
    const startedAt = context.currentTime;
    // One flag per frame since the touch: what the line still has to play is known.
    const frames = [];
    let live = true, voicedMs = 0, connected = false, lag = 0, closed = false;
    const voicedFrom = (from, to) => frames.some(frame => frame.at >= from && frame.at < to && frame.voiced);
    const setLag = (seconds, at) => { lag = seconds; delay.delayTime.setValueAtTime(seconds, at); };
    const heard = () => voicedMs >= HEARD_MS;
    const catchUp = () => {
        const now = context.currentTime;
        if (lag <= 0) { live = true; return; }
        const head = now - lag;
        // Inside a pause: jump to just before the next word (or to live if none yet).
        if (voicedFrom(head, head + PAUSE_MARGIN_S)) return;
        const next = frames.find(frame => frame.at >= head && frame.voiced);
        const target = next ? Math.max(0, now - next.at + PAUSE_MARGIN_S) : 0;
        if (target < lag) setLag(target, now);
    };
    const timer = env.setInterval(() => {
        analyser.getFloatTimeDomainData(samples);
        let energy = 0;
        for (const sample of samples) energy += sample * sample;
        const rms = Math.sqrt(energy / samples.length), voiced = rms > VOICED_RMS;
        frames.push({ at: context.currentTime, voiced });
        while (frames.length && frames[0].at < context.currentTime - MAX_DELAY_S) frames.shift();
        if (voiced && !connected) voicedMs += FRAME_MS;
        onLevel(Math.min(1, rms * 5));
        if (connected && !live) catchUp();
    }, FRAME_MS);
    return Object.freeze({
        stream, track: output.stream.getAudioTracks()[0],
        // Speech was heard before the session could listen: it is replayed, eVe answers it.
        heard,
        mute: muted => gate.gain.setValueAtTime(muted ? 0 : 1, context.currentTime),
        // The session listens: the line plays from the touch, or goes live at once if nothing was said.
        connected() {
            if (connected) return;
            connected = true;
            if (!heard()) return;
            live = false;
            setLag(Math.min(MAX_DELAY_S, context.currentTime - startedAt), context.currentTime);
        },
        close() {
            if (closed) return;
            closed = true; env.clearInterval(timer);
            stream.getTracks().forEach(track => track.stop());
            output.stream.getTracks().forEach(track => track.stop());
            void context.close();
        }
    });
};
