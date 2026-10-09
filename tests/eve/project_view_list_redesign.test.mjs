import { afterEach, expect, test, vi } from 'vitest';
import * as modeState from '../../eVe/domains/rendering/project_view_mode_state.js';
import * as surfaceState from '../../eVe/domains/rendering/project_view_surface_runtime.js';
import { createProjectViewListContent } from '../../eVe/domains/rendering/project_view_list_content.js';
import { feedContextualRailWithRow, projectViewDashboardToolDefinition } from '../../eVe/domains/rendering/project_view_contextual_rail.js';
import { createProjectViewSurfaceContextRuntime } from '../../eVe/domains/rendering/project_view_surface_context_runtime.js';
import { resetProjectViewNavigation } from '../../eVe/domains/rendering/project_view_navigation.js';
import { playProjectViewEntry } from '../../eVe/domains/rendering/project_view_item_actions.js';
import { setAtomeContextualEditApi } from '../../eVe/intuition/runtime/eve_intuition/atome_contextual_edit_registry.js';
import { setMainMenuRuntime } from '../../eVe/intuition/ribbon/bevy_ui_product_registry.js';
import { createAtomeContextualRailRuntime } from '../../eVe/intuition/runtime/eve_intuition/atome_contextual_rail_runtime.js';
import { createMainMenuContentRuntime } from '../../eVe/intuition/runtime/eve_intuition/main_menu_content_runtime.js';
import { BEGINNER_LIST_RAIL_KEYS } from '../../eVe/domains/rendering/project_view_list_options.js';

const projectId = 'list_redesign';
const profile = level => ({ addEventListener: vi.fn(), removeEventListener: vi.fn(), __currentProject: { id: projectId },
    requestAnimationFrame: () => 1,
    __eveWorkspaceMode: { mode: 'project', projectId },
    __eveProfilePreferences: { visual: { masteryLevel: level } } });
const owner = { id: 'owner', project_id: projectId, type: 'group',
    capabilities: { write: true, delete: true },
    properties: { name: 'Owner', molecule_entity: 'molecule', playback_mode: 'simultaneous' } };
