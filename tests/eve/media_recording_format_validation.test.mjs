import assert from 'node:assert/strict';
import { test } from 'vitest';
import { encodeWav16Mono, inspectPcmWav } from '../../eVe/domains/media/api/audio_core_helpers.js';
import {
    buildBrowserVideoRecordingResult,
    buildBrowserVideoTerminalCapture
} from '../../eVe/domains/media/api/video_api_record_finalize.js';
import { sanitizeFileName } from '../../eVe/domains/media/api/video_api_helpers.js';

test('WAV validation proves signature, byte size, channels, rate, frames and duration', () => {
    const wav = encodeWav16Mono(Int16Array.of(1, -1, 32767, -32768), 48_000);
    assert.deepEqual(inspectPcmWav(wav), {
        byteSize: 52,
        channels: 1,
        sampleRate: 48_000,
        frameCount: 4,
        durationSec: 4 / 48_000
    });
    const corrupted = wav.slice(0);
    new Uint8Array(corrupted)[0] = 0;
    assert.throws(() => inspectPcmWav(corrupted), /audio_recording_wav_signature_invalid/);
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
