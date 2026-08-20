import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { afterEach, test } from 'vitest';

import {
    clearAllProjectScenes,
    getProjectSceneState,
    renderProjectScene
} from '../../eVe/domains/rendering/project_scene_runtime.js';
import {
    readSelectedProjectMediaPlaybackState,
    runSelectedProjectMediaPlaybackAction,
    stopSelectedProjectMediaPlaybackForProject,
    stopAllSelectedProjectMediaPlayback
} from '../../eVe/domains/media/selected_project_media_playback_runtime.js';
import { registerMediaReaderToolRuntime } from '../../eVe/intuition/runtime/eve_intuition/media_reader_tool_runtime.js';
import {
    BEVY_VIDEO_DECODE_STATE_EVENT,
    setBevyVideoDecodePlayback
} from '../../eVe/domains/rendering/bevy_video_decode_source_runtime.js';
import {
    rememberProjectAudioDurationForId,
    readProjectAudioPlaybackProgressForId
} from '../../eVe/domains/media/project_audio_playback_progress_runtime.js';

const setBox = (element, width, height) => {
    Object.defineProperty(element, 'clientWidth', { configurable: true, value: width });
    Object.defineProperty(element, 'clientHeight', { configurable: true, value: height });
    element.getBoundingClientRect = () => ({ left: 0, top: 0, right: width, bottom: height, width, height });
};

const createCompositor = (calls = []) => ({
    default: async () => {},
    resolve_bevy_media_texture: async () => ({ width: 1, height: 1, rgba: [255, 0, 0, 255] }),
    run_atome_bevy_renderer: () => {},
    apply_atome_bevy_resource: (payload) => calls.push({ type: 'resource', payload }),
    apply_atome_bevy_style: (payload) => calls.push({ type: 'style', payload }),
    apply_atome_bevy_layer: (payload) => calls.push({ type: 'layer', payload }),
    request_atome_bevy_redraw: () => calls.push({ type: 'redraw' }),
    register_atome_bevy_video_element: (atomeId, video) => calls.push({ type: 'register_video', atomeId, video }),
    unregister_atome_bevy_video_element: (atomeId) => calls.push({ type: 'unregister_video', atomeId })
});

const createProjectHost = async (records, calls = []) => {
    const dom = new JSDOM('<!doctype html><html><body><main id="project"></main></body></html>');
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    globalThis.HTMLElement = dom.window.HTMLElement;
    const host = dom.window.document.getElementById('project');
    setBox(host, 640, 360);
    await renderProjectScene({
        projectId: 'selected_project_media_playback',
        host,
        documentRef: dom.window.document,
        bevyWasmModule: createCompositor(calls),
        records
    });
    return dom;
};

afterEach(async () => {
    await stopAllSelectedProjectMediaPlayback(globalThis.window || null);
    clearAllProjectScenes();
    delete globalThis.window;
    delete globalThis.document;
    delete globalThis.HTMLElement;
});

test('selected project audio playback uses the canonical Kira audio runtime', async () => {
    const dom = await createProjectHost([
        {
            id: 'audio_a',
            type: 'audio_recording',
            properties: {
                kind: 'audio_recording',
                media_url: '/api/recordings/audio-a.wav?media_user_id=user_a',
                file_path: 'data/users/user_a/recordings/audio-a.wav',
                duration_sec: 4,
                left: 10,
                top: 12,
                width: 160,
                height: 48
            }
        }
    ]);
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    const calls = [];
    dom.window.Squirrel = {
        av: {
            audio: {
                unlockPlayback: async () => {
                    calls.push({ type: 'unlock' });
                    return true;
                },
                playback: {
                    loadAsset: async (payload) => {
                        calls.push({ type: 'load', payload });
                        return { ok: true };
                    }
                },
                play: async (payload) => {
                    calls.push({ type: 'play', payload });
                    return { ok: true };
                },
                stop: async (payload) => {
                    calls.push({ type: 'stop', payload });
                    return { ok: true };
                }
            }
        }
    };

    const result = await runSelectedProjectMediaPlaybackAction({
        action: 'play',
        atomeIds: ['audio_a'],
        windowRef: dom.window,
        documentRef: dom.window.document
    });

    assert.equal(result.ok, true);
    assert.equal(result.handled, true);
    assert.equal(result.selected_media_count, 1);
    assert.equal(calls[0].type, 'unlock');
    const loadCall = calls.find((entry) => entry.type === 'load');
    const playCall = calls.find((entry) => entry.type === 'play');
    assert.equal(loadCall.payload.id, 'selected_project_media:audio_a:audio');
    assert.equal(loadCall.payload.media_url, '/api/recordings/audio-a.wav?media_user_id=user_a');
    assert.equal(loadCall.payload.local_path, 'data/users/user_a/recordings/audio-a.wav');
    assert.equal(loadCall.payload.native_audio_path, 'data/users/user_a/recordings/audio-a.wav');
    assert.equal(playCall.payload.id, 'selected_project_media:audio_a:audio');
    assert.equal(dom.window.document.querySelectorAll('audio, video').length, 0);
    assert.equal(readProjectAudioPlaybackProgressForId('audio_a'), 0);
    await new Promise((resolve) => setTimeout(resolve, 0));
    const state = getProjectSceneState('selected_project_media_playback');
    const audioNode = state.projection.virtual_scene.nodes.find((node) => node.id === 'audio_a');
    assert.equal(audioNode.playbackProgress, 0);

    const stopResult = await stopAllSelectedProjectMediaPlayback(dom.window);
    assert.equal(stopResult.stopped_count, 1);
    assert.ok(calls.some((entry) => entry.type === 'stop' && entry.payload.id === 'selected_project_media:audio_a:audio'));
    assert.equal(readProjectAudioPlaybackProgressForId('audio_a'), null);
});

