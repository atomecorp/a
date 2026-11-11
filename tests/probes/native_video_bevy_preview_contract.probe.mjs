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

test('native camera preview is latest-only, bounded to 960px JPEG and capped at 30 fps', () => {
    assert.match(previewSource, /maximumDimension = 960/);
    assert.match(previewSource, /maximumFps = 30/);
    assert.match(previewSource, /AppNativeVideoPreviewSlot\(\),\s*AppNativeVideoPreviewSlot\(\),\s*AppNativeVideoPreviewSlot\(\)/);
    assert.match(previewSource, /pendingPixelBuffer = pixelBuffer/);
    assert.match(previewSource, /pendingPixelBuffer = nil/);
    assert.match(previewSource, /conversionQueue\.async/);
    assert.match(previewSource, /jpegRepresentation/);
    assert.doesNotMatch(previewSource, /AVCaptureVideoPreviewLayer|UIImage/);
});

// Frames are served as bytes on the atome:// scheme, never evaluated as a script per frame
// (base64 through the native-invoke bridge froze the WebView while filming, iPad, 11 Nov. 2026).
test('camera frames reach the WebView as JPEG bytes on the atome scheme', async () => {
    const scheme = await readSource('../../platforms/ios/atome-auv3/Common/AudioSchemeHandler.swift');
    assert.match(scheme, /\/__native\/media_preview\//);
    assert.match(scheme, /"Content-Type": "image\/jpeg"/);
    assert.match(scheme, /"X-Atome-Sequence"/);
    assert.match(controllerSource, /func latestPreviewFrame\(kind: String, after: UInt64\)/);
    assert.match(previewSource, /func latestFrame\(after: UInt64\)/);
    assert.doesNotMatch(controllerSource, /preview_frame/);
    assert.doesNotMatch(operationsSource, /preview_frame|framePayload/);
    assert.doesNotMatch(previewSource, /base64/);
});

test('native video cleanup detaches the preview delegate and releases retained frames', () => {
    assert.match(lifecycleSource, /previewState\.stop\(\)/);
    assert.match(previewSource, /setSampleBufferDelegate\(nil, queue: nil\)/);
    assert.match(previewSource, /pendingPixelBuffer = nil/);
    assert.match(previewSource, /publishedSlot = -1/);
});
