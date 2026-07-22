import assert from 'node:assert/strict';
import vm from 'node:vm';
import { afterEach, test, vi } from 'vitest';
import { createAudioRecord } from '../../eVe/domains/media/api/audio_core_record.js';
import { createAudioStorage } from '../../eVe/domains/media/api/audio_core_storage.js';
import {
    clearLatestRecordingScopeFrame,
    rememberRecordingScopeFrame
} from '../../atome/src/application/audio_runtime/record_audio_scope_transport.js';

const createApiContext = () => ({
    getFastifyBaseUrl: () => '',
    buildAuthHeaders: () => ({}),
    isBrowser: () => true,
    isOnline: () => true,
    getQueue: () => [],
    isTauriRuntime: () => false,
    getCurrentUserInfo: vi.fn(async () => ({ ok: false })),
    persistRecordingLocally: vi.fn(async () => ({
        id: 'recording-id', createdAt: '2026-07-19T00:00:00.000Z', backend: 'idb'
    })),
    markJobDone: vi.fn(),
    enqueueUpload: vi.fn()
});

const installAudioBrowser = ({ sampleRate = 48000, onFlush = null, getUserMedia = null } = {}) => {
    const track = { stop: vi.fn() };
    const stream = { getTracks: () => [track] };
    const source = { connect: vi.fn(), disconnect: vi.fn() };
    const gain = { gain: { value: 1 }, connect: vi.fn(), disconnect: vi.fn() };
    let workletBlob = null;
    let audioContext = null;
    let workletNode = null;

    class FakeAudioContext {
        constructor() {
            this.sampleRate = sampleRate;
            this.currentTime = 0.25;
            this.state = 'running';
            this.destination = {};
            this.audioWorklet = { addModule: vi.fn(async () => {}) };
            this.close = vi.fn(async () => { this.state = 'closed'; });
            this.resume = vi.fn(async () => { this.state = 'running'; });
            audioContext = this;
        }
        createMediaStreamSource() { return source; }
        createGain() { return gain; }
    }

    class FakeAudioWorkletNode {
        constructor() {
            this.connect = vi.fn();
            this.disconnect = vi.fn();
            this.port = {
                onmessage: null,
                postMessage: vi.fn((message) => {
                    if (message?.type === 'flush' && onFlush) {
                        onFlush({ node: this, request: message, sampleRate });
                    }
                })
            };
            workletNode = this;
        }
    }

    const mediaDevices = { getUserMedia: vi.fn(getUserMedia || (async () => stream)) };
    const fakeWindow = {
        navigator: { mediaDevices },
        AudioContext: FakeAudioContext,
        AudioWorkletNode: FakeAudioWorkletNode,
        WebAssembly: globalThis.WebAssembly,
        location: { protocol: 'http:', hostname: 'localhost' }
    };
    vi.stubGlobal('window', fakeWindow);
    vi.stubGlobal('navigator', fakeWindow.navigator);
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {}, removeItem: () => {} });
    vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
        workletBlob = blob;
        return 'blob:audio-recorder-contract';
    });
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    return {
        track, stream, source, gain, mediaDevices,
        get context() { return audioContext; },
        get node() { return workletNode; },
        get blob() { return workletBlob; }
    };
};

const emit = (node, data) => node.port.onmessage?.({ data });

const emitContinuousCapture = ({ node, request, sampleRate }) => {
    emit(node, {
        type: 'chunk', sequence: 0, sample_rate: sampleRate,
        start_frame: 1000, end_frame_exclusive: 1004, frame_count: 4,
        pcm: new Float32Array([0.25, -0.25, 0.5, 0.1])
    });
    emit(node, {
        type: 'chunk', sequence: 1, sample_rate: sampleRate,
        start_frame: 1004, end_frame_exclusive: 1007, frame_count: 3,
        pcm: new Float32Array([0.3, 0.2, -0.2])
    });
    emit(node, {
        type: 'flush_ack', request_id: request.request_id, sample_rate: sampleRate,
        first_frame: 1000, last_frame_exclusive: 1007, total_frames: 7,
        chunk_count: 2, flush_frame: 1024, context_time: 1024 / sampleRate
    });
};

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

