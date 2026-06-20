import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createInfoPanelSyncRuntime } from '../../eVe/intuition/runtime/info_panel_sync_runtime.js';
import { createPersistenceDiagRuntime } from '../../eVe/intuition/runtime/persistence_diag_runtime.js';
import { createRealtimeAtomeEventsRuntime } from '../../eVe/intuition/runtime/realtime_atome_events_runtime.js';
import { createSharedProjectOverrideRuntime } from '../../eVe/intuition/runtime/shared_project_override_runtime.js';
import {
    hostRegistrySource,
    infoPanelSyncSource,
    persistenceDiagSource,
    projectAtomeIndexSource,
    realtimeEventsSource,
    realtimePatchSource,
    sharedOverrideSource,
    toolGenesisCoreServicesSource,
    toolGenesisHostLifecycleSource,
    toolGenesisLifecycleSource,
    toolGenesisPublicSource,
    toolGenesisSource
} from './project_render_legacy_audit_fixture.mjs';

test('tool genesis delegates realtime atome event binding outside the legacy runtime', () => {
    assert.ok(toolGenesisSource.includes("from './tool_genesis_public_runtime.js'"));
    assert.ok(toolGenesisPublicSource.includes("from './realtime_atome_events_runtime.js'"));
    assert.ok(realtimeEventsSource.includes('createRealtimeAtomeEventsRuntime'));
    assert.ok(realtimeEventsSource.includes('sanitizeRealtimeMediaPatchDetail'));
    assert.ok(realtimeEventsSource.includes('bindRealtimeAtomeEvents'));
    assert.ok(realtimeEventsSource.includes('realtimeEventsBound'));
    assert.equal(toolGenesisSource.includes('let realtimeEventsBound ='), false);
    assert.equal(toolGenesisSource.includes('const sanitizeRealtimeMediaPatchDetail ='), false);
    assert.equal(toolGenesisSource.includes('const realtimePatchEventKinds ='), false);
});

