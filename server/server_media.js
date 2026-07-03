/**
 * server media helpers — video transcode + filename/extension utilities.
 */

import { existsSync, readFileSync } from 'fs';
import { mkdir, access } from 'fs/promises';
import { execFile } from 'child_process';
import path from 'path';
import { sanitizeFileName } from './fileStorage.js';

export function lowerFileExtension(fileName) {
  return path.extname(String(fileName || '')).replace(/^\./, '').trim().toLowerCase();
}

export function replaceFileExtension(fileName, extension) {
  const cleanExtension = String(extension || '').trim().replace(/^\./, '');
  const stem = path.basename(String(fileName || ''), path.extname(String(fileName || '')));
  return sanitizeFileName(`${stem}.${cleanExtension}`);
}

export function shouldServeWebmVideoAsMp4(fileName, mimeType = '') {
  const lowerName = String(fileName || '').trim().toLowerCase();
  const lowerMime = String(mimeType || '').trim().toLowerCase();
  return lowerFileExtension(fileName) === 'webm'
    && !lowerName.startsWith('audio_')
    && !lowerName.startsWith('audio_recording_')
    && !lowerMime.startsWith('audio/');
}

export function resolveVideoCacheTarget(sourcePath, fileName) {
  const parent = path.dirname(sourcePath);
  const cacheDir = path.join(parent, '.video_cache');
  const cachedName = replaceFileExtension(fileName, 'mp4');
  return {
    cacheDir,
    cachedName,
    cachedPath: path.join(cacheDir, cachedName)
  };
}

export async function transcodeVideoToMp4(sourcePath, outputPath) {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await new Promise((resolve, reject) => {
    execFile('ffmpeg', [
      '-y',
      '-hide_banner',
      '-loglevel',
      'error',
      '-i',
      sourcePath,
      '-map',
      '0:v:0',
      '-map',
      '0:a?',
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      '-profile:v',
      'baseline',
      '-level',
      '3.1',
      '-movflags',
      '+faststart',
      '-c:a',
      'aac',
      '-b:a',
      '128k',
      outputPath
    ], { timeout: 120000 }, (error, _stdout, stderr) => {
      if (error) {
        const message = String(stderr || error.message || 'ffmpeg exited without details').trim();
        reject(new Error(`recording_transcode_failed: ${message}`));
        return;
      }
      resolve();
    });
  });
}

export async function ensureVideoPlaybackCache(sourcePath, fileName, mimeType = '') {
  if (!shouldServeWebmVideoAsMp4(fileName, mimeType)) return null;
  const target = resolveVideoCacheTarget(sourcePath, fileName);
  try {
    await fs.access(target.cachedPath);
  } catch (_) {
    await transcodeVideoToMp4(sourcePath, target.cachedPath);
  }
  return target;
}

export async function resolveVideoPlaybackTarget(target) {
  const sourcePath = target.filePath;
  const sourceName = path.basename(sourcePath);
  const downloadName = target.downloadName || sourceName;
  const sourceMimeType = target.meta?.mime_type || '';
  const cache = await ensureVideoPlaybackCache(sourcePath, sourceName, sourceMimeType);
  if (!cache) {
    return {
      filePath: sourcePath,
      downloadName,
      mimeType: null
    };
  }
  return {
    filePath: cache.cachedPath,
    downloadName: cache.cachedName,
    mimeType: 'video/mp4'
  };
}