test('browser capture flushes every frame and preserves the AudioContext sample rate', async () => {
    const browser = installAudioBrowser({ onFlush: emitContinuousCapture });
    const ctx = createApiContext();
    const controller = await createAudioRecord(ctx).record_audio('take.wav');

    const firstStop = controller.stop();
    const repeatedStop = controller.stop();
    assert.equal(firstStop, repeatedStop);
    assert.equal(controller.getStats().totalFrames, 7);

    const result = await firstStop;
    const persisted = ctx.persistRecordingLocally.mock.calls[0][0];
    const wav = new DataView(persisted.wavArrayBuffer);
    assert.equal(result.sample_rate, 48000);
    assert.equal(result.frame_count, 7);
    assert.equal(result.duration_sec, 7 / 48000);
    assert.equal(wav.getUint32(24, true), 48000);
    assert.equal(wav.getUint32(40, true), 14);
    assert.equal(persisted.sampleRate, 48000);
    assert.equal(persisted.durationSec, 7 / 48000);
    assert.equal(result.first_audio_worklet_frame, 1000);
    assert.equal(result.last_audio_worklet_frame, 1006);
    assert.equal(result.capture_clock.last_frame_exclusive, 1007);
    assert.equal(result.capture_clock.shared_with_kira, false);
    assert.equal(result.sample_accurate_overdub, false);
    assert.equal(result.overdub_capability.sample_accurate, false);
    assert.equal(browser.node.port.postMessage.mock.calls.length, 1);
    assert.equal(browser.track.stop.mock.calls.length, 1);
    assert.equal(browser.context.close.mock.calls.length, 1);
    assert.equal(URL.revokeObjectURL.mock.calls.length, 1);
    assert.equal(controller.stop(), firstStop);
});

test('WebKit creates and resumes AudioContext before microphone permission resolves', async () => {
    let resolveMicrophone = null;
    const browser = installAudioBrowser({
        onFlush: emitContinuousCapture,
        getUserMedia: () => new Promise((resolve) => { resolveMicrophone = resolve; })
    });
    const pendingController = createAudioRecord(createApiContext()).record_audio('webkit-gesture.wav');

    await Promise.resolve();
    assert.ok(browser.context, 'AudioContext must remain in the activating user gesture');
    assert.equal(browser.mediaDevices.getUserMedia.mock.calls.length, 1);

    resolveMicrophone(browser.stream);
    const controller = await pendingController;
    await controller.stop({ discard: true });
    assert.equal(browser.context.close.mock.calls.length, 1);
});

test('browser audio releases a completed session for a distinct second take', async () => {
    const browser = installAudioBrowser({ onFlush: emitContinuousCapture });
    const ctx = createApiContext();
    const audio = createAudioRecord(ctx);
    const scopeFrames = [];

    const first = await audio.record_audio('first-take.wav');
    first.subscribeScope((frame) => scopeFrames.push({ take: 1, sequence: frame.sequence }));
    const firstResult = await first.stop();

    const second = await audio.record_audio('second-take.wav');
    second.subscribeScope((frame) => scopeFrames.push({ take: 2, sequence: frame.sequence }));
    const secondResult = await second.stop();

    assert.equal(firstResult.frame_count, 7);
    assert.equal(secondResult.frame_count, 7);
    assert.equal(ctx.persistRecordingLocally.mock.calls.length, 2);
    assert.deepEqual(scopeFrames.map((entry) => entry.take), [1, 1, 2, 2]);
    assert.equal(browser.track.stop.mock.calls.length, 2);
});

