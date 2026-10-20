// MIDI takes per device, output routing (as recorded / Out override / channel),
// Molecule strip override, piano-roll notes and the midi.output/notes commands.
// node tests/probes/midi_take_routing_piano_roll.probe.mjs
const store = new Map();
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k), clear: () => store.clear(), key: (i) => [...store.keys()][i] ?? null,
    get length() { return store.size; }
} });
await import('../../eVe/domains/rendering/project_view_playback_runtime.js');
const service = await import('../../eVe/intuition/runtime/midi_binding_service.js');
const capture = await import('../../eVe/intuition/tools/midi_capture_runtime.js');
const { compileSmfEventPlan, encodeSmfFromEvents } = await import('../../eVe/domains/midi/smf.js');
const routing = await import('../../eVe/domains/midi/midi_output_routing.js');
const notesMod = await import('../../eVe/domains/midi/midi_notes.js');
const { startMidiEventPlan, startMidiRecordPlayback, stopMidiRecordPlayback } = await import('../../eVe/domains/midi/midi_playback_runtime.js');
const { createMoleculeMidiTransport } = await import('../../eVe/intuition/tools/molecule/runtime_midi.js');
const { setMidiOutput } = await import('../../eVe/intuition/tools/midi_output_tool.js');
const { setMidiNotes } = await import('../../eVe/intuition/tools/midi_notes_tool.js');

