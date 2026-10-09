import { test, expect, vi, afterEach } from 'vitest';
import { createDashboardCreationRuntime } from '../../eVe/domains/dashboard/dashboard_creation_runtime.js';
import { createDashboardCreationActions } from '../../eVe/domains/dashboard/dashboard_creation_actions.js';
import { createDashboardActionRuntime } from '../../eVe/domains/dashboard/dashboard_actions.js';
import { dashboardCreationStep, DASHBOARD_PROJECT_GOALS } from '../../eVe/domains/dashboard/dashboard_creation_catalog.js';
import { createDashboardLayout } from '../../eVe/domains/dashboard/dashboard_layout.js';
import { buildDashboardBevyUiTree } from '../../eVe/domains/dashboard/dashboard_bevy_ui_tree.js';
import { mergeDashboardTokens } from '../../eVe/domains/dashboard/dashboard_tokens.js';
import { systemTemplateSpec } from '../../eVe/domains/templates/system_template_catalog.js';
import { createFromSystemTemplate } from '../../eVe/domains/templates/system_template_runtime.js';
import { createProjectRecord } from '../../eVe/intuition/matrix/core/project_data.js';
import { eveT, setEveLocale } from '../../eVe/i18n/i18n.js';
import { buildProjectViewSurfaceTree } from '../../eVe/domains/rendering/project_view_surface_tree.js';
import { createProjectViewListContent } from '../../eVe/domains/rendering/project_view_list_content.js';

afterEach(() => { vi.unstubAllGlobals(); setEveLocale('fr'); });

vi.mock('../../eVe/domains/templates/system_template_runtime.js', () => ({ createFromSystemTemplate: vi.fn() }));

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
    const invalidateCategories = vi.fn(async () => {});
    const projectCreator = vi.fn();
    const state = { active: true };
    const actions = createDashboardCreationActions({ openProject, invalidateCategories, projectCreator });
    const runtime = createDashboardCreationRuntime({ state, actions, render: async () => {} });

    await runtime.toggleFromHeader('projects');
    await runtime.choose(`family_${family}`);
    const result = await runtime.choose(`goal_${family}_${goal}`);

    expect(result).toMatchObject({ ok: true, project_id: 'programme-instance' });
    expect(createFromSystemTemplate).toHaveBeenLastCalledWith(key, { openProject: expect.any(Function) });
    expect(openProject).toHaveBeenCalledExactlyOnceWith({ payload: { id: 'programme-instance', name: spec.name } });
    expect(invalidateCategories).toHaveBeenCalledExactlyOnceWith(['projects', 'news']);
    expect(projectCreator).not.toHaveBeenCalled();
    expect(state.creation).toBeNull();
    expect(state.activeCategoryId).toBe('');
});

test('empty project reuses the creator without content or a template, preserving every existing choice', async () => {
    const created=[],opened=[];
    const actions=createDashboardCreationActions({projectCreator:async()=>async input=>{created.push(input);return {ok:true,project:{id:'empty'}};},
        invalidateCategories:async()=>{},openProject:async item=>{opened.push(item);return {ok:true};}});
    const state={active:true};let resolveReady;
    const ready=new Promise(resolve=>{resolveReady=resolve;});
    const runtime=createDashboardCreationRuntime({state,render:async()=>{},actions:{...actions,createDefault:async id=>{await ready;return actions.createDefault(id);}}});
    await runtime.toggleFromHeader('projects');
    expect(runtime.readStep().cells.map(cell=>cell.id)).toEqual(['empty_project',...Object.keys(DASHBOARD_PROJECT_GOALS).map(id=>'family_'+id),'family_templates']);
    const pending=runtime.choose('empty_project');
    await Promise.resolve();
    expect(state.creation.busy).toBe(true);
    expect((await runtime.choose('empty_project')).ignored).toBe('dashboard_creation_busy');
    resolveReady();await pending;
    expect(created).toEqual([{name:'',empty:true,properties:{}}]);
    expect(opened).toHaveLength(1);expect(state.creation).toBeNull();
});

