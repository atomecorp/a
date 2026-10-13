// Streaming openWakeWord front end shared by the in-app detector, the enrollment
// and the offline training: 16 kHz PCM (int16 scale) -> 32-bin mel frames ->
// 96-value speech embeddings -> one flattened window of the last 16 embeddings.
export const WAKE_SAMPLE_RATE = 16000;
export const WAKE_FRAME_SAMPLES = 1280;
export const WAKE_WINDOW_EMBEDDINGS = 16;
export const WAKE_EMBEDDING_SIZE = 96;
export const WAKE_WINDOW_SIZE = WAKE_WINDOW_EMBEDDINGS * WAKE_EMBEDDING_SIZE;

const MEL_CONTEXT_SAMPLES = 480;
const MEL_FRAMES_PER_FRAME = 8;
const MEL_WINDOW_FRAMES = 76;
const MEL_BINS = 32;

// The embedding model costs ~90 % of a frame (measured 6.8 of 7.5 ms on an M1 core).
// With `silenceGate`, a frame whose last second stays at the tracked noise floor reuses
// the previous embedding instead of recomputing it; mel history is always computed.
const GATE_HOLD_FRAMES = 12;
const GATE_RATIO = 1.6;
const GATE_FLOOR_RISE = 0.002;
// Digital silence has zero energy; a zero floor would then adopt the first sound heard.
const GATE_MIN_RMS = 1;

const frameRms = (frame) => {
    let energy = 0;
    for (let index = 0; index < frame.length; index += 1) energy += frame[index] * frame[index];
    return Math.sqrt(energy / frame.length);
};

export const createWakeFeatureStream = ({ ort, melSession, embeddingSession, silenceGate = false }) => {
    const melInput = new Float32Array(MEL_CONTEXT_SAMPLES + WAKE_FRAME_SAMPLES);
    // The reference implementation starts its mel history at 1, i.e. silence after scaling.
    const mel = new Float32Array(MEL_WINDOW_FRAMES * MEL_BINS).fill(1);
    const embeddings = new Float32Array(WAKE_WINDOW_SIZE);
    let filled = 0, floor = null, quietFrames = 0;
    // Loudest frame of the last second: a phrase spoken to the device stands far above the
    // room, an ambient or distant sound does not (wake_classifier.js#createWakeTrigger).
    const recent = new Float32Array(GATE_HOLD_FRAMES + 1);
    let recentIndex = 0;

    const quiet = (frame) => {
        const rms = Math.max(GATE_MIN_RMS, frameRms(frame));
        recent[recentIndex] = rms; recentIndex = (recentIndex + 1) % recent.length;
        floor = floor === null || rms < floor ? rms : floor + (rms - floor) * GATE_FLOOR_RISE;
        quietFrames = rms <= floor * GATE_RATIO ? quietFrames + 1 : 0;
        return silenceGate && filled === WAKE_WINDOW_EMBEDDINGS && quietFrames > GATE_HOLD_FRAMES;
    };

    const push = async (frame) => {
        if (frame.length !== WAKE_FRAME_SAMPLES) throw new Error('wake_frame_size_invalid');
        const skipEmbedding = quiet(frame);
        melInput.copyWithin(0, WAKE_FRAME_SAMPLES);
        melInput.set(frame, MEL_CONTEXT_SAMPLES);
        const melResult = await melSession.run({ [melSession.inputNames[0]]: new ort.Tensor('float32', melInput.slice(), [1, melInput.length]) });
        const frames = melResult[melSession.outputNames[0]].data;
        if (frames.length !== MEL_FRAMES_PER_FRAME * MEL_BINS) throw new Error('wake_mel_shape_invalid');
        mel.copyWithin(0, MEL_FRAMES_PER_FRAME * MEL_BINS);
        const tail = mel.length - frames.length;
        for (let index = 0; index < frames.length; index += 1) mel[tail + index] = frames[index] / 10 + 2;
        const latest = WAKE_WINDOW_SIZE - WAKE_EMBEDDING_SIZE;
        embeddings.copyWithin(0, WAKE_EMBEDDING_SIZE);
        if (skipEmbedding) {
            // Nothing can be said in a silent second: no window is scored either.
            embeddings.copyWithin(latest, latest - WAKE_EMBEDDING_SIZE, latest);
            return null;
        }
        const embeddingResult = await embeddingSession.run({ [embeddingSession.inputNames[0]]: new ort.Tensor('float32', mel.slice(), [1, MEL_WINDOW_FRAMES, MEL_BINS, 1]) });
        embeddings.set(embeddingResult[embeddingSession.outputNames[0]].data, latest);
        filled = Math.min(WAKE_WINDOW_EMBEDDINGS, filled + 1);
        // A window exists only once every embedding in it comes from real audio.
        return filled === WAKE_WINDOW_EMBEDDINGS ? embeddings.slice() : null;
    };

    const reset = () => { melInput.fill(0); mel.fill(1); embeddings.fill(0); filled = 0; floor = null; quietFrames = 0; recent.fill(0); recentIndex = 0; };
    // How far the loudest recent frame rises above the tracked noise floor.
    const voiceRatio = () => (floor ? Math.max(...recent) / floor : 0);
    return Object.freeze({ push, reset, voiceRatio });
};
