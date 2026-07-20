import assert from 'node:assert/strict';
import { afterEach, test, vi } from 'vitest';

const createVideoStateMock = () => {
    const videoState = {
        ctrl: null,
        fileName: null,
        projectAtomeId: null,
        pending: false,
        stream: null
    };
    return {
        videoState,
        clearVideoRecordingState: () => {
            videoState.ctrl = null;
            videoState.fileName = null;
            videoState.projectAtomeId = null;
            videoState.stream = null;
        },
        DEFAULT_SLICE_MS: 100,
        getIosNativeInvoke: () => null,
        isIosNativeAppRuntime: () => false
    };
};

const installBrowser = ({ getUserMedia, MediaRecorder }) => {
    vi.stubGlobal('document', {});
    vi.stubGlobal('window', {
        setTimeout,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn()
    });
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });
    vi.stubGlobal('MediaRecorder', MediaRecorder);
    vi.doMock('../../eVe/domains/media/api/video_api_state.js', () => createVideoStateMock());
};

const createStream = () => {
    const stops = { video: 0, audio: 0 };
    const videoTrack = {
        stop: () => { stops.video += 1; },
        getSettings: () => ({ width: 640, height: 360 })
    };
    const audioTrack = { stop: () => { stops.audio += 1; } };
    return {
        stream: {
            getVideoTracks: () => [videoTrack],
            getAudioTracks: () => [audioTrack],
            getTracks: () => [videoTrack, audioTrack]
        },
        stops
    };
};

afterEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

test('fatal MediaRecorder error before stop is terminal and releases owned tracks', async () => {
    const { stream, stops } = createStream();
    class RecorderStub {
        static isTypeSupported() { return true; }
        constructor() {
            this.mimeType = 'video/webm';
            this.state = 'inactive';
        }
        start() { this.state = 'recording'; }
    }
    installBrowser({
        getUserMedia: vi.fn(async () => stream),
        MediaRecorder: RecorderStub
    });
    const { record_video } = await import(
        '../../eVe/domains/media/api/video_api_record.js?fatal-before-stop-probe'
    );
    const controller = await record_video('fatal.webm', null, { audio: true });
    const failure = new Error('encoder_failed');
    controller.recorder.state = 'inactive';
    controller.recorder.onerror({ error: failure });

    await assert.rejects(controller.stop(), (error) => (
        error === failure && error.recordingTerminal === true
    ));
    assert.deepEqual(stops, { video: 1, audio: 1 });
}, 30_000);

test('discard stops MediaRecorder without materializing the captured payload', async () => {
    const { stream, stops } = createStream();
    class RecorderStub {
        static isTypeSupported() { return true; }
        constructor() {
            this.mimeType = 'video/webm';
            this.state = 'inactive';
        }
        start() { this.state = 'recording'; }
        requestData() {}
        stop() {
            this.state = 'inactive';
            queueMicrotask(() => this.onstop?.());
        }
    }
    installBrowser({
        getUserMedia: vi.fn(async () => stream),
        MediaRecorder: RecorderStub
    });
    vi.stubGlobal('Blob', class {
        constructor() { throw new Error('discard_must_not_build_blob'); }
    });
    const { record_video } = await import(
        '../../eVe/domains/media/api/video_api_record.js?discard-no-blob'
    );
    const controller = await record_video('discard.webm', null, { audio: true });
    const result = await controller.stop({ discard: true });

    assert.equal(result.ok, true);
    assert.equal(result.discarded, true);
    assert.deepEqual(stops, { video: 1, audio: 1 });
});

test('MediaRecorder construction failure releases every owned capture track', async () => {
    const { stream, stops } = createStream();
    class RecorderStub {
        static isTypeSupported() { return true; }
        constructor() { throw new Error('encoder_constructor_failed'); }
    }
    installBrowser({
        getUserMedia: vi.fn(async () => stream),
        MediaRecorder: RecorderStub
    });
    const { record_video } = await import(
        '../../eVe/domains/media/api/video_api_record.js?constructor-cleanup'
    );

    await assert.rejects(record_video('constructor.webm', null, { audio: true }), /encoder_constructor_failed/);
    assert.deepEqual(stops, { video: 1, audio: 1 });
});

test('a recorder that ends before explicit stop still finalizes its buffered terminal capture', async () => {
    const { stream, stops } = createStream();
    let stopCalls = 0;
    class RecorderStub {
        static isTypeSupported() { return true; }
        constructor() {
            this.mimeType = 'video/webm';
            this.state = 'inactive';
        }
        start() { this.state = 'recording'; }
        stop() { stopCalls += 1; }
    }
    const persistRecording = vi.fn(async () => ({
        path: 'data/users/test/recordings/natural-stop.webm',
        atomeId: 'video_recording_natural_stop'
    }));
    installBrowser({
        getUserMedia: vi.fn(async () => stream),
        MediaRecorder: RecorderStub
    });
    vi.doMock('../../eVe/domains/media/api/video_api_persist.js', () => ({
        persistRecording,
        buildNativeMediaPath: vi.fn()
    }));
    const { record_video } = await import(
        '../../eVe/domains/media/api/video_api_record.js?natural-stop-finalize'
    );
    const controller = await record_video('natural-stop.webm', null, { audio: true });
    await new Promise((resolve) => setTimeout(resolve, 2));
    controller.recorder.ondataavailable({
        data: new Blob([Uint8Array.of(0x1a, 0x45, 0xdf, 0xa3, 0x81, 0x00)], { type: 'video/webm' })
    });
    controller.recorder.state = 'inactive';
    controller.recorder.onstop();

    const result = await controller.stop();
    assert.equal(result.ok, true);
    assert.equal(stopCalls, 0);
    assert.equal(persistRecording.mock.calls.length, 1);
    assert.deepEqual(stops, { video: 1, audio: 1 });
});
