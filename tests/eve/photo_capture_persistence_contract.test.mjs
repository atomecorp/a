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
        isLocalNativeBackendRuntime: () => false
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
        isLocalNativeBackendRuntime: () => false
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
        isLocalNativeBackendRuntime: () => true
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

