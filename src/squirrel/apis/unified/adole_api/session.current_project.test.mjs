import assert from 'node:assert/strict';

globalThis.window = {};

const localStorageStore = new Map();

globalThis.localStorage = {
    getItem(key) {
        return localStorageStore.has(key) ? localStorageStore.get(key) : null;
    },
    setItem(key, value) {
        localStorageStore.set(key, String(value));
    },
    removeItem(key) {
        localStorageStore.delete(key);
    }
};

const session = await import('./session.js');

session.setCurrentProjectCache({
    id: 'project_ios_1',
    name: 'iOS project',
    userId: 'anon_user_ios',
    updatedAt: 123
});

assert.equal(session.getCurrentProjectCache().id, 'project_ios_1');
assert.equal(
    JSON.parse(localStorageStore.get('squirrel_current_project_v2')).id,
    'project_ios_1',
    'current project must be written to durable storage'
);

const reloadedSession = await import(`./session.js?reload=${Date.now()}`);
assert.equal(
    reloadedSession.getCurrentProjectCache().id,
    'project_ios_1',
    'current project must survive a module reload'
);

reloadedSession.clearCurrentProjectCache();
assert.equal(localStorageStore.has('squirrel_current_project_v2'), false);
assert.equal(reloadedSession.getCurrentProjectCache(), null);

console.log('session_current_project: ok');
