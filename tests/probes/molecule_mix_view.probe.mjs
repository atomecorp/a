// Mixer view on a real Molecule session (kernel + session, no browser):
// strip projection, node contract, and every gesture's canonical operation.
import assert from 'node:assert/strict';
import test from 'node:test';

const listeners = { addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; } };
globalThis.window = { ...listeners };
globalThis.window.Atome = {
    listStateCurrent: async (_project, options) => { assert.equal(options.atomeType, 'instrument'); return []; },
    commit: async () => { throw new Error('unexpected_instrument_fixture_write'); }
};
Object.defineProperty(globalThis, 'localStorage', { configurable: true,
    value: { getItem: () => null, setItem() {}, removeItem() {} } });

const { addClip, addTrack, createTimeline, readMixStrip } = await import('../../eVe/intuition/tools/molecule/kernel/index.js');
const { createMoleculeSession } = await import('../../eVe/intuition/tools/molecule/session/index.js');
const { SUPPORTED_KINDS, INTERACTIVE_KINDS } = await import('../../eVe/domains/rendering/bevy_ui_tree_normalization.js');
const { createProjectViewMoleculeMixContent } = await import('../../eVe/domains/rendering/project_view_molecule_mix_content.js');

const OWNER = 'molecule_mixview';
const flatten = (node, parent = null) => [{ ...node, parent }, ...(node?.children || []).flatMap((child) => flatten(child, node))];

const fixture = () => {
    let timeline = createTimeline({ timeline_id: 'tl_mixview', project_id: OWNER, owner_atome_id: OWNER,
        initial_section_id: 'section', initial_track_id: 'voice' });
    timeline = addClip(timeline, { clip_id: 'voice_clip', track_id: 'voice', kind: 'audio', source: { type: 'atome', atome_id: 'a' },
        timeline: { start_seconds: 0, duration_seconds: 1, source_in_seconds: 0, source_out_seconds: 1 },
        next_empty_track_id: 'film', next_empty_track_name: 'Film' });
    timeline = addClip(timeline, { clip_id: 'film_clip', track_id: 'film', kind: 'video', source: { type: 'atome', atome_id: 'v' },
        timeline: { start_seconds: 0, duration_seconds: 1, source_in_seconds: 0, source_out_seconds: 1 },
        next_empty_track_id: 'empty', next_empty_track_name: 'Empty' });
    return { ...timeline, tracks: timeline.tracks.map((track) => ({ ...track, name: track.track_id })) };
};

const setup = async () => {
    const session = createMoleculeSession({ timeline: fixture(), eventSink: { append: async () => {} } });
    const calls = { preview: [], cut: [] };
    const api = {
        listOpenGroupTimelines: () => ({ timelines: [{ group_id: OWNER }] }),
        readGroupTimeline: () => ({ timeline: session.getState() }),
        applyGroupTimelineOperation: async ({ operation, command }) => session.applyTimelineOperation(operation, command),
        applyGroupTimelineBatch: async ({ operations, batch_label }) => session.applyBatch(operations, { label: batch_label }),
        previewGroupTimelineMix: async ({ timeline }) => { calls.preview.push(timeline); return { ok: true }; },
        readGroupTimelineMixModuleState: async () => ({ state: calls.tailState ?? 0 }),
        cutGroupTimelineMixTail: async ({ module_id }) => { calls.cut.push(module_id); return { ok: true }; }
    };
    globalThis.window.eveMoleculeTimelineApi = api;
    let refreshes = 0;
    let content = null;
    // Like the surface: every refresh rebuilds the tree.
    const content_ = createProjectViewMoleculeMixContent({ requestRefresh: () => {
        refreshes += 1;
        content?.build({ width: 900, height: 520, emit: () => {} });
    } });
    content = content_;
    await content.load({ projectId: OWNER, readList: async () => ({ records: [{ id: OWNER, atome_id: OWNER, project_id: OWNER,
        properties: { name: 'Molécule' } }], totalCount: 1 }) });
    content.build({ width: 900, height: 520, emit: () => {} });
    const build = () => content.build({ width: 900, height: 520, emit: () => {} })[0];
    const send = (type, extra = {}) => content.handleEvent({ type: `project_view.mix.${type}`, ...extra });
    return { session, content, build, send, calls, strip: (id) => readMixStrip(session.getState(), id), refreshes: () => refreshes };
};

