import assert from 'node:assert/strict';
import { access, readFile, readdir } from 'node:fs/promises';
import { afterEach, test, vi } from 'vitest';

const originalElement = globalThis.Element;
const originalWindow = globalThis.window;
const originalDocument = globalThis.document;
const originalCustomEvent = globalThis.CustomEvent;
const originalMediaStream = globalThis.MediaStream;
const originalMediaRecorder = globalThis.MediaRecorder;
const originalNavigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');

class HostElement {
    constructor() {
        this.tagName = 'DIV';
        this.id = 'record-host';
        this.className = 'record-host';
    }
}

const createVideoStateMock = (videoState = {
    ctrl: null,
    fileName: null,
    projectAtomeId: null,
    pending: false,
    stream: null
}) => ({
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
});

afterEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    globalThis.Element = originalElement;
    globalThis.window = originalWindow;
    globalThis.document = originalDocument;
    globalThis.CustomEvent = originalCustomEvent;
    globalThis.MediaStream = originalMediaStream;
    globalThis.MediaRecorder = originalMediaRecorder;
    if (originalNavigatorDescriptor) {
        Object.defineProperty(globalThis, 'navigator', originalNavigatorDescriptor);
    } else {
        delete globalThis.navigator;
    }
});

test('recording controller never creates a parallel DOM camera renderer', async () => {
    const createElement = vi.fn(() => {
        throw new Error('recording_controller_must_not_create_dom_media');
    });
    const startVideoRecording = vi.fn(async () => ({
        ok: true,
        fileName: 'record.mov',
        native: true
    }));
    const stopVideoRecording = vi.fn(async () => ({ ok: true, status: 'stopped' }));

    globalThis.Element = HostElement;
    globalThis.document = { createElement };
    globalThis.window = { dispatchEvent: vi.fn() };
    globalThis.CustomEvent = class {
        constructor(type, options = {}) {
            this.type = type;
            this.detail = options.detail;
        }
    };

    vi.doMock('../../eVe/domains/media/api/video_api.js', () => ({
        startVideoRecording,
        stopVideoRecording,
        getVideoRecordingState: () => ({ isRecording: false })
    }));

    const controller = await import(
        '../../eVe/domains/media/api/video_recording_controller.js?no-dom-record-preview'
    );
    const started = await controller.startVideoRecordingSession({
        previewHost: new HostElement(),
        input: { audio: true },
        source: 'contract_test'
    });

    assert.equal(started.ok, true);
    assert.equal(startVideoRecording.mock.calls.length, 1);
    assert.equal(createElement.mock.calls.length, 0);

    const stopped = await controller.stopVideoRecordingSession({ source: 'contract_test' });
    assert.equal(stopped.ok, true);
    assert.equal(stopVideoRecording.mock.calls.length, 1);
    assert.equal(createElement.mock.calls.length, 0);
});

