import assert from 'node:assert/strict';
import test from 'node:test';

import { createTimeline } from '../../eVe/intuition/tools/molecule/kernel/index.js';
import { createMoleculeSession } from '../../eVe/intuition/tools/molecule/session/index.js';
import { createProjectViewTimelineContent } from '../../eVe/domains/rendering/project_view_timeline_content.js';
import { createProjectViewMoleculeMixContent } from '../../eVe/domains/rendering/project_view_molecule_mix_content.js';
import { projectViewModeOwnsTree } from '../../eVe/domains/rendering/project_view_surface_runtime.js';

// The project itself is the root Molecule: Timeline and Mix show ITS timeline,
// seeded once from the List playback, without creating a Molecule.
const fakeMoleculeApi = ({ append = async () => ({ ok: true }) } = {}) => {
    const sessions = new Map();
    return {
        sessions,
        listOpenGroupTimelines: () => ({ timelines: [...sessions.keys()].map((group_id) => ({ group_id })) }),
        async openGroupTimeline({ group_id, project_id }) {
            const timeline = createTimeline({
                timeline_id: `tl_${group_id}`, project_id, owner_atome_id: group_id,
                initial_section_id: `section_${group_id}_1`, initial_track_id: `track_${group_id}_empty_1`
            });
            sessions.set(group_id, createMoleculeSession({ timeline, eventSink: { append } }));
            return { ok: true, opened: true, group_id };
        },
        readGroupTimeline: ({ group_id }) => ({ ok: true, timeline: sessions.get(group_id).getState() }),
        applyGroupTimelineBatch: async ({ group_id, operations }) => sessions.get(group_id).applyBatch(operations, {}),
        applyGroupTimelineOperation: async ({ group_id, operation, command }) => sessions.get(group_id).applyTimelineOperation(operation, command),
        // Stopped, the playhead cues the transport and a drag scrubs it (runtime_api_transport.js); no engine here.
        cues: [],
        scrubs: [],
        async cueGroupTimelineTransport({ group_id, seconds }) { this.cues.push({ group_id, seconds }); return { ok: true }; },
        async scrubGroupTimelineTransport({ group_id, seconds }) { this.scrubs.push({ group_id, seconds }); return { ok: true }; },
        readGroupTimelineTransport: () => ({ ok: true, playing: false, position: 0 }),
        prepareGroupTimelineCells: async () => ({ ok: true, prepared: true })
    };
};

const projectRecords = [
    { id: 'take_a', atome_id: 'take_a', type: 'sound', project_id: 'project_tl', properties: { name: 'voix', duration_seconds: 4 } },
    { id: 'take_b', atome_id: 'take_b', type: 'sound', project_id: 'project_tl', properties: { name: 'guitare', duration_seconds: 4 } }
];

const outputHolds = [];
const withWindow = async (api, run) => {
    const previous = globalThis.window;
    const project = { atome_id: 'project_tl', id: 'project_tl', type: 'project', properties: { name: 'tl', playback_mode: 'simultaneous' } };
    globalThis.window = {
        eveMoleculeTimelineApi: api,
        Atome: {
            getStateCurrent: async (id) => (id === 'project_tl' ? project : projectRecords.find((record) => record.atome_id === id) || null),
            listStateCurrent: async (_project, options) => { assert.equal(options.atomeType, 'instrument'); return []; },
            commit: async () => { throw new Error('unexpected_instrument_fixture_write'); }
        },
        // The engine's output is held awake while the Timeline or Cells show (R-307).
        Squirrel: { av: { audio: { __call_backend_method: async (name, arg) => { outputHolds.push({ name, ...arg }); return true; } } } },
        addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => true
    };
    // The work a run leaves queued (a stopped transport's cue at the playhead) settles before its window goes.
    try { return await run(); } finally { await new Promise((resolve) => { setTimeout(resolve, 0); }); globalThis.window = previous; }
};