test('aggregate playback state drives mixed Play, all-active Stop, and project-scoped shutdown', async () => {
    const dom = await createProjectHost([
        { id: 'audio_mix_a', type: 'sound', properties: { kind: 'sound', media_url: '/api/recordings/a.wav' } },
        { id: 'audio_mix_b', type: 'sound', properties: { kind: 'sound', media_url: '/api/recordings/b.wav' } }
    ]);
    dom.window.Squirrel = {
        av: {
            audio: {
                playback: { loadAsset: async () => ({ ok: true }) },
                play_instance: async () => ({ ok: true }),
                play: async () => ({ ok: true }),
                stop_instance: async () => ({ ok: true }),
                stop: async () => ({ ok: true })
            }
        }
    };
    await runSelectedProjectMediaPlaybackAction({
        action: 'play', atomeIds: ['audio_mix_a'], windowRef: dom.window, documentRef: dom.window.document
    });
    assert.deepEqual(readSelectedProjectMediaPlaybackState(['audio_mix_a', 'audio_mix_b']), {
        playableIds: ['audio_mix_a', 'audio_mix_b'],
        activeIds: ['audio_mix_a'],
        anyPlaying: true,
        allPlaying: false
    });
    const mixedPlay = await runSelectedProjectMediaPlaybackAction({
        action: 'toggle', atomeIds: ['audio_mix_a', 'audio_mix_b'], windowRef: dom.window, documentRef: dom.window.document
    });
    assert.equal(mixedPlay.action, 'play');
    assert.equal(readSelectedProjectMediaPlaybackState(['audio_mix_a', 'audio_mix_b']).allPlaying, true);
    const allStop = await runSelectedProjectMediaPlaybackAction({
        action: 'toggle', atomeIds: ['audio_mix_a', 'audio_mix_b'], windowRef: dom.window, documentRef: dom.window.document
    });
    assert.equal(allStop.action, 'stop');
    assert.equal(readSelectedProjectMediaPlaybackState(['audio_mix_a', 'audio_mix_b']).anyPlaying, false);
    await runSelectedProjectMediaPlaybackAction({
        action: 'play', atomeIds: ['audio_mix_a'], windowRef: dom.window, documentRef: dom.window.document
    });
    const scopedStop = await stopSelectedProjectMediaPlaybackForProject('selected_project_media_playback', dom.window);
    assert.equal(scopedStop.stopped_count, 1);
    assert.equal(readSelectedProjectMediaPlaybackState(['audio_mix_a']).anyPlaying, false);
});

test('selected project playback does not invoke the browser unlock capability for Tauri Kira', async () => {
    const dom = await createProjectHost([
        {
            id: 'tauri_audio',
            type: 'audio_recording',
            properties: {
                kind: 'audio_recording',
                media_url: '/api/recordings/tauri-audio.wav?media_user_id=user_a',
                left: 10,
                top: 12,
                width: 160,
                height: 48
            }
        }
    ]);
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    const calls = [];
    dom.window.Squirrel = {
        av: {
            audio: {
                get_runtime: () => ({ playback: 'tauri_native_kira' }),
                unlockPlayback: () => { throw new Error('browser unlock must not run in Tauri'); },
                playback: { loadAsset: async () => { calls.push('load'); return { ok: true }; } },
                play: async () => { calls.push('play'); return { ok: true }; },
                stop: async () => ({ ok: true })
            }
        }
    };

    const result = await runSelectedProjectMediaPlaybackAction({
        action: 'play',
        atomeIds: ['tauri_audio'],
        windowRef: dom.window,
        documentRef: dom.window.document
    });

    assert.equal(result.ok, true);
    assert.deepEqual(calls, ['load', 'play']);
});

test('selected project audio playback can use runtime waveform duration without persisting it', async () => {
    const dom = await createProjectHost([
        {
            id: 'audio_runtime_duration',
            type: 'audio_recording',
            properties: {
                kind: 'audio_recording',
                media_url: '/api/recordings/runtime-duration.wav?media_user_id=user_a',
                file_path: 'data/users/user_a/recordings/runtime-duration.wav',
                left: 10,
                top: 12,
                width: 160,
                height: 48
            }
        }
    ]);
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    rememberProjectAudioDurationForId({
        atomeId: 'audio_runtime_duration',
        durationSeconds: 3
    });
    dom.window.Squirrel = {
        av: {
            audio: {
                playback: {
                    loadAsset: async () => ({ ok: true })
                },
                play: async () => ({ ok: true }),
                stop: async () => ({ ok: true })
            }
        }
    };

    const result = await runSelectedProjectMediaPlaybackAction({
        action: 'play',
        atomeIds: ['audio_runtime_duration'],
        windowRef: dom.window,
        documentRef: dom.window.document
    });

    assert.equal(result.ok, true);
    assert.equal(readProjectAudioPlaybackProgressForId('audio_runtime_duration'), 0);
    const state = getProjectSceneState('selected_project_media_playback');
    const record = state.records.find((entry) => entry.id === 'audio_runtime_duration');
    assert.equal(record.properties.duration_sec, undefined);

    await stopAllSelectedProjectMediaPlayback(dom.window);
});

