import { test, expect, vi } from 'vitest';
import { runWakeEnrollment, WAKE_ENROLLMENT_TAKES } from '../../atome/src/squirrel/voice/wake_enrollment.js';

// A collector that emits one window per 80 ms; `script(step)` decides what the user "says" next.
const harness = ({ phraseScore = 0.4 } = {}) => {
    let onWindow, timer = null, current = 'silence';
    const windows = { phrase: () => ({ window: Float32Array.of(1, 1), baseScore: phraseScore }),
        speech: () => ({ window: Float32Array.of(-1, 0.5), baseScore: 0.001 }), silence: () => ({ window: Float32Array.of(-1, -1), baseScore: 0 }) };
    const collector = { start: vi.fn(async () => { timer = setInterval(() => onWindow(windows[current]()), 80); }), close: vi.fn(async () => clearInterval(timer)) };
    const backend = { openCollector: vi.fn(async (handlers) => { onWindow = handlers.onWindow; return collector; }), storeVerifier: vi.fn(async () => {}) };
    const steps = [];
    const prompt = vi.fn(async (step) => {
        steps.push(step);
        current = step === 'say' || step === 'repeat' ? 'phrase' : step === 'speak_freely' ? 'speech' : 'silence';
    });
    return { backend, collector, prompt, steps };
};
const train = vi.fn(() => ({ mean: Float32Array.of(0, 0), scale: Float32Array.of(1, 1),
    layers: [{ inputs: 2, outputs: 1, weights: Float32Array.of(5, 5), bias: Float32Array.of(0) }] }));

test('enrollment asks for the phrase 4 times, then free speech and silence, and stores the verifier', async () => {
    vi.useFakeTimers();
    const h = harness();
    const running = runWakeEnrollment({ backend: h.backend, prompt: h.prompt, train });
    await vi.advanceTimersByTimeAsync(60000);
    const result = await running;
    expect(result.ok).toBe(true);
    expect(h.steps).toEqual(['intro', ...Array(WAKE_ENROLLMENT_TAKES).fill('say'), 'speak_freely', 'silence', 'training', 'done']);
    expect(train.mock.calls[0][0].hidden).toEqual([]);
    expect(h.backend.storeVerifier).toHaveBeenCalledTimes(1);
    expect(h.collector.close).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
});

test('a take without the phrase is repeated, then enrollment stops explicitly and stores nothing', async () => {
    vi.useFakeTimers();
    const h = harness({ phraseScore: 0 });
    const running = runWakeEnrollment({ backend: h.backend, prompt: h.prompt, train }).catch(error => error);
    await vi.advanceTimersByTimeAsync(60000);
    expect((await running).message).toBe('wake_enrollment_phrase_not_heard');
    expect(h.steps).toEqual(['intro', 'say', 'repeat', 'repeat']);
    expect(h.backend.storeVerifier).not.toHaveBeenCalled();
    expect(h.collector.close).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
});

test('cancelling releases the microphone at once', async () => {
    vi.useFakeTimers();
    const h = harness(), controller = new AbortController();
    const running = runWakeEnrollment({ backend: h.backend, prompt: h.prompt, train, signal: controller.signal }).catch(error => error);
    await vi.advanceTimersByTimeAsync(1000); controller.abort(); await vi.advanceTimersByTimeAsync(300);
    expect((await running).message).toBe('wake_enrollment_cancelled');
    expect(h.collector.close).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
});
