const toText = (value) => String(value || '').trim();

const resolveMediaDevices = (env) => env?.navigator?.mediaDevices || null;

const resolveAudioConstraints = (env) => {
    const override = env?.__EVE_VOICE_METER_AUDIO_CONSTRAINTS;
    if (override && typeof override === 'object') {
        return override;
    }
    return {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1
    };
};

const getCanvasContext = (canvas) => {
    try {
        return canvas.getContext('2d');
    } catch (_) {
        return null;
    }
};

export const mountVoiceMeter = ({
    env = globalThis,
    canvas,
    onFrame = null
} = {}) => {
    if (!env?.document || !(canvas instanceof env.HTMLCanvasElement)) {
        return null;
    }

    let stream = null;
    let audioContext = null;
    let source = null;
    let analyser = null;
    let buffer = null;
    let normalizedFrame = null;
    let rafId = 0;
    let running = false;

    const drawIdle = () => {
        const width = Math.max(48, canvas.clientWidth || 96);
        const height = Math.max(20, canvas.clientHeight || 28);
        if (canvas.width !== width) canvas.width = width;
        if (canvas.height !== height) canvas.height = height;
        const ctx = getCanvasContext(canvas);
        if (!ctx) return;
        ctx.clearRect(0, 0, width, height);
        ctx.fillStyle = 'rgba(255,255,255,0.06)';
        ctx.fillRect(0, 0, width, height);
        ctx.strokeStyle = 'rgba(255,255,255,0.12)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, height / 2);
        ctx.lineTo(width, height / 2);
        ctx.stroke();
    };

    const render = () => {
        if (!running || !analyser || !buffer) {
            drawIdle();
            return;
        }
        const width = Math.max(48, canvas.clientWidth || 96);
        const height = Math.max(20, canvas.clientHeight || 28);
        if (canvas.width !== width) canvas.width = width;
        if (canvas.height !== height) canvas.height = height;
        const ctx = getCanvasContext(canvas);
        if (!ctx) return;
        analyser.getByteTimeDomainData(buffer);
        if (typeof onFrame === 'function') {
            if (!normalizedFrame || normalizedFrame.length !== buffer.length) {
                normalizedFrame = new Float32Array(buffer.length);
            }
            for (let index = 0; index < buffer.length; index += 1) {
                normalizedFrame[index] = (buffer[index] - 128) / 128;
            }
            try {
                onFrame(normalizedFrame);
            } catch (_) {
                // Ignore external meter hook failures.
            }
        }
        ctx.clearRect(0, 0, width, height);
        ctx.fillStyle = 'rgba(255,255,255,0.04)';
        ctx.fillRect(0, 0, width, height);
        ctx.strokeStyle = 'rgba(103, 232, 249, 0.92)';
        ctx.lineWidth = 1.25;
        ctx.beginPath();
        const mid = height * 0.5;
        const step = buffer.length > 1 ? width / (buffer.length - 1) : width;
        for (let index = 0; index < buffer.length; index += 1) {
            const normalized = (buffer[index] - 128) / 128;
            const x = index * step;
            const y = mid + (normalized * mid * 0.72);
            if (index === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.stroke();
        rafId = env.requestAnimationFrame(render);
    };

    const stop = async () => {
        running = false;
        if (rafId) {
            env.cancelAnimationFrame?.(rafId);
            rafId = 0;
        }
        source?.disconnect?.();
        analyser?.disconnect?.();
        if (stream) {
            
                stream.getTracks?.().forEach((track) => track.stop?.());
            
        }
        if (audioContext && typeof audioContext.close === 'function') {
            await audioContext.close();
        }
        stream = null;
        audioContext = null;
        source = null;
        analyser = null;
        buffer = null;
        normalizedFrame = null;
        drawIdle();
    };

    const start = async () => {
        const mediaDevices = resolveMediaDevices(env);
        if (!mediaDevices || typeof mediaDevices.getUserMedia !== 'function') {
            throw new Error('microphone_unavailable');
        }
        await stop();
        stream = await mediaDevices.getUserMedia({
            audio: resolveAudioConstraints(env)
        });
        const AudioCtx = env.AudioContext || env.webkitAudioContext;
        if (typeof AudioCtx !== 'function') {
            throw new Error('audio_context_unavailable');
        }
        audioContext = new AudioCtx();
        source = audioContext.createMediaStreamSource(stream);
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 512;
        analyser.smoothingTimeConstant = 0.85;
        source.connect(analyser);
        buffer = new Uint8Array(analyser.fftSize);
        running = true;
        render();
        return true;
    };

    drawIdle();

    return {
        async start() {
            return start();
        },
        async stop() {
            return stop();
        },
        getState() {
            return {
                running,
                hasStream: !!stream
            };
        },
        debugLabel() {
            return toText(running ? 'running' : 'idle');
        }
    };
};
