/**
 * server media helpers — video transcode + filename/extension utilities.
 *
 * Le navigateur ne lit de façon fiable que du H.264/AAC dans un MP4 *faststart*
 * (moov avant mdat). Les fichiers produits hors de ce cadre — HEVC/Main10 10 bits,
 * conteneurs .mov/.mkv/.webm, moov en fin de fichier — sont donc normalisés ici,
 * au seul point qui sert les médias de lecture, plutôt que d'être servis tels quels
 * au <video>.
 */

import { mkdir, access, open } from 'fs/promises';
import { execFile } from 'child_process';
import path from 'path';
import { sanitizeFileName } from './fileStorage.js';
import { summarizeMp4Moov } from '../atome/src/squirrel/shared/media_container.js';

const MP4_ATOM_HEADER_BYTES = 16;
const MAX_TOP_LEVEL_ATOMS = 256;
const MAX_MOOV_BYTES = 32 * 1024 * 1024;

// Extensions toujours réencodées : le navigateur ne décode pas leur codec natif.
const ALWAYS_TRANSCODE_EXTENSIONS = new Set(['webm', 'mkv', 'avi', 'mpeg', 'mpg', 'wmv']);
// Conteneurs MP4/MOV : lecture des atomes pour décider remux ou réencodage.
const MP4_CONTAINER_EXTENSIONS = new Set(['mp4', 'm4v', 'mov']);

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

const isAudioOnlyName = (fileName) => {
  const lowerName = String(fileName || '').trim().toLowerCase();
  return lowerName.startsWith('audio_') || lowerName.startsWith('audio_recording_');
};

// Parcourt uniquement les en-têtes d'atomes de premier niveau, sans lire mdat :
// l'ordre moov/mdat dit si le fichier est faststart.
async function readMp4TopLevelBoxes(filePath) {
  const handle = await open(filePath, 'r');
  try {
    const { size } = await handle.stat();
    const boxes = [];
    let offset = 0;
    while (offset + 8 <= size && boxes.length < MAX_TOP_LEVEL_ATOMS) {
      const header = Buffer.alloc(MP4_ATOM_HEADER_BYTES);
      const { bytesRead } = await handle.read(header, 0, MP4_ATOM_HEADER_BYTES, offset);
      if (bytesRead < 8) break;
      let boxSize = header.readUInt32BE(0);
      const type = header.toString('latin1', 4, 8);
      let headerSize = 8;
      if (boxSize === 1) {
        if (bytesRead < 16) break;
        boxSize = Number(header.readBigUInt64BE(8));
        headerSize = 16;
      } else if (boxSize === 0) {
        boxSize = size - offset;
      }
      if (!Number.isFinite(boxSize) || boxSize < headerSize) break;
      boxes.push({ type, offset, size: boxSize });
      offset += boxSize;
    }
    return boxes;
  } finally {
    await handle.close();
  }
}

async function readMp4MoovBytes(filePath, boxes) {
  const moov = boxes.find((box) => box.type === 'moov');
  if (!moov || moov.size > MAX_MOOV_BYTES) return null;
  const buffer = Buffer.alloc(moov.size);
  const handle = await open(filePath, 'r');
  try {
    const { bytesRead } = await handle.read(buffer, 0, moov.size, moov.offset);
    return bytesRead === moov.size ? buffer : null;
  } finally {
    await handle.close();
  }
}

/**
 * Décide comment servir une vidéo de lecture.
 * - `transcode` : réencodage H.264 8 bits faststart (codec non décodable).
 * - `remux`     : recopie des flux + faststart (conteneur lisible, moov en fin).
 * - `null`      : déjà lisible telle quelle.
 */
