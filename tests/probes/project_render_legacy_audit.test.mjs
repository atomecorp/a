import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { createMediaHydrationRuntime } from '../../eVe/intuition/runtime/media_hydration_runtime.js';
import { createMediaMountRuntime } from '../../eVe/intuition/runtime/media_mount_runtime.js';
import { createMediaSourceRuntime } from '../../eVe/intuition/runtime/media_source_runtime.js';
import { createProjectAtomeIndexRuntime } from '../../eVe/intuition/runtime/project_atome_index_runtime.js';
import { createRealtimeAtomeEventsRuntime } from '../../eVe/intuition/runtime/realtime_atome_events_runtime.js';

const readSource = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

const deleteSource = await readSource('eVe/intuition/tools/delete.js');
const infosSource = await readSource('eVe/intuition/tools/infos.js');
const communicationSource = await readSource('eVe/intuition/tools/communication.js');
const timelineSource = await readSource('eVe/core/atome_timeline.js');
const toolGenesisSource = await readSource('eVe/intuition/runtime/tool_genesis.js');
const projectBridgeSource = await readSource('eVe/intuition/runtime/project_scene_render_bridge.js');
const mediaIntegritySource = await readSource('eVe/intuition/runtime/media_integrity_runtime.js');
const shapeSvgSource = await readSource('eVe/intuition/runtime/shape_svg_runtime.js');
const groupVisualSource = await readSource('eVe/intuition/runtime/group_visual_runtime.js');
const mediaSourceSource = await readSource('eVe/intuition/runtime/media_source_runtime.js');
const mediaHydrationSource = await readSource('eVe/intuition/runtime/media_hydration_runtime.js');
const mediaMountSource = await readSource('eVe/intuition/runtime/media_mount_runtime.js');
const hostRegistrySource = await readSource('eVe/intuition/runtime/atome_host_registry_runtime.js');
const projectAtomeIndexSource = await readSource('eVe/intuition/runtime/project_atome_index_runtime.js');
const realtimeEventsSource = await readSource('eVe/intuition/runtime/realtime_atome_events_runtime.js');

const sliceFunction = (source, name) => {
    const start = source.indexOf(`const ${name} =`);
    assert.notEqual(start, -1, `${name} must exist`);
    const nextDeclaration = source.indexOf('\nconst ', start + 1);
    assert.notEqual(nextDeclaration, -1, `${name} boundary must be explicit`);
    return source.slice(start, nextDeclaration);
};

test('project restore path updates the scene runtime instead of rendering an HTMLElement host', () => {
    const body = sliceFunction(deleteSource, 'restoreAtomeToProject');

    assert.equal(body.includes('renderAtomeRecord('), false);
    assert.equal(body.includes('createAtomeElement('), false);
    assert.ok(body.includes('updateProjectSceneRecord({'));
    assert.ok(deleteSource.includes("from '../../domains/rendering/project_scene_runtime.js'"));
});

test('project info assignment updates the scene runtime instead of requiring an HTMLElement render return', () => {
    const body = sliceFunction(infosSource, 'ensureAtomeRendered');

    assert.equal(body.includes('renderAtomeRecord('), false);
    assert.equal(body.includes('createAtomeElement('), false);
    assert.ok(body.includes('updateProjectSceneRecord({'));
    assert.ok(infosSource.includes("from '../../domains/rendering/project_scene_runtime.js'"));
});

test('shared project atomes hydrate the project scene without dead legacy render branches', () => {
    const body = sliceFunction(communicationSource, 'fetchAndRenderSharedAtomes');

    assert.equal(body.includes('renderAtomeRecord('), false);
    assert.equal(body.includes('createAtomeElement('), false);
    assert.ok(body.includes('updateProjectSceneRecord({'));
});

