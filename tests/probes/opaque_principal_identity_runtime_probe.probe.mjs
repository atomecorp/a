import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const directory = mkdtempSync(path.join(os.tmpdir(), 'eve-identity-'));
process.env.SQLITE_PATH = path.join(directory, 'adole.db');

const adole = await import('../../database/adole.js');
const identity = await import('../../server/auth_identity.js');

try {
    await adole.initDatabase();
    const dataSource = adole.getDataSourceAdapter();
    const legacyId = 'legacy-phone-derived-id';
    const now = new Date().toISOString();
    await dataSource.query(`INSERT INTO atomes
        (atome_id, atome_type, owner_id, creator_id, created_at, updated_at)
        VALUES (?, 'user', ?, ?, ?, ?)`, [legacyId, legacyId, legacyId, now, now]);
    for (const [key, value] of Object.entries({
        username: 'Legacy User',
        phone: '+15550001111',
        password_hash: 'legacy-hash',
        visibility: 'private',
        access: 'private'
    })) {
        await dataSource.query(`INSERT INTO particles
            (atome_id, particle_key, particle_value, updated_at)
            VALUES (?, ?, ?, ?)`, [legacyId, key, JSON.stringify(value), now]);
    }
    await dataSource.query(`INSERT INTO atomes
        (atome_id, atome_type, owner_id, creator_id, created_at, updated_at)
        VALUES (?, 'project', ?, ?, ?, ?)`, ['project-1', legacyId, legacyId, now, now]);

    const migrated = await identity.migrateLegacyPhonePrincipals(dataSource);
    assert.equal(migrated.length, 1);
    const principalId = migrated[0];
    assert.match(principalId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    const resolved = await identity.findPrincipalByPhone(dataSource, '+15550001111');
    assert.equal(resolved.user_id, principalId);
    const project = await dataSource.query('SELECT owner_id, creator_id FROM atomes WHERE atome_id = ?', ['project-1']);
    assert.deepEqual(project[0], { owner_id: principalId, creator_id: principalId });
    assert.equal(await identity.resolveLegacyPrincipalAlias(dataSource, legacyId), principalId);
    assert.deepEqual(await identity.migrateLegacyPhonePrincipals(dataSource), []);

    await identity.replaceVerifiedPhone(dataSource, principalId, '+15550002222');
    assert.equal(await identity.findPrincipalByPhone(dataSource, '+15550001111'), null);
    assert.equal((await identity.findPrincipalByPhone(dataSource, '+15550002222')).user_id, principalId);

    const reassignedId = 'reassigned-principal';
    await dataSource.query(`INSERT INTO atomes
        (atome_id, atome_type, owner_id, creator_id, created_at, updated_at)
        VALUES (?, 'user', ?, ?, ?, ?)`, [reassignedId, reassignedId, reassignedId, now, now]);
    await dataSource.query(`INSERT INTO particles
        (atome_id, particle_key, particle_value, updated_at)
        VALUES (?, 'username', ?, ?)`, [reassignedId, JSON.stringify('Reassigned'), now]);
    await identity.assignVerifiedPhone(dataSource, reassignedId, '+15550001111');
    assert.equal((await identity.findPrincipalByPhone(dataSource, '+15550001111')).user_id, reassignedId);
    await assert.rejects(
        () => identity.assignVerifiedPhone(dataSource, reassignedId, '+15550002222'),
        /phone_credential_already_assigned/
    );

    const resumedLegacyId = 'legacy-resume-id';
    const resumedPrincipalId = '0f8fad5b-d9cb-469f-a165-70867728950e';
    await dataSource.query(`INSERT INTO atomes
        (atome_id, atome_type, owner_id, creator_id, created_at, updated_at)
        VALUES (?, 'user', ?, ?, ?, ?)`, [resumedLegacyId, resumedLegacyId, resumedLegacyId, now, now]);
    for (const [key, value] of Object.entries({ username: 'Resume', phone: '+15550003333', password_hash: 'legacy-hash' })) {
        await dataSource.query(`INSERT INTO particles (atome_id, particle_key, particle_value, updated_at)
            VALUES (?, ?, ?, ?)`, [resumedLegacyId, key, JSON.stringify(value), now]);
    }
    await dataSource.query(`INSERT INTO principal_identity_migrations
        (legacy_principal_id, principal_id, status, created_at) VALUES (?, ?, 'prepared', ?)`,
    [resumedLegacyId, resumedPrincipalId, now]);
    assert.deepEqual(await identity.migrateLegacyPhonePrincipals(dataSource), [resumedPrincipalId]);
    assert.equal(await identity.resolveLegacyPrincipalAlias(dataSource, resumedLegacyId), resumedPrincipalId);
} finally {
    await adole.closeDatabase();
    rmSync(directory, { recursive: true, force: true });
}