test('selected project audio playback completes from the canonical Kira load duration', async () => {
    const dom = await createProjectHost([{
        id: 'audio_kira_duration',
        type: 'sound',
        owner_id: 'user_a',
        properties: {
            kind: 'sound',
            media_url: '/api/recordings/audio_1786640153885.wav?media_user_id=stale_owner',
            file_path: 'data/users/user_a/Downloads/audio_1786640153885.wav',
            left: 10,
            top: 12,
            width: 160,
            height: 48
        }
    }]);
    dom.window.Squirrel = {
        av: {
            audio: {
                playback: {
                    loadAsset: async () => ({ ok: true, result: { duration_seconds: 0.01 } })
                },
                play: async () => ({ ok: true }),
                stop: async () => ({ ok: true })
            }
        }
    };

    const result = await runSelectedProjectMediaPlaybackAction({
        action: 'play',
        atomeIds: ['audio_kira_duration'],
        windowRef: dom.window,
        documentRef: dom.window.document
    });

    assert.equal(result.ok, true);
    assert.equal(result.results[0].audio.source, '/api/uploads/audio_1786640153885.wav?media_user_id=user_a');
    assert.equal(readSelectedProjectMediaPlaybackState(['audio_kira_duration']).anyPlaying, true);
    await new Promise((resolve) => dom.window.setTimeout(resolve, 60));
    assert.equal(readSelectedProjectMediaPlaybackState(['audio_kira_duration']).anyPlaying, false);
});

test('selected project audio playback does not pass API routes as native local paths', async () => {
    const dom = await createProjectHost([
        {
            id: 'audio_http_only',
            type: 'audio_recording',
            properties: {
                kind: 'audio_recording',
                media_url: '/api/uploads/audio-http-only.wav?media_user_id=user_a',
                path: '/api/uploads/audio-http-only.wav?media_user_id=user_a',
                duration_sec: 4,
                left: 10,
                top: 12,
                width: 160,
                height: 48
            }
        }
    ]);
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    const calls = [];
    dom.window.Squirrel = {
        av: {
            audio: {
                playback: {
                    loadAsset: async (payload) => {
                        calls.push({ type: 'load', payload });
                        return { ok: true };
                    }
                },
                play: async (payload) => {
                    calls.push({ type: 'play', payload });
                    return { ok: true };
                },
                stop: async () => ({ ok: true })
            }
        }
    };

    const result = await runSelectedProjectMediaPlaybackAction({
        action: 'play',
        atomeIds: ['audio_http_only'],
        windowRef: dom.window,
        documentRef: dom.window.document
    });

    assert.equal(result.ok, true);
    assert.equal(calls[0].type, 'load');
    assert.match(calls[0].payload.media_url, /^\/api\/(?:uploads|recordings)\/audio-http-only\.wav\?media_user_id=user_a$/);
    assert.match(calls[0].payload.url, /^\/api\/(?:uploads|recordings)\/audio-http-only\.wav\?media_user_id=user_a$/);
    assert.equal(calls[0].payload.local_path, undefined);
    assert.equal(calls[0].payload.native_audio_path, undefined);

    await stopAllSelectedProjectMediaPlayback(dom.window);
});

test('recorded video replays durable extracted audio instead of a revoked preview URL', async () => {
    const dom = await createProjectHost([
        {
            id: 'recorded_video_with_audio',
            type: 'video_recording',
            properties: {
                kind: 'video_recording',
                media_url: 'blob:temporary-recording-preview',
                file_name: 'recorded-video.mp4',
                file_path: 'recordings/recorded-video.mp4',
                media_user_id: 'user_a',
                audio_track_count: 1,
                left: 10,
                top: 12,
                width: 160,
                height: 90
            }
        }
    ]);
    const calls = [];
    dom.window.Squirrel = {
        av: {
            audio: {
                playback: {
                    loadAsset: async (payload) => {
                        calls.push({ type: 'load', payload });
                        return { ok: true };
                    }
                },
                play_instance: async () => ({ ok: true }),
                play: async () => ({ ok: true }),
                stop_instance: async () => ({ ok: true }),
                stop: async () => ({ ok: true })
            }
        }
    };

    const result = await runSelectedProjectMediaPlaybackAction({
        action: 'play',
        atomeIds: ['recorded_video_with_audio'],
        windowRef: dom.window,
        documentRef: dom.window.document,
        projectTimelineAction: async () => ({ ok: true })
    });

    assert.equal(result.ok, true);
    assert.equal(calls.length, 1);
    assert.equal(
        calls[0].payload.media_url,
        '/api/extract-audio/recorded-video.mp4?source=recording&media_user_id=user_a'
    );
    assert.equal(calls[0].payload.native_audio_path, 'data/users/user_a/recordings/recorded-video.mp4');
});