test('timeline project replay exits through the scene runtime before legacy DOM helpers', () => {
    const stateBody = sliceFunction(timelineSource, 'applyStateToDom');
    const eventBody = sliceFunction(timelineSource, 'applyEvent');

    assert.ok(stateBody.indexOf('updateTimelineProjectSceneRecord(atomeId, props, projectId)') < stateBody.indexOf('ensureAtomeElement(atomeId, props, projectId)'));
    assert.ok(eventBody.indexOf('updateTimelineProjectSceneRecord(atomeId, cleaned, projectId)') < eventBody.indexOf('ensureAtomeElement(atomeId, cleaned, projectId)'));
});

test('tool genesis delegates project scene routing to a cohesive bridge owner', () => {
    const createBody = sliceFunction(toolGenesisSource, 'createAtomeElement');

    assert.ok(toolGenesisSource.includes("from './project_scene_render_bridge.js'"));
    assert.ok(toolGenesisSource.includes("from './atome_description_frame_runtime.js'"));
    assert.ok(projectBridgeSource.includes('updateProjectSceneRecord({'));
    assert.ok(projectBridgeSource.includes('projectIdFromProjectLayer'));
    assert.ok(projectBridgeSource.includes('isProjectSceneParent'));
    assert.equal(projectBridgeSource.includes('createAtomeElement('), false);
    assert.equal(projectBridgeSource.includes('bindAtomeHost('), false);
    assert.equal(createBody.includes('project_view_'), false);
    assert.equal(createBody.includes('eve-matrix-tile'), false);
});

test('tool genesis delegates media integrity ownership outside the legacy runtime', () => {
    assert.ok(toolGenesisSource.includes("from './media_integrity_runtime.js'"));
    assert.ok(mediaIntegritySource.includes('createMediaHostIntegrityRuntime'));
    assert.ok(mediaIntegritySource.includes('logMediaIntegrityEvent'));
    assert.ok(mediaIntegritySource.includes('rememberMediaIntegrityKindHint'));
    assert.equal(toolGenesisSource.includes('const mediaIntegrityHistory ='), false);
    assert.equal(toolGenesisSource.includes('const mediaIntegrityKindHintsByAtomeId ='), false);
    assert.equal(toolGenesisSource.includes("Symbol.for('eve.bind.mediaIntegrityObserver')"), false);
});

test('tool genesis delegates shape svg ownership outside the legacy runtime', () => {
    assert.ok(toolGenesisSource.includes("from './shape_svg_runtime.js'"));
    assert.ok(shapeSvgSource.includes('createShapeSvgRuntime'));
    assert.ok(shapeSvgSource.includes('isSvgShapeSpec'));
    assert.ok(shapeSvgSource.includes('createInlineSvgElement'));
    assert.equal(toolGenesisSource.includes('const SVG_DATA_PREFIX ='), false);
    assert.equal(toolGenesisSource.includes('const decodeSvgDataUrl ='), false);
    assert.equal(toolGenesisSource.includes('const fetchSvgMarkup ='), false);
});

test('tool genesis delegates legacy group visual ownership outside the legacy runtime', () => {
    assert.ok(toolGenesisSource.includes("from './group_visual_runtime.js'"));
    assert.ok(groupVisualSource.includes('createGroupVisualRuntime'));
    assert.ok(groupVisualSource.includes('renderGroupHostPreview'));
    assert.ok(groupVisualSource.includes('applyGroupMembership'));
    assert.ok(groupVisualSource.includes('refreshGroupVisual'));
    assert.equal(toolGenesisSource.includes('const mediaGroupState ='), false);
    assert.equal(toolGenesisSource.includes('const renderGroupHostPreview ='), false);
    assert.equal(toolGenesisSource.includes('const createGroupPersistedPreviewNode ='), false);
    assert.equal(toolGenesisSource.includes('const createGroupMemberPreviewNode ='), false);
});

