import assert from 'node:assert/strict';
import test from 'node:test';

import { installMockBrowserEnv } from '../strangler_v2/_env.mjs';

test('the product Molecule adapter reuses the audio controller and locks the AUv3 start epoch', async () => {
    const originalSetInterval = globalThis.setInterval;
    globalThis.setInterval = (...args) => {
        const timer = originalSetInterval(...args);
        timer?.unref?.();
        return timer;
    };
    const { window } = installMockBrowserEnv();
    window.__HOST_ENV = 'auv3';
    window.webkit = { messageHandlers: { swiftBridge: {} } };
    const module = await import('../../eVe/domains/media/api/audio_api.js');
    const calls = [];
    window.record_audio = async (fileName, path, options) => {
        calls.push({ phase: 'start', fileName, path, options });
        return {
            fileName,
            state: 'recording',
            getStats: () => ({
                session_id: 'adapter_capture_1',
                clock_id: 'auv3.render',
                clock_epoch: 'auv3_epoch_1',
                clock_reference: 'record_start_render_quantum',
                timeline_clock_id: 'auv3.host_transport',
                timeline_origin_frame: 24128,
                recording_start_frame: 8192,
                sample_rate: 48000
            }),
            stop: async (stopOptions) => {
                calls.push({ phase: 'stop', stopOptions });
                return { success: true, discarded: true };
            }
        };
    };
    const adapter = module.createMoleculeRecordingCaptureAdapter(window);
    const request = {
        media_kind: 'audio',
        source: 'plugin_input',
        clock_id: 'auv3.render',
        clock_reference: 'record_start_render_quantum',
        timeline_clock_id: 'auv3.host_transport',
        timeline_start_frame: 24000,
        timeline_sample_rate: 48000,
        require_sample_accurate: true
    };

    try {
        const capability = await adapter.resolveSampleAccurateCapability(request);
        assert.equal(capability.supported, true);
        assert.equal(capability.timeline_clock_id, 'auv3.host_transport');

        const started = await adapter.startCapture(request);
        const projectAtomeId = started.project_atome_id;
        assert.match(projectAtomeId, /^audio_recording_/);
        assert.equal(started.projectAtomeId, projectAtomeId);
        assert.deepEqual(started, {
            capture_id: 'adapter_capture_1',
            projectAtomeId,
            project_atome_id: projectAtomeId,
            clock_id: 'auv3.render',
            clock_epoch: 'auv3_epoch_1',
            clock_reference: 'record_start_render_quantum',
            timeline_clock_id: 'auv3.host_transport',
            timeline_origin_frame: 24128,
            recording_start_frame: 8192
        });
        assert.equal(calls[0].options.require_sample_accurate, true);
        assert.equal(calls[0].options.timeline_start_frame, 24000);
        assert.equal(calls[0].options.clock_reference, 'record_start_render_quantum');
        assert.equal(calls[0].options.sampleRate, 48000);
        assert.equal(calls[0].options.projectAtomeId, projectAtomeId);
        assert.deepEqual(await adapter.cancelCapture('adapter_capture_1'), { ok: true, canceled: true });
        assert.equal(calls[1].stopOptions.discard, true);
        assert.equal(calls[1].stopOptions.projectAtomeId, projectAtomeId);

        const videoCapability = await adapter.resolveSampleAccurateCapability({
            ...request,
            media_kind: 'video',
            source: 'video'
        });
        assert.equal(videoCapability.supported, false);
        assert.equal(videoCapability.reason, 'media_clock_mapping_unavailable');
    } finally {
        globalThis.setInterval = originalSetInterval;
    }
});

