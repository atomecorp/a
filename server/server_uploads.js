/**
 * server uploads/downloads listing + download target resolution.
 */

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import db from '../database/adole.js';
import { sanitizeFileName, ensureUserDownloadsDir, normalizeUserRelativePath, resolveUserAssetPath, resolveUserFilePath } from './fileStorage.js';
import { getFileMetadata, canAccessFile } from './userFiles.js';
import { pickDisplayName } from './server_utils.js';
import { reconcilePrincipalFilePath } from './principal_file_migration.js';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Whether the shared database tracks file ownership and sharing. server.js sets it once
// from its own DATABASE_ENABLED: `.env` is read after this module is evaluated, so an
// import-time read of process.env would miss the database on dev and production.
let databaseEnabled = null;

export function configureUploadDatabase(enabled) {
  databaseEnabled = enabled === true;
}

function requireUploadDatabaseConfiguration() {
  if (databaseEnabled === null) {
    throw new Error('server_uploads: configureUploadDatabase() must run before downloads are resolved');
  }
  return databaseEnabled;
}

export async function listUserDownloadsSnapshot(userId) {
  if (!userId) {
    return { ok: false, error: 'Missing userId', downloadsDir: null, files: [] };
  }

  try {
    const { downloadsDir } = await ensureUserDownloadsDir(projectRoot, { id: userId });
    const entries = await fs.readdir(downloadsDir, { withFileTypes: true });
    const files = [];
    for (const entry of entries.slice(0, 50)) {
      const name = entry.name;
      if (!name) continue;
      if (entry.isFile()) {
        let size = null;
        try {
          const stats = await fs.stat(path.join(downloadsDir, name));
          size = stats?.size ?? null;
        } catch (error) {
          console.warn('[Downloads] unable to stat entry', { name, error: error?.message || String(error) });
        }
        files.push({ name, size });
      } else if (entry.isDirectory()) {
        files.push({ name: `${name}/`, size: null });
      }
    }
    return { ok: true, downloadsDir, files };
  } catch (error) {
    return {
      ok: false,
      error: error?.message || String(error),
      downloadsDir: null,
      files: []
    };
  }
}

export function resolveUploadsDir() {
  const customDir = typeof process.env.SQUIRREL_UPLOADS_DIR === 'string'
    ? process.env.SQUIRREL_UPLOADS_DIR.trim()
    : '';

  if (!customDir) {
    return null;
  }

  const absolute = path.isAbsolute(customDir)
    ? customDir
    : path.join(projectRoot, customDir);
  return path.resolve(absolute);
}

export async function listUserDownloads(userId, { vaultRouter }) {
  const { downloadsDir } = await ensureUserDownloadsDir(projectRoot, { id: userId });
  const entries = (await fs.readdir(downloadsDir, { withFileTypes: true })).filter((entry) => entry.isFile());
  // A stored file is named by the Atome that describes it in its owner's vault (the
  // name the person's file had); the anonymous principal has no vault.
  const descriptions = new Map();
  const storedNames = userId === 'anonymous' ? [] : entries.map((entry) => sanitizeFileName(entry.name));
  for (let start = 0; start < storedNames.length; start += 1000) {
    for (const row of await vaultRouter.describeFiles(userId, storedNames.slice(start, start + 1000))) {
      if (!descriptions.has(row.file_name)) descriptions.set(row.file_name, row);
    }
  }
  const files = [];

  for (const entry of entries) {
    const safeName = sanitizeFileName(entry.name);
    const absolutePath = path.join(downloadsDir, safeName);
    const description = descriptions.get(safeName) || null;
    try {
      const stats = await fs.stat(absolutePath);
      files.push({
        id: description?.atome_id || null,
        name: pickDisplayName(description, safeName),
        file_name: safeName,
        size: stats.size,
        modified: stats.mtime.toISOString(),
        owner_id: userId,
        access: 'owner',
        shared: false,
        profiles: description?.profiles || []
      });
    } catch (error) {
      console.warn('⚠️ Impossible de lire les métadonnées pour', absolutePath, error);
    }
  }

  files.sort((a, b) => b.modified.localeCompare(a.modified));
  return files;
}

