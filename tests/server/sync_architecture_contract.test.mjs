import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'vitest';

const root = new URL('../..', import.meta.url);
const read = (relativePath) => fs.readFileSync(new URL(relativePath, root), 'utf8');

test('Fastify never queues canonical commits toward a client-local Tauri server', () => {
    const source = read('server/atomeRoutes.orm.js');
    assert.doesNotMatch(source, /SYNC_TARGET_SERVER\s*=\s*['"]tauri['"]/);
    assert.doesNotMatch(source, /syncTarget:\s*shouldEnqueue\s*\?\s*SYNC_TARGET_SERVER/);
});

test('one realtime owner delivers canonical events and the ws/api console bridge is absent', () => {
    const client = read('atome/src/squirrel/apis/unified/adole_websocket_message.js');
    assert.doesNotMatch(client, /command\.command\s*===\s*['"]share-sync['"]/);
});

test('the local host (Tauri, iOS) uses ws/api sync:push outbound and a persistent ws/sync inbound stream without polling', () => {
    const source = read('atome/servers/atome-server/src/local/local_atome_sync_worker.rs');
    assert.match(source, /"type"\s*:\s*"sync"[\s\S]*"action"\s*:\s*"push"/);
    assert.match(source, /\/ws\/sync/);
    assert.doesNotMatch(source, /"type"\s*:\s*"state-current"/);
    assert.doesNotMatch(source, /"action"\s*:\s*"pull"/);
});

test('the local host authenticates and subscribes before projecting canonical sync events, iOS included', () => {
    const source = read('atome/servers/atome-server/src/local/local_atome_ws_sync.rs');
    assert.match(source, /"type"\s*:\s*"auth"/);
    assert.match(source, /"type"\s*:\s*"subscribe"/);
    // The iOS app runs this same host in process (no Swift sync client of its own).
    assert.match(read('platforms/ios/bevy-renderer/src/local_server.rs'), /local::prepare\(/);
});

test('the open SyncEngine owner exists and implements replay controls', () => {
    const path = new URL('atome/src/squirrel/apis/unified/sync_engine.js', root);
    assert.equal(fs.existsSync(path), true);
    const source = fs.readFileSync(path, 'utf8');
    for (const control of ['auth', 'register', 'subscribe', 'ack', 'replay-complete']) {
        assert.match(source, new RegExp(control));
    }
});

test('manual linked sharing remains linked and detached copy stays explicit', () => {
    const source = read('server/syncSharingService.js');
    assert.doesNotMatch(source, /shareMode\s*===\s*['"]real-time['"]\s*\?\s*shareType\s*:\s*['"]copy['"]/);
    assert.match(source, /share_mode\s*!==\s*['"]manual['"]/);
    assert.match(source, /publication_cursor/);
});

test('Home server environment is device-local and never persisted in profile Atome preferences', () => {
    const actions = read('eVe/intuition/runtime/bevy_panel/bevy_panel_home_actions.js');
    const profile = read('eVe/domains/user/profile_api_support.js');
    assert.match(actions, /sync_environment/);
    assert.match(actions, /environmentFingerprint/);
    assert.doesNotMatch(actions, /preferences\.server/);
    assert.doesNotMatch(profile, /preferences\.server/);
});
