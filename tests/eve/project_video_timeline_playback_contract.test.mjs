import assert from 'node:assert/strict';
import { test } from 'vitest';
import { JSDOM } from 'jsdom';

import { createProjectPlaybackTimelineRuntime } from '../../eVe/domains/mtrax/project/project_playback_timeline_runtime.js';
import { createProjectPlaybackTargetRuntime } from '../../eVe/domains/mtrax/project/project_playback_target_runtime.js';
import { createProjectAtomeTimelineRuntime } from '../../eVe/domains/mtrax/project/project_atome_timeline_runtime.js';
import {
    clearAllProjectScenes,
    findProjectSceneByAtomeId,
    renderProjectScene
} from '../../eVe/domains/rendering/project_scene_runtime.js';
import { runSelectedProjectMediaPlaybackAction } from '../../eVe/domains/media/selected_project_media_playback_runtime.js';
import { getBevyVideoDecodeStatus, setBevyVideoDecodePlayback, stopAllBevyVideoDecodeSources } from '../../eVe/domains/rendering/bevy_video_decode_source_runtime.js';

const makeProjectRecord = (id, kind) => ({
    id,
    type: kind,
    properties: {
        kind,
        left: 0,
        top: 0,
        width: 64,
        height: 36,
        media_url: `/media/${id}.webm`
    }
});

const createTestCompositor = () => ({
    default: async () => {},
    resolve_bevy_media_texture: async () => ({ width: 1, height: 1, rgba: [255, 0, 0, 255] }),
    run_atome_bevy_renderer: () => {},
    apply_atome_bevy_ops: () => {}
});

test('Project playback timeline is the only controller that starts and pauses Bevy video decode', async () => {
    const previousRequestAnimationFrame = globalThis.requestAnimationFrame;
    const previousCancelAnimationFrame = globalThis.cancelAnimationFrame;
    let rafId = 0;
    globalThis.requestAnimationFrame = () => {
        rafId += 1;
        return rafId;
    };
    globalThis.cancelAnimationFrame = () => {};

    const playbackCalls = [];
    const state = {
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
    };

    const runtime = createProjectPlaybackTimelineRuntime({
        getState: () => state,
        hasObjectShape: (value) => !!value && typeof value === 'object' && !Array.isArray(value),
        toKey: (value) => String(value ?? '').trim(),
        roundTimelineNumber: (value) => Math.round(Number(value || 0) * 1000) / 1000,
        applyProjectPlaybackTargetFrame: () => true,
        maybeLogProjectPlaybackFrame: () => {},
        resolveProjectPlaybackNowMs: () => 1000,
        restoreProjectPlaybackTarget: () => true,
        buildProjectPlaybackTarget: async (atomeId) => ({
            atomeId,
            kind: atomeId === 'video_target' ? 'video' : 'image',
            timeline: { duration: 2, automation_lanes: [] }
        }),
        mtrackTimelineEpsilon: 0.001,
        setVideoDecodePlayback: (ids, active) => playbackCalls.push({ ids, active })
    });

    try {
        const playResult = await runtime.playProjectAtomeTimelines({
            atomeIds: ['video_target', 'image_target'],
            action: 'play'
        });
        assert.equal(playResult.handled, true);
        assert.deepEqual(playbackCalls, [{ ids: ['video_target'], active: true }]);

        const pauseResult = runtime.pauseProjectAtomePlayback();
        assert.equal(pauseResult.handled, true);
        assert.deepEqual(playbackCalls.at(-1), { ids: ['video_target'], active: false });
    } finally {
        globalThis.requestAnimationFrame = previousRequestAnimationFrame;
        globalThis.cancelAnimationFrame = previousCancelAnimationFrame;
    }
});

