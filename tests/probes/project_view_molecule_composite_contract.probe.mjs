import assert from 'node:assert/strict';

const storage = new Map();
Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
        getItem: (key) => storage.get(String(key)) ?? null,
        setItem: (key, value) => storage.set(String(key), String(value)),
        removeItem: (key) => storage.delete(String(key)),
        clear: () => storage.clear()
    }
});

const [{ resolveRecordCompositePreviewLayout }, { resolveProjectViewVisualSubject }, { createProjectViewPlaybackRuntime }] = await Promise.all([
    import('../../eVe/intuition/runtime/bevy_panel/bevy_panel_record_composite_preview.js'),
    import('../../eVe/domains/rendering/project_view_visual_subject.js'),
    import('../../eVe/domains/rendering/project_view_playback_runtime.js')
]);

const owner = { id: 'molecule', type: 'group', properties: { kind: 'group' } };
const video = {
    id: 'video', parent_id: owner.id, type: 'video',
    properties: { kind: 'video', media_url: '/video.mp4', left: 0, top: 0, width: 200, height: 100, z_index: 2 }
};
const text = {
    id: 'text', parent_id: owner.id, type: 'text',
    properties: { kind: 'text', text: 'Visible', left: 100, top: 50, width: 100, height: 20, z_index: 9 }
};
const audio = {
    id: 'audio', parent_id: owner.id, type: 'sound',
    properties: { kind: 'sound', media_url: '/audio.wav', left: 0, top: 110, width: 200, height: 40 }
};

const layout = resolveRecordCompositePreviewLayout({ records: [text, video], width: 400, height: 200 });
assert.deepEqual(layout.entries.map((entry) => entry.id), ['video', 'text']);
assert.deepEqual(layout.entries.map(({ id, x, y, width, height }) => ({ id, x, y, width, height })), [
    { id: 'video', x: 0, y: 0, width: 400, height: 200 },
    { id: 'text', x: 200, y: 100, width: 200, height: 40 }
]);

const moved = { ...text, properties: { ...text.properties, left: 140, top: 75 } };
const subject = resolveProjectViewVisualSubject({
    content: {
        contextualTarget: () => ({ id: owner.id, record: owner }),
        levelChildren: () => [owner],
        recordsFor: () => [moved, video, audio]
    },
    playingIds: [text.id, video.id, audio.id],
    playingRecords: [text, video, audio],
    playbackScope: `molecule:${owner.id}`
});
assert.equal(subject.record, owner);
assert.equal(subject.records[0], moved);
assert.equal(subject.records[0].properties.left, 140);

const timers = [];
const videoCalls = [];
const runtime = createProjectViewPlaybackRuntime({
    readMoleculeMembers: async () => [text, audio, video],
    driveVideoPlayback: (nodeIds, active) => {
        videoCalls.push({ nodeIds, active });
        return { ok: true };
    },
    setTimer: (callback, delayMs) => { timers.push({ callback, delayMs }); return timers.length; },
    clearTimer: () => {}
});
runtime.setVideoNodeResolver((atomeId) => [`visual_${atomeId}`]);
await runtime.adoptDelegatedMoleculeTransport({
    level: { entity: 'molecule', id: owner.id },
    projectId: 'project', moleculeId: owner.id, playing: true, duration: 3
});
assert.deepEqual(runtime.readState().playingIds, ['text', 'audio', 'video']);
assert.deepEqual(videoCalls, [{ nodeIds: ['visual_video'], active: true }]);
assert.equal(timers[0].delayMs, 3000);
timers[0].callback();
assert.deepEqual(videoCalls.at(-1), { nodeIds: ['visual_video'], active: false });
assert.equal(runtime.readState().playing, false);

console.log(JSON.stringify({ ok: true, checks: ['layout', 'z_order', 'move_refresh', 'video_start', 'natural_stop'] }));