test('the AudioWorklet protocol emits the partial tail before acknowledging flush', async () => {
    const browser = installAudioBrowser({ onFlush: emitContinuousCapture });
    const controller = await createAudioRecord(createApiContext()).record_audio('tail.wav');
    const source = await browser.blob.text();
    const posted = [];
    let Processor = null;
    const sandbox = {
        sampleRate: 48000,
        currentFrame: 2048,
        currentTime: 2048 / 48000,
        Float32Array,
        Math,
        Number,
        AudioWorkletProcessor: class {
            constructor() {
                this.port = { onmessage: null, postMessage: (message, transfer) => posted.push({ message, transfer }) };
            }
        },
        registerProcessor: (_name, implementation) => { Processor = implementation; }
    };
    vm.runInNewContext(source, sandbox);
    const processor = new Processor({ processorOptions: { chunkSec: 0.02 } });
    processor.process([[new Float32Array([0.1, 0.2, 0.3])]]);
    sandbox.currentFrame = 2176;
    sandbox.currentTime = 2176 / 48000;
    processor.port.onmessage({ data: { type: 'flush', request_id: 'tail-1' } });

    assert.equal(posted.length, 2);
    assert.equal(posted[0].message.type, 'chunk');
    assert.equal(posted[0].message.pcm.length, 3);
    assert.equal(posted[0].message.start_frame, 2048);
    assert.equal(posted[0].message.end_frame_exclusive, 2051);
    assert.equal(posted[1].message.type, 'flush_ack');
    assert.equal(posted[1].message.total_frames, 3);
    assert.equal(posted[1].message.flush_frame, 2176);

    processor.port.onmessage({ data: { type: 'flush', request_id: 'tail-2' } });
    assert.equal(posted.length, 3);
    assert.equal(posted[2].message.type, 'flush_ack');
    assert.equal(posted[2].message.request_id, 'tail-2');

    const startupProcessor = new Processor({ processorOptions: { chunkSec: 0.02 } });
    sandbox.currentFrame = 3000;
    startupProcessor.process([[new Float32Array([0.1, 0.2])]]);
    sandbox.currentFrame = 3003;
    startupProcessor.process([[new Float32Array([0.3, 0.4])]]);
    startupProcessor.port.onmessage({ data: { type: 'flush', request_id: 'startup-1' } });
    assert.equal(posted[3].message.type, 'chunk');
    assert.equal(posted[3].message.start_frame, 3003);
    assert.equal(posted[3].message.frame_count, 2);
    assert.equal(posted[4].message.type, 'flush_ack');
    assert.equal(posted[4].message.total_frames, 2);

    const gapProcessor = new Processor({ processorOptions: { chunkSec: 0.02 } });
    sandbox.currentFrame = 4000;
    gapProcessor.process([[new Float32Array(960)]]);
    sandbox.currentFrame = 4961;
    gapProcessor.process([[new Float32Array([0.3, 0.4])]]);
    assert.equal(posted[6].message.type, 'protocol_error');
    assert.equal(posted[6].message.expected_frame, 4960);
    assert.equal(posted[6].message.received_frame, 4961);
    await controller.stop({ discard: true });
});

test('flush timeout is typed and retains capture ownership for a successful retry', async () => {
    let flushCount = 0;
    const browser = installAudioBrowser({
        onFlush: (detail) => {
            flushCount += 1;
            if (flushCount === 2) emitContinuousCapture(detail);
        }
    });
    const ctx = createApiContext();
    const controller = await createAudioRecord(ctx).record_audio('timeout.wav', null, { timeoutMs: 5 });
    const stopPromise = controller.stop();
    assert.equal(controller.stop(), stopPromise);

    await assert.rejects(stopPromise, (error) => error?.code === 'audio_recording_flush_timeout');
    assert.equal(controller.state, 'recording');
    assert.equal(browser.node.port.postMessage.mock.calls.length, 1);
    assert.equal(browser.track.stop.mock.calls.length, 0);
    assert.equal(browser.context.close.mock.calls.length, 0);
    assert.equal(ctx.persistRecordingLocally.mock.calls.length, 0);

    const retry = controller.stop({ discard: true });
    assert.notEqual(retry, stopPromise);
    const result = await retry;
    assert.equal(result.discarded, true);
    assert.equal(controller.state, 'stopped');
    assert.equal(browser.node.port.postMessage.mock.calls.length, 2);
    assert.equal(browser.track.stop.mock.calls.length, 1);
    assert.equal(browser.context.close.mock.calls.length, 1);
});

