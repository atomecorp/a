/**
 * server uploads/downloads listing + download target resolution.
 */

import { promises as fs, existsSync, createReadStream, statSync, readFileSync, mkdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import db from '../database/adole.js';
import { sanitizeFileName, ensureUserDownloadsDir, normalizeUserRelativePath, resolveUserAssetPath, resolveUserFilePath } from './fileStorage.js';
import { getAccessibleFiles, getFileMetadata, canAccessFile } from './userFiles.js';
import { pickDisplayName } from './server_utils.js';

const DATABASE_ENABLED = Boolean(process.env.SQLITE_PATH || process.env.LIBSQL_URL);

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const uploadsDir = (() => {
  try {
    return resolveUploadsDir();
  } catch (error) {
    const message = error?.message || error;
    console.warn('⚠️ Unable to resolve uploads directory:', message);
    return null;
  }
})();

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

export async function listAnonymousUploads() {
  if (!uploadsDir) return [];
  const entries = await fs.readdir(uploadsDir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const safeName = sanitizeFileName(entry.name);
    const absolutePath = path.join(uploadsDir, safeName);
    try {
      const stats = await fs.stat(absolutePath);
      files.push({
        name: safeName,
        size: stats.size,
        modified: stats.mtime.toISOString(),
        origin: 'previous'
      });
    } catch (error) {
      console.warn('⚠️ Impossible de lire les métadonnées pour', absolutePath, error);
    }
  }

  files.sort((a, b) => b.modified.localeCompare(a.modified));
  return files;
}

export async function listUserDownloads(userId) {
  const { downloadsDir } = await ensureUserDownloadsDir(projectRoot, { id: userId });
  const entries = await fs.readdir(downloadsDir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const safeName = sanitizeFileName(entry.name);
    const absolutePath = path.join(downloadsDir, safeName);
    try {
      const stats = await fs.stat(absolutePath);
      files.push({
        name: safeName,
        file_name: safeName,
        size: stats.size,
        modified: stats.mtime.toISOString(),
        owner_id: userId,
        access: 'owner',
        shared: false
      });
    } catch (error) {
      console.warn('⚠️ Impossible de lire les métadonnées pour', absolutePath, error);
    }
  }

  files.sort((a, b) => b.modified.localeCompare(a.modified));
  return files;
}

export async function listUploadsForUser(userId) {
  if (!DATABASE_ENABLED) {
    return listUserDownloads(userId);
  }

  const accessible = await getAccessibleFiles(userId);
  const files = [];

  for (const entry of (accessible || [])) {
    const ownerId = entry.owner_id || userId;
    const safeName = typeof entry.file_name === 'string' && entry.file_name.trim()
      ? entry.file_name
      : sanitizeFileName(entry.original_name || entry.name || 'upload.bin');
    let stats = null;
    const rawPath = entry.file_path || entry.filePath || null;
    if (rawPath) {
      const normalizedRelative = normalizeUserRelativePath(rawPath, ownerId);
      if (normalizedRelative) {
        const resolved = await resolveUserAssetPath(
          projectRoot,
          { id: ownerId },
          normalizedRelative
        );
        stats = await fs.stat(resolved.filePath);
      }
    }

    if (!stats) {
      const filePath = await resolveUserFilePath(projectRoot, ownerId, safeName);
      stats = await fs.stat(filePath);
    }

    const parsedSize = typeof entry.size === 'number' ? entry.size : Number(entry.size);
    files.push({
      id: entry.atome_id,
      name: pickDisplayName(entry, safeName),
      file_name: safeName,
      size: Number.isFinite(parsedSize) ? parsedSize : (stats?.size || 0),
      modified: stats?.mtime?.toISOString() || entry.updated_at || entry.created_at || null,
      owner_id: ownerId,
      access: entry.access || (ownerId === userId ? 'owner' : 'read'),
      shared: ownerId !== userId
    });
  }

  if (userId === 'anonymous') {
    const previous = await listAnonymousUploads();
    const mapped = previous.map((file) => ({
      id: null,
      name: file.name,
      file_name: file.name,
      size: file.size || 0,
      modified: file.modified || null,
      owner_id: userId,
      access: 'owner',
      shared: false,
      previous: true
    }));
    files.push(...mapped);
  }

  const toTimestamp = (value) => {
    if (!value) return 0;
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  };
  files.sort((a, b) => toTimestamp(b.modified) - toTimestamp(a.modified));
  return files;
}

export async function resolveDownloadTarget(fileParam, userId) {
  const raw = typeof fileParam === 'string' ? fileParam : String(fileParam || '');
  const safeParam = raw.trim();

  const resolveLegacyOwnerlessTarget = async () => {
    if (!DATABASE_ENABLED || !safeParam || userId !== 'anonymous') return null;
    try {
      const rows = await db.query('all', `
        SELECT a.atome_id, a.atome_type, a.owner_id, a.created_at, a.updated_at
        FROM atomes a
        JOIN particles p ON a.atome_id = p.atome_id
        WHERE p.particle_key IN ('file_name', 'original_name')
          AND p.particle_value = ?
          AND a.deleted_at IS NULL
        ORDER BY COALESCE(a.updated_at, a.created_at) DESC
        LIMIT 12
      `, [JSON.stringify(safeParam)]);
      for (const row of (rows || [])) {
        const particles = await db.query('all', `
          SELECT particle_key, particle_value FROM particles WHERE atome_id = ?
        `, [row.atome_id]);
        const meta = {
          atome_id: row.atome_id,
          atome_type: row.atome_type,
          owner_id: row.owner_id,
          created_at: row.created_at,
          updated_at: row.updated_at
        };
        for (const particle of (particles || [])) {
          try {
            meta[particle.particle_key] = JSON.parse(particle.particle_value);
          } catch (_) {
            meta[particle.particle_key] = particle.particle_value;
          }
        }
        const safeName = typeof meta.file_name === 'string' && meta.file_name.trim()
          ? meta.file_name
          : sanitizeFileName(meta.original_name || safeParam);
        const downloadName = typeof meta.original_name === 'string' && meta.original_name.trim()
          ? meta.original_name
          : safeName;
        const rawPath = meta.file_path || meta.filePath || null;
        try {
          if (rawPath) {
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
        } catch (_) {
          // Try the next legacy metadata candidate.
        }
      }
    } catch (error) {
      console.warn('[Uploads] Legacy ownerless media fallback failed', {
        userId,
        fileParam: safeParam,
        error: error?.message || String(error || '')
      });
    }
    return null;
  };

  if (DATABASE_ENABLED && safeParam) {
    let meta = await getFileMetadata(safeParam);
    if (meta && meta.atome_id !== safeParam) {
      meta = null;
    }

    if (!meta) {
      meta = await getFileMetadata(safeParam, { userId });
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

  const legacyTarget = await resolveLegacyOwnerlessTarget();
  if (legacyTarget?.filePath) return legacyTarget;

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
