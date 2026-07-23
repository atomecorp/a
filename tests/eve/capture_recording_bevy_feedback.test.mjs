import assert from 'node:assert/strict';
import { afterEach, test, vi } from 'vitest';
import { buildBevyMainMenuItems, buildBevyMainMenuTree } from '../../eVe/intuition/ribbon/bevy_ui_main_menu_model.js';
import { buildBevyUiFlowerTree } from '../../eVe/intuition/ribbon/bevy_ui_flower_model.js';
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
    const treeFor = (visuals) => buildBevyMainMenuTree({
        content,
        surface,
        itemSize: 60,
        state: treeState(visuals),
        handlers: {}
    });
    const audioTree = treeFor(new Map([['ui.capture.audio', {
        kind: 'audio_scope', phase: 'recording', sessionId: 'audio_1', sequence: 2,
        scope: { pairs: Array.from({ length: 64 }, (_, index) => [-index / 64, index / 64]) }
    }]]));
    const videoTree = treeFor(new Map([['ui.capture.video', {
        kind: 'video_preview', phase: 'recording', sessionId: 'video_1', sourceId: 'capture://video_1'
    }]]));
    const photoTree = treeFor(new Map([['ui.capture.photo', {
        kind: 'photo_flash', phase: 'recording', sessionId: 'photo_1', flashOpacity: 0.9
    }]]));
    const audioItem = findNode(audioTree.root, (node) => node.id.endsWith('capture__audio'));
    const videoItem = findNode(videoTree.root, (node) => node.id.endsWith('capture__video'));
    const photoItem = findNode(photoTree.root, (node) => node.id.endsWith('capture__photo'));
    assert.ok(audioItem);
    assert.ok(videoItem);
    assert.ok(photoItem);
    assert.equal(audioItem.children.some((node) => node.id.endsWith('_icon')), false);
    assert.equal(audioItem.children.some((node) => node.id.endsWith('_label')), false);
    assert.equal(audioItem.children.filter((node) => node.id.includes('_recording_scope_bar_')).length, 64);
    const videoPreview = videoItem.children.find((node) => node.id.endsWith('_recording_video'));
    assert.equal(videoPreview.kind, 'image');
    assert.equal(videoPreview.overlayRecord.type, 'video');
    assert.equal(videoPreview.overlayRecord.properties.source, 'capture://video_1');
    assert.deepEqual(videoPreview.style.position, [0, 0]);
    assert.deepEqual(videoPreview.style.size, [60, 60]);
    assert.equal(videoPreview.overlayRecord.properties.width, 60);
    assert.equal(videoPreview.overlayRecord.properties.height, 60);
    assert.equal(videoPreview.overlayRecord.properties.fit, 'cover');
    assert.equal(videoItem.children.some((node) => node.id.endsWith('_label')), false);
    assert.equal(
        videoPreview.overlayRecord.properties.left,
        videoItem.style.position[0] + videoPreview.style.position[0]
    );
    assert.equal(
        videoPreview.overlayRecord.properties.top,
        videoItem.style.position[1] + videoPreview.style.position[1]
    );
    assert.equal(photoItem.children.some((node) => node.id.endsWith('_icon')), true);
    assert.equal(photoItem.children.some((node) => node.id.endsWith('_label')), true);
    const flash = photoItem.children.find((node) => node.id.endsWith('_recording_flash'));
    assert.equal(flash.overlayRecord.type, 'shape');
    assert.equal(flash.overlayRecord.properties.opacity, 0.9);
    assert.equal(flash.style.z_index > photoItem.children.find((node) => node.id.endsWith('_label')).style.z_index, true);

    assert.doesNotThrow(() => normalizeBevyUiTree({ id: audioTree.id, tree: audioTree }));
    assert.doesNotThrow(() => normalizeBevyUiTree({ id: videoTree.id, tree: videoTree }));
    assert.doesNotThrow(() => normalizeBevyUiTree({ id: photoTree.id, tree: photoTree }));
});

