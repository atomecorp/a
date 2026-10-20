// Remote wallpaper download: fetches a random image from the provider (with
// per-attempt deadlines) and stores it for the caller, or answers it inline to a
// caller that cannot own a file.
import crypto from 'crypto';
import path from 'path';
import { promises as fs } from 'fs';
import { registerFileUpload, resolveOwnerPrincipal } from './userFiles.js';
import { resolveUserUploadPath } from './fileStorage.js';

const RANDOM_WALLPAPER_URL = 'https://picsum.photos/1920/1080';
const RANDOM_WALLPAPER_MAX_BYTES = 12 * 1024 * 1024;
// A single-shot fetch against one provider URL made the feature fail for a
// reason the user could do nothing about: one redirect hiccup or one slow CDN
// edge and the download was simply "broken". Each attempt now carries its own
// deadline and the next attempt asks for a different image path, so a stuck
// edge is retried instead of being reported as a permanent failure.
const RANDOM_WALLPAPER_ATTEMPT_TIMEOUT_MS = 12000;
const RANDOM_WALLPAPER_ATTEMPTS = 3;
const RANDOM_WALLPAPER_EXTENSIONS = new Map([
  ['image/jpeg', '.jpg'],
  ['image/png', '.png'],
  ['image/webp', '.webp'],
  ['image/gif', '.gif']
]);

function buildRandomWallpaperAttemptUrl(attempt) {
  if (attempt <= 0) return RANDOM_WALLPAPER_URL;
  // The seeded route is served by the same provider through a different cache
  // key, which is what makes a retry worth doing at all.
  const seed = crypto.randomUUID().replace(/-/g, '').slice(0, 12);
  return `https://picsum.photos/seed/${seed}/1920/1080`;
}

