import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test, vi } from 'vitest';

import {
    createProjectPreviewRuntime,
    filterProjectPreviewRecords,
    persistProjectPreviewMetadata
} from '../../eVe/domains/rendering/project_preview_runtime.js';
import { summarizeVisiblePixelBuffer } from '../../eVe/domains/rendering/bevy_project_preview_capture_frame.js';
import { installMockBrowserEnv } from '../strangler_v2/_env.mjs';

const repositoryFile = (path) => fileURLToPath(new URL(`../../${path}`, import.meta.url));

test('project preview runtime loads project records when scene records are not ready', async () => {
    const frames = [];
    const runtime = createProjectPreviewRuntime({
        projectRecordLoader: async () => [
            {
                id: 'text_a',
                type: 'text',
                properties: {
                    kind: 'text',
                    left: '60px',
                    top: '60px',
                    width: '320px',
                    fontSize: '24px',
                    text: 'Ready'
                }
            },
            {
                id: '__eve_dashboard_card_projects_slot_0',
                type: 'shape',
                properties: { width: 20, height: 20, source_domain: 'eve.dashboard' }
            }
        ],
        compositor: {
            async renderAtTime(frame) {
                frames.push(frame);
                return { ok: true, preview_url: 'data:image/png;base64,loaded-records' };
            }
        }
    });

    const preview = await runtime.renderProjectPreview({ projectId: 'project_a' });

    assert.equal(preview.preview_url, 'data:image/png;base64,loaded-records');
    assert.equal(frames.length, 1);
    assert.deepEqual(frames[0].sourceRecords.map((record) => record.id), ['text_a']);
});

test('project preview record filtering excludes wallpaper, dashboard and BevyUI overlay records before capture', () => {
    const filtered = filterProjectPreviewRecords([
        { id: '__eve_dashboard_card_projects_slot_0', type: 'shape', properties: { width: 20, height: 20 } },
        { id: '__eve_bevy_ui_main_menu_home_icon_image', type: 'image', properties: { width: 20, height: 20, source: './assets/images/icons/home.svg' } },
        { id: 'wallpaper_a', type: 'image', properties: { role: 'wallpaper', width: 120, height: 80 } },
        { id: 'surface_a', type: 'surface_background', properties: { width: 120, height: 80 } },
        { id: 'image_a', type: 'image', properties: { left: 0, top: 0, width: 120, height: 80, source: '/api/uploads/a.png' } },
        { id: 'text_a', type: 'text', properties: { left: 0, top: 0, width: 120, height: 40, text: 'Visible' } }
    ]);

    assert.deepEqual(filtered.map((record) => record.id), ['image_a', 'text_a']);
});

test('project preview runtime returns persisted preview dimensions without recapturing', async () => {
    const runtime = createProjectPreviewRuntime({
        compositor: {
            async renderAtTime() {
                throw new Error('persisted_preview_should_not_render');
            }
        }
    });

    const preview = await runtime.renderProjectPreview({
        projectId: 'project_a',
        project: {
            preview_url: 'data:image/png;base64,persisted',
            preview_width: 640,
            preview_height: 360
        }
    });

    assert.equal(preview.preview_url, 'data:image/png;base64,persisted');
    assert.equal(preview.width, 640);
    assert.equal(preview.height, 360);
    assert.equal(preview.source, 'persisted');
});

test('project preview runtime forceCapture bypasses stale persisted preview metadata', async () => {
    const frames = [];
    const runtime = createProjectPreviewRuntime({
        compositor: {
            async renderAtTime(frame) {
                frames.push(frame);
                return {
                    ok: true,
                    preview_url: 'data:image/png;base64,fresh',
                    width: 320,
                    height: 180
                };
            }
        }
    });

    const preview = await runtime.renderProjectPreview({
        projectId: 'project_a',
        project: {
            preview_url: 'data:image/png;base64,stale',
            preview_width: 120,
            preview_height: 120
        },
        records: [{
            id: 'shape_a',
            type: 'shape',
            properties: { left: 0, top: 0, width: 160, height: 90, color: '#ffcc00' }
        }],
        forceCapture: true
    });

    assert.equal(frames.length, 1);
    assert.equal(preview.preview_url, 'data:image/png;base64,fresh');
    assert.equal(preview.source, 'renderer');
});

