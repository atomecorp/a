import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const readSource = async (path) => readFile(new URL(path, import.meta.url), 'utf8');

const sources = await Promise.all([
    '../../platforms/ios/atome-auv3/application/AppNativeAudioController.swift',
    '../../platforms/ios/atome-auv3/application/AppNativeAudioPlayback.swift',
    '../../platforms/ios/atome-auv3/application/AppNativeAudioCommands.swift',
    '../../platforms/ios/atome-auv3/application/AppNativeAudioRecording.swift',
    '../../platforms/ios/atome-auv3/application/AppNativeAudioRecordingScope.swift',
    '../../platforms/ios/atome-auv3/application/ViewController.swift',
    '../../platforms/ios/atome-auv3/Common/AUv3NativeRecorderBackend.mm'
].map(readSource));

const [
    controllerSource,
    playbackSource,
    commandsSource,
    recordingSource,
    scopeSource,
    viewControllerSource,
    backendSource
] = sources;

test('standalone iOS audio responsibilities remain bounded', () => {
    for (const [name, source] of [
        ['AppNativeAudioController.swift', controllerSource],
        ['AppNativeAudioPlayback.swift', playbackSource],
        ['AppNativeAudioCommands.swift', commandsSource],
        ['AppNativeAudioRecording.swift', recordingSource],
        ['AppNativeAudioRecordingScope.swift', scopeSource],
        ['ViewController.swift', viewControllerSource]
    ]) {
        const lineCount = source.split('\n').length;
        assert.ok(lineCount <= 500, `${name} has ${lineCount} lines`);
    }
    assert.doesNotMatch(viewControllerSource, /final class AppNativeAudioController/);
    assert.match(controllerSource, /final class AppNativeAudioController/);
});

test('standalone iOS microphone tap only forwards preallocated Float32 PCM', () => {
    assert.match(recordingSource, /nativeRecorderBackend\.start\(/);
    assert.match(recordingSource, /source: "mic"/);
    assert.match(recordingSource, /self\?\.pushRecordingBuffer\(buffer\)/);
    assert.match(recordingSource, /recordingChannelPointers\.withUnsafeBufferPointer/);
    assert.match(recordingSource, /pushPlanarFloat32/);
    assert.match(recordingSource, /pushInterleavedFloat32/);
    assert.doesNotMatch(recordingSource, /AVAudioFile\(forWriting:/);
    assert.doesNotMatch(recordingSource, /write\(from: buffer\)/);
    assert.doesNotMatch(recordingSource, /activeRecordingFrames/);

    const tapStart = recordingSource.indexOf('input.installTap(');
    const tapEnd = recordingSource.indexOf('self.recordingEngine.prepare()', tapStart);
    assert.ok(tapStart >= 0 && tapEnd > tapStart, 'microphone tap block not found');
    const tapSource = recordingSource.slice(tapStart, tapEnd);
    assert.doesNotMatch(
        tapSource,
        /FileManager|AVAudioFile|\.write\(|print\(|os_unfair_lock|NSLock|DispatchQueue|Data\(/
    );

    const pushStart = recordingSource.indexOf('func pushRecordingBuffer(');
    const pushEnd = recordingSource.indexOf('func stopAudioRecording(', pushStart);
    assert.ok(pushStart >= 0 && pushEnd > pushStart, 'PCM forwarding owner not found');
    const pushSource = recordingSource.slice(pushStart, pushEnd);
    assert.doesNotMatch(
        pushSource,
        /FileManager|AVAudioFile|\.write\(|print\(|os_unfair_lock|NSLock|DispatchQueue|Data\(|Array\(/
    );
});

test('standalone iOS scope uses the shared bounded snapshot contract', () => {
    assert.match(controllerSource, /let recordingScopeBinCount = 64/);
    assert.match(controllerSource, /count: 64/);
    assert.match(controllerSource, /count: 128/);
    assert.match(scopeSource, /milliseconds\(34\)/);
    assert.match(scopeSource, /copyScopeMinima/);
    assert.match(scopeSource, /emitRecordingEvent\(type: "record_scope"/);
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
        assert.ok(scopeSource.includes(field), `missing standalone scope field ${field}`);
    }
    assert.match(scopeSource, /CustomEvent\('native_audio_recording'/);
    assert.match(backendSource, /constexpr uint16_t kScopeBinCount = 64/);
    assert.doesNotMatch(backendSource, /std::mutex|os_unfair_lock|dispatch_sync/);
});

test('standalone iOS stop finalizes exact frame counts and releases recording resources', () => {
    assert.match(recordingSource, /nativeRecorderBackend\.stop\(/);
    assert.match(recordingSource, /"frame_count": frameCount/);
    assert.match(recordingSource, /"overrun_frames": overrunFrames/);
    assert.match(recordingSource, /"discontinuity_frames": discontinuityFrames/);
    assert.match(recordingSource, /guard stopped, frameCount > 0, fileExists, fileSize > 44/);
    assert.match(recordingSource, /func waveformPeaks\(for url: URL, maximumPeakCount: Int = 256\)/);
    assert.match(recordingSource, /forReading: url,\s+commonFormat: \.pcmFormatFloat32/);
    assert.match(recordingSource, /"peaks": waveformPeaks/);
    assert.match(recordingSource, /"waveform_peaks": waveformPeaks/);
    assert.match(recordingSource, /func shutdownAudioRecording\(\)/);
    assert.match(commandsSource, /case "audio_shutdown":\s+self\.shutdownAudioRecording\(\)/);
});

test('standalone iOS playback reactivates the session and recovers after route changes', () => {
    assert.match(controllerSource, /AVAudioSession\.interruptionNotification/);
    assert.match(controllerSource, /AVAudioSession\.routeChangeNotification/);
    assert.match(controllerSource, /AVAudioSession\.mediaServicesWereResetNotification/);
    assert.match(controllerSource, /try session\.setActive\(true\)/);
    assert.match(playbackSource, /func preparePlaybackEngine/);
    assert.match(playbackSource, /engine\.stop\(\)/);
    assert.match(playbackSource, /engine\.reset\(\)/);
    assert.match(commandsSource, /preparePlaybackEngine\(\)/);
});
