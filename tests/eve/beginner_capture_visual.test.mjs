import { afterEach, expect, test, vi } from 'vitest';
import { createProjectViewVisualPanel, projectViewVisualPanel } from '../../eVe/domains/rendering/project_view_visual_panel.js';
import { createCaptureRecordingFeedbackRuntime } from '../../eVe/intuition/tools/capture_recording_feedback_runtime.js';
import { readActiveRailToolEntries } from '../../eVe/intuition/tools/core/active_tool_registry.js';
import * as surfaceState from '../../eVe/domains/rendering/project_view_surface_runtime.js';
import * as audioApi from '../../eVe/domains/media/api/audio_api.js';
import * as videoApi from '../../eVe/domains/media/api/video_api.js';

const projectId = 'capture_project';
const win = () => ({ __currentProject: { id: projectId }, __eveWorkspaceMode: { mode: 'project', projectId }, dispatchEvent: vi.fn(),
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options?.detail; } } });
const children = root => [root, ...(root.children || []).flatMap(children)];
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

test.each([['beginner', 'list', true], ['intermediate', 'list', false], ['advanced', 'list', false],
    ['beginner', 'matrix', false], ['beginner', 'natural', false]])('%s %s resolves the live presentation in its real owner', async (level, mode, inVisual) => {
    vi.stubGlobal('window', { ...win(), __eveProfilePreferences: { visual: { masteryLevel: level } } });
    vi.spyOn(surfaceState, 'readProjectViewSurfaceState').mockReturnValue({ mounted: true, mode, projectId });
    const menu = { setToolRecordingVisual: vi.fn(), clearToolRecordingVisual: vi.fn() };
    const runtime = createCaptureRecordingFeedbackRuntime({ mainMenuResolver: () => menu, audioScopeSubscriber: () => () => {} });
    const session = await runtime.startCaptureVisualSession({ kind: 'audio' });
    try {
        expect(Boolean(projectViewVisualPanel.readCaptureVisual())).toBe(inVisual);
        expect(menu.setToolRecordingVisual).toHaveBeenCalledTimes(inVisual ? 0 : 1);
    } finally { await session.dispose(); }
});

test('beginner audio uses the shared resizable preview and patches the existing waveform bars', async () => {
    vi.useFakeTimers(); vi.stubGlobal('window', win());
    const patch = vi.fn(() => true);
    const panel = createProjectViewVisualPanel({ patchMotion: patch });
    const record = { id: 'selected', type: 'text', properties: { text: 'Selected' } };
    panel.setSubject(record);
    panel.setEnabled(false);
    let listener; const unsubscribe = vi.fn(); const menu = { setToolRecordingVisual: vi.fn() };
    const runtime = createCaptureRecordingFeedbackRuntime({ mainMenuResolver: () => menu,
        projectVisualResolver: () => ({ runtime: panel, projectId }),
        audioScopeSubscriber: callback => { listener = callback; return unsubscribe; } });
    const session = await runtime.startCaptureVisualSession({ kind: 'audio' });
    expect(panel.isEnabled()).toBe(true);
    const first = panel.build({ width: 800, height: 220 });
    expect(children(first).filter(node => node.id.includes('_recording_scope_bar_'))).toHaveLength(64);
    expect(menu.setToolRecordingVisual).not.toHaveBeenCalled();
    listener({ sequence: 1, pairs: [[-0.8, 0.8]] });
    await vi.advanceTimersByTimeAsync(40);
    expect(patch.mock.calls.at(-1)[0]).toHaveLength(64);
    panel.build({ width: 500, height: 300 });
    listener({ sequence: 2, pairs: [[-0.3, 0.3]] });
    await vi.advanceTimersByTimeAsync(40);
    expect(patch.mock.calls.at(-1)[0].at(-1).position[0]).toBeLessThan(500);
    // The motion patch resizes each column, not only moves it.
    expect(patch.mock.calls.at(-1)[0].at(-1).style.size[0]).toBeCloseTo(500 / 64);
    const late = listener;
    await session.dispose();
    expect(panel.isEnabled()).toBe(false);
    expect(unsubscribe).toHaveBeenCalledOnce();
    expect(panel.subjectRecord()).toBe(record);
    expect(children(panel.build({ width: 500, height: 300 })).some(node => node.id.includes('_recording_'))).toBe(false);
    const count = patch.mock.calls.length; late({ sequence: 3, pairs: [[-1, 1]] });
    await vi.advanceTimersByTimeAsync(100);
    expect(patch).toHaveBeenCalledTimes(count);
});