test('the Timeline view owns the project-view tree like every structured view', () => {
    assert.equal(projectViewModeOwnsTree('timeline'), true);
    assert.equal(projectViewModeOwnsTree('natural'), false);
    assert.equal(projectViewModeOwnsTree('list'), true);
    assert.equal(projectViewModeOwnsTree('mix'), true);
});

test('a project without a Molecule opens as its own timeline, seeded from the List', async () => {
    const api = fakeMoleculeApi();
    await withWindow(api, async () => {
        const content = createProjectViewTimelineContent({ requestRefresh: () => {} });
        await content.load({ projectId: 'project_tl', readList: async () => ({ records: projectRecords, totalCount: 2 }) });
        const state = content.readState();
        assert.equal(state.ownerId, 'project_tl');
        const timeline = api.readGroupTimeline({ group_id: 'project_tl' }).timeline;
        assert.deepEqual(timeline.clips.map((clip) => clip.source.atome_id).sort(), ['take_a', 'take_b']);
        assert.equal(new Set(timeline.clips.map((clip) => clip.track_id)).size, 2, 'simultaneous takes get one track each');
        const ids = [];
        const walk = (node) => { if (!node) return; ids.push(node.id); (node.children || []).forEach(walk); };
        content.build({ width: 900, height: 420, emit: () => {} }).forEach(walk);
        assert.ok(ids.some((id) => id.startsWith('project_view_timeline_header_')));
        assert.ok(ids.includes('project_view_timeline_ruler'));
        assert.ok(ids.includes('project_view_timeline_playhead'));
        // The Mix view presents the very same project timeline.
        const mix = createProjectViewMoleculeMixContent({ requestRefresh: () => {} });
        await mix.load({ projectId: 'project_tl', readList: async () => ({ records: projectRecords, totalCount: 2 }) });
        assert.equal(mix.readState().ownerId, 'project_tl');
        assert.equal(mix.readState().timelineId, timeline.timeline_id);
    });
});

// The durable write goes through the local server and can take seconds: the
// view chosen on the rail is shown at the touch, the stored view follows.
test('Tracks and Cells switch at the touch while the stored view follows', async () => {
    let release = () => {};
    let held = false;
    const api = fakeMoleculeApi({ append: (event) => (held && event.event_type === 'molecule.view.set'
        ? new Promise((resolve) => { release = () => resolve({ ok: true }); })
        : Promise.resolve({ ok: true })) });
    await withWindow(api, async () => {
        const content = createProjectViewTimelineContent({ requestRefresh: () => {} });
        await content.load({ projectId: 'project_tl', readList: async () => ({ records: projectRecords, totalCount: 2 }) });
        const shows = () => {
            const ids = [];
            const walk = (node) => { if (!node) return; ids.push(node.id); (node.children || []).forEach(walk); };
            content.build({ width: 900, height: 420, emit: () => {} }).forEach(walk);
            return { cells: ids.includes('project_view_timeline_cells'), lanes: ids.some((id) => id.startsWith('project_view_timeline_lane_')) };
        };
        const stored = () => api.readGroupTimeline({ group_id: 'project_tl' }).timeline.view.layout;
        for (const [layout, expected] of [
            ['cells', { cells: true, lanes: false }],
            ['timeline', { cells: false, lanes: true }],
            ['cells', { cells: true, lanes: false }]
        ]) {
            held = true;
            const pending = content.chooseView({ layout });
            assert.deepEqual(shows(), expected, `${layout} is shown before it is stored`);
            assert.notEqual(stored(), layout, 'the durable write is still pending');
            release();
            await pending;
            assert.equal(stored(), layout);
            assert.deepEqual(shows(), expected, `${layout} stays once stored`);
        }
    });
});

