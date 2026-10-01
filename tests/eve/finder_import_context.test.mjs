import assert from 'node:assert/strict';
import { test } from 'vitest';
import { JSDOM } from 'jsdom';
import { collectSurfaceRootKeys, collectSurfaceTools } from '../../eVe/intuition/tools/core/exposable_tools.js';
import { CONTEXT_MENUS, validateContextMenus } from '../../eVe/intuition/menu/context_menus_loader.js';
import { resolveContextMenu } from '../../eVe/intuition/menu/context_menu_resolver.js';
import { createMainMenuContentRuntime } from '../../eVe/intuition/runtime/eve_intuition/main_menu_content_runtime.js';
import { createMainToolCatalogRuntime } from '../../eVe/intuition/runtime/eve_intuition/main_tool_interaction_runtime.js';
import { FINDER_CATEGORY_KEYS, filterRecords, buildSelectionKey } from '../../eVe/intuition/runtime/bevy_panel/bevy_panel_finder_model.js';
import { createFinderPanelSurface } from '../../eVe/intuition/runtime/bevy_panel/bevy_panel_finder_runtime.js';
import { createSelectableListDragSession, createSelectableListTransferRuntime } from '../../eVe/intuition/runtime/bevy_panel/bevy_panel_selectable_list_drag.js';
import { computeMysticLayout, resolveMysticSlots } from '../../eVe/intuition/mystic/mystic_layout.js';
import { resolveMysticPage } from '../../eVe/intuition/mystic/mystic_menu_items.js';
import { buildPanelTreeForDefinition } from '../../eVe/intuition/runtime/bevy_panel/bevy_panel_projection.js';
import { bevyPanelRuntimeState } from '../../eVe/intuition/runtime/bevy_panel/bevy_panel_runtime.js';
import { hitTestBevyUiNode } from '../../eVe/domains/rendering/bevy_ui_hit_test_runtime.js';

export const catalog = () => createMainMenuContentRuntime(new Proxy({
    mainToolIdByKey: createMainToolCatalogRuntime({ normalizeMainToolKey: key => key }).mainToolIdByKey,
    directionValues: [], translate: (key, fallback) => fallback || key
}, { get: (target, key) => key in target ? target[key] : () => ({}) }));
const node = (tree, id) => {
    for (const item of Array.isArray(tree) ? tree : [tree]) {
        if (!item) continue;
        if (item.id === id) return item;
        const found = node(item.children || [], id); if (found) return found;
    }
    return null;
};

test('V2 exposure follows fixed, immutable, object and activity declarations, excluding internal commands', () => {
    const content = catalog();
    validateContextMenus(CONTEXT_MENUS, { catalog: content });
    const tools = collectSurfaceTools(content, { rootKeys: collectSurfaceRootKeys({ content, contextMenus: CONTEXT_MENUS }) });
    for (const id of ['ui.youtube.create', 'ui.tv', 'ui.interaction.panel', 'ui.play']) assert.ok(tools.has(id), id);
    const isolated = { toolbox: { children: [] }, real: { tool_id: 'ui.real', label: 'Real' }, helper: { tool_id: 'ui.helper' } };
    const config = { commands: { real: {}, helper: {} }, menus: { sidebar: { objects: { project: { real: 'beginner' } } } } };
    const found = collectSurfaceTools(isolated, { rootKeys: collectSurfaceRootKeys({ content: isolated, contextMenus: config }) });
    assert.deepEqual([...found.keys()], ['ui.real']);
});

test('Finder separates seven kinds from cumulative semantic tags', () => {
    assert.deepEqual(FINDER_CATEGORY_KEYS, ['all', 'images', 'videos', 'sounds', 'tools', 'place', 'contacts']);
    const records = [
        { id: 'a', type: 'image', textIndex: 'art', properties: { tags: ['creation', 'health'] } },
        { id: 'b', type: 'image', textIndex: 'art', properties: { tags: ['creation'] } },
        { id: 'c', type: 'text', textIndex: 'art', properties: { tags: ['creation', 'health'] } }
    ];
    assert.deepEqual(filterRecords({ records, scope: 'images', query: 'art', tags: ['creation', 'health'] }).map(r => r.id), ['a']);
    assert.equal(filterRecords({ records, scope: 'all', tags: [] }).length, 3);
});

