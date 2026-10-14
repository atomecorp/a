import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { createProgramSessionControl } from '../../eVe/domains/programs/program_session_control.js';
import { createProjectProgramRuntime } from '../../eVe/domains/programs/project_program_runtime.js';
import { programSessionTransitionId } from '../../atome/src/shared/program_session_contract.js';
import { assertIdempotentEventReplay } from '../../atome/src/shared/adole_event_contract.js';
import { registerCoreAtomeTypes } from '../../atome/src/shared/core_atome_types.js';
import { normalizeCanonicalAtome } from '../../atome/src/shared/atome_contract.js';
import { buildBootstrapDefsA } from '../../eVe/intuition/tools/core/tool_runtime_bootstrap_defs_a.js';

beforeAll(registerCoreAtomeTypes);
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const date = minute => new Date(Date.UTC(2030, 0, 7, 10, minute)).toISOString();
const steps = [{ id: 'first', label: 'Fictitious step', planned: { value: 5, unit: 'repetitions' } },
    { id: 'second', label: 'Another fictitious step' }, { id: 'third', label: 'Fictitious distance', planned: { value: 20, unit: 'm' } }];
const fixture = () => {
    const records = new Map(), events = new Map(); let actor = 'alice', failExecution = false, partial = false;
    const dependencies = { actor: () => actor, project: () => '', read: async id => structuredClone(records.get(id)),
        list: async () => { const values = [...records.values()]; if (partial) Object.defineProperty(values, 'totalCount', { value: values.length + 1 }); return values; },
        commitActivity: async event => {
            if (events.has(event.id)) { assertIdempotentEventReplay(events.get(event.id), event); return { ok: true }; }
            if (failExecution && event.props.program_execution) { failExecution = false; return { ok: false, error: 'synthetic_refusal' }; }
            const previous = records.get(event.atome_id), properties = { ...previous?.properties, ...event.props };
            normalizeCanonicalAtome({ id: event.atome_id, type: event.type || previous?.type, properties });
            records.set(event.atome_id, { id: event.atome_id, type: 'record', owner_id: event.actor, properties });
            events.set(event.id, structuredClone(event)); return { ok: true };
        } };
    const runtime = createProjectProgramRuntime(dependencies);
    let revision = 0, sequence = 0;
    const transition = async (action, minute, extra = {}) => {
        const result = await runtime.invoke({ operation: 'session_transition', activity_id: 'activity', session_id: 'session', base_revision: revision,
            session_transition: { request_id: 'request_' + ++sequence, action, recorded_at: date(minute), ...extra } });
        if (result.ok) revision = result.state.revision; return result;
    };
    return { records, events, dependencies, runtime, transition, actor: value => { actor = value; }, partial: () => { partial = true; },
        failExecution: () => { failExecution = true; }, initialize: async () => {
            expect((await runtime.invoke({ operation: 'activity_create', activity_id: 'activity', recorded_at: date(0), activity: {
                brick_id: 'meditation', title: 'Fictitious session activity', involvement: { minutes: 10, basis: 'day', days: [], rhythm: 2 } } })).ok).toBe(true);
            return runtime.invoke({ operation: 'session_prepare', activity_id: 'activity', session_id: 'session', recorded_at: date(0), session_steps: steps });
        } };
};