test('a projected WhatsApp video end stops its source Atome even without persisted duration', async () => {
    const mediaUrl = '/api/uploads/WhatsApp_Video_2026-04-28_at_21.27.38.mp4?media_user_id=user_a';
    const dom = await createProjectHost([
        {
            id: 'whatsapp_video_source',
            type: 'video',
            properties: {
                kind: 'video',
                media_url: mediaUrl,
                file_path: 'Downloads/WhatsApp_Video_2026-04-28_at_21.27.38.mp4',
                media_user_id: 'user_a',
                left: 10,
                top: 12,
                width: 160,
                height: 90
            }
        },
        {
            id: '__eve_bevy_ui_whatsapp_visual',
            type: 'video',
            properties: {
                kind: 'video',
                media_url: mediaUrl,
                playback_source_atome_id: 'whatsapp_video_source',
                ephemeral: true,
                left: 180,
                top: 12,
                width: 160,
                height: 90
            }
        },
        {
            id: '__eve_bevy_ui_whatsapp_list_thumbnail',
            type: 'video',
            properties: {
                kind: 'video',
                media_url: mediaUrl,
                playback_source_atome_id: 'whatsapp_video_source',
                ephemeral: true,
                left: 350,
                top: 12,
                width: 160,
                height: 90
            }
        }
    ]);
    const audioCalls = [];
    dom.window.Squirrel = {
        av: {
            audio: {
                playback: { loadAsset: async () => ({ ok: true }) },
                play_instance: async () => ({ ok: true }),
                stop_instance: async (payload) => {
                    audioCalls.push({ action: 'stop_instance', payload });
                    return { ok: true };
                },
                play: async () => ({ ok: true }),
                stop: async (payload) => {
                    audioCalls.push({ action: 'stop', payload });
                    return { ok: true };
                }
            }
        }
    };
    const timelineActions = [];
    const projectTimelineAction = async ({ action, atomeIds }) => {
        timelineActions.push({ action, atomeIds });
        return { ok: true };
    };
    const started = await runSelectedProjectMediaPlaybackAction({
        action: 'play',
        atomeIds: ['whatsapp_video_source'],
        windowRef: dom.window,
        documentRef: dom.window.document,
        projectTimelineAction
    });
    assert.equal(started.ok, true);
    assert.equal(readSelectedProjectMediaPlaybackState(['whatsapp_video_source']).anyPlaying, true);

    dom.window.dispatchEvent(new dom.window.CustomEvent(BEVY_VIDEO_DECODE_STATE_EVENT, {
        detail: { id: '__eve_bevy_ui_whatsapp_visual', state: 'ended' }
    }));
    await new Promise((resolve) => setImmediate(resolve));
    dom.window.dispatchEvent(new dom.window.CustomEvent(BEVY_VIDEO_DECODE_STATE_EVENT, {
        detail: { id: '__eve_bevy_ui_whatsapp_list_thumbnail', state: 'ended' }
    }));
    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(readSelectedProjectMediaPlaybackState(['whatsapp_video_source']).anyPlaying, false);
    assert.equal(timelineActions.filter(({ action }) => action === 'stop').length, 2);
    assert.equal(audioCalls.some(({ action }) => action === 'stop_instance'), true);
});

test('recorded video with a declared audio track fails instead of masking a Kira load error', async () => {
    const dom = await createProjectHost([
        {
            id: 'recorded_video_audio_failure',
            type: 'video_recording',
            properties: {
                kind: 'video_recording',
                media_url: '/api/recordings/recorded-failure.mp4?media_user_id=user_a',
                audio_track_count: 1,
                left: 10,
                top: 12,
                width: 160,
                height: 90
            }
        }
    ]);
    dom.window.Squirrel = {
        av: {
            audio: {
                playback: { loadAsset: async () => ({ ok: false, error: 'kira_audio_load_failed' }) },
                play: async () => ({ ok: true }),
                stop: async () => ({ ok: true })
            }
        }
    };

    const timelineActions = [];
    const result = await runSelectedProjectMediaPlaybackAction({
        action: 'play',
        atomeIds: ['recorded_video_audio_failure'],
        windowRef: dom.window,
        documentRef: dom.window.document,
        projectTimelineAction: async ({ action }) => {
            timelineActions.push(action);
            return { ok: true };
        }
    });

    assert.equal(result.ok, false);
    assert.equal(result.results[0].error, 'kira_audio_load_failed');
    assert.equal(timelineActions.includes('play'), false);
    assert.equal(readSelectedProjectMediaPlaybackState(['recorded_video_audio_failure']).anyPlaying, false);
});

