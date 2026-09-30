import path from 'path';
import { promises as fs } from 'fs';
import { ensureUserHome } from './userHome.js';

const DOWNLOADS_DIR_NAME = 'Downloads';
const SHARED_DIR_NAME = 'Shared';

function sanitizeSegment(value) {
  return String(value || '').trim().replace(/[^a-zA-Z0-9_-]+/g, '_');
}

function normalizeRelativePath(rawPath) {
  if (!rawPath) return '';
  const cleaned = String(rawPath).trim().replace(/\\/g, '/').replace(/^file:\/\//i, '');
  const parts = cleaned.split('/').filter((part) => part && part !== '.' && part !== '..');
  if (!parts.length) return '';
  const safeParts = parts.map((part, idx) => (
    idx === parts.length - 1 ? sanitizeFileName(part) : sanitizeSegment(part)
  ));
  return safeParts.join('/');
}

export function normalizeUserRelativePath(rawPath, userId) {
  if (!rawPath) return '';
  const safeUser = sanitizeSegment(userId || 'user');
  let cleaned = String(rawPath).trim().replace(/\\/g, '/').replace(/^file:\/\//i, '');
  const anchor = `/data/users/${safeUser}/`;
  const altAnchor = `data/users/${safeUser}/`;
  if (cleaned.includes(anchor)) {
    cleaned = cleaned.slice(cleaned.indexOf(anchor) + anchor.length);
  } else if (cleaned.startsWith(altAnchor)) {
    cleaned = cleaned.slice(altAnchor.length);
  } else if (cleaned.startsWith(`${safeUser}/`)) {
    cleaned = cleaned.slice(`${safeUser}/`.length);
  }
  return normalizeRelativePath(cleaned);
}

export function sanitizeFileName(name) {
  const base = typeof name === 'string' ? name : 'upload.bin';
  const cleaned = path.basename(base).replace(/[^a-z0-9._-]/gi, '_');
  return cleaned || 'upload.bin';
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
    return false;
  }
}

// Identité d'un objet déjà stocké : même chemin, mêmes octets. La comparaison
// est faite sur le contenu — la taille seule ne suffit pas à décider que deux
// fichiers sont le même objet.
async function fileEqualsContent(filePath, content) {
  if (!content) return false;
  const expected = Buffer.isBuffer(content) ? content : Buffer.from(content);
  if (!expected.length) return false;
  try {
    const stats = await fs.stat(filePath);
    if (stats.size !== expected.length) return false;
    return (await fs.readFile(filePath)).equals(expected);
  } catch (error) {
    return false;
  }
}

export async function ensureUserDownloadsDir(projectRoot, user, options = {}) {
  const dirName = options.downloadsDirName || DOWNLOADS_DIR_NAME;
  const homeInfo = await ensureUserHome(projectRoot, user, options.userRoot);
  const downloadsDir = path.join(homeInfo.home, dirName);
  await fs.mkdir(downloadsDir, { recursive: true, mode: 0o700 });
  return { ...homeInfo, downloadsDir };
}

export async function resolveUserUploadPath(projectRoot, user, rawName, options = {}) {
  const { downloadsDir } = await ensureUserDownloadsDir(projectRoot, user, options);
  const sanitized = sanitizeFileName(rawName);
  const ext = path.extname(sanitized);
  const stem = path.basename(sanitized, ext);
  const wantedPath = path.join(downloadsDir, sanitized);
  // Le même objet ne se stocke qu'une fois : un fichier déjà présent sous ce nom
  // avec exactement les mêmes octets est réutilisé au lieu de créer un doublon
  // `nom_1`. Rien n'est écrasé — deux fichiers différents qui partagent un nom
  // gardent le compteur ci-dessous, et l'identité est vérifiée par le contenu,
  // jamais par la seule taille.
  if (await fileEqualsContent(wantedPath, options.content)) {
    return { fileName: sanitized, filePath: wantedPath, downloadsDir, reused: true };
  }
  let candidate = sanitized;
  let targetPath = wantedPath;
  let counter = 1;

  while (await pathExists(targetPath)) {
    candidate = `${stem}_${counter}${ext}`;
    targetPath = path.join(downloadsDir, candidate);
    counter += 1;
  }

  return { fileName: candidate, filePath: targetPath, downloadsDir };
}

export async function resolveUserAssetPath(projectRoot, user, rawPath, options = {}) {
  const homeInfo = await ensureUserHome(projectRoot, user, options.userRoot);
  const relativePath = normalizeUserRelativePath(rawPath, user?.id || user?.user_id);
  if (!relativePath) {
    throw new Error('Invalid asset path');
  }

  const targetPath = path.join(homeInfo.home, relativePath);
  const relative = path.relative(homeInfo.home, targetPath);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Invalid asset path');
  }

  await fs.mkdir(path.dirname(targetPath), { recursive: true, mode: 0o700 });

  return {
    fileName: path.basename(targetPath),
    filePath: targetPath,
    relativePath,
    homeDir: homeInfo.home
  };
}

export async function resolveUserFilePath(projectRoot, userId, fileName, options = {}) {
  const safeName = sanitizeFileName(fileName);
  const { downloadsDir } = await ensureUserDownloadsDir(projectRoot, { id: userId }, options);
  return path.join(downloadsDir, safeName);
}

function sharedOwnerSegment(ownerId) {
  return sanitizeSegment(ownerId || 'owner');
}

export async function ensureSharedFileLink({ projectRoot, ownerId, targetUserId, fileName }) {
  if (!ownerId || !targetUserId) {
    return { ok: false, error: 'Missing ownerId or targetUserId' };
  }

  const safeName = sanitizeFileName(fileName);
  const sourcePath = await resolveUserFilePath(projectRoot, ownerId, safeName);
  try {
    await fs.access(sourcePath);
  } catch (error) {
    return { ok: false, error: error?.message || 'Source file missing' };
  }

  const targetHome = await ensureUserDownloadsDir(projectRoot, { id: targetUserId });
  const ownerSegment = sharedOwnerSegment(ownerId);
  const sharedDir = path.join(targetHome.downloadsDir, SHARED_DIR_NAME, ownerSegment);
  await fs.mkdir(sharedDir, { recursive: true, mode: 0o700 });

  const linkPath = path.join(sharedDir, safeName);
  if (await pathExists(linkPath)) {
    return { ok: true, linkPath, existed: true };
  }

  try {
    await fs.link(sourcePath, linkPath);
    return { ok: true, linkPath, kind: 'hardlink' };
  } catch (error) {
    if (error && ['EXDEV', 'EPERM', 'EACCES', 'ENOTSUP'].includes(error.code)) {
      await fs.symlink(sourcePath, linkPath);
      return { ok: true, linkPath, kind: 'symlink' };
    }
    return { ok: false, error: error.message || String(error) };
  }
}

export async function removeSharedFileLink({ projectRoot, ownerId, targetUserId, fileName }) {
  if (!ownerId || !targetUserId) {
    return { ok: false, error: 'Missing ownerId or targetUserId' };
  }

  const safeName = sanitizeFileName(fileName);
  const targetHome = await ensureUserDownloadsDir(projectRoot, { id: targetUserId });
  const ownerSegment = sharedOwnerSegment(ownerId);
  const linkPath = path.join(targetHome.downloadsDir, SHARED_DIR_NAME, ownerSegment, safeName);

  try {
    await fs.unlink(linkPath);
    return { ok: true, removed: true, linkPath };
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return { ok: true, removed: false, linkPath };
    }
    return { ok: false, error: error.message || String(error) };
  }
}
