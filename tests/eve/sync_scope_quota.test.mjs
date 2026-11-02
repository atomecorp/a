import assert from 'node:assert/strict';
import { afterEach, test } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { readFileSync } from 'node:fs';
import { SyncEngine, releaseLegacySyncScopes } from '../../atome/src/squirrel/apis/unified/sync_engine.js';
import { createSyncScopeStore } from '../../atome/src/squirrel/apis/unified/sync_scope_store.js';
import { setCurrentProjectCache } from '../../atome/src/squirrel/apis/unified/adole_api/session.js';

// BUG-012/013 (iPhone 1.46 build 44): 66 295 sync streams and their cursors filled the WebKit
// localStorage quota (~5 M UTF-16 characters), so the project opening's current-project write
// (projects.js#setCurrent -> session.js#setCurrentProjectCache) threw and the activation fell back
// to the Dashboard. These cases replay that state against the real engine and the real write.
const QUOTA_CHARS = 5 * 1024 * 1024;
const STREAMS_KEY = 'squirrel_sync_streams_v1';
const CURSORS_KEY = 'squirrel_sync_cursors_v1';
const DEVICE_KEY = 'squirrel_sync_device_id_v1';
const SYNC_URL = 'wss://sync.example/ws/sync';
const SCOPE = `${SYNC_URL}|user-a`;
const COUNT = 66295;

class QuotaStorage {
    constructor() { this.values = new Map(); }
    used() { let total = 0; for (const [key, value] of this.values) total += key.length + value.length; return total; }
    getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
    setItem(key, value) {
        const text = String(value), previous = this.values.has(key) ? key.length + this.values.get(key).length : 0;
        if (this.used() - previous + key.length + text.length > QUOTA_CHARS) {
            throw Object.assign(new Error('The quota has been exceeded.'), { name: 'QuotaExceededError' });
        }
        this.values.set(key, text);
    }
    removeItem(key) { this.values.delete(key); }
    clear() { this.values.clear(); }
}

const streamId = (index) => `9f0c${String(index).padStart(4, '0')}-6b1d-4c2e-9a3f-${String(index).padStart(12, '0')}`;
// The state read on the device: both legacy keys hold the whole scope and the quota is full.
const saturated = ({ device = true, streamsRaw = null, cursorsRaw = null } = {}) => {
    const storage = new QuotaStorage(), streams = Array.from({ length: COUNT }, (_, index) => streamId(index));
    if (device) storage.values.set(DEVICE_KEY, 'device-iphone');
    storage.values.set(STREAMS_KEY, streamsRaw ?? JSON.stringify({ [SCOPE]: streams }));
    storage.values.set(CURSORS_KEY, cursorsRaw ?? JSON.stringify({ [SCOPE]: Object.fromEntries(streams.map((id, index) => [id, index + 1])) }));
    return storage;
};

const previousStorage = globalThis.localStorage;
afterEach(() => { globalThis.localStorage = previousStorage; });

const createEnv = (storage, indexedDB = new IDBFactory()) => {
    globalThis.localStorage = storage; // the storage session.js writes the current project to
    return {
        __SQUIRREL_FASTIFY_WS_SYNC_URL__: SYNC_URL,
        __currentUser: { id: 'user-a' },
        localStorage: storage,
        indexedDB,
        crypto: { randomUUID: () => 'device-new' },
        CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options?.detail; } },
        addEventListener() {},
        dispatchEvent() {}
    };
};
const openProject = () => setCurrentProjectCache({ id: 'project-1', name: 'Projet', userId: 'user-a', updatedAt: 1 });
const engineFor = (env) => new SyncEngine({ env, WebSocketClass: class {}, token: () => 'signed-token' });

test('the device state reproduces the failed project opening before the legacy scopes are released', () => {
    const storage = saturated();
    globalThis.localStorage = storage;
    assert.ok(storage.used() > QUOTA_CHARS - 1000);
    assert.throws(openProject, { name: 'QuotaExceededError' });
});

