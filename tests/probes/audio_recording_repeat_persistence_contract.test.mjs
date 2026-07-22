import assert from 'node:assert/strict';
import { afterEach, test, vi } from 'vitest';

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.resetModules();
});

test('Tauri audio persists two successive viable terminals through Atome.commit', async () => {
    const commits = [];
    let take = 0;
    const listeners = new Map();
    const storage = new Map();
    const windowRef = {
        __TAURI_INTERNALS__: {
            invoke: vi.fn(async (command, payload = {}) => {
                if (command === 'audio_record_start') return { success: true, session_id: payload.sessionId };
                if (command === 'audio_record_stop') {
                    take += 1;
                    return {
                        success: true,
                        session_id: payload.sessionId,
                        absolute_file_path: `/tmp/flower_take_${take}.wav`,
                        duration_sec: 1,
                        frame_count: 48_000,
                        sample_rate: 48_000,
                        channels: 1,
                        size_bytes: 96_044
                    };
                }
                if (command === 'audio_get_scope') return { available: false };
                throw new Error(`unexpected_tauri_command:${command}`);
            })
        },
        __currentUser: { id: 'local' },
        __currentProject: { id: 'project_flower_audio' },
        location: { protocol: 'tauri:' },
        localStorage: {
            getItem: (key) => storage.get(key) || null,
            setItem: (key, value) => storage.set(key, String(value)),
            removeItem: (key) => storage.delete(key)
        },
        addEventListener: (type, listener) => listeners.set(type, listener),
        removeEventListener: (type) => listeners.delete(type),
        dispatchEvent: () => true,
        setTimeout,
        clearTimeout,
        AtomeCommandBus: { dispatch: vi.fn(() => ({ ok: true })) },
        Atome: {
            commit: vi.fn(async (mutation) => {
                commits.push(mutation);
                return { ok: true };
            })
        },
    };
    vi.stubGlobal('window', windowRef);
    vi.stubGlobal('document', {});
    vi.stubGlobal('localStorage', windowRef.localStorage);
    await import('../../atome/src/application/audio_runtime/record_audio_api.js?tauri-repeat-contract');
    const { startAudioRecording, stopAudioRecording, getAudioRecordingState } = await import(
        '../../eVe/domains/media/api/audio_api.js?tauri-repeat-flower-audio'
    );

    for (const fileName of ['flower_take_one.wav', 'flower_take_two.wav']) {
        const started = await startAudioRecording({ fileName, source: 'mic' });
        assert.equal(started.ok, true, JSON.stringify(started));
        const stopped = await stopAudioRecording();
        assert.equal(stopped.ok, true, JSON.stringify(stopped));
        assert.equal(stopped.status, 'stopped');
        assert.equal(stopped.project.atomeId, started.projectAtomeId);
        assert.equal(getAudioRecordingState().isRecording, false);
    }

    assert.equal(commits.length, 2);
    assert.notEqual(commits[0].atome_id, commits[1].atome_id);
    commits.forEach((mutation) => {
        assert.equal(mutation.kind, 'set');
        assert.equal(mutation.project_id, 'project_flower_audio');
        assert.equal(mutation.props.kind, 'audio_recording');
        assert.equal(mutation.props.frame_count, 48_000);
        assert.equal(mutation.props.size_bytes, 96_044);
    });
}, 15_000);