test('tool genesis delegates media source resolution outside the legacy runtime', () => {
    assert.ok(toolGenesisSource.includes("from './media_source_runtime.js'"));
    assert.ok(mediaSourceSource.includes('createMediaSourceRuntime'));
    assert.ok(mediaSourceSource.includes('resolveMediaUrlFromProperties'));
    assert.ok(mediaSourceSource.includes('normalizePersistedTimelineMediaSourcesForOwner'));
    assert.equal(toolGenesisSource.includes('const BUNDLED_MEDIA_ASSET_BY_NAME ='), false);
    assert.equal(toolGenesisSource.includes('const resolveBundledMediaAsset ='), false);
    assert.equal(toolGenesisSource.includes('const normalizePersistedMediaUrlForOwner ='), false);
    assert.equal(
        toolGenesisSource.includes('/api/recordings/') || toolGenesisSource.includes('audio|video)_'),
        false
    );
});

test('media source runtime normalizes bundled upload recording protected and local media cases', () => {
    const runtime = createMediaSourceRuntime({
        isTauriRuntime: () => false,
        getLocalHttpPort: () => 8794
    });

    assert.equal(runtime.resolveMediaUrlFromProperties({ media_url: 'superman.mp4' }), '/assets/videos/superman.mp4');
    assert.equal(runtime.resolveMediaUrlFromProperties({ file_name: 'audio_recording_demo.wav' }), '/api/recordings/audio_recording_demo.wav');
    assert.equal(runtime.resolveMediaUrlFromProperties({ file_name: 'photo.png', owner_id: 'owner_a' }), '/api/uploads/photo.png?media_user_id=owner_a');
    assert.equal(runtime.isProtectedMediaUrl('/api/uploads/photo.png'), true);
    assert.equal(runtime.shouldHydrateProtectedMedia({ recordingId: 'audio_recording_demo.wav' }), true);
    assert.equal(runtime.shouldAttemptIdentifierHydration({ src: 'clip.mp4' }), true);

    const tauriRuntime = createMediaSourceRuntime({
        isTauriRuntime: () => true,
        getLocalHttpPort: () => 8794
    });
    assert.equal(tauriRuntime.resolveMediaSrc('/file/local.wav'), 'http://127.0.0.1:8794/file/local.wav');
    assert.equal(tauriRuntime.resolveProtectedMediaFetchCredentials('http://127.0.0.1:8794/api/uploads/photo.png'), 'omit');
});

test('tool genesis delegates protected media hydration outside the legacy runtime', () => {
    assert.ok(toolGenesisSource.includes("from './media_hydration_runtime.js'"));
    assert.ok(mediaHydrationSource.includes('createMediaHydrationRuntime'));
    assert.ok(mediaHydrationSource.includes('hydrateProtectedMedia'));
    assert.ok(mediaHydrationSource.includes('attachHydratedMediaBlob'));
    assert.ok(mediaHydrationSource.includes('scheduleMediaBlobRevoke'));
    assert.equal(toolGenesisSource.includes('const MEDIA_BLOB_REVOKE_DELAY_MS ='), false);
    assert.equal(toolGenesisSource.includes('const scheduleMediaBlobRevoke ='), false);
    assert.equal(toolGenesisSource.includes('const attachHydratedMediaBlob ='), false);
    assert.equal(toolGenesisSource.includes('const logMediaRenderDiag ='), false);
    assert.equal(toolGenesisSource.includes('const hydrateProtectedMedia = async'), false);
});

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
    assert.ok(toolGenesisSource.includes("from './media_mount_runtime.js'"));
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

test('tool genesis delegates realtime atome event binding outside the legacy runtime', () => {
    assert.ok(toolGenesisSource.includes("from './realtime_atome_events_runtime.js'"));
    assert.ok(realtimeEventsSource.includes('createRealtimeAtomeEventsRuntime'));
    assert.ok(realtimeEventsSource.includes('sanitizeRealtimeMediaPatchDetail'));
    assert.ok(realtimeEventsSource.includes('bindRealtimeAtomeEvents'));
    assert.ok(realtimeEventsSource.includes('realtimeEventsBound'));
    assert.equal(toolGenesisSource.includes('let realtimeEventsBound ='), false);
    assert.equal(toolGenesisSource.includes('const sanitizeRealtimeMediaPatchDetail ='), false);
    assert.equal(toolGenesisSource.includes('const realtimePatchEventKinds ='), false);
});

