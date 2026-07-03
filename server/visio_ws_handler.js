/**
 * visio WebSocket message dispatcher — ADOLE v3.0
 * Split from visio.js; deps injected by createVisioService via the ctx object.
 */

import { v4 as uuidv4 } from 'uuid';
import { wsSendJson } from './wsSend.js';
import { normalizePhone } from './visio_helpers.js';

export function createWsHandler({ rooms, listenIp, announcedIp, ensureRoom, notifyRoom, closePeer, verifyJwtToken, resolveUserInfo, ensureRoomMeta }) {
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
          try { transport.close(); } catch (error) {
        console.warn("[cleanup] operation failed", error); }
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
  return handleWsMessage;
}
