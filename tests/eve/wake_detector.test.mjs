import { test, expect, vi } from 'vitest';
import { createWakeDetectorBackend } from '../../atome/src/squirrel/voice/wake_detector.js';

// A fake module worker answering the engine protocol.
const harness = ({ failInit = false } = {}) => {
    const workers = [];
    const workerFactory = () => {
        const worker = { messages: [], terminated: false, onmessage: null, onerror: null,
            postMessage(message) {
                this.messages.push(message.type);
                queueMicrotask(() => {
                    if (message.type === 'init') this.onmessage({ data: failInit ? { type: 'error', error: 'wake_model_missing' } : { type: 'ready' } });
                    if (message.type === 'configure') this.onmessage({ data: { type: 'configured' } });
                });
            },
            terminate() { this.terminated = true; } };
        workers.push(worker);
        return worker;
    };
    const backend = createWakeDetectorBackend({ env: {}, workerFactory, loadProfile: async () => ({ ok: false }),
        security: { vaultStatus: () => ({ configured: false }) } });
    return { backend, workers };
};

test('detection and enrollment reuse one engine instead of a second ONNX instance', async () => {
    const { backend, workers } = harness();
    const detection = await backend.create({ onDetection: () => {}, onError: () => {} });
    await detection.close();
    const collector = await backend.openCollector({ onWindow: () => {}, onError: () => {} });
    await collector.close();
    await backend.create({ onDetection: () => {}, onError: () => {} });
    expect(workers).toHaveLength(1);
    expect(workers[0].messages).toEqual(['init', 'configure', 'idle', 'configure', 'idle', 'configure']);
});

test('only one session at a time; detections reach the open session only', async () => {
    const { backend, workers } = harness();
    const onDetection = vi.fn();
    const session = await backend.create({ onDetection, onError: () => {} });
    await expect(backend.openCollector({ onWindow: () => {}, onError: () => {} })).rejects.toThrow('wake_engine_busy');
    workers[0].onmessage({ data: { type: 'detected', score: 1 } });
    await session.close();
    workers[0].onmessage({ data: { type: 'detected', score: 1 } });
    expect(onDetection).toHaveBeenCalledTimes(1);
});

test('release and fatal errors free the engine; the next session starts a new one', async () => {
    const { backend, workers } = harness();
    const onError = vi.fn();
    await backend.create({ onDetection: () => {}, onError });
    workers[0].onmessage({ data: { type: 'error', error: 'wake_engine_failed' } });
    expect(onError).toHaveBeenCalledWith(new Error('wake_engine_failed'));
    expect(workers[0].terminated).toBe(true);
    await backend.create({ onDetection: () => {}, onError: () => {} });
    backend.release();
    expect(workers).toHaveLength(2);
    expect(workers[1].terminated).toBe(true);
    await expect(harness({ failInit: true }).backend.create({ onDetection: () => {}, onError: () => {} })).rejects.toThrow('wake_model_missing');
});