describe('canonical reusable health session execution', () => {
    it('declares typed plans/transitions in existing Atome and Programme owners', () => {
        const defs = buildBootstrapDefsA(value => value, value => value, 'calendar', 'registered');
        expect(defs.find(value => value.tool_id === 'project.program.read').input_schema.properties.operation.enum).toContain('session_read');
        expect(defs.find(value => value.tool_id === 'project.program.commit').input_schema.properties.operation.enum).toContain('session_transition');
        expect(() => normalizeCanonicalAtome({ id: 'bad', type: 'record', properties: { program_session: {
            version: 1, activity_id: 'activity', steps: 'invalid_array' } } })).toThrow();
    });
    it('records three real confirmations, excludes pauses and counts one shared completion without Calendar placement', async () => {
        const f = fixture(); expect((await f.initialize()).state.status).toBe('prepared');
        expect((await f.transition('start', 1)).state.steps[0].actual).toBeNull();
        let result = await f.transition('confirm', 2, { step_id: 'first', actual: { value: 4, unit: 'repetitions' } });
        expect(result.state.current_step_id).toBe('second'); expect(result.state.steps[0].planned.value).toBe(5);
        await f.transition('pause', 3); await f.transition('resume', 8);
        await f.transition('confirm', 9, { step_id: 'second' });
        expect((await f.transition('confirm', 10, { step_id: 'third', actual: { value: 18, unit: 'm' } })).state.status).toBe('running');
        result = await f.transition('finish', 11, { note: '', use_in_followup: false });
        expect(result.state).toMatchObject({ status: 'completed', active_minutes: 5, confirmed_count: 3 });
        const view = await f.runtime.invoke({ operation: 'activity_read' });
        expect(view.realized_count).toBe(1); expect(view.total_minutes).toBe(5); expect(view.occurrences).toHaveLength(1);
        expect(view.occurrences[0].properties.program_occurrence).not.toHaveProperty('calendar_event_id');
        expect(view.results[0].original.properties.program_execution.provenance).toBe('manual_session_clock');
        expect((await f.runtime.invoke({ operation: 'activity_complete', activity_id: 'activity', occurrence_id: view.occurrences[0].id,
            recorded_at: date(12), execution: { start: date(1), end: date(11), provenance: 'another_declaration', note: '', use_in_followup: false } })).error)
            .toBe('program_activity_session_completion_required');
        expect((await f.transition('start', 12)).ok).toBe(false);
    });
    it('keeps unknown actual values unknown, supports skip/correction/undo and preserves every historical intent', async () => {
        const f = fixture(); await f.initialize(); await f.transition('start', 1);
        await f.transition('confirm', 2, { step_id: 'first' });
        expect((await f.transition('correct', 3, { step_id: 'first', actual: { value: 3, unit: 'repetitions' } })).state.steps[0].actual.value).toBe(3);
        expect((await f.transition('undo', 4)).state.steps[0].actual).toBeNull();
        await f.transition('skip', 5, { step_id: 'second' });
        expect((await f.transition('undo', 6)).state.current_step_id).toBe('second');
        await f.transition('pause', 7);
        expect((await f.transition('confirm', 8, { step_id: 'second' })).ok).toBe(false);
        const stopped = await f.transition('stop', 9, { note: 'Interrupted fictitious session', use_in_followup: false });
        expect(stopped.state).toMatchObject({ status: 'stopped', confirmed_count: 1, skipped_count: 0, active_minutes: 6 });
        expect((await f.runtime.invoke({ operation: 'activity_read' })).realized_count).toBe(0);
        const read = await createProjectProgramRuntime(f.dependencies).invoke({ operation: 'session_read', activity_id: 'activity', session_id: 'session' });
        expect(read.state).toEqual(stopped.state); expect(read.transitions.map(value => value.action)).toContain('correct');
    });
    it('rejects wrong units, empty plans, stale steps and timers masquerading as confirmation', async () => {
        const f = fixture(); await f.initialize();
        expect((await f.runtime.invoke({ operation: 'session_prepare', activity_id: 'activity', session_id: 'empty', recorded_at: date(0), session_steps: [] })).ok).toBe(false);
        await f.transition('start', 1);
        expect((await f.transition('confirm', 2, { step_id: 'first', actual: { value: 2, unit: 'kg' } })).error).toBe('program_session_unit_mismatch');
        expect((await f.transition('confirm', 2, { step_id: 'third' })).ok).toBe(false);
        expect((await f.transition('finish', 20, { note: '', use_in_followup: false })).ok).toBe(false);
        const read = await f.runtime.invoke({ operation: 'session_read', activity_id: 'activity', session_id: 'session' });
        expect(read.state.confirmed_count).toBe(0);
    });
    it('corrects a finished step by new history, can undo only that correction and never reopens or recounts the session', async () => {
        const f = fixture(); await f.initialize(); await f.transition('start', 1);
        await f.transition('confirm', 2, { step_id: 'first', actual: { value: 4, unit: 'repetitions' } });
        await f.transition('skip', 3, { step_id: 'second' }); await f.transition('skip', 4, { step_id: 'third' });
        const completed = await f.transition('finish', 5, { note: 'Original final note', use_in_followup: false });
        const original = structuredClone((await f.runtime.invoke({ operation: 'activity_read' })).results[0].original);
        expect(completed.state.can_undo).toBe(false); expect((await f.transition('undo', 6)).ok).toBe(false);
        const corrected = await f.transition('correct', 6, { step_id: 'first', actual: { value: 3, unit: 'repetitions' } });
        expect(corrected.state).toMatchObject({ status: 'completed', end: date(5), active_minutes: 4, confirmed_count: 1, skipped_count: 2, can_undo: true });
        expect(corrected.state.steps[0]).toMatchObject({ planned: { value: 5 }, actual: { value: 3 } });
        expect((await f.transition('undo', 7)).state.steps[0].actual.value).toBe(4);
        for (const action of ['start', 'resume', 'pause', 'confirm', 'skip', 'finish', 'stop'])
            expect((await f.transition(action, 8, ['confirm', 'skip'].includes(action) ? { step_id: 'first' }
                : ['finish', 'stop'].includes(action) ? { note: '', use_in_followup: false } : {})).ok).toBe(false);
        const view = await f.runtime.invoke({ operation: 'activity_read' });
        expect(view.realized_count).toBe(1); expect(view.total_minutes).toBe(4); expect(view.results[0].original).toEqual(original);
        const restored = await createProjectProgramRuntime(f.dependencies).invoke({ operation: 'session_read', activity_id: 'activity', session_id: 'session' });
        expect(restored.state).toMatchObject({ status: 'completed', end: date(5), note: 'Original final note', can_undo: false });
        expect(restored.transitions.find(value => value.action === 'confirm').actual.value).toBe(4);
        expect(restored.transitions.find(value => value.action === 'correct').actual.value).toBe(3);
    });
    it('corrects partial stopped facts while leaving pending steps, end time and completed count unchanged', async () => {
        const f = fixture(); await f.initialize(); await f.transition('start', 1); await f.transition('confirm', 2, { step_id: 'first' });
        await f.transition('stop', 3, { note: '', use_in_followup: false });
        const corrected = await f.transition('correct', 5, { step_id: 'first', actual: { value: 2, unit: 'repetitions' } });
        expect(corrected.state).toMatchObject({ status: 'stopped', end: date(3), active_minutes: 2, current_step_id: 'second', confirmed_count: 1 });
        expect((await f.transition('correct', 6, { step_id: 'second', actual: { value: 1, unit: 'm' } })).ok).toBe(false);
        expect((await f.transition('undo', 6)).state.steps[0].actual).toBeNull();
        expect((await f.runtime.invoke({ operation: 'activity_read' })).realized_count).toBe(0);
    });
    it('pins a prepared session to its actual activity version while later settings retain the same identity', async () => {
        const f = fixture(); expect((await f.initialize()).state.activity_version).toBe(1);
        const value = structuredClone(f.records.get('activity').properties.program_activity);
        expect((await f.runtime.invoke({ operation: 'activity_revise', activity_id: 'activity', base_activity_version: 1,
            recorded_at: date(1), activity: { ...value, title: 'Revised fictitious activity' } })).ok).toBe(true);
        const previous = await f.runtime.invoke({ operation: 'session_read', activity_id: 'activity', session_id: 'session' });
        expect(previous.state.activity_version).toBe(1); expect(previous.state.steps[0].planned.value).toBe(5);
        expect((await f.runtime.invoke({ operation: 'session_prepare', activity_id: 'activity', session_id: 'session', recorded_at: date(0), session_steps: steps })).state.activity_version).toBe(1);
        expect((await f.runtime.invoke({ operation: 'session_prepare', activity_id: 'activity', session_id: 'new_session', recorded_at: date(2), session_steps: steps })).state.activity_version).toBe(2);
    });
    it('uses one deterministic revision identity across independent runtimes and durable exact retries', async () => {
        const f = fixture(); await f.initialize();
        const request = { operation: 'session_transition', activity_id: 'activity', session_id: 'session', base_revision: 0,
            session_transition: { request_id: 'start', action: 'start', recorded_at: date(1) } };
        const another = createProjectProgramRuntime(f.dependencies);
        const results = await Promise.all([f.runtime.invoke(request), another.invoke({ ...request,
            session_transition: { ...request.session_transition, request_id: 'another_start' } })]);
        expect(results.filter(result => result.ok)).toHaveLength(1);
        expect(f.records.has(programSessionTransitionId('session', 1))).toBe(true);
        const retry = await another.invoke(request); expect(retry.preserved).toBe(true); expect(retry.state.revision).toBe(1);
        expect((await another.invoke({ ...request, session_transition: { ...request.session_transition, recorded_at: date(2) } })).error).toBe('event_id_conflict');
        expect((await another.invoke({ ...request, session_transition: { request_id: 'stale', action: 'pause', recorded_at: date(2) } })).error).toBe('program_session_revision_changed');
        expect(f.events.size).toBe(3);
    });
    it('reconciles final execution refusal through the same finish request without a second step or realization', async () => {
        const f = fixture(); await f.initialize(); await f.transition('start', 1);
        await f.transition('confirm', 2, { step_id: 'first' }); await f.transition('skip', 3, { step_id: 'second' }); await f.transition('skip', 4, { step_id: 'third' });
        const finish = { operation: 'session_transition', activity_id: 'activity', session_id: 'session', base_revision: 4,
            session_transition: { request_id: 'finish', action: 'finish', recorded_at: date(5), note: '', use_in_followup: false } };
        f.failExecution(); expect((await f.runtime.invoke(finish)).ok).toBe(false);
        expect((await f.runtime.invoke({ operation: 'session_read', activity_id: 'activity', session_id: 'session' })).completion_pending).toBe(true);
        expect((await createProjectProgramRuntime(f.dependencies).invoke(finish)).preserved).toBe(true);
        const view = await f.runtime.invoke({ operation: 'activity_read' }); expect(view.realized_count).toBe(1);
        const read = await f.runtime.invoke({ operation: 'session_read', activity_id: 'activity', session_id: 'session' }); expect(read.state.revision).toBe(5);
    });
    it('refuses foreign/deleted owners, incomplete reads and damaged transition chains', async () => {
        const f = fixture(); await f.initialize(); await f.transition('start', 1);
        f.actor('bob'); expect((await f.runtime.invoke({ operation: 'session_read', activity_id: 'activity', session_id: 'session' })).error).toBe('program_activity_reference_denied');
        f.actor('alice'); f.records.get(programSessionTransitionId('session', 1)).properties.program_session_transition.revision = 2;
        expect((await f.runtime.invoke({ operation: 'session_read', activity_id: 'activity', session_id: 'session' })).error).toBe('program_session_history_invalid');
        f.partial(); expect((await f.runtime.invoke({ operation: 'session_read', activity_id: 'activity', session_id: 'session' })).error).toBe('program_activity_read_incomplete');
    });
});

