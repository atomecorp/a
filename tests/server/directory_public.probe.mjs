import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import Database from 'better-sqlite3';

test('directory.public exposes consented display identities and redacted invalidations only', async () => {
    const databasePath = path.join(os.tmpdir(), `directory-public-${process.pid}-${Date.now()}.db`);
    const legacy = new Database(databasePath);
    legacy.exec(`CREATE TABLE directory_public_profiles (
        principal_id TEXT PRIMARY KEY,
        display_name TEXT NOT NULL,
        revision INTEGER NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);
    legacy.close();
    process.env.SQLITE_PATH = databasePath;
    const db = await import(`../../database/adole.js?directory=${Date.now()}`);
    const { createDirectoryPublicService } = await import(`../../server/directoryPublicService.js?directory=${Date.now()}`);
    const published = [];
    const vaultProfiles = new Map();
    const service = createDirectoryPublicService({
        syncRuntime: { publishDirectory: async (event) => published.push(event) },
        vaultRouter: {
            getState: async (requesterId, principalId) => vaultProfiles.get(String(principalId)) || null
        }
    });
    try {
        await db.initDatabase();
        const migratedColumns = await db.default.query('all', 'PRAGMA table_info(directory_public_profiles)');
        assert.equal(migratedColumns.some((column) => column.name === 'user_face'), true);
        await db.createAtome({
            id: 'public-user', type: 'user', owner: 'public-user', creator: 'public-user',
            properties: {
                username: '+33123456789', visibility: 'private', phone: '+33123456789',
                email: 'alice@example.test', password_hash: 'never-public',
                name: 'Public', first_name: 'Alice', nickname: 'Ally', user_face: '/alice.png',
                eve_profile: {
                    access: 'public', name: 'Public', first_name: 'Alice', nickname: 'Ally',
                    display_name_source: 'nickname', user_face: '/alice.png'
                }
            }
        });
        vaultProfiles.set('public-user', {
            properties: {
                visibility: 'public', access: 'public', name: 'Public', first_name: 'Alice',
                nickname: 'Ally', user_face: '/alice.png',
                eve_profile: {
                    access: 'public', name: 'Public', first_name: 'Alice', nickname: 'Ally',
                    display_name_source: 'nickname', user_face: '/alice.png'
                }
            }
        });
        await db.createAtome({
            id: 'private-user', type: 'user', owner: 'private-user', creator: 'private-user',
            properties: { username: 'Bob Private', visibility: 'private', phone: '+33999999999' }
        });
        await service.refreshPrincipal('public-user');
        await service.refreshPrincipal('private-user');
        await db.createAtome({
            id: 'fallback-user', type: 'user', owner: 'fallback-user', creator: 'fallback-user',
            properties: {
                visibility: 'public', name: 'Fallback Name', first_name: '', nickname: '',
                eve_profile: {
                    access: 'public', name: 'Fallback Name', first_name: '', nickname: '',
                    display_name_source: 'firstname'
                }
            }
        });
        await db.createAtome({
            id: 'unknown-user', type: 'user', owner: 'unknown-user', creator: 'unknown-user',
            properties: {
                visibility: 'public', username: '+33888888888',
                eve_profile: { access: 'public', display_name_source: 'name' }
            }
        });
        await db.createAtome({
            id: 'bootstrap-phone-user', type: 'user', owner: 'bootstrap-phone-user', creator: 'bootstrap-phone-user',
            properties: {
                visibility: 'public', access: 'public', username: '+33777777777', phone: '+33777777777',
                name: '+33777777777', eve_profile: { access: 'public' }
            }
        });
        await db.createAtome({
            id: 'name-user', type: 'user', owner: 'name-user', creator: 'name-user',
            properties: {
                visibility: 'public',
                eve_profile: { access: 'public', name: 'Family', first_name: 'Given', nickname: 'Alias', display_name_source: 'name' }
            }
        });
        await db.createAtome({
            id: 'firstname-user', type: 'user', owner: 'firstname-user', creator: 'firstname-user',
            properties: {
                visibility: 'public',
                eve_profile: { access: 'public', name: 'Family Two', first_name: 'Given Two', nickname: 'Alias Two', display_name_source: 'firstname' }
            }
        });
        await service.refreshPrincipal('fallback-user');
        await service.refreshPrincipal('unknown-user');
        await service.refreshPrincipal('bootstrap-phone-user');
        await service.refreshPrincipal('name-user');
        await service.refreshPrincipal('firstname-user');
        const entries = await service.list({ requesterId: 'private-user' });
        assert.deepEqual(
            entries.map((entry) => [entry.principal_id, entry.display_name]),
            [
                ['public-user', 'Ally'], ['fallback-user', 'Fallback Name'],
                ['name-user', 'Family'], ['firstname-user', 'Given Two']
            ]
        );
        assert.equal(entries.some((entry) => entry.principal_id === 'unknown-user'), false,
            'a public profile with no resolved name must not enter directory.public');
        assert.equal(entries.some((entry) => entry.principal_id === 'bootstrap-phone-user'), false,
            'a bootstrap phone alias must not be accepted as a public display name');
        const publicEntry = entries.find((entry) => entry.principal_id === 'public-user');
        assert.equal(publicEntry.display_name, 'Ally');
        assert.equal(publicEntry.user_face, '/alice.png');
        assert.equal((await service.list({ requesterId: 'public-user' }))
            .some((entry) => entry.principal_id === 'public-user'), false);
        assert.deepEqual(
            Object.keys(publicEntry).sort(),
            ['display_name', 'principal_id', 'revision', 'updated_at', 'user_face']
        );
        const serialized = JSON.stringify({ entries, events: await service.listEvents(0) });
        for (const forbidden of ['+33123456789', '+33888888888', '+33777777777', 'alice@example.test', 'never-public', '+33999999999', 'Alice']) {
            assert.equal(serialized.includes(forbidden), false);
        }
        assert.deepEqual(Object.keys(published[0].payload).sort(), ['action', 'principal_id', 'revision']);
        const publishedBeforeRepeat = published.length;
        await service.refreshPrincipal('public-user');
        assert.equal(published.length, publishedBeforeRepeat, 'an unchanged canonical profile must not create another revision');

        const protectedPhoto = await db.default.setPropertyPrivacyRule(
            'public-user',
            'user_face',
            { schemaVersion: 1, root: { source: 'actor', field: 'id', operator: 'eq', value: 'nobody' } },
            'public-user'
        );
        assert.equal(protectedPhoto.ok, true);
        assert.equal((await service.list({ requesterId: 'private-user' }))
            .find((entry) => entry.principal_id === 'public-user').user_face, null);

        await db.default.query('run', 'DELETE FROM directory_public_profiles');
        await service.rebuild();
        assert.equal((await service.list({ requesterId: 'private-user' }))
            .some((entry) => entry.principal_id === 'public-user'), true,
            'restart rebuild must restore the canonical vault profile rather than stale auth visibility');

        vaultProfiles.set('public-user', {
            properties: { visibility: 'private', access: 'private', eve_profile: { access: 'private' } }
        });
        await service.refreshPrincipal('public-user');
        assert.deepEqual(
            (await service.list()).map((entry) => entry.principal_id),
            ['fallback-user', 'name-user', 'firstname-user']
        );
        assert.equal(published.at(-1).payload.action, 'revoke');
        vaultProfiles.set('public-user', {
            properties: {
                eve_profile: { access: 'public', nickname: 'Restored', display_name_source: 'nickname' }
            }
        });
        await service.refreshPrincipal('public-user');
        const restored = (await service.list({ requesterId: 'private-user' }))
            .find((entry) => entry.principal_id === 'public-user');
        assert.equal(restored.display_name, 'Restored');
        assert.equal(restored.revision, published.at(-1).payload.revision,
            'a republished entry revision must match its invalidation after a revoke');
    } finally {
        await db.closeDatabase().catch(() => {});
        try { fs.unlinkSync(databasePath); } catch (_) { }
        delete process.env.SQLITE_PATH;
    }
});