test('strips, tiles and the node contract (only interactive kinds carry handlers)', async () => {
    const { build, content } = await setup();
    const tree = build();
    const nodes = flatten(tree);
    const ids = nodes.map((entry) => entry.id);
    // One column each: nothing is open until a tool is touched (D18).
    assert.deepEqual(content.readState().strips.map((strip) => [strip.strip_id, strip.selection]), [
        ['voice:audio', ''], ['film:video', ''], ['film:audio', '']
    ]);
    assert.ok(ids.includes('molecule_mix_strip_voice_audio_in'));
    assert.ok(ids.includes('molecule_mix_strip_voice_audio_add'));
    assert.ok(ids.includes('molecule_mix_strip_voice_audio_out'));
    assert.ok(ids.includes('molecule_mix_strip_voice_audio_name'), 'the strip\'s name tool at its foot');
    assert.equal(ids.some((id) => id.endsWith('_welded')), false, 'no welded panel while nothing is open');
    assert.equal(nodes.some((entry) => entry.style?.surfacePaint?.border), false, 'no border anywhere');
    assert.equal(ids.some((id) => /_outline_(zone|tile|bridge)$/.test(id)), false, 'no private outline remains');
    // Volume is the column's tool slider (D16): no fader.
    assert.equal(ids.some((id) => id.includes('fader')), false, 'the old fader is gone');
    // Native video group: closed, so only its master (video) strip shows; its name tool folds and unfolds it.
    assert.ok(ids.includes('molecule_mix_strip_film_video_name'));
    assert.equal(ids.includes('molecule_mix_strip_film_audio'), false);
    for (const entry of nodes) {
        assert.ok(SUPPORTED_KINDS.has(entry.kind), `unsupported kind ${entry.kind} on ${entry.id}`);
        // A canonical tool tile also hands its handlers to its painted ground;
        // the interactive tile above it is what the hit-test returns.
        const reachable = INTERACTIVE_KINDS.has(entry.kind) || (INTERACTIVE_KINDS.has(entry.parent?.kind) && entry.parent?.on);
        if (entry.on && Object.keys(entry.on).length) assert.ok(reachable, `${entry.id} has handlers on non-interactive ${entry.kind}`);
    }
});

