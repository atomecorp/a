import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { afterEach, test, vi } from 'vitest';

const installNativeBridge = (invoke) => {
    vi.stubGlobal('window', {
        innerWidth: 390,
        innerHeight: 844,
        setTimeout,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn()
    });
    vi.doMock('../../eVe/domains/media/api/video_api_state.js', () => ({
        getIosNativeInvoke: () => invoke
    }));
    vi.doMock('../../eVe/domains/media/api/video_api_preview.js', () => ({
        getCameraPreviewState: () => ({ cameraPosition: 'back' })
    }));
    vi.doMock('../../eVe/domains/media/api/video_api_persist.js', () => ({
        buildNativeMediaPath: vi.fn(async ({ fileName }) => ({
            userId: 'test',
            filePath: `data/users/test/recordings/${fileName}`
        }))
    }));
};

afterEach(() => {
    vi.useRealTimers();
    vi.resetModules();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

test('native reload/retry keeps a stable project id and defers ACK until durable commit', async () => {
    const calls = [];
    let stateReads = 0;
    let ackAttempts = 0;
    const invoke = vi.fn(async (command, payload) => {
        calls.push({ command, payload });
        if (command === 'media_video_record_state') {
            stateReads += 1;
            return {
                success: true,
                status: stateReads === 1 ? 'recording' : 'completed',
                recoverable: true,
                file_name: 'recovered.mov',
                file_path: 'data/users/test/recordings/recovered.mov',
                project_atome_id: 'video_recording_stable_123',
                camera_position: 'back',
                expects_audio: false
            };
        }
        if (command === 'media_video_record_stop') {
            return {
                success: true,
                file_name: 'recovered.mov',
                file_path: 'data/users/test/recordings/recovered.mov',
                project_atome_id: 'video_recording_stable_123',
                duration_sec: 2.5,
                size_bytes: 8192,
                width: 1280,
                height: 720,
                video_track_count: 1,
                audio_track_count: 0,
                is_readable: true,
                is_playable: true
            };
        }
        if (command === 'media_video_record_ack') {
            ackAttempts += 1;
            if (ackAttempts === 1) throw new Error('temporary_ack_response_loss');
            return { success: true, status: 'acknowledged' };
        }
        if (command === 'media_video_record_cancel') return { success: true, discarded: true, terminal: true };
        throw new Error(`unexpected_native_command:${command}`);
    });
    installNativeBridge(invoke);

    const { recordVideoNativeIos } = await import(
        '../../eVe/domains/media/api/video_api_record_native.js?native-recovery-idempotence'
    );
    const controller = await recordVideoNativeIos('new.mov', null, { audio: false });

    assert.equal(controller.recovered, true);
    assert.equal(controller.fileName, 'recovered.mov');
    assert.equal(controller.projectAtomeId, 'video_recording_stable_123');
    assert.equal(calls.some(({ command }) => command === 'media_video_record_start'), false);

    const firstStop = controller.stop({ force: true });
    const concurrentStop = controller.stop({ force: true });
    assert.equal(firstStop, concurrentStop);
    const stopped = await firstStop;
    const repeatedStop = await controller.stop({ force: true });

    assert.equal(stopped.ok, true);
    assert.equal(repeatedStop, stopped);
    assert.equal(calls.filter(({ command }) => command === 'media_video_record_stop').length, 1);
    assert.equal(calls.filter(({ command }) => command === 'media_video_record_ack').length, 0);
    assert.equal(stopped.project_atome_id, 'video_recording_stable_123');
    assert.equal(stopped.native_ack_required, true);

    // A failed project association performs no ACK. A reloaded WebView can recover
    // the same native terminal result and reuse the same deterministic Atome id.
    const reloaded = await recordVideoNativeIos('ignored.mov', null, { audio: false });
    const recoveredAfterReload = await reloaded.stop({ force: true });
    assert.equal(recoveredAfterReload.project_atome_id, 'video_recording_stable_123');
    assert.equal(calls.filter(({ command }) => command === 'media_video_record_ack').length, 0);

    const lastStopIndex = calls.findLastIndex(({ command }) => command === 'media_video_record_stop');
    await assert.rejects(reloaded.acknowledge(), /temporary_ack_response_loss/);
    const firstAckIndex = calls.findIndex(({ command }) => command === 'media_video_record_ack');
    assert.ok(firstAckIndex > lastStopIndex);
    const acknowledged = await reloaded.acknowledge();
    const repeatedAcknowledge = await reloaded.acknowledge();
    assert.equal(acknowledged.success, true);
    assert.equal(repeatedAcknowledge, acknowledged);
    assert.equal(calls.filter(({ command }) => command === 'media_video_record_ack').length, 2);
    assert.deepEqual(
        calls.filter(({ command }) => command === 'media_video_record_ack').map(({ payload }) => payload),
        [
            { projectAtomeId: 'video_recording_stable_123' },
            { projectAtomeId: 'video_recording_stable_123' }
        ]
    );
}, 30_000);

test('native start timeout is bounded and requests cancellation', async () => {
    vi.useFakeTimers();
    const calls = [];
    const never = new Promise(() => {});
    const invoke = vi.fn((command, payload) => {
        calls.push({ command, payload });
        if (command === 'media_video_record_state') {
            return Promise.resolve({ success: true, status: 'idle', recoverable: false });
        }
        if (command === 'media_video_record_start') return never;
        if (command === 'media_video_record_cancel') {
            return Promise.resolve({ success: true, discarded: true, terminal: true });
        }
        return Promise.reject(new Error(`unexpected_native_command:${command}`));
    });
    installNativeBridge(invoke);

    const { recordVideoNativeIos } = await import(
        '../../eVe/domains/media/api/video_api_record_native.js?native-start-watchdog'
    );
    const pending = recordVideoNativeIos(
        'timeout.mov',
        'data/users/test/recordings/timeout.mov',
        { audio: false }
    ).catch((error) => error);

    await vi.advanceTimersByTimeAsync(1);
    await vi.advanceTimersByTimeAsync(40001);
    const error = await pending;

    assert.equal(error.code, 'native_video_command_timeout:media_video_record_start');
    assert.equal(calls.filter(({ command }) => command === 'media_video_record_start').length, 1);
    assert.equal(calls.filter(({ command }) => command === 'media_video_record_cancel').length, 1);
});

test('lost ACK response preserves the committed media and permits a new recording', async () => {
    const calls = [];
    let nativeAcknowledged = false;
    const invoke = vi.fn(async (command, payload) => {
        calls.push({ command, payload });
        if (command === 'media_video_record_state') {
            return nativeAcknowledged
                ? { success: true, status: 'idle', recoverable: false }
                : {
                    success: true,
                    status: 'completed',
                    recoverable: true,
                    file_name: 'committed.mov',
                    file_path: 'data/users/test/recordings/committed.mov',
                    project_atome_id: 'video_recording_committed'
                };
        }
        if (command === 'media_video_record_stop') {
            return {
                success: true,
                file_name: 'committed.mov',
                file_path: 'data/users/test/recordings/committed.mov',
                project_atome_id: 'video_recording_committed',
                duration_sec: 1.25,
                size_bytes: 8192,
                width: 1280,
                height: 720,
                video_track_count: 1,
                audio_track_count: 0,
                is_readable: true,
                is_playable: true
            };
        }
        if (command === 'media_video_record_ack') {
            nativeAcknowledged = true;
            throw new Error('native_ack_response_lost');
        }
        if (command === 'media_video_record_start') {
            return {
                success: true,
                file_name: 'next.mov',
                file_path: 'data/users/test/recordings/next.mov',
                project_atome_id: 'video_recording_next'
            };
        }
        throw new Error(`unexpected_native_command:${command}`);
    });
    installNativeBridge(invoke);

    const { recordVideoNativeIos } = await import(
        '../../eVe/domains/media/api/video_api_record_native.js?native-lost-ack-response'
    );
    const recovered = await recordVideoNativeIos('ignored.mov', null, { audio: false });
    const committedResult = await recovered.stop({ force: true });
    await assert.rejects(recovered.acknowledge(), /native_ack_response_lost/);
    await assert.rejects(
        recovered.stop({ force: true, discard: true }),
        /video_recording_discard_after_persistence_unsupported/
    );

    const next = await recordVideoNativeIos('next.mov', null, { audio: false });
    assert.equal(committedResult.file_path, 'data/users/test/recordings/committed.mov');
    assert.equal(committedResult.project_atome_id, 'video_recording_committed');
    assert.equal(next.recovered, false);
    assert.equal(next.projectAtomeId, 'video_recording_next');
    assert.equal(calls.some(({ command }) => command === 'media_video_record_cancel'), false);
});

test('an ignored early discard does not contaminate the later normal stop', async () => {
    const calls = [];
    const invoke = vi.fn(async (command, payload) => {
        calls.push({ command, payload });
        if (command === 'media_video_record_state') {
            return { success: true, status: 'idle', recoverable: false };
        }
        if (command === 'media_video_record_start') {
            return {
                success: true,
                file_name: 'early.mov',
                file_path: 'data/users/test/recordings/early.mov',
                project_atome_id: 'video_recording_early'
            };
        }
        if (command === 'media_video_record_stop') {
            return {
                success: true,
                file_name: 'early.mov',
                file_path: 'data/users/test/recordings/early.mov',
                project_atome_id: 'video_recording_early',
                duration_sec: 1,
                size_bytes: 8192,
                width: 1280,
                height: 720,
                video_track_count: 1,
                audio_track_count: 0,
                is_readable: true,
                is_playable: true
            };
        }
        if (command === 'media_video_record_cancel') {
            return { success: true, discarded: true, terminal: true };
        }
        throw new Error(`unexpected_native_command:${command}`);
    });
    installNativeBridge(invoke);

    const { recordVideoNativeIos } = await import(
        '../../eVe/domains/media/api/video_api_record_native.js?native-early-discard'
    );
    const controller = await recordVideoNativeIos('early.mov', null, { audio: false });
    await assert.rejects(
        controller.stop({ discard: true }),
        /ios_video_record_stop_ignored_too_early/
    );
    const stopped = await controller.stop({ force: true });

    assert.equal(stopped.ok, true);
    assert.equal(stopped.discarded, undefined);
    assert.equal(calls.filter(({ command }) => command === 'media_video_record_stop').length, 1);
    assert.equal(calls.filter(({ command }) => command === 'media_video_record_cancel').length, 0);
});

test('native discard remains retryable until file deletion is explicitly confirmed', async () => {
    let cancelAttempts = 0;
    const invoke = vi.fn(async (command) => {
        if (command === 'media_video_record_state') {
            return { success: true, status: 'idle', recoverable: false };
        }
        if (command === 'media_video_record_start') {
            return {
                success: true,
                file_name: 'discard.mov',
                file_path: 'data/users/test/recordings/discard.mov',
                project_atome_id: 'video_recording_discard'
            };
        }
        if (command === 'media_video_record_cancel') {
            cancelAttempts += 1;
            return cancelAttempts === 1
                ? { success: true, discarded: false }
                : { success: true, discarded: true, terminal: true };
        }
        throw new Error(`unexpected_native_command:${command}`);
    });
    installNativeBridge(invoke);

    const { recordVideoNativeIos } = await import(
        '../../eVe/domains/media/api/video_api_record_native.js?native-discard-confirmation'
    );
    const controller = await recordVideoNativeIos('discard.mov', null, { audio: false });

    await assert.rejects(
        controller.stop({ force: true, discard: true }),
        /ios_video_record_discard_failed/
    );
    const discarded = await controller.stop({ force: true, discard: true });

    assert.equal(discarded.discarded, true);
    assert.equal(cancelAttempts, 2);
});

test('native stop rejects a project identity substitution before touching the recorder', async () => {
    const calls = [];
    const invoke = vi.fn(async (command, payload) => {
        calls.push({ command, payload });
        if (command === 'media_video_record_state') {
            return { success: true, status: 'idle', recoverable: false };
        }
        if (command === 'media_video_record_start') {
            return {
                success: true,
                file_name: 'identity.mov',
                file_path: 'data/users/test/recordings/identity.mov',
                project_atome_id: 'video_recording_identity'
            };
        }
        if (command === 'media_video_record_stop') {
            return {
                success: true,
                file_name: 'identity.mov',
                file_path: 'data/users/test/recordings/identity.mov',
                project_atome_id: 'video_recording_identity',
                duration_sec: 1,
                size_bytes: 8192,
                width: 1280,
                height: 720,
                video_track_count: 1,
                audio_track_count: 0,
                is_readable: true,
                is_playable: true
            };
        }
        throw new Error(`unexpected_native_command:${command}`);
    });
    installNativeBridge(invoke);

    const { recordVideoNativeIos } = await import(
        '../../eVe/domains/media/api/video_api_record_native.js?native-project-identity'
    );
    const controller = await recordVideoNativeIos('identity.mov', null, { audio: false });

    await assert.rejects(
        controller.stop({ force: true, projectAtomeId: 'video_recording_other' }),
        /video_recording_project_identity_mismatch/
    );
    const stopped = await controller.stop({
        force: true,
        projectAtomeId: 'video_recording_identity'
    });

    assert.equal(stopped.project_atome_id, 'video_recording_identity');
    assert.equal(calls.filter(({ command }) => command === 'media_video_record_stop').length, 1);
});

test('native video terminal without a playable video track never acknowledges persistence', async () => {
    const calls = [];
    const invoke = vi.fn(async (command) => {
        calls.push(command);
        if (command === 'media_video_record_state') return { success: true, status: 'idle', recoverable: false };
        if (command === 'media_video_record_start') {
            return { success: true, file_name: 'empty.mov', file_path: 'data/users/test/recordings/empty.mov' };
        }
        if (command === 'media_video_record_stop') {
            return {
                success: true, file_name: 'empty.mov', file_path: 'data/users/test/recordings/empty.mov',
                duration_sec: 0, size_bytes: 0, width: 0, height: 0,
                video_track_count: 0, audio_track_count: 0, is_readable: false, is_playable: false
            };
        }
        throw new Error(`unexpected_native_command:${command}`);
    });
    installNativeBridge(invoke);
    const { recordVideoNativeIos } = await import(
        '../../eVe/domains/media/api/video_api_record_native.js?native-viability-invalid'
    );
    const controller = await recordVideoNativeIos('empty.mov', null, { audio: false });

    await assert.rejects(controller.stop({ force: true }), /ios_video_recording_viability_invalid/);
    await assert.rejects(controller.acknowledge(), /native_video_record_ack_before_stop/);
    assert.equal(calls.includes('media_video_record_ack'), false);
});

test('native exact-video request fails before state or camera bridge access', async () => {
    const invoke = vi.fn();
    installNativeBridge(invoke);
    const { recordVideoNativeIos } = await import(
        '../../eVe/domains/media/api/video_api_record_native.js?native-exact-fail-closed'
    );

    const error = await recordVideoNativeIos('exact.mov', null, {
        options: { requireSampleAccurate: true }
    }).catch((reason) => reason);

    assert.equal(error.code, 'av_sample_accurate_overdub_unsupported');
    assert.equal(invoke.mock.calls.length, 0);
});

test('Swift native recorder exposes serialized recovery and bounded lifecycle contracts', async () => {
    const controller = await readFile(new URL(
        '../../platforms/ios/atome-auv3/Common/AppNativeMediaCaptureController.swift',
        import.meta.url
    ), 'utf8');
    const recorder = await readFile(new URL(
        '../../platforms/ios/atome-auv3/Common/AppNativeVideoRecorder.swift',
        import.meta.url
    ), 'utf8');
    const lifecycle = await readFile(new URL(
        '../../platforms/ios/atome-auv3/Common/AppNativeVideoRecorderLifecycle.swift',
        import.meta.url
    ), 'utf8');
    const terminal = await readFile(new URL(
        '../../platforms/ios/atome-auv3/Common/AppNativeVideoRecorderTerminal.swift',
        import.meta.url
    ), 'utf8');

    assert.match(controller, /media_video_record_state/);
    assert.match(controller, /media_video_record_cancel/);
    assert.match(controller, /media_video_record_ack/);
    assert.match(recorder, /var stopCompletions: \[Completion\]/);
    assert.match(recorder, /guard output === self\.movieOutput else \{ return \}/);
    assert.match(lifecycle, /stopCompletions\.append\(completion\)/);
    assert.match(lifecycle, /scheduleStartWatchdog/);
    assert.match(lifecycle, /scheduleStopWatchdog/);
    assert.match(recorder, /video_recording_recovery_required/);
    assert.match(recorder, /project_atome_id/);
    assert.match(terminal, /video_recording_cleanup_failed/);
    assert.match(terminal, /project_atome_id/);
});