test('Selected project video playback delegates to timeline and refuses direct playback fallback', async () => {
    clearAllProjectScenes();
    const dom = new JSDOM('<!doctype html><html><body><main id="project"></main></body></html>');
    globalThis.document = dom.window.document;
    globalThis.window = dom.window;
    const audioCalls = [];
    dom.window.Squirrel = {
        av: {
            audio: {
                playback: {
                    loadAsset: async (payload) => {
                        audioCalls.push({ type: 'load', payload });
                        return { ok: true };
                    }
                },
                play: async (payload) => {
                    audioCalls.push({ type: 'play', payload });
                    return { ok: true };
                },
                stop: async (payload) => {
                    audioCalls.push({ type: 'stop', payload });
                    return { ok: true };
                }
            }
        }
    };

    await renderProjectScene({
        projectId: 'project_video_timeline_contract',
        records: [makeProjectRecord('video_selected', 'video')],
        host: dom.window.document.getElementById('project'),
        compositor: createTestCompositor()
    });

    const timelineCalls = [];
    const result = await runSelectedProjectMediaPlaybackAction({
        action: 'play',
        atomeIds: ['video_selected'],
        windowRef: dom.window,
        documentRef: dom.window.document,
        projectTimelineAction: async (payload) => {
            timelineCalls.push(payload);
            return { ok: true, handled: true, action: 'play' };
        }
    });

    assert.equal(result.handled, true);
    assert.equal(result.ok, true);
    assert.deepEqual(timelineCalls, [{ action: 'play', atomeIds: ['video_selected'] }]);
    assert.equal(audioCalls.length, 2);
    assert.equal(audioCalls[0].type, 'load');
    assert.equal(audioCalls[0].payload.id, 'selected_project_media:video_selected:video');
    assert.equal(audioCalls[1].type, 'play');
    assert.equal(audioCalls[1].payload.id, 'selected_project_media:video_selected:video');

    const refused = await runSelectedProjectMediaPlaybackAction({
        action: 'play',
        atomeIds: ['video_selected'],
        windowRef: dom.window,
        documentRef: dom.window.document
    });
    assert.equal(refused.handled, true);
    assert.equal(refused.ok, false);
    assert.equal(refused.error, 'selected_project_video_timeline_required');
    assert.equal(audioCalls.length, 2);
});

test('Selected project video playback activates hidden Bevy decode through the timeline', async () => {
    clearAllProjectScenes();
    const dom = new JSDOM('<!doctype html><html><body><main id="project"></main></body></html>');
    const previousGlobals = Object.fromEntries(['document', 'window', 'requestAnimationFrame', 'cancelAnimationFrame'].map((key) => [key, globalThis[key]]));
    const originalCreateElement = dom.window.document.createElement.bind(dom.window.document);
    let played = false;
    Object.assign(globalThis, { document: dom.window.document, window: dom.window, requestAnimationFrame: () => 1, cancelAnimationFrame: () => {} });
    dom.window.document.createElement = (tagName, ...args) => {
        const element = originalCreateElement(tagName, ...args);
        if (String(tagName || '').toLowerCase() !== 'video') return element;
        let paused = true;
        Object.defineProperty(element, 'paused', { configurable: true, get: () => paused });
        Object.entries({ readyState: 4, videoWidth: 1280, videoHeight: 720 }).forEach(([key, value]) => Object.defineProperty(element, key, { configurable: true, get: () => value }));
        element.play = () => { paused = false; played = true; return Promise.resolve(); };
        element.pause = () => { paused = true; };
        element.load = () => {};
        return element;
    };
    const state = { projectAutomationFlushPromise: Promise.resolve([]), projectPlaybackDebugLogCounts: new Map(), projectPlaybackRuntime: { targets: new Map() } };
    const runtime = createProjectPlaybackTimelineRuntime({
        getState: () => state,
        hasObjectShape: (value) => !!value && typeof value === 'object' && !Array.isArray(value),
        toKey: (value) => String(value ?? '').trim(),
        roundTimelineNumber: (value) => Math.round(Number(value || 0) * 1000) / 1000,
        applyProjectPlaybackTargetFrame: () => true,
        maybeLogProjectPlaybackFrame: () => {},
        resolveProjectPlaybackNowMs: () => 1000,
        restoreProjectPlaybackTarget: () => true,
        buildProjectPlaybackTarget: async (atomeId) => ({ atomeId, kind: 'video', timeline: { duration: 2, automation_lanes: [] } }),
        mtrackTimelineEpsilon: 0.001,
        setVideoDecodePlayback: setBevyVideoDecodePlayback,
        getVideoDecodeStatus: getBevyVideoDecodeStatus
    });
    const projectTimelineAction = ({ action, atomeIds }) => runtime.playProjectAtomeTimelines({ action, atomeIds });
    const runAction = (action) => runSelectedProjectMediaPlaybackAction({
        action,
        atomeIds: ['video_decode_chain'],
        windowRef: dom.window,
        documentRef: dom.window.document,
        projectTimelineAction
    });
    try {
        await renderProjectScene({
            projectId: 'project_video_decode_chain',
            records: [makeProjectRecord('video_decode_chain', 'video')],
            host: dom.window.document.getElementById('project'),
            compositor: createTestCompositor()
        });
        assert.equal(dom.window.__EVE_BEVY_VIDEO_ACTIVE_FOR_ID__('video_decode_chain'), false);
        const play = await runAction('play');
        assert.equal(play.ok, true);
        assert.equal(getBevyVideoDecodeStatus('video_decode_chain').active, true);
        assert.equal(played, true);
        const pause = await runAction('pause');
        assert.equal(pause.ok, true);
        assert.equal(getBevyVideoDecodeStatus('video_decode_chain').active, false);
    } finally {
        stopAllBevyVideoDecodeSources();
        clearAllProjectScenes();
        dom.window.document.createElement = originalCreateElement;
        Object.assign(globalThis, previousGlobals);
    }
});

