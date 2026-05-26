import assert from 'node:assert/strict';

const commits = [];
const renders = [];
const storage = {
    getItem: () => '',
    setItem: () => { },
    removeItem: () => { }
};

globalThis.window = {
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
        ensureProjectLayer: (projectId) => ({ projectId }),
        renderAtomeRecord: (record, layer) => {
            renders.push({ record, layer });
        }
    },
    location: { href: 'http://127.0.0.1:3000/' },
    localStorage: storage,
    sessionStorage: storage
};
globalThis.localStorage = storage;
globalThis.sessionStorage = storage;
globalThis.document = {
    querySelector: () => null
};

const { ensureProjectMediaAtome } = await import('../../eVe/domains/media/api/media_persistence_service.js');

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
assert.equal(renders.length, 1);
assert.equal(commits[0].project_id, 'project_a');
assertNoEnvelopeOrAliasProps(commits[0].props);
assert.equal(commits[0].props.media_user_id, 'user_a');
assert.equal(commits[0].props.media_kind, 'video');
assert.equal(commits[0].props.storage_root, 'recordings');
assertNoEnvelopeOrAliasProps(renders[0].record.properties);
assert.equal(renders[0].record.properties.media_user_id, 'user_a');
assert.equal(renders[0].record.properties.storage_root, 'recordings');
assert.match(renders[0].record.properties.media_url, /^\/api\/recordings\/video_1779220000000\.webm/);

commits.length = 0;
renders.length = 0;

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
assert.equal(renders.length, 1);
assert.equal(renders[0].record.id, 'video_recording_existing');
assert.equal(renders[0].record.type, 'video_recording');
assert.equal(renders[0].record.properties.recording_id, 'video_recording_existing');
assert.equal(renders[0].record.properties.kind, 'video_recording');
assert.equal(renders[0].record.properties.media_kind, 'video');
assertNoEnvelopeOrAliasProps(renders[0].record.properties);
assert.match(renders[0].record.properties.media_url, /^\/api\/recordings\/video_1779220000001\.webm/);

commits.length = 0;
renders.length = 0;

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
assert.equal(commits[0].props.left, 33);
assert.equal(commits[0].props.top, 44);
assert.equal(renders.length, 1);
assert.equal(renders[0].record.id, 'audio_recording_pending');
assert.equal(renders[0].record.properties.kind, 'audio_recording');

commits.length = 0;
renders.length = 0;

class ExistingHost {
    constructor() {
        this.style = {};
        this.dataset = { atomeId: 'video_recording_pending', atomeKind: 'video_recording' };
    }
}

globalThis.HTMLElement = ExistingHost;
const existingHost = new ExistingHost();
globalThis.document = {
    querySelector: (selector) => selector.includes('video_recording_pending') ? existingHost : null,
    getElementById: () => null
};

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
assert.equal(renders.length, 0);
assert.equal(existingHost.style.left, '77px');
assert.equal(existingHost.style.top, '88px');
assert.equal(existingHost.style.width, '333px');
assert.equal(existingHost.style.height, '187px');
assert.equal(existingHost.style.zIndex, '99');
assert.equal(existingHost.dataset.eveMediaSource.startsWith('/api/recordings/video_1779220000003.webm'), true);

console.log('media_persistence_service_sanitization: ok');