test('a missing AudioWorklet frame is rejected instead of producing a silently desynchronised take', async () => {
    const browser = installAudioBrowser({
        onFlush: ({ node, request, sampleRate }) => {
            emit(node, {
                type: 'chunk', sequence: 0, sample_rate: sampleRate,
                start_frame: 40, end_frame_exclusive: 42, frame_count: 2,
                pcm: new Float32Array([0.2, 0.3])
            });
            emit(node, {
                type: 'chunk', sequence: 1, sample_rate: sampleRate,
                start_frame: 43, end_frame_exclusive: 45, frame_count: 2,
                pcm: new Float32Array([0.2, 0.3])
            });
            emit(node, {
                type: 'flush_ack', request_id: request.request_id, sample_rate: sampleRate,
                first_frame: 40, last_frame_exclusive: 45, total_frames: 4,
                chunk_count: 2, flush_frame: 128, context_time: 128 / sampleRate
            });
        }
    });
    const ctx = createApiContext();
    const audio = createAudioRecord(ctx);
    const controller = await audio.record_audio('gap.wav');

    await assert.rejects(
        controller.stop(),
        (error) => error?.code === 'audio_recording_frame_discontinuity' && error.recordingTerminal === true
    );
    assert.equal(browser.track.stop.mock.calls.length, 1);
    assert.equal(browser.context.close.mock.calls.length, 1);
    assert.equal(ctx.persistRecordingLocally.mock.calls.length, 0);
    assert.equal((await controller.stop({ discard: true })).discarded, true);
    assert.equal(controller.state, 'stopped');

    const next = await audio.record_audio('after-gap.wav');
    assert.equal((await next.stop({ discard: true })).discarded, true);
});

test('native discard physically deletes the consumed WAV and retries deletion without stopping twice', async () => {
    let stopCalls = 0;
    let deleteCalls = 0;
    let rejectDelete = true;
    const fakeWindow = {
        __AUV3_MODE__: true,
        webkit: { messageHandlers: { swiftBridge: {} } },
        record_start: () => {},
        record_stop: () => {},
        AtomeFileSystem: {
            deleteFile: (path, callback) => {
                deleteCalls += 1;
                assert.equal(path, 'data/users/u/recordings/native.wav');
                callback(rejectDelete ? { success: false, error: 'busy' } : { success: true });
            }
        }
    };
    Object.defineProperty(fakeWindow, '__SQUIRREL_PLAY_RECORD_CORE__', {
        value: {
            recordStart: async () => 'native_discard_session',
            recordStop: async () => {
                stopCalls += 1;
                return { file_path: 'data/users/u/recordings/native.wav' };
            }
        }
    });
    vi.stubGlobal('window', fakeWindow);
    const ctx = createApiContext();
    Object.assign(ctx, createAudioStorage(ctx));
    const controller = await createAudioRecord(ctx).record_audio('native.wav');

    await assert.rejects(
        controller.stop({ discard: true }),
        (error) => error?.code === 'audio_recording_terminal_discard_failed'
    );
    assert.equal(controller.state, 'finalization_failed');
    assert.equal(stopCalls, 1);
    rejectDelete = false;
    assert.equal((await controller.stop({ discard: true })).discarded, true);
    assert.equal(stopCalls, 1);
    assert.equal(deleteCalls, 2);
});