test('tool genesis delegates realtime host patch projection outside the legacy facade', () => {
    assert.ok(toolGenesisSource.includes("from './tool_genesis_realtime_patch_runtime.js'"));
    assert.ok(realtimePatchSource.includes('createToolGenesisRealtimePatchRuntime'));
    assert.ok(realtimePatchSource.includes('applyRealtimeProps'));
    assert.ok(realtimePatchSource.includes('applyProjectSceneRealtimeProps'));
    assert.equal(toolGenesisSource.includes('const applyRealtimeProps ='), false);
    assert.equal(toolGenesisSource.includes('const applyProjectSceneRealtimeProps ='), false);
    assert.equal(toolGenesisSource.includes('const syncRealtimeMediaSource ='), false);
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

test('tool genesis delegates persistence diagnostics outside the legacy runtime', () => {
    assert.ok(toolGenesisSource.includes("from './tool_genesis_host_lifecycle_runtime.js'"));
    assert.ok(toolGenesisHostLifecycleSource.includes("from './persistence_diag_runtime.js'"));
    assert.ok(persistenceDiagSource.includes('createPersistenceDiagRuntime'));
    assert.ok(persistenceDiagSource.includes('persistenceDiagLog'));
    assert.ok(persistenceDiagSource.includes('summarizePersistenceRecord'));
    assert.ok(persistenceDiagSource.includes('summarizePersistenceRecords'));
    assert.equal(toolGenesisSource.includes('const persistenceDiagLog ='), false);
    assert.equal(toolGenesisSource.includes('const summarizePersistenceRecord ='), false);
});

test('persistence diagnostics runtime summarizes records and logs only when enabled', async () => {
    const originalWindow = globalThis.window;
    try {
        const messages = [];
        const invokes = [];
        globalThis.window = {
            __EVE_PERSISTENCE_DIAG__: false,
            webkit: {
                messageHandlers: {
                    console: {
                        postMessage: (message) => messages.push(message)
                    }
                }
            },
            __TAURI_INTERNALS__: {
                invoke: async (name, payload) => invokes.push({ name, payload })
            }
        };
        const runtime = createPersistenceDiagRuntime({
            resolveAtomeProperties: (record) => record.properties || {}
        });

        const records = runtime.summarizePersistenceRecords([
            {
                atome_id: 'shape_a',
                type: 'shape',
                owner_id: 'owner_a',
                properties: {
                    project_id: 'project_a',
                    parent_id: 'project_a',
                    left: 10,
                    top: 20,
                    width: 30,
                    height: 40
                }
            },
            null
        ]);
        assert.deepEqual(records, [{
            id: 'shape_a',
            type: 'shape',
            projectId: 'project_a',
            parentId: 'project_a',
            ownerId: 'owner_a',
            left: 10,
            top: 20,
            width: 30,
            height: 40,
            deleted: null
        }]);

        runtime.persistenceDiagLog('disabled', { ok: false });
        assert.deepEqual(messages, []);
        assert.deepEqual(invokes, []);

        globalThis.window.__EVE_PERSISTENCE_DIAG__ = true;
        runtime.persistenceDiagLog('enabled', { ok: true });
        await new Promise((resolve) => setTimeout(resolve, 0));
        assert.equal(messages.length, 1);
        assert.ok(messages[0].includes('[eVe:persistence:temporary] enabled'));
        assert.equal(invokes[0].name, 'log_from_webview');
        assert.equal(invokes[0].payload.payload.component, 'persistence');
    } finally {
        globalThis.window = originalWindow;
    }
});

test('tool genesis delegates info panel synchronization outside the legacy runtime', () => {
    assert.ok(toolGenesisSource.includes("from './tool_genesis_core_services_runtime.js'"));
    assert.ok(toolGenesisCoreServicesSource.includes("from './info_panel_sync_runtime.js'"));
    assert.ok(infoPanelSyncSource.includes('createInfoPanelSyncRuntime'));
    assert.ok(infoPanelSyncSource.includes('notifyInfoPanelProperties'));
    assert.ok(infoPanelSyncSource.includes('notifyInfoPanelPosition'));
    assert.ok(infoPanelSyncSource.includes('notifyInfoPanelResize'));
    assert.equal(toolGenesisSource.includes('const notifyInfoPanelProperties ='), false);
    assert.equal(toolGenesisSource.includes('const notifyInfoPanelPosition ='), false);
    assert.equal(toolGenesisSource.includes('const notifyInfoPanelResize ='), false);
});

test('info panel sync runtime projects position and resize updates', () => {
    const originalWindow = globalThis.window;
    try {
        const updates = [];
        globalThis.window = {
            eveInfoPanelUpdateAtomeProperties: (atomeId, props) => updates.push({ atomeId, props })
        };
        const runtime = createInfoPanelSyncRuntime({
            toPx: (value) => `${Math.round(Number(value) || 0)}px`
        });
        const item = {
            id: 'shape_panel',
            width: 40,
            height: 50,
            parentWidth: 200,
            parentHeight: 180,
            hasRight: true,
            hasBottom: true
        };

        runtime.notifyInfoPanelPosition(item, 10, 20);
        runtime.notifyInfoPanelResize(item, 15, 25, 60, 70);

        assert.deepEqual(updates, [
            {
                atomeId: 'shape_panel',
                props: {
                    left: '10px',
                    top: '20px',
                    right: '150px',
                    bottom: '110px'
                }
            },
            {
                atomeId: 'shape_panel',
                props: {
                    left: '15px',
                    top: '25px',
                    width: '60px',
                    height: '70px',
                    right: '125px',
                    bottom: '85px'
                }
            }
        ]);
    } finally {
        globalThis.window = originalWindow;
    }
});

test('tool genesis delegates legacy host registry and cleanup outside the legacy runtime', () => {
    assert.ok(toolGenesisSource.includes("from './tool_genesis_host_lifecycle_runtime.js'"));
    assert.ok(toolGenesisHostLifecycleSource.includes("from './atome_host_registry_runtime.js'"));
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
    assert.ok(toolGenesisSource.includes("from './tool_genesis_host_lifecycle_runtime.js'"));
    assert.ok(toolGenesisHostLifecycleSource.includes("from './project_atome_index_runtime.js'"));
    assert.ok(projectAtomeIndexSource.includes('createProjectAtomeIndexRuntime'));
    assert.ok(projectAtomeIndexSource.includes('projectAtomeIndex'));
    assert.ok(projectAtomeIndexSource.includes('projectAtomeSnapshot'));
    assert.ok(projectAtomeIndexSource.includes('projectAtomeLoadInFlight'));
    assert.equal(toolGenesisSource.includes('const projectAtomeIndex ='), false);
    assert.equal(toolGenesisSource.includes('const projectAtomeSnapshot ='), false);
    assert.equal(toolGenesisSource.includes('const projectAtomeLoadInFlight ='), false);
    assert.equal(toolGenesisSource.includes('const PROJECT_ATOME_LOAD_DEDUP_WINDOW_MS ='), false);
});

test('tool genesis delegates shared project override ownership outside the legacy runtime', () => {
    assert.ok(toolGenesisSource.includes("from './tool_genesis_core_services_runtime.js'"));
    assert.ok(toolGenesisCoreServicesSource.includes("from './tool_genesis_lifecycle_runtime.js'"));
    assert.ok(toolGenesisLifecycleSource.includes("from './shared_project_override_runtime.js'"));
    assert.ok(sharedOverrideSource.includes('createSharedProjectOverrideRuntime'));
    assert.ok(sharedOverrideSource.includes('sharedProjectOverrides'));
    assert.ok(sharedOverrideSource.includes('sharedOverrideFetchInFlight'));
    assert.ok(sharedOverrideSource.includes('fetchSharedOverrideAtomes'));
    assert.equal(toolGenesisSource.includes('const sharedProjectOverrides ='), false);
    assert.equal(toolGenesisSource.includes('const sharedOverrideFetchInFlight ='), false);
    assert.equal(toolGenesisSource.includes('const fetchFastifyAtomeRecord ='), false);
    assert.equal(toolGenesisSource.includes('const fetchSharedOverrideAtomes ='), false);
});

test('shared project override runtime persists overrides and prunes stale remote records', async () => {
    const originalWindow = globalThis.window;
    const originalLocalStorage = globalThis.localStorage;
    const originalFetch = globalThis.fetch;
    try {
        const storage = new Map();
        const fetches = [];
        const logs = [];
        globalThis.window = {};
        globalThis.localStorage = {
            getItem: (key) => storage.get(key) || null,
            setItem: (key, value) => {
                storage.set(key, String(value));
            }
        };
        globalThis.fetch = async (url) => {
            fetches.push(String(url));
            if (String(url).endsWith('/shared_a')) {
                return {
                    ok: true,
                    status: 200,
                    json: async () => ({
                        data: {
                            atome: {
                                id: 'shared_a',
                                type: 'shape'
                            }
                        }
                    })
                };
            }
            return {
                ok: false,
                status: 404,
                json: async () => ({})
            };
        };

        const runtime = createSharedProjectOverrideRuntime({
            resolveCurrentUserId: () => 'owner_a',
            getCloudAuthToken: () => 'token_a',
            getFastifyBaseUrl: () => 'http://fastify.test',
            getTauriHttpBaseUrl: () => '',
            isTauriRuntime: () => false,
            extractAtomeFromResult: (payload) => payload?.data?.atome || payload?.atome || null,
            toErrorMessage: (error) => error?.message || String(error),
            debugLog: (...args) => logs.push(args)
        });

        assert.equal(runtime.setSharedProjectOverride('shared_a', 'project_a'), true);
        assert.equal(runtime.setSharedProjectOverride('stale_a', 'project_a'), true);
        assert.deepEqual(runtime.listSharedOverrideIdsForProject('project_a'), ['shared_a', 'stale_a']);

        const records = await runtime.fetchSharedOverrideAtomes('project_a', [{ id: 'existing_a' }]);
        assert.deepEqual(records, [{
            id: 'shared_a',
            type: 'shape',
            project_id: 'project_a',
            projectId: 'project_a'
        }]);
        assert.equal(fetches.length, 2);
        assert.ok(fetches.some((url) => url.endsWith('/shared_a')));
        assert.ok(fetches.some((url) => url.endsWith('/stale_a')));
        assert.equal(runtime.getSharedProjectOverride('stale_a'), null);
        assert.equal(runtime.getSharedProjectOverride('shared_a'), 'project_a');
        assert.deepEqual(JSON.parse(storage.get('eve_shared_project_overrides_owner_a')), {
            shared_a: 'project_a'
        });
        assert.equal(logs.length, 1);
        assert.equal(logs[0][0], '[AtomeRender] pruned stale shared overrides');
        assert.deepEqual(logs[0][1].ids, ['stale_a']);
    } finally {
        globalThis.window = originalWindow;
        globalThis.localStorage = originalLocalStorage;
        globalThis.fetch = originalFetch;
    }
});
