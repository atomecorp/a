import assert from 'node:assert/strict';
import { afterEach, test, vi } from 'vitest';

const originalElement = globalThis.Element;
const originalHtmlElement = globalThis.HTMLElement;
const originalHtmlCanvasElement = globalThis.HTMLCanvasElement;
const originalMediaStream = globalThis.MediaStream;
const originalWindow = globalThis.window;
const originalDocument = globalThis.document;
const originalCustomEvent = globalThis.CustomEvent;

class HostElement {
    constructor() {
        this.dataset = {};
        this.tagName = 'DIV';
        this.id = '';
        this.className = '';
        this.style = {};
    }
    replaceChildren() { }
    querySelectorAll() { return []; }
}

class CanvasElement extends HostElement {}

class PreviewElementStub {
    constructor() {
        this.dataset = {};
        this.style = {};
        this.className = '';
    }
    set srcObject(value) { this._srcObject = value; }
    get srcObject() { return this._srcObject; }
    play() { return Promise.resolve(); }
    pause() { }
    remove() { }
}

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
    globalThis.document = { createElement: () => new PreviewElementStub() };
    globalThis.window = {
        getComputedStyle: () => ({ position: 'relative' }),
        setTimeout: (fn) => fn,
        dispatchEvent: () => { }
    };
};

afterEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    globalThis.Element = originalElement;
    globalThis.HTMLElement = originalHtmlElement;
    globalThis.HTMLCanvasElement = originalHtmlCanvasElement;
    globalThis.MediaStream = originalMediaStream;
    globalThis.window = originalWindow;
    globalThis.document = originalDocument;
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

    vi.doMock('../../eVe/domains/media/api/video_api.js', () => ({
        acquirePreviewStream,
        releasePreviewStream
    }));

    const { createVideoPreviewRenderer } = await import(
        '../../eVe/domains/media/preview/video_preview_renderer.js?external-stream'
    );
    const preview = await createVideoPreviewRenderer({
        host: new HostElement(),
        consumerId: 'record_preview_contract',
        stream: externalStream
    });

    // Reused external stream: the viewfinder renders it directly (<video> element)
    // without acquiring from the preview registry.
    assert.equal(preview.stream, externalStream);
    assert.equal(preview.renderer, 'video-element');
    assert.equal(acquirePreviewStream.mock.calls.length, 0);

    await preview.stop();

    // A reused (not acquired) stream must never be released by the preview.
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

    vi.doMock('../../eVe/domains/media/api/video_api.js', () => ({
        acquirePreviewStream,
        releasePreviewStream
    }));

    const { createVideoPreviewRenderer } = await import(
        '../../eVe/domains/media/preview/video_preview_renderer.js?acquired-stream'
    );
    const preview = await createVideoPreviewRenderer({
        host: new HostElement(),
        consumerId: 'panel_preview_contract',
        cameraPosition: 'front'
    });

    // No external stream: the preview acquires one from the registry and renders it
    // through the <video> viewfinder.
    assert.equal(preview.stream, acquiredStream);
    assert.equal(preview.renderer, 'video-element');
    assert.equal(acquirePreviewStream.mock.calls.length, 1);

    await preview.stop();

    // Only registry-acquired streams are released on stop.
    assert.deepEqual(releasePreviewStream.mock.calls, [['panel_preview_contract']]);
});