test('recording feedback keeps the main menu visible and projects the preview in its active tool', () => {
    assert.deepEqual(
        buildBevyMainMenuItems(content, { activePaletteKey: 'capture' }).map((item) => item.key),
        ['atome', 'capture', 'audio', 'video', 'photo']
    );
    const tree = buildBevyMainMenuTree({
        content,
        surface,
        itemSize: 60,
        state: treeState(new Map([['ui.capture.audio', {
            toolId: 'ui.capture.audio', kind: 'audio_scope', phase: 'recording', sessionId: 'audio_1'
        }]])),
        handlers: {}
    });
    assert.deepEqual(tree.visualItems.map((item) => item.key), ['photo', 'video', 'audio', 'capture', 'atome']);
    assert.equal(tree.layout.width, 300);
    const audioItem = findNode(tree.root, (node) => node.id.endsWith('capture__audio'));
    assert.ok(audioItem);
    assert.equal(audioItem.children.some((node) => node.id.endsWith('_icon')), false);
    assert.equal(audioItem.children.some((node) => node.id.endsWith('_label')), false);
    assert.equal(audioItem.children.filter((node) => node.id.includes('_recording_scope_bar_')).length, 64);
});

test('Flower keeps only its stationary recording tool visible', () => {
    const items = [
        { key: 'audio', label: 'Audio', icon: 'microphone', toolId: 'ui.capture.audio' },
        { key: 'video', label: 'Video', icon: 'video_camera', toolId: 'ui.capture.video' }
    ];
    const tree = buildBevyUiFlowerTree({
        surface,
        center: { x: 320, y: 240 },
        items,
        stationaryItem: items[0],
        stationaryPoint: { x: 320, y: 240 },
        recordingVisual: {
            kind: 'audio_scope', phase: 'recording', sessionId: 'flower_audio_1',
            scope: { pairs: Array.from({ length: 64 }, () => [-0.25, 0.25]) }
        }
    });
    assert.equal(tree.root.children.length, 1);
    assert.equal(tree.root.children[0].id.endsWith('_audio_0'), true);
    assert.equal(tree.root.children[0].children.filter((node) => node.id.includes('_recording_scope_bar_')).length, 64);
});

test('an orphaned recording visual never hides the canonical main menu', () => {
    const tree = buildBevyMainMenuTree({
        content,
        surface,
        itemSize: 60,
        state: treeState(new Map([['stale.capture', {
            toolId: 'stale.capture', kind: 'audio_scope', phase: 'recording', sessionId: 'stale_1'
        }]])),
        handlers: {}
    });
    assert.deepEqual(tree.visualItems.map((item) => item.key), ['photo', 'video', 'audio', 'capture', 'atome']);
});

test('audio scope uses fixed logarithmic levels without fake silence movement', () => {
    const heightsFor = (amplitude) => {
        const tree = buildBevyMainMenuTree({
            content,
            surface,
            itemSize: 60,
            state: treeState(new Map([['ui.capture.audio', {
                kind: 'audio_scope', phase: 'recording', sessionId: 'levels', sequence: 1,
                scope: { pairs: Array.from({ length: 64 }, () => [-amplitude, amplitude]) }
            }]])),
            handlers: {}
        });
        const item = findNode(tree.root, (node) => node.id.endsWith('capture__audio'));
        return item.children
            .filter((node) => node.id.includes('_recording_scope_bar_'))
            .map((node) => node.style.size[1]);
    };
    assert.deepEqual(new Set(heightsFor(0)), new Set([1]));
    assert.equal(heightsFor(0.01)[0], 20);
    assert.equal(heightsFor(0.25)[0] > heightsFor(0.01)[0], true);
    assert.equal(heightsFor(1)[0], 60);
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
    assert.equal(await runtime.clearToolRecordingVisual({
        toolId: 'ui.capture.audio', sessionId: 'new_session'
    }), true);
    assert.equal(state.activePaletteKey, 'capture');
    assert.deepEqual(buildBevyMainMenuItems(content, {
        activePaletteKey: state.activePaletteKey,
        recordingVisualByToolId: state.recordingVisualByToolId
    }).map((item) => item.key), ['atome', 'capture', 'audio', 'video', 'photo']);
});

