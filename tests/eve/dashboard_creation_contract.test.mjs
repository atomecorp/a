import { test, expect, vi, afterEach } from 'vitest';
import { createDashboardCreationActions } from '../../eVe/domains/dashboard/dashboard_creation_actions.js';
import { createDashboardActionRuntime } from '../../eVe/domains/dashboard/dashboard_actions.js';
import { DASHBOARD_PROJECT_GOALS, DASHBOARD_OBJECTIVES, dashboardObjectiveFor } from '../../eVe/domains/dashboard/dashboard_creation_catalog.js';
import { dashboardDefaultTarget } from '../../eVe/domains/dashboard/dashboard_progression_catalog.js';
import * as mutation from '../../eVe/intuition/tools/core/tool_runtime_atome_mutation_shared.js';
import { buildBootstrapDefsA } from '../../eVe/intuition/tools/core/tool_runtime_bootstrap_defs_a.js';
import { ATOME_OBJECTIVE_IDS, registerCoreAtomeTypes } from '../../atome/src/shared/core_atome_types.js';
import { normalizeCanonicalAtome } from '../../atome/src/shared/atome_contract.js';
import { systemTemplateSpec } from '../../eVe/domains/templates/system_template_catalog.js';
import { createFromSystemTemplate } from '../../eVe/domains/templates/system_template_runtime.js';
import { createProjectRecord } from '../../eVe/intuition/matrix/core/project_data.js';
import { eveT, setEveLocale } from '../../eVe/i18n/i18n.js';
import { buildProjectViewSurfaceTree } from '../../eVe/domains/rendering/project_view_surface_tree.js';
import { createProjectViewListContent } from '../../eVe/domains/rendering/project_view_list_content.js';
import { projectViewVisualPanel } from '../../eVe/domains/rendering/project_view_visual_panel.js';

afterEach(() => { projectViewVisualPanel.reset(); projectViewVisualPanel.setEnabled(true); vi.unstubAllGlobals(); vi.restoreAllMocks(); setEveLocale('fr'); });

vi.mock('../../eVe/domains/templates/system_template_runtime.js', () => ({ createFromSystemTemplate: vi.fn(),
    ensureObjectiveEngagement: vi.fn(async () => ({ ok: true })) }));

test.each([
    ['health', 'sleep', 'sleep'],
    ['creation', 'audio', 'music_title']
])('guided %s → %s creates and opens its programme through the shared template owner', async (family, goal, key) => {
    const spec = systemTemplateSpec(key);
    createFromSystemTemplate.mockImplementationOnce(async (templateKey, { openProject }) => {
        if (!systemTemplateSpec(templateKey)) return { ok: false, error: `system_template_unknown:${templateKey}` };
        const opened = await openProject({ id: 'programme-instance', name: spec.name });
        return { ok: opened.ok, project_id: 'programme-instance', template_project_id: 'library-template' };
    });
    const openProject = vi.fn(async () => ({ ok: true }));
    const projectCreator = vi.fn();
    const committed = vi.spyOn(mutation, 'commitRuntimeSetBatch').mockResolvedValue({ ok: true });
    const actions = createDashboardCreationActions({ openProject, projectCreator });
    const result = await actions.createGuidedProject({ family, goal });

    expect(result).toMatchObject({ ok: true, project_id: 'programme-instance' });
    expect(createFromSystemTemplate).toHaveBeenLastCalledWith(key, { openProject: expect.any(Function), name: expect.any(String) });
    expect(committed.mock.calls[0][0][0]).toMatchObject({ atome_id: 'programme-instance', props: {
        project_intent: { family, goal, ...(family === 'health' ? { objective_id: 'OBJ-02' } : {}) } } });
    expect(openProject).toHaveBeenCalledExactlyOnceWith({ payload: { id: 'programme-instance', name: spec.name } });
    expect(projectCreator).not.toHaveBeenCalled();
});

test('empty project reuses the creator without content or a template', async () => {
    const created=[],opened=[];
    const actions=createDashboardCreationActions({projectCreator:async()=>async input=>{created.push(input);return {ok:true,project:{id:'empty'}};},
        openProject:async item=>{opened.push(item);return {ok:true};}});
    await actions.createDefault('projects');
    expect(created).toEqual([{name:'',empty:true,properties:{}}]);
    expect(opened).toHaveLength(1);
});

test('existing project removes its presentation before loading and restores it after a load failure', async () => {
    const calls=[];const actions=createDashboardActionRuntime({loadProjectRuntime:async()=>{calls.push('load');throw Error('offline');}});
    await expect(actions.openProjectItem({id:'existing'},{cover:{prepare:async()=>calls.push('prepare'),restore:async()=>calls.push('restore')}})).rejects.toThrow('offline');
    expect(calls).toEqual(['prepare','load','restore']);
});