let failures = 0;
const check = (label, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${detail ? ' — ' + detail : ''}`); if (!ok) failures += 1; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 1. SMF: a take from two devices -> format 1, one track per device, devices read back.
const twoDevices = encodeSmfFromEvents({ events: [
    { at_ms: 0, bytes: [0x90, 60, 100], device: 'DeepMind 12' }, { at_ms: 500, bytes: [0x80, 60, 0], device: 'DeepMind 12' },
    { at_ms: 250, bytes: [0x91, 40, 90], device: 'Minilogue' }, { at_ms: 750, bytes: [0x81, 40, 0], device: 'Minilogue' }
] });
const plan2 = compileSmfEventPlan(twoDevices);
check('format 1 with tempo + 2 device tracks', plan2.format === 1 && plan2.track_count === 3, `${plan2.format}/${plan2.track_count}`);
check('devices listed', JSON.stringify(plan2.devices) === JSON.stringify(['DeepMind 12', 'Minilogue']), JSON.stringify(plan2.devices));
check('events keep their device and time', plan2.events.map((e) => `${Math.round(e.at_ms)}:${e.device}`).join(',') === '0:DeepMind 12,250:Minilogue,500:DeepMind 12,750:Minilogue', plan2.events.map((e) => `${Math.round(e.at_ms)}:${e.device}`).join(','));
const plain = compileSmfEventPlan(encodeSmfFromEvents({ events: [{ at_ms: 0, bytes: [0x90, 60, 100] }, { at_ms: 100, bytes: [0x80, 60, 0] }] }));
check('no device -> format 0 unchanged', plain.format === 0 && plain.track_count === 1 && plain.devices.length === 0 && !plain.events[0].device);
const utf = compileSmfEventPlan(encodeSmfFromEvents({ events: [{ at_ms: 0, bytes: [0x90, 60, 1], device: 'Électro ★' }] }));
check('device name utf-8 round trip', utf.devices[0] === 'Électro ★', utf.devices[0]);
const empty = compileSmfEventPlan(encodeSmfFromEvents({ events: [] }));
check('empty clip encodes and parses', empty.events.length === 0 && empty.duration_ms === 0);

// 2. Routing.
const outputs = [{ id: 'o1', name: 'DeepMind 12' }, { id: 'o2', name: 'Minilogue' }, { id: 'o3', name: 'IAC Bus' }];
check('as recorded -> same-named output', routing.resolveMidiOutputIds({ device: 'deepmind 12', outputs }).join() === 'o1');
check('no device -> every output', routing.resolveMidiOutputIds({ outputs }).join() === 'o1,o2,o3');
check('override wins over device', routing.resolveMidiOutputIds({ device: 'DeepMind 12', override: 'IAC Bus', outputs }).join() === 'o3');
check('absent device -> nothing', routing.resolveMidiOutputIds({ device: 'Moog', outputs }).length === 0);
check('broadcast port (iOS) reaches any device', routing.resolveMidiOutputIds({ device: 'Moog', outputs: [{ id: 'coremidi-ios', name: 'CoreMIDI iOS/AUv3', broadcast: true }] }).join() === 'coremidi-ios');
check('missing devices reported', JSON.stringify(routing.missingMidiDevices({ plan: { devices: ['DeepMind 12', 'Moog'] }, outputs })) === '["Moog"]');
const sent = [];
const routed = routing.createMidiRoutedSend({ outputs, send: async (m) => { sent.push(m); return { ok: true }; } });
await routed([0x90, 60, 100], { at_ms: 5, device: 'Minilogue' });
await routed([0x90, 61, 100], { at_ms: 6 });
check('routed send per device + fan-out', sent.map((m) => m.outputId).join() === 'o2,o1,o2,o3', sent.map((m) => m.outputId).join());
sent.length = 0;
const ch5 = routing.createMidiRoutedSend({ channel: 5, outputs, send: async (m) => { sent.push(m); return { ok: true }; } });
await ch5([0x93, 60, 100], { device: 'DeepMind 12' });
check('channel override rewrites status', sent[0].bytes[0] === 0x94 && sent[0].outputId === 'o1', JSON.stringify(sent[0]));
check('channel options 0..16', routing.midiChannelOptions('All').length === 17);

// 3. Playback of a record: each event to its device's output; note-off on stop goes to the same device.
const fetchFn = async () => ({ ok: true, arrayBuffer: async () => twoDevices.buffer.slice(twoDevices.byteOffset, twoDevices.byteOffset + twoDevices.byteLength) });
sent.length = 0;
const started = await startMidiRecordPlayback({ atomeId: 'm1', record: { id: 'm1', properties: { media_url: 'http://x/a.mid' } }, outputs,
    fetchFn, send: async (m) => { sent.push(m); return { ok: true }; } });
await sleep(320);
await stopMidiRecordPlayback('m1');
check('record playback ok', started.ok === true && started.missing_devices.length === 0, JSON.stringify({ ok: started.ok, e: started.error }));
check('first note to DeepMind, second to Minilogue', sent[0]?.outputId === 'o1' && sent[1]?.outputId === 'o2', sent.map((m) => m.outputId + ':' + m.bytes.join('.')).join(' '));
check('stop releases each held note on its own device', sent.filter((m) => (m.bytes[0] & 0xf0) === 0x80).map((m) => m.outputId).sort().join() === 'o1,o2', sent.map((m) => m.outputId + ':' + m.bytes.join('.')).join(' '));

// 4. Molecule: strip with output overrides; strip without output plays as the Atome.
const kernel = await import('../../eVe/intuition/tools/molecule/kernel/index.js');
const makeTimeline = (stripPort) => {
    let timeline = kernel.createTimeline({ timeline_id: 't', project_id: 'p', owner_atome_id: 'o', initial_section_id: 's', initial_track_id: 'k' });
    timeline = kernel.addClip(timeline, { clip_id: 'c', track_id: 'k', kind: 'midi', source: { type: 'atome', atome_id: 'm1' },
        timeline: { start_seconds: 0, duration_seconds: 1, source_in_seconds: 0, source_out_seconds: 1 }, next_empty_track_id: 'n', next_empty_track_name: 'N' });
    return stripPort ? kernel.setMixOutput(timeline, { strip_id: 'k:midi', destination: { kind: 'midi_port', id: stripPort } }) : timeline;
};
const env = { Atome: { getStateCurrent: async () => ({ id: 'm1', properties: { media_url: 'http://x/a.mid' } }) } };
const origFetch = globalThis.fetch; globalThis.fetch = fetchFn;
for (const [label, port, expected] of [['without strip output plays as recorded', null, 'o1'], ['with strip output overrides', 'o3', 'o3']]) {
    const molSent = [];
    const transport = createMoleculeMidiTransport({ env, send: async (m) => { molSent.push(m); return { ok: true }; }, honorsTimestamps: () => false, outputs: () => outputs });
    const r = await transport.start({ groupId: 'g', timeline: makeTimeline(port), fromSeconds: 0 });
    await sleep(60); await transport.stop('g');
    check(`molecule clip ${label}`, r.playing === 1 && molSent[0]?.outputId === expected, JSON.stringify({ r, s: molSent.map((m) => m.outputId) }));
}
globalThis.fetch = origFetch;

// 5. Notes model.
const notes = notesMod.midiNotesFromEvents(plan2.events);
check('notes paired with device/channel', notes.length === 2 && notes[0].device === 'DeepMind 12' && notes[1].channel === 2 && notes[1].end_ms === 750, JSON.stringify(notes));
const back = compileSmfEventPlan(encodeSmfFromEvents({ events: notesMod.midiEventsFromNotes(notes) }));
check('notes -> events -> SMF keeps devices', JSON.stringify(back.devices) === JSON.stringify(['DeepMind 12', 'Minilogue']));
const frame = notesMod.midiClipFrame(notes, 1000);
const rects = notesMod.layoutMidiNoteRects({ notes, fromMs: frame.fromMs, toMs: frame.toMs, width: 200, height: 100, range: frame.range });
const hit = notesMod.midiNoteAtPoint(rects, rects[0].left + 1, rects[0].top + 1);
check('hit-test finds the note under the point', hit?.index === 0);
const pos = notesMod.midiPositionAtPoint({ x: 100, y: rects[0].top + 1, fromMs: 0, toMs: frame.toMs, width: 200, height: 100, range: frame.range });
check('point -> pitch of its row', pos.pitch === 60 && Math.round(pos.at_ms) === 500, JSON.stringify(pos));
const held = notesMod.midiNotesFromEvents([{ at_ms: 0, bytes: [0x90, 64, 80] }], { endMs: 1200 });
check('held note lasts until now', held[0]?.end_ms === 1200);
check('empty clip frame = 4 s', notesMod.midiClipFrame([], 0).toMs === 4000);

// 6. Capture: every input/channel by default, device kept, channel filter, empty take -> empty clip.
const imported = [];
const deps = { importFiles: async ({ entries }) => { imported.push(entries[0]); return { results: [{ ok: true, atomeId: 'new-midi' }] }; },
    readInsertionTarget: () => ({ parentId: 'project-1' }), commit: async () => ({ ok: true }) };
const feed = (port, data) => service.routeMidiMessage({ data, port_id: port, port_name: port.toUpperCase() }, { readList: async () => [] });
check('default: all inputs, all channels', capture.readMidiCaptureInput() === '' && capture.readMidiCaptureChannel() === 0);
capture.startMidiCapture({ projectId: 'project-1' });
await feed('deepmind', [0x90, 60, 100]); await feed('minilogue', [0x95, 40, 90]);
const live = capture.readMidiCaptureNotes();
check('live notes visible during the take', live.recording && live.notes.length === 2 && live.notes.every((n) => n.end_ms >= 0), JSON.stringify(live));
await sleep(30);
await feed('deepmind', [0x80, 60, 0]); await feed('minilogue', [0x85, 40, 0]);
const stopped = await capture.stopMidiCapture(deps);
const takePlan = compileSmfEventPlan(new Uint8Array(await imported[0].arrayBuffer()));
check('take stored with both devices', JSON.stringify(takePlan.devices) === JSON.stringify(['DEEPMIND', 'MINILOGUE']) && takePlan.events.length === 4, JSON.stringify(takePlan.devices));
check('stop result carries project for landing', stopped.project?.atomeId === 'new-midi' && stopped.project?.projectId === 'project-1');
capture.selectMidiCaptureChannel(6);
capture.startMidiCapture({ projectId: 'project-1' });
await feed('deepmind', [0x90, 60, 100]); await feed('deepmind', [0x95, 62, 100]);
await capture.stopMidiCapture(deps);
const chPlan = compileSmfEventPlan(new Uint8Array(await imported[1].arrayBuffer()));
check('channel 6 filter keeps only channel 6', chPlan.events.length === 1 && chPlan.events[0].bytes[0] === 0x95, JSON.stringify(chPlan.events));
capture.selectMidiCaptureChannel(0);
capture.startMidiCapture({ projectId: 'project-1' });
const emptyTake = await capture.stopMidiCapture(deps);
check('empty take -> empty clip created', emptyTake.ok === true && emptyTake.status === 'stopped' && imported.length === 3 && emptyTake.properties.duration_sec >= 4, JSON.stringify(emptyTake.properties));

// 7. Commands.
const commits = [];
const so = await setMidiOutput({ atome_ids: ['a', 'b'], output: 'Minilogue', channel: 3 }, { commit: async (c) => { commits.push(c); return { ok: true }; } });
check('midi.output.set commits name + channel', so.ok && commits.length === 2 && commits[0].props.midi_output === 'Minilogue' && commits[0].props.midi_channel === 3, JSON.stringify(commits[0]));
commits.length = 0;
let uploadedFile = null;
const sn = await setMidiNotes({ atome_id: 'm1', project_id: 'p', notes, duration_ms: 2000 }, {
    commit: async (c) => { commits.push(c); return { ok: true }; }, read: async () => ({ properties: { label: 'Prise' } }),
    upload: async (file) => { uploadedFile = file; return { ok: true, mediaUrl: '/api/uploads/x.mid', fileName: 'x.mid', filePath: 'uploads/x.mid' }; } });
const written = compileSmfEventPlan(new Uint8Array(await uploadedFile.arrayBuffer()));
check('midi.notes.set uploads SMF with devices and repoints clip', sn.ok && commits[0].props.media_url === '/api/uploads/x.mid' && commits[0].props.note_count === 2 && commits[0].props.duration_sec === 2 && written.devices.length === 2, JSON.stringify(commits[0]));

console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL PASS');
process.exit(failures ? 1 : 0);