export async function resolveVideoPlaybackNormalization(sourcePath, fileName, mimeType = '') {
  const extension = lowerFileExtension(fileName);
  const lowerMime = String(mimeType || '').trim().toLowerCase();
  if (isAudioOnlyName(fileName)) return null;
  if (shouldServeWebmVideoAsMp4(fileName, mimeType)) return 'transcode';
  if (ALWAYS_TRANSCODE_EXTENSIONS.has(extension)) return 'transcode';
  if (!MP4_CONTAINER_EXTENSIONS.has(extension) && !lowerMime.startsWith('video/')) return null;

  let boxes;
  try {
    boxes = await readMp4TopLevelBoxes(sourcePath);
  } catch (_) {
    return 'transcode';
  }
  if (!boxes.length || !boxes.some((box) => box.type === 'moov')) return 'transcode';
  const moovIndex = boxes.findIndex((box) => box.type === 'moov');
  const mdatIndex = boxes.findIndex((box) => box.type === 'mdat');
  const fastStart = mdatIndex === -1 || moovIndex < mdatIndex;
  let moov = null;
  try {
    moov = await readMp4MoovBytes(sourcePath, boxes);
  } catch (_) {
    moov = null;
  }
  const tracks = moov ? summarizeMp4Moov(moov) : null;
  const hevc = tracks?.videoCodecs.some((codec) => codec === 'hvc1' || codec === 'hev1') === true;
  if (hevc) return 'transcode';
  if (!fastStart) return 'remux';
  return null;
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

const runFfmpeg = (args) => new Promise((resolve, reject) => {
  execFile('ffmpeg', args, { timeout: 120000 }, (error, _stdout, stderr) => {
    if (error) {
      const message = String(stderr || error.message || 'ffmpeg exited without details').trim();
      reject(new Error(`video_normalization_failed: ${message}`));
      return;
    }
    resolve();
  });
});

export async function transcodeVideoToMp4(sourcePath, outputPath) {
  await mkdir(path.dirname(outputPath), { recursive: true });
  await runFfmpeg([
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
  ]);
}

// Réencodage canonique pour les vidéos importées : H.264 8 bits yuv420p
// (aucun profil/level figé, donc valable au-delà de 720p) + faststart.
export async function transcodeVideoToCanonicalMp4(sourcePath, outputPath) {
  await mkdir(path.dirname(outputPath), { recursive: true });
  await runFfmpeg([
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
    '-movflags',
    '+faststart',
    '-c:a',
    'aac',
    '-b:a',
    '128k',
    outputPath
  ]);
}

// Recopie sans perte : le conteneur et les codecs sont lisibles, seul le `moov`
// doit remonter avant le `mdat` pour que la lecture démarre.
export async function remuxVideoFastStart(sourcePath, outputPath) {
  await mkdir(path.dirname(outputPath), { recursive: true });
  await runFfmpeg([
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
    '-c',
    'copy',
    '-movflags',
    '+faststart',
    outputPath
  ]);
}

const VIDEO_CACHE_JOBS = new Map();

export async function ensureVideoPlaybackCache(sourcePath, fileName, mimeType = '') {
  const normalization = await resolveVideoPlaybackNormalization(sourcePath, fileName, mimeType);
  if (!normalization) return null;
  const target = resolveVideoCacheTarget(sourcePath, fileName);
  try {
    await access(target.cachedPath);
    return target;
  } catch (_) {
    // Une seule normalisation par fichier : une lecture en parallèle (le
    // <video> émet souvent plusieurs requêtes) ne doit pas lancer deux ffmpeg
    // concurrents sur la même sortie.
    const inFlight = VIDEO_CACHE_JOBS.get(target.cachedPath);
    if (inFlight) {
      await inFlight;
      return target;
    }
    const job = (async () => {
      try {
        if (normalization === 'remux') {
          await remuxVideoFastStart(sourcePath, target.cachedPath);
        } else {
          await transcodeVideoToCanonicalMp4(sourcePath, target.cachedPath);
        }
      } finally {
        VIDEO_CACHE_JOBS.delete(target.cachedPath);
      }
    })();
    VIDEO_CACHE_JOBS.set(target.cachedPath, job);
    await job;
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
