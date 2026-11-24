// Mixer view on a real Molecule session (kernel + session, no browser):
// strip projection, node contract, and every gesture's canonical operation.
import assert from 'node:assert/strict';
import test from 'node:test';

const listeners = { addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; } };
globalThis.window = { ...listeners };
globalThis.window.Atome = {
    listStateCurrent: async (_project, options) => { assert.equal(options.atomeType, 'instrument'); return []; },
    // The owner the timeline opens on (project_view_timeline_owner.js reads it by its id).
    getStateCurrent: async (id) => (id === 'molecule_mixview' ? { id, atome_id: id, project_id: id, type: 'group', properties: { name: 'Molécule' } } : null),
    // Opening the timeline notes what it laid on the project itself (a `set` of the owner); nothing else may be written.
    commit: async (operation) => {
        if (operation?.kind === 'set' && operation.atome_id === 'molecule_mixview') return { ok: true };
        throw new Error('unexpected_instrument_fixture_write');
    }
};
Object.defineProperty(globalThis, 'localStorage', { configurable: true,
    value: { getItem: () => null, setItem() {}, removeItem() {} } });

const { addClip, createTimeline, readMixStrip } = await import('../../eVe/intuition/tools/molecule/kernel/index.js');
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

const setup = async (extraRecords = []) => {
    const session = createMoleculeSession({ timeline: fixture(), eventSink: { append: async () => {} } });
    const calls = { preview: [], cut: [] };
    const api = {
        listOpenGroupTimelines: () => ({ timelines: [{ group_id: OWNER }] }),
        openGroupTimeline: async () => ({ ok: true }),
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
        properties: { name: 'Molécule' } }, ...extraRecords], totalCount: 1 + extraRecords.length }) });
    content.build({ width: 900, height: 520, emit: () => {} });
    const build = () => content.build({ width: 900, height: 520, emit: () => {} })[0];
    const send = (type, extra = {}) => content.handleEvent({ type: `project_view.mix.${type}`, ...extra });
    return { session, content, build, send, calls, strip: (id) => readMixStrip(session.getState(), id), refreshes: () => refreshes };
};