test('obsolete DOM/JPEG recording preview path stays deleted', async () => {
    const deletedPaths = [
        '../../eVe/domains/media/preview/video_preview_renderer.js',
        '../../eVe/domains/media/preview/video_preview_panel_service.js',
        '../../eVe/domains/media/preview/video_preview_panel_dom.js',
        '../../eVe/domains/media/preview/video_preview_stream_service.js',
        '../../eVe/intuition/tools/capture_audio_scope.js',
        '../../eVe/intuition/tools/capture_audio_scope_source.js',
        '../../eVe/intuition/tools/capture_preview_session_runtime.js',
        '../../eVe/intuition/tools/capture_fullscreen_runtime.js',
        '../../eVe/intuition/tools/capture_fullscreen_chrome_runtime.js',
        '../../eVe/intuition/tools/capture_expanded_surface_dom.js',
        '../../eVe/intuition/runtime/preview_surface.js'
    ];
    await Promise.all(deletedPaths.map((path) => assert.rejects(access(new URL(path, import.meta.url)))));

    const sources = await Promise.all([
        readFile(new URL('../../eVe/domains/media/api/video_recording_controller.js', import.meta.url), 'utf8'),
        readFile(new URL('../../eVe/domains/media/api/video_api_preview.js', import.meta.url), 'utf8'),
        readFile(new URL('../../eVe/intuition/tools/capture.js', import.meta.url), 'utf8'),
        readFile(new URL('../../eVe/intuition/tools/capture_recording_feedback_runtime.js', import.meta.url), 'utf8')
    ]);
    const browserSource = sources.join('\n');
    assert.equal(browserSource.includes('video_preview_renderer'), false);
    assert.equal(browserSource.includes('createVideoPreviewRenderer'), false);
    assert.equal(browserSource.includes('previewSourceId'), false);
    assert.equal(browserSource.includes("document.createElement('video')"), false);
    assert.equal(browserSource.includes("document.createElement('canvas')"), false);
    const commonDirectory = new URL('../../platforms/ios/atome-auv3/Common/', import.meta.url);
    const swiftFiles = (await readdir(commonDirectory)).filter((name) => name.endsWith('.swift'));
    const swiftEntries = await Promise.all(swiftFiles.map(async (name) => ({
        name,
        source: await readFile(new URL(name, commonDirectory), 'utf8')
    })));
    const swiftSource = swiftEntries.map(({ source }) => source).join('\n');
    const videoDataOutputOwners = swiftEntries
        .filter(({ source }) => source.includes('AVCaptureVideoDataOutput'))
        .map(({ name }) => name);
    const nativePreviewSource = swiftEntries.find(
        ({ name }) => name === 'AppNativeVideoRecorderPreview.swift'
    )?.source ?? '';
    assert.equal(swiftSource.includes('__ATOME_NATIVE_VIDEO_PREVIEW_FRAME'), false);
    assert.deepEqual(videoDataOutputOwners, ['AppNativeVideoRecorderPreview.swift']);
    assert.match(nativePreviewSource, /maximumDimension = 96/);
    assert.match(nativePreviewSource, /minimumFrameInterval = 1\.0 \/ 15\.0/);
    assert.match(nativePreviewSource, /alwaysDiscardsLateVideoFrames = true/);
    assert.match(nativePreviewSource, /vImageScale_ARGB8888/);
    assert.match(nativePreviewSource, /"pixel_format": "bgra8"/);
    assert.equal(nativePreviewSource.toLowerCase().includes('jpeg'), false);
    assert.equal(swiftSource.includes('AVCaptureVideoPreviewLayer'), false);
    assert.equal(swiftSource.includes('media_camera_preview_'), false);
});

test('native video cancel remains retryable after a bridge failure', async () => {
    const calls = [];
    let stopAttempts = 0;
    const invoke = vi.fn(async (command, payload) => {
        calls.push({ command, payload });
        if (command === 'media_video_record_start') {
            return { success: true, file_name: 'retry.mov' };
        }
        if (command === 'media_video_record_cancel') {
            stopAttempts += 1;
            if (stopAttempts === 1) throw new Error('temporary_native_bridge_failure');
            return { success: true, discarded: true };
        }
        return { success: true };
    });

    globalThis.window = {
        innerWidth: 390,
        innerHeight: 844,
        setTimeout,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn()
    };
    vi.doMock('../../eVe/domains/media/api/video_api_state.js', () => ({
        getIosNativeInvoke: () => invoke
    }));
    vi.doMock('../../eVe/domains/media/api/video_api_preview.js', () => ({
        getCameraPreviewState: () => ({ cameraPosition: 'back' })
    }));

    const { recordVideoNativeIos } = await import(
        '../../eVe/domains/media/api/video_api_record_native.js?retryable-native-stop'
    );
    const controller = await recordVideoNativeIos(
        'retry.mov',
        'data/users/test/recordings/retry.mov',
        { audio: false, cameraPosition: 'back' }
    );

    await assert.rejects(
        controller.stop({ force: true, discard: true }),
        /temporary_native_bridge_failure/
    );
    const result = await controller.stop({ force: true, discard: true });

    assert.equal(result.ok, true);
    assert.equal(result.discarded, true);
    assert.equal(typeof controller.readPreviewFrame, 'function');
    assert.equal(typeof controller.previewSourceId, 'string');
    const stopCalls = calls.filter(({ command }) => command === 'media_video_record_cancel');
    assert.equal(stopCalls.length, 2);
    assert.deepEqual(stopCalls.map(({ payload }) => payload), [
        {},
        {}
    ]);
}, 30_000);

