import { test } from 'vitest';
import assert from 'node:assert/strict';
import { CONTEXT_MENUS, validateContextMenus, loadContextMenus } from '../../eVe/intuition/menu/context_menus_loader.js';
import { resolveContextMenu, resolveContextMenuContext } from '../../eVe/intuition/menu/context_menu_resolver.js';
import { resolveMasteryLevel } from '../../eVe/intuition/tools/user_visual_preferences_model.js';
const keys = (context, menu = 'mystic') => resolveContextMenu({context, menu}).map(entry => entry.key);
// The Mystic is not contextual any more (2026-09-29): one constant list, in the
// order `menus.mystic.fixed` declares. No context may remove an edit tile; the
// runtime disables unavailable actions. Work modes keep only their switches.
const MYSTIC_FIXED = ['ai','find','capture','import','communicate','dashboard','new_project','copy','paste','delete','play','utilities','info','activity'];
test('the Mystic keeps its one edit list and the two switches of every other work mode', () => {
 // In edit mode the list is byte-for-byte constant, whatever the target.
 for (const context of [{ activity:'invalid',level:'invalid', selected:true }, { type:'surface_item' }, { type:'text_field' }, { type:'dashboard' }]) {
  assert.deepEqual(keys(context), MYSTIC_FIXED);
 }
 // Le fond de projet se lit comme le reste (2026-09-29) : son Play pilote le
 // transport du projet entier, donc la tuile est la, sans selection.
 assert.deepEqual(keys({ type:'project' }), MYSTIC_FIXED);
 // In consultation the Mystic keeps the way out and the execution mode; in
 // performance, the way out and consumption. Nothing else.
 assert.deepEqual(keys({ mode:'consultation' }), ['ai','perform','mode_edit']);
 assert.deepEqual(keys({ mode:'performance' }), ['ai','mode_edit','mode_consume']);
 // The sidebar alone keeps its work-mode overrides (empty while consulting).
 for (const mode of ['consultation','performance']) assert.deepEqual(keys({ mode }, 'sidebar'), []);
});
test('the Mystic composition ignores the kind and the forced activity', () => {
 assert.equal(resolveMasteryLevel({masteryLevel:'advanced',activityLevels:{text:'beginner'}},'text'),'beginner');
 assert.equal(resolveMasteryLevel({masteryLevel:'advanced',activityLevels:{text:'beginner'}},'video'),'advanced');
 assert.deepEqual(keys({selected:true,kind:'text',activity:'text'}), MYSTIC_FIXED);
 assert.deepEqual(keys({selected:true,kind:'image',activity:'text'}), MYSTIC_FIXED);
 assert.deepEqual(keys({selected:true,kind:'image'}), MYSTIC_FIXED);
});
test('mastery inclusions, independent surfaces, fixed cross and applicability', () => {
 const low=keys({selected:true,kind:'text',level:'beginner'});
 const high=keys({selected:true,kind:'text',level:'advanced'});
 assert.deepEqual(low,MYSTIC_FIXED);
 assert.deepEqual(high,MYSTIC_FIXED);
 assert.deepEqual(keys({selected:true,kind:'video',capabilities:['playback']}),
  MYSTIC_FIXED);
 assert.ok(!keys({selected:true,kind:'text'},'sidebar').includes('home'));
 assert.ok(resolveContextMenu({context:{selected:true,kind:'text'},applicable:key=>key!=='delete'}).some(x=>x.key==='delete'));
});
test('lasso and armed-tool openings keep the exact edit Flower', () => {
 assert.deepEqual(keys({type:'lasso',selected:true}),MYSTIC_FIXED);
 assert.deepEqual(keys({type:'lasso'}),MYSTIC_FIXED);
 assert.deepEqual(keys({type:'tool',tool:'shape'}),MYSTIC_FIXED);
});
test('invalid data fails explicitly without replacing it with defaults', async () => {
 // The constant Mystic list is the one shape to guard: a duplicated command and
 // an invalid slot must both fail, like a literal label or a bad version.
 for (const change of [c=>c.version=1,c=>c.menus.mystic.fixed.push({command:'copy'}),c=>c.commands.ai.label='literal',c=>c.menus.mystic.fixed[0].slot=7]) {
  const value=structuredClone(CONTEXT_MENUS);change(value);assert.throws(()=>validateContextMenus(value),/context_menus_/);
 }
 await assert.rejects(loadContextMenus({url:'/missing',fetchImpl:async()=>({ok:false})}),/load_failed/);
 assert.throws(()=>validateContextMenus(CONTEXT_MENUS,{catalog:new Set()}),/catalog_command_unknown/);
 assert.throws(()=>validateContextMenus(CONTEXT_MENUS,{hasLabel:()=>false}),/label_unknown/);
});

