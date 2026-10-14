// MIDI lane: a MIDI clip plays its window of SMF events to its strip's ports
// (output + sends), muted tracks stay silent.
import assert from 'node:assert/strict';
import test from 'node:test';

import { addClip, addMixModule, createTimeline, setMixOutput, updateTrack } from '../../eVe/intuition/tools/molecule/kernel/index.js';
import { createMoleculeMidiTransport, midiStripPorts, windowMidiPlan } from '../../eVe/intuition/tools/molecule/runtime_midi.js';
import { encodeSmfFromEvents } from '../../eVe/domains/midi/smf.js';

const smf = encodeSmfFromEvents({ events: [
    { at_ms: 0, bytes: [0x90, 60, 100] }, { at_ms: 100, bytes: [0x80, 60, 0] },
    { at_ms: 600, bytes: [0x90, 64, 100] }, { at_ms: 700, bytes: [0x80, 64, 0] }
] });

const fixture = () => {
    let timeline = createTimeline({ timeline_id: 'tl_midi', project_id: 'p', owner_atome_id: 'm', initial_section_id: 's', initial_track_id: 'keys' });
    timeline = addClip(timeline, { clip_id: 'keys_clip', track_id: 'keys', kind: 'midi', source: { type: 'atome', atome_id: 'midi_atome' },
        timeline: { start_seconds: 1, duration_seconds: 0.5, source_in_seconds: 0, source_out_seconds: 0.5 },
        next_empty_track_id: 'next', next_empty_track_name: 'Next' });
    timeline = setMixOutput(timeline, { strip_id: 'keys:midi', destination: { kind: 'midi_port', id: 'synth_a' } });
    return addMixModule(timeline, { strip_id: 'keys:midi', module_id: 'fan', type: 'send', destination: { kind: 'midi_port', id: 'synth_b' } });
};

test('a MIDI strip has no default port; its output and sends are its ports', () => {
    const bare = createTimeline({ timeline_id: 't', project_id: 'p', owner_atome_id: 'o', initial_section_id: 's', initial_track_id: 'k' });
    assert.deepEqual(midiStripPorts(bare, 'k'), []);
    assert.deepEqual(midiStripPorts(fixture(), 'keys'), ['synth_a', 'synth_b']);
});

test('the plan is cut to the clip window and timed from the playback start', () => {
    const plan = { events: [{ at_ms: 0, bytes: [1] }, { at_ms: 400, bytes: [2] }, { at_ms: 600, bytes: [3] }], duration_ms: 700 };
    const windowed = windowMidiPlan(plan, { startSeconds: 1, durationSeconds: 0.5, sourceInSeconds: 0 }, 0.5);
    assert.deepEqual(windowed.events.map((event) => [event.bytes[0], event.at_ms]), [[1, 500], [2, 900]]);
});

test('playback sends the window to every port, muted tracks are skipped', async () => {
    globalThis.fetch = async () => ({ ok: true, arrayBuffer: async () => smf.buffer.slice(smf.byteOffset, smf.byteOffset + smf.byteLength) });
    const env = { Atome: { getStateCurrent: async () => ({ id: 'midi_atome', properties: { kind: 'midi', media_url: '/api/uploads/keys.mid' } }) } };
    const sent = [];
    const transport = createMoleculeMidiTransport({ env, send: async ({ bytes, outputId }) => { sent.push([outputId, ...bytes]); return { ok: true }; } });
    const result = await transport.start({ groupId: 'm', timeline: fixture(), fromSeconds: 0.95 });
    assert.equal(result.ok, true, JSON.stringify(result));
    await new Promise((resolve) => setTimeout(resolve, 250));
    await transport.stop('m');
    assert.deepEqual(sent.slice(0, 4), [['synth_a', 0x90, 60, 100], ['synth_b', 0x90, 60, 100], ['synth_a', 0x80, 60, 0], ['synth_b', 0x80, 60, 0]]);
    assert.equal(sent.some((entry) => entry[2] === 64), false, 'events past the clip window never play');
    sent.length = 0;
    await transport.start({ groupId: 'm', timeline: updateTrack(fixture(), { track_id: 'keys', mute: true }), fromSeconds: 0.95 });
    await new Promise((resolve) => setTimeout(resolve, 120));
    assert.equal(sent.length, 0);
});