test('Mix gives the shared level transport its durable members rather than an empty level', async () => {
    const { content } = await setup([{ id: 'playable', type: 'audio', parent_id: OWNER,
        properties: { kind: 'audio', duration_seconds: 3 } }]);
    const loaded = await content.transportRecords();
    assert.equal(loaded.ok, true);
    const { compileProjectViewTransportPlan } = await import('../../eVe/domains/rendering/project_view_transport_plan.js');
    const root = { id: OWNER, type: 'group', properties: { group_type: 'media', playback_mode: 'simultaneous' } };
    const plan = compileProjectViewTransportPlan({ rootId: OWNER, records: [root, ...loaded.records.filter(r => r.id !== OWNER)] });
    assert.equal(plan.durationSeconds, 3);
    assert.deepEqual(plan.leaves.map(leaf => leaf.id), ['playable']);
});

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
    assert.equal(nodes.some((entry) => (entry.style?.surfacePaint?.border && !entry.style.surfacePaint.border.charter)), false, 'no border without a charter name');
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
    const selection = () => content.readState().strips.find((entry) => entry.strip_id === 'voice:audio').selection;
    const types = () => strip('voice:audio').chain.map((module) => module.type);
    // R-183: the + opens its welded panel; a choice adds the module at the chain's end and folds.
    await send('tile.activate', { stripId: 'voice:audio', target: 'add' });
    assert.equal(selection(), 'add');
    await send('weld.choose', { stripId: 'voice:audio', panel: 'add', moduleId: '', choice: { type: 'dsp', effect: 'reverb' } });
    assert.deepEqual(types(), ['record', 'volume', 'pan', 'dsp']);
    assert.equal(selection(), '');
    const fx = strip('voice:audio').chain[3].module_id;
    const width = (nodes) => nodes.find((entry) => entry.id === 'molecule_mix_strip_voice_audio').style.size[0];
    const film = (nodes) => nodes.find((entry) => entry.id === 'molecule_mix_strip_film_video').style.position[0];
    const folded = flatten(build());
    // R-171: a touch on an effect opens its panel, welded to its tool, the strip widened by it (D18, D24).
    await send('tile.activate', { stripId: 'voice:audio', target: fx });
    assert.equal(selection(), fx);
    const opened = flatten(build());
    assert.ok(opened.some((entry) => entry.id === 'molecule_mix_strip_voice_audio_panel_body'), 'the welded panel shows');
    assert.ok(opened.some((entry) => entry.id === 'molecule_mix_strip_voice_audio_panel_series_space_hall'), 'its space series (R-184)');
    assert.equal(opened.some((entry) => /^molecule_mix_strip_voice_audio_panel.*close/.test(entry.id)), false, 'no ✕ in a console panel (R-183)');
    assert.ok(width(opened) > width(folded) && film(opened) > film(folded), 'open, the strip widens and its neighbour moves aside');
    assert.equal(strip('voice:audio').chain[3].bypass, false, 'opening a panel does not change the switch');
    // Touched again it folds: one column, the neighbour back in its place.
    await send('tile.activate', { stripId: 'voice:audio', target: fx });
    assert.equal(selection(), '');
    assert.equal(width(flatten(build())), width(folded));
    // Rule 20: a short drag opens the panel; the same drag closes it.
    for (const [type, event] of [['press', at(10, 10)], ['drag', at(-40, 12)], ['release', at(-40, 12)]]) {
        await send(`tile.${type}`, { stripId: 'voice:audio', target: fx, event });
    }
    assert.equal(selection(), fx);
    for (const [type, event] of [['press', at(10, 10)], ['drag', at(-40, 12)], ['release', at(-40, 12)]]) {
        await send(`tile.${type}`, { stripId: 'voice:audio', target: fx, event });
    }
    assert.equal(selection(), '');
    // The switch in the panel's foot turns the effect off and on; off while its tail drains, the tail is cut.
    await send('module.switch', { stripId: 'voice:audio', target: fx });
    assert.equal(strip('voice:audio').chain[3].bypass, true, 'the switch turns the effect off');
    await send('module.switch', { stripId: 'voice:audio', target: fx });
    assert.equal(strip('voice:audio').chain[3].bypass, false);
    calls.tailState = 1;
    await send('module.switch', { stripId: 'voice:audio', target: fx });
    assert.deepEqual(calls.cut, [fx], 'switched off while the tail drains, the tail is cut');
    calls.tailState = 0;
    // Hold then move up: the effect goes up the chain, nothing else changes.
    await send('tile.press', { stripId: 'voice:audio', target: fx, event: at(20, 20) });
    await send('tile.long_press', { stripId: 'voice:audio', target: fx, event: at(20, 20) });
    await send('tile.drag', { stripId: 'voice:audio', target: fx, event: at(20, -110) });
    await send('tile.release', { stripId: 'voice:audio', target: fx, event: at(20, -110) });
    const moved = types();
    assert.ok(moved.indexOf('dsp') < 3, `moved up (${moved.join(',')})`);
    assert.deepEqual([...moved].sort(), ['dsp', 'pan', 'record', 'volume']);
    // Hold then pull right but release inside the strip: cancelled.
    await send('tile.press', { stripId: 'voice:audio', target: fx, event: at(20, 20) });
    await send('tile.long_press', { stripId: 'voice:audio', target: fx, event: at(20, 20) });
    // Held, the module lifts (the « plop »): larger, raised by its drop shadow.
    assert.ok(flatten(build()).some((entry) => entry.style?.z_index === 30 && entry.style?.shadow), 'the held module is lifted');
    await send('tile.drag', { stripId: 'voice:audio', target: fx, event: at(32, 22) });
    await send('tile.release', { stripId: 'voice:audio', target: fx, event: at(32, 22) });
    assert.deepEqual(types(), moved);
    assert.equal(strip('voice:audio').chain.find((module) => module.module_id === fx).bypass, true, 'set down to the side over no strip, it goes in bypass');
    assert.equal(flatten(build()).some((entry) => entry.style?.z_index === 30), false, 'let go, nothing stays lifted');
    // Carried: the rail holds the trash; held and let go still: Supprimer and Bypass, a touch on one acts on that module.
    await send('tile.press', { stripId: 'voice:audio', target: fx, event: at(20, 20) });
    await send('tile.long_press', { stripId: 'voice:audio', target: fx, event: at(20, 20) });
    await send('tile.drag', { stripId: 'voice:audio', target: fx, event: at(32, 22) });
    assert.deepEqual(content.railDefinitions().filter((d) => d.key.startsWith('mix_module')).map((d) => d.key), ['mix_module_trash']);
    await send('tile.release', { stripId: 'voice:audio', target: fx, event: at(32, 22) });
    await send('tile.press', { stripId: 'voice:audio', target: fx, event: at(20, 20) });
    await send('tile.long_press', { stripId: 'voice:audio', target: fx, event: at(20, 20) });
    await send('tile.release', { stripId: 'voice:audio', target: fx, event: at(20, 20) });
    assert.deepEqual(content.railDefinitions().filter((d) => d.key.startsWith('mix_module')).map((d) => d.key), ['mix_module_delete', 'mix_module_bypass']);
    await content.invokeRailTool({ key: 'mix_module_bypass' });
    assert.equal(strip('voice:audio').chain.find((module) => module.module_id === fx).bypass, true, 'Bypass on the rail toggles it');
    assert.equal(content.railDefinitions().some((d) => d.key.startsWith('mix_module')), false, 'the rail gives the tools back');
    const ghosts = flatten(build()).filter((entry) => entry.style?.background && /_module_\d+_background$/.test(entry.id || '') && entry.style.shadow === null);
    assert.ok(ghosts.length >= 1, 'a bypassed module has no ground nor shadow');
    await content.invokeRailTool({ key: 'mix_module_bypass' });
    // Hold then pull out past the strip's right edge: deleted on release.
    await send('tile.press', { stripId: 'voice:audio', target: fx, event: at(20, 20) });
    await send('tile.long_press', { stripId: 'voice:audio', target: fx, event: at(20, 20) });
    await send('tile.drag', { stripId: 'voice:audio', target: fx, event: at(400, 22) });
    await send('tile.release', { stripId: 'voice:audio', target: fx, event: at(400, 22) });
    assert.deepEqual(types(), ['record', 'volume', 'pan']);
    // REC held and carried out is never removed (one per strip, R-183).
    const rec = strip('voice:audio').chain[0].module_id;
    await send('tile.press', { stripId: 'voice:audio', target: rec, event: at(20, 20) });
    await send('tile.long_press', { stripId: 'voice:audio', target: rec, event: at(20, 20) });
    await send('tile.drag', { stripId: 'voice:audio', target: rec, event: at(400, 22) });
    await send('tile.release', { stripId: 'voice:audio', target: rec, event: at(400, 22) });
    assert.deepEqual(types(), ['record', 'volume', 'pan']);
    // OUT opens its welded panel of physical outputs.
    await send('tile.activate', { stripId: 'voice:audio', target: 'out' });
    assert.equal(selection(), 'out');
});

