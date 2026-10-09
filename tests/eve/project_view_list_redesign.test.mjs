import { afterEach, expect, test, vi } from 'vitest';
import * as modeState from '../../eVe/domains/rendering/project_view_mode_state.js';
import * as surfaceState from '../../eVe/domains/rendering/project_view_surface_runtime.js';
import { createProjectViewListContent } from '../../eVe/domains/rendering/project_view_list_content.js';
import { feedContextualRailWithRow, projectViewDashboardToolDefinition } from '../../eVe/domains/rendering/project_view_contextual_rail.js';
import { createProjectViewSurfaceContextRuntime } from '../../eVe/domains/rendering/project_view_surface_context_runtime.js';
import { resetProjectViewNavigation } from '../../eVe/domains/rendering/project_view_navigation.js';
import { playProjectViewEntry } from '../../eVe/domains/rendering/project_view_item_actions.js';
import { setAtomeContextualEditApi } from '../../eVe/intuition/runtime/eve_intuition/atome_contextual_edit_registry.js';
import { createAtomeContextualRailRuntime } from '../../eVe/intuition/runtime/eve_intuition/atome_contextual_rail_runtime.js';
import { createMainMenuContentRuntime } from '../../eVe/intuition/runtime/eve_intuition/main_menu_content_runtime.js';
import { BEGINNER_LIST_RAIL_KEYS } from '../../eVe/domains/rendering/project_view_list_options.js';
import { resolveProjectViewVisualSubject } from '../../eVe/domains/rendering/project_view_visual_subject.js';
import { createProjectViewPresentationRuntime } from '../../eVe/domains/rendering/project_view_visual_fullscreen_runtime.js';
import { projectViewSplitHeights } from '../../eVe/domains/rendering/project_view_surface_layout.js';
import { projectViewVisualPanel } from '../../eVe/domains/rendering/project_view_visual_panel.js';

const projectId = 'list_redesign';
const profile = level => ({ addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options?.detail; } }, __currentProject: { id: projectId },
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

