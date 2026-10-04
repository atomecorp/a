import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'vitest';
import { resolveVideoPlaybackNormalization } from '../../server/server_media.js';
import { buildMp4, box } from '../eve/helpers/mp4_fixture.mjs';

const avcTrack = { handler: 'vide', codec: 'avc1' };
const hevcTrack = { handler: 'vide', codec: 'hvc1' };
const audioTrack = { handler: 'soun', codec: 'mp4a' };

const planFor = async (name, bytes, mimeType = 'video/quicktime') => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'media-normalization-'));
    try {
        await writeFile(path.join(dir, name), bytes);
        return await resolveVideoPlaybackNormalization(path.join(dir, name), name, mimeType);
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
};

test('a faststart H.264 mp4 is served as-is', async () => {
    const bytes = buildMp4({ tracks: [avcTrack, audioTrack], fastStart: true });
    assert.equal(await planFor('clip.mp4', bytes, 'video/mp4'), null);
});

test('a non-faststart H.264 mov is remuxed losslessly', async () => {
    const bytes = buildMp4({ tracks: [avcTrack, audioTrack], fastStart: false });
    assert.equal(await planFor('clip.mov', bytes), 'remux');
});

test('HEVC is transcoded even when already faststart', async () => {
    assert.equal(await planFor('late.mov', buildMp4({ tracks: [hevcTrack], fastStart: false })), 'transcode');
    assert.equal(await planFor('early.mp4', buildMp4({ tracks: [hevcTrack], fastStart: true }), 'video/mp4'), 'transcode');
});

test('a mov without a moov atom is transcoded', async () => {
    const broken = Buffer.concat([box('ftyp', Buffer.from('isom')), box('mdat', Buffer.alloc(32))]);
    assert.equal(await planFor('broken.mov', broken), 'transcode');
});

test('non-mp4 video containers are transcoded', async () => {
    const bytes = buildMp4({ tracks: [avcTrack], fastStart: true });
    assert.equal(await planFor('clip.webm', bytes, 'video/webm'), 'transcode');
});

test('audio-only and non-video files are never normalized', async () => {
    const audioOnly = buildMp4({ tracks: [audioTrack], fastStart: false });
    assert.equal(await planFor('audio_clip.mov', audioOnly), null);
    assert.equal(await planFor('notes.txt', Buffer.from('hello'), 'text/plain'), null);
});
