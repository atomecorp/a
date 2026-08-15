import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('server persistence entry points do not bypass the Atome event pipeline', async () => {
    const files = {
        'server/auth.js': await read('server/auth.js'),
        'server/server.js': await read('server/server.js'),
        'server/sharing.js': await read('server/sharing.js')
    };

    for (const [path, source] of Object.entries(files)) {
        assert.equal(source.includes('db.createAtome('), false, `${path} must not call db.createAtome directly`);
        assert.equal(source.includes('db.updateAtome('), false, `${path} must not call db.updateAtome directly`);
        assert.equal(source.includes('db.deleteAtome('), false, `${path} must not call db.deleteAtome directly`);
        assert.equal(source.includes('db.setParticle('), false, `${path} must not call db.setParticle directly`);
        assert.equal(source.includes('UPDATE state_current SET'), false, `${path} must not update state_current directly`);
        assert.equal(source.includes('INSERT INTO state_current'), false, `${path} must not insert state_current directly`);
    }
    assert.match(files['server/server.js'], /handleWsAtomeDeleteOperation/);
    assert.match(files['server/server.js'], /canReadAnyAtomeProperty\(id, requesterId\)/);
    assert.match(files['server/server.js'], /particle_delete_requires_canonical_event/);
});

test('runtime code imports the shared Atome sanitizer contract', async () => {
    const files = {
        'eVe/core/atome_commit.js': await read('eVe/core/atome_commit.js'),
        'eVe/intuition/runtime/tool_genesis.js': await read('eVe/intuition/runtime/tool_genesis.js'),
        'atome/src/squirrel/apis/unified/adole_api/atomes.js': await read('atome/src/squirrel/apis/unified/adole_api/atomes.js')
    };

    for (const [path, source] of Object.entries(files)) {
        assert.equal(source.includes('atome_property_sanitizer'), false, `${path} must not import the removed local sanitizer`);
        assert.equal(source.includes('const RESERVED_ATOME_PROPERTY_KEYS'), false, `${path} must not duplicate reserved key lists`);
    }
});

test('retired HTTP Atome persistence routes cannot reappear beside ws/api', async () => {
    const routeOwner = await read('server/atomeRoutes.orm.js');
    const serverEntry = await read('server/server.js');
    for (const forbidden of [
        'registerAtomeCrudRoutes',
        'registerAtomeEventRoutes',
        '/api/events/commit',
        '/api/atome/create'
    ]) {
        assert.equal(routeOwner.includes(forbidden), false, `route owner must not expose ${forbidden}`);
        assert.equal(serverEntry.includes(forbidden), false, `server entry must not expose ${forbidden}`);
    }
});
