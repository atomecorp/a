import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

test('directory.public exposes consented display identities and redacted invalidations only', async () => {
    const databasePath = path.join(os.tmpdir(), `directory-public-${process.pid}-${Date.now()}.db`);
    process.env.SQLITE_PATH = databasePath;
    const db = await import(`../../database/adole.js?directory=${Date.now()}`);
    const { createDirectoryPublicService } = await import(`../../server/directoryPublicService.js?directory=${Date.now()}`);
    const published = [];
    const service = createDirectoryPublicService({
        syncRuntime: { publishDirectory: async (event) => published.push(event) }
    });
    try {
        await db.initDatabase();
        await db.createAtome({
            id: 'public-user', type: 'user', owner: 'public-user', creator: 'public-user',
            properties: {
                username: 'Alice Public', visibility: 'public', phone: '+33123456789',
                email: 'alice@example.test', password_hash: 'never-public'
            }
        });
        await db.createAtome({
            id: 'private-user', type: 'user', owner: 'private-user', creator: 'private-user',
            properties: { username: 'Bob Private', visibility: 'private', phone: '+33999999999' }
        });
        await service.refreshPrincipal('public-user');
        await service.refreshPrincipal('private-user');
        const entries = await service.list();
        assert.deepEqual(entries.map((entry) => entry.principal_id), ['public-user']);
        assert.equal(entries[0].display_name, 'Alice Public');
        const serialized = JSON.stringify({ entries, events: await service.listEvents(0) });
        for (const forbidden of ['+33123456789', 'alice@example.test', 'never-public', '+33999999999']) {
            assert.equal(serialized.includes(forbidden), false);
        }
        assert.deepEqual(Object.keys(published[0].payload).sort(), ['action', 'principal_id', 'revision']);

        await db.default.query(
            'run',
            "UPDATE particles SET particle_value = '\"private\"' WHERE atome_id = ? AND particle_key = 'visibility'",
            ['public-user']
        );
        await service.refreshPrincipal('public-user');
        assert.deepEqual(await service.list(), []);
        assert.equal(published.at(-1).payload.action, 'revoke');
    } finally {
        await db.closeDatabase().catch(() => {});
        try { fs.unlinkSync(databasePath); } catch (_) { }
        delete process.env.SQLITE_PATH;
    }
});
