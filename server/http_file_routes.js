// User file routes with ownership filtering: owned / accessible listings,
// share / unshare, visibility and admin stats.
import { getFileMetadata, getUserFiles, getAccessibleFiles, setFilePublic, getFileStats } from './userFiles.js';
import { shareFile, unshareFile } from './user_files_sharing.js';
import { ensureSharedFileLink, removeSharedFileLink } from './fileStorage.js';
import { isAdminPasswordValid, getAdminPasswordFromRequest, resolveUserId } from './server_utils.js';

export function registerFileRoutes(server, { projectRoot, replyJson, validateToken }) {
  // =========================================================================
  // USER FILES ROUTES - Get files with ownership filtering
  // =========================================================================

  // Get my files (files I own)
  server.get('/api/files/my-files', async (request, reply) => {
    const user = await validateToken(request);
    if (!user) {
      return replyJson(reply, 401, { success: false, error: 'Unauthorized' });
    }

    const userId = resolveUserId(user);
    const files = await getUserFiles(userId);

    return { success: true, data: files, count: files.length };
  });

  // Get all accessible files (owned + shared)
  server.get('/api/files/accessible', async (request, reply) => {
    const user = await validateToken(request);
    if (!user) {
      return replyJson(reply, 401, { success: false, error: 'Unauthorized' });
    }

    const userId = resolveUserId(user);
    const files = await getAccessibleFiles(userId);

    return { success: true, data: files, count: files.length };
  });

  // Share a file
  server.post('/api/files/share', async (request, reply) => {
    const user = await validateToken(request);
    if (!user) {
      return replyJson(reply, 401, { success: false, error: 'Unauthorized' });
    }

    const { file_id, atome_id, file_name, target_user_id, permission } = request.body || {};
    const fileIdentifier = file_id || atome_id || file_name;

    if (!fileIdentifier || !target_user_id) {
      return replyJson(reply, 400, { success: false, error: 'Missing file identifier or target_user_id' });
    }

    const userId = resolveUserId(user);
    const result = await shareFile(fileIdentifier, userId, target_user_id, permission || 'read');

    if (!result.success) {
      return replyJson(reply, 403, result);
    }

    if (result.file?.file_name) {
      const link = await ensureSharedFileLink({
        projectRoot,
        ownerId: result.file.owner_id,
        targetUserId: target_user_id,
        fileName: result.file.file_name
      });
      if (!link.ok) {
        result.link_warning = link.error || 'Shared link not created';
      } else {
        result.link = link;
      }
    }

    return result;
  });

  // Unshare a file
  server.post('/api/files/unshare', async (request, reply) => {
    const user = await validateToken(request);
    if (!user) {
      return replyJson(reply, 401, { success: false, error: 'Unauthorized' });
    }

    const { file_id, atome_id, file_name, target_user_id } = request.body || {};
    const fileIdentifier = file_id || atome_id || file_name;

    if (!fileIdentifier || !target_user_id) {
      return replyJson(reply, 400, { success: false, error: 'Missing file identifier or target_user_id' });
    }

    const userId = resolveUserId(user);
    const result = await unshareFile(fileIdentifier, userId, target_user_id);

    if (!result.success) {
      return replyJson(reply, 403, result);
    }

    if (result.file?.file_name) {
      const link = await removeSharedFileLink({
        projectRoot,
        ownerId: result.file.owner_id,
        targetUserId: target_user_id,
        fileName: result.file.file_name
      });
      if (!link.ok) {
        result.link_warning = link.error || 'Shared link not removed';
      } else {
        result.link = link;
      }
    }

    return result;
  });

  // Set file public/private
  server.post('/api/files/visibility', async (request, reply) => {
    const user = await validateToken(request);
    if (!user) {
      return replyJson(reply, 401, { success: false, error: 'Unauthorized' });
    }

    const { file_id, atome_id, file_name, is_public } = request.body || {};
    const fileIdentifier = file_id || atome_id || file_name;

    if (!fileIdentifier || typeof is_public !== 'boolean') {
      return replyJson(reply, 400, { success: false, error: 'Missing file identifier or is_public' });
    }

    const userId = resolveUserId(user);
    const meta = await getFileMetadata(fileIdentifier, { owner_id: userId });
    if (!meta) {
      return replyJson(reply, 404, { success: false, error: 'File not found' });
    }

    const result = await setFilePublic(meta.atome_id, userId, is_public);

    if (!result.success) {
      return replyJson(reply, 403, result);
    }

    return result;
  });

  // Get file stats (admin)
  server.get('/api/files/stats', async (request, reply) => {
    const user = await validateToken(request);
    if (!user) {
      return replyJson(reply, 401, { success: false, error: 'Unauthorized' });
    }

    if (!isAdminPasswordValid(getAdminPasswordFromRequest(request))) {
      return replyJson(reply, 403, { success: false, error: 'admin_required' });
    }

    const stats = await getFileStats();

    return { success: true, data: stats };
  });
}
