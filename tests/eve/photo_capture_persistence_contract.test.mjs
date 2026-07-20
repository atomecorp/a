import assert from 'node:assert/strict';
import { afterEach, test, vi } from 'vitest';

const originalElement = globalThis.Element;
const originalHTMLElement = globalThis.HTMLElement;
const originalWindow = globalThis.window;
const originalDocument = globalThis.document;

afterEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    globalThis.Element = originalElement;
    globalThis.HTMLElement = originalHTMLElement;
    globalThis.window = originalWindow;
    globalThis.document = originalDocument;
});

test('photo persistence validates JPEG bytes and commits complete canonical metadata once', async () => {
    const ensureProjectMediaAtome = vi.fn(async () => ({
        ok: true,
        atomeId: 'image_photo_a',
        projectId: 'project_a'
    }));
    const uploadToFastify = vi.fn(async ({ filePath }) => ({ path: filePath }));

    vi.doMock('../../eVe/domains/media/api/media_api_shared.js', () => ({
        ensureProjectId: vi.fn(async () => 'project_a'),
        getCloudAuthToken: () => '',
        getFastifyBaseUrl: () => 'http://127.0.0.1:3000',
        isTauriRuntime: () => false
    }));
    vi.doMock('../../eVe/domains/media/api/video_api_state.js', () => ({
        getIosNativeInvoke: () => null
    }));
    vi.doMock('../../eVe/domains/media/api/video_api_helpers.js', async () => {
        const actual = await vi.importActual('../../eVe/domains/media/api/video_api_helpers.js');
        return { ...actual, ensureProjectMediaAtome };
    });
    vi.doMock('../../eVe/domains/media/api/video_api_persist.js', () => ({
        buildNativeMediaPath: vi.fn(),
        getCurrentUserInfo: vi.fn(async () => ({ ok: true, user: { user_id: 'user_a' } })),
        saveToTauriRecordings: vi.fn(),
        uploadToFastify
    }));
    vi.doMock('../../eVe/domains/media/api/video_api_preview.js', () => ({
        getCameraPreviewState: () => ({ cameraPosition: 'back' })
    }));

    const photo = await import('../../eVe/domains/media/api/video_api_photo.js?photo-metadata');
    const jpegBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
    const result = await photo.persistCapturedPhoto({
        fileName: '../portrait.PNG',
        bytes: jpegBytes,
        mimeType: 'image/jpeg',
        width: 640,
        height: 480
    });

    assert.equal(result.ok, true);
    assert.equal(result.fileName, 'portrait.jpg');
    assert.equal(uploadToFastify.mock.calls.length, 1);
    assert.deepEqual(uploadToFastify.mock.calls[0][0], {
        fileName: 'portrait.jpg',
        bytes: jpegBytes,
        mimeType: 'image/jpeg',
        filePath: 'data/users/user_a/captures/portrait.jpg',
        atomeType: 'image',
        ownerId: 'user_a'
    });
    assert.equal(ensureProjectMediaAtome.mock.calls.length, 1);
    assert.deepEqual(ensureProjectMediaAtome.mock.calls[0][0].result, {
        path: 'data/users/user_a/captures/portrait.jpg',
        file_path: 'data/users/user_a/captures/portrait.jpg',
        width: 640,
        height: 480,
        mime_type: 'image/jpeg',
        container: 'jpeg',
        size_bytes: jpegBytes.byteLength,
        storage_root: 'captures'
    });

    await assert.rejects(
        photo.persistCapturedPhoto({
            fileName: 'invalid.jpg',
            bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
            mimeType: 'image/jpeg',
            width: 1,
            height: 1
        }),
        (error) => error?.code === 'photo_jpeg_invalid'
    );
    assert.equal(uploadToFastify.mock.calls.length, 1);
    assert.equal(ensureProjectMediaAtome.mock.calls.length, 1);
});