const surface = () => vi.spyOn(surfaceState, 'readProjectViewSurfaceState').mockReturnValue({ mounted: true, mode: 'list', projectId });
afterEach(() => { setAtomeContextualEditApi(null); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

test('switching expertise hides expanded descendants and restores disclosure without losing expansion', async () => {
    const win = profile('advanced'); vi.stubGlobal('window', win);
    const content = createProjectViewListContent({ requestRefresh: () => {} });
    await content.load({ projectId, sourceRecords: [owner, { id: 'child', parent_id: owner.id,
        project_id: projectId, type: 'text', properties: { text: 'Child' } }] });
    await content.handleEvent({ type: 'project_view.list.toggle', id: owner.id });
    expect(content.readState().entries.map(entry => entry.id)).toContain('child');
    win.__eveProfilePreferences.visual.masteryLevel = 'beginner';
    content.build({ width: 720, height: 400, emit: () => {} });
    expect(content.readState().entries.map(entry => entry.id)).toEqual([owner.id]);
    expect(await content.handleEvent({ type: 'project_view.list.toggle', id: owner.id })).toMatchObject({ ignored: true });
    win.__eveProfilePreferences.visual.masteryLevel = 'intermediate';
    content.build({ width: 720, height: 400, emit: () => {} });
    expect(content.readState().entries.map(entry => entry.id)).toContain('child');
});

test('row Play selects its canonical target then invokes the real Play definition', async () => {
    vi.stubGlobal('window', profile('beginner'));
    const calls = [];
    const play = { type: 'tool', label: 'Play', icon: 'play', tool_id: 'tool.main.play', action: 'toggle' };
    setMainMenuRuntime({ getContent: () => ({ play }) });
    setAtomeContextualEditApi({ invokeToolDefinition: (definition, options) => {
        calls.push({ definition, options }); return { ok: true };
    } });
    await playProjectViewEntry({ entry: { id: owner.id, visualRecord: owner },
        select: async id => { calls.push(id); return { ok: true }; } });
    expect(calls[0]).toBe(owner.id);
    expect(calls[1].definition).toMatchObject({ key: 'play', toolId: 'tool.main.play' });
    expect(calls[1].options).toMatchObject({ atomeId: owner.id, railOnly: true, record: { structured_context: true } });
    calls.length = 0;
    await playProjectViewEntry({ entry: { id: owner.id }, select: async () => ({ ok: false }) });
    expect(calls).toEqual([]);
});

test('beginner opens its canonical level rail automatically with Organizer as its sole extra', async () => {
    vi.stubGlobal('window', profile('beginner'));
    resetProjectViewNavigation(projectId, 'Project');
    const api = { enter: vi.fn(() => ({ ok: true })), enterVirtual: vi.fn() };
    setAtomeContextualEditApi(api);
    const runtime = createProjectViewSurfaceContextRuntime({ state: { projectId }, activeContent: () => ({ key: 'list' }) });
    await runtime.openCurrentLevel({ readRecord: async () => ({ id: projectId, type: 'project' }) });
    expect(api.enterVirtual).not.toHaveBeenCalled();
    expect(api.enter.mock.calls[0][0]).toMatchObject({ atomeId: projectId, railOnly: true,
        record: { project_id: projectId, structured_context: true } });
    expect(api.enter.mock.calls[0][0].extraDefinitions.map(definition => definition.key)).toEqual(['container_dashboard']);
});

test.each(['beginner', 'intermediate', 'advanced'])('%s selection composes the List extras and routes Enter from the rail', async level => {
    vi.stubGlobal('window', { ...profile(level), Atome: { getStateCurrent: async () => owner } });
    surface();
    vi.spyOn(modeState, 'getProjectViewMode').mockReturnValue('natural'); // first mount precedes the mode event
    const enter = vi.fn(value => value), enterTarget = vi.fn(id => ({ ok: true, id }));
    await feedContextualRailWithRow({ target: { id: owner.id, record: owner }, projectId,
        api: { enter }, enterTarget, loadRecords: async () => ({ ok: true, records: [owner] }) });
    const input = enter.mock.calls[0][0];
    const keys = input.extraDefinitions.map(definition => definition.key);
    expect(keys).not.toContain('molecule_info');
    if (level === 'beginner') expect(keys).toEqual(['container_dashboard']);
    else {
        expect(keys).toContain('molecule_enter');
        await input.extraInvoker(input.extraDefinitions.find(definition => definition.key === 'molecule_enter'));
        expect(enterTarget).toHaveBeenCalledWith(owner.id);
    }
});

test('first beginner List mount resolves real catalog tools, including Import and native creation options', () => {
    vi.stubGlobal('window', profile('beginner')); surface();
    vi.spyOn(modeState, 'getProjectViewMode').mockReturnValue('natural');
    const translate = (_key, fallback) => fallback;
    const callbackNames = `applyDeleteSelection closeBackgroundPanel closeCalendarPanel closeCanonicalHomePanel
        closeCommunicatePanel closeCouleurPanel closeDeletePanel closeFinderPanel closeFontPanel closeInfoPanel
        closeLayerPanel closeMatrixView closeMediaPanel closePastePanel closeTimelinePanel closeUndoPanel
        ensureActivitiesModule ensureCopyModule ensurePastePanelModule handleAiTouch handleFinderTouch invokeTool
        openBackgroundPanel openCalendarPanel openCanonicalHomePanel openCommunicatePanel openCouleurPanel
        openDeletePanel openFinderPanel openFontPanel openInfoPanel openLayerPanel openMatrixView openMediaPanel
        openPastePanel openTimelinePanel openUndoPanel orientationChanged`.split(/\s+/).filter(Boolean);
    const intuitionContent = createMainMenuContentRuntime({ ...Object.fromEntries(callbackNames.map(name => [name, vi.fn()])),
        mainToolIdByKey: { create: 'tool.main.create', draw: 'tool.main.draw', play: 'tool.main.play' },
        translate, directionValues: [], directionValueToLabel: {}, defaultOrientation: 0 });
    const runtime = createAtomeContextualRailRuntime({ intuitionContent, mainToolIdByKey: {}, translate,
        ensureDeletePanelModule: vi.fn(), ensureSizePanelModule: vi.fn(), maybeBlockSelectionRequiredToolActivation: vi.fn(),
        handleFinderTouch: vi.fn(), getFinderToolEl: vi.fn(), invokeUnifiedContextTool: vi.fn(),
        normalizeMainToolKey: key => key, resolveCanonicalMainToolId: id => id,
        getAtomeElement: () => null, getAtomeRuntimeState: () => null,
        isSelectionRequiredToolKey: () => false, readSelectionSnapshot: () => ({ ids: [] }) });
    const definitions = runtime.resolveAtomeContextualRailToolDefinitionsForOptions({ atomeId: owner.id,
        kind: 'group', railOnly: true, record: { ...owner, structured_context: true },
        projectRecord: { capabilities: { create: true } } });
    expect(definitions.map(definition => definition.key)).toEqual(BEGINNER_LIST_RAIL_KEYS);
    expect(definitions.find(definition => definition.key === 'import').toolId).toBe('ui.media.panel');
    expect(definitions.find(definition => definition.key === 'shape_create')).toMatchObject({ toolId: 'ui.shape.create', extraInput: { content_kind: 'shape' } });
    const root = runtime.resolveAtomeContextualRailToolDefinitionsForOptions({ atomeId: projectId, kind: 'group',
        railOnly: true, record: { ...owner, id: projectId, project_id: projectId, structured_context: true },
        projectRecord: { capabilities: { create: true } } });
    expect(root.map(definition => definition.key)).toEqual(BEGINNER_LIST_RAIL_KEYS.filter(key => key !== 'delete'));
    runtime.atomeContextualEditRuntime.enter({ atomeId: owner.id, projectId, kind: 'group', railOnly: true,
        record: owner, extraDefinitions: [projectViewDashboardToolDefinition()] });
    expect(runtime.readAtomeContextualEditState().handedness).toBe('right');
});