import { EVE_DEFAULT_MESSAGES } from '../../eVe/i18n/languages.js';
import { createMainMenuContentRuntime } from '../../eVe/intuition/runtime/eve_intuition/main_menu_content_runtime.js';
import { createMainToolCatalogRuntime } from '../../eVe/intuition/runtime/eve_intuition/main_tool_interaction_runtime.js';
test('configuration references canonical commands and translated labels in both locales', () => {
 const noop = () => {};
 const catalog = createMainMenuContentRuntime({
  applyDeleteSelection: noop,
  closeBackgroundPanel: noop,
  closeCalendarPanel: noop,
  closeCanonicalHomePanel: noop,
  closeCommunicatePanel: noop,
  closeCouleurPanel: noop,
  closeDeletePanel: noop,
  closeFinderPanel: noop,
  closeFontPanel: noop,
  closeInfoPanel: noop,
  closeLayerPanel: noop,
  closeMatrixView: noop,
  closeMediaPanel: noop,
  closePastePanel: noop,
  closeTimelinePanel: noop,
  closeUndoPanel: noop,
  defaultOrientation: noop,
  directionValueToLabel: {},
  directionValues: [],
  ensureActivitiesModule: noop,
  ensureCopyModule: noop,
  ensurePastePanelModule: noop,
  handleAiTouch: noop,
  handleFinderTouch: noop,
  invokeTool: noop,
  mainToolIdByKey: createMainToolCatalogRuntime({normalizeMainToolKey:key=>key}).mainToolIdByKey,
  openBackgroundPanel: noop,
  openCalendarPanel: noop,
  openCanonicalHomePanel: noop,
  openCommunicatePanel: noop,
  openCouleurPanel: noop,
  openDeletePanel: noop,
  openFinderPanel: noop,
  openFontPanel: noop,
  openInfoPanel: noop,
  openLayerPanel: noop,
  openMatrixView: noop,
  openMediaPanel: noop,
  openPastePanel: noop,
  openTimelinePanel: noop,
  openUndoPanel: noop,
  orientationChanged: noop,
  translate: key=>key,
 });
 for (const locale of ['fr','en']) validateContextMenus(CONTEXT_MENUS, {catalog,hasLabel:key=>Object.hasOwn(EVE_DEFAULT_MESSAGES[locale],key)});
});

import {setProjectWorkMode,getProjectWorkMode,authorizeProjectTool} from '../../eVe/domains/rendering/project_work_mode_state.js';
import {fillMediaPlaceholder} from '../../eVe/domains/rendering/project_view_placeholder_fill.js';
test('mode transition waits for preservation, rejects failure and blocks direct editing', async()=>{
 const windowRef={__eveWorkspaceMode:{mode:'project',projectId:'mode_guard_test'},Atome:{getStateCurrent:async()=>({type:'sound',properties:{media_pending:true}})}};
 const prepare=async()=>({ok:true});
 await setProjectWorkMode('consultation',{windowRef,prepare:async()=>({ok:false,error:'save_failed'})});
 assert.equal(getProjectWorkMode('mode_guard_test'),'edit');
 await setProjectWorkMode('consultation',{windowRef,prepare});
 const context={input:{project_id:'mode_guard_test'}};
 assert.equal((await authorizeProjectTool({windowRef,context,tool:{id:'ui.delete.selection'}})).error,'project_work_mode_editing_blocked');
 assert.equal((await authorizeProjectTool({windowRef,context,tool:{id:'ui.mode.edit'}})).ok,true);
 assert.equal((await fillMediaPlaceholder({projectId:'mode_guard_test',record:{id:'a',properties:{placeholder_kind:'text'}},commit:()=>{throw Error('must_not_mutate');}})).ok,false);
 await setProjectWorkMode('performance',{windowRef,prepare});
 assert.equal((await authorizeProjectTool({windowRef,context,tool:{id:'ui.capture.audio'}})).ok,false);
 assert.equal((await authorizeProjectTool({windowRef,context:{input:{...context.input,project_atome_id:'placeholder'}},tool:{id:'ui.capture.audio'}})).ok,true);
 await setProjectWorkMode('edit',{windowRef});
});


