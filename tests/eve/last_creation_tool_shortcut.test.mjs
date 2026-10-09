import assert from 'node:assert/strict';
import { test, afterEach, vi } from 'vitest';
import { installDom, findNode, waitFrame } from './bevy_ui_main_menu_test_helpers.mjs';
import { createMainMenuCreateContent, createMainMenuCreateInvocationRuntime } from '../../eVe/intuition/runtime/eve_intuition/main_menu_create_content_runtime.js';
import { createContextToolInvocationRuntime } from '../../eVe/intuition/runtime/eve_intuition/context_tool_invocation_runtime.js';
import { createAtomeContextualEditRuntime } from '../../eVe/intuition/runtime/eve_intuition/atome_contextual_edit_runtime.js';
import { createAtomeContextualRailDefinitionInvocationRuntime } from '../../eVe/intuition/runtime/eve_intuition/atome_contextual_rail_definition_invocation_runtime.js';
import { buildAtomeContextualEditTree } from '../../eVe/intuition/runtime/eve_intuition/atome_contextual_edit_model.js';
import { readLastCreationRailToolEntry, readCreationToolContentKey } from '../../eVe/intuition/tools/core/active_tool_registry.js';
import { readArmedToolState, writeArmedToolState, rememberLastCreationTool, readLastCreationTool } from '../../eVe/intuition/tools/core/armed_tool_state.js';
import { normalizeCatalogToolEntry } from '../../eVe/intuition/tools/core/tool_definition_ssot.js';
import { setMainMenuRuntime } from '../../eVe/intuition/ribbon/bevy_ui_product_registry.js';
import { restoreProjectWorkModeValue } from '../../eVe/domains/rendering/project_work_mode_state.js';
import * as viewMode from '../../eVe/domains/rendering/project_view_mode_state.js';

vi.mock('../../eVe/domains/rendering/project_view_creation_runtime.js', () => ({
    projectViewCreationRuntime: { prepareTool: async () => ({ ok: true }), finishTool: async () => ({ ok: true }), isActive: () => false }
}));

let cleanup = () => {};
afterEach(() => { cleanup(); cleanup = () => {}; vi.restoreAllMocks(); });
const content = () => createMainMenuCreateContent({ translate: (_key, value) => value, drawToolId: 'tool.main.draw' });
const setup = () => {
    const dom = installDom();
    const previousMemory = readLastCreationTool();
    const catalog = content();
    const active = { text: false, draw: false, code: false };
    const calls = [];
    window.__eveWorkspaceMode = { mode: 'project', projectId: 'shortcut_project' };
    window.__currentProject = { id: 'shortcut_project' };
    const latches = new Map();
    setMainMenuRuntime({ getContent: () => catalog, setToolLatchedState: ({ tool_id, latched }) => latches.set(tool_id, latched) });
    window.__eveTextTool = { isActive: () => active.text, deactivate: () => { active.text = false; } };
    window.__eveDrawTool = { isActive: () => active.draw, deactivate: () => { active.draw = false; }, getBrushSize: () => 37 };
    window.eveCodeToolApi = { isOpen: () => active.code, close: () => { active.code = false; } };
    window.eveProjectViewCreationApi = { finishTool: async () => ({ ok: true }) };
    const ids = { 'ui.text.create': 'text', 'tool.main.draw': 'draw', 'ui.code.editor': 'code' };
    const gateway = async ({ toolId, actionOverride }) => {
        calls.push([toolId, actionOverride]);
        active[ids[toolId]] = actionOverride === 'state.on';
        return { ok: true, active: active[ids[toolId]] };
    };
    // Limit this fixture's family to its three gateway runtimes.
    for (const key of ['text_create', 'draw_create', 'code_create']) catalog[key].extra_input.create_tool_ids = Object.keys(ids);
    const create = createMainMenuCreateInvocationRuntime({ invokeToolFromUiButton: gateway, prepareTool: async () => ({}), finishTool: async () => ({}) });
    const unified = createContextToolInvocationRuntime({ getFinderToolEl: () => null, handleFinderTouch: () => null, invokeToolFromUiButton: gateway });
    const railInvocation = createAtomeContextualRailDefinitionInvocationRuntime({
        state: {}, ensureDeletePanelModule: async () => {}, maybeBlockSelectionRequiredToolActivation: () => null,
        handleFinderTouch: () => null, getFinderToolEl: () => null, invokeToolFromUiButton: gateway,
        invokeUnifiedContextTool: unified.invokeUnifiedContextTool, resolveDefinitionToolId: definition => definition.toolId,
        buildToolExtraInput: () => ({}), isContextBoundTransportToolId: () => false
    });
    const definition = key => normalizeCatalogToolEntry({ key, def: catalog[key] });
    cleanup = () => {
        restoreProjectWorkModeValue('shortcut_project', 'edit');
        writeArmedToolState({});
        rememberLastCreationTool(previousMemory || '__test_unavailable__');
        setMainMenuRuntime(null);
        dom.dom.window.close();
        dom.restore();
    };
    return { ...dom, catalog, active, calls, latches, create, railInvocation, definition };
};