test('realtime atome events runtime sanitizes media text patches and routes events', () => {
    const originalWindow = globalThis.window;
    const originalDocument = globalThis.document;
    try {
        const listeners = new Map();
        globalThis.window = {
            addEventListener: (name, handler) => listeners.set(name, handler)
        };
        globalThis.document = {
            getElementById: () => null
        };
        const busHandlers = new Map();
        const removed = [];
        const applied = [];
        const ensured = [];
        const integrityLogs = [];
        const rememberedKinds = [];
        const runtime = createRealtimeAtomeEventsRuntime({
            eventBus: {
                on: (name, handler) => busHandlers.set(name, handler)
            },
            hasObjectShape: (value) => !!value && typeof value === 'object' && !Array.isArray(value),
            toAtomeId: (value) => String(value || '').trim(),
            getAtomeElement: () => null,
            resolveAtomeElement: () => null,
            getAtomeKindFromElement: () => '',
            readMediaIntegrityKindHint: () => 'video',
            rememberMediaIntegrityKindHint: (atomeId, kind) => rememberedKinds.push({ atomeId, kind }),
            isMediaIntegrityKind: (kind) => ['image', 'video', 'audio', 'sound'].includes(String(kind || '').toLowerCase()),
            isMediaTextualPatchKey: (key) => ['text', 'content', 'value'].includes(String(key || '').toLowerCase()),
            logMediaIntegrityEvent: (event, detail) => integrityLogs.push({ event, detail }),
            removeAtomeElement: (atomeId) => removed.push(atomeId),
            applyRealtimeProps: (atomeId, props, meta) => {
                applied.push({ atomeId, props, meta });
                return true;
            },
            ensureAtomeRenderState: async (record, options) => ensured.push({ record, options })
        });

        const detail = {
            id: 'media_a',
            source: 'realtime',
            properties: {
                media_url: '/api/uploads/a.mp4',
                text: 'ghost',
                width: 120
            }
        };
        assert.equal(runtime.sanitizeRealtimeMediaPatchDetail(detail), true);
        assert.deepEqual(detail.properties, {
            media_url: '/api/uploads/a.mp4',
            width: 120
        });
        assert.deepEqual(rememberedKinds[0], { atomeId: 'media_a', kind: 'video' });
        assert.equal(integrityLogs[0].event, 'sanitized_media_text_patch');
        assert.deepEqual(integrityLogs[0].detail.removed_keys, ['text']);

        runtime.bindRealtimeAtomeEvents();
        assert.ok(busHandlers.has('atome:changed'));
        busHandlers.get('atome:changed')({
            event: {
                kind: 'set',
                atome_id: 'media_a',
                payload: { props: { width: 222 } },
                author_id: 'owner_a'
            }
        });
        assert.equal(applied[0].atomeId, 'media_a');
        assert.equal(applied[0].meta.source, 'event_bus:set');

        listeners.get('squirrel:atome-deleted')({
            type: 'squirrel:atome-deleted',
            detail: { id: 'media_a' }
        });
        assert.deepEqual(removed, ['media_a']);
        assert.deepEqual(ensured, []);
    } finally {
        globalThis.window = originalWindow;
        globalThis.document = originalDocument;
    }
});

