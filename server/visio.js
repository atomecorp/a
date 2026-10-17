import mediasoup from 'mediasoup';
import { v4 as uuidv4 } from 'uuid';
import db from '../database/adole.js';
import { findUserByPhone, findUserById } from './auth_users.js';
import { assertDeviceSessionClaims } from './auth_session_validation.js';
import { AUTH_LINK_ORIGIN } from '../atome/src/shared/auth_link_contract.js';
import { wsSendJson } from './wsSend.js';

import { DEFAULT_RTC_MIN_PORT, DEFAULT_RTC_MAX_PORT, DEFAULT_LISTEN_IP, DEFAULT_MEDIA_CODECS, nowIso, normalizePhone, makeRequestId, safeParseJson, normalizeVisibility, ensureSet } from './visio_helpers.js';
import { createWsHandler } from './visio_ws_handler.js';
import { createVisioCommands } from './visio_commands.js';
import { wsSendJsonToUser, wsApiClientsByUserId } from './wsApiState.js';
import { communicationPush } from './communication_push.js';

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
    relations = null,
    // Livraison d'une notification a un utilisateur (sonnerie, refus) : communication_delivery.
    notify = async () => {}
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
    // Loopback candidates reach no remote device: calls ring and connect, then carry no
    // media at all (atome.one, 15 Oct. 2026). A public server sets both variables.
    if (!announcedIp && /^127\.|^localhost$|^::1$/.test(String(listenIp))) {
      logger.warn('[visio] mediasoup listens on loopback only: remote clients cannot exchange media'
        + ' (set MEDIASOUP_LISTEN_IP=0.0.0.0 and MEDIASOUP_ANNOUNCED_IP=<public IP>)');
    }

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
      wsSendJson(peer.connection, { type: 'visio-event', room_id: roomId, data: payload }, { scope: 'ws/api', op: 'visio' });
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
    void commands.peerLeft(roomId, peer.userId);
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

    return null;
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
  // Salle planifiee : relue de la table au premier besoin (redemarrage du serveur).
  async function resolveRoomMeta(roomId) {
    if (!roomId) return null;
    if (roomMeta.has(roomId)) return roomMeta.get(roomId);
    if (!databaseEnabled) return null;
    const row = await db.query('get', 'SELECT * FROM visio_rooms WHERE room_id = ?', [String(roomId)]).catch(() => null);
    if (!row) return null;
    roomMeta.set(roomId, {
      room_id: row.room_id, owner_user_id: row.owner_id, name: row.title || 'Visio', visibility: 'private',
      created_at: row.created_at, starts_at: row.starts_at, ends_at: row.ends_at, scheduled: true,
      invites: new Set(Array.isArray(safeParseJson(row.invitees_json)) ? safeParseJson(row.invitees_json) : [])
    });
    return roomMeta.get(roomId);
  }

  async function saveScheduledRoom(meta) {
    if (!databaseEnabled) return;
    await db.query('run', `INSERT INTO visio_rooms (room_id, owner_id, title, starts_at, ends_at, invitees_json)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(room_id) DO UPDATE SET title = excluded.title, starts_at = excluded.starts_at,
        ends_at = excluded.ends_at, invitees_json = excluded.invitees_json`,
    [meta.room_id, meta.owner_user_id, meta.name, meta.starts_at, meta.ends_at, JSON.stringify([...meta.invites])]);
  }

  async function canJoinRoom(userId, roomId, deviceKey) {
    const meta = await resolveRoomMeta(roomId);
    if (!userId || !meta) return false;
    if (meta.call_status && !['preparing', 'ringing', 'live'].includes(meta.call_status)) return false;
    if (meta.call_status === 'ringing' && meta.owner_user_id !== userId) return false;
    if (meta.accepted_devices?.has(userId) && meta.accepted_devices.get(userId) !== deviceKey) return false;
    if (meta.call_target === userId && !meta.accepted_devices?.has(userId)) return false;
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

  const commands = createVisioCommands({ ensureRoomMeta, resolveRoomMeta, resolveUserInfo, relations,
    notify, saveScheduledRoom, closeRoom,
    online: async userId => Boolean(wsApiClientsByUserId.get(userId)?.size) || await communicationPush.available(userId),
    publish: (userId, data) => {
      wsSendJsonToUser(userId, { type: 'visio-event', room_id: data.roomId, data }, { scope: 'ws/api', op: 'visio' });
      if (data.status !== 'ringing' && data.status !== 'preparing') {
        void communicationPush.deliver(userId, { ...data, kind: 'call-state', room_id: data.roomId,
          id: `call-state:${data.roomId}:${data.status}:${data.acceptedKeyId || ''}` })
          .then(result => { if (!result.ok) logger.warn('Android call state push unavailable'); })
          .catch(() => logger.warn('Android call state push unavailable'));
      }
    } });
  const signaling = new Set(['joinRoom', 'leaveRoom', 'createTransport', 'connectTransport', 'produce', 'consume',
    'pauseProducer', 'resumeProducer', 'closeProducer', 'resumeConsumer']);
  const handleCommand = async (userId, action, input, connection) => {
    if (!signaling.has(action)) return commands.execute(userId, action, { ...input, deviceKey: connection._wsApiDeviceClaims?.cnf?.kid }, connection._wsApiVaultRouter);
    connection._visioUserId = userId;
    let reply = null;
    await handleWsMessage(connection, { ...input, type: action }, payload => { reply = payload; });
    if (reply?.type === 'error') throw new Error(reply.error);
    // La reponse interne porte `requestId: null` et son propre `type` : etales
    // dans la reponse /ws/api, ils ecrasaient l'identifiant de la requete et le
    // client ne la reconnaissait jamais (joinRoom/leaveRoom en « Request timeout »).
    const { requestId: _requestId, request_id: _requestIdAlt, type: signal, ...result } = reply || {};
    return { ...result, signal };
  };
  const closeConnection = connection => {
    if (connection._visioRoomId && connection._visioPeerId) closePeer(connection._visioRoomId, connection._visioPeerId);
  };

  return {
    handleCommand, closeConnection, dispose: commands.dispose, ensureRoom
  };
}