test.each(Object.entries(DASHBOARD_PROJECT_GOALS).flatMap(([family, goals]) => goals.map(goal => [family, goal])))
('beginner %s/%s starts an ordinary project through the shared creator', async (family, goal) => {
    vi.stubGlobal('window', { __eveProfilePreferences: { visual: { masteryLevel: 'beginner' } } });
    const create = vi.fn(async input => ({ project: { id: 'new', name: input.name } }));
    const newsCreator = vi.fn();
    const openProject = vi.fn(async () => ({ ok: true }));
    const actions = createDashboardCreationActions({ projectCreator: async () => create, newsCreator,
        openProject });
    const result = await actions.createGuidedProject({ family, goal });
    expect(result.ok).toBe(true);
    expect(create).toHaveBeenCalledExactlyOnceWith({ name: expect.any(String), empty: true,
        properties: expect.objectContaining({ project_intent: expect.objectContaining({ family, goal }) }) });
    if (goal === 'sleep' || (family === 'creation' && goal === 'audio')) {
        expect(create.mock.calls[0][0].properties.project_program.definition.key).toBe(goal === 'sleep' ? 'sleep' : 'music_title');
    }
    expect(newsCreator).not.toHaveBeenCalled();
    expect(openProject).toHaveBeenCalledExactlyOnceWith({ payload: { id: 'new', name: expect.any(String) } });
});

const projectStore = (level, failure = null) => {
    const records = new Map();
    const commitBatch = vi.fn(async events => {
        if (failure) return { ok: false, error: failure };
        for (const event of events) {
            const previous = records.get(event.atome_id);
            records.set(event.atome_id, { id: event.atome_id, type: event.type || previous?.type,
                owner_id: 'qa-owner', project_id: event.project_id || previous?.project_id,
                parent_id: event.parent_id || previous?.parent_id,
                properties: { ...previous?.properties, ...event.props } });
        }
        return { ok: true };
    });
    vi.stubGlobal('window', { __currentUser: { id: 'qa-owner' },
        __eveProfilePreferences: { visual: { masteryLevel: level } }, Atome: { commitBatch },
        AdoleAPI: { auth: { getCurrentInfo: () => ({ id: 'qa-owner' }) }, projects: {
            list: async () => ({ fastify: { projects: [...records.values()].filter(record => record.type === 'project') },
                meta: { source: 'fastify' } }) } } });
    return { records, commitBatch };
};

// Every objective walks its preparation (objective_preparation.js): none is a « preview » any more.
test.each(['fr', 'en'])('official objectives remain distinct and localized (%s)', locale => {
    setEveLocale(locale);
    expect(DASHBOARD_OBJECTIVES.map(objective => objective.objective_id)).toEqual(ATOME_OBJECTIVE_IDS);
    expect(DASHBOARD_PROJECT_GOALS.health).toContain('free');
    expect(DASHBOARD_OBJECTIVES.every(objective => !eveT(objective.label_key).startsWith('eve.'))).toBe(true);
    expect(dashboardObjectiveFor({ goal: 'aging' }).objective_id).toBe('OBJ-10');
    expect(dashboardObjectiveFor({ goal: 'aesthetic' }).objective_id).toBe('OBJ-13');
    expect(DASHBOARD_PROJECT_GOALS.health).toContain('nutrition');
    expect(DASHBOARD_PROJECT_GOALS.health).toContain('voice');
});

test.each(DASHBOARD_OBJECTIVES)('$objective_id creates one private, canonically typed intention without inventing a programme', async objective => {
    const { records } = projectStore('beginner'); registerCoreAtomeTypes();
    const actions = createDashboardCreationActions({ projectCreator: async () => createProjectRecord,
        openProject: async () => ({ ok: true }) });
    const result = await actions.createGuidedProject({ objective_id: objective.objective_id });
    const root = records.get(result.project.id);
    expect([...records.values()].filter(record => record.type === 'project')).toHaveLength(1);
    // Every health objective starts with its measurable target (dashboard_progression_catalog.js).
    expect(root.properties.project_intent).toEqual({ family: 'health', goal: objective.goal, objective_id: objective.objective_id,
        target: dashboardDefaultTarget(objective.goal) });
    const replayed = normalizeCanonicalAtome({ id: root.id, type: 'project', properties: {
        project_intent: JSON.parse(JSON.stringify(root.properties.project_intent)) } }).atome;
    expect(replayed.properties.project_intent).toEqual(root.properties.project_intent);
    expect(root.properties.project_intent.audience).toBeUndefined();
    expect(root.properties.project_program?.definition.key).toBe(objective.goal === 'sleep' ? 'sleep' : undefined);
});

