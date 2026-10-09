import { afterEach, expect, test, vi } from 'vitest';
const feedback = vi.hoisted(() => ({ start: vi.fn(), stop: vi.fn(), transition: vi.fn() }));
// Registration and hardware are boundaries; the native tool handlers remain unmocked.
vi.mock('../../eVe/intuition/runtime/tool.js', () => ({ registerUiAction: vi.fn() }));
vi.mock('../../eVe/intuition/tools/action_recording_tools.js', () => ({}));
vi.mock('../../eVe/domains/media/api/video_recording_controller.js', () => ({
    getVideoRecordingControllerState: vi.fn(() => ({ recording: false })),
    startVideoRecordingSession: vi.fn(async () => ({ ok: true })), stopVideoRecordingSession: vi.fn()
}));
vi.mock('../../eVe/intuition/tools/capture_recording_feedback_runtime.js', () => ({
    createCaptureRecordingFeedbackRuntime: () => ({ ensureCaptureVisualStyles() {}, flashPhotoCapture() {},
        startCaptureVisualSession: feedback.start, stopCaptureVisualSession: feedback.stop, transitionCaptureVisualSession: feedback.transition })
}));
import { invokeCaptureToolHandler } from '../../eVe/intuition/tools/capture.js';
import * as audio from '../../eVe/domains/media/api/audio_api.js';
import * as video from '../../eVe/domains/media/api/video_api.js';
import * as controller from '../../eVe/domains/media/api/video_recording_controller.js';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const setup = () => {
    vi.clearAllMocks();
    vi.stubGlobal('window', {}); vi.stubGlobal('Element', class {});
    vi.mocked(controller.getVideoRecordingControllerState).mockReturnValue({ recording: false });
};

test.each(['audio', 'video'])('%s cannot take the preview or start hardware while the other recorder owns a session', async kind => {
    setup();
    vi.spyOn(audio, 'getAudioRecordingState').mockReturnValue({ isRecording: kind === 'video' });
    vi.spyOn(video, 'getVideoRecordingState').mockReturnValue({ isRecording: kind === 'audio' });
    const audioStart = vi.spyOn(audio, 'startAudioRecording').mockResolvedValue({ ok: true, status: 'recording' });
    const videoStart = vi.mocked(controller.startVideoRecordingSession).mockResolvedValue({ ok: true });
    const result = await invokeCaptureToolHandler({ tool_id: `ui.capture.${kind}`, action: 'state.on' });
    expect(result).toMatchObject({ ok: false, error: `${kind === 'audio' ? 'video' : 'audio'}_recording_in_progress` });
    expect(audioStart).not.toHaveBeenCalled(); expect(videoStart).not.toHaveBeenCalled();
    expect(feedback.start).not.toHaveBeenCalled(); expect(feedback.stop).not.toHaveBeenCalled();
    expect(feedback.transition).not.toHaveBeenCalled();
});

test('a blocked second start leaves the first Stop usable, then admits the other recorder after Stop', async () => {
    setup(); let audioRecording = true, videoRecording = false;
    vi.spyOn(audio, 'getAudioRecordingState').mockImplementation(() => ({ isRecording: audioRecording }));
    vi.spyOn(video, 'getVideoRecordingState').mockReturnValue({ isRecording: false });
    vi.mocked(controller.getVideoRecordingControllerState).mockImplementation(() => ({ recording: videoRecording }));
    const stop = vi.spyOn(audio, 'stopAudioRecording').mockImplementation(async () => {
        audioRecording = false; return { ok: true, status: 'stopped' };
    });
    const start = vi.mocked(controller.startVideoRecordingSession).mockImplementation(async () => {
        videoRecording = true; return { ok: true };
    });
    expect(await invokeCaptureToolHandler({ tool_id: 'ui.capture.video', action: 'state.on' })).toMatchObject({ ok: false });
    expect(start).not.toHaveBeenCalled();
    expect(await invokeCaptureToolHandler({ tool_id: 'ui.capture.audio', action: 'state.off' })).toMatchObject({ ok: true, active: false });
    expect(stop).toHaveBeenCalledOnce();
    expect(await invokeCaptureToolHandler({ tool_id: 'ui.capture.video', action: 'state.on' })).toMatchObject({ ok: true, active: true });
    expect(start).toHaveBeenCalledOnce();
});

test('near-simultaneous Audio/Video starts serialize before reading the native recording facts', async () => {
    setup(); let recording = false, release;
    vi.spyOn(audio, 'getAudioRecordingState').mockImplementation(() => ({ isRecording: recording }));
    vi.spyOn(video, 'getVideoRecordingState').mockReturnValue({ isRecording: false });
    const audioStart = vi.spyOn(audio, 'startAudioRecording').mockImplementation(() => new Promise(resolve => {
        release = () => { recording = true; resolve({ ok: true, status: 'recording' }); };
    }));
    const videoStart = vi.mocked(controller.startVideoRecordingSession).mockResolvedValue({ ok: true });
    const first = invokeCaptureToolHandler({ tool_id: 'ui.capture.audio', action: 'state.on' });
    const second = invokeCaptureToolHandler({ tool_id: 'ui.capture.video', action: 'state.on' });
    await vi.waitFor(() => expect(audioStart).toHaveBeenCalledOnce());
    release();
    expect(await first).toMatchObject({ ok: true, active: true });
    expect(await second).toMatchObject({ ok: false, error: 'audio_recording_in_progress' });
    expect(videoStart).not.toHaveBeenCalled();
});