test('Selected project video playback starts multiple videos through one timeline batch', async () => {
    clearAllProjectScenes();
    const dom = new JSDOM('<!doctype html><html><body><main id="project"></main></body></html>');
    globalThis.document = dom.window.document;
    globalThis.window = dom.window;

    await renderProjectScene({
        projectId: 'project_video_timeline_batch_contract',
        records: [
            makeProjectRecord('video_a', 'video'),
            makeProjectRecord('video_b', 'video')
        ],
        host: dom.window.document.getElementById('project'),
        compositor: createTestCompositor()
    });

    const timelineCalls = [];
    const result = await runSelectedProjectMediaPlaybackAction({
        action: 'play',
        atomeIds: ['video_a', 'video_b'],
        windowRef: dom.window,
        documentRef: dom.window.document,
        projectTimelineAction: async (payload) => {
            timelineCalls.push(payload);
            return { ok: true, handled: true, action: 'play' };
        }
    });

    assert.equal(result.handled, true);
    assert.equal(result.ok, true);
    assert.equal(result.succeeded, 2);
    assert.deepEqual(timelineCalls, [{ action: 'play', atomeIds: ['video_a', 'video_b'] }]);
});

test('Project video timeline accepts duration-only media timelines', () => {
    const runtime = createProjectAtomeTimelineRuntime({
        getState: () => ({}),
        hasObjectShape: (value) => !!value && typeof value === 'object' && !Array.isArray(value),
        normalizeTimelineAutomationLanes: (value) => Array.isArray(value) ? value : [],
        computeAutomationLaneDuration: (lanes) => lanes.length,
        roundTimelineNumber: (value) => Math.round(Number(value || 0) * 1000) / 1000,
        buildTimelineContentHash: (value) => JSON.stringify(value).length.toString(16),
        projectAtomeTimelineSchema: 'eve.project_timeline',
        projectAtomeTimelineVersion: 1,
        projectAtomeTimelineEvent: 'eve:project-atome-timeline-changed',
        toKey: (value) => String(value ?? '').trim(),
        dedupeIds: (ids) => Array.from(new Set(ids)),
        resolveClipSelectionTargets: () => [],
        resolveClipRuntimeKey: () => '',
        resolveActiveAutomationLanes: () => [],
        cloneData: (value) => JSON.parse(JSON.stringify(value)),
        resolveLiveAtomeHostForClip: () => null,
        resolveAtomePropertiesFromStateRecord: (record) => record?.properties || {},
        projectAtomeTimelinePropKeys: {
            timeline: 'project_timeline',
            schema: 'project_timeline_schema',
            version: 'project_timeline_version',
            rev: 'project_timeline_rev',
            hash: 'project_timeline_hash',
            duration: 'project_timeline_duration',
            updatedAt: 'project_timeline_updated_at'
        }
    });

    const timeline = runtime.readProjectAtomeTimelineFromProperties({
        project_timeline: {
            duration: 2.5,
            automation_lanes: []
        }
    });

    assert.equal(timeline.duration, 2.5);
    assert.deepEqual(timeline.automation_lanes, []);
});