// Chosen from another view (List, Mix, Natural): the Timeline opens on it.
test('a view chosen before the Timeline opens is the one it opens on', async () => {
    const api = fakeMoleculeApi();
    await withWindow(api, async () => {
        const content = createProjectViewTimelineContent({ requestRefresh: () => {} });
        assert.deepEqual(content.chooseView({ layout: 'cells' }), { ok: true, pending: true });
        await content.load({ projectId: 'project_tl', readList: async () => ({ records: projectRecords, totalCount: 2 }) });
        assert.deepEqual(content.viewChoice(), { layout: 'cells' }, 'shown at once');
        await new Promise((resolve) => setTimeout(resolve, 0));
        const view = api.readGroupTimeline({ group_id: 'project_tl' }).timeline.view;
        assert.equal(view.layout, 'cells');
    });
});

// A Solo touched shows at once; touches during a slow write toggle what is
// shown and are stored in their order (16 Oct.: « je ne peux pas enlever le solo »).
test('Mute and Solo answer the touch and are stored in the order of the touches', async () => {
    const releases = [];
    const order = [];
    const api = fakeMoleculeApi({ append: (event) => (event.event_type === 'molecule.track.update'
        ? new Promise((resolve) => { releases.push(() => { order.push(event.command.solo); resolve({ ok: true }); }); })
        : Promise.resolve({ ok: true })) });
    await withWindow(api, async () => {
        const content = createProjectViewTimelineContent({ requestRefresh: () => {} });
        await content.load({ projectId: 'project_tl', readList: async () => ({ records: projectRecords, totalCount: 2 }) });
        const trackId = api.readGroupTimeline({ group_id: 'project_tl' }).timeline.tracks.find((track) => !track.empty_slot).track_id;
        // On, S takes the Solo colour; off, it keeps the keys' dark ground, the one M shows here (never touched).
        const soloShown = () => {
            const keys = {};
            const walk = (node) => { if (!node) return; const kind = /_(solo|mute)$/.exec(node.id)?.[1]; if (kind && node.id.includes(trackId)) keys[kind] = node; (node.children || []).forEach(walk); };
            content.build({ width: 900, height: 420, emit: () => {} }).forEach(walk);
            assert.ok(keys.solo && keys.mute, 'the open header shows M and S');
            return JSON.stringify(keys.solo.style.background) !== JSON.stringify(keys.mute.style.background);
        };
        await content.handleEvent({ type: 'project_view.timeline.header.open', trackId });
        const tap = () => content.handleEvent({ type: 'project_view.timeline.track.mix', trackId, mode: 'solo' });
        const first = tap();
        assert.equal(soloShown(), true, 'shown at the touch');
        await new Promise((resolve) => setTimeout(resolve, 0));
        const second = tap();
        assert.equal(soloShown(), false, 'the second touch toggles what is shown');
        const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
        assert.equal(releases.length, 1, 'the second write waits for the first');
        releases.shift()();
        await first;
        await tick();
        releases.shift()();
        await second;
        assert.deepEqual(order, [true, false]);
        assert.equal(api.readGroupTimeline({ group_id: 'project_tl' }).timeline.tracks.find((track) => track.track_id === trackId).solo, false);
        assert.equal(soloShown(), false);
    });
});

