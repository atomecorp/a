import { describe, expect, it } from 'vitest';

import { midiBindingSurface } from '../../eVe/intuition/runtime/bevy_panel/bevy_panel_midi_binding_runtime.js';

const idsOf = (nodes = []) => {
    const ids = [];
    const visit = (entry) => {
        if (!entry) return;
        if (entry.id) ids.push(entry.id);
        (entry.children || []).forEach(visit);
    };
    nodes.forEach(visit);
    return ids;
};

describe('MIDI Binding Bevy panel contract', () => {
    it('composes Manual, multi-action, continuous and production MIDI test controls', async () => {
        const refresh = () => {};
        await midiBindingSurface.handleEvent({ type: 'midi.binding.new' }, { refresh });
        await midiBindingSurface.handleEvent({ type: 'midi.binding.manual' }, { refresh });
        await midiBindingSurface.handleEvent({ type: 'midi.binding.continuous' }, { refresh });
        const nodes = midiBindingSurface.buildContent(midiBindingSurface.readState(), {
            emit: () => {}, bodyWidth: 340
        });
        const ids = idsOf(nodes);
        expect(ids).toEqual(expect.arrayContaining([
            'midi_editor_learn', 'midi_editor_manual', 'midi_input_port', 'midi_input_message',
            'channel', 'number', 'input_min', 'input_max', 'midi_capture_action',
            'midi_search_action', 'midi_continuous_toggle', 'continuous_min',
            'continuous_max', 'midi_continuous_invert', 'midi_binding_test'
        ]));
        await midiBindingSurface.handleEvent({ type: 'midi.binding.test' }, { refresh });
        const testIds = idsOf(midiBindingSurface.buildContent(midiBindingSurface.readState(), {
            emit: () => {}, bodyWidth: 340
        }));
        expect(testIds).toEqual(expect.arrayContaining([
            'midi_test_receive', 'midi_test_output', 'midi_test_message',
            'test_channel', 'test_number', 'test_value', 'midi_test_send'
        ]));
    });
});