export async function resolveDownloadTarget(fileParam, userId) {
  const raw = typeof fileParam === 'string' ? fileParam : String(fileParam || '');
  const safeParam = raw.trim();

  const useDatabase = requireUploadDatabaseConfiguration();

  if (useDatabase && safeParam) {
    let meta = await getFileMetadata(safeParam);
    if (meta && meta.atome_id !== safeParam) {
      meta = null;
    }

    if (!meta) {
      meta = await getFileMetadata(safeParam, { ownerId: userId });
    }

    if (meta) {
      const canRead = await canAccessFile(meta.atome_id, userId);
      if (!canRead) {
        console.warn('[Uploads] Access denied', {
          userId,
          fileParam: safeParam,
          atomeId: meta.atome_id,
          ownerId: meta.owner_id,
          fileName: meta.file_name || meta.original_name || null
        });
        return { error: 'Access denied', status: 403 };
      }
      const safeName = typeof meta.file_name === 'string' && meta.file_name.trim()
        ? meta.file_name
        : sanitizeFileName(meta.original_name || safeParam);
      const downloadName = typeof meta.original_name === 'string' && meta.original_name.trim()
        ? meta.original_name
        : safeName;
      const rawPath = meta.file_path || meta.filePath || null;
      if (rawPath) {
        const reconciled = await reconcilePrincipalFilePath({
          projectRoot,
          meta,
          authenticatedPrincipalId: userId
        });
        if (reconciled?.error) return reconciled;
        if (reconciled?.filePath) {
          await fs.access(reconciled.filePath);
          return { filePath: reconciled.filePath, downloadName, meta: { ...meta, file_path: reconciled.canonicalPath } };
        }
        const normalizedRelative = normalizeUserRelativePath(rawPath, meta.owner_id || userId);
        if (normalizedRelative) {
          const resolved = await resolveUserAssetPath(
            projectRoot,
            { id: meta.owner_id || userId },
            normalizedRelative
          );
          await fs.access(resolved.filePath);
          return { filePath: resolved.filePath, downloadName, meta };
        }
      }

      const filePath = await resolveUserFilePath(projectRoot, meta.owner_id || userId, safeName);
      await fs.access(filePath);
      return { filePath, downloadName, meta };
    }
  }

  // Un media PARTAGE (note vocale/video, media d'une News) garde la source de son auteur
  // (`/api/uploads/<nom>`), qui ne designe rien dans le dossier du destinataire. On cherche
  // alors, parmi les fichiers de ce nom, celui que ce compte a le DROIT de lire.
  if (useDatabase && safeParam && userId && userId !== 'anonymous') {
    const candidates = await db.query('all', `
      SELECT a.atome_id FROM atomes a
      JOIN particles p ON a.atome_id = p.atome_id
      WHERE p.particle_key = 'file_name' AND p.particle_value = ?
        AND a.owner_id != ? AND a.deleted_at IS NULL
      ORDER BY COALESCE(a.updated_at, a.created_at) DESC
      LIMIT 12
    `, [JSON.stringify(safeParam), String(userId)]);
    for (const candidate of (candidates || [])) {
      if (!await canAccessFile(candidate.atome_id, userId)) continue;
      const shared = await resolveDownloadTarget(candidate.atome_id, userId);
      if (shared?.filePath) return shared;
    }
  }

  const safeRequestedName = sanitizeFileName(safeParam);
  const userPath = await resolveUserFilePath(projectRoot, userId, safeRequestedName);
  try {
    await fs.access(userPath);
    return { filePath: userPath, downloadName: safeRequestedName, meta: null };
  } catch (error) {
    const fallbackRoots = ['recordings', 'captures'];
    for (const rootName of fallbackRoots) {
      try {
        const target = await resolveUserAssetPath(
          projectRoot,
          { id: userId },
          path.join(rootName, safeRequestedName)
        );
        await fs.access(target.filePath);
        return { filePath: target.filePath, downloadName: safeRequestedName, meta: null };
      } catch (_) {
        // Try the next media storage root.
      }
    }
    throw error;
  }

  return null;
}
