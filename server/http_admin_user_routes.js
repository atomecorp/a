// Admin user data export / import (zip or JSON). A user may export / import
// their own data; anything else requires the admin password.
import db from '../database/adole.js';
import { findUserById, findUserByPhone } from './auth_users.js';
import { normalizePhone } from './auth_crypto.js';
import { buildUserExportZip, inspectUserExportZip, importUserExportZip } from './userExportImport.js';
import { isAdminPasswordValid, getAdminPasswordFromRequest, resolveUserId } from './server_utils.js';

export function registerAdminUserRoutes(server, { DATABASE_ENABLED, DB_REQUIRED_MESSAGE, projectRoot, replyJson, validateToken }) {
  // Export user data (admin for multi-user)
  server.post('/api/admin/users/export', async (request, reply) => {
    if (!DATABASE_ENABLED) {
      reply.code(503);
      return { success: false, error: DB_REQUIRED_MESSAGE };
    }

    const adminPassword = getAdminPasswordFromRequest(request);
    let adminBypass = false;
    let user = await validateToken(request);
    if (!user) {
      if (isAdminPasswordValid(adminPassword)) {
        adminBypass = true;
        user = { id: 'admin', user_id: 'admin', sub: 'admin', username: 'admin' };
      } else {
        return replyJson(reply, 401, { success: false, error: 'Unauthorized' });
      }
    }

    const payload = request.body || {};
    const requested = Array.isArray(payload.users) ? payload.users : [];
    const dataSource = db.getDataSourceAdapter();
    request.log.info({
      route: '/api/admin/users/export',
      requester: resolveUserId(user),
      requestedCount: requested.length,
      format: payload.format || 'zip',
      includeFiles: payload.include_files !== false,
      adminBypass
    }, '[Export] Request received');

    const resolveRequestedUserId = async (entry) => {
      if (!entry) return null;
      let id = null;
      let phone = null;
      if (typeof entry === 'object') {
        id = entry.user_id || entry.userId || entry.id || null;
        phone = entry.phone || entry.user_phone || entry.userPhone || null;
      } else {
        id = String(entry);
      }

      const phoneCandidate = phone || (typeof id === 'string' && /^[+0-9]{6,}$/.test(id) ? id : null);
      if (phoneCandidate) {
        const normalized = normalizePhone(phoneCandidate);
        if (normalized) {
          const found = await findUserByPhone(dataSource, normalized);
          if (found?.user_id) return found.user_id;
          return null;
        }
      }

      if (!id) return null;
      const found = await findUserById(dataSource, String(id));
      return found?.user_id || null;
    };

    let userIds = [];
    if (requested.length > 0) {
      for (const entry of requested) {
        const resolved = await resolveRequestedUserId(entry);
        if (!resolved) {
          return replyJson(reply, 404, { success: false, error: 'user_not_found' });
        }
        userIds.push(resolved);
      }
    } else {
      const currentUserId = resolveUserId(user);
      userIds = [currentUserId];
    }

    const currentUserId = resolveUserId(user);
    const uniqueUserIds = Array.from(new Set(userIds));
    const requiresAdmin = uniqueUserIds.length > 1 || uniqueUserIds.some((id) => id !== currentUserId);
    const isAdmin = adminBypass || isAdminPasswordValid(adminPassword);
    if (requiresAdmin && !isAdmin) {
      request.log.warn({
        route: '/api/admin/users/export',
        requester: currentUserId,
        requiresAdmin,
        userCount: uniqueUserIds.length
      }, '[Export] Admin password required');
      return replyJson(reply, 403, { success: false, error: 'admin_required' });
    }

    try {
      const includeFiles = payload.include_files !== false;
      const exportResult = await buildUserExportZip({
        projectRoot,
        dataSource,
        userIds: uniqueUserIds,
        includeFiles
      });

      if (!exportResult?.buffer) {
        request.log.error({
          route: '/api/admin/users/export',
          requester: currentUserId
        }, '[Export] Export failed (no buffer)');
        return replyJson(reply, 500, { success: false, error: 'export_failed' });
      }

      const format = String(payload.format || 'zip').toLowerCase();
      if (format !== 'zip') {
        if (format !== 'json') {
          return replyJson(reply, 400, { success: false, error: 'unsupported_format' });
        }
        request.log.info({
          route: '/api/admin/users/export',
          requester: currentUserId,
          userCount: uniqueUserIds.length,
          tableCounts: exportResult.manifest?.tables || {}
        }, '[Export] JSON response');
        return {
          success: true,
          manifest: exportResult.manifest,
          tables: exportResult.tables
        };
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `eve_users_export_${timestamp}.zip`;
      request.log.info({
        route: '/api/admin/users/export',
        requester: currentUserId,
        userCount: uniqueUserIds.length,
        filename
      }, '[Export] Zip response');
      reply.header('Content-Type', 'application/zip');
      reply.header('Content-Disposition', `attachment; filename="${filename}"`);
      return reply.send(exportResult.buffer);
    } catch (error) {
      request.log.error({ err: error }, 'User export failed');
      return reply.code(500).send({ success: false, error: error?.message || 'export_failed' });
    }
  });

  // Import user data from zip (admin for multi-user)
  server.post('/api/admin/users/import', async (request, reply) => {
    if (!DATABASE_ENABLED) {
      reply.code(503);
      return { success: false, error: DB_REQUIRED_MESSAGE };
    }

    const adminPassword = getAdminPasswordFromRequest(request);
    let adminBypass = false;
    let user = await validateToken(request);
    if (!user) {
      if (isAdminPasswordValid(adminPassword)) {
        adminBypass = true;
        user = { id: 'admin', user_id: 'admin', sub: 'admin', username: 'admin' };
      } else {
        return replyJson(reply, 401, { success: false, error: 'Unauthorized' });
      }
    }

    const body = request.body;
    if (!body || !Buffer.isBuffer(body)) {
      return replyJson(reply, 400, { success: false, error: 'invalid_payload' });
    }

    request.log.info({
      route: '/api/admin/users/import',
      requester: resolveUserId(user),
      bytes: body.length,
      adminBypass
    }, '[Import] Request received');

    const inspect = inspectUserExportZip(body);
    const users = Array.isArray(inspect?.users) ? inspect.users : [];
    const currentUserId = resolveUserId(user);
    const requiresAdmin = users.length !== 1 || users[0] !== currentUserId;
    const isAdmin = adminBypass || isAdminPasswordValid(adminPassword);
    if (requiresAdmin && !isAdmin) {
      request.log.warn({
        route: '/api/admin/users/import',
        requester: currentUserId,
        requiresAdmin,
        userCount: users.length
      }, '[Import] Admin password required');
      return replyJson(reply, 403, { success: false, error: 'admin_required' });
    }

    try {
      const dataSource = db.getDataSourceAdapter();
      const result = await importUserExportZip({
        projectRoot,
        dataSource,
        zipBuffer: body
      });

      request.log.info({
        route: '/api/admin/users/import',
        requester: currentUserId,
        userCount: users.length,
        tables: result?.tables || {},
        filesWritten: result?.files_written || 0
      }, '[Import] Completed');
      return {
        success: true,
        users,
        ...result
      };
    } catch (error) {
      request.log.error({ err: error }, 'User import failed');
      return reply.code(500).send({ success: false, error: error?.message || 'import_failed' });
    }
  });

  console.warn('[Admin] Routes registered: POST /api/admin/users/export, POST /api/admin/users/import');

  // User management is handled by typed auth actions on /ws/api.
  // which use the ADOLE v3.0 schema (atomes + particles tables)
}
