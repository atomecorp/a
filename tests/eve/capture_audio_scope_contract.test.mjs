// Capture audio scope: a permission check or a launch bootstrap must never open
// the microphone by default, and a microphone acquisition that lands after a
// cancellation must release itself instead of switching the input back on.
import assert from 'node:assert/strict';
import { afterEach, test, vi } from 'vitest';

import { createVoiceInputMeter } from '../../atome/src/squirrel/voice/voice_input_meter.js';

const originalWindow = globalThis.window;
const originalDocument = globalThis.document;
const originalNavigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');

const createTrack = () => ({
    stopped: false,
    stop() {
        this.stopped = true;
    }
});

const createStream = () => {
    const videoTrack = createTrack();
    const audioTrack = createTrack();
    return {
        videoTrack,
        audioTrack,
        getTracks: () => [videoTrack, audioTrack],
        getVideoTracks: () => [videoTrack],
        getAudioTracks: () => [audioTrack]
    };
};

const installBrowserGlobals = (getUserMedia) => {
    globalThis.document = {
        readyState: 'complete',
        addEventListener() { },
        removeEventListener() { },
        querySelector: () => null,
        head: { appendChild() { } },
        documentElement: { appendChild() { } },
        body: { appendChild() { } }
    };
    const listeners = new Map();
    const storage = new Map();
    globalThis.window = {
        __HOST_ENV: 'web',
        localStorage: {
            getItem: (key) => (storage.has(key) ? storage.get(key) : null),
            setItem: (key, value) => storage.set(key, String(value)),
            removeItem: (key) => storage.delete(key)
        },
        addEventListener: (type, listener) => {
            if (!listeners.has(type)) listeners.set(type, []);
            listeners.get(type).push(listener);
        },
        removeEventListener() { },
        dispatchEvent: () => true,
        setTimeout: (callback, delay) => setTimeout(callback, delay),
        clearTimeout: (handle) => clearTimeout(handle),
        setInterval: (callback, delay) => setInterval(callback, delay),
        clearInterval: (handle) => clearInterval(handle),
        requestAnimationFrame: (callback) => setTimeout(() => callback(Date.now()), 16),
        cancelAnimationFrame: (handle) => clearTimeout(handle),
        location: { href: 'http://localhost/', origin: 'http://localhost' },
        screen: { orientation: { angle: 0 } },
        innerWidth: 1280,
        innerHeight: 800
    };
    Object.defineProperty(globalThis, 'navigator', {
        configurable: true,
        value: { mediaDevices: { getUserMedia } }
    });
};

afterEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    globalThis.window = originalWindow;
    globalThis.document = originalDocument;
    if (originalNavigatorDescriptor) {
        Object.defineProperty(globalThis, 'navigator', originalNavigatorDescriptor);
    } else {
        delete globalThis.navigator;
    }
});

test('a video-only permission check never opens the microphone', async () => {
    const stream = createStream();
    const getUserMedia = vi.fn(async () => stream);
    installBrowserGlobals(getUserMedia);

    const { ensureCaptureDevicePermissions } = await import(
        '../../eVe/domains/media/api/video_api.js?capture-scope-video-only'
    );
    const result = await ensureCaptureDevicePermissions({ video: true, force: true });

    assert.deepEqual(getUserMedia.mock.calls[0][0], { audio: false, video: true });
    assert.equal(result.ok, true);
    assert.equal(result.audio, false);
    assert.equal(stream.audioTrack.stopped, true, 'the probe must release every acquired track');
    assert.equal(stream.videoTrack.stopped, true, 'the probe must release every acquired track');
}, 30000);

test('the microphone is requested only when the caller asks for it', async () => {
    const stream = createStream();
    const getUserMedia = vi.fn(async () => stream);
    installBrowserGlobals(getUserMedia);

    const { ensureCaptureDevicePermissions } = await import(
        '../../eVe/domains/media/api/video_api.js?capture-scope-explicit-audio'
    );
    const result = await ensureCaptureDevicePermissions({ video: true, audio: true, force: true });

    assert.deepEqual(getUserMedia.mock.calls[0][0], { audio: true, video: true });
    assert.equal(result.ok, true);
    assert.equal(result.audio, true);
    assert.equal(stream.audioTrack.stopped, true);
}, 30000);

test('the launch bootstrap does not prewarm the microphone', async () => {
    const stream = createStream();
    const getUserMedia = vi.fn(async () => stream);
    installBrowserGlobals(getUserMedia);

    const { bootstrapCaptureDevicePermissionsOnLaunch } = await import(
        '../../eVe/domains/media/api/video_api.js?capture-scope-launch'
    );
    const result = await bootstrapCaptureDevicePermissionsOnLaunch();

    assert.equal(getUserMedia.mock.calls.length, 1);
    assert.deepEqual(getUserMedia.mock.calls[0][0], { audio: false, video: true });
    assert.equal(result.audio, false);
    assert.equal(stream.audioTrack.stopped, true);
}, 30000);

