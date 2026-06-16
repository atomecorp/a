import assert from 'node:assert/strict';
import { afterEach, test, vi } from 'vitest';

const originalElement = globalThis.Element;
const originalHtmlElement = globalThis.HTMLElement;
const originalHtmlCanvasElement = globalThis.HTMLCanvasElement;
const originalMediaStream = globalThis.MediaStream;
const originalWindow = globalThis.window;
const originalCustomEvent = globalThis.CustomEvent;

class HostElement {
    constructor() {
        this.dataset = {};
        this.tagName = 'DIV';
        this.id = '';
        this.className = '';
    }
}

class CanvasElement extends HostElement {}

class StreamStub {
    constructor(id = 'stream') {
        this.id = id;
        this.active = true;
        this.videoTrack = {
            id: `${id}:video`,
            label: '',
            enabled: true,
            muted: false,
            readyState: 'live',
            getSettings: () => ({ width: 640, height: 480 })
        };
        this.audioTrack = {
            id: `${id}:audio`,
            label: '',
            enabled: true,
            muted: false,
            readyState: 'live'
        };
    }

    getVideoTracks() {
        return [this.videoTrack];
    }

    getAudioTracks() {
        return [this.audioTrack];
    }
}

const installDomStubs = () => {
    globalThis.Element = HostElement;
    globalThis.HTMLElement = HostElement;
    globalThis.HTMLCanvasElement = CanvasElement;
    globalThis.MediaStream = StreamStub;
};

afterEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    globalThis.Element = originalElement;
    globalThis.HTMLElement = originalHtmlElement;
    globalThis.HTMLCanvasElement = originalHtmlCanvasElement;
    globalThis.MediaStream = originalMediaStream;
    globalThis.window = originalWindow;
    globalThis.CustomEvent = originalCustomEvent;
});

test('recording session renders the stream returned by startVideoRecording', async () => {
    installDomStubs();
    const recordStream = new StreamStub('record');
    const createVideoPreviewRenderer = vi.fn(async () => ({
        markPhase: vi.fn(),
        getDiagnostics: () => ({ renderer: 'test' }),
        stop: vi.fn()
    }));
    const startVideoRecording = vi.fn(async () => ({
        ok: true,
        fileName: 'record.mp4',
        stream: recordStream
    }));

    vi.doMock('../../eVe/domains/media/api/video_api.js', () => ({
        startVideoRecording,
        stopVideoRecording: vi.fn(),
        getVideoRecordingState: () => ({ isRecording: false })
    }));
    vi.doMock('../../eVe/domains/media/preview/video_preview_renderer.js', () => ({
        createVideoPreviewRenderer
    }));

    globalThis.window = {
        setTimeout: vi.fn(),
        dispatchEvent: vi.fn()
    };
    globalThis.CustomEvent = class {
        constructor(type, options = {}) {
            this.type = type;
            this.detail = options.detail;
        }
    };

    const { startVideoRecordingSession } = await import(
        '../../eVe/domains/media/api/video_recording_controller.js?recording-preview-stream'
    );
    const host = new HostElement();
    const result = await startVideoRecordingSession({
        previewHost: host,
        input: { audio: false },
        source: 'contract_test'
    });

    assert.equal(result.ok, true);
    assert.equal(createVideoPreviewRenderer.mock.calls.length, 1);
    assert.equal(createVideoPreviewRenderer.mock.calls[0][0].stream, recordStream);
});

test('video preview renderer reuses external streams without acquiring or releasing preview registry streams', async () => {
    installDomStubs();
    const externalStream = new StreamStub('external');
    const acquirePreviewStream = vi.fn();
    const releasePreviewStream = vi.fn();
    const rendererStop = vi.fn();
    const createWebGpuVideoPreviewRenderer = vi.fn(async () => ({
        stop: rendererStop,
        getDiagnostics: () => ({ renderer: 'webgpu' })
    }));

    vi.doMock('../../eVe/domains/media/api/video_api.js', () => ({
        acquirePreviewStream,
        releasePreviewStream
    }));
    vi.doMock('../../eVe/domains/media/preview/webgpu_video_preview_renderer.js', () => ({
        createWebGpuVideoPreviewRenderer
    }));

    const { createVideoPreviewRenderer } = await import(
        '../../eVe/domains/media/preview/video_preview_renderer.js?external-stream'
    );
    const preview = await createVideoPreviewRenderer({
        host: new HostElement(),
        consumerId: 'record_preview_contract',
        stream: externalStream
    });

    assert.equal(preview.stream, externalStream);
    assert.equal(acquirePreviewStream.mock.calls.length, 0);
    assert.equal(createWebGpuVideoPreviewRenderer.mock.calls[0][0].stream, externalStream);

    await preview.stop();

    assert.equal(rendererStop.mock.calls.length, 1);
    assert.equal(releasePreviewStream.mock.calls.length, 0);
});

test('video preview renderer releases only streams acquired from the preview registry', async () => {
    installDomStubs();
    const acquiredStream = new StreamStub('acquired');
    const acquirePreviewStream = vi.fn(async () => ({
        ok: true,
        stream: acquiredStream,
        cameraPosition: 'front',
        shared: false
    }));
    const releasePreviewStream = vi.fn();
    const createWebGpuVideoPreviewRenderer = vi.fn(async () => ({
        stop: vi.fn(),
        getDiagnostics: () => ({ renderer: 'webgpu' })
    }));

    vi.doMock('../../eVe/domains/media/api/video_api.js', () => ({
        acquirePreviewStream,
        releasePreviewStream
    }));
    vi.doMock('../../eVe/domains/media/preview/webgpu_video_preview_renderer.js', () => ({
        createWebGpuVideoPreviewRenderer
    }));

    const { createVideoPreviewRenderer } = await import(
        '../../eVe/domains/media/preview/video_preview_renderer.js?acquired-stream'
    );
    const preview = await createVideoPreviewRenderer({
        host: new HostElement(),
        consumerId: 'panel_preview_contract',
        cameraPosition: 'front'
    });

    assert.equal(preview.stream, acquiredStream);
    assert.equal(acquirePreviewStream.mock.calls.length, 1);
    assert.equal(createWebGpuVideoPreviewRenderer.mock.calls[0][0].stream, acquiredStream);

    await preview.stop();

    assert.deepEqual(releasePreviewStream.mock.calls, [['panel_preview_contract']]);
});
