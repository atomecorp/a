import assert from 'node:assert/strict';
import test from 'node:test';
import { installMockBrowserEnv } from '../strangler_v2/_env.mjs';

test('browser video stop is idempotent and exact overdub is rejected before camera access', async () => {
    const calls = { requestData: 0, stop: 0 };
    class FakeStream {
        constructor() {
            this.videoTrack = { getSettings: () => ({ width: 1280, height: 720 }), stop() {} };
            this.audioTrack = { stop() {} };
        }
        getVideoTracks() { return [this.videoTrack]; }
        getAudioTracks() { return [this.audioTrack]; }
        getTracks() { return [this.videoTrack, this.audioTrack]; }
    }
    class FakeMediaRecorder {
        static isTypeSupported() { return true; }
        constructor(stream) {
            this.stream = stream;
            this.state = 'inactive';
            this.mimeType = 'video/webm';
        }
        start() { this.state = 'recording'; }
        requestData() { calls.requestData += 1; }
        stop() {
            calls.stop += 1;
            this.state = 'inactive';
            queueMicrotask(() => this.onstop?.());
        }
    }
    const stream = new FakeStream();
    const { window } = installMockBrowserEnv();
    Object.defineProperty(globalThis, 'navigator', {
        configurable: true,
        value: { mediaDevices: { getUserMedia: async () => stream } }
    });
    globalThis.MediaStream = FakeStream;
    globalThis.MediaRecorder = FakeMediaRecorder;
    window.MediaStream = FakeStream;
    window.MediaRecorder = FakeMediaRecorder;

    const module = await import(`../../eVe/domains/media/api/video_api_record.js?stop=${Date.now()}`);
    const controller = await module.record_video('take.webm', null, {
        stream,
        keepStream: true,
        audio: true
    });
    const firstStop = controller.stop({ discard: true });
    const repeatedStop = controller.stop({ discard: true });
    assert.equal(firstStop, repeatedStop);
    const result = await firstStop;
    assert.equal(result.discarded, true);
    assert.equal(result.sample_accurate_overdub, false);
    assert.equal(result.overdub_capability.reason, 'video_pts_audio_sample_mapping_unavailable');
    assert.equal(calls.requestData, 1);
    assert.equal(calls.stop, 1);

    const exact = await module.startVideoRecording({ require_sample_accurate: true });
    assert.equal(exact.ok, false);
    assert.equal(exact.code, 'av_sample_accurate_overdub_unsupported');
});