test('audio scope keeps 64 real history columns, stays still in silence and redraws at most 30 Hz', async () => {
    const state = { activePaletteKey: '', recordingVisualByToolId: new Map() };
    const render = vi.fn(async () => true);
    let clock = 100;
    let pending = null;
    const runtime = createMainMenuRecordingVisualRuntime({
        state,
        render,
        content: () => content,
        items: () => [{ id: 'menu_audio', toolId: 'ui.capture.audio' }],
        scheduleRender: render,
        now: () => clock,
        setTimer: (callback, delay) => {
            pending = { callback, delay };
            return 7;
        },
        clearTimer: () => { pending = null; }
    });
    await runtime.setToolRecordingVisual({
        toolId: 'ui.capture.audio', sessionId: 'scope_session', kind: 'audio_scope', phase: 'recording'
    });
    render.mockClear();
    const silence = Array.from({ length: 64 }, () => [0, 0]);
    assert.equal(runtime.pushToolAudioScope({
        toolId: 'ui.capture.audio', sessionId: 'scope_session', sequence: 1, pairs: silence
    }), true);
    assert.equal(render.mock.calls.length, 0);
    clock = 110;
    assert.equal(runtime.pushToolAudioScope({
        toolId: 'ui.capture.audio', sessionId: 'scope_session', sequence: 2, pairs: silence
    }), true);
    assert.equal(render.mock.calls.length, 0);
    assert.equal(pending, null);
    assert.equal(runtime.pushToolAudioScope({
        toolId: 'ui.capture.audio', sessionId: 'scope_session', sequence: 3,
        pairs: Array.from({ length: 64 }, () => [-0.5, 0.5])
    }), true);
    assert.equal(render.mock.calls.length, 1);
    assert.equal(state.recordingVisualByToolId.get('ui.capture.audio').scope.pairs.length, 64);
    assert.deepEqual(state.recordingVisualByToolId.get('ui.capture.audio').scope.pairs.at(-1), [-0.5, 0.5]);
    clock = 111;
    assert.equal(runtime.pushToolAudioScope({
        toolId: 'ui.capture.audio', sessionId: 'scope_session', sequence: 4,
        pairs: Array.from({ length: 64 }, () => [-0.1, 0.2])
    }), true);
    assert.equal(pending.delay, 33);
    assert.deepEqual(state.recordingVisualByToolId.get('ui.capture.audio').scope.pairs.slice(-2), [
        [-0.5, 0.5], [-0.1, 0.2]
    ]);
    clock = 134;
    pending.callback();
    assert.equal(render.mock.calls.length, 2);
});