test('Project video playback target is built for source-backed videos without automation timeline', async () => {
    const dom = new JSDOM('<!doctype html><html><body></body></html>');
    const previousHTMLElement = globalThis.HTMLElement;
    globalThis.HTMLElement = dom.window.HTMLElement;
    const stateRecords = new Map([
        ['video_plain', {
            properties: {
                kind: 'video',
                media_url: '/media/video_plain.webm',
                duration: 0
            }
        }]
    ]);
    const targetRuntime = createProjectPlaybackTargetRuntime({
        hasObjectShape: (value) => !!value && typeof value === 'object' && !Array.isArray(value),
        cloneData: (value, fallback) => (value == null ? fallback : JSON.parse(JSON.stringify(value))),
        parseProjectPositionValue: (value) => Number(value),
        roundTimelineNumber: (value) => Math.round(Number(value || 0) * 1000) / 1000,
        toKey: (value) => String(value ?? '').trim(),
        resolveLiveAtomeHostForClip: () => null,
        cloneAutomationLaneValue: (value) => value,
        dispatchProjectPlaybackPatch: () => false,
        evaluateMtraxFrame: () => ({ clip_overrides_by_key: {} }),
        prepareMtraxFrameEvaluation: () => null,
        evaluatePreparedMtraxFrame: () => null,
        mtrackMinClipDuration: 0.05,
        stableStringify: (value) => JSON.stringify(value),
        maybeLogProjectPlaybackFrame: () => {},
        describeProjectRecordHost: () => ({}),
        readProjectAtomeTimeline: async () => null,
        resolveProjectAtomeStateApi: () => async (atomeId) => stateRecords.get(atomeId),
        resolveAtomeKindFromHost: () => '',
        resolveAtomePropertiesFromStateRecord: (record) => record?.properties || {}
    });

    try {
        const target = await targetRuntime.buildProjectPlaybackTarget('video_plain');
        assert.equal(target.atomeId, 'video_plain');
        assert.equal(target.kind, 'video');
        assert.deepEqual(target.timeline, { duration: 0, automation_lanes: [] });
    } finally {
        globalThis.HTMLElement = previousHTMLElement;
    }
});

test('Project video playback target uses project scene media properties when state is empty', async () => {
    clearAllProjectScenes();
    const dom = new JSDOM('<!doctype html><html><body><main id="project"></main></body></html>');
    const previousHTMLElement = globalThis.HTMLElement;
    const previousSVGElement = globalThis.SVGElement;
    const previousDocument = globalThis.document;
    const previousWindow = globalThis.window;
    globalThis.HTMLElement = dom.window.HTMLElement;
    globalThis.SVGElement = dom.window.SVGElement;
    globalThis.document = dom.window.document;
    globalThis.window = dom.window;

    await renderProjectScene({
        projectId: 'project_video_scene_fallback_contract',
        records: [makeProjectRecord('video_scene_only', 'video')],
        host: dom.window.document.getElementById('project'),
        compositor: createTestCompositor()
    });

    const targetRuntime = createProjectPlaybackTargetRuntime({
        hasObjectShape: (value) => !!value && typeof value === 'object' && !Array.isArray(value),
        cloneData: (value, fallback) => (value == null ? fallback : JSON.parse(JSON.stringify(value))),
        parseProjectPositionValue: (value) => Number(value),
        roundTimelineNumber: (value) => Math.round(Number(value || 0) * 1000) / 1000,
        toKey: (value) => String(value ?? '').trim(),
        resolveLiveAtomeHostForClip: () => null,
        cloneAutomationLaneValue: (value) => value,
        dispatchProjectPlaybackPatch: () => false,
        evaluateMtraxFrame: () => ({ clip_overrides_by_key: {} }),
        prepareMtraxFrameEvaluation: () => null,
        evaluatePreparedMtraxFrame: () => null,
        mtrackMinClipDuration: 0.05,
        stableStringify: (value) => JSON.stringify(value),
        maybeLogProjectPlaybackFrame: () => {},
        describeProjectRecordHost: () => ({}),
        readProjectAtomeTimeline: async () => null,
        resolveProjectAtomeStateApi: () => async () => null,
        resolveAtomeKindFromHost: () => '',
        resolveAtomePropertiesFromStateRecord: (record) => record?.properties || {},
        resolveProjectSceneByAtomeId: findProjectSceneByAtomeId
    });

    try {
        const target = await targetRuntime.buildProjectPlaybackTarget('video_scene_only');
        assert.equal(target.atomeId, 'video_scene_only');
        assert.equal(target.kind, 'video');
        assert.deepEqual(target.timeline, { duration: 0, automation_lanes: [] });
    } finally {
        globalThis.HTMLElement = previousHTMLElement;
        globalThis.SVGElement = previousSVGElement;
        globalThis.document = previousDocument;
        globalThis.window = previousWindow;
        clearAllProjectScenes();
    }
});

