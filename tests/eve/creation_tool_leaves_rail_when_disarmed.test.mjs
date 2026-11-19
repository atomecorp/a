import assert from 'node:assert/strict';
import { test, afterEach } from 'vitest';
import { installDom, findNode } from './bevy_ui_main_menu_test_helpers.mjs';
import { createMainMenuCreateContent } from '../../eVe/intuition/runtime/eve_intuition/main_menu_create_content_runtime.js';
import { createAtomeContextualEditRuntime } from '../../eVe/intuition/runtime/eve_intuition/atome_contextual_edit_runtime.js';
import { setMainMenuRuntime } from '../../eVe/intuition/ribbon/bevy_ui_product_registry.js';
import { writeArmedToolState } from '../../eVe/intuition/tools/core/armed_tool_state.js';

// A creation tool resides in the contextual rail only while it is armed: once
// disarmed (the text made, another context chosen) its case leaves every rail
// (user, 19 Nov. 2026: « je ne suis pas sur l'outil texte, donc je ne vais pas
// avoir l'outil texte qui reste à l'écran »).
let cleanup = () => {};
afterEach(() => { cleanup(); cleanup = () => {}; });

test('a disarmed creation tool leaves no case in the contextual rail', async () => {
    const dom = installDom();
    const catalog = createMainMenuCreateContent({ translate: (_key, value) => value, drawToolId: 'tool.main.draw' });
    const active = { text: false };
    window.__eveWorkspaceMode = { mode: 'project', projectId: 'p' };
    window.__currentProject = { id: 'p' };
    setMainMenuRuntime({ getContent: () => catalog, setToolLatchedState: () => {} });
    window.__eveTextTool = { isActive: () => active.text, deactivate: () => { active.text = false; } };
    cleanup = () => { writeArmedToolState({}); setMainMenuRuntime(null); dom.dom.window.close(); dom.restore(); };
    const record = { id: 'shape_1', type: 'shape', project_id: 'p', properties: {} };
    const scene = { project_id: 'p', records: [record], scene: { byId: new Map() } };
    const runtime = createAtomeContextualEditRuntime({
        legacyState: {}, resolveDefinitions: () => [{ key: 'info', label: 'Info', icon: 'info', toolId: 'ui.detail.panel' }],
        invokeDefinition: async () => ({ ok: true }), readMenuAccess: async () => ({}),
        surfaceResolver: () => dom.surface,
        bevyRuntimeResolver: () => ({ mountTree: async () => {}, updateTree: async () => {}, unmountTree: async () => {}, updateTreeMotion: () => {} }),
        findSceneByAtomeId: (id) => (id === record.id ? scene : null)
    });
    runtime.enter({ atomeId: record.id, record });
    active.text = true;
    writeArmedToolState({ tool: 'text', projectId: 'p' });
    assert.ok(findNode((await runtime.render()).root, 'atome_contextual_tool_text_create'), 'the armed text tool resides in the rail');
    active.text = false;
    writeArmedToolState({});
    const tree = await runtime.render();
    assert.ok(findNode(tree.root, 'atome_contextual_tool_info'), 'the object keeps its own rail');
    assert.equal(findNode(tree.root, 'atome_contextual_tool_text_create'), null, 'the disarmed text tool has left the rail');
});
