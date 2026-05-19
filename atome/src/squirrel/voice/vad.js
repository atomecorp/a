const DEFAULT_THRESHOLD = 0.02;
const DEFAULT_MIN_SPEECH_FRAMES = 2;
const DEFAULT_RELEASE_FRAMES = 4;

const computeRms = (frame) => {
    const values = ArrayBuffer.isView(frame) ? frame : Array.isArray(frame) ? frame : [];
    if (!values.length) return 0;
    let sum = 0;
    for (let index = 0; index < values.length; index += 1) {
        const sample = Number(values[index] || 0);
        sum += sample * sample;
    }
    return Math.sqrt(sum / values.length);
};

export const createVoiceActivityDetector = ({
    threshold = DEFAULT_THRESHOLD,
    minSpeechFrames = DEFAULT_MIN_SPEECH_FRAMES,
    releaseFrames = DEFAULT_RELEASE_FRAMES,
    sessionRuntime = null,
    session_id = null,
    onEvent = null
} = {}) => {
    let frameIndex = 0;
    let speechFrames = 0;
    let silenceFrames = 0;
    let state = 'silence';
    let lastRms = 0;

    const emit = (type, payload) => {
        const event = {
            type,
            payload
        };
        if (typeof onEvent === 'function') {
            onEvent(event);
        }
        if (sessionRuntime && session_id && typeof sessionRuntime.publishEvent === 'function') {
            sessionRuntime.publishEvent(session_id, type, payload);
        }
        return event;
    };

    return {
        push(frame) {
            frameIndex += 1;
            lastRms = computeRms(frame);
            const aboveThreshold = lastRms >= threshold;

            if (aboveThreshold) {
                speechFrames += 1;
                silenceFrames = 0;
            } else {
                silenceFrames += 1;
                if (state === 'silence') {
                    speechFrames = 0;
                }
            }

            if (state === 'silence' && speechFrames >= minSpeechFrames) {
                state = 'speech';
                emit('voice.vad.state', {
                    state,
                    rms: lastRms,
                    threshold,
                    frame_index: frameIndex
                });
            } else if (state === 'speech' && silenceFrames >= releaseFrames) {
                state = 'silence';
                speechFrames = 0;
                emit('voice.vad.state', {
                    state,
                    rms: lastRms,
                    threshold,
                    frame_index: frameIndex
                });
            }

            return {
                state,
                rms: lastRms,
                threshold,
                frame_index: frameIndex,
                above_threshold: aboveThreshold
            };
        },
        reset() {
            frameIndex = 0;
            speechFrames = 0;
            silenceFrames = 0;
            state = 'silence';
            lastRms = 0;
        },
        getState() {
            return {
                state,
                rms: lastRms,
                threshold,
                frame_index: frameIndex
            };
        }
    };
};
