import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { test } from 'vitest';

import {
    beginProjectSceneTextEdit,
    clearAllProjectScenes,
    commitProjectSceneTextEdit,
    formatProjectSceneTextSelection,
    getProjectSceneState,
    renderProjectScene
} from '../../eVe/domains/rendering/project_scene_runtime.js';
import { readRecentProjectTextStyleSelection } from '../../eVe/domains/rendering/project_scene_text_edit_state.js';

const compositor = {
    default: async () => {}, resolve_bevy_media_texture: async () => ({ width: 1, height: 1, rgba: [0, 0, 0, 0] }),
    run_atome_bevy_renderer: () => {}, apply_atome_bevy_spawn: () => {}, apply_atome_bevy_despawn: () => {},
    apply_atome_bevy_transform: () => {}, apply_atome_bevy_style: () => {}, apply_atome_bevy_reparent: () => {},
    apply_atome_bevy_layer: () => {}, apply_atome_bevy_visibility: () => {}, apply_atome_bevy_resource: () => {},
    apply_atome_bevy_text_metadata: () => {}, apply_atome_bevy_surface: () => {}
};

test('project text selection remembers and commits Font/Size span styles through the hidden editor', async () => {
    clearAllProjectScenes();
    const dom = new JSDOM('<!doctype html><html><body><main id="project"></main></body></html>');
    dom.window.requestAnimationFrame = (callback) => dom.window.setTimeout(() => callback(Date.now()), 0);
    dom.window.cancelAnimationFrame = (id) => dom.window.clearTimeout(id);
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    const commits = [];
    dom.window.Atome = { commit: async (event) => { commits.push(event); return { ok: true }; } };
    await renderProjectScene({
        projectId: 'range_project', host: dom.window.document.getElementById('project'), compositor,
        records: [{
            id: 'range_text', type: 'text', revision: 1,
            properties: { kind: 'text', text: 'Hello world', left: 0, top: 0, width: 200, height: 60, text_style: { font_size: 16 } }
        }]
    });
    beginProjectSceneTextEdit({ projectId: 'range_project', atomeId: 'range_text', documentRef: dom.window.document });
    const editor = dom.window.document.querySelector('[data-role="active-text-editor"]');
    editor.selectionStart = 6;
    editor.selectionEnd = 11;
    editor.dispatchEvent(new dom.window.Event('select', { bubbles: true }));
    assert.deepEqual(readRecentProjectTextStyleSelection(), {
        projectId: 'range_project', atomeId: 'range_text', selection: { start: 6, end: 11 }
    });
    assert.equal(formatProjectSceneTextSelection({
        projectId: 'range_project', fontFamily: 'Georgia', fontSize: 36
    }).ok, true);
    assert.deepEqual(getProjectSceneState('range_project').records[0].properties.rich_text.spans, [
        { start: 6, end: 11, font_family: 'Georgia', font_size: 36 }
    ]);
    await commitProjectSceneTextEdit({ projectId: 'range_project' });
    assert.deepEqual(commits[0].props.rich_text.spans, [
        { start: 6, end: 11, font_family: 'Georgia', font_size: 36 }
    ]);
    assert.equal(dom.window.document.querySelectorAll('[data-role="active-text-editor"]').length, 0);
});