test('disarming and unrelated context updates retain one last creation tool', () => {
    writeArmedToolState({ tool: 'draw', projectId: 'one' });
    writeArmedToolState({});
    assert.deepEqual(readArmedToolState(), { tool: '', projectId: '' });
    assert.equal(readLastCreationTool(), 'draw');
    writeArmedToolState({ tool: 'text', projectId: 'two' });
    writeArmedToolState({});
    assert.equal(readLastCreationTool(), 'text');
});

test('compatible creation shortcuts retain their canonical command and options', () => {
    const { catalog } = setup();
    for (const tool of ['text', 'draw', 'code', 'page', 'placeholder', 'shape', 'generator']) {
        rememberLastCreationTool(tool);
        const slot = readLastCreationRailToolEntry();
        assert.equal(slot.key, readCreationToolContentKey(tool));
        assert.equal(slot.active, false);
        assert.equal(slot.toolId, catalog[slot.key].tool_id);
        assert.deepEqual(slot.extraInput, catalog[slot.key].extra_input);
    }
    rememberLastCreationTool('template');
    assert.equal(readLastCreationRailToolEntry(), null, 'no invented entry for an unavailable Create command');
});

test('the lower slot alternates native stop and canonical Create activation repeatedly', async () => {
    const h = setup();
    const invoke = async key => h.create.invoke({ definition: h.definition(key) });
    await invoke('draw_create');
    const records = ['one', 'two'].map(id => ({ id, project_id: 'shortcut_project', type: 'shape', properties: { width: 100, height: 100 } }));
    const scene = { project_id: 'shortcut_project', records, scene: { byId: new Map() } };
    const motions = [];
    const runtime = createAtomeContextualEditRuntime({
        legacyState: {}, resolveDefinitions: () => [{ key: 'delete', label: 'Delete', icon: 'delete', toolId: 'ui.delete' }],
        invokeDefinition: h.railInvocation.invokeAtomeContextualRailToolDefinitionWithContext,
        readMenuAccess: async () => ({}), surfaceResolver: () => h.surface,
        bevyRuntimeResolver: () => ({ mountTree: async () => {}, updateTree: async () => {}, unmountTree: async () => {}, updateTreeMotion: ({ updates }) => motions.push(updates) }),
        findSceneByAtomeId: id => records.some(record => record.id === id) ? scene : null
    });
    const slot = async key => findNode((await runtime.render())?.root, `atome_contextual_tool_${key}`);
    const activate = async node => { node.on.activate(); await waitFrame(); await waitFrame(); };
    runtime.enter({ atomeId: records[0].id, record: records[0] });
    const before = await slot('draw_create');
    for (let index = 0; index < 4; index++) {
        await activate(await slot('draw_create'));
        assert.equal(h.active.draw, false);
        writeArmedToolState({});
        runtime.enter({ atomeId: records[index % 2].id, record: records[index % 2] });
        const stopped = await slot('draw_create');
        assert.ok(stopped, 'selection retains the stopped shortcut');
        assert.deepEqual(stopped.style.position, before.style.position);
        assert.equal(stopped.style.translation, undefined);
        const motionCount = motions.length;
        await new Promise(resolve => setTimeout(resolve, 100));
        assert.equal(motions.length, motionCount, 'an inactive shortcut owns no pulse timer');
        // A retained node still carries its earlier active paint: live state wins.
        await activate(index === 0 ? before : stopped);
        assert.equal(h.active.draw, true);
        assert.deepEqual((await slot('draw_create')).style.translation, [0, 2]);
        assert.equal(h.latches.get('tool.main.draw'), true);
        assert.equal(window.__eveDrawTool.getBrushSize(), 37, 'native tool options survive each cycle');
    }
    await invoke('text_create');
    assert.equal(h.active.draw, false);
    assert.equal(await slot('draw_create'), null);
    const text = await slot('text_create');
    assert.ok(text);
    await activate(text);
    assert.equal(h.active.text, false);
    runtime.clear();
    assert.equal(await slot('text_create'), null, 'the shortcut disappears together with the rail');
    assert.equal(readLastCreationTool(), 'text', 'closing the rail preserves memory');
    runtime.enter({ atomeId: records[0].id, record: records[0] });
    assert.ok(await slot('text_create'), 'reopening the rail restores the same shortcut');
    runtime.setSuspended(true);
    assert.equal(await runtime.render(), null, 'Dashboard suspension does not mount an extra bar');
    runtime.setSuspended(false);
    restoreProjectWorkModeValue('shortcut_project', 'consultation');
    assert.equal(await slot('text_create'), null, 'a stopped creation shortcut stays hidden outside edit mode');
    await activate(text);
    assert.equal(h.active.text, false, 'a stale node cannot bypass the current work mode');
    restoreProjectWorkModeValue('shortcut_project', 'edit');
    assert.ok(await slot('text_create'));
    runtime.setSuspended(true); await runtime.render();
});

