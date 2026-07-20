import assert from 'node:assert/strict';
import { afterEach, test, vi } from 'vitest';
import { buildBevyMainMenuTree } from '../../eVe/intuition/ribbon/bevy_ui_main_menu_model.js';
import { createMainMenuRecordingVisualRuntime } from '../../eVe/intuition/ribbon/bevy_ui_main_menu_recording_visual_runtime.js';
import { createCaptureRecordingFeedbackRuntime } from '../../eVe/intuition/tools/capture_recording_feedback_runtime.js';
import { createAudioScopeFrame } from '../../eVe/domains/media/api/audio_browser_recorder_worklet.js';
import { normalizeBevyUiTree } from '../../eVe/domains/rendering/bevy_ui_tree_normalization.js';

const surface = {
    clientWidth: 640,
    clientHeight: 480,
    getBoundingClientRect: () => ({ left: 0, top: 0, right: 640, bottom: 480, width: 640, height: 480 })
};

const content = {
    toolbox: { children: ['capture'] },
    capture: {
        atome_tool: true,
        type: 'palette', label: 'Capture', icon: 'capture', tool_id: 'ui.capture',
        children: ['audio', 'video', 'photo']
    },
    audio: { type: 'tool', label: 'Audio', icon: 'microphone', tool_id: 'ui.capture.audio' },
    video: { type: 'tool', label: 'Video', icon: 'video_camera', tool_id: 'ui.capture.video' },
    photo: { type: 'tool', label: 'Photo', icon: 'photo_camera', tool_id: 'ui.capture.photo' }
};

const findNode = (node, predicate) => {
    if (!node) return null;
    if (predicate(node)) return node;
    for (const child of node.children || []) {
        const found = findNode(child, predicate);
        if (found) return found;
    }
    return null;
};

const treeState = (visuals = new Map()) => ({
    activePaletteKey: 'capture',
    externalOpenByToolId: new Map(),
    hoveredId: '',
    latchedByToolId: new Map(),
    pressedId: '',
    recordingVisualByToolId: visuals
});

afterEach(() => {
    vi.useRealTimers();
});

test('main menu projects audio scope, video thumbnail and photo flash inside their Bevy tools', () => {
    const visuals = new Map([
        ['ui.capture.audio', {
            kind: 'audio_scope', phase: 'recording', sessionId: 'audio_1', sequence: 2,
            scope: { pairs: Array.from({ length: 64 }, (_, index) => [-index / 64, index / 64]) }
        }],
        ['ui.capture.video', {
            kind: 'video_preview', phase: 'recording', sessionId: 'video_1', sourceId: 'capture://video_1'
        }],
        ['ui.capture.photo', {
            kind: 'photo_flash', phase: 'recording', sessionId: 'photo_1', flashOpacity: 0.9
        }]
    ]);
    const tree = buildBevyMainMenuTree({
        content,
        surface,
        itemSize: 70,
        state: treeState(visuals),
        handlers: {}
    });

    const audioItem = findNode(tree.root, (node) => node.id.endsWith('capture__audio'));
    const videoItem = findNode(tree.root, (node) => node.id.endsWith('capture__video'));
    const photoItem = findNode(tree.root, (node) => node.id.endsWith('capture__photo'));
    assert.ok(audioItem);
    assert.ok(videoItem);
    assert.ok(photoItem);
    assert.equal(audioItem.children.some((node) => node.id.endsWith('_icon')), false);
    assert.equal(audioItem.children.filter((node) => node.id.includes('_recording_scope_bar_')).length, 32);
    const videoPreview = videoItem.children.find((node) => node.id.endsWith('_recording_video'));
    assert.equal(videoPreview.kind, 'image');
    assert.equal(videoPreview.overlayRecord.type, 'video');
    assert.equal(videoPreview.overlayRecord.properties.source, 'capture://video_1');
    assert.ok(videoPreview.style.position[0] >= 0 && videoPreview.style.position[0] < 70);
    assert.ok(videoPreview.style.position[1] >= 0 && videoPreview.style.position[1] < 70);
    assert.equal(
        videoPreview.overlayRecord.properties.left,
        videoItem.style.position[0] + videoPreview.style.position[0]
    );
    assert.equal(
        videoPreview.overlayRecord.properties.top,
        videoItem.style.position[1] + videoPreview.style.position[1]
    );
    assert.equal(photoItem.children.some((node) => node.id.endsWith('_icon')), true);
    const flash = photoItem.children.find((node) => node.id.endsWith('_recording_flash'));
    assert.equal(flash.overlayRecord.type, 'shape');
    assert.equal(flash.overlayRecord.properties.opacity, 0.9);

    assert.doesNotThrow(() => normalizeBevyUiTree({ id: tree.id, tree }));
});

