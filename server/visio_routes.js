/**
 * visio HTTP routes — ADOLE v3.0
 * Split from visio.js; deps injected by createVisioService via the ctx object.
 */

import { v4 as uuidv4 } from 'uuid';
import db from '../database/adole.js';
import { findUserById } from './auth_users.js';
import { nowIso, normalizePhone, makeRequestId, normalizeVisibility } from './visio_helpers.js';

// Participants au plus par salle, pendant la phase de test (todo/visio_client_2026-09-30.md).
const MAX_ROOM_PARTICIPANTS = 6;

export function createVisioRoutes({ rooms, connectionRequests, connections, databaseEnabled, ensureRoom, resolveAuthUserFromRequest, resolveUserInfo, isConnected, addConnection, getRoomMeta, resolveRoomMeta = async (id) => getRoomMeta(id), saveScheduledRoom = async () => {}, ensureRoomMeta, canJoinRoom, relations = null, notify = async () => {} }) {
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

      // Une seule relation de contact dans tout le produit (server/communication_relations.js).
      if (relations) {
        const result = await relations.request(fromUserId, toUserInfo.id);
        return { success: true, status: result.status, request_id: null };
      }
      if (await isConnected(fromUserId, toUserInfo.id)) {
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
      const meta = roomId ? await resolveRoomMeta(roomId) : null;
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
      const meta = roomId ? await resolveRoomMeta(roomId) : null;
      if (!meta) {
        return replyJson(reply, 404, { success: false, error: 'Room not found' });
      }
      // Appel improvise : le proprietaire, ou un participant deja invite, peut ajouter
      // quelqu'un (« + » du panneau de visio).
      if (meta.owner_user_id && meta.owner_user_id !== userId && !meta.invites?.has(userId)) {
        return replyJson(reply, 403, { success: false, error: 'Only participants can invite' });
      }

      const toUserId = String(request.body?.user_id || request.body?.userId || '').trim();
      const toPhone = normalizePhone(request.body?.to_phone_e164 || request.body?.toPhone);
      if (!toUserId && !toPhone) {
        return replyJson(reply, 400, { success: false, error: 'Missing user_id or to_phone_e164' });
      }

      // Un contact du carnet peut porter un id local : le numero prend alors le relais.
      const toUserInfo = (toUserId ? await resolveUserInfo(toUserId, null) : null)
        || (toPhone ? await resolveUserInfo(null, toPhone) : null);
      if (!toUserInfo?.id) {
        return replyJson(reply, 404, { success: false, error: 'User not found' });
      }

      // Inviter, c'est appeler : il faut etre contact accepte, et ne pas etre bloque (D3/D4),
      // meme pour une room publique. Un destinataire qui a bloque l'appelant n'est pas sonne,
      // et l'appelant n'en sait rien.
      const verdict = relations ? await relations.canCommunicate(userId, toUserInfo.id) : { ok: await isConnected(userId, toUserInfo.id) };
      if (!verdict.ok && verdict.silent) return { success: true };
      if (!verdict.ok) {
        return replyJson(reply, 403, { success: false, error: 'Not connected to user' });
      }
      if (!meta.invites.has(toUserInfo.id) && meta.invites.size + 1 >= MAX_ROOM_PARTICIPANTS) {
        return replyJson(reply, 409, { success: false, error: 'room_full' });
      }

      meta.invites.add(toUserInfo.id);
      // La sonnerie part par la messagerie : la notification arrive dans l'outil Com.
      await notify(toUserInfo.id, userId, {
        kind: 'call-invitation', message: meta.name || '', extra: { room_id: roomId }
      });
      return { success: true };
    });

    // Visio planifiee (invitation au calendrier, V4) : salle persistee, chaque contact recoit
    // `call-scheduled` ; en l'acceptant, son client cree l'evenement dans son calendrier.
    server.post('/rooms/schedule', async (request, reply) => {
      const auth = await resolveAuthUserFromRequest(request);
      const userId = auth?.id || auth?.user_id || null;
      if (!userId) return replyJson(reply, 401, { success: false, error: 'Unauthorized' });
      const startsAt = new Date(request.body?.starts_at || '');
      const endsAt = request.body?.ends_at ? new Date(request.body.ends_at) : null;
      if (Number.isNaN(startsAt.getTime()) || (endsAt && (Number.isNaN(endsAt.getTime()) || endsAt < startsAt))) {
        return replyJson(reply, 400, { success: false, error: 'invalid_schedule' });
      }
      const targets = Array.isArray(request.body?.participants) ? request.body.participants : [];
      if (!targets.length) return replyJson(reply, 400, { success: false, error: 'participants_required' });
      if (targets.length + 1 > MAX_ROOM_PARTICIPANTS) return replyJson(reply, 409, { success: false, error: 'room_full' });

      const roomId = uuidv4();
      const title = String(request.body?.title || 'Visio').slice(0, 200);
      const meta = ensureRoomMeta(roomId, userId, title, 'private');
      Object.assign(meta, { scheduled: true, starts_at: startsAt.toISOString(), ends_at: endsAt ? endsAt.toISOString() : null });
      const invited = [];
      const failed = [];
      for (const target of targets) {
        const toUserId = String(target?.user_id || target?.userId || '').trim();
        const toPhone = normalizePhone(target?.to_phone_e164 || target?.phone);
        const info = (toUserId ? await resolveUserInfo(toUserId, null) : null) || (toPhone ? await resolveUserInfo(null, toPhone) : null);
        if (!info?.id || info.id === userId) { failed.push({ target: toUserId || toPhone, error: 'user_not_found' }); continue; }
        const verdict = relations ? await relations.canCommunicate(userId, info.id) : { ok: await isConnected(userId, info.id) };
        // Bloque : ni invitation ni indice pour l'organisateur (comme l'appel direct).
        if (!verdict.ok && verdict.silent) continue;
        if (!verdict.ok) { failed.push({ target: info.id, error: 'not_connected' }); continue; }
        meta.invites.add(info.id);
        invited.push(info.id);
      }
      if (!invited.length && failed.length) return replyJson(reply, 403, { success: false, error: 'no_invitee', failed });
      await saveScheduledRoom(meta);
      for (const id of invited) {
        await notify(id, userId, {
          kind: 'call-scheduled', message: title, subject: title,
          extra: { room_id: roomId, starts_at: meta.starts_at, ends_at: meta.ends_at }
        });
      }
      return { success: true, room_id: roomId, starts_at: meta.starts_at, ends_at: meta.ends_at, invited, failed };
    });

    // Refuser, occupe ou sans reponse : l'appelant (proprietaire) en est prevenu.
    server.post('/rooms/:room_id/decline', async (request, reply) => {
      const auth = await resolveAuthUserFromRequest(request);
      const userId = auth?.id || auth?.user_id || null;
      if (!userId) return replyJson(reply, 401, { success: false, error: 'Unauthorized' });
      const roomId = request.params?.room_id;
      const meta = roomId ? await resolveRoomMeta(roomId) : null;
      if (!meta || !meta.invites?.has(userId)) return replyJson(reply, 404, { success: false, error: 'Room not found' });
      const reason = ['busy', 'missed'].includes(String(request.body?.reason)) ? String(request.body.reason) : 'declined';
      if (meta.owner_user_id) {
        await notify(meta.owner_user_id, userId, { kind: 'call-declined', message: reason, extra: { room_id: roomId, reason } });
      }
      return { success: true, reason };
    });

    server.post('/rooms/:room_id/join', async (request, reply) => {
      const auth = await resolveAuthUserFromRequest(request);
      const userId = auth?.id || auth?.user_id || null;
      if (!userId) {
        return replyJson(reply, 401, { success: false, error: 'Unauthorized' });
      }

      const roomId = request.params?.room_id;
      const meta = roomId ? await resolveRoomMeta(roomId) : null;
      if (!meta) {
        return replyJson(reply, 404, { success: false, error: 'Room not found' });
      }

      if (!await canJoinRoom(userId, roomId)) {
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
