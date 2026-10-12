import { trainWakeClassifier, scoreWakeWindow, serializeWakeClassifier } from './wake_classifier.js';

// openWakeWord custom-verifier recipe: at least 3 takes of the phrase (kept few, the
// verifier is a logistic regression), ~10 s of other speech and ~5 s of the room.
export const WAKE_ENROLLMENT_TAKES = 4;
const TAKE_LISTEN_MS = 3500;
const FREE_SPEECH_MS = 10000;
const AMBIENT_MS = 5000;
const MAX_RETRIES_PER_TAKE = 2;
// Below this base score the take most likely did not contain the phrase.
const TAKE_MIN_SCORE = 0.02;
const POSITIVE_WINDOWS_PER_TAKE = 3;


// `prompt(step, detail)` speaks and shows one instruction and resolves once it has been
// said, so the microphone never records the instruction itself. `signal` cancels at the
// next instruction or within a quarter of a second while listening.
export const runWakeEnrollment = async ({ backend, prompt: say, signal = null, train = trainWakeClassifier }) => {
    let accepting = false, buffer = [], failure = null;
    const checkCancelled = () => { if (signal?.aborted) throw new Error('wake_enrollment_cancelled'); };
    const prompt = async (step, detail) => { checkCancelled(); await say(step, detail); checkCancelled(); };
    const collector = await backend.openCollector({
        onWindow: ({ window, baseScore }) => { if (accepting) buffer.push({ window, baseScore }); },
        onError: error => { failure = error; }
    });
    const listen = async (ms) => {
        buffer = []; accepting = true;
        for (let elapsed = 0; elapsed < ms; elapsed += 250) { await new Promise(resolve => setTimeout(resolve, 250)); checkCancelled(); }
        accepting = false;
        if (failure) throw failure;
        return buffer;
    };
    try {
        await collector.start();
        await prompt('intro', { takes: WAKE_ENROLLMENT_TAKES });
        const positives = [];
        for (let take = 1; take <= WAKE_ENROLLMENT_TAKES; take += 1) {
            for (let attempt = 0; ; attempt += 1) {
                await prompt(attempt ? 'repeat' : 'say', { take, takes: WAKE_ENROLLMENT_TAKES });
                const windows = (await listen(TAKE_LISTEN_MS)).sort((a, b) => b.baseScore - a.baseScore);
                if (windows[0]?.baseScore >= TAKE_MIN_SCORE) { positives.push(...windows.slice(0, POSITIVE_WINDOWS_PER_TAKE).map(entry => entry.window)); break; }
                if (attempt === MAX_RETRIES_PER_TAKE) throw new Error('wake_enrollment_phrase_not_heard');
            }
        }
        await prompt('speak_freely', { seconds: FREE_SPEECH_MS / 1000 });
        const negatives = (await listen(FREE_SPEECH_MS)).map(entry => entry.window);
        await prompt('silence', { seconds: AMBIENT_MS / 1000 });
        negatives.push(...(await listen(AMBIENT_MS)).map(entry => entry.window));
        if (negatives.length < 20) throw new Error('wake_enrollment_audio_missing');
        await prompt('training', {});
        const model = train({ positives, negatives, hidden: [], epochs: 150, batchSize: 16, learningRate: 0.01,
            weightDecay: 1e-3, negativeWeight: positives.length / negatives.length, seed: 7 });
        // The verifier must accept the user's own takes and refuse the user's other speech.
        const accepted = positives.filter(window => scoreWakeWindow(model, window) >= 0.5).length;
        const refused = negatives.filter(window => scoreWakeWindow(model, window) < 0.5).length;
        if (accepted < positives.length * 0.75 || refused < negatives.length * 0.95) throw new Error('wake_enrollment_inconsistent');
        await backend.storeVerifier(serializeWakeClassifier(model, { version: 1, takes: WAKE_ENROLLMENT_TAKES }));
        await prompt('done', {});
        return { ok: true, positives: positives.length, negatives: negatives.length };
    } finally {
        accepting = false;
        await collector.close();
    }
};
