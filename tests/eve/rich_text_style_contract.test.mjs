import assert from 'node:assert/strict';
import { test } from 'vitest';
import { JSDOM } from 'jsdom';

import { clearBevyMediaTextureCache } from '../../eVe/domains/rendering/bevy_media_texture_cache.js';
import { createBrowserBevyMediaTextureResolver } from '../../eVe/domains/rendering/bevy_media_texture_resolver.js';
import {
    applyRichTextStyleToRange,
    normalizeRichText,
    resolveRichTextStyleAt
} from '../../eVe/domains/rendering/rich_text_style.js';
import { normalizeRenderAtom } from '../../eVe/domains/rendering/render_atom.js';
import { createTextEditingLayout } from '../../eVe/domains/rendering/text_editing_layout.js';

const installRecordingCanvas = (windowRef) => {
    const draws = [];
    const fills = [];
    windowRef.HTMLCanvasElement.prototype.getContext = function getContext() {
        const canvas = this;
        return {
            font: '10px sans-serif',
            beginPath: () => {}, clearRect: () => {}, clip: () => {}, rect: () => {},
            restore: () => {}, save: () => {}, scale: () => {}, strokeText: () => {},
            fillRect(x, y, width, height) { fills.push({ x, y, width, height }); },
            fillText(text, x, y) { draws.push({ text, x, y, font: this.font }); },
            getImageData: () => ({ data: new Uint8ClampedArray(Math.max(1, canvas.width * canvas.height * 4)) }),
            measureText(text) {
                const size = Number(/([0-9.]+)px/.exec(this.font)?.[1] || 10);
                const familyScale = /Georgia/.test(this.font) ? 1.5 : 1;
                return { width: String(text || '').length * size * familyScale };
            }
        };
    };
    return { draws, fills };
};

test('rich text range formatting preserves, splits, and merges canonical span styles', () => {
    const initial = {
        version: 1,
        spans: [
            { start: 0, end: 8, bold: true },
            { start: 2, end: 6, color: '#ff3344' }
        ]
    };
    const withFont = applyRichTextStyleToRange(initial, { start: 3, end: 7 }, { font_family: 'Georgia' }, 8);
    const withSize = applyRichTextStyleToRange(withFont, { start: 3, end: 7 }, { font_size: 36 }, 8);
    assert.deepEqual(withSize.spans, [
        { start: 0, end: 2, bold: true },
        { start: 2, end: 3, bold: true, color: '#ff3344' },
        { start: 3, end: 6, bold: true, color: '#ff3344', font_family: 'Georgia', font_size: 36 },
        { start: 6, end: 7, bold: true, font_family: 'Georgia', font_size: 36 },
        { start: 7, end: 8, bold: true }
    ]);
    assert.deepEqual(resolveRichTextStyleAt(withSize.spans, 4, {}), {
        bold: true, color: '#ff3344', font_family: 'Georgia', font_size: 36
    });
    assert.deepEqual(normalizeRichText(withSize, 8), withSize);
});

test('RenderAtom and text layout consume whole-text and span font properties without DOM authority', () => {
    const atom = normalizeRenderAtom({
        id: 'styled_text',
        type: 'text',
        properties: {
            kind: 'text', text: 'Wide', width: 200, height: 80,
            font_family: 'Georgia', font_size: 18,
            rich_text: { version: 1, spans: [{ start: 0, end: 2, font_family: 'monospace', font_size: 36 }] }
        }
    });
    assert.equal(atom.style.text.font_family, 'Georgia');
    assert.equal(atom.style.text.font_size, 18);
    const plain = createTextEditingLayout({ value: 'Wide', bounds: atom.bounds, style: atom.style.text });
    const styled = createTextEditingLayout({
        value: 'Wide', bounds: atom.bounds, style: atom.style.text, richText: atom.content.richText
    });
    assert.ok(styled.contentWidth > plain.contentWidth);
    assert.ok(styled.lines[0].height > plain.lines[0].height);
});

test('text rasterization draws each styled range with its own font and measured advance', async () => {
    clearBevyMediaTextureCache();
    const dom = new JSDOM('<!doctype html><html><body></body></html>');
    const recording = installRecordingCanvas(dom.window);
    const richText = {
        version: 1,
        spans: [{ start: 1, end: 4, font_family: 'Georgia', font_size: 60 }],
        editing: true,
        selection: { start: 1, end: 4 }
    };
    const resolver = createBrowserBevyMediaTextureResolver({
        documentRef: dom.window.document,
        textTextureScale: 1
    });
    await resolver({
        id: 'styled_hello', kind: 'text', bounds: { width: 500, height: 100 },
        material: { fill: '#ffffff' },
        text: { text: 'Hello', richText, style: { font_family: 'Arial', font_size: 20, padding_x: 0 } },
        content: { text: 'Hello', richText }
    });

    assert.deepEqual(recording.draws.map(({ text, x, font }) => ({ text, x, font })), [
        { text: 'H', x: 0, font: '400 20px Arial' },
        { text: 'ell', x: 20, font: '400 60px Georgia' },
        { text: 'o', x: 290, font: '400 20px Arial' }
    ]);
    assert.deepEqual(recording.fills[0], { x: 20, y: 0, width: 270, height: 72 });
});

test('single-character and edge ranges keep half-open font boundaries', () => {
    let richText = applyRichTextStyleToRange({}, { start: 0, end: 1 }, { font_family: 'Georgia' }, 5);
    richText = applyRichTextStyleToRange(richText, { start: 2, end: 3 }, { font_size: 40 }, 5);
    richText = applyRichTextStyleToRange(richText, { start: 4, end: 5 }, {
        font_family: 'Georgia', font_size: 40
    }, 5);

    assert.deepEqual(richText.spans, [
        { start: 0, end: 1, font_family: 'Georgia' },
        { start: 2, end: 3, font_size: 40 },
        { start: 4, end: 5, font_family: 'Georgia', font_size: 40 }
    ]);
    assert.deepEqual(resolveRichTextStyleAt(richText.spans, 1, {}), {});
    assert.deepEqual(resolveRichTextStyleAt(richText.spans, 3, {}), {});
});
