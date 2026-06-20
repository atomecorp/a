import assert from 'node:assert/strict';

const registeredTools = new Map();
const calls = [];

globalThis.AtomeAI = {
    registerTool(definition = {}) {
        registeredTools.set(definition.name, definition);
    }
};

globalThis.eveMoleculeTimelineApi = {
    readGroupTimeline(params = {}) {
        calls.push({ method: 'read', params });
        return { ok: true, params };
    },
    applyGroupTimelineOperation(params = {}) {
        calls.push({ method: 'operation', params });
        return { ok: true, params };
    },
    applyGroupTimelineBatch(params = {}) {
        calls.push({ method: 'batch', params });
        return { ok: true, params };
    }
};

await import('./default_tools.js');

assert.ok(registeredTools.get('eve.timeline.read'), 'eve.timeline.read should be registered');
assert.ok(registeredTools.get('eve.timeline.batch'), 'eve.timeline.batch should be registered');
assert.ok(registeredTools.get('eve.timeline.clip.split'), 'eve.timeline.clip.split should be registered');
assert.ok(registeredTools.get('eve.timeline.clip.paste'), 'eve.timeline.clip.paste should be registered');
assert.deepEqual(registeredTools.get('eve.timeline.read')?.capabilities, ['timeline.read']);
assert.deepEqual(registeredTools.get('eve.timeline.clip.split')?.capabilities, ['timeline.write']);
assert.equal(registeredTools.get('eve.timeline.clip.split')?.risk_tier, 'MODERATE');

const split = await registeredTools.get('eve.timeline.clip.split').handler({
    group_id: 'group_timeline_tools',
    command: {
        clip_id: 'clip_video',
        at_seconds: 4,
        left_clip_id: 'clip_video_left',
        right_clip_id: 'clip_video_right'
    }
});
assert.equal(split.ok, true);
assert.equal(calls.at(-1)?.method, 'operation');
assert.equal(calls.at(-1)?.params?.operation, 'eve.timeline.clip.split');
assert.equal(calls.at(-1)?.params?.command?.clip_id, 'clip_video');

const batch = await registeredTools.get('eve.timeline.batch').handler({
    group_id: 'group_timeline_tools',
    operations: [
        { operation: 'eve.timeline.clip.erase', command: { clip_id: 'clip_video_left' } }
    ]
});
assert.equal(batch.ok, true);
assert.equal(calls.at(-1)?.method, 'batch');
assert.equal(calls.at(-1)?.params?.operations.length, 1);

console.log('default_tools_timeline.test: PASS');