test('free expression uses the project name and legacy projects keep their original properties', async () => {
    const { records } = projectStore('beginner');
    const original = await createProjectRecord({ name: 'My historical journal', empty: true,
        properties: { project_intent: { family: 'health', goal: 'journal' } } });
    const before = structuredClone(records.get(original.createdId));
    const actions = createDashboardCreationActions({ projectCreator: async () => createProjectRecord,
        openProject: async () => ({ ok: true }) });
    const result = await actions.createGuidedProject({ family: 'health', goal: 'free', name: 'Learn the cello' });
    expect(records.get(result.project.id).properties).toMatchObject({ name: 'Learn the cello', project_intent: { family: 'health', goal: 'free' } });
    expect(records.get(result.project.id).properties.project_program).toBeUndefined();
    expect(records.get(original.createdId).properties.name).toBe(before.properties.name);
    expect(records.get(original.createdId).properties.project_intent).toEqual(before.properties.project_intent);
    registerCoreAtomeTypes();
    expect(() => normalizeCanonicalAtome({ id: 'bad', type: 'project', properties: {
        project_intent: { family: 'health', goal: 'weight', objective_id: 'OBJ-99' } } })).toThrow();
});

test.each([{ objective_id: 'OBJ-99' }, { objective_id: 'OBJ-01', family: 'creation' },
    { objective_id: 'OBJ-01', goal: 'sleep' }])('rejects inconsistent objective identities before creating anything: %j', async input => {
    const projectCreator = vi.fn();
    const actions = createDashboardCreationActions({ projectCreator, openProject: async () => ({ ok: true }) });
    await expect(actions.createGuidedProject(input)).rejects.toThrow('dashboard_objective_identity_invalid');
    expect(projectCreator).not.toHaveBeenCalled();
});

test('the typed New Project command exposes every official objective', () => {
    const definition = buildBootstrapDefsA(value => value, value => value, 'calendar', 'registered').find(def => def.tool_id === 'ui.new_project');
    expect(definition.input_schema.properties.objective_id.enum).toEqual(ATOME_OBJECTIVE_IDS);
});

test('a refused stable identity write cannot open a pilot instance as if creation succeeded', async () => {
    vi.spyOn(mutation, 'commitRuntimeSetBatch').mockResolvedValue({ ok: false, error: 'permission_denied' });
    createFromSystemTemplate.mockImplementationOnce(async (key, { openProject }) => openProject({ id: 'refused-pilot' }));
    const openProject = vi.fn();
    const actions = createDashboardCreationActions({ openProject });
    await expect(actions.createGuidedProject({ objective_id: 'OBJ-02' })).rejects.toThrow('permission_denied');
    expect(openProject).not.toHaveBeenCalled();
});

test.each(['fr', 'en'])('a beginner blank project persists exactly one white welcome row (%s)', async locale => {
    const { records, commitBatch } = projectStore('beginner');
    setEveLocale(locale);
    const first = await createProjectRecord({ name: 'QA blank', empty: true });
    const second = await createProjectRecord({ name: 'QA journal', empty: true, properties: { project_intent: { family: 'health', goal: 'journal' } } });
    expect(first.createdId).not.toBe(second.createdId);
    for (const project of [first, second]) {
        const root = records.get(project.createdId);
        expect(root.properties.view_mode).toBe('list');
        const children = [...records.values()].filter(record => record.parent_id === project.createdId);
        expect(children).toHaveLength(1);
        expect(children[0]).toMatchObject({ type: 'text', project_id: project.createdId,
            properties: { text: eveT('eve.project_view.beginner_welcome'), name: eveT('eve.project_view.beginner_welcome'),
                color: '#ffffff', hierarchy_order: 0 } });
        const creation = commitBatch.mock.calls.find(([events]) => events[0].atome_id === project.createdId && events[0].type === 'project');
        expect(creation[0]).toHaveLength(2);
    }
});

test.each([['beginner', false], ['intermediate', true], ['advanced', true]])
('template/clone construction and %s creation preserve their supplied content contract', async (level, empty) => {
    const { records } = projectStore(level);
    const created = await createProjectRecord({ name: 'QA source', empty, properties: { view_mode: 'natural' } });
    expect(records.get(created.createdId).properties.view_mode).toBe('natural');
    expect([...records.values()].filter(record => record.parent_id === created.createdId)).toHaveLength(0);
});

test('a rejected canonical creation fails before ordering or opening a project', async () => {
    const { records, commitBatch } = projectStore('beginner', 'permission_denied');
    await expect(createProjectRecord({ name: 'Rejected', empty: true })).rejects.toThrow('permission_denied');
    expect(records.size).toBe(0);
    expect(commitBatch).toHaveBeenCalledTimes(1);
});

