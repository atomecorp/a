import assert from 'node:assert/strict';

const createStorage = () => ({
    store: new Map(),
    getItem(key) {
        return this.store.has(key) ? this.store.get(key) : null;
    },
    setItem(key, value) {
        this.store.set(key, String(value));
    },
    removeItem(key) {
        this.store.delete(key);
    }
});

globalThis.window = {
    location: { protocol: 'http:', hostname: 'localhost', port: '3000', origin: 'http://localhost:3000' },
    addEventListener() { },
    removeEventListener() { },
    dispatchEvent() { }
};
globalThis.localStorage = createStorage();
globalThis.sessionStorage = createStorage();

const { __ATOME_COMMIT_TEST_ONLY__ } = await import('../../eVe/core/atome_commit.js');

assert.equal(
    __ATOME_COMMIT_TEST_ONLY__.isTauriRuntime(),
    true,
    'localhost:3000 must be treated as the local Tauri/Axum runtime'
);
assert.equal(
    __ATOME_COMMIT_TEST_ONLY__.resolveBackendPreference(),
    'tauri',
    'atome_commit must keep state_current refreshes on Tauri for localhost:3000'
);

const event = __ATOME_COMMIT_TEST_ONLY__.normalizeEventInput({
    kind: 'set',
    atome_id: 'shape_a',
    parentId: 'project_a',
    props: {
        id: 'wrong_id',
        atome_id: 'wrong_atome',
        type: 'wrong_type',
        owner_id: 'wrong_owner',
        project_id: 'wrong_project',
        media_type: 'image',
        visualType: 'video',
        selected: true,
        selection: ['shape_a'],
        left: '10px',
        top: '20px'
    }
});

assert.deepEqual(event.payload.props, {
    left: '10px',
    top: '20px'
});
assert.equal(event.props, undefined);
assert.equal(event.properties, undefined);
assert.equal(event.patch, undefined);
assert.equal(event.delta, undefined);
assert.equal(event.parent_id, 'project_a');
assert.equal(event.parentId, undefined);

console.log('atome_commit_sanitization: ok');
