import assert from 'node:assert/strict';
import { test } from 'vitest';
import { JSDOM } from 'jsdom';

import {
    setBevyVideoRedrawRequester,
    stopAllBevyVideoDecodeSources,
    syncBevyVideoDecodeSources
} from '../../eVe/domains/rendering/bevy_video_decode_source_runtime.js';
import {
    getBevyVideoStreamSourceStatus,
    registerBevyVideoStreamSource,
    unregisterBevyVideoStreamSource
} from '../../eVe/domains/rendering/bevy_video_stream_source_runtime.js';

const makeScene = (id, source) => ({
    nodes: [{ id, kind: 'video', content: { source } }]
});

const makeTrack = () => ({
    readyState: 'live',
    stopCalls: 0,
    stop() { this.stopCalls += 1; }
});

const withVideoStubs = async (windowRef, callback) => {
    const originalCreateElement = windowRef.document.createElement.bind(windowRef.document);
    const calls = { cancelVideoFrame: 0, videos: [] };
    windowRef.document.createElement = (tagName, ...args) => {
        const element = originalCreateElement(tagName, ...args);
        if (String(tagName).toLowerCase() !== 'video') return element;
        const frameCallbacks = [];
        let paused = true;
        let readyState = 0;
        let videoWidth = 0;
        let videoHeight = 0;
        Object.defineProperty(element, 'play', {
            configurable: true,
            value: () => {
                paused = false;
                return Promise.resolve();
            }
        });
        Object.defineProperty(element, 'pause', {
            configurable: true,
            value: () => { paused = true; }
        });
        Object.defineProperty(element, 'load', { configurable: true, value: () => {} });
        Object.defineProperty(element, 'paused', { configurable: true, get: () => paused });
        Object.defineProperty(element, 'ended', { configurable: true, get: () => false });
        Object.defineProperty(element, 'readyState', { configurable: true, get: () => readyState });
        Object.defineProperty(element, 'videoWidth', { configurable: true, get: () => videoWidth });
        Object.defineProperty(element, 'videoHeight', { configurable: true, get: () => videoHeight });
        Object.defineProperty(element, 'currentTime', { configurable: true, get: () => 0 });
        Object.defineProperty(element, 'requestVideoFrameCallback', {
            configurable: true,
            value: (frameCallback) => {
                frameCallbacks.push(frameCallback);
                return frameCallbacks.length;
            }
        });
        Object.defineProperty(element, 'cancelVideoFrameCallback', {
            configurable: true,
            value: (requestId) => {
                calls.cancelVideoFrame += 1;
                frameCallbacks[Number(requestId) - 1] = null;
            }
        });
        element.__setPresentable = () => {
            readyState = 4;
            videoWidth = 1280;
            videoHeight = 720;
        };
        element.__flushVideoFrame = (callbackTime) => {
            let frameCallback = null;
            while (!frameCallback && frameCallbacks.length) frameCallback = frameCallbacks.shift();
            frameCallback?.(callbackTime, {
                mediaTime: callbackTime / 1000,
                expectedDisplayTime: callbackTime
            });
        };
        calls.videos.push(element);
        return element;
    };
    try {
        return await callback(calls);
    } finally {
        windowRef.document.createElement = originalCreateElement;
    }
};

test('live MediaStream replaces URL decode, drives shared lookups at 15 fps, and leaves tracks owned by capture', async () => {
    const dom = new JSDOM('<!doctype html><html><body><canvas id="eve_surface_project"></canvas></body></html>');
    globalThis.document = dom.window.document;
    globalThis.window = dom.window;
    const surface = dom.window.document.getElementById('eve_surface_project');
    const track = makeTrack();
    const stream = { getVideoTracks: () => [track] };
    const redraws = [];
    setBevyVideoRedrawRequester(surface, (frame) => redraws.push(frame));

    try {
        await withVideoStubs(dom.window, async (calls) => {
            syncBevyVideoDecodeSources(makeScene('capture_video_overlay', '/must-not-decode.webm'), surface);
            const decodedVideo = calls.videos[0];
            const registration = await registerBevyVideoStreamSource({
                id: 'capture_video_overlay',
                stream,
                surface
            });

            assert.equal(registration.ok, true);
            assert.equal(decodedVideo.isConnected, false);
            assert.equal(calls.videos.length, 2);
            assert.equal(dom.window.document.querySelectorAll('#eve_bevy_video_decode_root video').length, 1);
            assert.equal(dom.window.__EVE_BEVY_VIDEO_SOURCE_FOR_ID__('capture_video_overlay'), registration.video);
            assert.equal(dom.window.__EVE_BEVY_VIDEO_ACTIVE_FOR_ID__('capture_video_overlay'), true);

            registration.video.__setPresentable();
            registration.video.__flushVideoFrame(0);
            registration.video.__flushVideoFrame(20);
            registration.video.__flushVideoFrame(70);
            assert.equal(dom.window.__EVE_BEVY_VIDEO_FRAME_VERSION_FOR_ID__('capture_video_overlay'), 2);
            assert.equal(dom.window.__EVE_BEVY_VIDEO_PRESENTABLE_FOR_ID__('capture_video_overlay'), true);
            assert.equal(getBevyVideoStreamSourceStatus({ id: 'capture_video_overlay', surface }).frameVersion, 2);
            assert.deepEqual(redraws.filter((frame) => frame.active).map((frame) => frame.frameVersion), [1, 2]);

            assert.equal(registration.dispose().removed, true);
            assert.equal(track.stopCalls, 0);
            assert.equal(calls.cancelVideoFrame >= 1, true);
            assert.equal(registration.video.srcObject, null);
            assert.equal(registration.video.isConnected, false);
            assert.equal(dom.window.__EVE_BEVY_VIDEO_SOURCE_FOR_ID__('capture_video_overlay'), null);
        });
    } finally {
        setBevyVideoRedrawRequester(surface, null);
        stopAllBevyVideoDecodeSources();
        delete globalThis.window;
        delete globalThis.document;
    }
});