test('recording visual runtime rejects stale scope frames and stale cleanup', async () => {
    const state = { activePaletteKey: '', recordingVisualByToolId: new Map() };
    const render = vi.fn(async () => true);
    const runtime = createMainMenuRecordingVisualRuntime({
        state,
        render,
        content: () => content,
        items: () => [{ id: 'menu_audio', toolId: 'ui.capture.audio' }],
        scheduleRender: render
    });
    await runtime.setToolRecordingVisual({
        toolId: 'ui.capture.audio', sessionId: 'new_session', kind: 'audio_scope', phase: 'recording'
    });
    assert.equal(state.activePaletteKey, 'capture');
    assert.equal(runtime.pushToolAudioScope({
        toolId: 'ui.capture.audio', sessionId: 'old_session', sequence: 1,
        sampleRate: 48_000, channels: 1, pairs: [[-0.5, 0.5]]
    }), false);
    assert.equal(await runtime.clearToolRecordingVisual({
        toolId: 'ui.capture.audio', sessionId: 'old_session'
    }), false);
    assert.equal(runtime.pushToolAudioScope({
        toolId: 'ui.capture.audio', sessionId: 'new_session', sequence: 4,
        sampleRate: 48_000, channels: 1, pairs: [[-0.5, 0.5]]
    }), true);
    assert.equal(runtime.pushToolAudioScope({
        toolId: 'ui.capture.audio', sessionId: 'new_session', sequence: 3,
        sampleRate: 48_000, channels: 1, pairs: [[-1, 1]]
    }), false);
    assert.equal(state.recordingVisualByToolId.get('ui.capture.audio').sequence, 4);
});

test('audio scope decimation is bounded, normalized and derived from the recorded PCM', () => {
    const pcm = Float32Array.from({ length: 256 }, (_, index) => Math.sin(index / 8) * 1.4);
    const frame = createAudioScopeFrame({
        pcm,
        sequence: 7,
        sampleRate: 48_000,
        channels: 1,
        pairCount: 64
    });
    assert.equal(frame.sequence, 7);
    assert.equal(frame.pairs.length, 64);
    assert.equal(frame.sample_rate, 48_000);
    assert.ok(frame.peak > 0);
    frame.pairs.forEach(([minimum, maximum]) => {
        assert.ok(minimum >= -1 && minimum <= maximum);
        assert.ok(maximum <= 1);
    });
});