test('recorded video rolls its timeline back before publishing when the Kira voice refuses to start', async () => {
    const dom = await createProjectHost([
        {
            id: 'recorded_video_voice_failure',
            type: 'video_recording',
            properties: {
                kind: 'video_recording',
                media_url: 'blob:revoked-recording-preview',
                file_name: 'recorded-voice-failure.mp4',
                file_path: 'data/users/user_a/recordings/recorded-voice-failure.mp4',
                media_user_id: 'user_a',
                has_audio: true,
                audio_track_count: 1,
                left: 10,
                top: 12,
                width: 160,
                height: 90
            }
        }
    ]);
    const calls = [];
    const playbackEvents = [];
    const decoder = dom.window.document.querySelector('#eve_bevy_video_decode_root video');
    Object.defineProperty(decoder, 'pause', { configurable: true, value: () => {} });
    Object.defineProperty(decoder, 'play', { configurable: true, value: async () => {} });
    dom.window.addEventListener('eve:selected-project-media-playback-state', (event) => {
        playbackEvents.push(event.detail);
    });
    dom.window.Squirrel = {
        av: {
            audio: {
                playback: {
                    loadAsset: async (payload) => {
                        calls.push({ type: 'load', payload });
                        return { ok: true };
                    }
                },
                play_instance: async (payload) => {
                    calls.push({ type: 'play_instance', payload });
                    return { ok: false, error: 'kira_voice_start_failed' };
                },
                stop_instance: async (payload) => {
                    calls.push({ type: 'stop_instance', payload });
                    return { ok: true };
                },
                play: async () => ({ ok: true }),
                stop: async (payload) => {
                    calls.push({ type: 'stop', payload });
                    return { ok: true };
                }
            }
        }
    };
    const timelineActions = [];
    const result = await runSelectedProjectMediaPlaybackAction({
        action: 'play',
        atomeIds: ['recorded_video_voice_failure'],
        windowRef: dom.window,
        documentRef: dom.window.document,
        projectTimelineAction: async ({ action }) => {
            timelineActions.push(action);
            return { ok: true };
        }
    });

    assert.equal(result.ok, false);
    assert.equal(result.results[0].error, 'kira_voice_start_failed');
    assert.equal(result.results[0].rollback.ok, true);
    assert.deepEqual(timelineActions.slice(-2), ['play', 'stop']);
    const loadCall = calls.find((entry) => entry.type === 'load');
    assert.equal(loadCall.payload.media_url, '/api/extract-audio/recorded-voice-failure.mp4?source=recording&media_user_id=user_a');
    assert.equal(loadCall.payload.native_audio_path, 'data/users/user_a/recordings/recorded-voice-failure.mp4');
    assert.equal(calls.some((entry) => entry.type === 'stop_instance'), true);
    assert.equal(playbackEvents.some((event) => event.reason === 'play'), false);
    assert.equal(readSelectedProjectMediaPlaybackState(['recorded_video_voice_failure']).anyPlaying, false);
});

test('selected project audio toggle stops and restarts from zero', async () => {
    const dom = await createProjectHost([
        {
            id: 'audio_pause_resume',
            type: 'audio_recording',
            properties: {
                kind: 'audio_recording',
                media_url: '/api/recordings/audio-pause-resume.wav?media_user_id=user_a',
                file_path: 'data/users/user_a/recordings/audio-pause-resume.wav',
                duration_sec: 2,
                left: 10,
                top: 12,
                width: 160,
                height: 48
            }
        }
    ]);
    const calls = [];
    dom.window.Squirrel = {
        av: {
            audio: {
                playback: {
                    loadAsset: async (payload) => {
                        calls.push({ type: 'load', payload });
                        return { ok: true };
                    }
                },
                play_instance: async (payload) => {
                    calls.push({ type: 'play_instance', payload });
                    return { ok: true };
                },
                stop_instance: async (payload) => {
                    calls.push({ type: 'stop_instance', payload });
                    return { ok: true };
                },
                play: async (payload) => {
                    calls.push({ type: 'play', payload });
                    return { ok: true };
                },
                stop: async (payload) => {
                    calls.push({ type: 'stop', payload });
                    return { ok: true };
                }
            }
        }
    };

    const playResult = await runSelectedProjectMediaPlaybackAction({
        action: 'toggle',
        atomeIds: ['audio_pause_resume'],
        windowRef: dom.window,
        documentRef: dom.window.document
    });
    assert.equal(playResult.ok, true);
    assert.equal(calls.find((entry) => entry.type === 'play_instance')?.payload.startSeconds, 0);

    await new Promise((resolve) => setTimeout(resolve, 80));
    const stopResult = await runSelectedProjectMediaPlaybackAction({
        action: 'toggle',
        atomeIds: ['audio_pause_resume'],
        windowRef: dom.window,
        documentRef: dom.window.document
    });
    assert.equal(stopResult.ok, true);
    assert.equal(stopResult.action, 'stop');
    assert.equal(stopResult.active, false);
    assert.ok(calls.some((entry) => entry.type === 'stop_instance'));
    assert.equal(readProjectAudioPlaybackProgressForId('audio_pause_resume'), null);

    const resumeResult = await runSelectedProjectMediaPlaybackAction({
        action: 'toggle',
        atomeIds: ['audio_pause_resume'],
        windowRef: dom.window,
        documentRef: dom.window.document
    });
    assert.equal(resumeResult.ok, true);
    assert.equal(resumeResult.action, 'play');
    const resumeCall = calls.filter((entry) => entry.type === 'play_instance').at(-1);
    assert.equal(Number(resumeCall.payload.startSeconds), 0);
    assert.ok(readProjectAudioPlaybackProgressForId('audio_pause_resume') >= 0);

    await stopAllSelectedProjectMediaPlayback(dom.window);
});

test('selected project audio playback reports load failures instead of latching a false success', async () => {
    const dom = await createProjectHost([
        {
            id: 'audio_load_fail',
            type: 'audio_recording',
            properties: {
                kind: 'audio_recording',
                media_url: '/api/recordings/audio-load-fail.wav?media_user_id=user_a',
                file_path: 'data/users/user_a/recordings/audio-load-fail.wav',
                left: 10,
                top: 12,
                width: 160,
                height: 48
            }
        }
    ]);
    const calls = [];
    dom.window.Squirrel = {
        av: {
            audio: {
                playback: {
                    loadAsset: async (payload) => {
                        calls.push({ type: 'load', payload });
                        return { ok: false, error: 'native_load_rejected' };
                    }
                },
                play: async (payload) => {
                    calls.push({ type: 'play', payload });
                    return { ok: true };
                },
                stop: async () => ({ ok: true })
            }
        }
    };

    const result = await runSelectedProjectMediaPlaybackAction({
        action: 'play',
        atomeIds: ['audio_load_fail'],
        windowRef: dom.window,
        documentRef: dom.window.document
    });

    assert.equal(result.ok, false);
    assert.equal(result.handled, true);
    assert.equal(result.latched, false);
    assert.equal(result.active, false);
    assert.equal(result.succeeded, 0);
    assert.equal(result.failed, 1);
    assert.equal(result.results[0].error, 'native_load_rejected');
    assert.equal(result.results[0].audio.ok, false);
    assert.equal(result.results[0].video.ok, false);
    assert.deepEqual(calls.map((entry) => entry.type), ['load']);
});