test.each(['beginner', 'intermediate', 'advanced'])('the %s List composes the shared upper preview and splitter', level => {
    projectStore(level);
    const record = { id: 'welcome', type: 'text', project_id: 'new', properties: { text: 'Shared preview', color: '#ffffff' } };
    const tree = buildProjectViewSurfaceTree({
        surface: { getBoundingClientRect: () => ({ width: 1200, height: 800 }) },
        state: { mode: 'list', projectId: 'new', playingIds: [], playingRecords: [] },
        activeContent: () => ({ build: () => [{ id: 'real_list', type: 'panel', style: { size: [1000, 64] } }],
            recordsFor: () => [], contextualTarget: () => null }),
        syncVisualSubject: () => { projectViewVisualPanel.setSubject(record); return { record }; }, contextualState: {}, emit: () => {},
        footer: { setLevel() {}, setTransport() {}, build: () => ({ id: 'project_footer', style: {} }) },
        navigation: { depth: 0 }, currentProjectName: () => 'QA'
    });
    const nodes = [];
    const visit = node => { nodes.push(node); node.children?.forEach(visit); };
    visit(tree.root);
    const visual = nodes.find(node => node.id === 'project_view_visual');
    const separator = nodes.find(node => node.id === 'project_view_separator');
    expect(visual).toBeDefined();
    expect(separator).toBeDefined();
    expect(nodes.some(node => node.id === 'project_view_visual_preview')).toBe(true);
    expect(nodes.some(node => node.text === 'Shared preview')).toBe(true);
    expect(visual.style.position[1] + visual.style.size[1]).toBe(separator.style.position[1]);
    expect(nodes.some(node => node.id === 'real_list')).toBe(true);
    const body = nodes.find(node => node.id.endsWith('_body'));
    const content = nodes.find(node => node.id.endsWith('_content'));
    expect(body.style.position[1] + body.style.size[1]).toBe(content.style.size[1]);
    expect(content.style.position[1]).toBeGreaterThan(separator.style.position[1]);
});

for (const level of ['beginner', 'intermediate', 'advanced']) {
    for (const direction of ['up', 'down']) {
        test.each([1, 3, 20])(
            level + ' List anchors %i real rows next to its footer when opening ' + direction,
            async count => {
                projectStore(level);
                window.__eveProfilePreferences.visual.accordionDirection = direction;
                window.addEventListener = vi.fn();
                window.removeEventListener = vi.fn();
                const records = Array.from({ length: count }, (_, index) => ({
                    id: 'item_' + index, project_id: 'new', type: ['text', 'video', 'audio'][index % 3],
                    properties: { name: 'Item ' + index, text: 'Text', hierarchy_order: index }
                }));
                const content = createProjectViewListContent({ requestRefresh: () => {} });
                await content.load({ projectId: 'new', sourceRecords: records });
                for (const size of [{ width: 1200, height: 800 }, { width: 390, height: 480 }]) {
                    const tree = buildProjectViewSurfaceTree({
                        surface: { getBoundingClientRect: () => size },
                        state: { mode: 'list', projectId: 'new', playingIds: [] },
                        activeContent: () => content,
                        syncVisualSubject: () => null, contextualState: {}, emit: () => {},
                        footer: { setLevel() {}, setTransport() {}, build: () => ({ id: 'project_footer', style: {} }) },
                        navigation: { depth: 0 }, currentProjectName: () => 'QA'
                    });
                    const nodes = [];
                    const visit = node => { nodes.push(node); node.children?.forEach(visit); };
                    visit(tree.root);
                    const body = nodes.find(node => node.id.endsWith('_body'));
                    const frame = nodes.find(node => node.id === 'project_view_list_frame');
                    const area = nodes.find(node => node.id.endsWith('_content'));
                    const footer = nodes.find(node => node.id === 'project_view_root_hierarchy');
                    const rows = nodes.filter(node => /^project_view_list_entry_\d+$/.test(node.id));
                    expect(rows.length).toBeGreaterThan(0);
                    expect(rows.length).toBeLessThanOrEqual(count);
                    expect(records.map(record => record.properties.hierarchy_order)).toEqual(
                        Array.from({ length: count }, (_, index) => index));
                    if (direction === 'up') {
                        expect(body.style.position[1] + frame.style.size[1]).toBe(area.style.size[1]);
                        expect(area.style.position[1] + area.style.size[1]).toBeLessThanOrEqual(footer.style.position[1]);
                    } else {
                        expect(body.style.position[1]).toBe(0);
                        expect(area.style.position[1]).toBeGreaterThan(footer.style.position[1]);
                    }
                }
            });
    }
}
