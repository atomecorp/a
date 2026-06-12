import assert from 'node:assert/strict';
import { test } from 'vitest';
import { JSDOM } from 'jsdom';

import {
    beginProjectSceneTextEdit,
    clearAllProjectScenes,
    commitProjectSceneTextEdit,
    getProjectSceneState,
    renderProjectScene
} from '../../eVe/domains/rendering/project_scene_runtime.js';
import { buildAtomGraph } from '../../atome/shared/atom_graph.js';
import { buildAccessibilityGraph } from '../../atome/shared/accessibility_graph.js';
import { buildAccessibilityBridgeProjection } from '../../atome/shared/accessibility_bridge_contract.js';

const createTestCompositor = (calls = []) => ({
    default: async () => calls.push({ type: 'init' }),
    resolve_bevy_media_texture: async () => ({
        width: 1,
        height: 1,
        rgba: [255, 0, 0, 255]
    }),
    run_atome_bevy_renderer: (canvasSelector, width, height, initialNodes) => {
        calls.push({ type: 'run', canvasSelector, width, height, initialNodes });
    }
});

const installAnimationFrame = (win) => {
    win.requestAnimationFrame = (callback) => win.setTimeout(() => callback(Date.now()), 0);
    win.cancelAnimationFrame = (id) => win.clearTimeout(id);
    globalThis.requestAnimationFrame = win.requestAnimationFrame;
    globalThis.cancelAnimationFrame = win.cancelAnimationFrame;
};

const flushBevyRun = () => new Promise((resolve) => setTimeout(resolve, 0));

const idsFor = (projectId) => ({
    project: projectId,
    text: `${projectId}_text`,
    action: `${projectId}_action`
});

const makeGraphRecords = (projectId) => {
    const ids = idsFor(projectId);
    return [{
        id: ids.project,
        type: 'project',
        revision: 1,
        properties: {
            kind: 'project',
            accessibility: {
                label: 'Inline edit smoke project',
                reading_order: 0
            }
        }
    }, {
        id: ids.text,
        type: 'text',
        parent_id: ids.project,
        revision: 1,
        properties: {
            kind: 'text',
            left: 8,
            top: 12,
            width: 180,
            height: 44,
            z_index: 2,
            order: 2,
            text: 'Initial inline text',
            accessibility: {
                reading_order: 10,
                focus_order: 2,
                actions: [
                    { type: 'edit', label: 'Edit inline text' }
                ]
            }
        }
    }, {
        id: ids.action,
        type: 'shape',
        parent_id: ids.project,
        revision: 1,
        properties: {
            kind: 'shape',
            left: 210,
            top: 12,
            width: 64,
            height: 44,
            z_index: 1,
            order: 1,
            accessibility: {
                role: 'button',
                label: 'Open inspector',
                reading_order: 20,
                focus_order: 1,
                actions: [
                    { type: 'activate', label: 'Open inspector' }
                ]
            }
        }
    }];
};

const renderableRecordsFrom = (records) => records.filter((record) => record.type !== 'project');

const buildBridgeFrom = ({ projectId, records, commits }) => {
    const atomGraph = buildAtomGraph({
        id: `${projectId}_atom_graph`,
        records,
        events: commits
    });
    const accessibilityGraph = buildAccessibilityGraph({
        id: `${projectId}_accessibility_graph`,
        atomGraph
    });
    const bridge = buildAccessibilityBridgeProjection({
        id: `${projectId}_accessibility_bridge`,
        accessibilityGraph
    });
    return { atomGraph, accessibilityGraph, bridge };
};

const installDom = ({ url, nativeCalls }) => {
    const dom = new JSDOM('<!doctype html><html><body><main id="project"></main></body></html>', {
        url,
        pretendToBeVisual: true
    });
    installAnimationFrame(dom.window);
    globalThis.document = dom.window.document;
    globalThis.window = dom.window;
    globalThis.Element = dom.window.Element;
    globalThis.HTMLElement = dom.window.HTMLElement;
    if (url.startsWith('tauri://')) {
        dom.window.__TAURI_INTERNALS__ = {
            invoke: async (command, payload) => {
                nativeCalls.push({ command, payload });
                return {
                    success: true,
                    native: true,
                    presentable: false,
                    renderer_mode: 'embedded_scene'
                };
            }
        };
    }
    return dom;
};