test('selected project media playback declines non-media selections without touching audio runtime', async () => {
    const dom = await createProjectHost([
        {
            id: 'shape_a',
            type: 'shape',
            properties: {
                kind: 'shape',
                left: 10,
                top: 12,
                width: 160,
                height: 48
            }
        }
    ]);
    let audioTouched = false;
    dom.window.Squirrel = {
        av: {
            audio: {
                playback: {
                    loadAsset: async () => {
                        audioTouched = true;
                        return { ok: true };
                    }
                },
                play: async () => {
                    audioTouched = true;
                    return { ok: true };
                }
            }
        }
    };

    const result = await runSelectedProjectMediaPlaybackAction({
        action: 'play',
        atomeIds: ['shape_a'],
        windowRef: dom.window,
        documentRef: dom.window.document
    });

    assert.equal(result.ok, false);
    assert.equal(result.handled, false);
    assert.equal(result.error, 'selected_project_media_not_found');
    assert.equal(audioTouched, false);
});

test('selected project live video playback source contains no CPU frame extraction path', () => {
    const source = readFileSync(
        new URL('../../eVe/domains/media/selected_project_media_playback_runtime.js', import.meta.url),
        'utf8'
    );
    assert.doesNotMatch(source, /\bdrawImage\b/);
    assert.doesNotMatch(source, /\bgetImageData\b/);
    assert.doesNotMatch(source, /\btoDataURL\b/);
});

test('an intentional decoder stop suppresses only its cancelled play promise', async () => {
    const dom = await createProjectHost([
        {
            id: 'video_cancelled_play',
            type: 'video',
            properties: {
                kind: 'video',
                media_url: '/api/uploads/video-cancelled-play.mp4',
                left: 10,
                top: 12,
                width: 160,
                height: 90
            }
        },
        {
            id: 'video_active_refusal',
            type: 'video',
            properties: {
                kind: 'video',
                media_url: '/api/uploads/video-active-refusal.mp4',
                left: 180,
                top: 12,
                width: 160,
                height: 90
            }
        }
    ]);
    const decoderVideos = Array.from(dom.window.document.querySelectorAll('#eve_bevy_video_decode_root video'));
    const cancelledVideo = decoderVideos.find((video) => video.src.includes('video-cancelled-play.mp4'));
    const activeVideo = decoderVideos.find((video) => video.src.includes('video-active-refusal.mp4'));
    assert.ok(cancelledVideo);
    assert.ok(activeVideo);
    let rejectCancelled = null;
    Object.defineProperty(cancelledVideo, 'play', {
        configurable: true,
        value: () => new Promise((_, reject) => { rejectCancelled = reject; })
    });
    Object.defineProperty(cancelledVideo, 'pause', { configurable: true, value: () => {} });
    Object.defineProperty(activeVideo, 'play', {
        configurable: true,
        value: () => Promise.reject(new dom.window.DOMException('blocked', 'NotAllowedError'))
    });
    Object.defineProperty(activeVideo, 'pause', { configurable: true, value: () => {} });
    const warnings = [];
    const originalWarn = console.warn;
    console.warn = (...args) => warnings.push(args);
    try {
        setBevyVideoDecodePlayback(['video_cancelled_play'], true);
        setBevyVideoDecodePlayback(['video_cancelled_play'], false);
        rejectCancelled(new dom.window.DOMException('cancelled', 'AbortError'));
        setBevyVideoDecodePlayback(['video_active_refusal'], true);
        await Promise.resolve();
        await Promise.resolve();
    } finally {
        console.warn = originalWarn;
    }
    assert.equal(warnings.some((args) => args.includes('video_cancelled_play')), false);
    assert.equal(warnings.some((args) => args.includes('video_active_refusal') && args.includes('play_refused')), true);
});