const nativeFixture = async () => {
    const f = fixture(); await f.initialize();
    const dom = new JSDOM('<body></body>', { url: 'http://localhost', pretendToBeVisual: true });
    vi.stubGlobal('window', dom.window); vi.stubGlobal('document', dom.window.document);
    let serial = 0, minute = 1;
    const gateway = vi.fn(payload => f.runtime.invoke(payload.input));
    const control = createProgramSessionControl({ id: 'session_ui', activityId: 'activity', gateway,
        readActor: f.dependencies.actor, createId: () => 'native_' + ++serial, now: () => date(minute++), refresh: vi.fn() });
    const walk = node => [node, ...(node.children || []).flatMap(walk)];
    const nodes = () => control.build({ width: 240 }).flatMap(walk);
    const press = suffix => { const node = nodes().find(node => node.id === 'session_ui_' + suffix); expect(node).toBeDefined(); node.on.activate(); };
    const type = (key, value) => {
        nodes().find(node => node.id === 'session_ui_' + key).on.focus({ x: 10, y: 10 });
        const editor = dom.window.document.querySelector('#eve_hidden_text_service textarea');
        editor.value = value; editor.dispatchEvent(new dom.window.Event('input'));
    };
    press('open'); await vi.waitFor(() => expect(nodes().some(node => node.id === 'session_ui_existing_session')).toBe(true));
    press('existing_session'); await vi.waitFor(() => expect(nodes().some(node => node.id === 'session_ui_start' && node.on?.activate)).toBe(true));
    return { ...f, control, nodes, press, type, gateway, close: () => { control.destroy(); dom.window.close(); } };
};
describe('native session commands and editor composition', () => {
    it('uses the same native correction and undo after finish while removing advancement and restart controls', async () => {
        const f = await nativeFixture();
        try {
            f.press('start'); await vi.waitFor(() => expect(f.nodes().some(node => node.id === 'session_ui_mark')).toBe(true));
            f.type('actual', '4'); f.press('mark'); f.press('confirm');
            await vi.waitFor(async () => expect((await f.runtime.invoke({ operation: 'session_read', activity_id: 'activity', session_id: 'session' })).state.current_step_id).toBe('second'));
            f.press('skip'); f.press('confirm');
            await vi.waitFor(async () => expect((await f.runtime.invoke({ operation: 'session_read', activity_id: 'activity', session_id: 'session' })).state.current_step_id).toBe('third'));
            f.press('skip'); f.press('confirm'); await vi.waitFor(() => expect(f.nodes().some(node => node.id === 'session_ui_finish' && node.on?.activate)).toBe(true));
            f.press('finish'); f.press('confirm'); await vi.waitFor(() => expect(f.nodes().some(node => node.id === 'session_ui_time')).toBe(true));
            const original = structuredClone((await f.runtime.invoke({ operation: 'activity_read' })).results[0].original);
            expect(f.nodes().some(node => ['mark', 'start', 'resume', 'pause', 'stop', 'finish', 'undo'].some(key => node.id === 'session_ui_' + key))).toBe(false);
            f.press('correction_chip_0'); f.type('actual', '3'); f.press('correct');
            await vi.waitFor(() => expect(f.nodes().some(node => node.id === 'session_ui_undo' && node.on?.activate)).toBe(true));
            expect((await f.runtime.invoke({ operation: 'session_read', activity_id: 'activity', session_id: 'session' })).state.steps[0].actual.value).toBe(3);
            f.press('undo'); await vi.waitFor(async () => expect((await f.runtime.invoke({ operation: 'session_read', activity_id: 'activity', session_id: 'session' })).state.steps[0].actual.value).toBe(4));
            const view = await f.runtime.invoke({ operation: 'activity_read' }); expect(view.realized_count).toBe(1); expect(view.results[0].original).toEqual(original);
        } finally { f.close(); }
    });
    it('requires a distinct confirmation gesture, ignores double presses, keeps units and corrects without rewriting the plan', async () => {
        const f = await nativeFixture();
        try {
            f.press('start'); await vi.waitFor(() => expect(f.nodes().some(node => node.id === 'session_ui_mark')).toBe(true));
            f.type('actual', '4');
            const mark = f.nodes().find(node => node.id === 'session_ui_mark').on.activate;
            mark(); mark();
            expect(f.gateway.mock.calls.filter(([request]) => request.input.operation === 'session_transition')).toHaveLength(1);
            const confirm = f.nodes().find(node => node.id === 'session_ui_confirm').on.activate;
            confirm(); confirm();
            await vi.waitFor(() => expect(f.nodes().some(node => node.id === 'session_ui_correction_chip_0')).toBe(true));
            expect(f.gateway.mock.calls.filter(([request]) => request.input.session_transition?.action === 'confirm')).toHaveLength(1);
            f.press('correction_chip_0'); f.type('actual', '3'); f.press('correct');
            await vi.waitFor(() => expect(f.nodes().some(node => node.id === 'session_ui_cancel_correction')).toBe(false));
            let read = await f.runtime.invoke({ operation: 'session_read', activity_id: 'activity', session_id: 'session' });
            expect(read.state.steps[0]).toMatchObject({ planned: { value: 5, unit: 'repetitions' }, actual: { value: 3, unit: 'repetitions' } });
            f.press('undo'); await vi.waitFor(async () => {
                read = await f.runtime.invoke({ operation: 'session_read', activity_id: 'activity', session_id: 'session' }); expect(read.state.steps[0].actual.value).toBe(4);
            });
        } finally { f.close(); }
    });
    it('retains the exact pending intent after lost acknowledgement and ignores its late result after close', async () => {
        const f = await nativeFixture();
        try {
            let release;
            f.gateway.mockImplementationOnce(async payload => { const result = await f.runtime.invoke(payload.input);
                await new Promise(resolve => { release = resolve; }); expect(result.ok).toBe(true); throw new Error('acknowledgement_lost'); });
            f.press('start');
            await vi.waitFor(() => expect(f.records.has(programSessionTransitionId('session', 1))).toBe(true));
            release(); await vi.waitFor(() => expect(f.nodes().some(node => node.id === 'session_ui_retry' && node.on?.activate)).toBe(true));
            const saved = structuredClone(f.gateway.mock.calls.at(-1)[0]);
            f.press('retry'); await vi.waitFor(() => expect(f.nodes().some(node => node.id === 'session_ui_mark')).toBe(true));
            expect(f.gateway.mock.calls.at(-1)[0]).toEqual(saved); expect(f.events.size).toBe(3);
            let releaseClosed;
            f.gateway.mockImplementationOnce(async payload => { const result = await f.runtime.invoke(payload.input);
                await new Promise(resolve => { releaseClosed = resolve; }); return result; });
            f.press('pause'); await vi.waitFor(() => expect(f.records.has(programSessionTransitionId('session', 2))).toBe(true));
            f.control.close(); releaseClosed();
            await vi.waitFor(() => expect(f.nodes().some(node => node.id === 'session_ui_open')).toBe(true));
            f.actor('bob'); expect(f.nodes().some(node => node.id === 'session_ui_mark')).toBe(false);
            expect(f.nodes().some(node => node.id === 'session_ui_open')).toBe(true);
        } finally { f.close(); }
    });
    it('does not accept blank preparation as a step and releases the active editor at teardown', async () => {
        const f = await nativeFixture();
        try {
            f.press('back'); await vi.waitFor(() => expect(f.nodes().some(node => node.id === 'session_ui_new' && node.on?.activate)).toBe(true));
            f.press('new'); f.press('prepare'); expect(f.nodes().some(node => node.id === 'session_ui_error')).toBe(true);
            expect(f.records.size).toBe(2);
            f.type('steps', 'Fictitious one\nFictitious two\nFictitious three'); f.press('prepare');
            await vi.waitFor(() => expect(f.nodes().some(node => node.id === 'session_ui_start')).toBe(true));
            expect([...f.records.values()].filter(record => record.properties.program_session)).toHaveLength(2);
            expect(f.gateway.mock.calls.at(-1)[0].input.session_steps).toHaveLength(3);
        } finally { f.close(); }
    });
});