test('forced project preview capture invalidates its derived cache and excludes the workspace wallpaper', async () => {
    const frames = [];
    const runtime = createProjectPreviewRuntime({
        compositor: {
            async renderAtTime(frame) {
                frames.push(frame);
                return {
                    ok: true,
                    preview_url: `data:image/png;base64,capture-${frames.length}`,
                    width: 320,
                    height: 180
                };
            }
        }
    });
    const record = (color) => ({
        id: 'shape_a',
        type: 'shape',
        properties: { left: 0, top: 0, width: 160, height: 90, color }
    });

    const first = await runtime.renderProjectPreview({
        projectId: 'project_a', records: [record('#ff0000')], forceCapture: true
    });
    const second = await runtime.renderProjectPreview({
        projectId: 'project_a', records: [record('#00ff00')], forceCapture: true
    });

    assert.equal(frames.length, 2, 'an explicit capture must never reuse a previous project image');
    assert.equal(first.preview_url, 'data:image/png;base64,capture-1');
    assert.equal(second.preview_url, 'data:image/png;base64,capture-2');
    assert.equal(frames[0].sourceBackground, null, 'workspace wallpaper is not part of project content');
    assert.equal(frames[1].sourceBackground, null, 'wallpaper state cannot enter the preview cache identity');
});

test('project preview metadata persistence commits canonical url, dimensions and timestamp', async () => {
    const commits = [];
    const stored = await persistProjectPreviewMetadata({
        projectId: 'project_a',
        preview: {
            render_result: {
                preview_url: 'data:image/png;base64,fresh',
                width: 320,
                height: 200
            }
        },
        commit: async (payload) => {
            commits.push(payload);
            return { ok: true };
        }
    });

    assert.equal(commits.length, 1);
    assert.deepEqual(commits[0], {
        kind: 'set',
        atome_id: 'project_a',
        props: {
            preview_url: 'data:image/png;base64,fresh',
            preview_width: 320,
            preview_height: 200,
            preview_updated_at: stored.preview_updated_at
        }
    });
    assert.match(stored.preview_updated_at, /^\d{4}-\d{2}-\d{2}T/);
    assert.equal(stored.source, 'persisted');
});

test('project preview metadata persistence rejects missing commit and dimensions', async () => {
    await assert.rejects(
        () => persistProjectPreviewMetadata({
            projectId: 'project_a',
            preview: { preview_url: 'data:image/png;base64,fresh', width: 320, height: 200 },
            commit: null
        }),
        /project_preview_commit_unavailable/
    );
    await assert.rejects(
        () => persistProjectPreviewMetadata({
            projectId: 'project_a',
            preview: { preview_url: 'data:image/png;base64,fresh', width: 320 },
            commit: async () => ({ ok: true })
        }),
        /project_preview_persist_dimensions_required:project_a/
    );
});

test('project preview runtime propagates empty capture failures instead of substituting a preview', async () => {
    const runtime = createProjectPreviewRuntime({
        compositor: {
            async renderAtTime() {
                throw new Error('bevy_project_preview_capture_empty:project_a:{"visible_pixels":0}');
            }
        }
    });

    await assert.rejects(
        () => runtime.renderProjectPreview({
            projectId: 'project_a',
            records: [{
                id: 'text_a',
                type: 'text',
                properties: {
                    kind: 'text',
                    left: '0px',
                    top: '0px',
                    width: '120px',
                    height: '40px',
                    text: 'Visible'
                }
            }]
        }),
        /bevy_project_preview_capture_empty:project_a/
    );
});

test('project preview pixel summary rejects transparent captures and accepts visible pixels', () => {
    const transparent = new Uint8ClampedArray(4 * 4 * 4);
    const visible = new Uint8ClampedArray(4 * 4 * 4);
    for (let pixel = 0; pixel < 8; pixel += 1) {
        visible[pixel * 4 + 3] = 255;
    }

    assert.equal(summarizeVisiblePixelBuffer({ data: transparent, width: 4, height: 4 }).visible_pixels, 0);
    assert.equal(summarizeVisiblePixelBuffer({ data: visible, width: 4, height: 4 }).visible_pixels, 8);
});

// The entry imports the complete audio editor graph; cold transformation while
// native builds run needs its own budget, separate from the 60 ms engine check.
test('audio entry boots Rubber Band as unavailable when its WASM proof fails without a ReferenceError', async () => {
    installMockBrowserEnv();
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => ({ ok: false, status: 503 });
    const { clearRuntimeErrors, getRuntimeErrors } = await import('../../atome/src/squirrel/runtime_errors.js');
    clearRuntimeErrors();

    try {
        await import('../../eVe/intuition/tools/audio_edit/index.js');
        await new Promise((resolve) => setTimeout(resolve, 60));
        const { getStretchEngine } = await import('../../eVe/intuition/tools/audio_edit/stretch_engine.js');
        const engine = getStretchEngine('rubberband');
        assert.equal(engine?.available, false);
        assert.match(engine?.unavailableReason || '', /^rubberband_wasm_(loading|unavailable:)/);
        assert.equal(getRuntimeErrors().some((entry) => /describeEngine/.test(entry?.error?.message || '')), false);
    } finally {
        globalThis.fetch = originalFetch;
    }
}, 30000);

