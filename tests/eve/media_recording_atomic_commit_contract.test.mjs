import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { afterEach, test, vi } from 'vitest';

const originalWindow = globalThis.window;
const originalFetch = globalThis.fetch;

afterEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    globalThis.window = originalWindow;
    globalThis.fetch = originalFetch;
});

test('durable recording persistence owners never commit or render project Atomes', async () => {
    const [audioStorage, videoPersistence, projectPersistence] = await Promise.all([
        readFile(new URL('../../eVe/domains/media/api/audio_core_storage.js', import.meta.url), 'utf8'),
        readFile(new URL('../../eVe/domains/media/api/video_api_persist.js', import.meta.url), 'utf8'),
        readFile(new URL('../../eVe/domains/media/api/media_persistence_service.js', import.meta.url), 'utf8')
    ]);

    for (const persistenceOwner of [audioStorage, videoPersistence]) {
        assert.doesNotMatch(persistenceOwner, /Atome\?*\.commit/);
        assert.doesNotMatch(persistenceOwner, /renderProjectMediaAtome/);
    }
    assert.doesNotMatch(audioStorage, /createAudioRecordingAtome/);
    assert.doesNotMatch(videoPersistence, /createRecordingAtome/);
    assert.doesNotMatch(projectPersistence, /createPendingProjectMediaAtome/);
    assert.doesNotMatch(projectPersistence, /pendingAtomeId|pending_atome_id/);
});

test('Tauri audio persistence preserves the reserved Atome identity without committing it', async () => {
    const commit = vi.fn();
    const fetchMock = vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
            success: true,
            path: 'data/users/user_a/recordings/take.wav'
        })
    }));
    globalThis.window = { Atome: { commit } };
    vi.stubGlobal('fetch', fetchMock);
    vi.doMock('../../eVe/domains/media/api/media_api_shared.js', () => ({
        buildTauriLocalMediaPath: ({ userId, identifier }) => `data/users/${userId}/recordings/${identifier}`
    }));

    const { createAudioStorage } = await import(
        '../../eVe/domains/media/api/audio_core_storage.js?atomic-audio-persistence'
    );
    const storage = createAudioStorage({
        getLocalAuthToken: () => 'local-token',
        getTauriHttpBaseUrl: () => 'http://127.0.0.1:3000',
        isBrowser: () => true,
        isLocalNativeBackendRuntime: () => true,
        resolveCurrentUser: async () => ({
            ok: true,
            id: 'user_a',
            user: { user_id: 'user_a' }
        })
    });
    const result = await storage.persistRecordingLocally({
        fileName: 'take.wav',
        wavArrayBuffer: new Uint8Array(64).buffer,
        durationSec: 1,
        sampleRate: 48_000,
        channels: 1,
        atomeId: 'audio_recording_reserved'
    });

    assert.equal(result.id, 'audio_recording_reserved');
    assert.equal(result.atomeId, 'audio_recording_reserved');
    assert.equal(result.tauriPath, 'data/users/user_a/recordings/take.wav');
    assert.equal(fetchMock.mock.calls.length, 1);
    assert.equal(commit.mock.calls.length, 0);
});

test('browser video persistence preserves upload and Atome identities without committing', async () => {
    const commit = vi.fn(async () => ({ ok: true }));
    const sendFileMessage = vi.fn(async (_adapter, message) => {
        if (message.action === 'upload-complete') {
            return {
                success: true,
                file_name: message.file_name,
                file_path: message.file_path,
                owner_id: message.user_id
            };
        }
        return { success: true };
    });
    globalThis.window = { Atome: { commit } };

    vi.doMock('../../atome/src/squirrel/apis/unified/adole.js', () => ({
        FastifyAdapter: {},
        TauriAdapter: {}
    }));
    vi.doMock('../../eVe/core/atome_size_policy.js', () => ({
        ATOME_CREATION_MAX_AXIS_PX: 640,
        normalizeAtomeSizeToMaxAxis: ({ width, height }) => ({ width, height })
    }));
    vi.doMock('../../eVe/domains/media/rendering/project_media_atome_renderer.js', () => ({
        normalizeRenderedMediaProperties: (properties) => properties,
        renderProjectMediaAtome: vi.fn()
    }));
    vi.doMock('../../eVe/domains/media/api/media_persistence_service.js', () => ({
        resolveMediaUrl: () => 'http://127.0.0.1/media/take.webm'
    }));
    vi.doMock('../../eVe/domains/media/api/media_api_shared.js', () => ({
        buildTauriLocalMediaPath: ({ userId, identifier }) => `data/users/${userId}/recordings/${identifier}`,
        ensureProjectId: async () => 'project_a',
        getCloudAuthToken: () => '',
        getFastifyBaseUrl: () => 'http://127.0.0.1:3000',
        getLocalAuthToken: () => '',
        getTauriHttpBaseUrl: () => '',
        isLocalNativeBackendRuntime: () => false,
        resolveCurrentUser: async () => ({
            ok: true,
            id: 'user_a',
            user: { user_id: 'user_a' }
        })
    }));
    vi.doMock('../../eVe/domains/media/api/video_api_helpers.js', () => ({
        bytesToBase64: () => 'encoded',
        nowIso: () => '2026-07-19T00:00:00.000Z',
        randomId: () => 'random',
        resolveFastifyRecordingToken: async () => 'cloud-token',
        sendFileMessage,
        toFiniteSize: (value) => Number(value)
    }));

    const { persistRecording } = await import(
        '../../eVe/domains/media/api/video_api_persist.js?atomic-video-persistence'
    );
    const result = await persistRecording({
        fileName: 'take.webm',
        bytes: new Uint8Array([1, 2, 3, 4]),
        mode: 'video',
        mimeType: 'video/webm',
        durationSec: 1.25,
        width: 640,
        height: 360,
        atomeId: 'video_recording_reserved',
        uploadId: 'upload_reserved'
    });

    assert.equal(result.atomeId, 'video_recording_reserved');
    assert.equal(result.file_path, 'data/users/user_a/recordings/take.webm');
    assert.equal(result.size_bytes, 4);
    assert.equal(commit.mock.calls.length, 0);
    const completion = sendFileMessage.mock.calls
        .map(([, message]) => message)
        .find((message) => message.action === 'upload-complete');
    assert.equal(completion.upload_id, 'upload_reserved');
    assert.equal(completion.atome_id, 'video_recording_reserved');
});