test('the shortcut follows existing expertise and view contexts without bypassing work modes', async () => {
    const h = setup();
    rememberLastCreationTool('text');
    const runtime = createAtomeContextualEditRuntime({
        legacyState: {}, resolveDefinitions: () => [], invokeDefinition: h.railInvocation.invokeAtomeContextualRailToolDefinitionWithContext,
        surfaceResolver: () => h.surface, bevyRuntimeResolver: () => ({ mountTree: async () => {}, updateTree: async () => {}, unmountTree: async () => {}, updateTreeMotion: () => {} }),
        findSceneByAtomeId: () => null
    });
    const modeReader = vi.spyOn(viewMode, 'getProjectViewMode');
    runtime.enterVirtual({ atomeId: 'shortcut_project', projectId: 'shortcut_project', kind: 'project',
        record: { id: 'shortcut_project', type: 'project', properties: {} }, definitions: [], invokeDefinition: async () => ({ ok: true }) });
    for (const level of ['beginner', 'intermediate', 'advanced']) {
        window.__eveProfilePreferences = { visual: { masteryLevel: level } };
        for (const mode of ['natural', 'list', 'table', 'matrix']) {
            modeReader.mockReturnValue(mode);
            assert.ok(findNode((await runtime.render()).root, 'atome_contextual_tool_text_create'), `${level}/${mode}`);
        }
    }
    for (const mode of ['consultation', 'performance']) {
        restoreProjectWorkModeValue('shortcut_project', mode);
        assert.equal(findNode((await runtime.render())?.root, 'atome_contextual_tool_text_create'), null, mode);
    }
    restoreProjectWorkModeValue('shortcut_project', 'edit');
    window.__eveWorkspaceMode = { mode: 'dashboard' };
    runtime.setSuspended(true);
    assert.equal(await runtime.render(), null);
    runtime.setSuspended(true); await runtime.render();
});

