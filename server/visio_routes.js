/**
 * visio HTTP routes — ADOLE v3.0
 * Split from visio.js; deps injected by createVisioService via the ctx object.
 */

import { v4 as uuidv4 } from 'uuid';
import db from '../database/adole.js';
import { findUserById } from './auth.js';
import { nowIso, normalizePhone, makeRequestId, normalizeVisibility } from './visio_helpers.js';

export function createVisioRoutes({ rooms, connectionRequests, connections, databaseEnabled, ensureRoom, resolveAuthUserFromRequest, resolveUserInfo, isConnected, addConnection, getRoomMeta, ensureRoomMeta }) {
  function registerRoutes(server) {
    const replyJson = (reply, statusCode, payload) => {
      reply.code(statusCode);
      return payload;
    };

    server.post('/contacts/request', async (request, reply) => {
      const auth = await resolveAuthUserFromRequest(request);
      const fromUserId = auth?.id || auth?.user_id || null;
      if (!fromUserId) {
        return replyJson(reply, 401, { success: false, error: 'Unauthorized' });
      }

      const toPhone = normalizePhone(request.body?.to_phone_e164 || request.body?.toPhone);
      if (!toPhone) {
        return replyJson(reply, 400, { success: false, error: 'Missing to_phone_e164' });
      }

      const toUserInfo = await resolveUserInfo(null, toPhone);
      if (!toUserInfo?.id) {
        return replyJson(reply, 404, { success: false, error: 'User not found' });
      }

      if (isConnected(fromUserId, toUserInfo.id)) {
        return { success: true, status: 'already_connected', request_id: null };
      }

      const requestId = makeRequestId();
      const payload = {
        id: requestId,
        from_user_id: fromUserId,
        to_user_id: toUserInfo.id,
        status: 'pending',
        created_at: nowIso(),
        updated_at: nowIso()
      };
      connectionRequests.set(requestId, payload);

      return { success: true, request_id: requestId, status: payload.status };
    });

    server.post('/contacts/respond', async (request, reply) => {
      const auth = await resolveAuthUserFromRequest(request);
      const userId = auth?.id || auth?.user_id || null;
      if (!userId) {
        return replyJson(reply, 401, { success: false, error: 'Unauthorized' });
      }

      const requestId = request.body?.request_id || request.body?.requestId;
      const decision = request.body?.decision;
      if (!requestId || !decision) {
        return replyJson(reply, 400, { success: false, error: 'Missing request_id or decision' });
      }

      const pending = connectionRequests.get(requestId);
      if (!pending) {
        return replyJson(reply, 404, { success: false, error: 'Request not found' });
      }
      if (pending.to_user_id !== userId) {
        return replyJson(reply, 403, { success: false, error: 'Not allowed' });
      }

      const normalizedDecision = String(decision).toLowerCase();
      if (!['accepted', 'rejected', 'blocked'].includes(normalizedDecision)) {
        return replyJson(reply, 400, { success: false, error: 'Invalid decision' });
      }

      pending.status = normalizedDecision;
      pending.updated_at = nowIso();
      connectionRequests.set(requestId, pending);

      if (normalizedDecision === 'accepted') {
        addConnection(pending.from_user_id, pending.to_user_id);
      }

      return { success: true, status: pending.status };
    });

    server.get('/contacts', async (request, reply) => {
      const auth = await resolveAuthUserFromRequest(request);
      const userId = auth?.id || auth?.user_id || null;
      if (!userId) {
        return replyJson(reply, 401, { success: false, error: 'Unauthorized' });
      }

      const connectedIds = Array.from(connections.get(userId) || []);
      if (!databaseEnabled) {
        return {
          success: true,
          connections: connectedIds.map((id) => ({ user_id: id }))
        };
      }

      const dataSource = db.getDataSourceAdapter();
      const detailed = [];
      for (const id of connectedIds) {
        try {
          const user = await findUserById(dataSource, id);
          if (user) {
            detailed.push({
              user_id: user.user_id,
              phone: user.phone,
              username: user.username
            });
          } else {
            detailed.push({ user_id: id });
          }
        } catch (error) {
        console.warn("[cleanup] operation failed", error);
          detailed.push({ user_id: id });
        }
      }

      return { success: true, connections: detailed };
    });

    server.post('/rooms', async (request, reply) => {
      const auth = await resolveAuthUserFromRequest(request);
      const userId = auth?.id || auth?.user_id || null;
      if (!userId) {
        return replyJson(reply, 401, { success: false, error: 'Unauthorized' });
      }

      const roomId = uuidv4();
      const visibility = normalizeVisibility(request.body?.visibility);
      const name = request.body?.name || `Room ${roomId.slice(0, 6)}`;
      ensureRoomMeta(roomId, userId, name, visibility);

      return { success: true, room_id: roomId };
    });

    server.get('/rooms/:room_id', async (request, reply) => {
      const roomId = request.params?.room_id;
      const meta = roomId ? getRoomMeta(roomId) : null;
      if (!meta) {
        return replyJson(reply, 404, { success: false, error: 'Room not found' });
      }
      return {
        success: true,
        room: {
          room_id: meta.room_id,
          owner_user_id: meta.owner_user_id,
          name: meta.name,
          visibility: meta.visibility,
          created_at: meta.created_at
        }
      };
    });

    server.post('/rooms/:room_id/invite', async (request, reply) => {
      const auth = await resolveAuthUserFromRequest(request);
      const userId = auth?.id || auth?.user_id || null;
      if (!userId) {
        return replyJson(reply, 401, { success: false, error: 'Unauthorized' });
      }

      const roomId = request.params?.room_id;
      const meta = roomId ? getRoomMeta(roomId) : null;
      if (!meta) {
        return replyJson(reply, 404, { success: false, error: 'Room not found' });
      }
      if (meta.owner_user_id && meta.owner_user_id !== userId) {
        return replyJson(reply, 403, { success: false, error: 'Only owner can invite' });
      }

      const toPhone = normalizePhone(request.body?.to_phone_e164 || request.body?.toPhone);
      if (!toPhone) {
        return replyJson(reply, 400, { success: false, error: 'Missing to_phone_e164' });
      }

      const toUserInfo = await resolveUserInfo(null, toPhone);
      if (!toUserInfo?.id) {
        return replyJson(reply, 404, { success: false, error: 'User not found' });
      }

      if (!isConnected(userId, toUserInfo.id) && meta.visibility !== 'public') {
        return replyJson(reply, 403, { success: false, error: 'Not connected to user' });
      }

      meta.invites.add(toUserInfo.id);
      return { success: true };
    });

    server.post('/rooms/:room_id/join', async (request, reply) => {
      const auth = await resolveAuthUserFromRequest(request);
      const userId = auth?.id || auth?.user_id || null;
      if (!userId) {
        return replyJson(reply, 401, { success: false, error: 'Unauthorized' });
      }

      const roomId = request.params?.room_id;
      const meta = roomId ? getRoomMeta(roomId) : null;
      if (!meta) {
        return replyJson(reply, 404, { success: false, error: 'Room not found' });
      }

      const isOwner = meta.owner_user_id === userId;
      const isInvited = meta.invites?.has(userId);
      const isVisible = meta.visibility === 'public';
      const isConnection = meta.visibility === 'connections' && isConnected(userId, meta.owner_user_id);

      if (!isOwner && !isInvited && !isVisible && !isConnection) {
        return replyJson(reply, 403, { success: false, error: 'Access denied' });
      }

      const room = await ensureRoom(roomId, meta.owner_user_id || userId);
      return {
        success: true,
        room_id: roomId,
        rtpCapabilities: room.router.rtpCapabilities,
        joinToken: uuidv4()
      };
    });
  }
  return registerRoutes;
}