test('row Play runs the project from its row through the project transport tool, and stops its playing row', async () => {
    const calls = [];
    const invoke = async (payload) => { calls.push(payload); return { ok: true }; };
    const idle = { read: () => ({ playing: false, activePathIds: [] }) };
    await playProjectViewEntry({ entry: { id: owner.id, visualRecord: owner }, transport: idle, invoke });
    expect(calls[0]).toMatchObject({ tool_id: 'ui.project.transport',
        input: { operation: 'play', start_atome_id: owner.id } });
    const running = { read: () => ({ playing: true, activePathIds: [projectId, owner.id] }) };
    await playProjectViewEntry({ entry: { id: owner.id }, transport: running, invoke });
    expect(calls[1].input).toEqual({ operation: 'stop' });
    expect(await playProjectViewEntry({ entry: null, transport: idle, invoke })).toMatchObject({ ok: false });
    expect(calls).toHaveLength(2);
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

test('first beginner List mount resolves and invokes native catalog capture tools', async () => {
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
    const invoke = vi.fn(async () => ({ ok: true }));
    const runtime = createAtomeContextualRailRuntime({ intuitionContent, mainToolIdByKey: {}, translate,
        ensureDeletePanelModule: vi.fn(), ensureSizePanelModule: vi.fn(), maybeBlockSelectionRequiredToolActivation: vi.fn(),
        handleFinderTouch: vi.fn(), getFinderToolEl: vi.fn(), invokeUnifiedContextTool: invoke,
        normalizeMainToolKey: key => key, resolveCanonicalMainToolId: id => id,
        getAtomeElement: () => null, getAtomeRuntimeState: () => null,
        isSelectionRequiredToolKey: () => false, readSelectionSnapshot: () => ({ ids: [] }) });
    const definitions = runtime.resolveAtomeContextualRailToolDefinitionsForOptions({ atomeId: owner.id,
        kind: 'group', railOnly: true, record: { ...owner, structured_context: true },
        projectRecord: { capabilities: { create: true } } });
    expect(definitions.map(definition => definition.key)).toEqual(BEGINNER_LIST_RAIL_KEYS);
    expect(definitions.map(definition => definition.key)).toEqual(['couleur', 'import', 'photo', 'audio', 'video', 'text_create', 'shape_create']);
    expect(definitions.find(definition => definition.key === 'audio')).toMatchObject({ toolId: 'ui.capture.audio' });
    expect(definitions.find(definition => definition.key === 'video')).toMatchObject({ toolId: 'ui.capture.video' });
    for (const key of ['audio', 'video']) {
        await runtime.invokeAtomeContextualRailToolDefinitionWithContext(definitions.find(definition => definition.key === key), {
            atomeId: owner.id, record: { ...owner, structured_context: true }, railOnly: true
        });
        expect(invoke.mock.calls.at(-1)[0]).toMatchObject({ key, toolId: `ui.capture.${key}`, extraInput: { target_atome_id: owner.id } });
        await projectViewVisualPanel.setToolRecordingVisual({ toolId: `ui.capture.${key}`, sessionId: 'starting',
            kind: key === 'audio' ? 'audio_scope' : 'video_preview', phase: 'starting', projectId });
        try {
            const stop = runtime.resolveAtomeContextualRailToolDefinitionsForOptions({ atomeId: owner.id,
                record: { ...owner, structured_context: true }, railOnly: true }).find(definition => definition.key === key);
            expect(stop).toMatchObject({ active: true, icon: 'stop' });
            await runtime.invokeAtomeContextualRailToolDefinitionWithContext(stop, { atomeId: owner.id, railOnly: true });
            expect(invoke.mock.calls.at(-1)[0]).toMatchObject({ key, gatewayAction: 'state.off', previousLatched: true });
        } finally { await projectViewVisualPanel.clearToolRecordingVisual({ toolId: `ui.capture.${key}`, sessionId: 'starting' }); }
    }
    expect(definitions.find(definition => definition.key === 'import').toolId).toBe('ui.media.panel');
    expect(definitions.find(definition => definition.key === 'shape_create')).toMatchObject({ toolId: 'ui.shape.create', extraInput: { content_kind: 'shape' } });
    const root = runtime.resolveAtomeContextualRailToolDefinitionsForOptions({ atomeId: projectId, kind: 'group',
        railOnly: true, record: { ...owner, id: projectId, project_id: projectId, structured_context: true },
        projectRecord: { capabilities: { create: true } } });
    expect(root.map(definition => definition.key)).toEqual(BEGINNER_LIST_RAIL_KEYS.filter(key => key !== 'delete'));
    const denied = runtime.resolveAtomeContextualRailToolDefinitionsForOptions({ atomeId: projectId, kind: 'group', railOnly: true,
        record: { ...owner, id: projectId, structured_context: true }, projectRecord: { capabilities: { create: false } } });
    expect(denied.map(definition => definition.key)).not.toContain('audio');
    expect(denied.map(definition => definition.key)).not.toContain('video');
    runtime.atomeContextualEditRuntime.enter({ atomeId: owner.id, projectId, kind: 'group', railOnly: true,
        record: owner, extraDefinitions: [projectViewDashboardToolDefinition()] });
    expect(runtime.readAtomeContextualEditState().handedness).toBe('right');
});

test.each(['beginner', 'intermediate', 'advanced'])('%s List rows feed the shared visual subject and splitter', async level => {
    vi.stubGlobal('window', profile(level));
    const refresh = vi.fn();
    const content = createProjectViewListContent({ requestRefresh: refresh });
    const records = ['image', 'text', 'audio', 'video'].map(type => ({ id: type, type, project_id: projectId,
        properties: { name: type, text: 'Text preview', duration: 4, media_url: `/media/${type}` } }));
    await content.load({ projectId, sourceRecords: [...records, owner, { id: 'group_child', type: 'text', parent_id: owner.id,
        project_id: projectId, properties: { text: 'Group preview', duration: 4 } }] });
    for (const record of records) {
        await content.handleEvent({ type: 'project_view.list.select', id: record.id });
        expect(resolveProjectViewVisualSubject({ content }).record.id).toBe(record.id);
    }
    await content.handleEvent({ type: 'project_view.list.select', id: owner.id });
    expect(resolveProjectViewVisualSubject({ content }).record.id).toBe('group_child');
    expect(refresh).toHaveBeenCalled();
    const state = { projectId, mode: 'list', presentationRatio: 1 / 3, presentationAvailableHeight: 600 };
    const render = vi.fn(), presentation = createProjectViewPresentationRuntime({ state, render });
    const before = projectViewSplitHeights({ availableHeight: 600, ratio: state.presentationRatio });
    await presentation.split({ phase: 'start', event: { client_y: 200 } });
    await presentation.split({ phase: 'move', event: { client_y: 300 } });
    const after = projectViewSplitHeights({ availableHeight: 600, ratio: state.presentationRatio });
    expect(after.visualHeight).toBeGreaterThan(before.visualHeight);
    expect(after.bodyHeight).toBeLessThan(before.bodyHeight);
    expect(render).toHaveBeenCalledOnce();
    await presentation.split({ phase: 'cancel' });
    expect(state.presentationRatio).toBe(1 / 3);
});

test.each(['beginner', 'intermediate', 'advanced'])('%s List refreshes the current level preview after navigation', async level => {
    vi.stubGlobal('window', profile(level));
    resetProjectViewNavigation(projectId, 'Project');
    setAtomeContextualEditApi({ enter: vi.fn(() => ({ ok: true })), enterVirtual: vi.fn(() => ({ ok: true })) });
    const state = { projectId, previewLevelRecord: { id: 'previous_level', type: 'group' } };
    const runtime = createProjectViewSurfaceContextRuntime({ state, activeContent: () => ({ key: 'list' }) });
    await runtime.openCurrentLevel({ readRecord: async () => ({ id: projectId, type: 'project', properties: { playback_mode: 'simultaneous' } }) });
    expect(state.previewLevelRecord).toMatchObject({ id: projectId, type: 'group', properties: { playback_mode: 'simultaneous' } });
});test('row Play invokes the shared project transport from that row and stops its active path', async () => {
    const invoke = vi.fn(async () => ({ ok: true }));
    const transport = { read: () => ({ playing: false, activePathIds: [] }) };
    await playProjectViewEntry({ entry: { id: owner.id }, transport, invoke });
    expect(invoke).toHaveBeenLastCalledWith(expect.objectContaining({ tool_id: 'ui.project.transport',
        action: 'pointer.click', input: { operation: 'play', start_atome_id: owner.id } }));
    transport.read = () => ({ playing: true, activePathIds: [owner.id] });
    await playProjectViewEntry({ entry: { id: owner.id }, transport, invoke });
    expect(invoke).toHaveBeenLastCalledWith(expect.objectContaining({ input: { operation: 'stop' } }));
    expect(await playProjectViewEntry({ entry: null, transport, invoke })).toMatchObject({ ok: false });
    expect(invoke).toHaveBeenCalledTimes(2);
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

test('first beginner List mount resolves and invokes native catalog capture tools', async () => {
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
    const invoke = vi.fn(async () => ({ ok: true }));
    const runtime = createAtomeContextualRailRuntime({ intuitionContent, mainToolIdByKey: {}, translate,
        ensureDeletePanelModule: vi.fn(), ensureSizePanelModule: vi.fn(), maybeBlockSelectionRequiredToolActivation: vi.fn(),
        handleFinderTouch: vi.fn(), getFinderToolEl: vi.fn(), invokeUnifiedContextTool: invoke,
        normalizeMainToolKey: key => key, resolveCanonicalMainToolId: id => id,
        getAtomeElement: () => null, getAtomeRuntimeState: () => null,
        isSelectionRequiredToolKey: () => false, readSelectionSnapshot: () => ({ ids: [] }) });
    const definitions = runtime.resolveAtomeContextualRailToolDefinitionsForOptions({ atomeId: owner.id,
        kind: 'group', railOnly: true, record: { ...owner, structured_context: true },
        projectRecord: { capabilities: { create: true } } });
    expect(definitions.map(definition => definition.key)).toEqual(BEGINNER_LIST_RAIL_KEYS);
    expect(definitions.map(definition => definition.key)).toEqual(['couleur', 'import', 'photo', 'audio', 'video', 'text_create', 'shape_create']);
    expect(definitions.find(definition => definition.key === 'audio')).toMatchObject({ toolId: 'ui.capture.audio' });
    expect(definitions.find(definition => definition.key === 'video')).toMatchObject({ toolId: 'ui.capture.video' });
    for (const key of ['audio', 'video']) {
        await runtime.invokeAtomeContextualRailToolDefinitionWithContext(definitions.find(definition => definition.key === key), {
            atomeId: owner.id, record: { ...owner, structured_context: true }, railOnly: true
        });
        expect(invoke.mock.calls.at(-1)[0]).toMatchObject({ key, toolId: `ui.capture.${key}`, extraInput: { target_atome_id: owner.id } });
    }
    expect(definitions.find(definition => definition.key === 'import').toolId).toBe('ui.media.panel');
    expect(definitions.find(definition => definition.key === 'shape_create')).toMatchObject({ toolId: 'ui.shape.create', extraInput: { content_kind: 'shape' } });
    const root = runtime.resolveAtomeContextualRailToolDefinitionsForOptions({ atomeId: projectId, kind: 'group',
        railOnly: true, record: { ...owner, id: projectId, project_id: projectId, structured_context: true },
        projectRecord: { capabilities: { create: true } } });
    expect(root.map(definition => definition.key)).toEqual(BEGINNER_LIST_RAIL_KEYS.filter(key => key !== 'delete'));
    const denied = runtime.resolveAtomeContextualRailToolDefinitionsForOptions({ atomeId: projectId, kind: 'group', railOnly: true,
        record: { ...owner, id: projectId, structured_context: true }, projectRecord: { capabilities: { create: false } } });
    expect(denied.map(definition => definition.key)).not.toContain('audio');
    expect(denied.map(definition => definition.key)).not.toContain('video');
    runtime.atomeContextualEditRuntime.enter({ atomeId: owner.id, projectId, kind: 'group', railOnly: true,
        record: owner, extraDefinitions: [projectViewDashboardToolDefinition()] });
    expect(runtime.readAtomeContextualEditState().handedness).toBe('right');
});

test.each(['beginner', 'intermediate', 'advanced'])('%s List rows feed the shared visual subject and splitter', async level => {
    vi.stubGlobal('window', profile(level));
    const refresh = vi.fn();
    const content = createProjectViewListContent({ requestRefresh: refresh });
    const records = ['image', 'text', 'audio', 'video'].map(type => ({ id: type, type, project_id: projectId,
        properties: { name: type, text: 'Text preview', duration: 4, media_url: `/media/${type}` } }));
    await content.load({ projectId, sourceRecords: [...records, owner, { id: 'group_child', type: 'text', parent_id: owner.id,
        project_id: projectId, properties: { text: 'Group preview', duration: 4 } }] });
    for (const record of records) {
        await content.handleEvent({ type: 'project_view.list.select', id: record.id });
        expect(resolveProjectViewVisualSubject({ content }).record.id).toBe(record.id);
    }
    await content.handleEvent({ type: 'project_view.list.select', id: owner.id });
    expect(resolveProjectViewVisualSubject({ content }).record.id).toBe('group_child');
    expect(refresh).toHaveBeenCalled();
    const state = { projectId, mode: 'list', presentationRatio: 1 / 3, presentationAvailableHeight: 600 };
    const render = vi.fn(), presentation = createProjectViewPresentationRuntime({ state, render });
    const before = projectViewSplitHeights({ availableHeight: 600, ratio: state.presentationRatio });
    await presentation.split({ phase: 'start', event: { client_y: 200 } });
    await presentation.split({ phase: 'move', event: { client_y: 300 } });
    const after = projectViewSplitHeights({ availableHeight: 600, ratio: state.presentationRatio });
    expect(after.visualHeight).toBeGreaterThan(before.visualHeight);
    expect(after.bodyHeight).toBeLessThan(before.bodyHeight);
    expect(render).toHaveBeenCalledOnce();
    await presentation.split({ phase: 'cancel' });
    expect(state.presentationRatio).toBe(1 / 3);
});

test.each(['beginner', 'intermediate', 'advanced'])('%s List refreshes the current level preview after navigation', async level => {
    vi.stubGlobal('window', profile(level));
    resetProjectViewNavigation(projectId, 'Project');
    setAtomeContextualEditApi({ enter: vi.fn(() => ({ ok: true })), enterVirtual: vi.fn(() => ({ ok: true })) });
    const state = { projectId, previewLevelRecord: { id: 'previous_level', type: 'group' } };
    const runtime = createProjectViewSurfaceContextRuntime({ state, activeContent: () => ({ key: 'list' }) });
    await runtime.openCurrentLevel({ readRecord: async () => ({ id: projectId, type: 'project', properties: { playback_mode: 'simultaneous' } }) });
    expect(state.previewLevelRecord).toMatchObject({ id: projectId, type: 'group', properties: { playback_mode: 'simultaneous' } });
});
