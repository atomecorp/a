import assert from 'node:assert/strict';

const storage = new Map();
globalThis.window = {
    location: {
        protocol: 'http:',
        hostname: 'localhost',
        port: '8000'
    }
};
globalThis.localStorage = {
    getItem(key) {
        return storage.has(key) ? storage.get(key) : null;
    },
    setItem(key, value) {
        storage.set(key, String(value));
    },
    removeItem(key) {
        storage.delete(key);
    }
};

const session = await import('../../atome/src/squirrel/apis/unified/adole_api/session.js');
session.setCurrentProjectCache({
    id: 'previous_project',
    name: 'Previous project',
    userId: 'previous_user',
    updatedAt: 1
});

const { migratePreviousWorkspace } = await import('../../atome/src/squirrel/apis/unified/adole_api/auth_workspace.js');

await migratePreviousWorkspace(
    { mode: 'authenticated', user: { id: 'next_user' } },
    null,
    'next_user'
);

assert.equal(
    storage.has('squirrel_current_project_v2'),
    false,
    'previous workspace migration must clear stale project cache when no recoverable source exists'
);
assert.equal(
    session.getCurrentProjectCache(),
    null,
    'previous workspace migration must clear the in-memory current project cache'
);

console.log('auth_workspace_cache_contract.test: PASS');