async function fetchRandomWallpaperBytes() {
  let lastFailure = { ok: false, status: 502, error: 'wallpaper_source_unreachable' };

  for (let attempt = 0; attempt < RANDOM_WALLPAPER_ATTEMPTS; attempt += 1) {
    const url = buildRandomWallpaperAttemptUrl(attempt);
    try {
      const upstream = await fetch(url, {
        method: 'GET',
        redirect: 'follow',
        signal: AbortSignal.timeout(RANDOM_WALLPAPER_ATTEMPT_TIMEOUT_MS),
        headers: { Accept: 'image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8' }
      });
      if (!upstream.ok) {
        lastFailure = { ok: false, status: 502, error: `wallpaper_source_http_${upstream.status}` };
        continue;
      }

      const mimeType = String(upstream.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
      const extension = RANDOM_WALLPAPER_EXTENSIONS.get(mimeType);
      if (!extension) {
        // A non-image answer is the provider serving an error page: another
        // attempt can still succeed, so this is not a terminal verdict yet.
        lastFailure = { ok: false, status: 415, error: 'wallpaper_source_not_image' };
        continue;
      }

      const contentLength = Number(upstream.headers.get('content-length') || 0);
      if (Number.isFinite(contentLength) && contentLength > RANDOM_WALLPAPER_MAX_BYTES) {
        return { ok: false, status: 413, error: 'wallpaper_source_too_large' };
      }

      const bytes = Buffer.from(await upstream.arrayBuffer());
      if (!bytes.length) {
        lastFailure = { ok: false, status: 502, error: 'wallpaper_source_empty' };
        continue;
      }
      if (bytes.length > RANDOM_WALLPAPER_MAX_BYTES) {
        return { ok: false, status: 413, error: 'wallpaper_source_too_large' };
      }

      return { ok: true, bytes, mimeType, extension };
    } catch (error) {
      const timedOut = error?.name === 'TimeoutError' || error?.name === 'AbortError';
      lastFailure = {
        ok: false,
        status: 504,
        error: timedOut ? 'wallpaper_source_timeout' : 'wallpaper_source_unreachable'
      };
    }
  }

  return lastFailure;
}

export function registerRemoteWallpaperRoute(server, { projectRoot, DATABASE_ENABLED, resolveUploadIdentity }) {
  // The wallpaper download used to spend the whole outbound fetch, write the
  // file, and only THEN discover the caller owned nothing — answering 401
  // after the work was already done and after an orphan file had to be
  // removed. Ownership is the first thing decided now, and a caller who
  // cannot own a file (a browser guest has no server-side principal at all)
  // is served the image inline instead of being refused: the wallpaper is a
  // preference, not a possession.
  const WALLPAPER_INLINE_COOLDOWN_MS = 2000;
  const wallpaperInlineCooldown = new Map();

  const acceptsInlineWallpaper = (request) => {
    const raw = request.query?.inline ?? request.query?.allow_inline ?? request.headers['x-wallpaper-inline'];
    const value = Array.isArray(raw) ? raw[0] : raw;
    const text = String(value ?? '').trim().toLowerCase();
    return text === '1' || text === 'true' || text === 'yes';
  };

  const inlineWallpaperThrottled = (request) => {
    const now = Date.now();
    const key = String(request.ip || 'unknown');
    for (const [entry, seenAt] of wallpaperInlineCooldown) {
      if (now - seenAt > WALLPAPER_INLINE_COOLDOWN_MS * 30) wallpaperInlineCooldown.delete(entry);
    }
    const last = wallpaperInlineCooldown.get(key) || 0;
    if (now - last < WALLPAPER_INLINE_COOLDOWN_MS) return true;
    wallpaperInlineCooldown.set(key, now);
    return false;
  };

  server.post('/api/uploads/remote-wallpaper', async (request, reply) => {
    try {
      const { user, userId } = await resolveUploadIdentity(request);
      const ownership = DATABASE_ENABLED
        ? await resolveOwnerPrincipal(userId)
        : { ok: true, ownerId: userId };

      if (!ownership.ok && !acceptsInlineWallpaper(request)) {
        // Told before any outbound traffic, and told WHY: the caller can
        // either sign in or ask for the inline answer instead of retrying a
        // request that can never succeed as posted.
        reply.code(401);
        return {
          success: false,
          error: ownership.error || 'upload_identity_required',
          inline_supported: true
        };
      }

      if (!ownership.ok && inlineWallpaperThrottled(request)) {
        reply.code(429);
        return { success: false, error: 'wallpaper_rate_limited' };
      }

      const download = await fetchRandomWallpaperBytes();
      if (!download.ok) {
        reply.code(download.status || 502);
        return { success: false, error: download.error || 'wallpaper_source_unreachable' };
      }
      const { bytes, mimeType, extension } = download;

      if (!ownership.ok) {
        // No principal owns this file, so nothing is written to disk: the
        // image travels back inline and lives in the session's preferences.
        return {
          success: true,
          stored: false,
          owner_id: null,
          data_url: `data:${mimeType};base64,${bytes.toString('base64')}`,
          mime_type: mimeType,
          size_bytes: bytes.length,
          source: 'remote_wallpaper_inline'
        };
      }

      const resolved = await resolveUserUploadPath(
        projectRoot,
        { id: userId, username: user?.username },
        `wallpaper_${Date.now()}${extension}`
      );
      await fs.writeFile(resolved.filePath, bytes);
      const relativePath = path.join('Downloads', resolved.fileName);

      if (DATABASE_ENABLED) {
        const registration = await registerFileUpload(resolved.fileName, userId, {
          atome_id: null,
          atome_type: 'image',
          original_name: resolved.fileName,
          mime_type: mimeType,
          size_bytes: bytes.length,
          file_path: relativePath
        });
        if (!registration?.success) {
          await fs.rm(resolved.filePath, { force: true });
          // A missing or unprovisioned identity is the caller's situation, not
          // a server fault: it answered 500 and told nobody what to do.
          const identityFault = registration?.error === 'upload_identity_required'
            || registration?.error === 'remote_account_not_provisioned';
          reply.code(identityFault ? 401 : 500);
          return {
            success: false,
            error: registration?.error || 'file_registration_failed',
            ...(identityFault ? { inline_supported: true } : {})
          };
        }
      }

      return {
        success: true,
        stored: true,
        file_name: resolved.fileName,
        owner_id: userId,
        file_path: relativePath,
        mime_type: mimeType,
        size_bytes: bytes.length,
        source: 'remote_wallpaper'
      };
    } catch (error) {
      request.log.error({ err: error }, 'Remote wallpaper download failed');
      reply.code(500);
      return { success: false, error: error.message };
    }
  });
}