// A touch on a header selects its track without opening it; a hold opens its keys; a touch then folds them, the track
// staying chosen; a double touch widens the header to its whole name (user, 24 Nov. 2026). Only that header opens.
test('a header touch selects its track, a hold opens its keys, a double touch shows its whole name', async () => {
    const api = fakeMoleculeApi();
    await withWindow(api, async () => {
        const content = createProjectViewTimelineContent({ requestRefresh: () => {} });
        await content.load({ projectId: 'project_tl', readList: async () => ({ records: projectRecords, totalCount: 2 }) });
        const trackId = api.readGroupTimeline({ group_id: 'project_tl' }).timeline.tracks.find((track) => !track.empty_slot).track_id;
        const emitted = [];
        let header = null;
        const walk = (node) => { if (!node) return; if (node.id === `project_view_timeline_header_${trackId.replace(/[^a-zA-Z0-9_-]/g, '_')}`) header = node; (node.children || []).forEach(walk); };
        content.build({ width: 900, height: 420, emit: (intent) => emitted.push(intent) }).forEach(walk);
        header.on.activate();
        header.on.double_click();
        header.on.long_press();
        assert.deepEqual(emitted.map((intent) => intent.type),
            ['project_view.timeline.header.tap', 'project_view.timeline.header.widen', 'project_view.timeline.header.open']);
        const keysShown = () => {
            let found = false;
            const look = (node) => { if (!node) return; if (node.id.endsWith(`${trackId}_mute`)) found = true; (node.children || []).forEach(look); };
            content.build({ width: 900, height: 420, emit: () => {} }).forEach(look);
            return found;
        };
        await content.handleEvent(emitted[0]);
        assert.equal(content.readState().selectedTrackId, trackId, 'a touch selects the track');
        assert.equal(keysShown(), false, 'a touch does not open its keys');
        await content.handleEvent(emitted[0]);
        assert.equal(content.readState().selectedTrackId, trackId, 'a touch again keeps it selected');
        await content.handleEvent(emitted[2]);
        assert.equal(keysShown(), true, 'a hold opens its keys');
        await content.handleEvent(emitted[0]);
        assert.equal(keysShown(), false, 'a touch folds them');
        assert.equal(content.readState().selectedTrackId, trackId, 'the track stays chosen');
        // A double touch widens the header itself to two tools, nothing beside it; a touch on it edits the name in place.
        const headerOf = () => { let found = null; const look = (node) => { if (!node) return; if (node.id === header.id) found = node; else (node.children || []).forEach(look); };
            content.build({ width: 900, height: 420, emit: () => {} }).forEach(look); return found; };
        const width = headerOf().style.size[0];
        await content.handleEvent(emitted[1]);
        assert.ok(headerOf().style.size[0] > width + 30, 'a double touch widens the header');
        assert.ok(!JSON.stringify(content.build({ width: 900, height: 420, emit: () => {} })).includes('name_bubble'), 'no name beside it');
        // The touch goes to the track's own field (here, with no document, the hidden text service refuses to mount).
        await assert.rejects(() => content.handleEvent(emitted[0]), /hidden_text_document_required/, 'a touch on the widened header opens its field');
    });
});

// R-307: while the Timeline or Cells show, the engine's output is held awake, so a cell's first touch after a
// silence sounds at once; the view gone, it is let go.
test('the timeline view holds the engine output while it shows', async () => {
    const api = fakeMoleculeApi();
    await withWindow(api, async () => {
        outputHolds.length = 0;
        const content = createProjectViewTimelineContent({ requestRefresh: () => {} });
        content.reset();
        assert.deepEqual(outputHolds, [], 'a view reset before it ever held lets nothing go');
        await content.load({ projectId: 'project_tl', readList: async () => ({ records: projectRecords, totalCount: 2 }) });
        assert.deepEqual(outputHolds, [{ name: 'hold', owner: 'project_timeline_surface', on: true }]);
        content.reset();
        content.reset();
        assert.deepEqual(outputHolds.slice(1), [{ name: 'hold', owner: 'project_timeline_surface', on: false }], 'let go once');
    });
});