test('Finder virtualizes a long list, reaches its last result and imports checked records once', async () => {
    const records = Array.from({ length: 500 }, (_, i) => ({ id: 'r' + i, name: 'Record ' + i, type: 'image', properties: {}, textIndex: 'record' }));
    const calls = [];
    const finder = createFinderPanelSurface({ loadRecords: async () => records, resolveProjectId: () => 'p',
        importRecords: async batch => { calls.push(batch); return { ok: true, created: batch.length }; }, closePanel: async () => {} });
    await finder.load();
    const draw = () => finder.surface.buildContent(finder.readState(), { bodyWidth: 500, bodyHeight: 400, emit: () => {} });
    assert.ok(node(draw(), 'finder_list_virtual_list'));
    assert.equal(node(draw(), 'finder_list_entry_200'), null);
    await finder.handleEvent({ type: 'finder.window', value: 499 });
    assert.ok(node(draw(), 'finder_list_entry_499'));
    const first = buildSelectionKey(records[499]);
    await finder.handleEvent({ type: 'finder.selection.press', value: first, event: { y: 0 } });
    await finder.handleEvent({ type: 'finder.selection.release' });
    const result = await finder.handleEvent({ type: 'finder.import.selection' });
    assert.equal(result.created, 1); assert.equal(calls[0][0].id, 'r499');
});

test('shared drag hides only after real movement and restores on cancel', async () => {
    const state = {}; let project = 'p';
    const transfer = createSelectableListTransferRuntime({ state, resolveProjectId: () => project });
    const drag = createSelectableListDragSession({ state, resolvePayload: () => ({ ok: true, projectId: project }),
        onStart: transfer.start, onCancel: () => transfer.restore(), onDrop: async () => ({ ok: true }) });
    drag.begin('r', { clientX: 10, clientY: 10, nodeId: 'thumbnail' });
    assert.equal(state.transferHidden, undefined);
    drag.move({ clientX: 12, clientY: 12 }); assert.equal(state.transferHidden, undefined);
    drag.move({ clientX: 30, clientY: 30 }); assert.equal(state.transferHidden, true);
    assert.equal(state.transferAnchorNodeId, 'thumbnail');
    drag.cancel(); assert.equal(state.transferHidden, false);
});

test('shared transfer rejects stale destinations, duplicate activation, and recovers from failure', async () => {
    const state = {}; let project = 'a', finish; let calls = 0;
    const transfer = createSelectableListTransferRuntime({ state, resolveProjectId: () => project,
        transfer: () => { calls++; return new Promise(resolve => { finish = resolve; }); } });
    const pending = transfer.run(['one'], {}, 'a'); await Promise.resolve();
    assert.equal((await transfer.run(['one'], {}, 'a')).error, 'panel_transfer_busy');
    finish({ ok: false, error: 'failed' }); await pending;
    assert.equal(state.transferHidden, false); assert.equal(state.transferBusy, false);
    project = 'b'; assert.equal((await transfer.run(['one'], {}, 'a')).error, 'panel_transfer_project_changed');
    assert.equal(calls, 1);
    const stale = transfer.run(['one'], {}, 'b', async () => { project = 'c'; });
    assert.equal((await stale).error, 'panel_transfer_project_changed'); assert.equal(calls, 1);
});

test('hidden panel preserves captured handler but has no shell or hit target', () => {
    const dom = new JSDOM('<canvas></canvas>');
    const surface = dom.window.document.querySelector('canvas');
    surface.getBoundingClientRect = () => ({ width: 600, height: 600 });
    const release = () => {};
    const definition = { surfaceKey: 'transfer_test', readState: () => ({ transferHidden: true, transferAnchorNodeId: 'anchor' }),
        buildContent: () => [{ id: 'anchor', kind: 'button', style: { size: [100, 100] }, on: { release } }] };
    const tree = buildPanelTreeForDefinition({ definition, surface, runtimeState: bevyPanelRuntimeState,
        refresh: () => {}, getPanelRuntime: () => ({}), treeIdFor: key => 'eve_bevy_panel_' + key,
        surfaceSize: () => ({ width: 600, height: 600 }), applyHeaderPinShift: ({ geometry }) => geometry,
        warnDuplicateNodeIds: (_, tree) => tree, decoratePanelSweepTree: ({ tree }) => tree });
    assert.equal(node(tree.root, 'eve_bevy_panel_transfer_test_panel'), null);
    assert.equal(node(tree.root, 'anchor').on.release, release);
    assert.equal(hitTestBevyUiNode(tree.root, { x: 100, y: 100 }), null);
});