test('the Volume tool slider previews live and commits once; outputs, Aux, new bus and groups', async () => {
    const { send, strip, calls, session, content, build } = await setup();
    const selection = () => content.readState().strips.find((entry) => entry.strip_id === 'voice:audio').selection;
    const volumeIndex = strip('voice:audio').chain.findIndex((module) => module.type === 'volume');
    const gain = () => strip('voice:audio').chain[volumeIndex].params.gain_db;
    // The column's Volume: pressed, dragged down twice, released (the tool slider's own handlers).
    const volume = () => flatten(build()).find((entry) => entry.id === `molecule_mix_strip_voice_audio_module_${volumeIndex}` && entry.on?.drag);
    assert.ok(volume(), 'the Volume tool slider is in the column');
    volume().on.press({});
    volume().on.drag({ delta_y: 60 });
    volume().on.drag({ delta_y: 30 });
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.ok(calls.preview.length >= 1, `previewed live (${calls.preview.length})`);
    assert.equal(gain(), 0, 'no durable write while the finger moves');
    // The console's own memory of what is open (`view.set`, R-199) is written beside it: only the mix writes are counted.
    const mixWrites = () => session.getHistory().undo.filter((entry) => entry.event_type !== 'molecule.view.set').length;
    const before = mixWrites();
    volume().on.release({});
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.ok(gain() < 0);
    assert.equal(mixWrites(), before + 1);
    // OUT → its welded panel → « Aucune »: the strip goes nowhere physical.
    await send('tile.activate', { stripId: 'voice:audio', target: 'out' });
    assert.equal(selection(), 'out');
    await send('weld.choose', { stripId: 'voice:audio', panel: 'out', moduleId: '', choice: null });
    assert.equal(strip('voice:audio').output.destination, null);
    // R-183: an Aux added from + opens its own panel; « Nv. bus » creates the bus and sends to it.
    await send('tile.activate', { stripId: 'voice:audio', target: 'add' });
    await send('weld.choose', { stripId: 'voice:audio', panel: 'add', moduleId: '', choice: { type: 'aux' } });
    const aux = strip('voice:audio').chain.at(-1);
    assert.equal(aux.type, 'aux');
    assert.equal(selection(), aux.module_id, 'the Aux opens its panel at once');
    await send('weld.choose', { stripId: 'voice:audio', panel: 'aux', moduleId: aux.module_id, choice: 'new_bus' });
    const busId = strip('voice:audio').chain.at(-1).destination.id;
    assert.deepEqual(strip('voice:audio').chain.at(-1).destination, { kind: 'bus', id: busId });
    assert.equal(session.getState().tracks.find((track) => track.track_id === busId).role, 'group');
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

test('an audio strip shows an empty Aux until it has one; a touch writes it and opens its panel (R-290)', async () => {
    const { send, strip, content } = await setup();
    const homeId = 'voice:audio:aux_home';
    const shown = () => content.readState().strips.find((entry) => entry.strip_id === 'voice:audio');
    assert.equal(strip('voice:audio').chain.some((module) => module.type === 'aux'), false, 'nothing is stored before the touch');
    assert.ok(shown(), 'the console lists the strip');
    await send('tile.activate', { stripId: 'voice:audio', target: homeId });
    const aux = strip('voice:audio').chain.find((module) => module.type === 'aux');
    assert.equal(aux?.module_id, homeId, 'the touch writes the Aux under its own id');
    assert.equal(aux.destination, null);
    assert.equal(content.readState().strips.find((entry) => entry.strip_id === 'voice:audio').selection, homeId, 'its panel opens');
    await send('weld.choose', { stripId: 'voice:audio', panel: 'aux', moduleId: homeId, choice: 'new_bus' });
    assert.equal(strip('voice:audio').chain.filter((module) => module.type === 'aux').length, 1, 'one Aux, no second empty one');
    // A video strip has none of this (its engine has no send yet).
    assert.equal(strip('film:video').chain.some((module) => module.type === 'aux'), false);
});

test('the Scope: added by the +, its panel holds the view and tap rows and a picture that the measures move (R-290)', async () => {
    const { send, strip, build, session } = await setup();
    await send('tile.activate', { stripId: 'film:video', target: 'add' });
    await send('weld.choose', { stripId: 'film:video', panel: 'add', moduleId: '', choice: { type: 'scope', effect: 'scope' } });
    const scope = strip('film:video').chain.find((module) => module.type === 'scope');
    assert.ok(scope, 'the Scope joins the video strip');
    assert.deepEqual(scope.params, { view: 0, tap: 0 });
    await send('tile.activate', { stripId: 'film:video', target: scope.module_id });
    const nodes = flatten(build());
    // The labels are cut to the tool's width (rule 11): the first letters tell them apart.
    const labels = nodes.map((entry) => entry.accessibility?.label || entry.text || entry.label).filter(Boolean);
    for (const label of ['Onde', 'Vec', 'His', 'Sor', 'Ent']) assert.ok(labels.some((text) => text.startsWith(label)), `the panel shows ${label}`);
    assert.ok(nodes.some((entry) => String(entry.id).endsWith('_scope')), 'the picture is laid');
    assert.ok(nodes.some((entry) => String(entry.id).includes('_scope_w_')), 'the waveform view is laid by default');
    // The audio strip takes one too, and it stays out of the program the engine plays.
    await send('tile.activate', { stripId: 'voice:audio', target: 'add' });
    await send('weld.choose', { stripId: 'voice:audio', panel: 'add', moduleId: '', choice: { type: 'scope', effect: 'scope' } });
    assert.ok(strip('voice:audio').chain.some((module) => module.type === 'scope'));
    // The engine plays it as the dsp `scope`, at the strip's input (tap 1) first, else after the rest.
    const { compileMoleculeMixProgram } = await import('../../eVe/core/media_engine/molecule_mix_engine.js');
    const compiled = () => compileMoleculeMixProgram(session.getState(), { clipHasAudio: () => true }).find((entry) => entry.id === 'voice:audio').chain;
    const scopeOf = (chain) => chain.filter((module) => module.effect === 'scope');
    assert.equal(scopeOf(compiled()).length, 1);
    assert.equal(compiled().at(-1).effect, 'scope', 'tap 0 (Sortie) reads at the end of the chain');
    const audioScope = strip('voice:audio').chain.find((module) => module.type === 'scope');
    await session.applyTimelineOperation('mix.module.update', { strip_id: 'voice:audio', module_id: audioScope.module_id, params: { tap: 1 } });
    assert.equal(compiled()[0].effect === 'scope' || compiled().findIndex((module) => module.effect === 'scope') < compiled().findIndex((module) => module.type === 'dsp' && module.effect !== 'scope'), true, 'tap 1 (Entrée) reads first');
});
