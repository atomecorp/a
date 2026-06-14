import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { afterEach, test } from 'vitest';

import {
    clearAllProjectScenes,
    renderProjectScene
} from '../../eVe/domains/rendering/project_scene_runtime.js';
import { runSelectedProjectMediaPlaybackAction } from '../../eVe/domains/media/selected_project_media_playback_runtime.js';
import { createProjectPlaybackTimelineRuntime } from '../../eVe/domains/mtrax/project/project_playback_timeline_runtime.js';

const setProjectHostBox = (element, width, height) => {
    Object.defineProperty(element, 'clientWidth', { configurable: true, value: width });
    Object.defineProperty(element, 'clientHeight', { configurable: true, value: height });
    element.getBoundingClientRect = () => ({ left: 0, top: 0, right: width, bottom: height, width, height });
};

const createCompositor = () => ({
    default: async () => {},
    resolve_bevy_media_texture: async () => ({ width: 1, height: 1, rgba: [255, 0, 0, 255] }),
    run_atome_bevy_renderer: () => {},
    apply_atome_bevy_ops: () => {}
});

const createProject = async () => {
    const dom = new JSDOM('<!doctype html><html><body><main id="project"></main></body></html>');
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    const host = dom.window.document.getElementById('project');
    setProjectHostBox(host, 640, 360);
    await renderProjectScene({
        projectId: 'selected_project_video_audio_sync',
        host,
        documentRef: dom.window.document,
        bevyWasmModule: createCompositor(),
        records: [{
            id: 'video_sync',
            type: 'video_recording',
            properties: {
                kind: 'video_recording',
                media_url: '/api/recordings/video-sync.mp4?media_user_id=user_a',
                duration_sec: 5,
                left: 10,
                top: 12,
                width: 160,
                height: 90
            }
        }]
    });
    return dom;
};

const createTimelineRuntime = ({ decodeCalls, now }) => {
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
    return createProjectPlaybackTimelineRuntime({
        getState: () => state,
        hasObjectShape: (value) => !!value && typeof value === 'object' && !Array.isArray(value),
        toKey: (value) => String(value ?? '').trim(),
        roundTimelineNumber: (value) => Math.round(Number(value || 0) * 1000) / 1000,
        applyProjectPlaybackTargetFrame: () => true,
        maybeLogProjectPlaybackFrame: () => {},
        resolveProjectPlaybackNowMs: () => now.value,
        restoreProjectPlaybackTarget: () => true,
        buildProjectPlaybackTarget: async (atomeId) => ({
            atomeId,
            kind: 'video',
            timeline: { duration: 5, automation_lanes: [] },
            appliedPropKeys: new Set(),
            lastAppliedSignature: ''
        }),
        mtrackTimelineEpsilon: 0.001,
        setVideoDecodePlayback: (ids, active, options = {}) => {
            decodeCalls.push({
                ids: ids.slice(),
                active,
                playheads: { ...(options.playheads || {}) }
            });
        }
    });
};

afterEach(() => {
    clearAllProjectScenes();
    delete globalThis.window;
    delete globalThis.document;
});

test('selected project video resumes extracted audio at the same playhead as Bevy video decode', async () => {
    const previousRequestAnimationFrame = globalThis.requestAnimationFrame;
    const previousCancelAnimationFrame = globalThis.cancelAnimationFrame;
    globalThis.requestAnimationFrame = () => 1;
    globalThis.cancelAnimationFrame = () => {};
    const now = { value: 0 };
    const decodeCalls = [];
    const dom = await createProject();
    const timeline = createTimelineRuntime({ decodeCalls, now });
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
                play_instance: async (payload) => {
                    audioCalls.push({ type: 'play_instance', payload });
                    return { ok: true };
                },
                stop_instance: async (payload) => {
                    audioCalls.push({ type: 'stop_instance', payload });
                    return { ok: true };
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
    const runToggle = () => runSelectedProjectMediaPlaybackAction({
        action: 'toggle',
        atomeIds: ['video_sync'],
        windowRef: dom.window,
        documentRef: dom.window.document,
        projectTimelineAction: ({ action, atomeIds }) => timeline.playProjectAtomeTimelines({ action, atomeIds })
    });

    try {
        const started = await runToggle();
        assert.equal(started.ok, true);
        assert.equal(audioCalls.find((entry) => entry.type === 'play')?.payload, undefined);
        assert.equal(audioCalls.find((entry) => entry.type === 'play_instance')?.payload.startSeconds, 0);

        now.value = 1234;
        const paused = await runToggle();
        assert.equal(paused.ok, true);
        assert.equal(paused.action, 'pause');
        assert.ok(audioCalls.some((entry) => entry.type === 'stop_instance'));

        const resumed = await runToggle();
        assert.equal(resumed.ok, true);
        const videoResumePlayhead = decodeCalls.filter((entry) => entry.active === true).at(-1).playheads.video_sync;
        const audioResumeStart = audioCalls.filter((entry) => entry.type === 'play_instance').at(-1).payload.startSeconds;
        assert.ok(Math.abs(videoResumePlayhead - 1.234) <= 0.001);
        assert.ok(Math.abs(audioResumeStart - videoResumePlayhead) <= 0.001);
    } finally {
        globalThis.requestAnimationFrame = previousRequestAnimationFrame;
        globalThis.cancelAnimationFrame = previousCancelAnimationFrame;
    }
});