test('releasing the legacy scopes keeps every stream and cursor and lets the project opening write', async () => {
    const env = createEnv(saturated()), engine = engineFor(env);
    assert.deepEqual(await engine.legacyRelease, { unreadable: [] });
    assert.equal(await engine.scopeLoad, true);
    assert.equal(engine.streams.size, COUNT + 1); // + directory.public
    assert.equal(engine.cursors[streamId(COUNT - 1)], COUNT);
    assert.equal(env.localStorage.getItem(STREAMS_KEY), null);
    assert.equal(env.localStorage.getItem(CURSORS_KEY), null);
    openProject();
    assert.equal(JSON.parse(env.localStorage.getItem('squirrel_current_project_v2')).id, 'project-1');
});

test('a missing device id is kept in memory and written only once the quota is released', async () => {
    const env = createEnv(saturated({ device: false }));
    const engine = engineFor(env); // used to throw QuotaExceededError here: no release ever ran
    assert.equal(engine.source, 'device-new');
    await engine.legacyRelease;
    await engine.devicePersisted;
    assert.equal(env.localStorage.getItem(DEVICE_KEY), 'device-new');
    openProject();
});

test('an unreadable legacy key is preserved verbatim in IndexedDB, freed from localStorage and reported', async () => {
    const broken = `{"${SCOPE}":["${streamId(1)}"`; // truncated JSON
    const env = createEnv(saturated({ streamsRaw: broken })), engine = engineFor(env);
    assert.deepEqual(await engine.legacyRelease, { unreadable: [STREAMS_KEY] });
    assert.match(engine.error, /^sync_scope_legacy_unreadable:squirrel_sync_streams_v1/);
    assert.equal(env.localStorage.getItem(STREAMS_KEY), null);
    assert.deepEqual(await createSyncScopeStore(env).readUnreadable(), [{ key: STREAMS_KEY, raw: broken }]);
    // The readable key still moved: its cursors are kept, the streams come back from the server.
    assert.equal(await engine.scopeLoad, true);
    assert.equal(engine.cursors[streamId(7)], 8);
    openProject();
});

test('a failed move keeps both keys, is reported, and the next load retries it', async () => {
    const storage = saturated(), indexedDB = new IDBFactory(), env = createEnv(storage, indexedDB);
    const open = indexedDB.open.bind(indexedDB);
    let failures = 1;
    indexedDB.open = (...args) => {
        if (failures-- > 0) {
            const request = {};
            setTimeout(() => { request.error = new Error('disk_full'); request.onerror?.(); });
            return request;
        }
        return open(...args);
    };
    const engine = engineFor(env);
    assert.equal(await engine.legacyRelease, null);
    assert.match(engine.error, /^sync_scope_release_failed:disk_full/);
    assert.notEqual(storage.getItem(STREAMS_KEY), null);
    assert.notEqual(storage.getItem(CURSORS_KEY), null);
    assert.equal(await engine.loadScope(), true);
    assert.equal(engine.streams.size, COUNT + 1);
    assert.equal(storage.getItem(STREAMS_KEY), null);
    openProject();
});

test('the boot releases the legacy scopes before its first later write, and the engine still reports them', async () => {
    const broken = '{"not json';
    const env = createEnv(saturated({ cursorsRaw: broken }));
    assert.deepEqual(await releaseLegacySyncScopes(env), { unreadable: [CURSORS_KEY] });
    openProject(); // an opening during the rest of the boot finds the quota free
    const engine = engineFor(env);
    await engine.legacyRelease;
    assert.match(engine.error, /^sync_scope_legacy_unreadable:squirrel_sync_cursors_v1/);
    assert.equal(await engine.scopeLoad, true);
    assert.equal(engine.streams.size, COUNT + 1);
});

test('spark awaits the release right after its boot wave, before the kickstart and the engine', () => {
    const spark = readFileSync(new URL('../../atome/src/squirrel/spark.js', import.meta.url), 'utf8');
    const release = spark.indexOf('await Promise.allSettled([releaseLegacySyncScopes(');
    assert.ok(release > spark.indexOf('await loadBootWave(SPARK_COMPONENT_MODULES)'));
    assert.ok(release < spark.indexOf('modules: kickstartModule'));
    assert.ok(release < spark.indexOf('installSyncEngine(globalThis'));
});