test('browser video persistence rejects an acknowledged upload outside the recording storage path', async () => {
    globalThis.window = {};
    vi.doMock('../../atome/src/squirrel/apis/unified/adole.js', () => ({ FastifyAdapter: {}, TauriAdapter: {} }));
    vi.doMock('../../eVe/domains/media/api/media_api_shared.js', () => ({
        buildTauriLocalMediaPath: ({ userId, identifier }) => `data/users/${userId}/recordings/${identifier}`,
        getCloudAuthToken: () => '',
        getFastifyBaseUrl: () => 'http://127.0.0.1:3000',
        getLocalAuthToken: () => '',
        getTauriHttpBaseUrl: () => '',
        isLocalNativeBackendRuntime: () => false,
        resolveCurrentUser: async () => ({ ok: true, id: 'user_a', user: { user_id: 'user_a' } })
    }));
    vi.doMock('../../eVe/domains/media/api/video_api_helpers.js', () => ({
        bytesToBase64: () => 'encoded',
        randomId: () => 'random',
        resolveFastifyRecordingToken: async () => 'cloud-token',
        sendFileMessage: async (_adapter, message) => (
            message.action === 'upload-complete'
                ? { success: true, file_name: message.file_name, file_path: `Downloads/${message.file_name}` }
                : { success: true }
        )
    }));

    const { persistRecording } = await import('../../eVe/domains/media/api/video_api_persist.js?durable-path-required');
    await assert.rejects(
        persistRecording({
            fileName: 'take.webm', bytes: new Uint8Array([1]), mode: 'video', mimeType: 'video/webm'
        }),
        /recording_upload_path_mismatch/
    );
});


test('audio upload uses the storage owner and a failed queue preserves its jobs', async () => {
    const { createAudioStorage } = await import('../../eVe/domains/media/api/audio_core_storage.js');
    const { createAudioRecord } = await import('../../eVe/domains/media/api/audio_core_record.js');
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ success: true, path: 'recordings/take.wav' }) }));
    vi.stubGlobal('fetch', fetchMock);
    const storage = createAudioStorage({ getFastifyBaseUrl: () => 'http://127.0.0.1:3001',
        buildAuthHeaders: headers => ({ ...headers, Authorization: 'Bearer fixture-token' }) });
    const bytes = new Uint8Array([10, 20, 30]);
    await storage.uploadRecordingToFastify('take.wav', bytes.buffer, 'audio/wav', { userId: 'fixture', filePath: 'recordings/take.wav' });
    assert.equal(fetchMock.mock.calls[0][0], 'http://127.0.0.1:3001/api/uploads');
    assert.deepEqual([...fetchMock.mock.calls[0][1].body], [...bytes]);
    assert.equal(fetchMock.mock.calls[0][1].headers['X-File-Path'], 'recordings/take.wav');
    assert.equal(fetchMock.mock.calls[0][1].credentials, 'include');
    const markJobDone = vi.fn();
    fetchMock.mockRejectedValue(new Error('upload_unavailable'));
    const recording = createAudioRecord({ isBrowser: () => true, isOnline: () => true,
        getQueue: () => [{ id: 'queued', fileName: 'take.wav', filePath: 'recordings/take.wav' }],
        idbGet: async () => ({ bytes }), markJobDone,
        uploadRecordingToFastify: storage.uploadRecordingToFastify });
    await assert.rejects(recording.syncQueuedUploads(), /upload_unavailable/);
    assert.equal(markJobDone.mock.calls.length, 0);
});
