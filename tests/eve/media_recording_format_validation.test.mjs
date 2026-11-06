import assert from 'node:assert/strict';
import { test } from 'vitest';
import { readFileSync } from 'node:fs';
import { audioKernels, loadAudioKernels } from '../../atome/src/application/audio_runtime/audio_kernels.js';
import {
    buildBrowserVideoRecordingResult,
    buildBrowserVideoTerminalCapture
} from '../../eVe/domains/media/api/video_api_record_finalize.js';
import { sanitizeFileName } from '../../eVe/domains/media/api/video_api_helpers.js';

test('a recording\'s WAV says its rate, channels and frames, and a false signature is refused', async () => {
    await loadAudioKernels({
        moduleUrl: new URL('../../atome/src/wasm/squirrel_audio_wasm.js', import.meta.url).href,
        binary: readFileSync(new URL('../../atome/src/wasm/squirrel_audio_wasm_bg.wasm', import.meta.url))
    });
    const kernels = audioKernels();
    const wav = kernels.encodeWav([Float32Array.of(0.5, -0.5, 1, -1)], 48_000, 16);
    const info = kernels.wavInfo(wav);
    assert.deepEqual([wav.byteLength, info.format, info.channels, info.sample_rate, info.bits, info.frames], [52, 1, 1, 48_000, 16, 4]);
    const corrupted = wav.slice();
    corrupted[0] = 0;
    assert.throws(() => kernels.wavInfo(corrupted), (error) => error.code === 'bank/unreadable');
});

test('browser video validation rejects a false container and normalizes technical metadata', async () => {
    const videoTrack = { getSettings: () => ({ width: 640, height: 360, frameRate: 30 }) };
    const audioTrack = {};
    const recordStream = {
        getVideoTracks: () => [videoTrack],
        getAudioTracks: () => [audioTrack]
    };
    const chunks = [new Blob([
        Uint8Array.of(0x1a, 0x45, 0xdf, 0xa3, 0x81, 0x00)
    ], { type: 'video/webm;codecs=vp9,opus' })];
    const capture = await buildBrowserVideoTerminalCapture({
        chunks,
        mimeType: 'video/webm;codecs=vp9,opus',
        mode: 'video',
        startedAt: 0,
        monotonicNow: () => 1000,
        recordStream,
        expectsAudio: true,
        orientation: 'landscape-right'
    });
    assert.equal(capture.container, 'webm');
    assert.equal(capture.sizeBytes, 6);
    assert.equal(capture.videoTrackCount, 1);
    assert.equal(capture.audioTrackCount, 1);
    assert.equal(capture.videoCodec, 'vp9');
    assert.equal(capture.audioCodec, 'opus');
    assert.equal(capture.orientation, 'landscape-right');

    await assert.rejects(buildBrowserVideoTerminalCapture({
        chunks: [new Blob(['not-a-container'], { type: 'video/webm' })],
        mimeType: 'video/webm',
        mode: 'video',
        startedAt: 0,
        monotonicNow: () => 1000,
        recordStream,
        expectsAudio: true
    }), /video_recording_container_invalid/);

    const result = buildBrowserVideoRecordingResult({
        saved: { path: 'recordings/take.webm' },
        capture,
        fileName: sanitizeFileName('take.mp4', capture.extension)
    });
    assert.equal(result.fileName, 'take.webm');
    assert.equal(result.mime_type, 'video/webm');
    assert.equal(result.container, 'webm');
    assert.equal(result.size_bytes, 6);
});

test('encoded format is authoritative over a caller-provided extension', () => {
    assert.equal(sanitizeFileName('camera.mp4', 'webm'), 'camera.webm');
    assert.equal(sanitizeFileName('camera.webm', 'mov'), 'camera.mov');
    assert.equal(sanitizeFileName('../../unsafe name.jpeg', 'jpg'), 'unsafe_name.jpg');
});
