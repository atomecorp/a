import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { afterAll, test } from 'vitest';

import { createClipPreviewMetadataRuntime } from '../../eVe/domains/mtrax/clips/preview_metadata_runtime.js';

const dom = new JSDOM('<!doctype html><html><body></body></html>');
const originalDocument = globalThis.document;
globalThis.document = dom.window.document;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const cloneData = (value, defaultValue = null) => (
    value == null ? defaultValue : JSON.parse(JSON.stringify(value))
);
const hasObjectShape = (value) => !!(value && typeof value === 'object' && !Array.isArray(value));

const state = {
    persistRev: 0,
    previewMetadataByCacheKey: new Map(),
    previewRegistryById: new Map(),
    previewResourceUrlByDataUrl: new Map(),
    clips: []
};

const dataImage = (label) => `data:image/png;base64,${btoa(label)}`;

const createRuntime = () => createClipPreviewMetadataRuntime({
    getState: () => state,
    toKey: (value) => String(value ?? '').trim(),
    extractMediaIdentifier: (value) => String(value || '').split('/').pop(),
    hasObjectShape,
    cloneData,
    normalizeClipKind: (value, defaultValue = '') => String(value || defaultValue || '').trim().toLowerCase(),
    isAudioClipKind: (value) => String(value || '').trim().toLowerCase() === 'audio',
    mtrackClipWaveformMaxPeaks: 32,
    mtrackClipThumbMaxFrames: 12,
    clamp,
    getClipById: (id) => state.clips.find((clip) => clip.id === id) || null,
    buildRuntimeClipPreview: () => null,
    dispatchPreviewMetadataRequests: () => {}
});

test('clip preview metadata renders the cropped source window for audio and video', () => {
    const runtime = createRuntime();
    state.previewMetadataByCacheKey.set('audio:sound.wav:rev0', {
        waveform: {
            schema: 'eve.mtrax.preview.waveform.v1',
            cache_key: 'audio:sound.wav:rev0',
            status: 'ready',
            duration_seconds: 8,
            peaks: [0.10, 0.20, 0.30, 0.40, 0.50, 0.60, 0.70, 0.80]
        }
    });
    state.previewMetadataByCacheKey.set('video:movie.mp4:rev0', {
        thumbnails: {
            schema: 'eve.mtrax.preview.thumbnail.v1',
            cache_key: 'video:movie.mp4:rev0',
            status: 'ready',
            duration_seconds: 8,
            frames: [
                { data_url: dataImage('frame-0') },
                { data_url: dataImage('frame-1') },
                { data_url: dataImage('frame-2') },
                { data_url: dataImage('frame-3') },
                { data_url: dataImage('frame-4') },
                { data_url: dataImage('frame-5') },
                { data_url: dataImage('frame-6') },
                { data_url: dataImage('frame-7') }
            ]
        }
    });

    const audioClip = {
        id: 1,
        kind: 'audio',
        src: 'sound.wav',
        in: 2,
        out: 6,
        sourceDuration: 8,
        duration: 4,
        timelineDuration: 4,
        timelineLoopDuration: 4,
        timelinePhaseOffset: 0
    };
    const audioPreview = document.createElement('div');
    runtime.renderClipPreviewMetadata(audioPreview, audioClip);
    const waveformPath = audioPreview.querySelector('.eve-mtrack-clip-waveform-bars');

    assert.ok(waveformPath, 'audio waveform must render for a cropped source window');
    assert.match(audioPreview.dataset.previewId, /^preview_/);
    assert.equal(audioPreview.dataset.previewSignature, undefined);
    assert.equal(String(audioPreview.outerHTML).includes('data-preview-signature'), false);
    assert.match(waveformPath.getAttribute('d'), /0\.00 10\.16L0\.00 17\.84/);
    assert.match(waveformPath.getAttribute('d'), /100\.00 6\.32L100\.00 21\.68/);
    assert.doesNotMatch(waveformPath.getAttribute('d'), /12\.72L0\.00 15\.28/);
    assert.doesNotMatch(waveformPath.getAttribute('d'), /3\.76L100\.00 24\.24/);

    const videoClip = {
        id: 2,
        kind: 'video',
        src: 'movie.mp4',
        in: 2,
        out: 6,
        sourceDuration: 8,
        duration: 4,
        timelineDuration: 4,
        timelineLoopDuration: 4,
        timelinePhaseOffset: 0
    };
    const videoPreview = document.createElement('div');
    runtime.renderClipPreviewMetadata(videoPreview, videoClip);
    const renderedFrames = Array.from(videoPreview.querySelectorAll('.eve-mtrack-clip-thumb'))
        .map((node) => node.style.backgroundImage);

    assert.equal(renderedFrames.length, 4);
    assert.match(videoPreview.dataset.previewId, /^preview_/);
    assert.equal(videoPreview.dataset.previewSignature, undefined);
    assert.equal(String(videoPreview.outerHTML).includes('data-preview-signature'), false);
    assert.equal(String(videoPreview.outerHTML).includes('data:image'), false);
    const videoPayload = runtime.previewRegistry.get(videoPreview.dataset.previewId);
    assert.deepEqual(videoPayload.frames, [
        dataImage('frame-2'),
        dataImage('frame-3'),
        dataImage('frame-4'),
        dataImage('frame-5')
    ]);
    assert.equal(videoPayload.frames.includes(dataImage('frame-0')), false);
    assert.equal(videoPayload.frames.includes(dataImage('frame-7')), false);
});

afterAll(() => {
    if (originalDocument === undefined) {
        delete globalThis.document;
    } else {
        globalThis.document = originalDocument;
    }
});
