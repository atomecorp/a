import { test, expect, vi } from 'vitest';
import { createDashboardCreationRuntime } from '../../eVe/domains/dashboard/dashboard_creation_runtime.js';
import { createDashboardCreationActions } from '../../eVe/domains/dashboard/dashboard_creation_actions.js';
import { createDashboardActionRuntime } from '../../eVe/domains/dashboard/dashboard_actions.js';
import { dashboardCreationStep, DASHBOARD_PROJECT_GOALS } from '../../eVe/domains/dashboard/dashboard_creation_catalog.js';
import { createDashboardLayout } from '../../eVe/domains/dashboard/dashboard_layout.js';
import { buildDashboardBevyUiTree } from '../../eVe/domains/dashboard/dashboard_bevy_ui_tree.js';
import { mergeDashboardTokens } from '../../eVe/domains/dashboard/dashboard_tokens.js';
import { systemTemplateSpec } from '../../eVe/domains/templates/system_template_catalog.js';
import { createFromSystemTemplate } from '../../eVe/domains/templates/system_template_runtime.js';

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

test('project questions use a white surface and opaque family cards, and loading retains only sidebar chrome', () => {
    const tokens=mergeDashboardTokens();const step=dashboardCreationStep({categoryId:'projects'});
    const layout=createDashboardLayout({width:1000,height:850,categories:[{id:'projects',label_key:'projects',color:'#357245'}],
        itemsByCategory:new Map(),creationStep:step,activeCategoryId:'projects',tokens});
    const tree=buildDashboardBevyUiTree({layout,tokens,creationState:{busy:false},creationBackdropOpacity:1});
    const white=tree.root.children.find(node=>node.id.endsWith('creation_surface'));
    expect(white.overlayRecord.properties.color).toBe('#ffffff');
    const cards=tree.root.children.filter(node=>node.id.startsWith('__eve_dashboard_create_cell_'));
    expect(cards).toHaveLength(6);
    expect(cards.every(node=>node.style.opacity===1 && !node.style.backdrop)).toBe(true);
    expect(cards.every(node=>node.overlayRecord.properties.color.startsWith('#'))).toBe(true);
    const loading=buildDashboardBevyUiTree({layout,tokens,creationState:{busy:true},creationBackdropOpacity:1,sidebarOnly:true});
    expect(loading.root.children.every(node=>node.id.includes('header')||node.id.endsWith('creation_surface'))).toBe(true);
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
