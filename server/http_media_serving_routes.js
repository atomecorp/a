// Media read routes: signed media capability issuance, upload listing, ranged
// download of uploads and recordings, and FFmpeg audio extraction.
import path from 'path';
import { promises as fs, createReadStream, existsSync, mkdirSync } from 'fs';
import { execFile } from 'child_process';
import { issueMediaToken } from './media_capability.js';
import { requiredJwtSecret as getRequiredJwtSecret } from './wsApiIdentity.js';
import { listUserDownloads, resolveDownloadTarget } from './server_uploads.js';
import { resolveVideoPlaybackTarget } from './server_media.js';

export function registerMediaTokenRoute(server, { validateToken }) {
  server.post('/api/media-token', async (request, reply) => {
    const claims = await validateToken(request);
    if (!claims) return reply.code(401).send({ success: false, error: 'auth_required' });
    try {
      const issued = issueMediaToken(claims, getRequiredJwtSecret(), { file: request.body?.file });
      reply.header('Cache-Control', 'no-store');
      return { success: true, ...issued };
    } catch (error) {
      return reply.code(403).send({ success: false, error: error?.message || 'media_token_denied' });
    }
  });
}

export function registerMediaServingRoutes(server, { resolveUploadIdentity, resolveMediaDownloadIdentity, userVaultRouter }) {
  server.get('/api/uploads', async (request, reply) => {
    try {
      const { userId } = await resolveUploadIdentity(request);
      const files = await listUserDownloads(userId, { vaultRouter: userVaultRouter });
      return { success: true, files };
    } catch (error) {
      request.log.error({ err: error }, 'Unable to list uploads');
      reply.code(500);
      return { success: false, error: error.message };
    }
  });

  server.get('/api/uploads/:file', async (request, reply) => {
    try {
      const { userId } = await resolveMediaDownloadIdentity(request);
      const fileParam = request.params.file || '';
      const target = await resolveDownloadTarget(fileParam, userId);

      if (!target?.filePath) {
        const status = target?.status || 404;
        if (status === 403) {
          console.warn('[Uploads] Forbidden download', { userId, fileParam });
        }
        reply.code(status);
        return { success: false, error: target?.error || 'File not found' };
      }

      const playbackTarget = await resolveVideoPlaybackTarget(target);
      await fs.access(playbackTarget.filePath);
      const stat = await fs.stat(playbackTarget.filePath);
      const totalSize = stat.size;
      const ext = path.extname(playbackTarget.filePath).toLowerCase();

      // Resolve MIME type: DB metadata > extension lookup > logLine
      const MEDIA_MIME_TYPES = {
        '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.mov': 'video/quicktime',
        '.webm': 'video/webm', '.avi': 'video/x-msvideo', '.mkv': 'video/x-matroska',
        '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.aac': 'audio/aac',
        '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.flac': 'audio/flac',
        '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.svg': 'image/svg+xml',
        '.pdf': 'application/pdf', '.json': 'application/json',
      };
      const mimeType = playbackTarget.mimeType || target.meta?.mime_type || MEDIA_MIME_TYPES[ext] || 'application/octet-stream';

      reply.header('Content-Type', mimeType);
      reply.header('Accept-Ranges', 'bytes');
      reply.header('Content-Disposition', `inline; filename="${playbackTarget.downloadName || target.downloadName}"`);
      reply.header('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges');

      // HTTP Range support for media seeking
      const rangeHeader = request.headers.range;
      if (rangeHeader) {
        const match = /^bytes=(\d+)-(\d*)$/.exec(String(rangeHeader));
        if (match) {
          const start = parseInt(match[1], 10);
          const end = match[2] ? parseInt(match[2], 10) : totalSize - 1;
          if (start >= totalSize || end >= totalSize || start > end) {
            reply.code(416);
            reply.header('Content-Range', `bytes */${totalSize}`);
            return reply.send('');
          }
          reply.code(206);
          reply.header('Content-Range', `bytes ${start}-${end}/${totalSize}`);
          reply.header('Content-Length', end - start + 1);
          return reply.send(createReadStream(playbackTarget.filePath, { start, end }));
        }
      }

      reply.header('Content-Length', totalSize);
      return reply.send(createReadStream(playbackTarget.filePath));
    } catch (error) {
      request.log.error({ err: error }, 'Unable to download upload');
      const status = error?.status || 404;
      reply.code(status);
      return { success: false, error: error?.error || error?.message || 'File not found' };
    }
  });

  server.get('/api/recordings/:file', async (request, reply) => {
    try {
      const { userId } = await resolveMediaDownloadIdentity(request);
      const fileParam = request.params.file || '';
      const target = await resolveDownloadTarget(fileParam, userId);

      if (!target?.filePath) {
        const status = target?.status || 404;
        reply.code(status);
        return { success: false, error: target?.error || 'Recording not found' };
      }

      const playbackTarget = await resolveVideoPlaybackTarget(target);
      await fs.access(playbackTarget.filePath);
      const stat = await fs.stat(playbackTarget.filePath);
      const totalSize = stat.size;
      const ext = path.extname(playbackTarget.filePath).toLowerCase();
      const mediaMimeTypes = {
        '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.mov': 'video/quicktime',
        '.webm': 'video/webm', '.avi': 'video/x-msvideo', '.mkv': 'video/x-matroska',
        '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.aac': 'audio/aac',
        '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.flac': 'audio/flac',
        '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.svg': 'image/svg+xml'
      };
      const mimeType = playbackTarget.mimeType || target.meta?.mime_type || mediaMimeTypes[ext] || 'application/octet-stream';

      reply.header('Content-Type', mimeType);
      reply.header('Accept-Ranges', 'bytes');
      reply.header('Content-Disposition', `inline; filename="${playbackTarget.downloadName || target.downloadName}"`);
      reply.header('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges');

      const rangeHeader = request.headers.range;
      if (rangeHeader) {
        const match = /^bytes=(\d+)-(\d*)$/.exec(String(rangeHeader));
        if (match) {
          const start = parseInt(match[1], 10);
          const end = match[2] ? parseInt(match[2], 10) : totalSize - 1;
          if (start >= totalSize || end >= totalSize || start > end) {
            reply.code(416);
            reply.header('Content-Range', `bytes */${totalSize}`);
            return reply.send('');
          }
          reply.code(206);
          reply.header('Content-Range', `bytes ${start}-${end}/${totalSize}`);
          reply.header('Content-Length', end - start + 1);
          return reply.send(createReadStream(playbackTarget.filePath, { start, end }));
        }
      }

      reply.header('Content-Length', totalSize);
      return reply.send(createReadStream(playbackTarget.filePath));
    } catch (error) {
      request.log.error({ err: error }, 'Unable to download recording');
      const status = error?.status || 404;
      reply.code(status);
      return { success: false, error: error?.error || error?.message || 'Recording not found' };
    }
  });

  // Audio extraction from video containers (FFmpeg)
  // WebKit/WKWebView cannot decode audio from .mov/.m4v containers via decodeAudioData.
  // This endpoint extracts the audio track to .m4a (AAC in MP4 container) that all browsers support.
  server.get('/api/extract-audio/:file', async (request, reply) => {
    try {
      const { userId } = await resolveMediaDownloadIdentity(request);
      const fileParam = request.params.file || '';
      const target = await resolveDownloadTarget(fileParam, userId);

      if (!target?.filePath) {
        const status = target?.status || 404;
        reply.code(status);
        return { success: false, error: target?.error || 'Source file not found' };
      }

      await fs.access(target.filePath);

      const ext = path.extname(target.filePath).toLowerCase();
      const videoExtensions = ['.mov', '.m4v', '.mp4', '.avi', '.mkv', '.webm'];
      if (!videoExtensions.includes(ext)) {
        reply.code(400);
        return { success: false, error: 'Not a video file' };
      }

      const cacheDir = path.join(path.dirname(target.filePath), '.audio_cache');
      if (!existsSync(cacheDir)) mkdirSync(cacheDir, { recursive: true });

      const baseName = path.basename(target.filePath, ext);
      const cachedAudio = path.join(cacheDir, `${baseName}.aac.m4a`);

      const cacheExists = existsSync(cachedAudio);
      if (!cacheExists) {
        await new Promise((resolve, reject) => {
          execFile('ffmpeg', [
            '-v', 'error',
            '-y',
            '-i', target.filePath,
            '-vn',
            '-map', '0:a:0',
            '-c:a', 'aac',
            '-b:a', '192k',
            '-ac', '2',
            '-ar', '48000',
            '-movflags', '+faststart',
            cachedAudio
          ], { timeout: 60000 }, (error, _stdout, stderr) => {
            if (error) {
              const msg = String(stderr || error.message || 'ffmpeg_failed').slice(0, 200);
              reject(new Error(`ffmpeg_extract_failed: ${msg}`));
            } else {
              resolve();
            }
          });
        });
      }

      await fs.access(cachedAudio);
      const stat = await fs.stat(cachedAudio);
      reply.header('Content-Type', 'audio/mp4');
      reply.header('Content-Length', stat.size);
      reply.header('Accept-Ranges', 'bytes');
      return reply.send(createReadStream(cachedAudio));
    } catch (error) {
      request.log.error({ err: error }, 'Audio extraction failed');
      reply.code(error?.status || (error?.code === 'ENOENT' ? 404 : 500));
      return { success: false, error: error?.message || 'Audio extraction failed' };
    }
  });
}
