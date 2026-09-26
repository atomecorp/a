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


test('Color affects all glyphs of a selected text without a visible range', async () => {
    const commits = [];
    globalThis.window = {
        addEventListener() {}, removeEventListener() {},
        Atome: {
            getStateCurrent: async () => ({ properties: { kind: 'text', text: 'Two colors',
                rich_text: { version: 1, spans: [{ start: 0, end: 3, color: '#ff0000', bold: true }] } } }),
            commit: async (event) => { commits.push(event); return { ok: true }; }
        }
    };
    const { applyColorToSelection } = await import('../../eVe/intuition/tools/selection_style_apply.js');
    const result = await applyColorToSelection('#00ff00', { selectionIds: ['colored_text'] });
    assert.equal(result.ok, true);
    const patch = commits.at(-1).props;
    assert.equal(patch.color, '#00ff00');
    assert.equal(patch.background, undefined);
    assert.deepEqual(patch.rich_text.spans, [
        { start: 0, end: 3, bold: true, color: '#00ff00' },
        { start: 3, end: 10, color: '#00ff00' }
    ]);
});

test('Color paints every selected SVG stroke without adding a fill or targeting an old SVG layer', async () => {
    globalThis.DOMParser = document.defaultView.DOMParser;
    globalThis.XMLSerializer = document.defaultView.XMLSerializer;
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0 L10 10" fill="none" stroke="red" stroke-opacity="0.5"/><path d="M0 5 L10 15" style="fill:none;stroke:blue"/></svg>';
    const records = new Map([['brush', { kind: 'shape', svg_markup: svg }], ['other', { kind: 'shape', svg_markup: svg }]]);
    const commits = [];
    globalThis.window = { addEventListener() {}, removeEventListener() {},
        eveSvgLayerApi: { getActiveContext: () => ({ atome_id: 'unselected', mode: 'project', selected_layer_id: 'root' }), getProjectSelection: () => ({ layer_id: 'root', layer_kind: 'svg' }) },
        Atome: { getStateCurrent: async (id) => ({ properties: records.get(id) }), commit: async (event) => { commits.push(event); return { ok: true }; } } };
    const { applyColorToSelection } = await import('../../eVe/intuition/tools/selection_style_apply.js');
    const result = await applyColorToSelection('#00ff00', { selectionIds: ['brush', 'other'] });
    assert.equal(result.ok, true);
    assert.deepEqual(commits.map((event) => event.atome_id).sort(), ['brush', 'other']);
    for (const event of commits) {
        const svg = new DOMParser().parseFromString(event.props.svg_markup, 'image/svg+xml');
        for (const path of svg.querySelectorAll('path')) {
            assert.equal(path.getAttribute('fill'), 'none');
            assert.equal(path.getAttribute('stroke'), '#00ff00');
            assert.ok(!path.style.stroke || path.style.stroke === '#00ff00');
        }
        assert.equal(svg.querySelector('path').getAttribute('stroke-opacity'), '0.5');
        assert.equal(event.props.background, undefined);
    }
});

test('selection style treatments recurse through nested Molecules without painting structural owners', async () => {
    const records = new Map([
        ['molecule_root', { atome_id: 'molecule_root', type: 'group', project_id: 'project_1', parent_id: 'project_1', properties: { kind: 'group' } }],
        ['text_child', { atome_id: 'text_child', type: 'text', project_id: 'project_1', parent_id: 'molecule_root', properties: { kind: 'text', text: 'Child' } }],
        ['molecule_nested', { atome_id: 'molecule_nested', type: 'group', project_id: 'project_1', parent_id: 'molecule_root', properties: { kind: 'group' } }],
        ['shape_nested', { atome_id: 'shape_nested', type: 'shape', project_id: 'project_1', parent_id: 'molecule_nested', properties: { kind: 'shape' } }],
        ['text_nested', { atome_id: 'text_nested', type: 'text', project_id: 'project_1', parent_id: 'molecule_nested', properties: { kind: 'text', text: 'Nested' } }],
        ['deleted_nested', { atome_id: 'deleted_nested', type: 'shape', project_id: 'project_1', parent_id: 'molecule_nested', __deleted: true, properties: { kind: 'shape' } }]
    ]);
    const commits = [];
    globalThis.window = {
        addEventListener() {}, removeEventListener() {},
        Atome: {
            getStateCurrent: async (id) => records.get(id),
            listStateCurrent: async () => ({ items: [...records.values()] }),
            commit: async (event) => { commits.push(event); return { ok: true }; }
        }
    };
    const { applyColorToSelection, applyFontToSelection } = await import('../../eVe/intuition/tools/selection_style_apply.js');
    const { applySelectionStyleMutation } = await import('../../eVe/intuition/tools/selection_style_atome.js');

    assert.equal((await applyColorToSelection('#336699', { selectionIds: ['molecule_root'] })).ok, true);
    assert.deepEqual(commits.splice(0).map((event) => event.atome_id), ['text_child', 'shape_nested', 'text_nested']);

    assert.equal((await applyFontToSelection('Georgia', { selectionIds: ['molecule_root'] })).ok, true);
    assert.deepEqual(commits.splice(0).map((event) => event.atome_id), ['text_child', 'text_nested']);

    assert.equal((await applySelectionStyleMutation(() => ({ opacity: 0.4 }), { selectionIds: ['molecule_root'] })).ok, true);
    assert.deepEqual(commits.map((event) => event.atome_id), ['text_child', 'shape_nested', 'text_nested']);
});