test('a stopped capture error keeps its feedback without publishing a phantom active recorder', async () => {
    vi.stubGlobal('window', win());
    vi.spyOn(audioApi, 'getAudioRecordingState').mockReturnValue({ isRecording: false });
    await projectViewVisualPanel.setToolRecordingVisual({ toolId: 'ui.capture.audio', sessionId: 'failed',
        kind: 'audio_scope', phase: 'error', projectId });
    try { expect(readActiveRailToolEntries().some(entry => entry.key === 'audio')).toBe(false); }
    finally { await projectViewVisualPanel.clearToolRecordingVisual({ toolId: 'ui.capture.audio', sessionId: 'failed' }); }
});

test('beginner video uses one preview destination, the GPU stream route, and never opens a floating panel', async () => {
    const view = win(); vi.stubGlobal('window', view);
    const panel = createProjectViewVisualPanel(); const previewOpener = vi.fn();
    const register = vi.fn(async () => ({ ok: true, dispose: vi.fn() }));
    const runtime = createCaptureRecordingFeedbackRuntime({ projectVisualResolver: () => ({ runtime: panel, projectId }),
        mainMenuResolver: () => ({ setToolRecordingVisual: vi.fn() }), previewOpener, videoStreamRegistrar: register,
        videoStateResolver: () => ({ readNativePreviewFrame: vi.fn() }),
        nativePreviewStreamFactory: () => ({ stream: {}, firstFrameReady: Promise.resolve({ width: 960, height: 540 }), dispose: vi.fn() }) });
    const session = await runtime.startCaptureVisualSession({ kind: 'video' });
    const video = children(panel.build({ width: 800, height: 240 })).find(node => node.id.endsWith('_recording_video'));
    expect(video.overlayRecord.type).toBe('video');
    expect(video.overlayRecord.bevyTexture).toBeUndefined();
    expect(video.style.size).toEqual([800, 240]);
    expect(register.mock.calls[0][0].id).toBe('__eve_bevy_ui_eve_bevy_ui_project_view_project_view_visual_preview_recording_video');
    expect(previewOpener).not.toHaveBeenCalled();
    view.__currentProject.id = 'other_project';
    expect(children(panel.build({ width: 800, height: 240 })).some(node => node.id.includes('_recording_'))).toBe(false);
    await session.dispose();
    expect(panel.readCaptureVisual()).toBe(null);
});

test.each(['audio', 'video'])('%s publishes a single active Stop case from the capture preview owner', async kind => {
    vi.stubGlobal('window', win());
    vi.spyOn(kind === 'audio' ? audioApi : videoApi, kind === 'audio' ? 'getAudioRecordingState' : 'getVideoRecordingState')
        .mockReturnValue({ isRecording: true });
    await projectViewVisualPanel.setToolRecordingVisual({ toolId: `ui.capture.${kind}`, sessionId: 'session',
        kind: kind === 'audio' ? 'audio_scope' : 'video_preview', phase: 'recording', projectId });
    try {
        expect(readActiveRailToolEntries().filter(entry => entry.key === kind)).toEqual([
            expect.objectContaining({ key: kind, toolId: `ui.capture.${kind}`, active: true, actionMode: 'toggle' })
        ]);
    } finally { await projectViewVisualPanel.clearToolRecordingVisual({ toolId: `ui.capture.${kind}`, sessionId: 'session' }); }
    expect(readActiveRailToolEntries().some(entry => entry.key === kind)).toBe(false);
});