test('Mystic translates at every edge without reversing the compass and pins anchors on every page', () => {
    for (const [x, y] of [[0, 0], [1200, 0], [0, 800], [1200, 800], [600, 400]]) {
        const input = { slots: resolveMysticSlots(24), center: { x, y }, surface: { width: 1200, height: 800 }, tileSize: 60 };
        const a = computeMysticLayout(input); assert.deepEqual(a, computeMysticLayout(input));
        for (const tile of a.tiles) { const slot = input.slots[tile.index]; assert.equal(Math.sign(tile.dx), Math.sign(slot.dx)); assert.equal(Math.sign(tile.dy), Math.sign(slot.dy)); }
    }
    const items = CONTEXT_MENUS.menus.mystic.fixed.map(item => ({ key: item.command, slot: item.slot }));
    const pages = resolveMysticPage({ items, capacity: 8 });
    for (let page = 0; page < pages.pages; page++) {
        const keys = resolveMysticPage({ items, capacity: 8, page }).items.map(item => item.key);
        for (const key of ['find', 'capture', 'communicate', 'dashboard']) assert.ok(keys.includes(key));
    }
});

test('Entertainment and Interactivity use normal beginner taxonomy', () => {
    const context = { type: 'project', selected: false, level: 'beginner', activity: 'entertainment' };
    const keys = resolveContextMenu({ menu: 'sidebar', context }).map(item => item.key);
    assert.ok(keys.includes('youtube_create')); assert.ok(keys.includes('tv'));
    const interaction = resolveContextMenu({ menu: 'sidebar', context: { ...context, activity: 'interactivity' } });
    assert.ok(interaction.some(item => item.key === 'interaction'));
});

test('partial transfer reports the failed items and does not replay successful selection', async () => {
    const records = ['a', 'b'].map(id => ({id,name:id,type:'image',properties:{},textIndex:id}));
    let closes=0; const batches=[];
    const finder=createFinderPanelSurface({loadRecords:async()=>records,resolveProjectId:()=> 'p',closePanel:()=>closes++,importRecords:async batch=>{
        batches.push(batch.map(entry=>entry.id));
        return {ok:false,created:1,importedSourceIds:['a'],failures:[{id:'b',error:'fixture_failure'}]};
    }});
    await finder.load();
    finder.surface.buildContent(finder.readState(),{bodyWidth:500,bodyHeight:400,emit:()=>{}});
    for(const record of records) { await finder.handleEvent({type:'finder.selection.press',value:buildSelectionKey(record)}); await finder.handleEvent({type:'finder.selection.release'}); }
    await finder.handleEvent({type:'finder.import.selection'});
    assert.equal(closes,0); assert.equal(finder.readState().transferHidden,false);
    assert.deepEqual(finder.readState().selectedKeys,[buildSelectionKey(records[1])]);
    assert.match(finder.readState().status,/b: fixture_failure/);
    await finder.handleEvent({type:'finder.import.selection'});
    assert.deepEqual(batches,[['a','b'],['b']]);
});

test('the canonical registry exposes runtime definitions before authentication and preserves stored overrides', async () => {
    const {ToolRegistryV2,InMemoryToolRegistryStorage}=await import('../../eVe/intuition/tools/core/tool_registry.js');
    const {buildCanonicalToolDefinition}=await import('../../eVe/intuition/runtime/tool_support.js');
    const registry=new ToolRegistryV2({storage:new InMemoryToolRegistryStorage()});
    const definition=buildCanonicalToolDefinition({tool_id:'ui.fixture',tool_name:'Fixture',tool_key:'fixture',handler:()=>({ok:true})});
    registry.registerRuntimeDefinition(definition);
    assert.ok((await registry.listTools()).some(tool=>tool.id==='ui.fixture'));
    assert.equal((await registry.getTool('fixture')).id,'ui.fixture');
    await registry.createTool({...definition,ui:{...definition.ui,label_fallback:'Stored fixture'}});
    assert.equal((await registry.listTools()).length,1);
    assert.equal((await registry.getTool('fixture')).ui.label_fallback,'Stored fixture');
});