test('prebound live source prevents URL video creation and replacement never stops either stream', async () => {
    const dom = new JSDOM('<!doctype html><html><body><canvas id="eve_surface_project"></canvas></body></html>');
    globalThis.document = dom.window.document;
    globalThis.window = dom.window;
    const surface = dom.window.document.getElementById('eve_surface_project');
    const firstTrack = makeTrack();
    const secondTrack = makeTrack();
    const firstStream = { getVideoTracks: () => [firstTrack] };
    const secondStream = { getVideoTracks: () => [secondTrack] };

    try {
        await withVideoStubs(dom.window, async (calls) => {
            const first = await registerBevyVideoStreamSource({
                id: 'capture_video_overlay_prebound',
                stream: firstStream,
                surface
            });
            syncBevyVideoDecodeSources(
                makeScene('capture_video_overlay_prebound', '/must-not-decode.webm'),
                surface
            );
            assert.equal(calls.videos.length, 1);
            assert.equal(first.video.style.opacity, '0');
            assert.equal(first.video.style.width, '1px');
            assert.equal(first.video.parentElement.id, 'eve_bevy_video_decode_root');

            const reused = await registerBevyVideoStreamSource({
                id: 'capture_video_overlay_prebound',
                stream: firstStream,
                surface
            });
            assert.equal(reused.reused, true);
            assert.equal(calls.videos.length, 1);

            const replacement = await registerBevyVideoStreamSource({
                id: 'capture_video_overlay_prebound',
                stream: secondStream,
                surface
            });
            assert.equal(replacement.ok, true);
            assert.equal(first.video.isConnected, false);
            assert.equal(firstTrack.stopCalls, 0);
            assert.equal(secondTrack.stopCalls, 0);
            assert.equal(dom.window.__EVE_BEVY_VIDEO_SOURCE_FOR_ID__('capture_video_overlay_prebound'), replacement.video);

            assert.equal(unregisterBevyVideoStreamSource({
                id: 'capture_video_overlay_prebound',
                surface
            }).removed, true);
            assert.equal(firstTrack.stopCalls, 0);
            assert.equal(secondTrack.stopCalls, 0);
        });
    } finally {
        syncBevyVideoDecodeSources({ nodes: [] }, surface);
        stopAllBevyVideoDecodeSources();
        delete globalThis.window;
        delete globalThis.document;
    }
});

test('fifty register/dispose cycles release every hidden decoder without taking recorder tracks', async () => {
    const dom = new JSDOM('<!doctype html><html><body><canvas id="eve_surface_project"></canvas></body></html>');
    globalThis.document = dom.window.document;
    globalThis.window = dom.window;
    const surface = dom.window.document.getElementById('eve_surface_project');
    const tracks = [];

    try {
        await withVideoStubs(dom.window, async (calls) => {
            for (let cycle = 0; cycle < 50; cycle += 1) {
                const track = makeTrack();
                tracks.push(track);
                const registration = await registerBevyVideoStreamSource({
                    id: 'capture_video_overlay_cycles',
                    stream: { getVideoTracks: () => [track] },
                    surface
                });
                registration.video.__setPresentable();
                registration.video.__flushVideoFrame(cycle * 70);
                assert.equal(registration.dispose().removed, true);
                assert.equal(dom.window.document.querySelectorAll('#eve_bevy_video_decode_root video').length, 0);
                assert.equal(getBevyVideoStreamSourceStatus({
                    id: 'capture_video_overlay_cycles',
                    surface
                }).exists, false);
            }

            assert.equal(calls.videos.length, 50);
            assert.equal(calls.cancelVideoFrame >= 50, true);
            assert.equal(tracks.every((track) => track.stopCalls === 0), true);
        });
    } finally {
        syncBevyVideoDecodeSources({ nodes: [] }, surface);
        stopAllBevyVideoDecodeSources();
        delete globalThis.window;
        delete globalThis.document;
    }
});