test('capture feedback binds the live sources and clears only the matching session', async () => {
    const pushed = [];
    const menu = {
        setToolRecordingVisual: vi.fn(async ({ toolId }) => ({
            ok: true,
            recordId: toolId === 'ui.capture.video' ? 'bevy_video_record' : 'bevy_audio_record'
        })),
        pushToolAudioScope: vi.fn((frame) => pushed.push(frame)),
        clearToolRecordingVisual: vi.fn(async () => true)
    };
    let audioListener = null;
    const unsubscribe = vi.fn();
    const unregisterVideo = vi.fn();
    const stream = { getTracks: () => [{ stop: vi.fn() }] };
    const state = { activeSession: null, sequence: 0 };
    const runtime = createCaptureRecordingFeedbackRuntime({
        captureVisualState: state,
        menuResolver: () => menu,
        audioScopeSubscriber: (listener) => {
            audioListener = listener;
            return unsubscribe;
        },
        audioStateResolver: () => ({ stream: null }),
        videoStateResolver: () => ({ stream }),
        videoStreamRegistrar: vi.fn(() => ({ ok: true, dispose: unregisterVideo }))
    });

    const audio = await runtime.startCaptureVisualSession({ kind: 'audio' });
    audioListener({ sequence: 1, sample_rate: 48_000, channels: 1, pairs: [[-0.2, 0.2]] });
    assert.equal(pushed[0].sessionId, audio.id);
    const video = await runtime.startCaptureVisualSession({ kind: 'video' });
    assert.equal(unsubscribe.mock.calls.length, 1);
    assert.equal(menu.clearToolRecordingVisual.mock.calls[0][0].sessionId, audio.id);
    assert.ok(video.id !== audio.id);
    await video.dispose();
    assert.equal(unregisterVideo.mock.calls.length, 1);
    assert.equal(stream.getTracks()[0].stop.mock.calls.length, 0);
});

test('video feedback refuses a recording phase when neither stream nor native frames are available', async () => {
    const menu = {
        setToolRecordingVisual: vi.fn(async () => ({ ok: true, recordId: 'video_record' })),
        clearToolRecordingVisual: vi.fn(async () => true)
    };
    const runtime = createCaptureRecordingFeedbackRuntime({
        captureVisualState: { activeSession: null, sequence: 0 },
        menuResolver: () => menu,
        videoStateResolver: () => ({ stream: null, readNativePreviewFrame: null })
    });
    await assert.rejects(
        runtime.startCaptureVisualSession({ kind: 'video' }),
        /capture_video_preview_source_unavailable/
    );
});

test('photo feedback is a 120 ms Bevy flash without a preview source', async () => {
    vi.useFakeTimers();
    const menu = {
        setToolRecordingVisual: vi.fn(async () => ({ ok: true })),
        clearToolRecordingVisual: vi.fn(async () => true)
    };
    const runtime = createCaptureRecordingFeedbackRuntime({
        captureVisualState: { activeSession: null, sequence: 0 },
        menuResolver: () => menu
    });
    const pending = runtime.flashPhotoCapture();
    await vi.advanceTimersByTimeAsync(120);
    await pending;
    assert.equal(menu.setToolRecordingVisual.mock.calls[0][0].kind, 'photo_flash');
    assert.equal('sourceId' in menu.setToolRecordingVisual.mock.calls[0][0], false);
    assert.equal(menu.clearToolRecordingVisual.mock.calls.length, 1);
});

test('native BGRA preview polling pushes a bounded RGBA texture into the matching Bevy session', async () => {
    const pushed = [];
    const menu = {
        setToolRecordingVisual: vi.fn(async () => ({ ok: true, recordId: 'native_video_record' })),
        pushToolVideoFrame: vi.fn((frame) => pushed.push(frame)),
        clearToolRecordingVisual: vi.fn(async () => true)
    };
    const runtime = createCaptureRecordingFeedbackRuntime({
        captureVisualState: { activeSession: null, sequence: 0 },
        menuResolver: () => menu,
        videoStateResolver: () => ({
            stream: null,
            nativePreviewSourceId: 'native_preview_1',
            readNativePreviewFrame: vi.fn(async () => ({
                available: true,
                source_id: 'native_preview_1',
                sequence: 4,
                width: 1,
                height: 1,
                pixel_format: 'bgra8',
                bytes_base64: btoa(String.fromCharCode(10, 20, 30, 255))
            }))
        })
    });
    const session = await runtime.startCaptureVisualSession({ kind: 'video' });
    await vi.waitFor(() => assert.equal(pushed.length, 1));
    assert.equal(pushed[0].sessionId, session.id);
    assert.deepEqual([...pushed[0].rgba], [30, 20, 10, 255]);
    await session.dispose();
});
