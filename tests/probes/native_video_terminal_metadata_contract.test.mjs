import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const readSource = async (path) => readFile(new URL(path, import.meta.url), 'utf8');

const [supportSource, terminalSource] = await Promise.all([
    readSource('../../platforms/ios/atome-auv3/Common/AppNativeVideoRecorderSupport.swift'),
    readSource('../../platforms/ios/atome-auv3/Common/AppNativeVideoRecorderTerminal.swift')
]);

test('native terminal validation inspects one AVAsset before reporting success', () => {
    assert.match(supportSource, /func inspectAsset\(fileURL: URL\) -> AppNativeVideoAssetInspection/);
    assert.match(supportSource, /let asset = AVURLAsset\(url: fileURL\)/);
    assert.match(supportSource, /isReadable: asset\.isReadable/);
    assert.match(supportSource, /isPlayable: asset\.isPlayable/);
    assert.match(terminalSource, /let inspection = inspectAsset\(fileURL: fileURL\)/);
    assert.ok(
        terminalSource.indexOf('let inspection = inspectAsset')
            < terminalSource.indexOf('let successPayload'),
        'asset inspection must precede the terminal success payload'
    );
    assert.match(terminalSource, /videoValid = inspection\.videoTrackCount > 0[\s\S]*inspection\.width > 0[\s\S]*inspection\.height > 0[\s\S]*!inspection\.videoCodecs\.isEmpty/);
    assert.match(terminalSource, /audioValid = !expectsAudio[\s\S]*inspection\.audioTrackCount > 0[\s\S]*!inspection\.audioCodecs\.isEmpty/);
});

test('native AVAsset inspection derives transformed display and codec metadata', () => {
    assert.match(supportSource, /track\.preferredTransform/);
    assert.match(supportSource, /CGRect\(origin: \.zero, size: track\.naturalSize\)[\s\S]*\.applying\(transform\)[\s\S]*\.standardized/);
    assert.match(supportSource, /rotationDegrees/);
    assert.match(supportSource, /determinant < 0/);
    assert.match(supportSource, /nominalFrameRate/);
    assert.match(supportSource, /track\.formatDescriptions/);
    assert.match(supportSource, /CMFormatDescriptionGetMediaSubType/);
    assert.match(supportSource, /String\(format: "0x%08X", value\)/);
});

test('successful native video payload exposes normalized terminal metadata', () => {
    for (const field of [
        '"container": "mov"',
        '"is_readable"',
        '"is_playable"',
        '"mime_type": "video/quicktime"',
        '"duration_sec"',
        '"size_bytes"',
        '"byte_size"',
        '"width"',
        '"height"',
        '"orientation"',
        '"rotation_degrees"',
        '"mirrored"',
        '"preferred_transform"',
        '"nominal_fps"',
        '"video_codec"',
        '"audio_codec"',
        '"video_codecs"',
        '"audio_codecs"',
        '"video_track_count"',
        '"audio_track_count"'
    ]) {
        assert.ok(terminalSource.includes(field), `missing terminal video metadata ${field}`);
    }
});