test('both compositions filter canonical object and property grants without confusing creation with target deletion', () => {
 const readOnly = { id: 'shared', properties: { text: 'Shared' }, capabilities: { properties: { text: { write: false } }, delete: false, create: false } };
 const writable = { id: 'owned', properties: { text: 'Mine' }, capabilities: { properties: { text: { write: true } }, delete: true } };
 const context = { selected: true, kind: 'text', level:'advanced', records:[readOnly,writable], projectRecord:{capabilities:{create:true}} };
 // Mystic preserves its edit composition; unavailable actions are disabled by
 // the view runtime instead of disappearing.
 assert.deepEqual(keys(context, 'mystic'), MYSTIC_FIXED);
 assert.deepEqual(keys({ ...context, projectRecord:{capabilities:{create:false}} }, 'mystic'), MYSTIC_FIXED);
 // The sidebar remains contextual and continues to filter access.
 const result = keys(context, 'sidebar');
 assert.ok(result.includes('copy')); assert.ok(result.includes('paste'));
 assert.ok(!result.includes('delete')); assert.ok(!result.includes('font'));
 assert.ok(!keys({ ...context, projectRecord:{capabilities:{create:false}} }, 'sidebar').includes('paste'));
 assert.ok(keys({ ...context, records:[writable] }, 'sidebar').includes('delete'));
});

test('capability filtering also covers configured fixed entries', () => {
 const config = structuredClone(CONTEXT_MENUS);
 config.commands.capture.capabilities = ['capture'];
 assert.ok(resolveContextMenu({ config, context: {} }).some(item => item.key === 'capture'));
 assert.ok(resolveContextMenu({ config, context: { capabilities: ['capture'] } }).some(item => item.key === 'capture'));
 config.commands.delete.capabilities = ['delete'];
 assert.deepEqual(resolveContextMenu({ config, context: { mode: 'edit' } }).map(item => item.key), MYSTIC_FIXED);
 assert.deepEqual(resolveContextMenu({ config, context: { mode: 'edit', capabilities: ['capture','delete'] } }).map(item => item.key),
  MYSTIC_FIXED);
});


test('opening access uses canonical state and the captured selection; missing projections fail explicitly', async () => {
 const { loadContextMenuAccess } = await import('../../eVe/intuition/menu/context_menu_resolver.js');
 const requests = [];
 const windowRef = { Atome: { getStateCurrent: async id => { requests.push(id); return { id, capabilities: { delete: id !== 'shared', create: true } }; } } };
 const result = await loadContextMenuAccess({ type: 'atome', atomeId: 'shared', projectId: 'project' }, { windowRef, selectionIds: ['shared', 'owned'] });
 assert.deepEqual(requests, ['shared', 'owned', 'project']);
 assert.deepEqual(result.selectionIds, ['shared', 'owned']);
 assert.equal(result.projectRecord.id, 'project');
 await assert.rejects(loadContextMenuAccess({ projectId: 'missing' }, { windowRef: { Atome: { getStateCurrent: async () => null } } }), /access_unavailable/);
});

 test('execution permits only the matching empty media placeholder and rejects already filled targets', async () => {
 const windowRef = { __eveWorkspaceMode: { mode: 'project', projectId: 'placeholder_capability' } };
 await setProjectWorkMode('performance', { windowRef, prepare: async () => ({ ok: true }) });
 for (const [type, source] of [['sound', 'audio'], ['video', 'video'], ['image', 'image']]) {
  let record = { type, properties: { media_pending: true } };
  windowRef.Atome = { getStateCurrent: async () => record };
  const context = { input: { project_atome_id: 'slot', record_source: source } };
  const id = source === 'image' ? 'ui.capture.import' : 'ui.detail.record.toggle';
  assert.equal((await authorizeProjectTool({ windowRef, context, tool: { id } })).ok, true);
  // L'outil import ouvre desormais le panneau Media : il remplace la fenetre
  // systeme pour le meme emplacement image, sans retirer la capture d'origine.
  if (source === 'image') assert.equal((await authorizeProjectTool({ windowRef, context, tool: { id: 'ui.media.panel' } })).ok, true);
  assert.equal((await authorizeProjectTool({ windowRef, context: { input: { ...context.input, record_source: 'text' } }, tool: { id: 'ui.detail.record.toggle' } })).ok, false);
  record = { ...record, properties: { ...record.properties, media_url: '/filled' } };
  assert.equal((await authorizeProjectTool({ windowRef, context, tool: { id } })).ok, false);
 }
 await setProjectWorkMode('edit', { windowRef });
});


