// Song chaining, plan level (parcours CHN-01): a sequential list of multitrack songs (simultaneous molecules)
// compiles into one timeline where each song starts exactly where the previous one ends
// (no gap, no overlap), each song lasting as long as its longest track.
import assert from 'node:assert/strict';
import { compileProjectViewTransportPlan, projectViewEngineTimelineFromPlan, projectViewTransportSnapshotAt }
    from '../../eVe/domains/rendering/project_view_transport_plan.js';

const molecule = (id, parent, mode, order) => ({ id, type: 'group', parent_id: parent,
    properties: { molecule_entity: 'molecule', playback_mode: mode, hierarchy_order: order } });
const audio = (id, parent, seconds, order) => ({ id, type: 'audio', parent_id: parent,
    properties: { duration_seconds: seconds, hierarchy_order: order, media_url: `/a/${id}.wav` } });
const SONGS = [['song_a', [3.25, 2.5, 3.0]], ['song_b', [1.75, 4.125]], ['song_c', [2.0, 2.0, 0.5, 1.0]]];
const records = [molecule('root', '', 'sequential', 0), molecule('setlist', 'root', 'sequential', 0)];
SONGS.forEach(([song, tracks], s) => {
    records.push(molecule(song, 'setlist', 'simultaneous', s));
    tracks.forEach((d, t) => records.push(audio(`${song}_t${t}`, song, d, t)));
});
const checks = [];
const check = (name, fn) => { fn(); checks.push(name); };

const plan = compileProjectViewTransportPlan({ rootId: 'root', records });
const nodes = new Map(plan.nodes.filter(n => n.kind === 'molecule').map(n => [n.id, n]));
let cursor = 0;
for (const [song, tracks] of SONGS) {
    const node = nodes.get(song), longest = Math.max(...tracks);
    check(`${song} starts at the previous end (${cursor})`, () => assert.equal(node.startSeconds, cursor));
    check(`${song} lasts its longest track (${longest})`, () => assert.equal(node.durationSeconds, longest));
    for (const [t, d] of tracks.entries()) {
        const leaf = plan.leaves.find(l => l.id === `${song}_t${t}`);
        check(`${song} track ${t} starts with its song`, () => assert.equal(leaf.startSeconds, cursor));
        check(`${song} track ${t} keeps its length`, () => assert.equal(leaf.durationSeconds, d));
    }
    cursor += longest;
}
check('the setlist lasts the sum of its songs', () => assert.equal(plan.durationSeconds, cursor));
// No overlap: every leaf of song N ends at or before the start of song N+1, and song N+1 starts right then.
const engine = projectViewEngineTimelineFromPlan(plan);
const songOf = clip => SONGS.findIndex(([song]) => clip.atomeId.startsWith(song));
const clips = engine.tracks.flatMap(track => track.clips);
check('the engine timeline holds every track', () => assert.equal(clips.length, SONGS.reduce((n, [, t]) => n + t.length, 0)));
for (let s = 0; s + 1 < SONGS.length; s += 1) {
    const lastEnd = Math.max(...clips.filter(c => songOf(c) === s).map(c => c.start + c.duration));
    const nextStart = Math.min(...clips.filter(c => songOf(c) === s + 1).map(c => c.start));
    check(`song ${s + 1} → ${s + 2}: no overlap`, () => assert.ok(lastEnd <= nextStart, `${lastEnd} > ${nextStart}`));
    check(`song ${s + 1} → ${s + 2}: no gap`, () => assert.equal(nextStart, lastEnd));
}
// At each boundary, exactly one song is active (the next one), never both.
let edge = 0;
for (const [, tracks] of SONGS.slice(0, -1)) {
    edge += Math.max(...tracks);
    const snap = projectViewTransportSnapshotAt(plan, edge);
    const active = SONGS.map(([id]) => id).filter(id => snap.activePathIds.includes(id));
    check(`at ${edge}s only the next song plays`, () => assert.equal(active.length, 1));
}
// Start from a song (a row's Play, a MIDI launch): the row's song is the first one heard.
const fromB = compileProjectViewTransportPlan({ rootId: 'root', records });
check('the plan exposes song_b start for a launch from its row', () => assert.equal(fromB.nodes.find(n => n.id === 'song_b').startSeconds, 3.25));
console.log(checks.map(c => `ok  ${c}`).join('\n'));
console.log(`plan.probe: ${checks.length}/${checks.length} PASS`);