test('tool genesis delegates legacy host registry and cleanup outside the legacy runtime', () => {
    assert.ok(toolGenesisSource.includes("from './atome_host_registry_runtime.js'"));
    assert.ok(hostRegistrySource.includes('createAtomeHostRegistryRuntime'));
    assert.ok(hostRegistrySource.includes('renderedAtomes'));
    assert.ok(hostRegistrySource.includes('renderedAtomeHosts'));
    assert.ok(hostRegistrySource.includes('removeAtomeElement'));
    assert.equal(toolGenesisSource.includes('const renderedAtomes ='), false);
    assert.equal(toolGenesisSource.includes('const renderedAtomeHosts ='), false);
    assert.equal(toolGenesisSource.includes('const getRenderedAtomeHost ='), false);
    assert.equal(toolGenesisSource.includes('const setRenderedAtomeHost ='), false);
});

test('tool genesis delegates project atome index ownership outside the legacy runtime', () => {
    assert.ok(toolGenesisSource.includes("from './project_atome_index_runtime.js'"));
    assert.ok(projectAtomeIndexSource.includes('createProjectAtomeIndexRuntime'));
    assert.ok(projectAtomeIndexSource.includes('projectAtomeIndex'));
    assert.ok(projectAtomeIndexSource.includes('projectAtomeSnapshot'));
    assert.ok(projectAtomeIndexSource.includes('projectAtomeLoadInFlight'));
    assert.equal(toolGenesisSource.includes('const projectAtomeIndex ='), false);
    assert.equal(toolGenesisSource.includes('const projectAtomeSnapshot ='), false);
    assert.equal(toolGenesisSource.includes('const projectAtomeLoadInFlight ='), false);
    assert.equal(toolGenesisSource.includes('const PROJECT_ATOME_LOAD_DEDUP_WINDOW_MS ='), false);
});

test('project atome index runtime remembers caches and clears scoped project state', () => {
    const clearedHosts = [];
    const clearedScenes = [];
    let clearedAllScenes = 0;
    let clearedAllHosts = 0;
    const runtime = createProjectAtomeIndexRuntime({
        normalizeAtomeRecord: (record) => ({
            id: record?.atome_id || record?.id || null
        }),
        clearProjectScene: (projectId) => clearedScenes.push(projectId),
        clearAllProjectScenes: () => { clearedAllScenes += 1; },
        clearRenderedAtomeHost: (atomeId) => clearedHosts.push(atomeId),
        clearAllRenderedAtomeHosts: () => { clearedAllHosts += 1; },
        dedupWindowMs: 500
    });

    const records = [{ atome_id: 'shape_a' }, { id: 'text_b' }];
    runtime.rememberProjectAtomes('project_a', records);
    assert.equal(runtime.isAtomeInProjectIndex('project_a', 'shape_a'), true);
    assert.equal(runtime.isAtomeInProjectIndex('project_a', 'missing'), false);
    assert.notEqual(runtime.getRememberedProjectAtomes('project_a'), records);

    runtime.markProjectLoadCompleted('project_a', 1000);
    assert.deepEqual(runtime.getRecentProjectCache('project_a', 1200), records);
    assert.equal(runtime.getRecentProjectCache('project_a', 1601), null);

    const task = Promise.resolve([]);
    runtime.setProjectLoadInFlight('project_a', task);
    assert.equal(runtime.getProjectLoadInFlight('project_a'), task);
    runtime.clearProjectLoadInFlightIfCurrent('project_a', Promise.resolve([]));
    assert.equal(runtime.getProjectLoadInFlight('project_a'), task);
    runtime.clearProjectLoadInFlightIfCurrent('project_a', task);
    assert.equal(runtime.getProjectLoadInFlight('project_a'), undefined);

    runtime.clearProjectIndex('project_a');
    assert.deepEqual(clearedHosts, ['shape_a', 'text_b']);
    assert.deepEqual(clearedScenes, ['project_a']);

    runtime.rememberProjectAtomes('project_b', [{ id: 'shape_c' }]);
    runtime.clearProjectIndex();
    assert.equal(clearedAllScenes, 1);
    assert.equal(clearedAllHosts, 1);
});