// The playhead is grabbed (knob or line) and dragged; released while stopped,
// the position is stored.
test('the playhead is grabbed and dragged', async () => {
    const api = fakeMoleculeApi();
    await withWindow(api, async () => {
        const content = createProjectViewTimelineContent({ requestRefresh: () => {} });
        await content.load({ projectId: 'project_tl', readList: async () => ({ records: projectRecords, totalCount: 2 }) });
        let grab = null;
        const walk = (node) => { if (!node) return; if (node.id === 'project_view_timeline_playhead_grab') grab = node; (node.children || []).forEach(walk); };
        const emitted = [];
        content.build({ width: 900, height: 420, emit: (intent) => emitted.push(intent) }).forEach(walk);
        assert.ok(grab?.on?.press && grab.children.some((child) => child.id === 'project_view_timeline_playhead_knob'));
        grab.on.press({ client_x: 100 });
        grab.on.drag({ client_x: 260 });
        grab.on.release({ client_x: 260 });
        for (const intent of emitted) await content.handleEvent(intent);
        const pxPerSecond = 80; // BASE_PX_PER_SECOND at x_zoom 1 and unit scale 1
        const stored = api.readGroupTimeline({ group_id: 'project_tl' }).timeline.transport.playhead_seconds;
        assert.ok(Math.abs(stored - (160 / pxPerSecond)) < 0.5, `stored ${stored}`);
    });
});

// Clips are selected by a held lasso on the tracks area, and a rail Delete removes every selected clip.
test('the lasso selects several clips; Delete removes them all', async () => {
    const { visibleClipBoxes } = await import('../../eVe/domains/rendering/project_view_timeline_lasso.js');
    const api = fakeMoleculeApi();
    await withWindow(api, async () => {
        const content = createProjectViewTimelineContent({ requestRefresh: () => {} });
        await content.load({ projectId: 'project_tl', readList: async () => ({ records: projectRecords, totalCount: 2 }) });
        const restBorders = new Map();
        const selectedCount = () => {
            const selected = content.readState().selectedClipIds;
            const expected = new Set(selected.map(id => `project_view_timeline_clip_${id.replace(/[^a-zA-Z0-9_-]/g, '_')}`));
            const ids = [];
            const walk = (node) => {
                if (!node) return;
                if (node.id.startsWith('project_view_timeline_clip_') && !expected.has(node.id) && !restBorders.has(node.id)) {
                    restBorders.set(node.id, structuredClone(node.style?.surfacePaint?.border));
                }
                if (expected.has(node.id)) {
                    assert.equal(node.style.shadow, null, 'a selected clip is pressed in');
                    assert.equal(node.style.surfacePaint?.insetShadows?.length, 1);
                    assert.deepEqual(node.style.surfacePaint?.border, restBorders.get(node.id), 'selection adds no border to the existing grid paint');
                    ids.push(node.id);
                }
                (node.children || []).forEach(walk);
            };
            content.build({ width: 900, height: 420, emit: () => {} }).forEach(walk);
            assert.equal(ids.length, expected.size, 'every selected clip is projected');
            return ids.length;
        };
        selectedCount();
        const timeline = api.readGroupTimeline({ group_id: 'project_tl' }).timeline;
        const gesture = (phase, point) => content.handleEvent({ type: 'project_view.timeline.gesture', target: 'lane', trackId: '', phase,
            event: { client_x: point.x, client_y: point.y, x: point.x, y: point.y } });
        const boxes = visibleClipBoxes(timeline, (await import('../../eVe/domains/rendering/project_view_timeline_layout.js')).timelineGeometry({ width: 900, height: 420, timeline }));
        assert.equal(boxes.length, 2);
        const from = { x: Math.min(...boxes.map((b) => b.box.x)) - 4, y: Math.min(...boxes.map((b) => b.box.y)) - 2 };
        const to = { x: Math.max(...boxes.map((b) => b.box.x + 10)), y: Math.max(...boxes.map((b) => b.box.y + b.box.height)) + 2 };
        await gesture('press', from);
        await new Promise((resolve) => setTimeout(resolve, 320));
        await gesture('drag', to);
        await gesture('release', to);
        assert.equal(selectedCount(), 2, 'the lasso selects both clips');
        await content.invokeRailTool({ key: 'timeline_clip_delete' }, {});
        assert.equal(api.readGroupTimeline({ group_id: 'project_tl' }).timeline.clips.length, 0, 'Delete removes every selected clip');
    });
});
