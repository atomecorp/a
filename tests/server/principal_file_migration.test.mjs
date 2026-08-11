import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

test('legacy principal media migration requires the authenticated alias and is idempotent', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'principal-file-migration-'));
    const dbPath = path.join(root, 'adole.db');
    process.env.SQLITE_PATH = dbPath;
    const db = await import(`../../database/adole.js?principal_file=${Date.now()}`);
    const database = db.default;
    const { reconcilePrincipalFilePath } = await import(`../../server/principal_file_migration.js?principal_file=${Date.now()}`);
    const { getFileMetadata } = await import(`../../server/userFiles.js?principal_file=${Date.now()}`);
    const legacyId = 'legacy_user';
    const principalId = 'opaque_user';
    const foreignId = 'foreign_user';
    const foreignLegacyId = 'foreign_legacy_user';
    const atomeId = 'file_legacy_video';
    const relativePath = 'recordings/video_1775543884506.webm';
    const oldPath = `data/users/${legacyId}/${relativePath}`;
    const sourcePath = path.join(root, oldPath);
    try {
        await db.initDatabase();
        const now = new Date().toISOString();
        for (const id of [principalId, foreignId]) {
            await database.query('run', `INSERT INTO atomes (atome_id, atome_type, owner_id, creator_id, created_at, updated_at)
                VALUES (?, 'user', ?, ?, ?, ?)`, [id, id, id, now, now]);
        }
        await database.query('run', `INSERT INTO atomes (atome_id, atome_type, owner_id, creator_id, created_at, updated_at)
            VALUES (?, 'video', ?, ?, ?, ?)`, [atomeId, principalId, principalId, now, now]);
        await database.query('run', `INSERT INTO principal_identity_aliases
            (alias_value, principal_id, alias_kind, created_at) VALUES (?, ?, 'legacy_principal', ?)`, [legacyId, principalId, now]);
        await database.query('run', `INSERT INTO principal_identity_aliases
            (alias_value, principal_id, alias_kind, created_at) VALUES (?, ?, 'legacy_principal', ?)`, [foreignLegacyId, foreignId, now]);
        await database.query('run', `INSERT INTO particles (atome_id, particle_key, particle_value, updated_at)
            VALUES (?, 'file_path', ?, ?)`, [atomeId, JSON.stringify(oldPath), now]);
        fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
        fs.writeFileSync(sourcePath, 'legacy-video-content');
        const meta = { atome_id: atomeId, owner_id: principalId, file_path: oldPath };

        assert.equal(await reconcilePrincipalFilePath({
            projectRoot: root,
            authenticatedPrincipalId: principalId,
            meta: { ...meta, file_path: `data/users/${principalId}/${relativePath}` }
        }), null);

        const denied = await reconcilePrincipalFilePath({ projectRoot: root, meta, authenticatedPrincipalId: foreignId });
        assert.deepEqual(denied, { error: 'Access denied', status: 403 });
        const foreignAliasDenied = await reconcilePrincipalFilePath({
            projectRoot: root,
            meta: { ...meta, file_path: `data/users/${foreignLegacyId}/${relativePath}` },
            authenticatedPrincipalId: principalId
        });
        assert.deepEqual(foreignAliasDenied, { error: 'Access denied', status: 403 });
        await assert.rejects(
            () => reconcilePrincipalFilePath({
                projectRoot: root,
                meta: { ...meta, file_path: `data/users/${legacyId}/recordings/missing.webm` },
                authenticatedPrincipalId: principalId
            }),
            (error) => error?.code === 'ENOENT'
        );
        const first = await reconcilePrincipalFilePath({ projectRoot: root, meta, authenticatedPrincipalId: principalId });
        assert.equal(first.migrated, true);
        assert.equal(fs.readFileSync(first.filePath, 'utf8'), 'legacy-video-content');
        assert.equal(fs.existsSync(sourcePath), true);
        const migratedMeta = await getFileMetadata(atomeId);
        assert.equal(migratedMeta.file_path, first.canonicalPath);
        const second = await reconcilePrincipalFilePath({ projectRoot: root, meta, authenticatedPrincipalId: principalId });
        assert.equal(second.migrated, false);
        const journal = await database.query('all', 'SELECT status FROM principal_file_migrations WHERE atome_id = ?', [atomeId]);
        assert.equal(journal.filter((entry) => entry.status === 'completed').length, 1);
        assert.equal(journal.filter((entry) => entry.status === 'failed').length, 1);
    } finally {
        await db.closeDatabase().catch(() => {});
        fs.rmSync(root, { recursive: true, force: true });
    }
});
