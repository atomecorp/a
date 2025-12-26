import path from 'path';
import { promises as fs } from 'fs';
import { ensureUserHome } from './userHome.js';

const DOWNLOADS_DIR_NAME = 'Downloads';
const SHARED_DIR_NAME = 'Shared';

function sanitizeSegment(value) {
  return String(value || '').trim().replace(/[^a-zA-Z0-9_-]+/g, '_');
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
  } catch (_) {
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
  let candidate = sanitized;
  let targetPath = path.join(downloadsDir, candidate);
  let counter = 1;

  while (await pathExists(targetPath)) {
    candidate = `${stem}_${counter}${ext}`;
    targetPath = path.join(downloadsDir, candidate);
    counter += 1;
  }

  return { fileName: candidate, filePath: targetPath, downloadsDir };
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