import { createProjectLayerRouting } from '../../eVe/core/atome_events/project_layer_routing.js';
test('execution escape is available offline and background clicks cannot select or create editorial text', async () => {
 const windowRef = { __eveWorkspaceMode: { mode: 'project', projectId: 'offline_escape' }, Atome: { getStateCurrent: () => { throw Error('must_not_read'); } } };
 await setProjectWorkMode('performance', { windowRef, prepare: async () => ({ ok: true }) });
 try {
  const { loadContextMenuAccess } = await import('../../eVe/intuition/menu/context_menu_resolver.js');
  const context = { type: 'project', projectId: 'offline_escape' };
  assert.equal(await loadContextMenuAccess(context, { windowRef }), context);
  assert.deepEqual(keys({ mode: getProjectWorkMode('offline_escape') }), ['ai','mode_edit','mode_consume'],
   'execution keeps its two switches only');
  let exits = 0;
  const forbidden = () => { throw Error('editorial_background_action'); };
  const routing = createProjectLayerRouting({ resolveLayerProjectId: () => 'offline_escape', exitTextEditMode: () => exits++, applySelectionIntent: forbidden,
   isTextToolActive: forbidden, notifyTextToolProjectBackgroundClick: forbidden });
  assert.equal(routing.prepareBackgroundTextFocus({ clickCount: 2 }), false);
  assert.equal(routing.routeBackgroundClick({ clickCount: 2 }), true); assert.equal(exits, 1);
 } finally { await setProjectWorkMode('edit', { windowRef }); }
});

import { createToolRuntimeDispatch } from '../../eVe/intuition/tools/core/tool_runtime_dispatch.js';
test('Mystic context names use canonical command scopes without weakening capability checks', async () => {
 const dispatch=createToolRuntimeDispatch({isSelectionTargetAllowed:()=>true});
 const tool={id:'ui.capture.preview',capabilities:{contexts:['desktop','project']}};
 for(const [type,scope] of [['dashboard','desktop'],['surface_item','project'],['atome','project']]) {
  const context={input:{context_type:type}};
  assert.equal(dispatch.resolveInvocationScope(context),scope);
  assert.equal((await dispatch.validateCapabilities({tool,context})).ok,true);
 }
 assert.equal((await dispatch.validateCapabilities({tool,context:{input:{context_type:'unrecognized'}}})).error,'tool_context_not_allowed');
 assert.equal((await dispatch.validateCapabilities({tool:{...tool,capabilities:{contexts:['project']}},context:{input:{context_type:'dashboard'}}})).error,'tool_context_not_allowed');
});

test('the three object effects take their one place: rounding, then shadow, then the mask', () => {
 // Le rail laterale ordonne ses cases par la priorite de chaque outil, pas par
 // l'ordre du fichier de taxonomie. L'ordre canonique se lit donc sur les cles.
 const rail = (kind) => resolveContextMenu({
  menu: 'sidebar', context: resolveContextMenuContext({ type: 'atome', kind, selected: true })
 }).map(entry => entry.key);
 const group = (kind) => rail(kind).filter(key => ['rounding', 'shadow', 'mask'].includes(key));
 // L'arrondi et l'ombre atteignent tout ce qui a un cadre.
 for (const kind of ['image', 'video', 'sound']) {
  assert.deepEqual(group(kind), ['rounding', 'shadow'], `${kind} rounds its frame and casts a shadow`);
  assert.ok(!rail(kind).includes('mask'), `${kind} is never a mask source`);
 }
 // La forme arrondit ses pointes, porte une ombre, et sert de masque.
 assert.deepEqual(group('shape'), ['rounding', 'shadow', 'mask']);
 // Le texte et le dessin vectoriel ne s'arrondissent pas : ils n'ont pas de cadre
 // a arrondir, seulement des glyphes et des points. Tous deux masquent.
 assert.deepEqual(group('text'), ['shadow', 'mask'], 'text has no frame to round');
 assert.deepEqual(group('svg'), ['shadow', 'mask'], 'a vector drawing rounds its own points, never its box');
 // Les trois effets se rangent SOUS l'ordre (z_order) : on range, puis on
 // arrondit et on ombre, puis on masque.
 for (const kind of ['shape', 'text', 'image', 'video', 'svg', 'sound']) {
  const list = rail(kind);
  const rounding = list.indexOf('rounding');
  assert.ok(list.indexOf('z_order') < (rounding < 0 ? list.indexOf('shadow') : rounding),
   `${kind}: the order comes before the effects`);
  if (rounding >= 0) assert.ok(rounding < list.indexOf('shadow'), `${kind}: rounding, then shadow`);
  assert.ok(list.indexOf('shadow') < list.indexOf('mask') || !list.includes('mask'), `${kind}: the mask closes the group`);
 }
});