test('native audio terminal with no decodable samples never reaches persistence', async () => {
    const fakeWindow = {
        __AUV3_MODE__: true,
        webkit: { messageHandlers: { swiftBridge: {} } },
        record_start: () => {},
        record_stop: () => {}
    };
    Object.defineProperty(fakeWindow, '__SQUIRREL_PLAY_RECORD_CORE__', {
        value: {
            recordStart: async () => 'native_empty_session',
            recordStop: async () => ({
                file_path: 'data/users/u/recordings/empty.wav',
                duration_sec: 0,
                frame_count: 0,
                sample_rate: 48_000,
                size_bytes: 0
            })
        }
    });
    vi.stubGlobal('window', fakeWindow);
    const ctx = createApiContext();
    const controller = await createAudioRecord(ctx).record_audio('empty.wav');

    await assert.rejects(controller.stop(), (error) => error?.code === 'audio_recording_native_viability_invalid');
    assert.equal(ctx.persistRecordingLocally.mock.calls.length, 0);
    assert.equal(ctx.enqueueUpload.mock.calls.length, 0);
});

test('native exact terminal result stays owned until its physical cleanup succeeds', async () => {
    let stopCalls = 0;
    let deletedPath = '';
    const fakeWindow = {
        __AUV3_MODE__: true,
        webkit: { messageHandlers: { swiftBridge: {} } },
        record_start: () => {},
        record_stop: () => {},
        AtomeFileSystem: {
            deleteFile: (path, callback) => {
                deletedPath = path;
                callback({ success: true });
            }
        }
    };
    Object.defineProperty(fakeWindow, '__SQUIRREL_PLAY_RECORD_CORE__', {
        value: {
            recordStart: async () => 'native_terminal_session',
            recordStop: async () => {
                stopCalls += 1;
                const error = new Error('av_recording_discontinuity');
                error.code = 'av_recording_discontinuity';
                error.recordingTerminal = true;
                error.recordingResult = { file_path: 'data/users/u/recordings/invalid.wav' };
                throw error;
            }
        }
    });
    vi.stubGlobal('window', fakeWindow);
    const ctx = createApiContext();
    Object.assign(ctx, createAudioStorage(ctx));
    const controller = await createAudioRecord(ctx).record_audio('invalid.wav');

    await assert.rejects(controller.stop(), (error) => error.recordingTerminal === true);
    assert.equal(controller.state, 'finalization_failed');
    assert.equal((await controller.stop({ discard: true })).discarded, true);
    assert.equal(deletedPath, 'data/users/u/recordings/invalid.wav');
    assert.equal(stopCalls, 1);
});

test('native scope produced before subscription is replayed once and stale frames are rejected', async () => {
    const eventTarget = new EventTarget();
    const fakeWindow = {
        __AUV3_MODE__: true,
        webkit: { messageHandlers: { swiftBridge: {} } },
        record_start: () => {},
        record_stop: () => {},
        addEventListener: eventTarget.addEventListener.bind(eventTarget),
        removeEventListener: eventTarget.removeEventListener.bind(eventTarget),
        dispatchEvent: eventTarget.dispatchEvent.bind(eventTarget)
    };
    Object.defineProperty(fakeWindow, '__SQUIRREL_PLAY_RECORD_CORE__', {
        value: {
            recordStart: async () => 'early_scope_session',
            recordStop: async () => ({ file_path: 'data/users/u/recordings/early.wav' })
        }
    });
    rememberRecordingScopeFrame({
        type: 'audio_scope', sequence: 9, sample_rate: 48_000, channels: 1,
        pairs: Array.from({ length: 64 }, () => [-0.25, 0.25]), rms: 0.1, peak: 0.25
    }, 'early_scope_session');
    vi.stubGlobal('window', fakeWindow);
    const controller = await createAudioRecord(createApiContext()).record_audio('early.wav');
    const received = [];
    const unsubscribe = controller.subscribeScope((frame) => received.push(frame.sequence));
    assert.deepEqual(received, [9]);
    const stale = new Event('native_audio_scope');
    Object.defineProperty(stale, 'detail', { value: {
        type: 'audio_scope', session_id: 'early_scope_session', sequence: 8,
        sample_rate: 48_000, channels: 1,
        pairs: Array.from({ length: 64 }, () => [-1, 1]), rms: 1, peak: 1
    } });
    fakeWindow.dispatchEvent(stale);
    assert.deepEqual(received, [9]);
    unsubscribe();
    clearLatestRecordingScopeFrame('early_scope_session');
});
