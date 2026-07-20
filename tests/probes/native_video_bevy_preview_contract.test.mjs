import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const readSource = async (path) => readFile(new URL(path, import.meta.url), 'utf8');

const [
    controllerSource,
    operationsSource,
    recorderSource,
    lifecycleSource,
    previewSource
] = await Promise.all([
    readSource('../../platforms/ios/atome-auv3/Common/AppNativeMediaCaptureController.swift'),
    readSource('../../platforms/ios/atome-auv3/Common/AppNativeMediaCaptureOperations.swift'),
    readSource('../../platforms/ios/atome-auv3/Common/AppNativeVideoRecorder.swift'),
    readSource('../../platforms/ios/atome-auv3/Common/AppNativeVideoRecorderLifecycle.swift'),
    readSource('../../platforms/ios/atome-auv3/Common/AppNativeVideoRecorderPreview.swift')
]);

test('native recording session feeds a data output beside the movie output', () => {
    assert.match(recorderSource, /AVCaptureMovieFileOutput\(\)/);
    assert.match(recorderSource, /previewState\.makeOutput/);
    assert.match(recorderSource, /session\.addOutput\(movieOutput\)/);
    assert.match(recorderSource, /session\.addOutput\(previewOutput\)/);
    assert.match(recorderSource, /configureConnection\(previewOutput\.connection\(with: \.video\)\)/);
    assert.match(previewSource, /AVCaptureVideoDataOutputSampleBufferDelegate/);
    assert.match(previewSource, /kCVPixelFormatType_32BGRA/);
    assert.match(previewSource, /alwaysDiscardsLateVideoFrames = true/);
});

test('native camera preview is latest-only, bounded to 96px and capped at 15 fps', () => {
    assert.match(previewSource, /maximumDimension = 96/);
    assert.match(previewSource, /minimumFrameInterval = 1\.0 \/ 15\.0/);
    assert.match(previewSource, /AppNativeVideoPreviewSlot\(\),\s*AppNativeVideoPreviewSlot\(\),\s*AppNativeVideoPreviewSlot\(\)/);
    assert.match(previewSource, /pendingPixelBuffer = pixelBuffer/);
    assert.match(previewSource, /pendingPixelBuffer = nil/);
    assert.match(previewSource, /conversionQueue\.async/);
    assert.match(previewSource, /vImageScale_ARGB8888/);
    assert.doesNotMatch(previewSource, /AVCaptureVideoPreviewLayer|jpeg|JPEG|UIImage|CIContext/);
});

test('raw camera frames cross the native bridge as disposable Bevy source data', () => {
    assert.match(controllerSource, /"media_video_preview_frame"/);
    assert.match(operationsSource, /videoRecorder\.readPreviewFrame/);
    assert.match(recorderSource, /"preview_command": "media_video_preview_frame"/);
    assert.match(previewSource, /"pixel_format": "bgra8"/);
    assert.match(previewSource, /"encoding": "base64"/);
    assert.match(previewSource, /"bytes_base64"/);
    assert.match(previewSource, /"source_id"/);
    assert.match(previewSource, /"sequence"/);
    assert.match(previewSource, /"orientation"/);
    assert.match(previewSource, /"mirrored"/);
});

test('native video cleanup detaches the preview delegate and releases retained frames', () => {
    assert.match(lifecycleSource, /previewState\.stop\(\)/);
    assert.match(previewSource, /setSampleBufferDelegate\(nil, queue: nil\)/);
    assert.match(previewSource, /pendingPixelBuffer = nil/);
    assert.match(previewSource, /publishedSlot = -1/);
});
