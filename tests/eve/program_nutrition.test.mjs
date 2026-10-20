import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { validateProgramNutrition } from '../../eVe/domains/programs/program_nutrition_model.js';
import { validateActivity } from '../../eVe/domains/programs/project_program_model.js';
import { createProgramNutritionControl } from '../../eVe/domains/programs/program_nutrition_control.js';
import { createProgramNutritionPresentation } from '../../eVe/domains/programs/program_nutrition_presentation.js';
import { createMatrixTemplateRuntime } from '../../eVe/domains/matrix/matrix_template_runtime.js';
import { createProjectProgramRuntime } from '../../eVe/domains/programs/project_program_runtime.js';
import { createProgramActivityConfigurationControl } from '../../eVe/domains/programs/program_activity_configuration_control.js';
import { registerCoreAtomeTypes } from '../../atome/src/shared/core_atome_types.js';
import { normalizeCanonicalAtome } from '../../atome/src/shared/atome_contract.js';
import { assertIdempotentEventReplay } from '../../atome/src/shared/adole_event_contract.js';
import { buildBootstrapDefsA } from '../../eVe/intuition/tools/core/tool_runtime_bootstrap_defs_a.js';
vi.mock('../../atome/src/squirrel/apis/unified/adole_apis.js', () => ({ AdoleAPI: {}, default: {} }));
beforeAll(registerCoreAtomeTypes);
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const walk = node => [node, ...(node.children || []).flatMap(walk)];
const meal = { version: 1, mode: 'meal', meal_type: 'other', components: [{ id: 'food', group: 'fruit', food: 'Fictitious chosen fruit' }] };
const activity = { brick_id: 'nutrition', title: 'Fictitious chosen meal', involvement: { minutes: 12, basis: 'week', days: [1], rhythm: 2 } };
const fixture = async ({ presentationFactory = createMatrixTemplateRuntime } = {}) => {
    const dom = new JSDOM('<body><div id="eve_surface_project"></div></body>', { url: 'http://localhost:3001', pretendToBeVisual: true });
    vi.stubGlobal('window', dom.window); vi.stubGlobal('document', dom.window.document);
    const records = new Map(), events = new Map(); let actor = 'alice', sequence = 0;
    const runtime = createProjectProgramRuntime({ actor: () => actor, project: () => '', now: () => '2030-01-07T11:00:00Z', read: async id => structuredClone(records.get(id)),
        syncShopping: async () => ({ ok: true, changed: 0 }),
        list: async () => [...records.values()], commitActivity: async event => {
            if (events.has(event.id)) { assertIdempotentEventReplay(events.get(event.id), event); return { ok: true }; }
            const previous = records.get(event.atome_id), type = event.type || previous?.type, properties = { ...previous?.properties, ...event.props };
            normalizeCanonicalAtome({ id: event.atome_id, type, properties });
            records.set(event.atome_id, { id: event.atome_id, type, owner_id: event.actor, properties }); events.set(event.id, structuredClone(event)); return { ok: true };
        } });
    expect((await runtime.invoke({ operation: 'activity_create', activity_id: 'activity', activity, recorded_at: '2030-01-07T10:00:00Z' })).ok).toBe(true);
    const gateway = vi.fn(payload => runtime.invoke(payload.input)), onSaved = vi.fn(), refresh = vi.fn();
    const uiRuntime = { mountTree: vi.fn(async () => ({ ok: true })), unmountTree: vi.fn(async () => ({ ok: true })), updateTreeMotion: vi.fn() };
    let readProjection;
    const control = createProgramNutritionControl({ id: 'nutrition', gateway, readActor: () => actor, onSaved, refresh,
        createId: () => 'food_' + ++sequence, now: () => '2030-01-07T10:01:00Z',
        createPresentation: options => { readProjection = options.readValues; return presentationFactory({ ...options, uiRuntime }); } });
    const nodes = () => control.build({ width: 600 }).flatMap(walk);
    const activate = async suffix => {
        const node = nodes().find(node => node.id === 'nutrition_' + suffix);
        walk(node).find(value => typeof value.on?.activate === 'function').on.activate();
        await new Promise(resolve => setTimeout(resolve, 0));
    };
    const input = (key, value) => {
        nodes().find(node => node.id === 'nutrition_' + key).on.focus({ x: 10, y: 10 });
        const editor = dom.window.document.querySelector('#eve_hidden_text_service textarea');
        editor.value = value; editor.dispatchEvent(new dom.window.Event('input'));
    };
    await control.open(records.get('activity'), 600);
    return { records, events, runtime, gateway, control, nodes, activate, input, onSaved, refresh, uiRuntime,
        readProjection: () => readProjection(),
        actor: value => { actor = value; }, close: async () => { await control.destroy(); dom.window.close(); } };
};

