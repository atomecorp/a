import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const readSource = async (path) => readFile(new URL(path, import.meta.url), 'utf8');

const [
    renderSource,
    utilsSource,
    controllerSource,
    recorderSource,
    analysisSource,
    playbackStateSource,
    backendHeaderSource,
    backendSource
] = await Promise.all([
    readSource('../../platforms/ios/atome-auv3/auv3/AUv3RenderEngine.swift'),
    readSource('../../platforms/ios/atome-auv3/auv3/utils.swift'),
    readSource('../../platforms/ios/atome-auv3/auv3/AudioUnitViewController.swift'),
    readSource('../../platforms/ios/atome-auv3/auv3/AUv3Recorder.swift'),
    readSource('../../platforms/ios/atome-auv3/auv3/AUv3RecorderAnalysis.swift'),
    readSource('../../platforms/ios/atome-auv3/auv3/AUv3PlaybackState.swift'),
    readSource('../../platforms/ios/atome-auv3/Common/AUv3NativeRecorderBackend.h'),
    readSource('../../platforms/ios/atome-auv3/Common/AUv3NativeRecorderBackend.mm')
]);

test('AUv3 render callback has no allocating audio visualization delegate', () => {
    assert.doesNotMatch(renderSource, /didReceiveAudioData|audioDataDelegate|\[peak\]/);
    assert.doesNotMatch(renderSource, /DispatchQueue\.main\.async/);
    assert.doesNotMatch(renderSource, /AUv3Diagnostics\.log|print\(/);
    assert.doesNotMatch(utilsSource, /AudioDataDelegate|preAllocatedVisualizationBuffer|frameSkipCounter/);
    assert.doesNotMatch(controllerSource, /AudioDataDelegate|didReceiveAudioData|processAudioData/);
});

test('native recorder publishes a bounded lock-free latest scope snapshot', () => {
    assert.match(backendHeaderSource, /copyScopeMinima/);
    assert.match(backendSource, /constexpr uint16_t kScopeBinCount = 64/);
    assert.match(backendSource, /constexpr int kScopeSlotCount = 3/);
    assert.match(backendSource, /std::atomic<int> published_/);
    assert.match(backendSource, /readers\.fetch_add\(1, std::memory_order_acq_rel\)/);
    assert.match(backendSource, /published_\.store\(writeIndex, std::memory_order_release\)/);
    assert.match(backendSource, /std::clamp\(mono, -1\.0f, 1\.0f\)/);
    assert.doesNotMatch(backendSource, /std::mutex|os_unfair_lock|dispatch_sync/);
});

test('AUv3 microphone uses the recorder ring without file writes or locks in its tap', () => {
    assert.match(analysisSource, /nativeRecorderBackend\.start\(withPath: url\.path/);
    assert.match(analysisSource, /source: "mic"/);
    assert.match(analysisSource, /self\.pushRecordingBufferList\(/);
    assert.doesNotMatch(analysisSource, /AVAudioFile\(forWriting:|write\(from: buffer\)|micRecordingLock/);
    assert.match(recorderSource, /if activeSource == "mic" \{ stopMicRecordingEngine\(\) \}/);
    assert.match(recorderSource, /nativeRecorderBackend\.stop\(withDuration:/);
});

test('native recording scope is session-bound and published to JavaScript off the render callback', () => {
    assert.match(recorderSource, /startRecordingScopeMonitor\(sessionId: sessionId\)/);
    assert.match(playbackStateSource, /milliseconds\(34\)/);
    assert.match(playbackStateSource, /recordingScopeMonitorGeneration == generation/);
    assert.match(playbackStateSource, /emitRecordingEvent\(type: "record_scope"/);
    for (const field of [
        '"session_id"',
        '"sequence"',
        '"sample_rate"',
        '"channels"',
        '"bin_count"',
        '"min_max_pairs"',
        '"rms"',
        '"peak"'
    ]) {
        assert.ok(playbackStateSource.includes(field), `missing native scope field ${field}`);
    }
});
