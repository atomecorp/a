import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const commits = [];
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
    getProjectSceneState
} = await import('../../eVe/domains/rendering/project_scene_runtime.js');

clearAllProjectScenes();

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
        width: 320,
        height: 180
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
assert.match(commits[0].props.visual_ref, /^thumbnail:/);
assert.match(commits[0].props.thumbnail_ref, /^thumbnail:/);
assert.equal(commits[0].props.visual_status, 'pending');
assert.equal(latestSceneAtom().id, result.atomeId);
assert.equal(latestSceneAtom().type, 'video');
assert.match(latestSceneAtom().content.source, /\/api\/recordings\/video_1779220000000\.webm/);

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
assert.equal(reused.atomeId, 'video_recording_existing');
assert.equal(commits.length, 0);
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
        duration_sec: 1.25
    },
    accessToken: true,
    requireAdoleApi: true,
    resolvePlacement: () => ({ left: 33, top: 44, zIndex: 55 })
});

assert.equal(hydrated.ok, true);
assert.equal(hydrated.atomeId, 'audio_recording_pending');
assert.equal(commits.length, 1);
assert.equal(commits[0].atome_id, 'audio_recording_pending');
assert.equal(commits[0].props.kind, 'audio_recording');
assert.equal(commits[0].props.pending, false);
assert.equal(commits[0].props.media_pending, false);
assert.match(commits[0].props.visual_ref, /^waveform:/);
assert.match(commits[0].props.waveform_ref, /^waveform:/);
assert.equal(commits[0].props.left, 33);
assert.equal(commits[0].props.top, 44);
assert.equal(sceneRecords().some((atom) => atom.id === 'audio_recording_pending'), true);
assert.equal(latestSceneAtom().type, 'audio_waveform');

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
assert.equal(dom.window.document.querySelectorAll('.eve-atome,img,video,audio,svg').length, 0);

console.log('media_persistence_service_sanitization: ok');