test('browser video persistence can retry without stopping MediaRecorder twice', async () => {
    const counters = { recorderStop: 0, persist: 0 };
    class StreamStub {
        constructor() {
            this.videoTrack = {
                stopped: false,
                stop() { this.stopped = true; },
                getSettings() { return this.stopped ? {} : { width: 640, height: 360 }; }
            };
            this.audioTrack = { stop() {} };
        }
        getVideoTracks() { return [this.videoTrack]; }
        getAudioTracks() { return [this.audioTrack]; }
        getTracks() { return [this.videoTrack, this.audioTrack]; }
    }
    class RecorderStub {
        static isTypeSupported() { return true; }
        constructor() {
            this.mimeType = 'video/webm';
            this.state = 'inactive';
        }
        start() { this.state = 'recording'; }
        requestData() {}
        stop() {
            counters.recorderStop += 1;
            this.state = 'inactive';
            queueMicrotask(() => {
                this.ondataavailable?.({
                    data: new Blob([Uint8Array.of(0x1a, 0x45, 0xdf, 0xa3, 0x81, 0x00)], { type: 'video/webm' })
                });
                this.onstop?.();
            });
        }
    }
    const persistRecording = vi.fn(async () => {
        counters.persist += 1;
        if (counters.persist === 1) throw new Error('temporary_persistence_failure');
        return { path: 'data/users/test/recordings/retry.webm' };
    });

    globalThis.Element = HostElement;
    globalThis.document = {};
    globalThis.window = {
        innerWidth: 390,
        innerHeight: 844,
        setTimeout,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn()
    };
    globalThis.MediaStream = StreamStub;
    globalThis.MediaRecorder = RecorderStub;
    Object.defineProperty(globalThis, 'navigator', {
        configurable: true,
        value: { mediaDevices: { getUserMedia: vi.fn() } }
    });
    vi.doMock('../../eVe/domains/media/api/video_api_state.js', () => createVideoStateMock());
    vi.doMock('../../eVe/domains/media/api/video_api_persist.js', () => ({
        persistRecording,
        buildNativeMediaPath: vi.fn()
    }));

    const { record_video } = await import(
        '../../eVe/domains/media/api/video_api_record.js?retry-browser-persistence'
    );
    const stream = new StreamStub();
    const controller = await record_video('retry.webm', null, {
        stream,
        stopExternalStream: true,
        audio: true
    });

    await assert.rejects(controller.stop(), /temporary_persistence_failure/);
    const result = await controller.stop();

    assert.equal(result.ok, true);
    assert.equal(result.path, 'data/users/test/recordings/retry.webm');
    assert.equal(counters.recorderStop, 1);
    assert.equal(counters.persist, 2);
    assert.equal(stream.videoTrack.stopped, true);
    assert.deepEqual(stream.videoTrack.getSettings(), {});
    const [firstPersist, secondPersist] = persistRecording.mock.calls.map(([input]) => input);
    assert.match(firstPersist.atomeId, /^video_recording_/);
    assert.equal(secondPersist.atomeId, firstPersist.atomeId);
    assert.equal(secondPersist.uploadId, firstPersist.uploadId);
});

