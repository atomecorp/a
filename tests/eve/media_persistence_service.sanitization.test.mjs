import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'vitest';
import { JSDOM } from 'jsdom';

const createTestCompositor = () => ({
    default: async () => {},
    resolve_bevy_media_texture: async () => ({
        width: 1,
        height: 1,
        rgba: [255, 0, 0, 255]
    }),
    run_atome_bevy_renderer: () => {},
    apply_atome_bevy_ops: () => {},
    apply_atome_bevy_spawn: () => {},
    apply_atome_bevy_despawn: () => {},
    apply_atome_bevy_transform: () => {},
    apply_atome_bevy_style: () => {},
    apply_atome_bevy_reparent: () => {},
    apply_atome_bevy_layer: () => {},
    apply_atome_bevy_visibility: () => {},
    apply_atome_bevy_resource: () => {},
    apply_atome_bevy_text_metadata: () => {},
    apply_atome_bevy_surface: () => {}
});

test('media persistence sanitizes recording Atomes and projects them through Bevy', async () => {
const commits = [];
let projectReloadCount = 0;
const storage = {
    getItem: () => '',
    setItem: () => { },
    removeItem: () => { }
};

const dom = new JSDOM('<!doctype html><html><body><main id="project"></main></body></html>', {
    url: 'http://127.0.0.1:3000/'
});
dom.window.HTMLMediaElement.prototype.load = () => {};
dom.window.HTMLMediaElement.prototype.pause = () => {};
globalThis.window = dom.window;
Object.assign(globalThis.window, {
    __currentProject: { id: 'project_a' },
    __currentUser: { user_id: 'user_a' },
    Atome: {
        commit: async (event) => {
            commits.push(event);
            return { ok: true };
        }
    },
    AdoleAPI: {
        atomes: {
            create: async () => ({ ok: true })
        },
        auth: {
            current: async () => ({ logged: true, user: { user_id: 'user_a' } })
        },
        projects: {
            getCurrentId: () => 'project_a'
        }
    },
    eveToolBase: {
        loadProjectAtomes: async () => {
            projectReloadCount += 1;
            return { ok: true };
        },
        ensureProjectLayer: () => dom.window.document.getElementById('project'),
        renderAtomeRecord: () => {
            throw new Error('project_media_must_not_call_renderAtomeRecord');
        }
    }
});
globalThis.localStorage = storage;
globalThis.sessionStorage = storage;
globalThis.document = dom.window.document;

const { ensureProjectMediaAtome } = await import('../../eVe/domains/media/api/media_persistence_service.js');
const {
    clearAllProjectScenes,
    getProjectSceneState,
    renderProjectScene
} = await import('../../eVe/domains/rendering/project_scene_runtime.js');

clearAllProjectScenes();
await renderProjectScene({
    projectId: 'project_a',
    records: [],
    host: dom.window.document.getElementById('project'),
    compositor: createTestCompositor()
});

const sceneRecords = () => getProjectSceneState('project_a')?.scene?.atoms || [];
const latestSceneAtom = () => sceneRecords().at(-1);

const assertNoEnvelopeOrAliasProps = (props = {}) => {
    [
        'id',
        'atome_id',
        'type',
        'owner_id',
        'ownerId',
        'project_id',
        'projectId',
        'parent_id',
        'parentId',
        'updated_at',
        'updatedAt',
        'media_type',
        'visualType'
    ].forEach((key) => assert.equal(Object.hasOwn(props, key), false, key));
};

const result = await ensureProjectMediaAtome({
    kind: 'video',
    fileName: 'video_1779220000000.webm',
    result: {
        file_path: 'data/users/user_a/recordings/video_1779220000000.webm',
        path: 'data/users/user_a/recordings/video_1779220000000.webm',
        duration_sec: 1.5,
        mime_type: 'video/webm',
        container: 'webm',
        size_bytes: 8192,
        width: 320,
        height: 180,
        orientation: 'landscape-right',
        nominal_fps: 30,
        video_track_count: 1,
        audio_track_count: 1,
        has_audio: true,
        codecs: ['vp9', 'opus'],
        video_codec: 'vp9',
        audio_codec: 'opus'
    },
    accessToken: true,
    requireAdoleApi: true
});

assert.equal(result.ok, true);
assert.equal(commits.length, 1);
assert.equal(sceneRecords().length, 1);
assert.equal(commits[0].project_id, 'project_a');
assertNoEnvelopeOrAliasProps(commits[0].props);
assert.equal(commits[0].props.media_user_id, 'user_a');
assert.equal(commits[0].props.media_kind, 'video');
assert.equal(commits[0].props.storage_root, 'recordings');
assert.equal(commits[0].props.mime_type, 'video/webm');
assert.equal(commits[0].props.container, 'webm');
assert.equal(commits[0].props.size_bytes, 8192);
assert.equal(commits[0].props.orientation, 'landscape-right');
assert.equal(commits[0].props.nominal_fps, 30);
assert.equal(commits[0].props.video_track_count, 1);
assert.equal(commits[0].props.audio_track_count, 1);
assert.equal(commits[0].props.has_audio, true);
assert.deepEqual(commits[0].props.codecs, ['vp9', 'opus']);
assert.equal(commits[0].props.media_width, 320);
assert.equal(commits[0].props.mediaWidth, 320);
assert.equal(commits[0].props.media_height, 180);
assert.equal(commits[0].props.mediaHeight, 180);
assert.equal(commits[0].props.natural_width, 320);
assert.equal(commits[0].props.naturalWidth, 320);
assert.equal(commits[0].props.natural_height, 180);
assert.equal(commits[0].props.naturalHeight, 180);
assert.equal(commits[0].props.source_width, 320);
assert.equal(commits[0].props.sourceWidth, 320);
assert.equal(commits[0].props.source_height, 180);
assert.equal(commits[0].props.sourceHeight, 180);
assert.match(commits[0].props.visual_ref, /^thumbnail:/);
assert.match(commits[0].props.thumbnail_ref, /^thumbnail:/);
assert.equal(commits[0].props.visual_status, 'pending');
assert.equal(latestSceneAtom().id, result.atomeId);
assert.equal(latestSceneAtom().type, 'video');
assert.match(latestSceneAtom().content.source, /\/api\/recordings\/video_1779220000000\.webm/);
assert.equal(latestSceneAtom().content.naturalWidth, 320);
assert.equal(latestSceneAtom().content.naturalHeight, 180);

commits.length = 0;

const reused = await ensureProjectMediaAtome({
    kind: 'video',
    fileName: 'video_1779220000001.webm',
    result: {
        atomeId: 'video_recording_existing',
        file_path: 'data/users/user_a/recordings/video_1779220000001.webm',
        path: 'data/users/user_a/recordings/video_1779220000001.webm',
        duration_sec: 2.5,
        width: 320,
        height: 180
    },
    accessToken: true,
    requireAdoleApi: true
});

assert.equal(reused.ok, true);
assert.equal(reused.created, false);
assert.equal(reused.reused, true);
assert.equal(reused.associated, true);
assert.equal(reused.atomeId, 'video_recording_existing');
assert.equal(commits.length, 1);
assert.equal(commits[0].atome_id, 'video_recording_existing');
assert.equal(commits[0].project_id, 'project_a');
assert.equal(commits[0].props.kind, 'video_recording');
assert.equal(commits[0].props.storage_root, 'recordings');
assert.equal(sceneRecords().some((atom) => atom.id === 'video_recording_existing'), true);
assert.equal(latestSceneAtom().type, 'video');
assert.match(latestSceneAtom().content.source, /\/api\/recordings\/video_1779220000001\.webm/);

commits.length = 0;

const hydrated = await ensureProjectMediaAtome({
    kind: 'sound',
    fileName: 'audio_1779220000002.wav',
    result: {
        project_atome_id: 'audio_recording_pending',
        file_path: 'data/users/user_a/recordings/audio_1779220000002.wav',
        path: 'data/users/user_a/recordings/audio_1779220000002.wav',
        duration_sec: 1.25,
        mime_type: 'audio/wav',
        container: 'wav',
        size_bytes: 120044,
        sample_rate: 48000,
        channels: 1,
        frame_count: 60000,
        waveform_peaks: [0.1, -0.25, 2, 'bad']
    },
    accessToken: true,
    requireAdoleApi: true,
    reloadProjectAtomes: true,
    resolvePlacement: () => ({
        left: 33,
        top: 44,
        zIndex: 55,
        order: 67,
        render_order: 67,
        renderOrder: 67
    })
});

assert.equal(hydrated.ok, true);
assert.equal(hydrated.atomeId, 'audio_recording_pending');
assert.equal(commits.length, 1);
assert.equal(commits[0].atome_id, 'audio_recording_pending');
assert.equal(commits[0].props.kind, 'audio_recording');
assert.equal(commits[0].props.pending, false);
assert.equal(commits[0].props.media_pending, false);
assert.equal(commits[0].props.mime_type, 'audio/wav');
assert.equal(commits[0].props.container, 'wav');
assert.equal(commits[0].props.size_bytes, 120044);
assert.equal(commits[0].props.sample_rate, 48000);
assert.equal(commits[0].props.channels, 1);
assert.equal(commits[0].props.frame_count, 60000);
assert.deepEqual(commits[0].props.peaks, [0.1, 0.25, 1]);
assert.deepEqual(commits[0].props.waveform_peaks, [0.1, 0.25, 1]);
assert.match(commits[0].props.visual_ref, /^waveform:/);
assert.match(commits[0].props.waveform_ref, /^waveform:/);
assert.equal(commits[0].props.left, 33);
assert.equal(commits[0].props.top, 44);
assert.equal(commits[0].props.order, 67);
assert.equal(commits[0].props.render_order, 67);
assert.equal(commits[0].props.renderOrder, 67);
assert.equal(sceneRecords().some((atom) => atom.id === 'audio_recording_pending'), true);
assert.equal(latestSceneAtom().type, 'audio_waveform');
assert.deepEqual(latestSceneAtom().content.peaks, [0.1, 0.25, 1]);
assert.equal(projectReloadCount, 1);

commits.length = 0;

const browserAudio = await ensureProjectMediaAtome({
    kind: 'sound',
    fileName: 'audio_1779220000004.wav',
    result: {
        file_path: 'data/users/user_a/recordings/audio_1779220000004.wav',
        path: 'data/users/user_a/recordings/audio_1779220000004.wav',
        duration_sec: 0.75,
        peaks: [0.4, 0.8]
    },
    accessToken: true,
    requireAdoleApi: true
});

assert.equal(browserAudio.ok, true);
assert.equal(commits.length, 1);
assert.equal(commits[0].props.kind, 'audio_recording');
assert.equal(commits[0].props.media_kind, 'sound');
assert.deepEqual(commits[0].props.waveform_peaks, [0.4, 0.8]);
const browserAudioSceneAtom = sceneRecords().find((atom) => atom.id === browserAudio.atomeId);
assert.equal(browserAudioSceneAtom.type, 'audio_waveform');
assert.deepEqual(browserAudioSceneAtom.content.peaks, [0.4, 0.8]);

commits.length = 0;

const photo = await ensureProjectMediaAtome({
    kind: 'image',
    fileName: 'photo_1779220000005.jpg',
    result: {
        file_path: 'data/users/user_a/captures/photo_1779220000005.jpg',
        path: 'data/users/user_a/captures/photo_1779220000005.jpg',
        mime_type: 'image/jpeg',
        container: 'jpeg',
        size_bytes: 4096,
        width: 640,
        height: 480
    },
    accessToken: true,
    requireAdoleApi: true
});

assert.equal(photo.ok, true);
assert.equal(commits.length, 1);
assert.equal(commits[0].props.kind, 'image');
assert.equal(commits[0].props.media_kind, 'image');
assert.equal(commits[0].props.media_source, 'upload');
assert.equal(commits[0].props.storage_root, 'captures');
assert.equal(commits[0].props.file_name, 'photo_1779220000005.jpg');
assert.equal(commits[0].props.mime_type, 'image/jpeg');
assert.equal(commits[0].props.container, 'jpeg');
assert.equal(commits[0].props.size_bytes, 4096);
assert.equal(commits[0].props.media_width, 640);
assert.equal(commits[0].props.media_height, 480);
assert.equal(Object.hasOwn(commits[0].props, 'pending'), false);
assert.equal(Object.hasOwn(commits[0].props, 'media_pending'), false);
assert.equal(Object.hasOwn(commits[0].props, 'recording_id'), false);
const photoSceneAtom = sceneRecords().find((atom) => atom.id === photo.atomeId);
assert.equal(photoSceneAtom.type, 'image');
assert.equal(photoSceneAtom.content.naturalWidth, 640);
assert.equal(photoSceneAtom.content.naturalHeight, 480);

commits.length = 0;

const existingHydrated = await ensureProjectMediaAtome({
    kind: 'video',
    fileName: 'video_1779220000003.webm',
    result: {
        project_atome_id: 'video_recording_pending',
        file_path: 'data/users/user_a/recordings/video_1779220000003.webm',
        path: 'data/users/user_a/recordings/video_1779220000003.webm',
        duration_sec: 2.75,
        width: 320,
        height: 180
    },
    accessToken: true,
    requireAdoleApi: true,
    resolvePlacement: () => ({ left: 77, top: 88, zIndex: 99 })
});

assert.equal(existingHydrated.ok, true);
assert.equal(existingHydrated.atomeId, 'video_recording_pending');
assert.equal(commits.length, 1);
assert.equal(commits[0].atome_id, 'video_recording_pending');
assert.match(commits[0].props.visual_ref, /^thumbnail:/);
assert.match(commits[0].props.thumbnail_ref, /^thumbnail:/);
assert.equal(sceneRecords().some((atom) => atom.id === 'video_recording_pending'), true);
assert.equal(dom.window.document.querySelectorAll('.eve-atome,img,audio,svg').length, 0);
assert.equal(dom.window.document.querySelectorAll('video:not(#eve_bevy_video_decode_root video)').length, 0);

}, 30000);

test('media persistence uses the shared Atome property sanitizer', () => {
    const source = fs.readFileSync('eVe/domains/media/api/media_persistence_service.js', 'utf8');
    assert.match(source, /from '\.\.\/\.\.\/\.\.\/\.\.\/atome\/src\/shared\/atome_contract\.js'/);
    assert.doesNotMatch(source, /RESERVED_ATOME_PROPERTY_KEYS/);
    assert.doesNotMatch(source, /const sanitizeAtomeProperties = \(/);
});
