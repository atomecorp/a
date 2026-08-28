import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
    beginMidiLearn,
    createMidiBinding,
    deleteMidiBinding,
    listMidiBindings,
    routeMidiMessage,
    subscribeMidiMonitor,
    updateMidiBinding
} from '../../eVe/intuition/runtime/midi_binding_service.js';

const makeStore = () => {
    const records = new Map();
    const dependencies = {
        createId: vi.fn(() => `binding-${records.size + 1}`),
        read: async (id) => records.get(String(id)) || null,
        readList: async (projectId) => ({
            records: [...records.values()].filter((record) => record.project_id === projectId)
        }),
        commitBatch: vi.fn(async (events) => {
            events.forEach((event) => {
                if (event.kind === 'delete') {
                    records.delete(event.atome_id);
                    return;
                }
                records.set(event.atome_id, {
                    atome_id: event.atome_id,
                    type: event.type || 'midi_binding',
                    project_id: event.project_id,
                    parent_id: event.parent_id,
                    properties: { ...(event.props || {}) }
                });
            });
            return { ok: true };
        }),
        invoke: vi.fn(async () => ({ ok: true }))
    };
    return { records, dependencies };
};

const bindingInput = (number = 7) => ({
    parent_id: 'target-1', project_id: 'project-1',
    input: { port_id: 'keyboard', message_type: 'cc', channel: 1, number, min: 0, max: 127 },
    actions: [{
        tool_id: 'ui.opacity', action: 'pointer.click', parameters: {}, target_atome_id: 'target-1'
    }]
});

describe('canonical MIDI binding service', () => {
    let store;

    beforeEach(() => { store = makeStore(); });

    it('persists, rereads, updates and deletes the same nonvisual binding contract', async () => {
        const created = await createMidiBinding(bindingInput(), store.dependencies);
        expect(created).toMatchObject({ ok: true, binding: { parent_id: 'target-1', enabled: true } });
        const reopened = await listMidiBindings({ projectId: 'project-1' }, store.dependencies);
        expect(reopened.bindings).toEqual([created.binding]);

        const updated = await updateMidiBinding({
            bindingId: created.binding.atome_id,
            patch: { order: 4, continuous: { min: -1, max: 1, inverted: true } }
        }, store.dependencies);
        expect(updated).toMatchObject({ ok: true, binding: { order: 4, continuous: { min: -1, max: 1, inverted: true } } });
        expect((await listMidiBindings({ projectId: 'project-1' }, store.dependencies)).bindings[0])
            .toEqual(updated.binding);

        expect(await deleteMidiBinding({ bindingId: created.binding.atome_id }, store.dependencies))
            .toEqual({ ok: true, binding_id: created.binding.atome_id });
        expect((await listMidiBindings({ projectId: 'project-1' }, store.dependencies)).bindings).toEqual([]);
    });

    it('rejects an exact active collision before persistence', async () => {
        expect((await createMidiBinding(bindingInput(), store.dependencies)).ok).toBe(true);
        const conflict = await createMidiBinding(bindingInput(), store.dependencies);
        expect(conflict).toMatchObject({ ok: false, error: 'midi_binding_conflict' });
        expect(store.dependencies.commitBatch).toHaveBeenCalledTimes(1);
    });

    it('suspends normal routing for Learn and executes an ordered match afterwards', async () => {
        const created = await createMidiBinding(bindingInput(), store.dependencies);
        beginMidiLearn({ bindingId: created.binding.atome_id });
        const learned = await routeMidiMessage({
            project_id: 'project-1', port_id: 'keyboard', message_type: 'cc', channel: 1, number: 11, value: 80
        }, store.dependencies);
        expect(learned).toMatchObject({ ok: true, learned: true, suspended: true });
        expect(store.dependencies.invoke).not.toHaveBeenCalled();

        const routed = await routeMidiMessage({
            project_id: 'project-1', port_id: 'keyboard', message_type: 'cc', channel: 1, number: 11, value: 64
        }, store.dependencies);
        expect(routed).toMatchObject({ ok: true, matched: 1 });
        expect(store.dependencies.invoke).toHaveBeenCalledOnce();
    });

    it('feeds the diagnostic monitor from the same normalized routing point', async () => {
        const received = [];
        const unsubscribe = subscribeMidiMonitor((message) => received.push(message));
        beginMidiLearn({ parentId: 'target-1', projectId: 'project-1' });
        await routeMidiMessage({
            data: [0xB2, 12, 99], port_id: 'keyboard', port_name: 'Keyboard', timestamp: 42
        }, store.dependencies);
        unsubscribe();
        expect(received).toEqual([expect.objectContaining({
            port_id: 'keyboard', port_name: 'Keyboard', message_type: 'cc', channel: 3, number: 12, value: 99
        })]);
    });
});