test('selected project video playback is owned by the project timeline without CPU frame extraction', async () => {
    const calls = [];
    await createProjectHost([
        {
            id: 'video_gpu_a',
            type: 'video_recording',
            properties: {
                kind: 'video_recording',
                media_url: '/api/recordings/video-gpu-a.mp4?media_user_id=user_a',
                left: 10,
                top: 12,
                width: 160,
                height: 90
            }
        }
    ], calls);
    const dom = globalThis.window;
    const originalCreateElement = dom.document.createElement.bind(dom.document);
    dom.document.createElement = (tagName, ...args) => {
        const element = originalCreateElement(tagName, ...args);
        if (String(tagName || '').toLowerCase() === 'canvas') {
            element.getContext = () => {
                throw new Error('cpu_canvas_context_forbidden');
            };
            element.toDataURL = () => {
                throw new Error('cpu_canvas_data_url_forbidden');
            };
        }
        return element;
    };

    const result = await runSelectedProjectMediaPlaybackAction({
        action: 'play',
        atomeIds: ['video_gpu_a'],
        windowRef: dom,
        documentRef: dom.document
    });

    assert.equal(result.ok, false);
    assert.equal(result.succeeded, 0);
    assert.equal(result.results[0].error, 'selected_project_video_timeline_required');
    assert.equal(readProjectAudioPlaybackProgressForId('video_gpu_a'), null);
    assert.equal(calls.some((call) => call.type === 'register_video'), false);
    assert.equal(calls.some((call) => call.type === 'resource'), false);
    assert.equal(dom.document.querySelectorAll('canvas').length, 1);
    assert.equal(dom.document.querySelectorAll('#eve_bevy_video_decode_root video').length, 1);
    assert.equal(typeof dom.__EVE_BEVY_VIDEO_SOURCE_FOR_ID__, 'function');
    assert.equal(dom.__EVE_BEVY_VIDEO_SOURCE_FOR_ID__('video_gpu_a')?.tagName, 'VIDEO');
    assert.equal(dom.__EVE_BEVY_VIDEO_ACTIVE_FOR_ID__('video_gpu_a'), false);
    assert.equal(calls.some((call) => call.type === 'unregister_video'), false);
});

test('JeezsFire.mp4 reuses its voice after natural completion without retaining completed voices', async () => {
    const timelineCalls = [];
    const dom = await createProjectHost([
        {
            id: 'video_completion',
            type: 'video_recording',
            properties: {
                kind: 'video_recording',
                media_url: '/assets/videos/JeezsFire.mp4',
                file_path: 'atome/src/assets/videos/JeezsFire.mp4',
                duration_sec: 0.01,
                left: 10,
                top: 12,
                width: 160,
                height: 90
            }
        }
    ]);
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    const calls = [];
    dom.window.Squirrel = {
        av: {
            audio: {
                playback: { loadAsset: async (payload) => { calls.push({ type: 'load', payload }); return { ok: true }; } },
                play_instance: async (payload) => { calls.push({ type: 'play_instance', payload }); return { ok: true }; },
                stop_instance: async (payload) => { calls.push({ type: 'stop_instance', payload }); return { ok: true }; },
                play: async (payload) => { calls.push({ type: 'play', payload }); return { ok: true }; },
                stop: async () => ({ ok: true })
            }
        }
    };
    const projectTimelineAction = async ({ action }) => {
        timelineCalls.push(action);
        return { ok: true, target_playheads: { video_completion: 0 } };
    };

    const first = await runSelectedProjectMediaPlaybackAction({
        action: 'toggle', atomeIds: ['video_completion'], windowRef: dom.window, documentRef: dom.window.document, projectTimelineAction
    });
    assert.equal(first.ok, true);
    assert.equal(first.results[0].audio.ok, true);
    await new Promise((resolve) => setTimeout(resolve, 50));

    const second = await runSelectedProjectMediaPlaybackAction({
        action: 'toggle', atomeIds: ['video_completion'], windowRef: dom.window, documentRef: dom.window.document, projectTimelineAction
    });
    assert.equal(second.action, 'play');
    assert.equal(calls.filter((entry) => entry.type === 'play_instance').length, 2);
    assert.equal(
        calls.filter((entry) => entry.type === 'play_instance')[0].payload.voiceId,
        calls.filter((entry) => entry.type === 'play_instance')[1].payload.voiceId
    );
    assert.equal(calls.some((entry) => entry.type === 'stop_instance'), false);
    assert.deepEqual(timelineCalls, ['stop', 'play', 'stop', 'play']);
});

test('JeezsFire.mp4 restarts audio when the video decoder ended without a persisted duration', async () => {
    const dom = await createProjectHost([
        {
            id: 'jeezs_fire_without_duration',
            type: 'video',
            properties: {
                kind: 'video',
                media_url: '/api/uploads/JeezsFire.mp4',
                file_path: 'atome/src/assets/videos/JeezsFire.mp4',
                left: 10,
                top: 12,
                width: 160,
                height: 90
            }
        }
    ]);
    const calls = [];
    const order = [];
    dom.window.Squirrel = {
        av: {
            audio: {
                playback: { loadAsset: async (payload) => { calls.push({ type: 'load', payload }); return { ok: true }; } },
                play_instance: async (payload) => { calls.push({ type: 'play_instance', payload }); return { ok: true }; },
                stop_instance: async (payload) => { calls.push({ type: 'stop_instance', payload }); order.push('stop_instance'); return { ok: true }; },
                play: async () => ({ ok: true }),
                stop: async () => ({ ok: true })
            }
        }
    };
    const video = dom.window.document.querySelector('#eve_bevy_video_decode_root video');
    let timelineCalls = 0;
    const projectTimelineAction = async () => {
        timelineCalls += 1;
        order.push(`timeline:${timelineCalls}`);
        if (timelineCalls === 2) {
            Object.defineProperties(video, {
                ended: { configurable: true, value: false },
                currentTime: { configurable: true, value: 0 }
            });
        }
        return { ok: true, target_playheads: { jeezs_fire_without_duration: 0 } };
    };

    await runSelectedProjectMediaPlaybackAction({
        action: 'toggle', atomeIds: ['jeezs_fire_without_duration'], windowRef: dom.window, documentRef: dom.window.document, projectTimelineAction
    });
    Object.defineProperties(video, {
        ended: { configurable: true, value: true },
        duration: { configurable: true, value: 3 },
        currentTime: { configurable: true, value: 3 }
    });

    const second = await runSelectedProjectMediaPlaybackAction({
        action: 'toggle', atomeIds: ['jeezs_fire_without_duration'], windowRef: dom.window, documentRef: dom.window.document, projectTimelineAction
    });
    assert.equal(second.action, 'play');
    assert.equal(calls.filter((entry) => entry.type === 'play_instance').length, 2);
    assert.equal(calls.filter((entry) => entry.type === 'play_instance').length, 2);
    assert.deepEqual(order.slice(-3), ['stop_instance', 'timeline:3', 'timeline:4']);
});