test('tap, swipe, hold-move, hold-delete, + and OUT map to canonical operations', async () => {
    const { send, strip, calls, build, content } = await setup();
    const at = (x, y) => ({ x, y, client_x: x, client_y: y });
    await send('tile.activate', { stripId: 'voice:audio', target: 'add' });
    await send('picker.choose', { key: 'dsp_reverb' });
    let chain = strip('voice:audio').chain;
    assert.deepEqual(chain.map((module) => module.type), ['volume', 'pan', 'dsp']);
    const fx = chain[2].module_id;
    // The effect added is open: its panel welded to its tool, the strip widened by it (D18, D24).
    const opened = flatten(build());
    assert.ok(opened.some((entry) => entry.id === 'molecule_mix_strip_voice_audio_welded'), 'the welded panel shows');
    assert.ok(opened.some((entry) => /molecule_mix_strip_voice_audio_preset/.test(entry.id)), 'its preset row');
    const width = (nodes) => nodes.find((entry) => entry.id === 'molecule_mix_strip_voice_audio').style.size[0];
    const film = (nodes) => nodes.find((entry) => entry.id === 'molecule_mix_strip_film_video').style.position[0];
    const openX = film(opened), openW = width(opened);
    // Touched again it folds: one column, the neighbour back in its place.
    await send('tile.activate', { stripId: 'voice:audio', target: fx });
    const folded = flatten(build());
    assert.ok(width(folded) < openW && film(folded) < openX, 'folded, the strip narrows and its neighbour comes back');
    // Rule 20: a short drag opens the panel; the same drag closes it.
    for (const [type, event] of [['press', at(10, 10)], ['drag', at(-40, 12)], ['release', at(-40, 12)]]) {
        await send(`tile.${type}`, { stripId: 'voice:audio', target: fx, event });
    }
    assert.equal(content.readState().strips.find(strip => strip.strip_id === 'voice:audio').selection, fx);
    assert.equal(strip('voice:audio').chain[2].bypass, false, 'opening a panel does not change the switch');
    for (const [type, event] of [['press', at(10, 10)], ['drag', at(-40, 12)], ['release', at(-40, 12)]]) {
        await send(`tile.${type}`, { stripId: 'voice:audio', target: fx, event });
    }
    assert.equal(content.readState().strips.find(strip => strip.strip_id === 'voice:audio').selection, '');
    await send('tile.activate', { stripId: 'voice:audio', target: fx });
    assert.equal(strip('voice:audio').chain[2].bypass, true, 'a touch turns the effect off');
    await send('tile.activate', { stripId: 'voice:audio', target: fx });
    assert.equal(strip('voice:audio').chain[2].bypass, false);
    calls.tailState = 1;
    await send('tile.activate', { stripId: 'voice:audio', target: fx });
    assert.deepEqual(calls.cut, [fx], 'a touch while the tail drains cuts it');
    calls.tailState = 0;
    // Hold then move up two rows: the effect goes first, nothing else changes.
    await send('tile.press', { stripId: 'voice:audio', target: fx, event: at(20, 20) });
    await send('tile.long_press', { stripId: 'voice:audio', target: fx, event: at(20, 20) });
    await send('tile.drag', { stripId: 'voice:audio', target: fx, event: at(20, -110) });
    await send('tile.release', { stripId: 'voice:audio', target: fx, event: at(20, -110) });
    assert.deepEqual(strip('voice:audio').chain.map((module) => module.type), ['dsp', 'volume', 'pan']);
    // Hold then pull right but release inside the strip: cancelled.
    await send('tile.press', { stripId: 'voice:audio', target: fx, event: at(20, 20) });
    await send('tile.long_press', { stripId: 'voice:audio', target: fx, event: at(20, 20) });
    await send('tile.drag', { stripId: 'voice:audio', target: fx, event: at(60, 22) });
    await send('tile.release', { stripId: 'voice:audio', target: fx, event: at(60, 22) });
    assert.equal(strip('voice:audio').chain.length, 3);
    // Hold then pull out past the strip's right edge: deleted on release.
    await send('tile.press', { stripId: 'voice:audio', target: fx, event: at(20, 20) });
    await send('tile.long_press', { stripId: 'voice:audio', target: fx, event: at(20, 20) });
    await send('tile.drag', { stripId: 'voice:audio', target: fx, event: at(400, 22) });
    await send('tile.release', { stripId: 'voice:audio', target: fx, event: at(400, 22) });
    assert.deepEqual(strip('voice:audio').chain.map((module) => module.type), ['volume', 'pan']);
    // OUT picks where the strip goes.
    await send('tile.activate', { stripId: 'voice:audio', target: 'out' });
    assert.equal(content.readState().picker.kind, 'destination');
});

