import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, test } from 'vitest';

import {
    clearRecentProjectTextStyleSelection,
    rememberProjectTextStyleSelection
} from '../../eVe/domains/rendering/project_scene_text_edit_state.js';

beforeEach(() => {
    const dom = new JSDOM('<!doctype html><html><body></body></html>');
    globalThis.document = dom.window.document;
    globalThis.HTMLElement = dom.window.HTMLElement;
    globalThis.Element = dom.window.Element;
    globalThis.Node = dom.window.Node;
});

afterEach(() => {
    clearRecentProjectTextStyleSelection();
    delete globalThis.window;
    delete globalThis.document;
});

test('Font and Size persist a remembered project text range through canonical commits', async () => {
    const records = new Map([['text_1', {
        kind: 'text', text: 'Hello world', rich_text: { version: 1, spans: [{ start: 0, end: 5, bold: true }] }
    }]]);
    const commits = [];
    globalThis.window = {
        addEventListener: () => {},
        removeEventListener: () => {},
        Atome: {
            getStateCurrent: async (id) => ({ properties: records.get(id) }),
            commit: async (event) => {
                commits.push(event);
                records.set(event.atome_id, { ...records.get(event.atome_id), ...event.props });
                return { ok: true };
            }
        }
    };
    const { applyFontToSelection, applySizeToSelection } = await import('../../eVe/intuition/tools/selection_style_apply.js');
    rememberProjectTextStyleSelection({
        projectId: 'project_1', atomeId: 'text_1', selection: { start: 6, end: 11 }
    });
    assert.equal((await applyFontToSelection('Georgia')).applied, true);
    assert.deepEqual(commits.at(-1).props.rich_text.spans, [
        { start: 0, end: 5, bold: true },
        { start: 6, end: 11, font_family: 'Georgia' }
    ]);
    assert.equal((await applySizeToSelection(36)).applied, true);
    assert.deepEqual(commits.at(-1).props.rich_text.spans, [
        { start: 0, end: 5, bold: true },
        { start: 6, end: 11, font_family: 'Georgia', font_size: 36 }
    ]);
});

test('whole-Atome Font uses the canonical key and ignores non-text Atomes', async () => {
    const records = new Map([
        ['text_2', { kind: 'text', text: 'Whole text' }],
        ['shape_1', { kind: 'shape', width: 40, height: 40 }]
    ]);
    const commits = [];
    globalThis.window = {
        addEventListener: () => {},
        removeEventListener: () => {},
        Atome: {
            getStateCurrent: async (id) => ({ properties: records.get(id) }),
            commit: async (event) => { commits.push(event); return { ok: true }; }
        }
    };
    const { applyFontToSelection } = await import('../../eVe/intuition/tools/selection_style_apply.js');
    const textResult = await applyFontToSelection('Verdana', { selectionIds: ['text_2'] });
    assert.equal(textResult.ok, true);
    assert.deepEqual(commits.at(-1).props, { font_family: 'Verdana' });
    const beforeShape = commits.length;
    const shapeResult = await applyFontToSelection('Verdana', { selectionIds: ['shape_1'] });
    assert.equal(shapeResult.ok, false);
    assert.equal(commits.length, beforeShape);
});