test('every exact-video entry rejects before opening camera or native capture', async () => {
    const getUserMedia = vi.fn();
    const nativeInvoke = vi.fn();
    globalThis.document = {};
    globalThis.window = {
        __HOST_ENV: '',
        record_video: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn()
    };
    Object.defineProperty(globalThis, 'navigator', {
        configurable: true,
        value: { mediaDevices: { getUserMedia } }
    });
    vi.doMock('../../eVe/domains/media/api/video_api_state.js', () => ({
        ...createVideoStateMock(),
        getIosNativeInvoke: () => nativeInvoke
    }));

    const api = await import('../../eVe/domains/media/api/video_api_record.js?exact-fail-closed');
    const directError = await api.record_video('exact.webm', null, {
        require_sample_accurate: true
    }).catch((error) => error);
    const nested = await api.startVideoRecording({
        options: { requireSampleAccurate: true }
    });

    assert.equal(directError.code, 'av_sample_accurate_overdub_unsupported');
    assert.equal(nested.ok, false);
    assert.equal(nested.code, 'av_sample_accurate_overdub_unsupported');
    assert.equal(getUserMedia.mock.calls.length, 0);
    assert.equal(nativeInvoke.mock.calls.length, 0);
    assert.equal(globalThis.window.record_video.mock.calls.length, 0);
});

test('MediaStream wrappers from another realm remain valid preview sources', async () => {
    const { isMediaStream } = await import(
        '../../eVe/domains/media/api/video_api_helpers.js?cross-realm-stream'
    );
    const crossRealmStream = {
        getTracks: () => [],
        getAudioTracks: () => [],
        getVideoTracks: () => [{ readyState: 'live' }]
    };

    assert.equal(isMediaStream(crossRealmStream), true);
    assert.equal(isMediaStream({ getTracks: () => [] }), false);
});

test('audio-requested browser video fails closed and releases camera when microphone acquisition fails', async () => {
    let videoStops = 0;
    const videoTrack = { stop: () => { videoStops += 1; }, getSettings: () => ({ width: 640, height: 360 }) };
    const cameraStream = {
        getVideoTracks: () => [videoTrack],
        getAudioTracks: () => [],
        getTracks: () => [videoTrack]
    };
    const getUserMedia = vi.fn()
        .mockResolvedValueOnce(cameraStream)
        .mockRejectedValueOnce(new Error('microphone_denied'));
    globalThis.document = {};
    globalThis.window = { setTimeout, addEventListener: vi.fn(), removeEventListener: vi.fn() };
    globalThis.MediaRecorder = class { static isTypeSupported() { return true; } };
    Object.defineProperty(globalThis, 'navigator', {
        configurable: true,
        value: { mediaDevices: { getUserMedia } }
    });
    vi.doMock('../../eVe/domains/media/api/video_api_state.js', () => createVideoStateMock());

    const { record_video } = await import(
        '../../eVe/domains/media/api/video_api_record.js?required-browser-audio'
    );
    const error = await record_video('audio-required.webm', null, { audio: true }).catch((reason) => reason);

    assert.equal(error.code, 'video_audio_capture_unavailable');
    assert.equal(getUserMedia.mock.calls.length, 2);
    assert.equal(videoStops, 1);
});

