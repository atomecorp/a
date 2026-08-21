// `/ws/api` file-transfer family — extracted verbatim from the 2 465-line
// route handler in server/server.js (P1-2). Actions: download-info,
// download-chunk, upload-chunk, upload-complete.
//
// Only the closure values the block read are parameters now; every other binding
// it used was already a module-level import of server.js and is imported here.
// Nothing in the body was rewritten, so the wire behaviour is unchanged — it is
// exercised end to end by temp/ws_api_exercise_probe.mjs against a real socket.
import path from 'path';
import { createReadStream, createWriteStream } from 'fs';
import { promises as fsPromises } from 'fs';
import {
    attachWsApiClientToUser,
    detachWsApiClient
} from './wsApiState.js';
import { isWsApiPrincipalProvisioned } from './wsApiIdentity.js';

/**
 * @param {object} ctx
 * @param {object} ctx.connection - the WebSocket connection
 * @param {object} ctx.data - parsed inbound message
 * @param {Function} ctx.safeSend - reply sender bound to this connection
 * @param {string} ctx.projectRoot
 * @param {string} ctx.UPLOADS_TMP_DIR
 * @param {object} ctx.deps - server-side helpers kept in server.js
 */
export async function handleWsFileOperation({ connection, data, safeSend, projectRoot, UPLOADS_TMP_DIR, deps }) {
    const {
        coerceWsChunkSize, ensureVideoPlaybackCache, getRequiredJwtSecret,
        listUserDownloadsSnapshot, normalizeUserRelativePath, registerFileUpload,
        resolveDownloadTarget, resolveUserAssetPath, resolveUserUploadPath, sanitizeUploadId
    } = deps;
    const fs = fsPromises;
    const action = data.action || '';
    const requestId = data.requestId;

    const resolveRequesterId = async () => {
      let requesterId = connection?._wsApiUserId || null;
      try {
        const authExpMs = connection && typeof connection._wsApiAuthExpMs === 'number' ? connection._wsApiAuthExpMs : null;
        if (requesterId && authExpMs && Date.now() >= authExpMs) {
          detachWsApiClient(connection);
          requesterId = null;
        }
      } catch (error) {
        console.warn("[server] operation failed", error);
      }

      if (!requesterId && data.token) {
        try {
          const jwt = await import('jsonwebtoken');
          const jwtSecret = getRequiredJwtSecret();
          const decoded = jwt.default.verify(String(data.token), jwtSecret);
          const decodedUserId = decoded?.userId || decoded?.id || decoded?.user_id || decoded?.sub || null;
          if (decodedUserId) {
            requesterId = String(decodedUserId);
            attachWsApiClientToUser(connection, requesterId);
            if (decoded && typeof decoded.exp === 'number') {
              connection._wsApiAuthExpMs = decoded.exp * 1000;
            }
          }
        } catch (error) {
          console.warn("[server] operation failed", error);
          requesterId = null;
        }
      }

      if (!requesterId) {
        return null;
      }
      return requesterId;
    };

    const userId = await resolveRequesterId();
    if (!userId) {
      safeSend({
        type: 'file-response',
        requestId,
        success: false,
        error: 'file_request_auth_required'
      });
      return;
    }
    if (!await isWsApiPrincipalProvisioned(userId)) {
      safeSend({
        type: 'file-response',
        requestId,
        success: false,
        error: 'remote_account_not_provisioned'
      });
      return;
    }
    const identifier = data.atome_id || data.id || data.file_id || data.identifier || data.file;

    const sendFileResponse = (payload) => {
      safeSend({
        type: 'file-response',
        requestId,
        success: Boolean(payload?.success),
        ...payload
      });
    };

    if (!action) {
      sendFileResponse({ success: false, error: 'Missing file action' });
      return;
    }

    if (action === 'download-info') {
      if (!identifier) {
        sendFileResponse({ success: false, error: 'Missing file identifier' });
        return;
      }

      try {
        let downloadsSnapshot = null;
        if (data.debug) {
          downloadsSnapshot = await listUserDownloadsSnapshot(userId);
          console.log('[file-sync] server downloads snapshot (download-info)', downloadsSnapshot);
        }
        const target = await resolveDownloadTarget(identifier, userId);
        if (!target?.filePath) {
          sendFileResponse({
            success: false,
            error: 'File not found',
            status: 404,
            downloadsSnapshot
          });
          return;
        }
        const stats = await fs.stat(target.filePath);
        const sizeBytes = stats?.size ?? 0;
        const chunkSize = coerceWsChunkSize(data.chunk_size || data.chunkSize);
        const chunkCount = sizeBytes ? Math.ceil(sizeBytes / chunkSize) : 0;
        const meta = target.meta || null;

        sendFileResponse({
          success: true,
          action,
          atome_id: meta?.atome_id || identifier,
          file_name: meta?.file_name || target.downloadName || String(identifier),
          original_name: meta?.original_name || target.downloadName || String(identifier),
          file_path: meta?.file_path || null,
          mime_type: meta?.mime_type || null,
          size_bytes: sizeBytes,
          chunk_size: chunkSize,
          chunk_count: chunkCount,
          downloadsSnapshot
        });
      } catch (error) {
        sendFileResponse({ success: false, error: error.message || 'download_info_failed' });
      }
      return;
    }

    if (action === 'download-chunk') {
      if (!identifier) {
        sendFileResponse({ success: false, error: 'Missing file identifier' });
        return;
      }

      const chunkIndex = Number(data.chunk_index ?? data.chunkIndex ?? -1);
      if (!Number.isFinite(chunkIndex) || chunkIndex < 0) {
        sendFileResponse({ success: false, error: 'Invalid chunk index' });
        return;
      }

      const chunkSize = coerceWsChunkSize(data.chunk_size || data.chunkSize);

      let handle;
      try {
        const target = await resolveDownloadTarget(identifier, userId);
        if (!target?.filePath) {
          sendFileResponse({ success: false, error: 'File not found', status: 404 });
          return;
        }
        handle = await fs.open(target.filePath, 'r');
        const stats = await handle.stat();
        const sizeBytes = stats?.size ?? 0;
        const offset = chunkIndex * chunkSize;
        if (offset >= sizeBytes) {
          sendFileResponse({ success: false, error: 'Chunk out of range' });
          return;
        }

        const readLength = Math.min(chunkSize, sizeBytes - offset);
        const buffer = Buffer.alloc(readLength);
        await handle.read(buffer, 0, readLength, offset);
        const chunkBase64 = buffer.toString('base64');

        sendFileResponse({
          success: true,
          action,
          atome_id: identifier,
          chunk_index: chunkIndex,
          chunk_size: chunkSize,
          size_bytes: sizeBytes,
          chunk_base64: chunkBase64,
          done: offset + readLength >= sizeBytes
        });
      } catch (error) {
        sendFileResponse({ success: false, error: error.message || 'download_chunk_failed' });
      } finally {
        if (handle) {
          try { await handle.close(); } catch (error) {
            console.warn("[server] operation failed", error);
          }
        }
      }
      return;
    }

    if (action === 'upload-chunk') {
      const uploadId = sanitizeUploadId(data.upload_id);
      const chunkIndex = Number(data.chunk_index ?? -1);
      const chunkCount = Number(data.chunk_count ?? 0);
      const chunkBase64 = data.chunk_base64 || data.chunk;

      if (!uploadId) {
        sendFileResponse({ success: false, error: 'Missing or invalid uploadId' });
        return;
      }
      if (!Number.isFinite(chunkIndex) || chunkIndex < 0) {
        sendFileResponse({ success: false, error: 'Invalid chunk index' });
        return;
      }
      if (!chunkBase64) {
        sendFileResponse({ success: false, error: 'Missing chunk data' });
        return;
      }

      try {
        const bytes = Buffer.from(String(chunkBase64), 'base64');
        await fs.mkdir(UPLOADS_TMP_DIR, { recursive: true, mode: 0o700 });
        const uploadDir = path.join(UPLOADS_TMP_DIR, uploadId);
        await fs.mkdir(uploadDir, { recursive: true, mode: 0o700 });
        const chunkPath = path.join(uploadDir, `${chunkIndex}.part`);
        await fs.writeFile(chunkPath, bytes);

        sendFileResponse({
          success: true,
          action,
          upload_id: uploadId,
          chunk_index: chunkIndex,
          chunk_count: chunkCount,
          size_bytes: bytes.length
        });
      } catch (error) {
        sendFileResponse({ success: false, error: error.message || 'upload_chunk_failed' });
      }
      return;
    }

    if (action === 'upload-complete') {
      const uploadId = sanitizeUploadId(data.upload_id);
      const chunkCount = Number(data.chunk_count ?? 0);
      const rawFileName = data.file_name || data.name || '';
      const rawFilePath = data.file_path || data.path || '';
      const atomeId = data.atome_id || null;
      const atomeType = data.atome_type || null;
      const originalName = data.original_name || rawFileName || null;
      const mimeType = data.mime_type || null;

      if (!uploadId) {
        sendFileResponse({ success: false, error: 'Missing or invalid uploadId' });
        return;
      }

      if (!rawFileName && !rawFilePath) {
        sendFileResponse({ success: false, error: 'Missing fileName or filePath' });
        return;
      }

      try {
        let fileName = rawFileName;
        let filePath = null;
        let relativePath = null;

        if (rawFilePath) {
          const normalizedRelative = normalizeUserRelativePath(rawFilePath, userId);
          const resolved = await resolveUserAssetPath(
            projectRoot,
            { id: userId },
            normalizedRelative
          );
          fileName = fileName || resolved.fileName;
          filePath = resolved.filePath;
          relativePath = resolved.relativePath;
        } else {
          const resolved = await resolveUserUploadPath(
            projectRoot,
            { id: userId },
            fileName || 'upload.bin'
          );
          fileName = resolved.fileName;
          filePath = resolved.filePath;
          relativePath = path.join('Downloads', resolved.fileName);
        }

        if (!filePath) {
          sendFileResponse({ success: false, error: 'Unable to resolve file path' });
          return;
        }

        const uploadDir = path.join(UPLOADS_TMP_DIR, uploadId);

        if (chunkCount > 0) {
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
        } else {
          await fs.writeFile(filePath, Buffer.alloc(0));
        }

        try {
          await fs.rm(uploadDir, { recursive: true, force: true });
        } catch (error) {
          console.warn("[server] operation failed", error);
        }
        await ensureVideoPlaybackCache(filePath, fileName, mimeType || '');

        if (DATABASE_ENABLED) {
          const stats = await fs.stat(filePath).catch(() => null);
          await registerFileUpload(fileName, userId, {
            atome_id: atomeId || null,
            atome_type: atomeType || null,
            original_name: originalName || fileName,
            mime_type: mimeType || null,
            size_bytes: stats ? stats.size : null,
            file_path: relativePath || null
          });
        }

        let downloadsSnapshot = null;
        if (data.debug) {
          downloadsSnapshot = await listUserDownloadsSnapshot(userId);
          console.log('[file-sync] server downloads snapshot (upload-complete)', downloadsSnapshot);
        }
        sendFileResponse({
          success: true,
          action,
          file_name: fileName,
          owner_id: userId,
          file_path: relativePath || null,
          downloadsSnapshot
        });
      } catch (error) {
        sendFileResponse({ success: false, error: error.message || 'upload_complete_failed' });
      }
      return;
    }

    sendFileResponse({ success: false, error: `Unknown file action: ${action}` });
    return;
}