test('a remembered creation case never mounts alone when its contextual rail closes', async () => {
    const h = setup();
    rememberLastCreationTool('draw');
    const record = { id: 'selected_shape', type: 'shape', project_id: 'shortcut_project', properties: {} };
    const scene = { project_id: 'shortcut_project', records: [record], scene: { byId: new Map() } };
    const runtime = createAtomeContextualEditRuntime({
        legacyState: {}, resolveDefinitions: () => [{ key: 'info', label: 'Info', icon: 'info', toolId: 'ui.detail.panel' }],
        invokeDefinition: h.railInvocation.invokeAtomeContextualRailToolDefinitionWithContext, readMenuAccess: async () => ({}),
        surfaceResolver: () => h.surface, bevyRuntimeResolver: () => ({ mountTree: async () => {}, updateTree: async () => {}, unmountTree: async () => {}, updateTreeMotion: () => {} }),
        findSceneByAtomeId: id => id === record.id ? scene : null
    });
    for (const active of [false, true]) {
        h.active.draw = active;
        assert.equal(await runtime.render(), null, `no contextual target, active=${active}`);
        runtime.enter({ atomeId: record.id, record });
        assert.ok(findNode((await runtime.render()).root, 'atome_contextual_tool_draw_create'));
        runtime.exit({ atomeId: record.id });
        assert.equal(await runtime.render(), null, `exit hides the case, active=${active}`);
        assert.equal(readLastCreationTool(), 'draw');
        runtime.enter({ atomeId: record.id, record });
        assert.ok(findNode((await runtime.render()).root, 'atome_contextual_tool_draw_create'));
        runtime.clear();
        assert.equal(await runtime.render(), null, `clear hides the case, active=${active}`);
        assert.equal(readLastCreationTool(), 'draw');
    }
    h.active.draw = false;
    h.window.requestAnimationFrame = () => 1;
    h.window.__selectedAtomeIds = [record.id];
    runtime.install();
    assert.ok(findNode((await runtime.render()).root, 'atome_contextual_tool_draw_create'));
    h.window.__selectedAtomeIds = [];
    h.window.dispatchEvent(new h.window.CustomEvent('adole-atome-selected', { detail: { selected: [], atomeId: null } }));
    assert.equal(await runtime.render(), null, 'background deselection closes the rail and its shortcut');
    h.window.__selectedAtomeIds = [record.id];
    h.window.dispatchEvent(new h.window.CustomEvent('adole-atome-selected', { detail: { selected: [record.id], atomeId: record.id } }));
    assert.ok(findNode((await runtime.render()).root, 'atome_contextual_tool_draw_create'));
    assert.equal(readLastCreationTool(), 'draw');
    runtime.setSuspended(true); await runtime.render();
});

test('a failed creation never replaces the remembered shortcut', async () => {
    const h = setup();
    rememberLastCreationTool('draw');
    const failing = createMainMenuCreateInvocationRuntime({
        invokeToolFromUiButton: async () => { throw new Error('denied'); }, prepareTool: async () => ({}), finishTool: async () => ({})
    });
    await assert.rejects(failing.invoke({ definition: h.definition('text_create') }), /denied/);
    assert.equal(readLastCreationTool(), 'draw');
});

test('inactive shortcuts use the same pinned geometry and preserve other tools for both hands', () => {
    const h = setup();
    rememberLastCreationTool('draw');
    const inactive = readLastCreationRailToolEntry();
    for (const handedness of ['left', 'right']) {
        for (const height of [280, 900]) {
            const surface = { getBoundingClientRect: () => ({ width: 400, height }) };
            const base = { surface, handedness, itemSize: 52, mainMenuHeight: 56, activeAtomeId: 'one', definitions: [inactive, { key: 'delete', label: 'Delete', icon: 'delete' }] };
            const off = buildAtomeContextualEditTree({ ...base, activeSlots: [inactive] });
            const on = buildAtomeContextualEditTree({ ...base, activeSlots: [{ ...inactive, active: true }] });
            const offNode = findNode(off.root, 'atome_contextual_tool_draw_create');
            const onNode = findNode(on.root, 'atome_contextual_tool_draw_create');
            assert.deepEqual(offNode.style.position, onNode.style.position);
            assert.equal(offNode.style.translation, undefined);
            assert.deepEqual(onNode.style.translation, [0, 2]);
            assert.ok(findNode(off.root, 'atome_contextual_tool_delete'));
            assert.equal(offNode.style.position[1] + 52, off.layout.bottom);
            assert.ok(offNode.style.position[0] >= 0 && offNode.style.position[0] + 52 <= 400);
        }
    }
});
