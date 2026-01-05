import mediasoup from 'mediasoup';
import { v4 as uuidv4 } from 'uuid';
import db from '../database/adole.js';
import { findUserByPhone, findUserById, generateDeterministicUserId } from './auth.js';
import { wsSendJson } from './wsSend.js';

const DEFAULT_RTC_MIN_PORT = 40000;
const DEFAULT_RTC_MAX_PORT = 49999;
const DEFAULT_LISTEN_IP = '127.0.0.1';

const DEFAULT_MEDIA_CODECS = [
  {
    kind: 'audio',
    mimeType: 'audio/opus',
    clockRate: 48000,
    channels: 2
  },
  {
    kind: 'video',
    mimeType: 'video/VP8',
    clockRate: 90000,
    parameters: {
      'x-google-start-bitrate': 1000
    }
  }
];

function nowIso() {
  try {
    return new Date().toISOString();
  } catch (_) {
    return String(Date.now());
  }
}

function normalizePhone(raw) {
  if (!raw) return null;
  const cleaned = String(raw).trim().replace(/\s+/g, '');
  return cleaned || null;
}

function makeRequestId() {
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function safeParseJson(raw) {
  try {
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
}

function normalizeVisibility(raw) {
  if (raw === 'public' || raw === 'connections') return raw;
  return 'private';
}

function ensureSet(map, key) {
  if (!map.has(key)) {
    map.set(key, new Set());
  }
  return map.get(key);
}

export function createVisioService(options = {}) {
  const {
    databaseEnabled = false,
    jwtSecret = process.env.JWT_SECRET || 'squirrel_jwt_secret_change_in_production',
    logger = console,
    mediaCodecs = DEFAULT_MEDIA_CODECS,
    listenIp = process.env.MEDIASOUP_LISTEN_IP || DEFAULT_LISTEN_IP,
    announcedIp = process.env.MEDIASOUP_ANNOUNCED_IP || null,
    rtcMinPort = Number(process.env.MEDIASOUP_RTC_MIN_PORT) || DEFAULT_RTC_MIN_PORT,
    rtcMaxPort = Number(process.env.MEDIASOUP_RTC_MAX_PORT) || DEFAULT_RTC_MAX_PORT
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
    } catch (_) { }
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
      try { consumer.close(); } catch (_) { }
    }
    for (const producer of peer.producers.values()) {
      try { producer.close(); } catch (_) { }
    }
    for (const transport of peer.transports.values()) {
      try { transport.close(); } catch (_) { }
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

  async function verifyJwtToken(server, token) {
    if (!token) return null;
    if (server?.jwt && typeof server.jwt.verify === 'function') {
      return server.jwt.verify(token);
    }
    const jwt = await import('jsonwebtoken');
    return jwt.default.verify(token, jwtSecret);
  }

  async function resolveAuthUserFromRequest(request) {
    const authHeader = request.headers?.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        return await verifyJwtToken(request.server, authHeader.slice(7));
      } catch (_) { }
    }
    if (request.cookies?.access_token) {
      try {
        return await verifyJwtToken(request.server, request.cookies.access_token);
      } catch (_) { }
    }

    const headerUserId = request.headers?.['x-user-id'] || request.headers?.['x-userid'] || null;
    const headerPhone = request.headers?.['x-phone'] || request.headers?.['x-user-phone'] || null;
    const headerUsername = request.headers?.['x-username'] || request.headers?.['x-user-name'] || null;
    if (headerUserId || headerPhone || headerUsername) {
      return {
        id: headerUserId || null,
        user_id: headerUserId || null,
        phone: headerPhone || null,
        username: headerUsername || null
      };
    }

    const bodyPhone = normalizePhone(request.body?.phone_e164 || request.body?.phone);
    if (bodyPhone) {
      return {
        id: generateDeterministicUserId(bodyPhone),
        user_id: generateDeterministicUserId(bodyPhone),
        phone: bodyPhone,
        username: null
      };
    }

    return null;
  }

  async function resolveUserInfo(userId, phone) {
    if (!databaseEnabled) {
      return {
        id: userId || (phone ? generateDeterministicUserId(phone) : null),
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
      return {
        id: generateDeterministicUserId(phone),
        phone,
        username: null
      };
    }

    return {
      id: userId || null,
      phone: null,
      username: null
    };
  }

  function isConnected(userId, otherUserId) {
    if (!userId || !otherUserId) return false;
    const set = connections.get(userId);
    return set ? set.has(otherUserId) : false;
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

  async function handleWsMessage(connection, data) {
    const requestId = data?.requestId || data?.request_id || null;
    const safeSend = (payload) => {
      wsSendJson(connection, payload, { scope: 'ws/visio', op: payload?.type || 'reply' });
    };

    if (!data || typeof data !== 'object') {
      safeSend({ type: 'error', error: 'Invalid payload', requestId });
      return;
    }

    if (data.type === 'ping') {
      safeSend({ type: 'pong', requestId });
      return;
    }

    if (data.type === 'auth') {
      const token = data.token || data.access_token || null;
      const phone = normalizePhone(data.phone_e164 || data.phone || null);
      let decoded = null;
      if (token) {
        try {
          decoded = await verifyJwtToken(connection?.server, token);
        } catch (err) {
          safeSend({
            type: 'authError',
            error: 'Invalid token',
            requestId
          });
          return;
        }
      }

      const userId = decoded?.userId || decoded?.id || decoded?.user_id || decoded?.sub || null;
      const userPhone = normalizePhone(decoded?.phone || phone);
      const userInfo = await resolveUserInfo(userId, userPhone);

      if (!userInfo?.id) {
        safeSend({
          type: 'authError',
          error: 'Missing user identity (token or phone required)',
          requestId
        });
        return;
      }

      connection._visioUserId = userInfo.id;
      connection._visioUserPhone = userInfo.phone || userPhone || null;
      connection._visioUsername = userInfo.username || decoded?.username || null;

      safeSend({
        type: 'authOk',
        requestId,
        user_id: connection._visioUserId,
        phone: connection._visioUserPhone || null,
        username: connection._visioUsername || null
      });
      return;
    }

    const roomId = connection._visioRoomId || data.room_id || data.roomId || null;
    const peerId = connection._visioPeerId || null;

    if (data.type === 'joinRoom') {
      const requestedRoomId = data.room_id || data.roomId;
      if (!requestedRoomId) {
        safeSend({ type: 'error', error: 'Missing room_id', requestId });
        return;
      }

      const room = await ensureRoom(requestedRoomId, connection._visioUserId || null);
      ensureRoomMeta(requestedRoomId, connection._visioUserId || null, null, null);

      let peer = room.peers.get(peerId || '');
      if (!peer) {
        const newPeerId = peerId || connection._visioUserId || uuidv4();
        peer = {
          id: newPeerId,
          userId: connection._visioUserId || null,
          connection,
          transports: new Map(),
          producers: new Map(),
          consumers: new Map(),
          rtpCapabilities: null
        };
        room.peers.set(newPeerId, peer);
        connection._visioPeerId = newPeerId;
        connection._visioRoomId = requestedRoomId;
      }

      const existingProducers = [];
      for (const otherPeer of room.peers.values()) {
        if (otherPeer.id === peer.id) continue;
        for (const producer of otherPeer.producers.values()) {
          existingProducers.push({
            producer_id: producer.id,
            kind: producer.kind,
            peer_user_id: otherPeer.userId || null
          });
        }
      }

      safeSend({
        type: 'roomJoined',
        requestId,
        room_id: requestedRoomId,
        rtpCapabilities: room.router.rtpCapabilities,
        existingProducers
      });
      return;
    }

    if (data.type === 'leaveRoom') {
      if (roomId && peerId) {
        closePeer(roomId, peerId);
      }
      connection._visioRoomId = null;
      connection._visioPeerId = null;
      safeSend({ type: 'leftRoom', requestId });
      return;
    }

    if (!roomId || !peerId) {
      safeSend({ type: 'error', error: 'Join a room first', requestId });
      return;
    }

    const room = rooms.get(roomId);
    const peer = room ? room.peers.get(peerId) : null;
    if (!room || !peer) {
      safeSend({ type: 'error', error: 'Room not found', requestId });
      return;
    }

    if (data.type === 'createTransport') {
      const direction = data.direction === 'recv' ? 'recv' : 'send';
      const transport = await room.router.createWebRtcTransport({
        listenIps: [
          {
            ip: listenIp,
            announcedIp: announcedIp || undefined
          }
        ],
        enableUdp: true,
        enableTcp: true,
        preferUdp: true
      });

      peer.transports.set(transport.id, transport);
      transport.on('dtlsstatechange', (state) => {
        if (state === 'closed') {
          try { transport.close(); } catch (_) { }
        }
      });
      transport.on('close', () => {
        peer.transports.delete(transport.id);
      });

      safeSend({
        type: 'transportCreated',
        requestId,
        direction,
        transportOptions: {
          id: transport.id,
          iceParameters: transport.iceParameters,
          iceCandidates: transport.iceCandidates,
          dtlsParameters: transport.dtlsParameters
        }
      });
      return;
    }

    if (data.type === 'connectTransport') {
      const transportId = data.transport_id || data.transportId;
      const dtlsParameters = data.dtlsParameters;
      const transport = transportId ? peer.transports.get(transportId) : null;
      if (!transport) {
        safeSend({ type: 'error', error: 'Transport not found', requestId });
        return;
      }
      await transport.connect({ dtlsParameters });
      safeSend({ type: 'transportConnected', requestId, transport_id: transport.id });
      return;
    }

    if (data.type === 'produce') {
      const transportId = data.transport_id || data.transportId;
      const transport = transportId ? peer.transports.get(transportId) : null;
      if (!transport) {
        safeSend({ type: 'error', error: 'Transport not found', requestId });
        return;
      }
      const producer = await transport.produce({
        kind: data.kind,
        rtpParameters: data.rtpParameters,
        appData: data.appData || {}
      });
      peer.producers.set(producer.id, producer);

      producer.on('transportclose', () => {
        peer.producers.delete(producer.id);
        notifyRoom(roomId, {
          type: 'producerClosed',
          producer_id: producer.id,
          peer_user_id: peer.userId || null
        }, peer.id);
      });

      safeSend({ type: 'produced', requestId, producer_id: producer.id });
      notifyRoom(roomId, {
        type: 'newProducer',
        producer_id: producer.id,
        kind: producer.kind,
        peer_user_id: peer.userId || null
      }, peer.id);
      return;
    }

    if (data.type === 'consume') {
      const transportId = data.transport_id || data.transportId;
      const producerId = data.producer_id || data.producerId;
      const rtpCapabilities = data.rtpCapabilities;

      const transport = transportId ? peer.transports.get(transportId) : null;
      if (!transport) {
        safeSend({ type: 'error', error: 'Transport not found', requestId });
        return;
      }
      if (!producerId) {
        safeSend({ type: 'error', error: 'Missing producer_id', requestId });
        return;
      }
      if (!rtpCapabilities) {
        safeSend({ type: 'error', error: 'Missing rtpCapabilities', requestId });
        return;
      }
      if (!room.router.canConsume({ producerId, rtpCapabilities })) {
        safeSend({ type: 'error', error: 'Cannot consume', requestId });
        return;
      }

      const consumer = await transport.consume({
        producerId,
        rtpCapabilities,
        paused: true
      });

      peer.consumers.set(consumer.id, consumer);
      consumer.on('transportclose', () => {
        peer.consumers.delete(consumer.id);
      });
      consumer.on('producerclose', () => {
        peer.consumers.delete(consumer.id);
        safeSend({
          type: 'producerClosed',
          producer_id: producerId,
          requestId
        });
      });

      safeSend({
        type: 'consumerCreated',
        requestId,
        consumerOptions: {
          id: consumer.id,
          producerId,
          kind: consumer.kind,
          rtpParameters: consumer.rtpParameters,
          type: consumer.type,
          appData: consumer.appData || {}
        }
      });
      return;
    }

    if (data.type === 'resumeConsumer') {
      const consumerId = data.consumer_id || data.consumerId;
      const consumer = consumerId ? peer.consumers.get(consumerId) : null;
      if (!consumer) {
        safeSend({ type: 'error', error: 'Consumer not found', requestId });
        return;
      }
      await consumer.resume();
      safeSend({ type: 'consumerResumed', requestId, consumer_id: consumer.id });
      return;
    }

    safeSend({ type: 'error', error: `Unknown message type: ${data.type}`, requestId });
  }

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
        } catch (_) {
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

  return {
    registerWebsocket,
    registerRoutes,
    ensureRoom
  };
}
