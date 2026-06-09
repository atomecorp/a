import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createProjectPlaybackTimelineRuntime } from '../../eVe/domains/mtrax/project/project_playback_timeline_runtime.js';

const createState = () => ({
    projectAutomationFlushPromise: Promise.resolve([]),
    projectPlaybackDebugLogCounts: new Map(),
    projectPlaybackRuntime: {
        rafId: null,
        playing: false,
        startedAtMs: 0,
        basePlayheadSeconds: 0,
        durationSeconds: 0,
        targets: new Map()
    }
});

test('project video playback keeps previous targets running when another video starts', async () => {
    const previousRaf = globalThis.requestAnimationFrame;
    const previousCancel = globalThis.cancelAnimationFrame;
    let rafId = 0;
    const queuedRafs = new Map();
    globalThis.requestAnimationFrame = (callback) => {
        rafId += 1;
        queuedRafs.set(rafId, callback);
        return rafId;
    };
    globalThis.cancelAnimationFrame = (id) => {
        queuedRafs.delete(id);
    };

    const state = createState();
    const appliedFrames = [];
    const decodeCalls = [];
    let nowMs = 0;
    const runtime = createProjectPlaybackTimelineRuntime({
        getState: () => state,
        hasObjectShape: (value) => !!value && typeof value === 'object' && !Array.isArray(value),
        toKey: (value) => String(value || '').trim(),
        roundTimelineNumber: (value) => Math.round(Number(value) * 1000) / 1000,
        applyProjectPlaybackTargetFrame: (target, timeSeconds, options = {}) => {
            appliedFrames.push({
                atomeId: target.atomeId,
                timeSeconds,
                force: options.force === true
            });
            return true;
        },
        maybeLogProjectPlaybackFrame: () => {},
        resolveProjectPlaybackNowMs: () => nowMs,
        restoreProjectPlaybackTarget: () => true,
        buildProjectPlaybackTarget: async (atomeId) => ({
            atomeId,
            kind: 'video',
            timeline: { duration: 10, automation_lanes: [] },
            appliedPropKeys: new Set(),
            lastAppliedSignature: ''
        }),
        mtrackTimelineEpsilon: 0.001,
        setVideoDecodePlayback: (ids, active) => {
            decodeCalls.push({ ids: ids.slice(), active });
        }
    });

    try {
        const first = await runtime.playProjectAtomeTimelines({ atomeIds: ['video_a'], action: 'play' });
        assert.equal(first.ok, true);
        assert.equal(state.projectPlaybackRuntime.playing, true);
        assert.equal(state.projectPlaybackRuntime.targets.get('video_a').playing, true);

        nowMs = 250;
        const second = await runtime.playProjectAtomeTimelines({ atomeIds: ['video_b'], action: 'play' });
        assert.equal(second.ok, true);
        assert.equal(state.projectPlaybackRuntime.targets.size, 2);
        assert.equal(state.projectPlaybackRuntime.targets.get('video_a').playing, true);
        assert.equal(state.projectPlaybackRuntime.targets.get('video_b').playing, true);
        assert.deepEqual(runtime.getProjectPlaybackTargetIds().sort(), ['video_a', 'video_b']);
        assert.deepEqual(decodeCalls, [
            { ids: ['video_a'], active: true },
            { ids: ['video_b'], active: true }
        ]);

        const pauseFirst = await runtime.playProjectAtomeTimelines({ atomeIds: ['video_a'], action: 'toggle' });
        assert.equal(pauseFirst.ok, true);
        assert.equal(state.projectPlaybackRuntime.targets.get('video_a').playing, false);
        assert.equal(state.projectPlaybackRuntime.targets.get('video_b').playing, true);
        assert.equal(state.projectPlaybackRuntime.playing, true);
        assert.deepEqual(decodeCalls.at(-1), { ids: ['video_a'], active: false });
        assert.ok(appliedFrames.some((entry) => entry.atomeId === 'video_a' && entry.force === true));
        assert.ok(appliedFrames.some((entry) => entry.atomeId === 'video_b' && entry.force === true));

        const stopSecond = await runtime.playProjectAtomeTimelines({ atomeIds: ['video_b'], action: 'stop' });
        assert.equal(stopSecond.ok, true);
        assert.equal(state.projectPlaybackRuntime.targets.has('video_a'), true);
        assert.equal(state.projectPlaybackRuntime.targets.has('video_b'), false);
        assert.equal(state.projectPlaybackRuntime.playing, false);
        assert.deepEqual(decodeCalls.at(-1), { ids: ['video_b'], active: false });
    } finally {
        globalThis.requestAnimationFrame = previousRaf;
        globalThis.cancelAnimationFrame = previousCancel;
    }
});