describe('explicit reusable Nutrition composition', () => {
    it('assembles optional portions and preparation, declines without erasing choices and explicitly resumes', async () => {
        const f = await fixture({ presentationFactory: createProgramNutritionPresentation });
        try {
            await f.activate('mode_meal'); await f.activate('meal_type_lunch'); await f.activate('add'); await f.activate('group_drink');
            f.input('food', 'Chosen drink'); f.input('portion', '125,5'); await f.activate('apply');
            expect(f.readProjection().notice).not.toBe(''); expect(f.gateway).not.toHaveBeenCalled();
            await f.activate('unit_ml'); await f.activate('apply'); await f.activate('planning_planned'); await f.activate('options');
            f.input('preparation_minutes', '0'); f.input('shopping_notes', 'Chosen shopping note'); f.input('recipe_source', 'Chosen recipe source');
            await f.activate('done'); await f.activate('save'); await vi.waitFor(() => expect(f.control.isActive()).toBe(false));
            const chosen = structuredClone(f.records.get('activity').properties.program_activity.nutrition);
            expect(chosen).toMatchObject({ planning_state: 'planned', preparation_minutes: 0, shopping_notes: 'Chosen shopping note', recipe_source: 'Chosen recipe source' });
            expect(chosen.components[0].portion).toEqual({ value: 125.5, unit: 'ml' });
            expect((await f.runtime.invoke({ operation: 'session_prepare', activity_id: 'activity', session_id: 'before_decline',
                session_steps: [{ id: 'one', label: 'One' }], recorded_at: '2030-01-07T10:01:00Z' })).ok).toBe(true);
            await f.control.open(f.records.get('activity'), 600); await f.activate('decline'); await f.activate('save');
            await vi.waitFor(() => expect(f.control.isActive()).toBe(false));
            expect(f.records.get('activity').properties.program_activity).toMatchObject({ version: 3, nutrition_declined: true, nutrition: chosen });
            expect(await f.runtime.invoke({ operation: 'session_prepare', activity_id: 'activity', session_id: 'refused', session_steps: [{ id: 'one', label: 'One' }], recorded_at: '2030-01-07T10:02:00Z' }))
                .toMatchObject({ ok: false, error: 'program_nutrition_declined' });
            expect(await f.runtime.invoke({ operation: 'session_transition', activity_id: 'activity', session_id: 'before_decline', base_revision: 0,
                session_transition: { request_id: 'start', action: 'start', recorded_at: '2030-01-07T10:02:00Z' } }))
                .toMatchObject({ ok: false, error: 'program_nutrition_declined' });
            expect((await f.runtime.invoke({ operation: 'activity_read' })).consumptions).toEqual([]);
            await f.control.open(f.records.get('activity'), 600); await f.activate('mode_meal'); await f.activate('meal_type_lunch');
            await f.activate('component_food_1'); await f.activate('unit_none'); await f.activate('apply'); await f.activate('save');
            await vi.waitFor(() => expect(f.control.isActive()).toBe(false));
            const resumed = f.records.get('activity').properties.program_activity;
            expect(resumed).toMatchObject({ version: 4, nutrition_declined: false });
            expect(resumed.nutrition.components[0]).not.toHaveProperty('portion'); expect(resumed.nutrition.preparation_minutes).toBe(0);
        } finally { await f.close(); }
    });

    it('declares only a dated saved meal, retries exactly after lost acknowledgement and preserves its historical snapshot', async () => {
        const f = await fixture({ presentationFactory: createProgramNutritionPresentation });
        try {
            await f.activate('mode_meal'); await f.activate('meal_type_lunch'); await f.activate('add'); await f.activate('group_fruit');
            f.input('food', 'Original fruit'); await f.activate('apply'); await f.activate('save');
            await vi.waitFor(() => expect(f.control.isActive()).toBe(false)); f.onSaved.mockClear(); f.gateway.mockClear();
            await f.control.open(f.records.get('activity'), 600); await f.activate('consume'); await f.activate('save');
            expect(f.readProjection()).toMatchObject({ pending: false }); expect(f.gateway).not.toHaveBeenCalled();
            f.input('consumed_at', '2030-01-07T12:00:00Z'); await f.activate('save'); expect(f.readProjection().pending).toBe(false);
            f.input('consumed_at', '2029-12-31T10:00:30Z');
            f.gateway.mockImplementationOnce(async payload => { expect((await f.runtime.invoke(payload.input)).ok).toBe(true); throw new Error('lost_ack'); });
            await f.activate('save'); await vi.waitFor(() => expect(f.readProjection().pending).toBe(true));
            const intent = structuredClone(f.gateway.mock.calls[0][0]), before = await f.runtime.invoke({ operation: 'activity_read' });
            expect(before.consumptions).toHaveLength(1); expect(before.occurrences).toHaveLength(0); expect(before.realized_count).toBe(0);
            expect(before.consumptions[0]).toMatchObject({ activity_version: 2, date: '2029-12-31T10:00:30Z', meal: { components: [{ food: 'Original fruit' }] } });
            const updated = structuredClone(f.records.get('activity').properties.program_activity); updated.nutrition.components[0].food = 'Later fruit';
            expect((await f.runtime.invoke({ operation: 'activity_revise', activity_id: 'activity', base_activity_version: 2, activity: updated, recorded_at: '2030-01-07T10:03:00Z' })).ok).toBe(true);
            await f.activate('save'); await vi.waitFor(() => expect(f.onSaved).toHaveBeenCalledTimes(1));
            expect(f.gateway.mock.calls[1][0]).toEqual(intent);
            const after = await f.runtime.invoke({ operation: 'activity_read' }); expect(after.consumptions).toEqual(before.consumptions);
            expect(after.activities[0].properties.program_activity.nutrition.components[0].food).toBe('Later fruit');
            expect(await f.runtime.invoke({ ...intent.input, consumed_at: '2030-01-07T10:00:40Z' })).toMatchObject({ ok: false, error: 'event_id_conflict' });
        } finally { await f.close(); }
    });
    it('composes the Action editor with the same native presentation and preserves a single canonical activity', async () => {
        const f = await fixture({ presentationFactory: createProgramNutritionPresentation });
        try {
            await f.activate('mode_habit'); await f.activate('save');
            expect(f.readProjection().notice).not.toBe(''); expect(f.gateway).not.toHaveBeenCalled();
            f.input('habit', 'Fictitious chosen action'); expect(f.readProjection().notice).toBe('');
            await f.activate('save'); await vi.waitFor(() => expect(f.onSaved).toHaveBeenCalledTimes(1));
            const saved = f.records.get('activity').properties.program_activity;
            expect(saved.version).toBe(2); expect(saved.title).toBe(activity.title); expect(saved.involvement).toEqual(activity.involvement);
            expect(saved.nutrition).toEqual({ version: 1, mode: 'habit', habit: 'Fictitious chosen action' });
            expect(f.records.size).toBe(1); expect(f.events.size).toBe(2);
            expect((await f.runtime.invoke({ operation: 'activity_read' })).realized_count).toBe(0);
        } finally { await f.close(); }
    });

    it('freezes the native meal draft and retries the same saved revision after a lost acknowledgement', async () => {
        const f = await fixture({ presentationFactory: createProgramNutritionPresentation });
        try {
            await f.activate('mode_meal'); await f.activate('meal_type_lunch'); await f.activate('add');
            await f.activate('group_fruit'); f.input('food', 'Fictitious chosen fruit'); await f.activate('apply');
            f.gateway.mockImplementationOnce(async payload => {
                expect((await f.runtime.invoke(payload.input)).ok).toBe(true); throw new Error('lost_ack');
            });
            await f.activate('save');
            await vi.waitFor(() => expect(f.readProjection()).toMatchObject({ pending: true, committing: false }));
            expect(f.nodes().find(node => node.id === 'nutrition_add').on?.activate).toBeUndefined();
            const intent = structuredClone(f.gateway.mock.calls[0][0]);
            await f.activate('save'); await vi.waitFor(() => expect(f.onSaved).toHaveBeenCalledTimes(1));
            expect(f.gateway.mock.calls[1][0]).toEqual(intent);
            expect(f.events.size).toBe(2); expect(f.records.size).toBe(1); expect(f.control.isActive()).toBe(false);
        } finally { await f.close(); }
    });

    it('uses the accepted native meal assembly with real food edits and one explicit canonical revision', async () => {
        const f = await fixture({ presentationFactory: createProgramNutritionPresentation });
        try {
            await f.activate('mode_meal'); await f.activate('meal_type_lunch');
            expect(f.nodes().some(node => node.id === 'nutrition_group_fruit')).toBe(false);
            await f.activate('add'); expect(f.readProjection().stage).toBe('composition');
            await f.activate('group_fruit'); await f.activate('apply');
            expect(f.readProjection().notice).not.toBe(''); expect(f.gateway).not.toHaveBeenCalled();
            f.input('food', 'Fictitious chosen fruit'); await f.activate('apply');
            const componentId = f.readProjection().components[0].id;
            await f.activate('component_' + componentId); f.input('food', 'Fictitious edited fruit'); await f.activate('apply');
            expect(f.records.get('activity').properties.program_activity.version).toBe(1);
            await f.activate('save'); await vi.waitFor(() => expect(f.onSaved).toHaveBeenCalledTimes(1));
            const saved = f.records.get('activity').properties.program_activity;
            expect(saved.version).toBe(2); expect(saved.title).toBe(activity.title);
            expect(saved.involvement).toEqual(activity.involvement);
            expect(saved.nutrition.components).toEqual([{ id: componentId, group: 'fruit', food: 'Fictitious edited fruit' }]);
            expect(f.events.size).toBe(2); expect(f.gateway).toHaveBeenCalledTimes(1);
            expect((await f.runtime.invoke({ operation: 'activity_read' })).realized_count).toBe(0);
        } finally { await f.close(); }
    });

    it('keeps an absent portion unknown, preserves explicit zero and refuses unsupported units, mixed modes and invented intake', () => {
        expect(validateProgramNutrition(meal).components[0]).not.toHaveProperty('portion');
        const zero = { ...meal, components: [{ ...meal.components[0], portion: { value: 0, unit: 'g' } }], preparation_minutes: 0 };
        expect(validateProgramNutrition(zero)).toEqual(zero);
        for (const bad of [{ ...meal, calories: 100 }, { ...meal, consumed: true }, { ...meal, habit: 'mixed' },
            { ...meal, components: [{ ...meal.components[0], portion: { value: 1, unit: 'cups' } }] },
            { ...meal, components: [{ ...meal.components[0], portion: { unit: 'g' } }] },
            { ...meal, components: [meal.components[0], meal.components[0]] }, { version: 1, mode: 'habit', habit: ' ' }])
            expect(() => validateProgramNutrition(bad)).toThrow('program_nutrition_invalid');
        expect(() => validateActivity({ ...activity, brick_id: 'meditation', nutrition: meal })).toThrow('program_nutrition_activity_required');
        const defs = buildBootstrapDefsA(value => value, value => value, 'calendar', 'registered');
        expect(defs.find(def => def.tool_id === 'project.program.commit').input_schema.properties.activity.properties.nutrition.properties.components.type).toBe('array');
    });
    it('composes the real Matrix, preserves a food without portion and saves only after the explicit whole-choice gesture', async () => {
        const f = await fixture();
        try {
            expect(f.nodes().some(node => node.kind === 'scroll_area')).toBe(true); expect(f.uiRuntime.mountTree).not.toHaveBeenCalled();
            await f.activate('mode_meal'); await f.activate('meal_type_lunch'); await f.activate('group_fruit');
            await f.activate('apply'); expect(f.readProjection().notice).not.toBe('');
            expect(f.gateway).not.toHaveBeenCalled();
            f.input('food', 'Fictitious fruit choice'); expect(f.readProjection().notice).toBe(''); await f.activate('apply');
            expect(f.gateway).not.toHaveBeenCalled(); expect(f.records.size).toBe(1);
            const projection = f.readProjection();
            expect(projection).toMatchObject({ stage: 'composition', mealType: 'lunch', pending: false });
            const componentId = projection.components[0].id;
            projection.components[0].food = 'Untrusted presentation replacement';
            projection.components[0].id = 'Untrusted presentation identity';
            expect(f.readProjection().components[0].food).toBe('Fictitious fruit choice');
            expect(f.readProjection().components[0].id).toBe(componentId);
            await f.activate('options'); f.input('preparation_minutes', '0'); f.input('shopping_notes', 'Fictitious shopping note');
            await f.activate('done'); await f.activate('save'); await vi.waitFor(() => expect(f.onSaved).toHaveBeenCalledTimes(1));
            expect(f.records.get('activity').properties.program_activity.nutrition).toEqual({ version: 1, mode: 'meal', meal_type: 'lunch',
                components: [{ id: componentId, group: 'fruit', food: 'Fictitious fruit choice' }], preparation_minutes: 0, shopping_notes: 'Fictitious shopping note' });
            expect(f.events.size).toBe(2); expect(f.records.size).toBe(1); expect((await f.runtime.invoke({ operation: 'activity_read' })).realized_count).toBe(0);
            expect(f.control.isActive()).toBe(false); expect(f.nodes()).toEqual([]);
        } finally { await f.close(); }
    });
    it('requires an explicit unit for a quantity, accepts decimal comma and permits removing or replacing one chosen food', async () => {
        const f = await fixture();
        try {
            await f.activate('mode_meal'); await f.activate('meal_type_other'); await f.activate('group_drink');
            f.input('food', 'Fictitious drink'); f.input('portion', '125,5'); await f.activate('apply');
            expect(f.nodes().some(node => node.id === 'nutrition_food')).toBe(true); expect(f.gateway).not.toHaveBeenCalled();
            await f.activate('unit_ml'); await f.activate('apply'); await f.activate('component_food_1');
            f.input('portion', '100'); await f.activate('apply'); await f.activate('save'); await vi.waitFor(() => expect(f.onSaved).toHaveBeenCalled());
            const nutrition = f.records.get('activity').properties.program_activity.nutrition;
            expect(nutrition.components).toHaveLength(1); expect(nutrition.components[0].portion).toEqual({ value: 100, unit: 'ml' });
            await f.control.open(f.records.get('activity')); await f.activate('mode_meal'); await f.activate('meal_type_other');
            await f.activate('component_food_1'); await f.activate('remove'); await f.activate('save');
            expect(f.events.size).toBe(2); expect(f.control.isActive()).toBe(true);
        } finally { await f.close(); }
    });
    it('retries the exact same canonical revision after a lost acknowledgement and never duplicates an activity', async () => {
        const f = await fixture();
        try {
            await f.activate('mode_habit'); f.input('habit', 'Fictitious habit');
            f.gateway.mockImplementationOnce(async payload => { expect((await f.runtime.invoke(payload.input)).ok).toBe(true); throw new Error('lost_ack'); });
            await f.activate('save'); await vi.waitFor(() => expect(f.nodes().some(node => node.id === 'nutrition_save' && node.on?.activate)).toBe(true));
            const intent = structuredClone(f.gateway.mock.calls[0][0]); await f.activate('save'); await vi.waitFor(() => expect(f.onSaved).toHaveBeenCalledTimes(1));
            expect(f.gateway.mock.calls[1][0]).toEqual(intent); expect(f.records.size).toBe(1); expect(f.events.size).toBe(2);
        } finally { await f.close(); }
    });
    it('uses the actual host viewport for embedded scrolling and tears down an opening cancelled before completion', async () => {
        const f = await fixture(); let cancelled;
        try {
            f.control.build({ width: 390, height: 194 });
            await vi.waitFor(() => expect(f.nodes().find(node => node.id === 'nutrition').style.size[1]).toBe(194));
            expect(f.nodes().find(node => node.id === 'nutrition_matrix_scroll').style.size[1]).toBeLessThanOrEqual(194);
            const add = vi.spyOn(window, 'addEventListener');
            cancelled = createProgramNutritionControl({ id: 'cancelledNutrition', gateway: f.gateway, readActor: () => 'alice', refresh: f.refresh,
                createPresentation: options => createMatrixTemplateRuntime({ ...options, uiRuntime: f.uiRuntime }) });
            const opening = cancelled.open(f.records.get('activity'), 390, 194);
            await Promise.resolve(); await cancelled.close();
            expect(await opening).toMatchObject({ ok: true, cancelled: true });
            expect(cancelled.isActive()).toBe(false); expect(cancelled.build({ width: 390, height: 194 })).toEqual([]);
            expect(add.mock.calls.some(([name]) => name === 'squirrel:user-logged-out' || name === 'squirrel:clear-view')).toBe(false);
            expect(f.gateway).not.toHaveBeenCalled();
        } finally { await cancelled?.destroy(); await f.close(); }
    });
    it('discards an unaccepted meal and prevents a replaced principal from saving or reopening private food choices', async () => {
        const f = await fixture();
        try {
            await f.activate('mode_habit'); f.input('habit', 'Unsaved fictitious habit'); await f.activate('close');
            expect(f.events.size).toBe(1); expect(f.gateway).not.toHaveBeenCalled();
            await f.control.open(f.records.get('activity')); f.actor('bob'); expect(f.nodes()).toEqual([]);
            await expect(f.control.open(f.records.get('activity'))).rejects.toThrow('program_activity_reference_denied');
            expect(f.gateway).not.toHaveBeenCalled(); expect(f.events.size).toBe(1);
        } finally { await f.close(); }
    });
    it('preserves structured Nutrition when the shared configuration owner edits only title or time', async () => {
        const f = await fixture(); let configuration;
        try {
            expect((await f.runtime.invoke({ operation: 'activity_revise', activity_id: 'activity', base_activity_version: 1,
                activity: { ...activity, nutrition: meal }, recorded_at: '2030-01-07T10:01:00Z' })).ok).toBe(true);
            configuration = createProgramActivityConfigurationControl({ id: 'configuration', gateway: f.gateway, readActor: () => 'alice', now: () => '2030-01-07T10:02:00Z' });
            configuration.openExisting(f.records.get('activity'));
            const nodes = configuration.build({ width: 600 }).flatMap(walk);
            nodes.find(node => node.id === 'configuration_minutes').on.focus({ x: 10, y: 10 });
            const editor = document.querySelector('#eve_hidden_text_service textarea'); editor.value = '9'; editor.dispatchEvent(new window.Event('input'));
            nodes.find(node => node.id === 'configuration_save').on.activate();
            await vi.waitFor(() => expect(f.records.get('activity').properties.program_activity.version).toBe(3));
            expect(f.records.get('activity').properties.program_activity.nutrition).toEqual(meal);
            expect(f.records.get('activity').properties.program_activity.involvement.minutes).toBe(9);
        } finally { configuration?.destroy(); await f.close(); }
    });
});
