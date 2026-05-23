import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { afterAll, test } from 'vitest';

import { createClipCropPreviewMaskRuntime } from '../../eVe/domains/mtrax/clips/crop_preview_mask_runtime.js';

const dom = new JSDOM('<!doctype html><html><body></body></html>');
const originalDocument = globalThis.document;
globalThis.document = dom.window.document;

const createPreviewElement = (width) => {
    const preview = document.createElement('div');
    preview.getBoundingClientRect = () => ({
        width,
        height: 20,
        left: 0,
        right: width,
        top: 0,
        bottom: 20
    });
    return preview;
};

const runtime = createClipCropPreviewMaskRuntime({
    clamp: (value, min, max) => Math.min(max, Math.max(min, value)),
    resolveClipTimelineDuration: (clip) => Number(clip?.timelineDuration || clip?.duration || 0)
});

test('left crop live mask keeps preview width and shifts cropped content out of view', () => {
    const preview = createPreviewElement(200);
    const clip = {
        in: 0,
        out: 10,
        duration: 10,
        timelineDuration: 10
    };
    const session = runtime.createClipCropPreviewMaskSession({
        clip,
        previewEl: preview,
        side: 'left',
        minClipDuration: 0.06
    });

    clip.in = 2;
    clip.duration = 8;
    clip.timelineDuration = 8;
    session.apply();

    assert.equal(preview.style.width, '200px');
    assert.equal(preview.style.right, 'auto');
    assert.equal(preview.style.left, '-40px');
    assert.equal(preview.dataset.cropPreviewMask, 'left');

    session.clear();

    assert.equal(preview.style.width, '');
    assert.equal(preview.style.right, '');
    assert.equal(preview.style.left, '');
    assert.equal(preview.dataset.cropPreviewMask, undefined);
});

test('right crop live mask keeps preview anchored so overflow hides the cropped tail', () => {
    const preview = createPreviewElement(200);
    const clip = {
        in: 0,
        out: 10,
        duration: 10,
        timelineDuration: 10
    };
    const session = runtime.createClipCropPreviewMaskSession({
        clip,
        previewEl: preview,
        side: 'right',
        minClipDuration: 0.06
    });

    clip.out = 7;
    clip.duration = 7;
    clip.timelineDuration = 7;
    session.apply();

    assert.equal(preview.style.width, '200px');
    assert.equal(preview.style.right, 'auto');
    assert.equal(preview.style.left, '0px');
    assert.equal(preview.dataset.cropPreviewMask, 'right');
});

afterAll(() => {
    if (originalDocument === undefined) {
        delete globalThis.document;
    } else {
        globalThis.document = originalDocument;
    }
});