test('project questions retain the wallpaper and use common glass cards, and loading retains only sidebar chrome', () => {
    const tokens=mergeDashboardTokens();const step=dashboardCreationStep({categoryId:'projects'});
    const layout=createDashboardLayout({width:1000,height:850,categories:[{id:'projects',label_key:'projects',color:'#357245'}],
        itemsByCategory:new Map(),creationStep:step,activeCategoryId:'projects',tokens});
    const tree=buildDashboardBevyUiTree({layout,tokens,creationState:{busy:false}});
    const white=tree.root.children.find(node=>node.id.endsWith('creation_surface'));
    expect(white).toBeUndefined();
    const cards=tree.root.children.filter(node=>node.id.startsWith('__eve_dashboard_create_cell_'));
    expect(cards).toHaveLength(6);
    expect(cards.every(node=>node.style.opacity===1 && node.style.backdrop.blurPx===16)).toBe(true);
    expect(cards.every(node=>node.overlayRecord.properties.color==='rgba(0,0,0,0)')).toBe(true);
    expect(cards.every(node=>node.style.backdrop.tint[3]===.69)).toBe(true);
    const loading=buildDashboardBevyUiTree({layout,tokens,creationState:{busy:true},sidebarOnly:true});
    expect(loading.root.children.every(node=>node.id.includes('header'))).toBe(true);
    expect(loading.root.children.some(node=>node.id.includes('create_cell'))).toBe(false);
});

test('cancel and creation failure return to an interactive question step', async () => {
    const state={active:true};const actions={createGuidedProject:async()=>{throw Error('permission_denied');},createNews:async()=>{},openEditor:async()=>{}};
    const runtime=createDashboardCreationRuntime({state,actions,render:async()=>{}});
    await runtime.toggleFromHeader('projects');await runtime.choose('family_creation');
    expect((await runtime.choose('goal_creation_video')).ok).toBe(false);
    expect(state.creation.busy).toBe(false);expect(state.creation.error).toBe('permission_denied');
    expect(runtime.readStep().cells.some(cell=>cell.id==='goal_creation_video')).toBe(true);
    await runtime.toggleFromHeader('projects');expect(state.activeCategoryId).toBe('');expect(state.creation).toBeNull();
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
        openProject, invalidateCategories: async () => {} });
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

test.each(['beginner', 'intermediate', 'advanced'])('the %s List composes its intended workspace layout', level => {
    projectStore(level);
    const tree = buildProjectViewSurfaceTree({
        surface: { getBoundingClientRect: () => ({ width: 1200, height: 800 }) },
        state: { mode: 'list', projectId: 'new', playingIds: [], playingRecords: [] },
        activeContent: () => ({ build: () => [{ id: 'real_list', type: 'panel', style: { size: [1000, 64] } }],
            recordsFor: () => [], contextualTarget: () => null }),
        syncVisualSubject: () => null, contextualState: {}, emit: () => {},
        footer: { setLevel() {}, setTransport() {}, build: () => ({ id: 'project_footer', style: {} }) },
        navigation: { depth: 0 }, currentProjectName: () => 'QA'
    });
    const nodes = [];
    const visit = node => { nodes.push(node); node.children?.forEach(visit); };
    visit(tree.root);
    expect(nodes.some(node => node.id === 'project_view_visual')).toBe(level !== 'beginner');
    expect(nodes.some(node => node.id === 'project_view_separator')).toBe(level !== 'beginner');
    expect(nodes.some(node => node.id === 'real_list')).toBe(true);
    if (level === 'beginner') {
        const body = nodes.find(node => node.id.endsWith('_body'));
        const content = nodes.find(node => node.id.endsWith('_content'));
        expect(body.style.position[1] + body.style.size[1]).toBe(content.style.size[1]);
        expect(nodes.find(node => node.id.endsWith('_content')).style.position[1]).toBeLessThan(20);
    }
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