test('the launch bootstrap honours an explicit microphone opt-in', async () => {
    const stream = createStream();
    const getUserMedia = vi.fn(async () => stream);
    installBrowserGlobals(getUserMedia);

    const { bootstrapCaptureDevicePermissionsOnLaunch } = await import(
        '../../eVe/domains/media/api/video_api.js?capture-scope-launch-audio'
    );
    const result = await bootstrapCaptureDevicePermissionsOnLaunch({ audio: true });

    assert.deepEqual(getUserMedia.mock.calls[0][0], { audio: true, video: true });
    assert.equal(result.audio, true);
}, 30000);

const createMeterEnv = (getUserMedia) => {
    const closed = { count: 0 };
    class FakeAudioContext {
        createMediaStreamSource() {
            return { connect() { }, disconnect() { } };
        }

        createAnalyser() {
            return { fftSize: 0, smoothingTimeConstant: 0, connect() { }, disconnect() { }, getByteTimeDomainData() { } };
        }

        close() {
            closed.count += 1;
            return Promise.resolve();
        }
    }
    return {
        closed,
        env: {
            navigator: { mediaDevices: { getUserMedia } },
            AudioContext: FakeAudioContext,
            requestAnimationFrame: () => 1,
            cancelAnimationFrame: () => { }
        }
    };
};

// Yields microtasks until the meter reached the browser call a scenario needs
// to interleave with, so the cancellation lands while a request is in flight
// instead of before it starts.
const flushMicrotasksUntil = async (predicate, message) => {
    for (let attempt = 0; attempt < 64 && !predicate(); attempt += 1) {
        await Promise.resolve();
    }
    assert.equal(predicate(), true, message);
};

test('stopping the voice meter releases the microphone it owns', async () => {
    const stream = createStream();
    const { closed, env } = createMeterEnv(vi.fn(async () => stream));
    const meter = createVoiceInputMeter({ env });

    assert.equal(await meter.start(), true);
    assert.deepEqual(meter.getState(), { active: true, hasStream: true });

    await meter.stop();

    assert.equal(stream.audioTrack.stopped, true, 'the owned track must be stopped, not muted');
    assert.equal(closed.count, 1, 'the analysis context must be closed');
    assert.deepEqual(meter.getState(), { active: false, hasStream: false });
});

test('a microphone answer that arrives after a cancellation never reactivates capture', async () => {
    const stream = createStream();
    let resolveStream = null;
    const getUserMedia = vi.fn(() => new Promise((resolve) => {
        resolveStream = resolve;
    }));
    const { env } = createMeterEnv(getUserMedia);
    const meter = createVoiceInputMeter({ env });

    const pending = meter.start();
    await flushMicrotasksUntil(
        () => getUserMedia.mock.calls.length === 1,
        'the meter must request the microphone before the cancellation'
    );
    await meter.stop();
    resolveStream(stream);

    await assert.rejects(pending, /microphone_capture_cancelled/);
    assert.equal(stream.audioTrack.stopped, true, 'the late stream must be released');
    assert.equal(stream.videoTrack.stopped, true);
    assert.deepEqual(meter.getState(), { active: false, hasStream: false });
});

test('a cancelled voice meter can still be started again', async () => {
    const firstStream = createStream();
    const secondStream = createStream();
    let resolveFirstStream = null;
    const getUserMedia = vi.fn(() => {
        if (!resolveFirstStream) {
            return new Promise((resolve) => {
                resolveFirstStream = resolve;
            });
        }
        return Promise.resolve(secondStream);
    });
    const { env } = createMeterEnv(getUserMedia);
    const meter = createVoiceInputMeter({ env });

    const pending = meter.start();
    await flushMicrotasksUntil(
        () => getUserMedia.mock.calls.length === 1,
        'the meter must request the microphone before the cancellation'
    );
    await meter.stop();
    resolveFirstStream(firstStream);
    await assert.rejects(pending, /microphone_capture_cancelled/);

    assert.equal(firstStream.audioTrack.stopped, true, 'the cancelled acquisition must release its stream');
    assert.equal(await meter.start(), true);
    assert.deepEqual(meter.getState(), { active: true, hasStream: true });
    assert.equal(secondStream.audioTrack.stopped, false);

    await meter.stop();
    assert.equal(secondStream.audioTrack.stopped, true);
});
