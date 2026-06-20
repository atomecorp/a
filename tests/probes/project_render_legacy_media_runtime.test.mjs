import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createMediaHydrationRuntime } from '../../eVe/intuition/runtime/media_hydration_runtime.js';
import { createMediaMountRuntime } from '../../eVe/intuition/runtime/media_mount_runtime.js';
import {
    mediaHydrationSource,
    mediaMountSource,
    toolGenesisMediaSource,
    toolGenesisSource
} from './project_render_legacy_audit_fixture.mjs';

test('media hydration runtime attaches tauri streaming media with projected source state', async () => {
    const originalWindow = globalThis.window;
    const originalFetch = globalThis.fetch;
    const diagnostics = [];
    try {
        globalThis.window = {
            webkit: {
                messageHandlers: {
                    console: {
                        postMessage: (message) => diagnostics.push(message)
                    }
                }
            },
            setTimeout: (callback) => {
                callback();
                return 1;
            }
        };
        let fetchCalled = false;
        globalThis.fetch = async () => {
            fetchCalled = true;
            return { ok: false, status: 500 };
        };
        const projection = [];
        const element = {
            tagName: 'VIDEO',
            src: '',
            loadCount: 0,
            load() {
                this.loadCount += 1;
            }
        };
        const runtime = createMediaHydrationRuntime({
            ensureMediaLocallyAvailable: async (identifier, options) => ({
                ok: true,
                localUrl: `http://127.0.0.1:8794/api/recordings/${identifier}.mp4`,
                options
            }),
            isOrphanTimestampedCaptureSpec: () => false,
            extractMediaIdentifier: () => 'recording_probe',
            isSafeMediaIdentifier: () => true,
            isRecordingSpec: () => true,
            isTauriRuntime: () => true,
            appendStreamingMediaAuthQuery: (url) => `${url}?token=local`,
            buildLocalAuthHeaders: () => ({ 'X-User-Id': 'owner_probe' }),
            getCloudAuthToken: () => '',
            resolveProtectedMediaFetchCredentials: () => 'omit',
            setMediaProjectionState: (target, state) => projection.push({ target, state })
        });

        await runtime.hydrateProtectedMedia(element, {
            id: 'video_probe',
            ownerId: 'owner_probe',
            media_url: '/api/recordings/recording_probe.mp4'
        });

        assert.equal(fetchCalled, false);
        assert.equal(element.src, 'http://127.0.0.1:8794/api/recordings/recording_probe.mp4?token=local');
        assert.equal(element.loadCount, 1);
        assert.deepEqual(projection.at(-1).state, {
            source: '/api/recordings/recording_probe.mp4',
            identifier: 'recording_probe'
        });
        assert.ok(diagnostics.some((message) => message.includes('hydrate_stream_attached')));
    } finally {
        globalThis.window = originalWindow;
        globalThis.fetch = originalFetch;
    }
});

test('tool genesis delegates media api mounting outside the legacy runtime', () => {
    assert.ok(toolGenesisSource.includes("from './tool_genesis_media_runtime.js'"));
    assert.ok(toolGenesisMediaSource.includes("from './media_mount_runtime.js'"));
    assert.ok(mediaMountSource.includes('createMediaMountRuntime'));
    assert.ok(mediaMountSource.includes('mountMediaApiAtome'));
    assert.ok(mediaMountSource.includes('resolveMediaApiKind'));
    assert.ok(mediaMountSource.includes('resolveMediaPreviewSeekSeconds'));
    assert.equal(toolGenesisSource.includes('const attachVideoThumbnail ='), false);
    assert.equal(toolGenesisSource.includes('const resolveMediaApiKind ='), false);
    assert.equal(toolGenesisSource.includes('const resolveMediaPreviewSeekSeconds ='), false);
    assert.equal(toolGenesisSource.includes('const mountMediaApiAtome = (host, spec = {}) => {'), false);
});

test('media mount runtime delegates visual mounting and preview scrub through molecule runtime', async () => {
    const originalWindow = globalThis.window;
    try {
        globalThis.window = {};
        const removed = [];
        const projection = [];
        const runtimeStates = [];
        const mounted = [];
        const scrubbed = [];
        let posterApplied = 0;
        const host = {
            querySelectorAll: () => [
                { remove: () => removed.push('old-video') },
                { remove: () => removed.push('old-canvas') }
            ]
        };
        const runtime = createMediaMountRuntime({
            ensureMoleculeMediaRuntime: () => ({
                mountVisual: async (target, spec) => {
                    mounted.push({ target, spec });
                    return {
                        ok: true,
                        id: spec.id,
                        renderer: 'webgpu',
                        duration: 12
                    };
                },
                scrub: async (id, seconds, options) => {
                    scrubbed.push({ id, seconds, options });
                }
            }),
            applyVideoPosterToHost: () => { posterApplied += 1; },
            isSvgShapeSpec: () => false,
            resolveMediaSrc: (source) => `resolved:${source}`,
            extractMediaIdentifier: () => 'clip_probe',
            getAtomeIdFromElement: () => 'video_probe',
            updateAtomeRuntimeState: (target, state) => runtimeStates.push({ target, state }),
            setMediaProjectionState: (target, state) => projection.push({ target, state })
        });

        runtime.mountMediaApiAtome(host, {
            kind: 'video',
            media_url: '/api/uploads/clip.mp4',
            previewSeekRatio: 0.25
        });
        await new Promise((resolve) => setTimeout(resolve, 0));

        assert.deepEqual(removed, ['old-video', 'old-canvas']);
        assert.equal(mounted.length, 1);
        assert.equal(mounted[0].spec.id, 'video_probe');
        assert.equal(mounted[0].spec.src, 'resolved:/api/uploads/clip.mp4');
        assert.equal(mounted[0].spec.stableMediaUrl, '/api/uploads/clip.mp4');
        assert.equal(projection[0].state.source, '/api/uploads/clip.mp4');
        assert.equal(projection.at(-1).state.error, '');
        assert.equal(runtimeStates[0].state.media.api_ready, false);
        assert.equal(runtimeStates.at(-1).state.media.api_ready, true);
        assert.equal(posterApplied, 1);
        assert.deepEqual(scrubbed[0], {
            id: 'video_probe',
            seconds: 3,
            options: {
                previewOnly: true,
                previewAudio: false
            }
        });
    } finally {
        globalThis.window = originalWindow;
    }
});
