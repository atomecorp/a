import assert from 'node:assert/strict';
import { afterEach, test, vi } from 'vitest';

afterEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

test('public native stop acknowledges only after a durable idempotent project association', async () => {
    const order = [];
    let acknowledgeAttempts = 0;
    const terminal = {
        ok: true,
        fileName: 'stable.mov',
        file_path: 'data/users/test/recordings/stable.mov',
        project_atome_id: 'video_recording_stable_public',
        duration_sec: 1.5,
        native_ack_required: true
    };
    const controller = {
        stream: null,
        stop: vi.fn(async () => {
            order.push('stop');
            return terminal;
        }),
        acknowledge: vi.fn(async () => {
            order.push('ack');
            acknowledgeAttempts += 1;
            if (acknowledgeAttempts === 1) throw new Error('native_ack_response_lost');
            return { success: true, status: 'already_acknowledged' };
        })
    };
    const ensureProjectMediaAtome = vi.fn(async ({ result }) => {
        order.push('project');
        assert.equal(result.project_atome_id, 'video_recording_stable_public');
        return {
            ok: true,
            atomeId: 'video_recording_stable_public',
            reused: ensureProjectMediaAtome.mock.calls.length > 1
        };
    });

    vi.stubGlobal('window', { setTimeout, dispatchEvent: vi.fn() });
    vi.stubGlobal('document', {});
    const stateModule = await import('../../eVe/domains/media/api/video_api_state.js');
    stateModule.videoState.ctrl = controller;
    stateModule.videoState.fileName = 'stable.mov';
    stateModule.videoState.pending = false;
    stateModule.videoState.stream = null;

    vi.doMock('../../eVe/domains/media/api/video_api_helpers.js', () => ({
        buildConstraints: () => ({}),
        getUserMediaWithTimeout: vi.fn(),
        pickSupportedMime: () => 'video/webm',
        extForMime: () => 'webm',
        sanitizeFileName: (value) => String(value || 'video.webm'),
        isMediaStream: () => false,
        normalizeMode: (value) => value || 'video',
        isBrowser: () => true,
        ensureProjectMediaAtome,
        toErrorMessage: (error) => String(error?.message || error)
    }));
    vi.doMock('../../eVe/domains/media/api/media_api_shared.js', () => ({
        isTauriRuntime: () => false
    }));
    vi.doMock('../../eVe/domains/media/api/video_api_persist.js', () => ({
        persistRecording: vi.fn()
    }));
    vi.doMock('../../eVe/domains/media/api/video_api_record_native.js', () => ({
        recordVideoNativeIos: vi.fn()
    }));

    const { getVideoRecordingState, stopVideoRecording } = await import(
        '../../eVe/domains/media/api/video_api_record.js?public-native-commit-ack'
    );

    const first = await stopVideoRecording({ force: true });
    assert.equal(first.ok, false);
    assert.equal(first.error, 'native_ack_response_lost');
    assert.equal(getVideoRecordingState().isRecording, true);
    assert.deepEqual(order, ['stop', 'project', 'ack']);

    const second = await stopVideoRecording({ force: true });
    assert.equal(second.ok, true);
    assert.equal(second.project.atomeId, 'video_recording_stable_public');
    assert.equal(second.result.native_ack_required, false);
    assert.equal(getVideoRecordingState().isRecording, false);
    assert.deepEqual(order, ['stop', 'project', 'ack', 'stop', 'project', 'ack']);
    assert.equal(controller.stop.mock.calls.length, 2);
    assert.equal(controller.acknowledge.mock.calls.length, 2);
    assert.equal(ensureProjectMediaAtome.mock.calls.length, 2);
}, 15_000);
