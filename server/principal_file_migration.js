import { createHash, randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import db from '../database/adole.js';
import { resolveLegacyPrincipalAlias } from './auth_identity.js';
import { normalizeUserRelativePath, resolveUserAssetPath } from './fileStorage.js';

const LEGACY_USER_PATH = /(?:^|\/)data\/users\/([^/]+)\/(.+)$/;

async function fileDigest(filePath) {
    const buffer = await fs.readFile(filePath);
    return createHash('sha256').update(buffer).digest('hex');
}

function readLegacyLocation(rawPath) {
    const normalized = String(rawPath || '').trim().replace(/\\/g, '/').replace(/^file:\/\//i, '');
    const match = normalized.match(LEGACY_USER_PATH);
    if (!match) return null;
    return {
        legacyPrincipalId: match[1],
        relativePath: match[2]
    };
}

export async function reconcilePrincipalFilePath({ projectRoot, meta, authenticatedPrincipalId }) {
    const rawPath = meta?.file_path || meta?.filePath || null;
    const location = readLegacyLocation(rawPath);
    if (!location) return null;

    const principalId = String(authenticatedPrincipalId || '').trim();
    const ownerId = String(meta?.owner_id || '').trim();
    if (!principalId || !ownerId || principalId !== ownerId) {
        return { error: 'Access denied', status: 403 };
    }
    if (location.legacyPrincipalId === principalId) return null;

    const aliasedPrincipal = await resolveLegacyPrincipalAlias(
        db.getDataSourceAdapter(),
        location.legacyPrincipalId
    );
    if (!aliasedPrincipal || String(aliasedPrincipal) !== principalId) {
        return { error: 'Access denied', status: 403 };
    }

    const sourceRelative = normalizeUserRelativePath(rawPath, location.legacyPrincipalId);
    const source = await resolveUserAssetPath(projectRoot, { id: location.legacyPrincipalId }, sourceRelative);
    const target = await resolveUserAssetPath(projectRoot, { id: principalId }, location.relativePath);
    const canonicalPath = `data/users/${principalId}/${target.relativePath}`;
    const values = {
        atomeId: meta.atome_id,
        legacyPrincipalId: location.legacyPrincipalId,
        principalId,
        sourcePath: source.filePath,
        targetPath: target.filePath,
        canonicalPath
    };
    await db.preparePrincipalFileMigration(values);

    try {
        const sourceDigest = await fileDigest(source.filePath);
        let targetDigest = null;
        try { targetDigest = await fileDigest(target.filePath); } catch (error) {
            if (error?.code !== 'ENOENT') throw error;
        }
        if (targetDigest && targetDigest !== sourceDigest) {
            throw new Error('principal_file_target_conflict');
        }
        if (!targetDigest) {
            const temporaryPath = `${target.filePath}.migration-${randomUUID()}.tmp`;
            try {
                await fs.copyFile(source.filePath, temporaryPath);
                await fs.rename(temporaryPath, target.filePath);
            } finally {
                await fs.unlink(temporaryPath).catch(() => {});
            }
        }
        await db.completePrincipalFileMigration({ ...values, digest: sourceDigest });
        return { filePath: target.filePath, canonicalPath, migrated: !targetDigest };
    } catch (error) {
        await db.failPrincipalFileMigration(values, error).catch(() => {});
        throw error;
    }
}

export const __PRINCIPAL_FILE_MIGRATION_TEST_ONLY__ = {
    readLegacyLocation
};