test('Rubber Band promotes only after a successful WASM initialization', async () => {
    installMockBrowserEnv();
    const originalFetch = globalThis.fetch;
    vi.resetModules();
    vi.doMock('rubberband-wasm', () => ({
        RubberBandInterface: { initialize: async () => ({}) }
    }));
    globalThis.fetch = async () => ({
        ok: true,
        arrayBuffer: async () => new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]).buffer
    });

    try {
        const { installRubberbandStretchEngine } = await import('../../eVe/intuition/tools/audio_edit/rubberband_stretch_runtime.js');
        const { getStretchEngine } = await import('../../eVe/intuition/tools/audio_edit/stretch_engine.js');
        assert.equal(installRubberbandStretchEngine().available, false);
        await new Promise((resolve) => setTimeout(resolve, 60));
        assert.equal(getStretchEngine('rubberband')?.available, true);
    } finally {
        globalThis.fetch = originalFetch;
        vi.doUnmock('rubberband-wasm');
        vi.resetModules();
    }
});

test('preview capture iframe has the browser aliases and registers its capture function before the bounded wait', () => {
    const html = readFileSync(repositoryFile('atome/src/eve_preview_capture.html'), 'utf8');
    const importMapText = html.match(/<script type="importmap">\s*([\s\S]*?)\s*<\/script>/)?.[1] || '';
    const imports = JSON.parse(importMapText).imports;
    assert.deepEqual(imports, {
        '#squirrel/': './squirrel/',
        '#shared/': './shared/',
        '#utils/': './utils/'
    });

    const adapter = readFileSync(repositoryFile('eVe/domains/rendering/bevy_project_preview_capture_adapter.js'), 'utf8');
    const frame = readFileSync(repositoryFile('eVe/domains/rendering/bevy_project_preview_capture_frame.js'), 'utf8');
    assert.match(adapter, /FRAME_READY_TIMEOUT_MS = 12000/);
    assert.match(adapter, /script\.type = 'module'/);
    assert.match(adapter, /while \(performance\.now\(\) - startedAt <= FRAME_READY_TIMEOUT_MS\)/);
    assert.match(adapter, /__eveBevyProjectPreviewCapture/);
    assert.match(frame, /window\.__eveBevyProjectPreviewCapture = captureProjectPreview/);
});

test('Rubber Band asset route is preserved by Web, Tauri, and iOS packaging', () => {
    const fastify = readFileSync(repositoryFile('server/server.js'), 'utf8');
    const tauriServer = readFileSync(repositoryFile('platforms/desktop-tauri/src/server/mod.rs'), 'utf8');
    const tauriConfig = JSON.parse(readFileSync(repositoryFile('platforms/desktop-tauri/tauri.conf.json'), 'utf8'));
    assert.equal(tauriConfig.bundle.resources['../../atome/src'], 'project/atome/src');
    assert.equal(tauriConfig.bundle.resources['../../atome/security'], 'project/atome/security');
    assert.equal(tauriConfig.bundle.resources['../../atome'], undefined,
        'native packages must not copy renderer target caches into the runtime');
    const iOSProject = readFileSync(repositoryFile('platforms/ios/atome-auv3/atome.xcodeproj/project.pbxproj'), 'utf8');
    const iOSPackager = readFileSync(repositoryFile('platforms/ios/package_ios_runtime.mjs'), 'utf8');
    const iOSScheme = readFileSync(repositoryFile('platforms/ios/atome-auv3/Common/AudioSchemeHandler.swift'), 'utf8');

    assert.match(fastify, /prefix: '\/vendor\/rubberband-wasm\/'/);
    assert.match(tauriServer, /node_modules\/rubberband-wasm\/dist/);
    assert.match(tauriServer, /nest_service\("\/vendor\/rubberband-wasm", rubberband_service\)/);
    assert.equal(
        tauriConfig.bundle.resources['../../node_modules/rubberband-wasm/dist'],
        'project/node_modules/rubberband-wasm/dist'
    );
    assert.match(iOSProject, /package_ios_runtime\.mjs/);
    assert.match(iOSPackager, /node_modules\/rubberband-wasm\/dist/);
    assert.match(iOSPackager, /vendor\/rubberband-wasm/);
    assert.match(iOSScheme, /rel\.hasPrefix\("vendor\/"\)/);
});
