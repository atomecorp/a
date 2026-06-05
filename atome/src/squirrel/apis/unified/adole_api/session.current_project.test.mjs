import assert from 'node:assert/strict';
import { test } from 'vitest';

test('current project cache is durable across a WebView module reload', async () => {
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

    const session = await import('./session.js?test=project-cache-initial');

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
    assert.equal(
        JSON.parse(localStorageStore.get('squirrel_current_project_v2')).userId,
        'anon_user_ios',
        'current project cache must preserve the owning user id'
    );

    const reloadedSession = await import('./session.js?test=project-cache-reload');
    assert.equal(
        reloadedSession.getCurrentProjectCache().id,
        'project_ios_1',
        'current project must survive a module reload'
    );
    assert.equal(
        reloadedSession.getCurrentProjectCache().userId,
        'anon_user_ios',
        'current project owner must survive a module reload'
    );

    reloadedSession.clearCurrentProjectCache();
    assert.equal(localStorageStore.has('squirrel_current_project_v2'), false);
    assert.equal(reloadedSession.getCurrentProjectCache(), null);
});