test('a selected Page paints its own frame and never reaches its members', async () => {
    const records = new Map([
        ['page_1', { atome_id: 'page_1', type: 'group', project_id: 'project_1', parent_id: 'project_1',
            properties: { kind: 'group', container_kind: 'page', name: 'Page', fill: '#ffffff' } }],
        ['text_in_page', { atome_id: 'text_in_page', type: 'text', project_id: 'project_1', parent_id: 'page_1',
            properties: { kind: 'text', text: 'Inside' } }],
        ['shape_in_page', { atome_id: 'shape_in_page', type: 'shape', project_id: 'project_1', parent_id: 'page_1',
            properties: { kind: 'shape' } }]
    ]);
    const commits = [];
    globalThis.window = {
        addEventListener() {}, removeEventListener() {},
        Atome: {
            getStateCurrent: async (id) => records.get(id),
            listStateCurrent: async () => ({ items: [...records.values()] }),
            commit: async (event) => { commits.push(event); return { ok: true }; }
        }
    };
    const { applyColorToSelection, applyFontToSelection } = await import('../../eVe/intuition/tools/selection_style_apply.js');
    const { applySelectionStyleMutation } = await import('../../eVe/intuition/tools/selection_style_atome.js');

    assert.equal((await applyColorToSelection('#336699', { selectionIds: ['page_1'] })).ok, true);
    const pageColorCommits = commits.splice(0);
    assert.deepEqual(pageColorCommits, [{ kind: 'set', atome_id: 'page_1', props: { fill: '#336699' } }]);

    // End to end: the property the tool writes is the one the render chain paints,
    // on the Page frame only; the members it holds stay untouched.
    const { createVirtualSceneTree } = await import('../../eVe/domains/rendering/virtual_scene_contract.js');
    const { mapVirtualSceneTreeToBevyPayload } = await import('../../eVe/domains/rendering/bevy_projection_adapter.js');
    const asRgb = (payload) => payload.color.slice(0, 3).map((component) => Math.round(component * 255));
    const payloadById = () => new Map(mapVirtualSceneTreeToBevyPayload(createVirtualSceneTree([...records.values()]))
        .map((payload) => [payload.id, payload]));
    const paintCommits = (events) => {
        for (const event of events) {
            const record = records.get(event.atome_id);
            records.set(event.atome_id, { ...record, properties: { ...record.properties, ...event.props } });
        }
    };
    paintCommits(pageColorCommits);
    assert.deepEqual(asRgb(payloadById().get('page_1')), [51, 102, 153]);
    assert.equal(payloadById().get('text_in_page').color, null);
    assert.equal(payloadById().get('shape_in_page').color, null);

    assert.equal((await applyFontToSelection('Georgia', { selectionIds: ['page_1'] })).ok, false);
    assert.deepEqual(commits, []);

    assert.equal((await applySelectionStyleMutation(() => ({ opacity: 0.4 }), { selectionIds: ['page_1'] })).ok, true);
    assert.deepEqual(commits.splice(0).map((event) => event.atome_id), ['page_1']);

    assert.equal((await applyColorToSelection('#ff0000', { selectionIds: ['text_in_page', 'page_1'] })).ok, true);
    const mixed = commits.splice(0);
    assert.deepEqual(mixed.map((event) => event.atome_id), ['text_in_page', 'page_1']);
    assert.deepEqual(mixed.map((event) => event.props.fill), [undefined, '#ff0000']);
    paintCommits(mixed);
    assert.deepEqual(asRgb(payloadById().get('page_1')), [255, 0, 0]);
    assert.deepEqual(asRgb(payloadById().get('text_in_page')), [255, 0, 0]);
});