test('Project video playback target treats grouped source-backed video atomes as video targets', async () => {
    const dom = new JSDOM('<!doctype html><html><body></body></html>');
    const previousHTMLElement = globalThis.HTMLElement;
    globalThis.HTMLElement = dom.window.HTMLElement;
    const stateRecords = new Map([
        ['video_group', {
            properties: {
                kind: 'group',
                type: 'group',
                media_kind: 'video',
                media_url: '/media/video_group.mov'
            }
        }]
    ]);
    const targetRuntime = createProjectPlaybackTargetRuntime({
        hasObjectShape: (value) => !!value && typeof value === 'object' && !Array.isArray(value),
        cloneData: (value, fallback) => (value == null ? fallback : JSON.parse(JSON.stringify(value))),
        parseProjectPositionValue: (value) => Number(value),
        roundTimelineNumber: (value) => Math.round(Number(value || 0) * 1000) / 1000,
        toKey: (value) => String(value ?? '').trim(),
        resolveLiveAtomeHostForClip: () => null,
        cloneAutomationLaneValue: (value) => value,
        dispatchProjectPlaybackPatch: () => false,
        evaluateMtraxFrame: () => ({ clip_overrides_by_key: {} }),
        prepareMtraxFrameEvaluation: () => null,
        evaluatePreparedMtraxFrame: () => null,
        mtrackMinClipDuration: 0.05,
        stableStringify: (value) => JSON.stringify(value),
        maybeLogProjectPlaybackFrame: () => {},
        describeProjectRecordHost: () => ({}),
        readProjectAtomeTimeline: async () => null,
        resolveProjectAtomeStateApi: () => async (atomeId) => stateRecords.get(atomeId),
        resolveAtomeKindFromHost: () => 'group',
        resolveAtomePropertiesFromStateRecord: (record) => record?.properties || {}
    });

    try {
        const target = await targetRuntime.buildProjectPlaybackTarget('video_group');
        assert.equal(target.kind, 'video');
        assert.deepEqual(target.timeline, { duration: 0, automation_lanes: [] });
    } finally {
        globalThis.HTMLElement = previousHTMLElement;
    }
});

test('Project timeline starts Bevy decode for source-backed videos without automation lanes', async () => {
    const previousRequestAnimationFrame = globalThis.requestAnimationFrame;
    const previousCancelAnimationFrame = globalThis.cancelAnimationFrame;
    globalThis.requestAnimationFrame = () => 1;
    globalThis.cancelAnimationFrame = () => {};
    const playbackCalls = [];
    const state = {
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
    };

    const runtime = createProjectPlaybackTimelineRuntime({
        getState: () => state,
        hasObjectShape: (value) => !!value && typeof value === 'object' && !Array.isArray(value),
        toKey: (value) => String(value ?? '').trim(),
        roundTimelineNumber: (value) => Math.round(Number(value || 0) * 1000) / 1000,
        applyProjectPlaybackTargetFrame: () => false,
        maybeLogProjectPlaybackFrame: () => {},
        resolveProjectPlaybackNowMs: () => 1000,
        restoreProjectPlaybackTarget: () => true,
        buildProjectPlaybackTarget: async (atomeId) => ({
            atomeId,
            kind: 'video',
            timeline: { duration: 0, automation_lanes: [] }
        }),
        mtrackTimelineEpsilon: 0.001,
        setVideoDecodePlayback: (ids, active) => playbackCalls.push({ ids, active })
    });

    try {
        const result = await runtime.playProjectAtomeTimelines({
            atomeIds: ['video_plain'],
            action: 'play'
        });
        assert.equal(result.ok, true);
        assert.equal(result.handled, true);
        assert.deepEqual(playbackCalls, [{ ids: ['video_plain'], active: true }]);
    } finally {
        globalThis.requestAnimationFrame = previousRequestAnimationFrame;
        globalThis.cancelAnimationFrame = previousCancelAnimationFrame;
    }
});