test('photo APIs fail when the final project Atome commit fails', async () => {
    const ensureProjectMediaAtome = vi.fn(async () => ({
        ok: false,
        error: 'create_failed'
    }));
    const invoke = vi.fn(async () => ({
        success: true,
        file_name: 'native.jpg',
        file_path: 'data/users/user_a/captures/native.jpg',
        mime_type: 'image/jpeg',
        size_bytes: 512,
        width: 800,
        height: 600
    }));

    vi.doMock('../../eVe/domains/media/api/media_api_shared.js', () => ({
        ensureProjectId: vi.fn(async () => 'project_a'),
        getCloudAuthToken: () => '',
        getFastifyBaseUrl: () => 'http://127.0.0.1:3000',
        isTauriRuntime: () => false
    }));
    vi.doMock('../../eVe/domains/media/api/video_api_state.js', () => ({
        getIosNativeInvoke: () => invoke
    }));
    vi.doMock('../../eVe/domains/media/api/video_api_helpers.js', async () => {
        const actual = await vi.importActual('../../eVe/domains/media/api/video_api_helpers.js');
        return { ...actual, ensureProjectMediaAtome };
    });
    vi.doMock('../../eVe/domains/media/api/video_api_persist.js', () => ({
        buildNativeMediaPath: vi.fn(async ({ fileName }) => ({
            filePath: `data/users/user_a/captures/${fileName}`,
            userId: 'user_a'
        })),
        getCurrentUserInfo: vi.fn(async () => ({ ok: true, user: { user_id: 'user_a' } })),
        saveToTauriRecordings: vi.fn(),
        uploadToFastify: vi.fn(async ({ filePath }) => ({ path: filePath }))
    }));
    vi.doMock('../../eVe/domains/media/api/video_api_preview.js', () => ({
        getCameraPreviewState: () => ({ cameraPosition: 'back' })
    }));

    const photo = await import('../../eVe/domains/media/api/video_api_photo.js?photo-commit-failure');
    assert.equal(photo.buildPhotoFileName({ fileName: '../native.PNG' }), 'native.jpg');
    await assert.rejects(
        photo.capturePhotoNativeIos({ fileName: '../native.PNG' }),
        (error) => error?.code === 'media_atome_create_failed'
    );
    await assert.rejects(
        photo.persistCapturedPhoto({
            fileName: 'browser.png',
            bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]),
            mimeType: 'image/jpeg',
            width: 320,
            height: 240
        }),
        (error) => error?.code === 'media_atome_create_failed'
    );
});

test('Tauri photo persistence keeps the local recordings route explicit', async () => {
    const ensureProjectMediaAtome = vi.fn(async () => ({ ok: true, atomeId: 'image_tauri' }));
    const saveToTauriRecordings = vi.fn(async () => ({
        path: 'data/users/user_a/recordings/tauri.jpg'
    }));

    vi.doMock('../../eVe/domains/media/api/media_api_shared.js', () => ({
        getCloudAuthToken: () => '',
        getFastifyBaseUrl: () => '',
        isTauriRuntime: () => true
    }));
    vi.doMock('../../eVe/domains/media/api/video_api_state.js', () => ({
        getIosNativeInvoke: () => null
    }));
    vi.doMock('../../eVe/domains/media/api/video_api_helpers.js', async () => {
        const actual = await vi.importActual('../../eVe/domains/media/api/video_api_helpers.js');
        return { ...actual, ensureProjectMediaAtome };
    });
    vi.doMock('../../eVe/domains/media/api/video_api_persist.js', () => ({
        buildNativeMediaPath: vi.fn(),
        getCurrentUserInfo: vi.fn(async () => ({ ok: true, user: { user_id: 'user_a' } })),
        saveToTauriRecordings,
        uploadToFastify: vi.fn()
    }));
    vi.doMock('../../eVe/domains/media/api/video_api_preview.js', () => ({
        getCameraPreviewState: () => ({ cameraPosition: 'back' })
    }));

    const photo = await import('../../eVe/domains/media/api/video_api_photo.js?photo-tauri-route');
    const result = await photo.persistCapturedPhoto({
        fileName: 'tauri.png',
        bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]),
        mimeType: 'image/jpeg',
        width: 160,
        height: 120
    });

    assert.equal(result.ok, true);
    assert.equal(saveToTauriRecordings.mock.calls[0][0].fileName, 'tauri.jpg');
    assert.equal(ensureProjectMediaAtome.mock.calls[0][0].result.storage_root, 'recordings');
});