test('audio recording keeps one project Atome identity across stop retries', async () => {
    const originalSetInterval = globalThis.setInterval;
    globalThis.setInterval = (...args) => {
        const timer = originalSetInterval(...args);
        timer?.unref?.();
        return timer;
    };
    const { window } = installMockBrowserEnv();
    const module = await import('../../eVe/domains/media/api/audio_api.js');
    const calls = [];
    window.record_audio = async (fileName, path, options) => {
        calls.push({ phase: 'start', fileName, path, options });
        return {
            fileName,
            stop: async (stopOptions) => {
                calls.push({ phase: 'stop', stopOptions });
                return stopOptions?.discard === true
                    ? { success: true, discarded: true }
                    : { success: true, fileName, file_path: '/tmp/stable_audio.wav' };
            }
        };
    };

    try {
        const started = await module.startAudioRecording({ fileName: 'stable_audio.wav' });
        assert.equal(started.ok, true);
        assert.match(started.project_atome_id, /^audio_recording_/);
        assert.equal(started.projectAtomeId, started.project_atome_id);
        assert.equal(module.getAudioRecordingState().projectAtomeId, started.project_atome_id);
        assert.equal(calls[0].options.projectAtomeId, started.project_atome_id);

        const mismatch = await module.stopAudioRecording({ projectAtomeId: 'audio_recording_other' });
        assert.equal(mismatch.error, 'audio_recording_project_identity_mismatch');
        assert.equal(calls.filter((call) => call.phase === 'stop').length, 0);

        const first = await module.stopAudioRecording();
        const second = await module.stopAudioRecording();
        assert.equal(first.error, 'atomes_api_unavailable');
        assert.equal(first.code, 'media_atome_create_failed');
        assert.equal(second.error, 'atomes_api_unavailable');
        assert.equal(second.code, 'media_atome_create_failed');
        const stopCalls = calls.filter((call) => call.phase === 'stop');
        assert.equal(stopCalls.length, 2);
        assert.equal(stopCalls[0].stopOptions.projectAtomeId, started.project_atome_id);
        assert.equal(stopCalls[1].stopOptions.projectAtomeId, started.project_atome_id);
        assert.equal(module.getAudioRecordingState().projectAtomeId, started.project_atome_id);

        const discarded = await module.stopAudioRecording({ discard: true });
        assert.equal(discarded.discarded, true);
        assert.equal(calls.at(-1).stopOptions.projectAtomeId, started.project_atome_id);
        assert.equal(module.getAudioRecordingState().projectAtomeId, null);
    } finally {
        if (module.getAudioRecordingState().isRecording) {
            await module.stopAudioRecording({ discard: true }).catch(() => {});
        }
        globalThis.setInterval = originalSetInterval;
    }
});

