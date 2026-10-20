// Upload write routes: single-shot upload, remote wallpaper, chunked upload and
// its finalization. Destination is the caller's Downloads, a recording folder or
// an explicit user-relative path.
import path from 'path';
import { promises as fs, createReadStream, createWriteStream } from 'fs';
import { registerFileUpload } from './userFiles.js';
import { normalizeUserRelativePath, resolveUserAssetPath, resolveUserUploadPath, sanitizeFileName } from './fileStorage.js';
import { ensureVideoPlaybackCache } from './server_media.js';
import { looksLikeRecordingName, looksLikeRecordingType, sanitizeUploadId } from './server_utils.js';
import { registerRemoteWallpaperRoute } from './http_wallpaper_routes.js';

export function registerUploadRoutes(server, { projectRoot, UPLOADS_TMP_DIR, DATABASE_ENABLED, resolveUploadIdentity }) {
  const getHeaderValue = (request, headerName) => {
    const raw = request.headers?.[headerName];
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (value === undefined || value === null) return null;
    const text = String(value).trim();
    return text || null;
  };

  const shouldStoreInRecordings = (fileName, atomeType) => {
    if (looksLikeRecordingType(atomeType)) return true;
    if (atomeType) return false;
    return looksLikeRecordingName(fileName);
  };

  const resolveRecordingUploadPath = async ({ fileName, userId, user }) => {
    const safeName = sanitizeFileName(fileName || 'recording.bin');
    const relative = path.join('recordings', safeName);
    const resolved = await resolveUserAssetPath(
      projectRoot,
      { id: userId, username: user?.username },
      relative
    );
    return {
      fileName: safeName || resolved.fileName,
      filePath: resolved.filePath,
      relativePath: resolved.relativePath
    };
  };

  server.post('/api/uploads', async (request, reply) => {
    try {
      const { user, userId } = await resolveUploadIdentity(request);
      if (DATABASE_ENABLED && userId === 'anonymous') {
        return reply.code(401).send({ success: false, error: 'upload_identity_required' });
      }

      const headerValue = Array.isArray(request.headers['x-filename'])
        ? request.headers['x-filename'][0]
        : request.headers['x-filename'];
      const pathHeader = Array.isArray(request.headers['x-file-path'])
        ? request.headers['x-file-path'][0]
        : request.headers['x-file-path'];
      const atomeTypeHeader = getHeaderValue(request, 'x-atome-type');
      const mimeHeader = getHeaderValue(request, 'x-mime-type') || request.headers['content-type'] || null;

      if (!headerValue && !pathHeader) {
        reply.code(400);
        return { success: false, error: 'Missing X-Filename header' };
      }

      const decodedName = headerValue ? decodeURIComponent(String(headerValue)) : '';

      const bodyBuffer = request.body;
      if (!bodyBuffer || !(bodyBuffer instanceof Buffer) || !bodyBuffer.length) {
        reply.code(400);
        return { success: false, error: 'Empty upload body' };
      }

      let fileName = decodedName;
      let filePath = null;
      let relativePath = null;

      if (pathHeader) {
        const rawPath = Array.isArray(pathHeader) ? pathHeader[0] : pathHeader;
        const normalizedRelative = normalizeUserRelativePath(rawPath, userId);
        const resolved = await resolveUserAssetPath(
          projectRoot,
          { id: userId, username: user?.username },
          normalizedRelative
        );
        fileName = fileName || resolved.fileName;
        filePath = resolved.filePath;
        relativePath = resolved.relativePath;
      } else if (shouldStoreInRecordings(decodedName, atomeTypeHeader)) {
        const resolved = await resolveRecordingUploadPath({
          fileName: decodedName || 'recording.bin',
          userId,
          user
        });
        fileName = resolved.fileName;
        filePath = resolved.filePath;
        relativePath = resolved.relativePath;
      } else {
        const resolved = await resolveUserUploadPath(
          projectRoot,
          { id: userId, username: user?.username },
          decodedName || 'upload.bin'
        );
        fileName = resolved.fileName;
        filePath = resolved.filePath;
        relativePath = path.join('Downloads', resolved.fileName);
      }

      await fs.writeFile(filePath, bodyBuffer);

      if (DATABASE_ENABLED) {
        // Register file ownership
        const atomeIdHeader = Array.isArray(request.headers['x-atome-id'])
          ? request.headers['x-atome-id'][0]
          : request.headers['x-atome-id'];
        const originalNameHeader = Array.isArray(request.headers['x-original-name'])
          ? request.headers['x-original-name'][0]
          : request.headers['x-original-name'];

        const registration = await registerFileUpload(fileName, userId, {
          atome_id: atomeIdHeader || null,
          atome_type: atomeTypeHeader || null,
          original_name: originalNameHeader || decodedName || fileName,
          mime_type: mimeHeader || null,
          size_bytes: bodyBuffer.length,
          file_path: relativePath || null
        });
        if (!registration?.success) {
          await fs.rm(filePath, { force: true });
          reply.code(500);
          return { success: false, error: registration?.error || 'file_registration_failed' };
        }
      }

      return { success: true, file_name: fileName, owner_id: userId, file_path: relativePath || null };
    } catch (error) {
      request.log.error({ err: error }, 'File upload failed');
      reply.code(500);
      return { success: false, error: error.message };
    }
  });

  registerRemoteWallpaperRoute(server, { projectRoot, DATABASE_ENABLED, resolveUploadIdentity });

  server.post('/api/uploads/chunk', async (request, reply) => {
    try {
      const { userId } = await resolveUploadIdentity(request);
      if (DATABASE_ENABLED && userId === 'anonymous') {
        return reply.code(401).send({ success: false, error: 'upload_identity_required' });
      }

      const headerValue = Array.isArray(request.headers['x-filename'])
        ? request.headers['x-filename'][0]
        : request.headers['x-filename'];
      if (!headerValue) {
        reply.code(400);
        return { success: false, error: 'Missing X-Filename header' };
      }

      const uploadIdHeader = Array.isArray(request.headers['x-upload-id'])
        ? request.headers['x-upload-id'][0]
        : request.headers['x-upload-id'];
      const safeUploadId = sanitizeUploadId(uploadIdHeader);
      if (!safeUploadId) {
        reply.code(400);
        return { success: false, error: 'Missing or invalid X-Upload-Id header' };
      }

      const chunkIndexRaw = Array.isArray(request.headers['x-chunk-index'])
        ? request.headers['x-chunk-index'][0]
        : request.headers['x-chunk-index'];
      const chunkCountRaw = Array.isArray(request.headers['x-chunk-count'])
        ? request.headers['x-chunk-count'][0]
        : request.headers['x-chunk-count'];
      const chunkIndex = Number.parseInt(chunkIndexRaw, 10);
      const chunkCount = Number.parseInt(chunkCountRaw, 10);
      if (!Number.isFinite(chunkIndex) || chunkIndex < 0 || !Number.isFinite(chunkCount) || chunkCount < 1) {
        reply.code(400);
        return { success: false, error: 'Invalid chunk index/count' };
      }

      const decodedName = decodeURIComponent(String(headerValue));

      const bodyBuffer = request.body;
      if (!bodyBuffer || !(bodyBuffer instanceof Buffer) || !bodyBuffer.length) {
        reply.code(400);
        return { success: false, error: 'Empty upload body' };
      }

      await fs.mkdir(UPLOADS_TMP_DIR, { recursive: true, mode: 0o700 });
      const uploadDir = path.join(UPLOADS_TMP_DIR, safeUploadId);
      await fs.mkdir(uploadDir, { recursive: true, mode: 0o700 });

      const chunkPath = path.join(uploadDir, `${chunkIndex}.part`);
      await fs.writeFile(chunkPath, bodyBuffer);

      return {
        success: true,
        uploadId: safeUploadId,
        chunkIndex,
        chunkCount,
        owner: userId,
        file: sanitizeFileName(decodedName)
      };
    } catch (error) {
      request.log.error({ err: error }, 'Chunk upload failed');
      reply.code(500);
      return { success: false, error: error.message };
    }
  });

  server.post('/api/uploads/complete', async (request, reply) => {
    try {
      const { user, userId } = await resolveUploadIdentity(request);
      if (DATABASE_ENABLED && userId === 'anonymous') {
        return reply.code(401).send({ success: false, error: 'upload_identity_required' });
      }

      const headerValue = Array.isArray(request.headers['x-filename'])
        ? request.headers['x-filename'][0]
        : request.headers['x-filename'];
      const pathHeader = Array.isArray(request.headers['x-file-path'])
        ? request.headers['x-file-path'][0]
        : request.headers['x-file-path'];
      const atomeTypeHeader = getHeaderValue(request, 'x-atome-type');
      const mimeHeader = getHeaderValue(request, 'x-mime-type') || request.headers['content-type'] || null;
      if (!headerValue) {
        reply.code(400);
        return { success: false, error: 'Missing X-Filename header' };
      }

      const uploadIdHeader = Array.isArray(request.headers['x-upload-id'])
        ? request.headers['x-upload-id'][0]
        : request.headers['x-upload-id'];
      const safeUploadId = sanitizeUploadId(uploadIdHeader);
      if (!safeUploadId) {
        reply.code(400);
        return { success: false, error: 'Missing or invalid X-Upload-Id header' };
      }

      const chunkCountRaw = Array.isArray(request.headers['x-chunk-count'])
        ? request.headers['x-chunk-count'][0]
        : request.headers['x-chunk-count'];
      const chunkCount = Number.parseInt(chunkCountRaw, 10);
      if (!Number.isFinite(chunkCount) || chunkCount < 1) {
        reply.code(400);
        return { success: false, error: 'Invalid chunk count' };
      }

      const decodedName = decodeURIComponent(String(headerValue));

      const uploadDir = path.join(UPLOADS_TMP_DIR, safeUploadId);
      let fileName = decodedName;
      let filePath = null;
      let relativePath = null;

      if (pathHeader) {
        const rawPath = Array.isArray(pathHeader) ? pathHeader[0] : pathHeader;
        const normalizedRelative = normalizeUserRelativePath(rawPath, userId);
        const resolved = await resolveUserAssetPath(
          projectRoot,
          { id: userId, username: user?.username },
          normalizedRelative
        );
        fileName = fileName || resolved.fileName;
        filePath = resolved.filePath;
        relativePath = resolved.relativePath;
      } else if (shouldStoreInRecordings(decodedName, atomeTypeHeader)) {
        const resolved = await resolveRecordingUploadPath({
          fileName: decodedName || 'recording.bin',
          userId,
          user
        });
        fileName = resolved.fileName;
        filePath = resolved.filePath;
        relativePath = resolved.relativePath;
      } else {
        const resolved = await resolveUserUploadPath(
          projectRoot,
          { id: userId, username: user?.username },
          decodedName
        );
        fileName = resolved.fileName;
        filePath = resolved.filePath;
        relativePath = path.join('Downloads', resolved.fileName);
      }

      const output = createWriteStream(filePath, { flags: 'w' });
      for (let idx = 0; idx < chunkCount; idx += 1) {
        const chunkPath = path.join(uploadDir, `${idx}.part`);
        await new Promise((resolve, reject) => {
          const input = createReadStream(chunkPath);
          input.on('error', reject);
          input.on('end', resolve);
          input.pipe(output, { end: false });
        });
      }

      await new Promise((resolve, reject) => {
        output.on('error', reject);
        output.end(resolve);
      });

      await fs.rm(uploadDir, { recursive: true, force: true });
      await ensureVideoPlaybackCache(filePath, fileName, mimeHeader || '');

      if (DATABASE_ENABLED) {
        const mimeType = mimeHeader || null;
        const atomeIdHeader = getHeaderValue(request, 'x-atome-id');
        const stats = await fs.stat(filePath);
        const registration = await registerFileUpload(fileName, userId, {
          atome_id: atomeIdHeader || null,
          atome_type: atomeTypeHeader || null,
          original_name: decodedName,
          mime_type: mimeType || null,
          size_bytes: stats.size,
          file_path: relativePath || null
        });
        if (!registration?.success) {
          await fs.rm(filePath, { force: true });
          reply.code(500);
          return { success: false, error: registration?.error || 'file_registration_failed' };
        }
      }

      return { success: true, file_name: fileName, owner_id: userId, file_path: relativePath || null };
    } catch (error) {
      request.log.error({ err: error }, 'Chunked upload finalize failed');
      reply.code(500);
      return { success: false, error: error.message };
    }
  });
}