test('capture reserves identity and placement without creating a pending Atome', async () => {
    const commit = vi.fn(async () => ({ ok: true }));
    class ElementStub {}
    const tool = new ElementStub();
    const layer = new ElementStub();
    globalThis.Element = ElementStub;
    globalThis.HTMLElement = ElementStub;
    globalThis.window = {
        innerHeight: 800,
        setTimeout: vi.fn(() => 1),
        Atome: { commit },
        eveToolBase: {
            ensureProjectLayer: () => layer,
            getCurrentProjectId: () => 'project_a'
        }
    };
    globalThis.document = {};

    vi.doMock('../../eVe/domains/media/api/media_persistence_service.js', () => ({
        resolveProjectMediaCreationSize: () => ({ width: 220, height: 140 })
    }));
    vi.doMock('../../eVe/intuition/tools/capture_export_geometry.js', () => ({
        applyCaptureExtractionAnimation: vi.fn(),
        resolveCaptureExportGeometry: () => ({
            initial: { x: 1, y: 2, width: 20, height: 20 },
            final: { x: 30, y: 40, width: 220, height: 140 }
        })
    }));
    vi.doMock('../../eVe/domains/rendering/project_scene_stack_runtime.js', () => ({
        resolveProjectSceneNextStackPosition: (projectId) => ({
            zIndex: projectId === 'project_a' ? 12 : 1,
            z_index: projectId === 'project_a' ? 12 : 1,
            order: 7,
            render_order: 7,
            renderOrder: 7
        })
    }));
    vi.doMock('../../eVe/core/atome_dom_id.js', () => ({
        getAtomeElement: () => tool
    }));

    const { createCaptureRevealRuntime } = await import(
        '../../eVe/intuition/tools/capture_reveal_runtime.js?photo-no-pending'
    );
    const runtime = createCaptureRevealRuntime({
        resolveCaptureSourceTool: () => tool,
        toKey: (value) => String(value || '')
    });
    const photoOptions = await runtime.createPendingCaptureExportOptions('photo', tool);

    assert.equal(commit.mock.calls.length, 0);
    assert.equal(typeof photoOptions.resolvePlacement, 'function');
    assert.deepEqual(photoOptions.resolvePlacement({ projectId: 'project_a' }), {
        left: 30, top: 40, zIndex: 12, z_index: 12, order: 7, render_order: 7, renderOrder: 7
    });

    const audioOptions = await runtime.createPendingCaptureExportOptions(
        'audio',
        tool,
        'audio_recording_reserved'
    );
    const videoOptions = await runtime.createPendingCaptureExportOptions(
        'video',
        tool,
        'video_recording_reserved'
    );

    assert.equal(commit.mock.calls.length, 0);
    assert.equal(audioOptions.projectAtomeId, 'audio_recording_reserved');
    assert.equal(audioOptions.project_atome_id, 'audio_recording_reserved');
    assert.deepEqual(audioOptions.resolvePlacement({ projectId: 'project_a' }), {
        left: 30, top: 40, zIndex: 12, z_index: 12, order: 7, render_order: 7, renderOrder: 7
    });
    assert.equal(videoOptions.projectAtomeId, 'video_recording_reserved');
    assert.equal(videoOptions.project_atome_id, 'video_recording_reserved');
    assert.deepEqual(videoOptions.resolvePlacement({ projectId: 'project_a' }), {
        left: 30, top: 40, zIndex: 12, z_index: 12, order: 7, render_order: 7, renderOrder: 7
    });
});