test('the Volume tool slider previews live and commits once; destinations, new bus, sends and groups', async () => {
    const { send, strip, calls, session, content, build } = await setup();
    // The column's Volume: pressed, dragged down twice, released (the tool slider's own handlers).
    const volume = () => flatten(build()).find((entry) => entry.id === 'molecule_mix_strip_voice_audio_module_0' && entry.on?.drag);
    volume().on.press({});
    volume().on.drag({ delta_y: 60 });
    volume().on.drag({ delta_y: 30 });
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.ok(calls.preview.length >= 1, `previewed live (${calls.preview.length})`);
    assert.equal(strip('voice:audio').chain[0].params.gain_db, 0, 'no durable write while the finger moves');
    const before = session.getHistory().undo.length;
    volume().on.release({});
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.ok(strip('voice:audio').chain[0].params.gain_db < 0);
    assert.equal(session.getHistory().undo.length, before + 1);
    // OUT → destination picker → « Nouveau bus » creates the bus and routes to it.
    await send('tile.activate', { stripId: 'voice:audio', target: 'out' });
    assert.equal(content.readState().picker.kind, 'destination');
    await send('picker.choose', { key: 'new_bus' });
    const busId = strip('voice:audio').output.destination.id;
    assert.equal(session.getState().tracks.find((track) => track.track_id === busId).role, 'group');
    await send('tile.activate', { stripId: 'voice:audio', target: 'out' });
    await send('picker.choose', { key: 'none' });
    assert.equal(strip('voice:audio').output.destination, null);
    // A send added from + opens its targets at once; it feeds the bus.
    await send('tile.activate', { stripId: 'voice:audio', target: 'add' });
    await send('picker.choose', { key: 'send_' });
    assert.equal(content.readState().picker.kind, 'send_target');
    await send('picker.choose', { key: `bus:${busId}` });
    assert.deepEqual(strip('voice:audio').chain.at(-1).destination, { kind: 'bus', id: busId });
    // Lasso two strips → Grouper (audio only: a sub-mix bus master).
    content.readState();
    await send('group.toggle', { groupId: 'auto:film' });
    await send('lasso.press', { event: { x: 0, y: 0 } });
    await send('lasso.drag', { event: { x: 2000, y: 400 } });
    await send('lasso.release', { event: { x: 2000, y: 400 } });
    assert.ok(content.readState().lasso.length >= 3);
    const ungroup = content.railDefinitions().find((definition) => definition.key === 'mix_ungroup_all');
    assert.ok(ungroup, 'a lasso over a group offers « Tout dégrouper »');
    await content.invokeRailTool(ungroup);
    assert.deepEqual(session.getState().mix.detached_strip_ids.sort(), ['film:audio', 'film:video']);
});

test('a strip held by its band and dropped on a group joins it; dropped outside, it leaves', async () => {
    const { send, session, content } = await setup();
    await send('group.toggle', { groupId: 'auto:film' });
    const unitX = (stripId) => content.readState().strips.findIndex((strip) => strip.strip_id === stripId);
    assert.ok(unitX('voice:audio') === 0);
    // The voice strip is at x 0..w; the open film group follows it on the row, one column a strip.
    await send('band.press', { stripId: 'voice:audio', event: { x: 20, y: 10 } });
    await send('band.long_press', { stripId: 'voice:audio', event: { x: 20, y: 10 } });
    await send('band.drag', { stripId: 'voice:audio', event: { x: 150, y: 12 } });
    await send('band.release', { stripId: 'voice:audio', event: { x: 150, y: 12 } });
    const joined = session.getState().mix.groups.find((group) => group.group_id === 'auto:film');
    assert.ok(joined?.member_strip_ids.includes('voice:audio'), JSON.stringify(session.getState().mix));
    // Now dropped back at the far left: it leaves the group.
    const film = content.readState().groups.find((group) => group.group_id === 'auto:film');
    assert.ok(film);
    await send('band.press', { stripId: 'voice:audio', event: { x: 20, y: 10 } });
    await send('band.long_press', { stripId: 'voice:audio', event: { x: 20, y: 10 } });
    await send('band.drag', { stripId: 'voice:audio', event: { x: -2000, y: 12 } });
    await send('band.release', { stripId: 'voice:audio', event: { x: -2000, y: 12 } });
    assert.equal(session.getState().mix.groups.find((group) => group.group_id === 'auto:film')?.member_strip_ids.includes('voice:audio'), false);
});
