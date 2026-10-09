import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { FIRST_LAUNCH_TEMPLATES } from '../../eVe/domains/templates/first_launch_template_catalog.js';
import { planTemplateInstanceSync } from '../../eVe/domains/templates/project_template_model.js';

const store = vi.hoisted(() => ({ records: new Map(), batches: [], serial: 0, fail: false }));
vi.mock('../../eVe/intuition/runtime/interaction_runtime.js', () => ({
    saveInteraction: async () => { throw new Error('dashboard_template_has_no_interactions'); }
}));
vi.mock('../../eVe/intuition/matrix/core/project_data.js', () => ({
    loadProjectList: async () => [...store.records.values()].filter(record => record.type === 'project'),
    createProjectRecord: async () => { throw new Error('existing_home_must_not_be_recreated'); }
}));
vi.mock('../../eVe/intuition/tools/core/tool_runtime_atome_mutation_shared.js', () => ({
    createUuid: () => 'added-' + ++store.serial,
    refreshCommittedProjectProjection: vi.fn(async () => ({ ok: true })),
    commitRuntimeSetBatch: async events => {
        store.batches.push(events);
        if (store.fail) return { ok: false, result: { error: 'write_denied' } };
        for (const event of events) {
            const old = store.records.get(event.atome_id) || {};
            store.records.set(event.atome_id, { ...old, id: event.atome_id, type: event.type || old.type,
                project_id: event.project_id, parent_id: event.parent_id || old.parent_id,
                deleted: event.kind === 'delete', properties: { ...old.properties, ...event.props } });
        }
        return { ok: true };
    }
}));
import { syncTemplateInstance } from '../../eVe/domains/templates/project_template_runtime.js';
import { ensureSystemTemplate } from '../../eVe/domains/templates/system_template_runtime.js';
let dom;

beforeEach(() => {
    store.records = new Map(); store.batches = []; store.serial = 0; store.fail = false;
    store.records.set('source', { id: 'source', type: 'project', properties: {
        project_tags: ['template'], project_template: { scope: 'system' },
        system_template_key: 'dashboard_basic', system_template_version: 5 } });
    store.records.set('home', { id: 'home', type: 'project', properties: {
        template_link: { source_project_id: 'source' }, personal_preference: 'keep' } });
    const old = FIRST_LAUNCH_TEMPLATES.dashboard_basic.atoms.filter(atom => !atom.ref.endsWith('_background')).map(atom => {
        const isAdd = ['new_program', 'new_monitor'].includes(atom.ref);
        return { id: 'source-' + atom.ref, type: atom.type, project_id: 'source',
            parent_id: 'source-' + (isAdd ? atom.ref === 'new_program' ? 'programs_title_group' : 'monitors_title_group' : atom.parent_ref || '').replace(/^$/, 'root'),
            properties: { ...atom.props, system_template_ref: atom.ref,
                ...(isAdd ? { template_control: { ...atom.props.template_control, content_layout: 'icon_button' } } : {}) } };
    });
    old[0].parent_id = 'source';
    for (const record of old) store.records.set(record.id, record);
    const plan = planTemplateInstanceSync({ sourceProjectId: 'source', sourceStates: old,
        instanceRootId: 'home', instanceProjectId: 'home', createId: () => 'instance-' + ++store.serial });
    for (const event of plan.events) store.records.set(event.atome_id, { id: event.atome_id,
        type: event.type, project_id: 'home', parent_id: event.parent_id,
        properties: { ...event.props, ...(event.props.template_control ? { template_value: 'user-value' } : {}) } });
    dom = new JSDOM('');
    dom.window.Atome = {
        getStateCurrent: vi.fn(async id => store.records.get(id)),
        listStateCurrent: vi.fn(async id => [...store.records.values()].filter(record => record.project_id === id))
    };
    vi.stubGlobal('window', dom.window); vi.stubGlobal('document', dom.window.document);
});
afterEach(() => { dom.window.close(); vi.unstubAllGlobals(); });

it('updates the installed v5 source and existing home through canonical commits, retaining identities and values', async () => {
    const identities = [...store.records.values()].filter(record => record.project_id === 'home').map(record => record.id);
    const migrated = await syncTemplateInstance('home');
    expect(migrated.ok).toBe(true); expect(migrated.created).toHaveLength(2);
    expect(store.records.get('source').properties.system_template_version).toBe(6);
    for (const id of identities) {
        expect(store.records.get(id).deleted).not.toBe(true);
        if (store.records.get(id).properties.template_control) expect(store.records.get(id).properties.template_value).toBe('user-value');
    }
    expect(store.records.get('home').properties.personal_preference).toBe('keep');
    const homeCells = [...store.records.values()].filter(record => record.project_id === 'home');
    for (const operation of ['new_program', 'new_monitor']) {
        const cell = homeCells.find(record => record.properties.template_control?.operation === operation);
        expect(cell.properties.template_control.content_layout).toBe('label_band');
        expect(store.records.get(cell.parent_id).properties.matrix_template).toBe('dashboard_basic');
    }
    expect(homeCells.filter(record => record.properties.template_control?.kind === 'group'
        && !record.properties.template_control.operation)).toHaveLength(2);
    store.batches = [];
    expect(await syncTemplateInstance('home')).toMatchObject({ ok: true, created: [], updated: [] });
    expect(store.batches).toHaveLength(0);
    expect(await ensureSystemTemplate('dashboard_basic')).toMatchObject({ ok: true, installed: false });
}, 15000);

it('leaves pinned templates untouched and reports a refused source upgrade', async () => {
    store.records.get('home').properties.template_link.update_policy = 'pinned';
    store.records.get('home').properties.template_link.initialized = true;
    expect(await syncTemplateInstance('home')).toMatchObject({ ok: true, skipped: 'pinned' });
    expect(store.batches).toHaveLength(0);
    delete store.records.get('home').properties.template_link.update_policy;
    store.fail = true;
    expect(await syncTemplateInstance('home')).toMatchObject({ ok: false, error: 'write_denied' });
    expect(store.records.get('source').properties.system_template_version).toBe(5);
    expect([...store.records.values()].some(record => record.properties.system_template_ref?.endsWith('_background'))).toBe(false);
});
