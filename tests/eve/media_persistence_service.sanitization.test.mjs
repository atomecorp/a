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

console.log('media_persistence_service_sanitization: ok');