const runInlineEditAccessibilitySmoke = async ({ projectId, url }) => {
    clearAllProjectScenes();
    const nativeCalls = [];
    const dom = installDom({ url, nativeCalls });
    const commits = [];
    dom.window.Atome = {
        commit: async (event) => {
            commits.push(event);
            return { ok: true };
        }
    };
    const records = makeGraphRecords(projectId);
    const webCalls = [];
    const host = dom.window.document.getElementById('project');

    const projection = await renderProjectScene({
        projectId,
        projectRevision: 1,
        records: renderableRecordsFrom(records),
        host,
        compositor: createTestCompositor(webCalls)
    });
    await flushBevyRun();

    assert.equal(projection.ok, true);
    assert.equal(webCalls.filter((call) => call.type === 'run').length, 1);
    assert.equal(dom.window.document.querySelectorAll('canvas#eve_surface_project').length, 1);
    assert.equal(dom.window.document.querySelectorAll('.eve-atome,img,video,audio,svg').length, 0);

    const ids = idsFor(projectId);
    const started = beginProjectSceneTextEdit({
        projectId,
        atomeId: ids.text,
        documentRef: dom.window.document
    });
    assert.equal(started.atome_id, ids.text);
    assert.equal(started.inline_edit_session.project_id, projectId);
    assert.equal(started.inline_edit_session.atom_id, ids.text);
    assert.equal(dom.window.document.querySelectorAll('.eve-atome-text,[data-atome-id]').length, 0);
    assert.equal(dom.window.document.querySelectorAll('[data-role="active-text-editor"]').length, 1);

    const nextText = `Committed ${projectId} text`;
    const editor = dom.window.document.querySelector('[data-role="active-text-editor"]');
    editor.value = nextText;
    editor.selectionStart = nextText.length;
    editor.selectionEnd = nextText.length;
    editor.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    assert.equal(getProjectSceneState(projectId).text.inline_edit_session.draft_value, nextText);
    assert.equal(getProjectSceneState(projectId).records.find((record) => record.id === ids.text).properties.text, nextText);

    const committed = await commitProjectSceneTextEdit({ projectId });
    assert.equal(committed.committed, true);
    assert.equal(commits.length, 1);
    assert.equal(commits[0].kind, 'set');
    assert.equal(commits[0].project_id, projectId);
    assert.equal(commits[0].atome_id, ids.text);
    assert.equal(commits[0].tx_id, started.inline_edit_session.tx_id);
    assert.equal(commits[0].props.text, nextText);
    assert.equal(dom.window.document.querySelectorAll('[data-role="active-text-editor"]').length, 0);
    assert.equal(getProjectSceneState(projectId).text.inline_edit_session, null);

    const { atomGraph, accessibilityGraph, bridge } = buildBridgeFrom({
        projectId,
        records,
        commits
    });
    assert.deepEqual(atomGraph.orders.semantic, [ids.project, ids.text, ids.action]);
    assert.deepEqual(accessibilityGraph.orders.reading, [ids.project, ids.text, ids.action]);
    assert.deepEqual(bridge.orders.reading, [ids.project, ids.text, ids.action]);
    assert.deepEqual(bridge.orders.focus, [ids.action, ids.text]);
    assert.equal(bridge.disposable, true);
    assert.equal(bridge.byId.get(ids.text).label, nextText);
    assert.deepEqual(bridge.byId.get(ids.text).actions.map((action) => action.type), ['edit']);
    assert.deepEqual(bridge.byId.get(ids.action).actions.map((action) => action.type), ['activate']);
    assert.equal(JSON.stringify(bridge.nodes).includes('selector'), false);
    assert.equal(JSON.stringify(bridge.nodes).includes('element'), false);

    return { dom, nativeCalls };
};

test('browser project scene inline edit rebuilds the accessibility bridge from committed graph state', async () => {
    await runInlineEditAccessibilitySmoke({
        projectId: 'browser_inline_edit_bridge_smoke',
        url: 'http://127.0.0.1:3001/'
    });
});

test('Tauri WebView project scene keeps Bevy canvas visible and rebuilds the accessibility bridge after inline edit', async () => {
    const { nativeCalls } = await runInlineEditAccessibilitySmoke({
        projectId: 'tauri_inline_edit_bridge_smoke',
        url: 'tauri://localhost/'
    });
    assert.equal(nativeCalls.length, 0);
});
