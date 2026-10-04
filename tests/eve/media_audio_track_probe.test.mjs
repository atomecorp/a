import assert from 'node:assert/strict';
import { test } from 'vitest';
import {
    probeVideoAudioTrackFromBlob,
    probeVideoAudioTrackFromSource,
    summarizeMp4AudioTrackFromBytes
} from '../../eVe/domains/media/shared/media_audio_track_probe.js';
import { resolveUploadMediaSizeParticles } from '../../eVe/domains/media/asset_box_media.js';
import { buildMp4 } from './helpers/mp4_fixture.mjs';

const bytesToArrayBuffer = (view) => Uint8Array.from(view).buffer;

const fakeBlob = (bytes) => ({
    size: bytes.length,
    slice: (start, end) => ({
        arrayBuffer: async () => bytesToArrayBuffer(bytes.subarray(start, end))
    })
});

const rangedFetch = (bytes) => async (_url, options = {}) => {
    const match = /bytes=(\d+)-(\d*)/.exec(options.headers?.Range || '');
    const start = match ? Number(match[1]) : 0;
    const requestedEnd = match && match[2] ? Number(match[2]) : bytes.length - 1;
    const end = Math.min(requestedEnd, bytes.length - 1);
    const slice = bytes.subarray(start, end + 1);
    return {
        ok: true,
        status: 206,
        headers: { get: (name) => (String(name).toLowerCase() === 'content-range' ? `bytes ${start}-${end}/${bytes.length}` : null) },
        arrayBuffer: async () => bytesToArrayBuffer(slice)
    };
};

const withAudio = { tracks: [{ handler: 'vide', codec: 'avc1' }, { handler: 'soun', codec: 'mp4a' }] };
const silent = { tracks: [{ handler: 'vide', codec: 'avc1' }] };

test('summarizeMp4AudioTrackFromBytes reads a faststart head', () => {
    const bytes = buildMp4({ ...withAudio, fastStart: true });
    const summary = summarizeMp4AudioTrackFromBytes({ headBytes: bytes, totalSize: bytes.length });
    assert.deepEqual(summary, { hasAudio: true, audioTrackCount: 1 });
});

test('summarizeMp4AudioTrackFromBytes proves silence from a moov stored at the end', () => {
    const bytes = buildMp4({ ...silent, fastStart: false });
    const ftypSize = bytes.readUInt32BE(0);
    const head = bytes.subarray(0, ftypSize);
    const tailStart = bytes.length - 1024;
    const tail = bytes.subarray(tailStart);
    assert.deepEqual(
        summarizeMp4AudioTrackFromBytes({ headBytes: head, totalSize: bytes.length, tailBytes: tail, tailStart }),
        { hasAudio: false, audioTrackCount: 0 }
    );
});

test('summarizeMp4AudioTrackFromBytes stays unknown without a readable moov', () => {
    const bytes = buildMp4({ ...silent, fastStart: true });
    const head = bytes.subarray(0, 12);
    assert.equal(summarizeMp4AudioTrackFromBytes({ headBytes: head, totalSize: bytes.length }), null);
    assert.equal(summarizeMp4AudioTrackFromBytes({ headBytes: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) }), null);
});

test('probeVideoAudioTrackFromSource inspects ranged responses', async () => {
    const audioBytes = buildMp4({ ...withAudio, fastStart: true });
    const silentBytes = buildMp4({ ...silent, fastStart: false });
    assert.deepEqual(
        await probeVideoAudioTrackFromSource('/api/uploads/a.mov', { fetchImpl: rangedFetch(audioBytes), timeoutMs: 500 }),
        { hasAudio: true, audioTrackCount: 1 }
    );
    assert.deepEqual(
        await probeVideoAudioTrackFromSource('/api/uploads/b.mov', { fetchImpl: rangedFetch(silentBytes), timeoutMs: 500 }),
        { hasAudio: false, audioTrackCount: 0 }
    );
    assert.equal(
        await probeVideoAudioTrackFromSource('/api/uploads/c.webm', { fetchImpl: rangedFetch(new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])) }),
        null
    );
    assert.equal(await probeVideoAudioTrackFromSource('', { fetchImpl: rangedFetch(audioBytes) }), null);
});

test('probeVideoAudioTrackFromSource treats a fetch failure as unknown', async () => {
    const summary = await probeVideoAudioTrackFromSource('/api/uploads/x.mov', {
        fetchImpl: async () => { throw new Error('network'); },
        timeoutMs: 200
    });
    assert.equal(summary, null);
});

test('probeVideoAudioTrackFromBlob inspects local bytes', async () => {
    const silentBytes = buildMp4({ ...silent, fastStart: false });
    assert.deepEqual(
        await probeVideoAudioTrackFromBlob(fakeBlob(silentBytes)),
        { hasAudio: false, audioTrackCount: 0 }
    );
    const audioBytes = buildMp4({ ...withAudio, fastStart: true });
    assert.deepEqual(
        await probeVideoAudioTrackFromBlob(fakeBlob(audioBytes)),
        { hasAudio: true, audioTrackCount: 1 }
    );
});

test('import particles persist an explicit silent audio state for videos', async () => {
    const properties = await resolveUploadMediaSizeParticles(
        { arrayBuffer: async () => new ArrayBuffer(1) },
        'video',
        { probeVideoAudioTrack: async () => ({ hasAudio: false, audioTrackCount: 0 }) }
    );
    assert.equal(properties.has_audio, false);
    assert.equal(properties.audio_track_count, 0);
});

test('import particles persist an explicit audio state for videos with sound', async () => {
    const properties = await resolveUploadMediaSizeParticles(
        { arrayBuffer: async () => new ArrayBuffer(1) },
        'video',
        { probeVideoAudioTrack: async () => ({ hasAudio: true, audioTrackCount: 2 }) }
    );
    assert.equal(properties.has_audio, true);
    assert.equal(properties.audio_track_count, 2);
});