test('activity refreshes the virtual project rail and rejects obsolete access reads', async () => {
    const {installProjectBackgroundRailRuntime}=await import('../../eVe/intuition/runtime/eve_intuition/project_background_rail_runtime.js');
    const {setAtomeContextualEditApi}=await import('../../eVe/intuition/runtime/eve_intuition/atome_contextual_edit_registry.js');
    const previous=globalThis.window;
    const dom=new JSDOM('<canvas id="eve_surface_project"></canvas>'); const win=dom.window;
    win.__eveWorkspaceMode={mode:'project',projectId:'p'}; win.__selectedAtomeIds=['p'];
    const reads=[],entered=[]; let activity='interactivity';
    win.Atome={getStateCurrent:()=>new Promise(resolve=>reads.push(resolve))};
    globalThis.window=win; setAtomeContextualEditApi({enterVirtual:context=>{entered.push(context);return {ok:true};}});
    try {
        installProjectBackgroundRailRuntime({win,resolveItems:()=>[{key:activity,onSelect:()=>{}}]});
        win.dispatchEvent(new win.CustomEvent('eve:context-menu-context-changed'));
        activity='entertainment'; win.dispatchEvent(new win.CustomEvent('eve:context-menu-context-changed'));
        assert.equal(reads.length,2);
        reads[0]({id:'p',capabilities:{}}); await new Promise(resolve=>setTimeout(resolve,0)); assert.equal(entered.length,0);
        reads[1]({id:'p',capabilities:{}}); await new Promise(resolve=>setTimeout(resolve,0));
        assert.equal(entered.length,1); assert.equal(entered[0].definitions[0].key,'entertainment');
    } finally {setAtomeContextualEditApi(null);globalThis.window=previous;dom.window.close();}
});

test('file import refuses creation if the destination changes while uploading', async () => {
    const {createProjectDropExternalRuntime}=await import('../../eVe/intuition/tools/project_drop_external_runtime.js');
    let active=true,creations=0;
    const runtime=createProjectDropExternalRuntime({ensureABoxApi:async()=>({sendFileToServer:async()=>{active=false;return {ok:true};}}),computeDropBase:()=>({left:0,top:0}),resolveDropType:()=> 'image',readDroppedTextContent:async()=>'',buildDropOffset:()=>({dx:0,dy:0}),buildExtraProperties:()=>({}),resolveCreatorResultAtomeId:()=> 'created',invokeGateway:async()=>{creations++;return {ok:true};}});
    const result=await runtime.importFilesToProjectViaCreator({entries:[{name:'fixture.png'}],projectId:'p',shouldContinue:()=>active});
    assert.equal(creations,0);assert.equal(result.created,0);assert.equal(result.results[0].error,'panel_transfer_project_changed');
});

test('Finder preserves a created atome when subsequent source metadata fails', async () => {
    const {createProjectDropFinderRecordDropRuntime}=await import('../../eVe/intuition/tools/project_drop_finder_record_drop_runtime.js');
    const previous=globalThis.window;globalThis.window={__eveWorkspaceMode:{mode:'project',projectId:'p'},eveToolBase:{updateAtomeProperties:async()=>{throw Error('metadata_failed');}}};
    try {
        const runtime=createProjectDropFinderRecordDropRuntime({MEDIA_KINDS:new Set(['image']),isFinderToolPayload:()=>false,resolveFinderVisualType:()=> 'image',resolveFinderLabel:()=> 'Fixture',resolveFinderMediaUrl:()=> '/fixture.png',firstNonEmpty:(...values)=>values.find(Boolean),buildDropOffset:()=>({dx:0,dy:0}),computeDropBase:()=>({left:1,top:2}),invokeCreatorOnProjectDrop:async()=>({ok:true,atomeId:'committed_fixture'})});
        const result=await runtime.importFinderRecordsToProject([{id:'source_fixture'}],{projectId:'p',event:{clientX:1,clientY:2}});
        assert.equal(result.ok,false);assert.equal(result.created,1);
        assert.deepEqual(result.createdIds,['committed_fixture']);assert.deepEqual(result.importedSourceIds,['source_fixture']);
        assert.equal(result.failures[0].error,'metadata_failed');
    } finally {globalThis.window=previous;}
});

test('every previously lazy exposed tool resolves a canonical definition and an executable handler before first use', async () => {
    const {createToolRuntimeBootstrap}=await import('../../eVe/intuition/tools/core/tool_runtime_bootstrap.js');
    const handlers=new Map();
    const runtime=createToolRuntimeBootstrap({buildLabelKey:key=>'eve.tool.'+key,publishRuntimeRegisteredHandler:(id,handler)=>handlers.set(id,handler),PANEL_RUNTIME_CONFIG_BY_TOOL_ID:{},MAIN_TOOL_RUNTIME_CONFIG_BY_TOOL_ID:{},V2_CALENDAR_API_EXECUTION_MODE:'v2_calendar_api',V2_REGISTERED_HANDLER_EXECUTION_MODE:'v2_registered_handler'});
    for(const id of ['ui.youtube.create','ui.placeholder.create','ui.shape.create','ui.generator.run','ui.new_project','tool.main.z_order']) {
        const tool=runtime.resolveBootstrapRuntimeTool(id);
        assert.equal(tool.id,id);assert.equal(tool.type,'tool');assert.equal(typeof handlers.get(id),'function',id);
    }
});
