import mediasoup from 'mediasoup';
import { v4 as uuidv4 } from 'uuid';
import db from '../database/adole.js';
import { findUserByPhone, findUserById } from './auth_users.js';
import { assertDeviceSessionClaims } from './auth_session_validation.js';
import { AUTH_LINK_ORIGIN } from '../atome/src/shared/auth_link_contract.js';
import { wsSendJson } from './wsSend.js';

import { DEFAULT_RTC_MIN_PORT, DEFAULT_RTC_MAX_PORT, DEFAULT_LISTEN_IP, DEFAULT_MEDIA_CODECS, nowIso, normalizePhone, makeRequestId, safeParseJson, normalizeVisibility, ensureSet } from './visio_helpers.js';
import { createWsHandler } from './visio_ws_handler.js';
import { createVisioRoutes } from './visio_routes.js';

export function createVisioService(options = {}) {
  const {
    databaseEnabled = false,
    jwtSecret = process.env.JWT_SECRET,
    logger = console,
    mediaCodecs = DEFAULT_MEDIA_CODECS,
    listenIp = process.env.MEDIASOUP_LISTEN_IP || DEFAULT_LISTEN_IP,
    announcedIp = process.env.MEDIASOUP_ANNOUNCED_IP || null,
    rtcMinPort = Number(process.env.MEDIASOUP_RTC_MIN_PORT) || DEFAULT_RTC_MIN_PORT,
    rtcMaxPort = Number(process.env.MEDIASOUP_RTC_MAX_PORT) || DEFAULT_RTC_MAX_PORT,
    // Premier contact et blocage (server/communication_relations.js) : la visio n'a plus de
    // carnet de contacts a elle ; un appel est une communication pair-a-pair comme une autre.
    relations = null
  } = options;

  let worker = null;
  let workerPromise = null;

  const rooms = new Map();
  const roomMeta = new Map();
  const connectionRequests = new Map();
  const connections = new Map();

  async function ensureWorker() {
    if (worker) return worker;
    if (!workerPromise) {
      workerPromise = mediasoup.createWorker({
        rtcMinPort,
        rtcMaxPort
      });
    }
    worker = await workerPromise;
    workerPromise = null;

    worker.on('died', () => {
      logger.error('[visio] mediasoup worker died');
      process.exit(1);
    });
    return worker;
  }

  async function ensureRoom(roomId, ownerId = null) {
    if (!roomId) throw new Error('Missing room id');
    let room = rooms.get(roomId);
    if (room) return room;

    const msWorker = await ensureWorker();
    const router = await msWorker.createRouter({ mediaCodecs });
    room = {
      id: roomId,
      router,
      peers: new Map()
    };
    rooms.set(roomId, room);

    if (!roomMeta.has(roomId)) {
      roomMeta.set(roomId, {
        room_id: roomId,
        owner_user_id: ownerId || null,
        name: `Room ${roomId.slice(0, 6)}`,
        visibility: 'private',
        created_at: nowIso(),
        invites: new Set()
      });
    }

    return room;
  }

  function closeRoom(roomId) {
    const room = rooms.get(roomId);
    if (!room) return;
    try {
      room.router.close();
    } catch (error) {
        console.warn("[cleanup] operation failed", error); }
    rooms.delete(roomId);
  }

  function findPeer(roomId, peerId) {
    const room = rooms.get(roomId);
    if (!room) return null;
    return room.peers.get(peerId) || null;
  }

  function notifyRoom(roomId, payload, excludePeerId = null) {
    const room = rooms.get(roomId);
    if (!room) return;
    for (const peer of room.peers.values()) {
      if (excludePeerId && peer.id === excludePeerId) continue;
      wsSendJson(peer.connection, payload, { scope: 'ws/visio', op: payload?.type || 'event' });
    }
  }

  function closePeer(roomId, peerId) {
    const room = rooms.get(roomId);
    if (!room) return;
    const peer = room.peers.get(peerId);
    if (!peer) return;

    for (const consumer of peer.consumers.values()) {
      try { consumer.close(); } catch (error) {
        console.warn("[cleanup] operation failed", error); }
    }
    for (const producer of peer.producers.values()) {
      try { producer.close(); } catch (error) {
        console.warn("[cleanup] operation failed", error); }
    }
    for (const transport of peer.transports.values()) {
      try { transport.close(); } catch (error) {
        console.warn("[cleanup] operation failed", error); }
    }

    room.peers.delete(peerId);
    notifyRoom(roomId, {
      type: 'participantLeft',
      peer_id: peerId,
      user_id: peer.userId || null
    }, peerId);

    if (room.peers.size === 0) {
      closeRoom(roomId);
    }
  }

  // Seule une session d'appareil valide (emise par le flux phone-link, non revoquee) ouvre
  // la visio — meme contrat que /ws/api et /ws/sync.
  async function verifyJwtToken(_server, token) {
    if (!token) return null;
    const configuredJwtSecret = String(jwtSecret || '').trim();
    if (configuredJwtSecret.length < 32) {
      throw new Error('JWT_SECRET must be configured with at least 32 characters');
    }
    const jwt = await import('jsonwebtoken');
    const claims = jwt.default.verify(token, configuredJwtSecret, {
      algorithms: ['HS256'], issuer: AUTH_LINK_ORIGIN, audience: 'atome-ws'
    });
    await assertDeviceSessionClaims(claims);
    return claims;
  }

  // Les routes lisent `id` : une session d'appareil porte l'identite dans `sub`.
  const principalOf = (claims) => (claims?.sub ? { ...claims, id: String(claims.sub), user_id: String(claims.sub) } : null);

  async function resolveAuthUserFromRequest(request) {
    const authHeader = request.headers?.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        return principalOf(await verifyJwtToken(request.server, authHeader.slice(7)));
      } catch (error) {
        console.warn("[cleanup] operation failed", error); }
    }
    if (request.cookies?.access_token) {
      try {
        return principalOf(await verifyJwtToken(request.server, request.cookies.access_token));
      } catch (error) {
        console.warn("[cleanup] operation failed", error); }
    }

    // Aucun en-tete d'identite (`x-user-id`, `x-phone`…) n'est cru : n'importe qui peut
    // les ecrire.
    return null;
  }

  async function resolveUserInfo(userId, phone) {
    if (!databaseEnabled) {
      return {
        id: userId || null,
        phone: phone || null,
        username: null
      };
    }

    const dataSource = db.getDataSourceAdapter();
    if (userId) {
      const user = await findUserById(dataSource, userId);
      if (user) {
        return {
          id: user.user_id,
          phone: user.phone,
          username: user.username
        };
      }
    }

    if (phone) {
      const user = await findUserByPhone(dataSource, phone);
      if (user) {
        return {
          id: user.user_id,
          phone: user.phone,
          username: user.username
        };
      }
      return null;
    }

    return {
      id: userId || null,
      phone: null,
      username: null
    };
  }

  // `userId` peut joindre `otherUserId` : contact accepte et aucun blocage (D3/D4).
  async function isConnected(userId, otherUserId) {
    if (!userId || !otherUserId) return false;
    if (relations) return (await relations.canCommunicate(userId, otherUserId)).ok === true;
    const set = connections.get(userId);
    return set ? set.has(otherUserId) : false;
  }

  // Droit d'entrer dans une room : proprietaire, invite, room publique, ou room « contacts »
  // du proprietaire — jamais si l'un a bloque l'autre.
  async function canJoinRoom(userId, roomId) {
    const meta = roomMeta.get(roomId);
    if (!userId || !meta) return false;
    if (meta.owner_user_id === userId) return true;
    if (relations && meta.owner_user_id && await relations.blockedEitherWay(meta.owner_user_id, userId)) return false;
    if (meta.invites?.has(userId) || meta.visibility === 'public') return true;
    return meta.visibility === 'connections' && await isConnected(meta.owner_user_id, userId);
  }

  function addConnection(userId, otherUserId) {
    if (!userId || !otherUserId) return;
    ensureSet(connections, userId).add(otherUserId);
    ensureSet(connections, otherUserId).add(userId);
  }

  function getRoomMeta(roomId) {
    return roomMeta.get(roomId) || null;
  }

  function ensureRoomMeta(roomId, ownerId, name, visibility) {
    if (!roomMeta.has(roomId)) {
      roomMeta.set(roomId, {
        room_id: roomId,
        owner_user_id: ownerId || null,
        name: name || `Room ${roomId.slice(0, 6)}`,
        visibility: normalizeVisibility(visibility),
        created_at: nowIso(),
        invites: new Set()
      });
    }
    return roomMeta.get(roomId);
  }

  const handleWsMessage = createWsHandler({ rooms, listenIp, announcedIp, ensureRoom, notifyRoom, closePeer, verifyJwtToken, resolveUserInfo, ensureRoomMeta, canJoinRoom });

  function registerWebsocket(server, options = {}) {
    const wsPath = options.path || '/ws/visio';
    server.register(async function (fastify) {
      fastify.get(wsPath, { websocket: true }, (connection) => {
        connection.on('message', async (message) => {
          const data = safeParseJson(message.toString());
          if (!data) {
            wsSendJson(connection, { type: 'error', error: 'Invalid JSON' }, { scope: 'ws/visio', op: 'parse' });
            return;
          }
          try {
            await handleWsMessage(connection, data);
          } catch (error) {
            wsSendJson(connection, {
              type: 'error',
              error: error?.message || String(error),
              requestId: data?.requestId || null
            }, { scope: 'ws/visio', op: 'handler' });
          }
        });

        connection.on('close', () => {
          if (connection._visioRoomId && connection._visioPeerId) {
            closePeer(connection._visioRoomId, connection._visioPeerId);
          }
        });
      });
    });
  }

  const registerRoutes = createVisioRoutes({ rooms, connectionRequests, connections, databaseEnabled, ensureRoom, resolveAuthUserFromRequest, resolveUserInfo, isConnected, addConnection, getRoomMeta, ensureRoomMeta, canJoinRoom, relations });

  return {
    registerWebsocket,
    registerRoutes,
    ensureRoom
  };
}
