import assert from 'node:assert/strict';
import { test } from 'vitest';
import {
    findMp4MoovInWindow,
    isMp4ContainerBytes,
    isMp4FastStart,
    isMp4MoovCompleteInBytes,
    readMp4MoovBytes,
    readMp4TopLevelBoxes,
    summarizeMp4Moov
} from '../../atome/src/squirrel/shared/media_container.js';
import { buildMp4, box } from './helpers/mp4_fixture.mjs';

test('isMp4ContainerBytes requires a leading ftyp box', () => {
    assert.equal(isMp4ContainerBytes(buildMp4({ tracks: [], fastStart: true })), true);
    assert.equal(isMp4ContainerBytes(new Uint8Array([1, 2, 3, 4])), false);
});

test('top-level box walking reports moov/mdat order', () => {
    const fastStart = readMp4TopLevelBoxes(buildMp4({ tracks: [], fastStart: true }));
    assert.deepEqual(fastStart.map((entry) => entry.type), ['ftyp', 'moov', 'mdat']);
    const lateMoov = readMp4TopLevelBoxes(buildMp4({ tracks: [], fastStart: false }));
    assert.deepEqual(lateMoov.map((entry) => entry.type), ['ftyp', 'mdat', 'moov']);
    assert.equal(isMp4FastStart(buildMp4({ tracks: [], fastStart: true })), true);
    assert.equal(isMp4FastStart(buildMp4({ tracks: [], fastStart: false })), false);
});

test('summarizeMp4Moov reads soun/vide handlers and stsd codecs', () => {
    const bytes = buildMp4({
        tracks: [{ handler: 'vide', codec: 'hvc1' }, { handler: 'soun', codec: 'mp4a' }],
        fastStart: true
    });
    const moov = readMp4MoovBytes(bytes, bytes.length);
    const tracks = summarizeMp4Moov(moov);
    assert.equal(tracks.audio, 1);
    assert.deepEqual(tracks.videoCodecs, ['hvc1']);
});

test('a truncated moov is never treated as complete', () => {
    const bytes = buildMp4({ tracks: [{ handler: 'vide', codec: 'avc1' }], fastStart: false });
    const truncated = bytes.subarray(0, bytes.length - 4);
    assert.equal(isMp4MoovCompleteInBytes(truncated, bytes.length), false);
    assert.equal(isMp4MoovCompleteInBytes(bytes, bytes.length), true);
});

test('findMp4MoovInWindow locates a moov stored at the end of the file', () => {
    const bytes = buildMp4({
        tracks: [{ handler: 'vide', codec: 'avc1' }, { handler: 'soun', codec: 'mp4a' }],
        fastStart: false
    });
    const windowStart = bytes.length - 1024;
    const window = bytes.subarray(windowStart);
    const moov = findMp4MoovInWindow(window, windowStart, bytes.length);
    assert.ok(moov);
    assert.deepEqual(summarizeMp4Moov(moov).videoCodecs, ['avc1']);
    assert.equal(summarizeMp4Moov(moov).audio, 1);
});

test('findMp4MoovInWindow refuses a moov that extends past the window', () => {
    const bytes = buildMp4({ tracks: [{ handler: 'vide', codec: 'avc1' }], fastStart: false });
    const windowStart = bytes.length - 16;
    const window = bytes.subarray(windowStart);
    assert.equal(findMp4MoovInWindow(window, windowStart, bytes.length), null);
});

test('box helper is exported for fixtures', () => {
    assert.equal(box('free').length, 8);
});