test('ui.play lets the media reader release completed JeezsFire audio before restarting the decoder', async () => {
    const dom = await createProjectHost([
        {
            id: 'jeezs_fire_ui_play',
            type: 'video',
            properties: {
                kind: 'video',
                media_url: '/api/uploads/JeezsFire.mp4',
                file_path: 'atome/src/assets/videos/JeezsFire.mp4',
                left: 10,
                top: 12,
                width: 160,
                height: 90
            }
        },
        {
            id: 'jeezs_fire_ui_play_second_instance',
            type: 'video',
            properties: {
                kind: 'video',
                media_url: '/api/uploads/JeezsFire.mp4',
                file_path: 'atome/src/assets/videos/JeezsFire.mp4',
                left: 190,
                top: 12,
                width: 160,
                height: 90
            }
        }
    ]);
    const calls = [];
    dom.window.Squirrel = {
        av: {
            audio: {
                playback: { loadAsset: async (payload) => { calls.push({ type: 'load', payload }); return { ok: true }; } },
                play_instance: async (payload) => { calls.push({ type: 'play_instance', payload }); return { ok: true }; },
                stop_instance: async (payload) => { calls.push({ type: 'stop_instance', payload }); return { ok: true }; },
                play: async () => ({ ok: true }),
                stop: async () => ({ ok: true })
            }
        }
    };
    const tools = new Map();
    let selectedIds = ['jeezs_fire_ui_play'];
    registerMediaReaderToolRuntime({
        registerAtomeTool: (tool) => tools.set(tool.tool_id, tool),
        readSelectionSnapshot: () => ({ ids: selectedIds }),
        resolveCurrentProjectId: () => 'selected_project_media_playback',
        getAtomeElement: () => null,
        getAtomeRuntimeState: () => ({}),
        readExplicitLatched: () => null,
        syncToolLatchedState: () => {},
        getFooterActiveAtomeId: () => ''
    });
    const play = tools.get('ui.play')?.handler;
    assert.equal(typeof play, 'function');

    const videos = Array.from(dom.window.document.querySelectorAll('#eve_bevy_video_decode_root video'));
    assert.equal(videos.length, 2);
    let decoderPlayCalls = 0;
    videos.forEach((video) => {
        Object.defineProperty(video, 'play', {
            configurable: true,
            value: async () => { decoderPlayCalls += 1; }
        });
        Object.defineProperty(video, 'pause', {
            configurable: true,
            value: () => {}
        });
    });
    await play({ input: {} });
    Object.defineProperties(videos[0], {
        ended: { configurable: true, value: true },
        duration: { configurable: true, value: 5 },
        currentTime: { configurable: true, value: 5 }
    });
    await play({ input: {} });

    selectedIds = ['jeezs_fire_ui_play_second_instance'];
    await play({ input: {} });
    Object.defineProperties(videos[1], {
        ended: { configurable: true, value: true },
        duration: { configurable: true, value: 5 },
        currentTime: { configurable: true, value: 5 }
    });
    await play({ input: {} });

    const playCalls = calls.filter((entry) => entry.type === 'play_instance');
    assert.equal(playCalls.length, 4);
    assert.equal(calls.filter((entry) => entry.type === 'stop_instance').length, 2);
    assert.equal(playCalls[0].payload.assetId, playCalls[1].payload.assetId);
    assert.notEqual(playCalls[0].payload.assetId, playCalls[2].payload.assetId);
    assert.equal(playCalls[2].payload.assetId, playCalls[3].payload.assetId);
    assert.equal(decoderPlayCalls, 4);
});

test('selected project video playback does not fall back to CPU posters when timeline is required', async () => {
    await createProjectHost([
        {
            id: 'video_no_gpu_a',
            type: 'video_recording',
            properties: {
                kind: 'video_recording',
                media_url: '/api/recordings/video-no-gpu-a.mp4?media_user_id=user_a',
                left: 10,
                top: 12,
                width: 160,
                height: 90
            }
        }
    ]);
    const dom = globalThis.window;
    let cpuCanvasTouched = false;
    const originalCreateElement = dom.document.createElement.bind(dom.document);
    dom.document.createElement = (tagName, ...args) => {
        if (String(tagName || '').toLowerCase() === 'canvas') cpuCanvasTouched = true;
        return originalCreateElement(tagName, ...args);
    };

    const result = await runSelectedProjectMediaPlaybackAction({
        action: 'play',
        atomeIds: ['video_no_gpu_a'],
        windowRef: dom,
        documentRef: dom.document
    });

    assert.equal(result.ok, false);
    assert.equal(result.succeeded, 0);
    assert.equal(result.results[0].error, 'selected_project_video_timeline_required');
    assert.equal(cpuCanvasTouched, false);
});