test('the Molecule adapter owns its take, retains failed cancellation, and discards a timed-out exact start', async () => {
    const originalSetInterval = globalThis.setInterval;
    globalThis.setInterval = (...args) => {
        const timer = originalSetInterval(...args);
        timer?.unref?.();
        return timer;
    };
    const { window } = installMockBrowserEnv();
    window.__AUV3_MODE__ = true;
    window.webkit = { messageHandlers: { swiftBridge: {} } };
    const module = await import('../../eVe/domains/media/api/audio_api.js');
    const request = {
        media_kind: 'audio', source: 'plugin_input', clock_id: 'auv3.render',
        clock_reference: 'record_start_render_quantum', timeline_clock_id: 'auv3.host_transport',
        timeline_start_frame: 48000, timeline_sample_rate: 48000,
        require_sample_accurate: true, session_id: 'owned_capture'
    };
    let stopCalls = 0;
    window.record_audio = async (fileName) => ({
        fileName,
        getStats: () => ({
            session_id: 'owned_capture', source: 'plugin_input', clock_id: 'auv3.render',
            clock_epoch: 'owned_epoch', clock_reference: 'record_start_render_quantum',
            timeline_clock_id: 'auv3.host_transport', timeline_origin_frame: 48000,
            recording_start_frame: 1000, sample_rate: 48000
        }),
        stop: async () => {
            stopCalls += 1;
            if (stopCalls === 1) throw new Error('transient_native_stop_failure');
            return { success: true, discarded: true };
        }
    });
    try {
        const adapter = module.createMoleculeRecordingCaptureAdapter(window);
        await adapter.startCapture(request);
        const foreignStop = await module.stopAudioRecording({ discard: true });
        assert.equal(foreignStop.error, 'audio_recording_owner_mismatch');
        await assert.rejects(adapter.cancelCapture('owned_capture'), /transient_native_stop_failure/);
        assert.equal(module.getAudioRecordingState().isRecording, true);
        assert.deepEqual(await adapter.cancelCapture('owned_capture'), { ok: true, canceled: true });
        assert.equal(stopCalls, 2);

        let invalidCleanupCalls = 0;
        window.record_audio = async (fileName) => ({
            fileName,
            getStats: () => ({
                session_id: 'invalid_start_capture', clock_id: 'auv3.render', clock_epoch: '',
                clock_reference: 'record_start_render_quantum', timeline_clock_id: 'auv3.host_transport',
                timeline_origin_frame: 48000, sample_rate: 48000
            }),
            stop: async () => {
                invalidCleanupCalls += 1;
                if (invalidCleanupCalls === 1) throw new Error('invalid_start_cleanup_failed');
                return { success: true, discarded: true };
            }
        });
        const invalidAdapter = module.createMoleculeRecordingCaptureAdapter(window);
        await assert.rejects(
            invalidAdapter.startCapture({ ...request, session_id: 'invalid_start_capture' }),
            (error) => error.detail?.capture_id === 'invalid_start_capture'
        );
        assert.equal(module.getAudioRecordingState().isRecording, true);
        assert.deepEqual(
            await invalidAdapter.cancelCapture('invalid_start_capture'),
            { ok: true, canceled: true }
        );
        assert.equal(invalidCleanupCalls, 2);

        let terminalStops = 0;
        window.record_audio = async (fileName) => ({
            fileName,
            getStats: () => ({
                session_id: 'terminal_capture', source: 'plugin_input', clock_id: 'auv3.render',
                clock_epoch: 'terminal_epoch', clock_reference: 'record_start_render_quantum',
                timeline_clock_id: 'auv3.host_transport', timeline_origin_frame: 48000,
                recording_start_frame: 1000, sample_rate: 48000
            }),
            stop: async (options) => {
                terminalStops += 1;
                if (options?.discard === true) return { success: true, discarded: true };
                const error = new Error('av_recording_discontinuity');
                error.code = 'av_recording_discontinuity';
                error.recordingTerminal = true;
                throw error;
            }
        });
        const terminalAdapter = module.createMoleculeRecordingCaptureAdapter(window);
        await terminalAdapter.startCapture({ ...request, session_id: 'terminal_capture' });
        await assert.rejects(
            terminalAdapter.finishCapture('terminal_capture', request),
            (error) => error.recordingTerminal === true
        );
        assert.equal(terminalStops, 2);
        assert.equal(module.getAudioRecordingState().isRecording, false);
        assert.deepEqual(
            await terminalAdapter.cancelCapture('terminal_capture'),
            { ok: true, canceled: false }
        );

        let pendingCleanupStops = 0;
        window.record_audio = async (fileName) => ({
            fileName,
            getStats: () => ({
                session_id: 'cleanup_pending_capture', source: 'plugin_input', clock_id: 'auv3.render',
                clock_epoch: 'cleanup_epoch', clock_reference: 'record_start_render_quantum',
                timeline_clock_id: 'auv3.host_transport', timeline_origin_frame: 48000,
                recording_start_frame: 1000, sample_rate: 48000
            }),
            stop: async (options) => {
                pendingCleanupStops += 1;
                if (options?.discard !== true) {
                    const error = new Error('av_recording_discontinuity');
                    error.code = 'av_recording_discontinuity';
                    error.recordingTerminal = true;
                    throw error;
                }
                if (pendingCleanupStops === 2) throw new Error('physical_delete_failed');
                return { success: true, discarded: true };
            }
        });
        const pendingCleanupAdapter = module.createMoleculeRecordingCaptureAdapter(window);
        await pendingCleanupAdapter.startCapture({ ...request, session_id: 'cleanup_pending_capture' });
        await assert.rejects(
            pendingCleanupAdapter.finishCapture('cleanup_pending_capture', request),
            (error) => error.recordingTerminal !== true && error.detail?.cleanup_error === 'physical_delete_failed'
        );
        assert.equal(module.getAudioRecordingState().isRecording, true);
        assert.deepEqual(
            await pendingCleanupAdapter.cancelCapture('cleanup_pending_capture'),
            { ok: true, canceled: true }
        );
        assert.equal(pendingCleanupStops, 3);
        assert.equal(module.getAudioRecordingState().isRecording, false);

        const nativeStops = [];
        Object.defineProperty(window, '__SQUIRREL_PLAY_RECORD_CORE__', {
            value: { recordStop: async (sessionId) => nativeStops.push(sessionId) },
            configurable: true
        });
        window.record_audio = () => new Promise(() => {});
        const timedAdapter = module.createMoleculeRecordingCaptureAdapter(window);
        await assert.rejects(
            timedAdapter.startCapture({ ...request, session_id: 'timed_capture', timeoutMs: 5 }),
            (error) => error.code === 'audio_recording_start_timeout'
        );
        assert.deepEqual(nativeStops, ['timed_capture']);
        assert.equal(module.getAudioRecordingState().isRecording, false);
    } finally {
        globalThis.setInterval = originalSetInterval;
    }
});