test('project association failure keeps the stopped controller retryable', async () => {
    const state = {
        ctrl: null,
        fileName: null,
        projectAtomeId: null,
        pending: false,
        stream: null
    };
    const terminal = Promise.resolve({
        ok: true,
        fileName: 'retry-project.webm',
        file_path: 'data/users/test/recordings/retry-project.webm',
        atomeId: 'video_recording_retry'
    });
    const controller = { fileName: 'retry-project.webm', stop: vi.fn(() => terminal) };
    const ensureProjectMediaAtome = vi.fn()
        .mockResolvedValueOnce({ ok: false, error: 'temporary_project_commit_failure' })
        .mockResolvedValueOnce({ ok: true, atomeId: 'video_recording_retry' });
    globalThis.document = {};
    globalThis.window = {
        record_video: vi.fn(async () => controller),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn()
    };
    vi.doMock('../../eVe/domains/media/api/video_api_state.js', () => createVideoStateMock(state));
    vi.doMock('../../eVe/domains/media/api/video_api_helpers.js', async () => {
        const actual = await vi.importActual('../../eVe/domains/media/api/video_api_helpers.js');
        return { ...actual, ensureProjectMediaAtome };
    });

    const api = await import('../../eVe/domains/media/api/video_api_record.js?project-retry');
    assert.equal((await api.startVideoRecording()).ok, true);
    const first = await api.stopVideoRecording();
    assert.equal(first.ok, false);
    assert.equal(first.code, 'media_atome_create_failed');
    assert.equal(api.getVideoRecordingState().isRecording, true);

    const second = await api.stopVideoRecording();
    assert.equal(second.ok, true);
    assert.equal(api.getVideoRecordingState().isRecording, false);
    assert.equal(controller.stop.mock.calls.length, 2);
    assert.equal(ensureProjectMediaAtome.mock.calls.length, 2);
});

test('retryable tool stop failure keeps the active recording feedback attached', async () => {
    const stopCaptureVisualSession = vi.fn();
    const captureVisualState = { activeSession: { dispose: vi.fn() }, sequence: 0 };
    const { createCaptureVideoRecordingRuntime } = await import(
        '../../eVe/intuition/tools/capture_video_recording_runtime.js?retry-feedback'
    );
    const runtime = createCaptureVideoRecordingRuntime({
        captureVisualState,
        createPendingCaptureExportOptions: async () => ({}),
        getVideoRecordingControllerState: () => ({ recording: true }),
        getVideoRecordingState: () => ({ isRecording: true }),
        normalizeCaptureInput: (input) => input || {},
        resolveCaptureSourceTool: () => null,
        setCaptureSourceTool: () => {},
        stopCaptureVisualSession,
        stopVideoRecordingSession: async () => ({ ok: false, error: 'temporary_stop_failure' })
    });

    const result = await runtime.stopActiveVideoRecordingFromTool();
    assert.equal(result.ok, false);
    assert.equal(stopCaptureVisualSession.mock.calls.length, 0);
    assert.ok(captureVisualState.activeSession);
});

test('tool start discards the recorder when the mandatory video preview cannot attach', async () => {
    const stopVideoRecordingSession = vi.fn(async () => ({
        ok: true,
        status: 'discarded',
        discarded: true
    }));
    const stopCaptureVisualSession = vi.fn(async () => true);
    const transitionCaptureVisualSession = vi.fn(async ({ phase }) => {
        if (phase === 'recording') throw new Error('capture_video_preview_source_unavailable');
        return true;
    });
    const { createCaptureVideoRecordingRuntime } = await import(
        '../../eVe/intuition/tools/capture_video_recording_runtime.js?preview-required-cleanup'
    );
    const runtime = createCaptureVideoRecordingRuntime({
        captureVisualState: { activeSession: null, sequence: 0 },
        createPendingCaptureExportOptions: async () => ({}),
        getVideoRecordingControllerState: () => ({ recording: true }),
        getVideoRecordingState: () => ({ isRecording: true }),
        normalizeCaptureInput: (input) => input || {},
        resolveCaptureSourceTool: () => null,
        setCaptureSourceTool: () => {},
        startCaptureVisualSession: async () => true,
        startVideoRecordingSession: async () => ({ ok: true, status: 'recording' }),
        stopCaptureVisualSession,
        stopVideoRecordingSession,
        transitionCaptureVisualSession
    });

    await assert.rejects(
        runtime.startActiveVideoRecordingFromTool(),
        (error) => error?.code === 'capture_video_preview_failed'
    );
    assert.deepEqual(stopVideoRecordingSession.mock.calls[0][0], {
        discard: true,
        source: 'capture_preview_failure'
    });
    assert.equal(stopCaptureVisualSession.mock.calls.length, 1);
});