test('audio scope history distinguishes weak signal, voice and impulse without invented samples', async () => {
    const state = { activePaletteKey: '', recordingVisualByToolId: new Map() };
    const runtime = createMainMenuRecordingVisualRuntime({
        state,
        content: () => content,
        items: () => [{ id: 'menu_audio', toolId: 'ui.capture.audio' }],
        render: async () => true,
        scheduleRender: () => true
    });
    await runtime.setToolRecordingVisual({
        toolId: 'ui.capture.audio', sessionId: 'history', kind: 'audio_scope', phase: 'recording'
    });
    for (const [sequence, minimum, maximum] of [[1, -0.01, 0.01], [2, -0.35, 0.5], [3, -1, 1]]) {
        runtime.pushToolAudioScope({
            toolId: 'ui.capture.audio', sessionId: 'history', sequence,
            pairs: Array.from({ length: 64 }, () => [minimum, maximum])
        });
    }
    const history = state.recordingVisualByToolId.get('ui.capture.audio').scope.pairs;
    assert.equal(history.length, 64);
    assert.deepEqual(history.slice(-3), [[-0.01, 0.01], [-0.35, 0.5], [-1, 1]]);
    assert.equal(history.slice(0, 61).every(([minimum, maximum]) => minimum === 0 && maximum === 0), true);
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
        flowerResolver: () => menu,
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

test('capture feedback keeps Flower and main-menu visual sessions isolated', async () => {
    const flower = {
        setToolRecordingVisual: vi.fn(async () => ({ ok: true })),
        clearToolRecordingVisual: vi.fn(async () => true)
    };
    const mainMenu = {
        setToolRecordingVisual: vi.fn(async () => ({ ok: true })),
        clearToolRecordingVisual: vi.fn(async () => true)
    };
    const runtime = createCaptureRecordingFeedbackRuntime({
        captureVisualState: { activeSession: null, sequence: 0 },
        flowerResolver: () => flower,
        mainMenuResolver: () => mainMenu
    });

    const mainSession = await runtime.startCaptureVisualSession({ kind: 'audio', presentation: 'main_menu' });
    assert.equal(mainMenu.setToolRecordingVisual.mock.calls.length, 1);
    assert.equal(flower.setToolRecordingVisual.mock.calls.length, 0);
    await mainSession.dispose();
    assert.equal(mainMenu.clearToolRecordingVisual.mock.calls.length, 1);

    const flowerSession = await runtime.startCaptureVisualSession({ kind: 'audio', presentation: 'flower' });
    assert.equal(flower.setToolRecordingVisual.mock.calls.length, 1);
    await flowerSession.dispose();
    assert.equal(flower.clearToolRecordingVisual.mock.calls.length, 1);
});

test('two successive audio Flower sessions get independent scope subscriptions and leave no stale visual', async () => {
    const pushed = [];
    const subscribers = [];
    const menu = {
        setToolRecordingVisual: vi.fn(async () => ({ ok: true, recordId: 'flower_audio_record' })),
        pushToolAudioScope: vi.fn((frame) => pushed.push(frame)),
        clearToolRecordingVisual: vi.fn(async () => true)
    };
    const state = { activeSession: null, sequence: 0 };
    const runtime = createCaptureRecordingFeedbackRuntime({
        captureVisualState: state,
        flowerResolver: () => menu,
        audioScopeSubscriber: (listener) => {
            subscribers.push(listener);
            return () => { subscribers[subscribers.length - 1] = null; };
        }
    });

    const first = await runtime.startCaptureVisualSession({ kind: 'audio' });
    subscribers[0]({ sequence: 1, pairs: [[-0.2, 0.2]] });
    assert.equal(pushed.length, 1);
    await first.dispose();
    assert.equal(state.activeSession, null);
    assert.equal(menu.clearToolRecordingVisual.mock.calls[0][0].sessionId, first.id);

    const second = await runtime.startCaptureVisualSession({ kind: 'audio' });
    assert.notEqual(second.id, first.id);
    subscribers[0]?.({ sequence: 2, pairs: [[-1, 1]] });
    subscribers[1]({ sequence: 1, pairs: [[-0.4, 0.4]] });
    assert.equal(pushed.length, 2);
    assert.equal(pushed[1].sessionId, second.id);
    await second.dispose();
    assert.equal(state.activeSession, null);
    assert.equal(menu.clearToolRecordingVisual.mock.calls.length, 2);
    assert.equal(menu.clearToolRecordingVisual.mock.calls[1][0].sessionId, second.id);
});

test('video feedback refuses a recording phase when neither stream nor native frames are available', async () => {
    const menu = {
        setToolRecordingVisual: vi.fn(async () => ({ ok: true, recordId: 'video_record' })),
        clearToolRecordingVisual: vi.fn(async () => true)
    };
    const runtime = createCaptureRecordingFeedbackRuntime({
        captureVisualState: { activeSession: null, sequence: 0 },
        flowerResolver: () => menu,
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
        flowerResolver: () => menu
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
        flowerResolver: () => menu,
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
