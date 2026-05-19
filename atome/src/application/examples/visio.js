// Minimal mediasoup client logic for Atome MVP (browser/Tauri)
// Exposes window.visio for the UI test harness.

(function () {
  if (typeof window === 'undefined') return;

  const REQUEST_TIMEOUT_MS = 12000;
  const DEFAULT_ROOM_VISIBILITY = 'private';

  const state = {
    ws: null,
    wsUrl: null,
    httpBase: null,
    userId: null,
    roomId: null,
    device: null,
    sendTransport: null,
    recvTransport: null,
    localStream: null,
    producers: new Map(),
    consumers: new Map(),
    pending: new Map(),
    isJoining: false,
    pendingProducers: new Set()
  };

  function emit(eventName, detail) {
    try {
      window.dispatchEvent(new CustomEvent(`visio:${eventName}`, { detail }));
    } catch (_) { }
  }

  function nowIso() {
    try { return new Date().toISOString(); } catch (_) { return String(Date.now()); }
  }

  function makeRequestId() {
    return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }

  function getFastifyHttpBase() {
    try {
      const explicit = typeof window.__SQUIRREL_FASTIFY_URL__ === 'string'
        ? window.__SQUIRREL_FASTIFY_URL__.trim()
        : '';
      if (explicit) return explicit.replace(/\/$/, '');
    } catch (_) { }

    try {
      if (typeof location !== 'undefined' && location.origin) {
        return String(location.origin).replace(/\/$/, '');
      }
    } catch (_) { }

    return 'http://127.0.0.1:3001';
  }

  function getFastifyWsUrl() {
    try {
      const explicit = typeof window.__SQUIRREL_FASTIFY_WS_VISIO_URL__ === 'string'
        ? window.__SQUIRREL_FASTIFY_WS_VISIO_URL__.trim()
        : '';
      if (explicit) return explicit;
    } catch (_) { }

    const base = getFastifyHttpBase();
    return base.replace(/^https:/, 'wss:').replace(/^http:/, 'ws:') + '/ws/visio';
  }

  function getAuthToken() {
    try {
      return (
        localStorage.getItem('cloud_auth_token') ||
        localStorage.getItem('auth_token') ||
        localStorage.getItem('local_auth_token') ||
        ''
      );
    } catch (_) {
      return '';
    }
  }

  function buildAuthHeaders(options = {}) {
    const headers = { 'content-type': 'application/json' };
    const token = options.token || getAuthToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    if (!token && options.phone) headers['x-phone'] = options.phone;
    if (options.userId) headers['x-user-id'] = options.userId;
    return headers;
  }

  let mediasoupClientPromise = null;
  async function loadMediasoupClient() {
    if (window.mediasoupClient && window.mediasoupClient.Device) {
      return window.mediasoupClient;
    }
    if (!mediasoupClientPromise) {
      mediasoupClientPromise = import('mediasoup-client').then((mod) => mod.default || mod);
    }
    return mediasoupClientPromise;
  }

  function ensureSocketOpen() {
    if (!state.ws || state.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket not connected');
    }
  }

  function clearPending(reason) {
    for (const [requestId, pending] of state.pending.entries()) {
      clearTimeout(pending.timeout);
      pending.reject(new Error(reason || 'Request cancelled'));
      state.pending.delete(requestId);
    }
  }

  function resetMediaState() {
    if (state.localStream) {
      state.localStream.getTracks().forEach((track) => {
        try { track.stop(); } catch (_) { }
      });
    }
    state.localStream = null;

    for (const entry of state.consumers.values()) {
      try { entry.consumer.close(); } catch (_) { }
    }
    state.consumers.clear();

    for (const producer of state.producers.values()) {
      try { producer.close(); } catch (_) { }
    }
    state.producers.clear();

    if (state.sendTransport) {
      try { state.sendTransport.close(); } catch (_) { }
    }
    if (state.recvTransport) {
      try { state.recvTransport.close(); } catch (_) { }
    }
    state.sendTransport = null;
    state.recvTransport = null;
    state.device = null;
    state.roomId = null;
    state.pendingProducers.clear();
  }

  function handleWsClose() {
    clearPending('WebSocket closed');
    resetMediaState();
    emit('status', { status: 'closed', at: nowIso() });
  }

  function handleWsMessage(event) {
    const data = (() => {
      try {
        return JSON.parse(event.data);
      } catch (_) {
        return null;
      }
    })();
    if (!data) return;

    const requestId = data.requestId || data.request_id || null;
    if (requestId && state.pending.has(requestId)) {
      const pending = state.pending.get(requestId);
      clearTimeout(pending.timeout);
      state.pending.delete(requestId);
      if (data.type === 'error' || data.type === 'authError') {
        pending.reject(new Error(data.error || 'Request failed'));
      } else {
        pending.resolve(data);
      }
      return;
    }

    if (data.type === 'newProducer') {
      const producerId = data.producer_id || data.producerId;
      if (producerId) {
        if (!state.device || !state.recvTransport) {
          state.pendingProducers.add(producerId);
        } else {
          consumeProducer(producerId).catch(() => {});
        }
      }
      return;
    }

    if (data.type === 'producerClosed') {
      const producerId = data.producer_id || data.producerId;
      if (producerId) {
        removeConsumerByProducerId(producerId);
      }
      return;
    }

    if (data.type === 'participantLeft') {
      emit('participant-left', { peerId: data.peer_id || null, userId: data.user_id || null });
      return;
    }

    if (data.type === 'error') {
      emit('status', { status: 'error', message: data.error || 'Server error', at: nowIso() });
    }
  }

  function sendRequest(type, payload = {}) {
    ensureSocketOpen();
    const requestId = payload.requestId || makeRequestId();
    const message = { type, requestId, ...payload };
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        state.pending.delete(requestId);
        reject(new Error('Request timeout'));
      }, REQUEST_TIMEOUT_MS);
      state.pending.set(requestId, { resolve, reject, timeout });
      state.ws.send(JSON.stringify(message));
    });
  }

  async function openWebSocket(wsUrl) {
    if (state.ws && state.ws.readyState === WebSocket.OPEN) {
      return state.ws;
    }
    if (state.ws && state.ws.readyState === WebSocket.CONNECTING) {
      return new Promise((resolve, reject) => {
        const onOpen = () => {
          cleanup();
          resolve(state.ws);
        };
        const onError = () => {
          cleanup();
          reject(new Error('WebSocket error'));
        };
        const cleanup = () => {
          state.ws.removeEventListener('open', onOpen);
          state.ws.removeEventListener('error', onError);
        };
        state.ws.addEventListener('open', onOpen);
        state.ws.addEventListener('error', onError);
      });
    }

    state.wsUrl = wsUrl;
    state.ws = new WebSocket(wsUrl);

    state.ws.addEventListener('message', handleWsMessage);
    state.ws.addEventListener('close', handleWsClose);
    state.ws.addEventListener('error', () => {
      emit('status', { status: 'error', message: 'WebSocket error', at: nowIso() });
    });

    return new Promise((resolve, reject) => {
      state.ws.addEventListener('open', () => {
        emit('status', { status: 'connected', at: nowIso() });
        resolve(state.ws);
      }, { once: true });
      state.ws.addEventListener('error', () => {
        reject(new Error('WebSocket error'));
      }, { once: true });
    });
  }

  async function connect(options = {}) {
    const wsUrl = options.wsUrl || getFastifyWsUrl();
    state.httpBase = options.httpBase || getFastifyHttpBase();
    await openWebSocket(wsUrl);

    const token = options.token || getAuthToken();
    const phone = options.phone || options.phone_e164 || null;
    const response = await sendRequest('auth', {
      token: token || undefined,
      phone_e164: phone || undefined
    });

    state.userId = response.user_id || response.userId || null;
    emit('status', { status: 'auth', userId: state.userId, at: nowIso() });
    return response;
  }

  async function createDevice(routerRtpCapabilities) {
    const client = await loadMediasoupClient();
    const DeviceCtor = client.Device || client.default?.Device || client.default || client;
    if (!DeviceCtor) {
      throw new Error('mediasoup-client Device not available');
    }
    const device = new DeviceCtor();
    await device.load({ routerRtpCapabilities });
    state.device = device;
    return device;
  }

  async function createTransport(direction) {
    const response = await sendRequest('createTransport', { direction });
    const transportOptions = response.transportOptions;
    if (!transportOptions) {
      throw new Error('Missing transport options');
    }
    const device = state.device;
    if (!device) throw new Error('Device not initialized');

    const transport = direction === 'recv'
      ? device.createRecvTransport(transportOptions)
      : device.createSendTransport(transportOptions);

    transport.on('connect', ({ dtlsParameters }, callback, errback) => {
      sendRequest('connectTransport', {
        transport_id: transport.id,
        dtlsParameters
      }).then(() => callback()).catch(errback);
    });

    if (direction === 'send') {
      transport.on('produce', ({ kind, rtpParameters, appData }, callback, errback) => {
        sendRequest('produce', {
          transport_id: transport.id,
          kind,
          rtpParameters,
          appData: appData || {}
        }).then((data) => {
          callback({ id: data.producer_id });
        }).catch(errback);
      });
    }

    transport.on('connectionstatechange', (connectionState) => {
      if (connectionState === 'failed' || connectionState === 'closed') {
        try { transport.close(); } catch (_) { }
      }
    });

    return transport;
  }

  async function startLocalMedia(options = {}) {
    if (state.localStream) return state.localStream;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('getUserMedia not available');
    }
    const audio = options.audio !== false;
    const video = options.video !== false;
    const constraints = { audio, video };
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    state.localStream = stream;
    emit('local-stream', { stream });

    if (state.sendTransport) {
      if (audio && state.device?.canProduce('audio')) {
        const track = stream.getAudioTracks()[0];
        if (track) {
          const producer = await state.sendTransport.produce({ track });
          state.producers.set(producer.id, producer);
        }
      }
      if (video && state.device?.canProduce('video')) {
        const track = stream.getVideoTracks()[0];
        if (track) {
          const producer = await state.sendTransport.produce({ track });
          state.producers.set(producer.id, producer);
        }
      }
    }
    return stream;
  }

  async function consumeProducer(producerId) {
    if (!state.recvTransport || !state.device) return null;
    for (const entry of state.consumers.values()) {
      if (entry.producerId === producerId) return entry;
    }

    const response = await sendRequest('consume', {
      transport_id: state.recvTransport.id,
      producer_id: producerId,
      rtpCapabilities: state.device.rtpCapabilities
    });
    const consumerOptions = response.consumerOptions;
    if (!consumerOptions) return null;

    const consumer = await state.recvTransport.consume(consumerOptions);
    const stream = new MediaStream([consumer.track]);
    const entry = {
      consumer,
      producerId,
      kind: consumer.kind,
      stream
    };
    state.consumers.set(consumer.id, entry);
    emit('remote-stream', { producerId, stream, kind: consumer.kind });

    await sendRequest('resumeConsumer', { consumer_id: consumer.id });
    return entry;
  }

  function removeConsumerByProducerId(producerId) {
    for (const [consumerId, entry] of state.consumers.entries()) {
      if (entry.producerId === producerId) {
        try { entry.consumer.close(); } catch (_) { }
        state.consumers.delete(consumerId);
        emit('remote-closed', { producerId });
      }
    }
  }

  async function joinRoom(roomId, options = {}) {
    if (!roomId) throw new Error('Missing room id');
    if (state.isJoining) return null;
    state.isJoining = true;

    try {
      await connect(options);
      const response = await sendRequest('joinRoom', { room_id: roomId });
      state.roomId = roomId;

      await createDevice(response.rtpCapabilities);
      state.sendTransport = await createTransport('send');
      state.recvTransport = await createTransport('recv');

      await startLocalMedia(options.media || {});

      const existing = Array.isArray(response.existingProducers) ? response.existingProducers : [];
      for (const producer of existing) {
        if (producer?.producer_id) {
          await consumeProducer(producer.producer_id);
        }
      }
      if (state.pendingProducers.size > 0) {
        const queued = Array.from(state.pendingProducers);
        state.pendingProducers.clear();
        for (const producerId of queued) {
          await consumeProducer(producerId);
        }
      }

      emit('status', { status: 'joined', roomId, at: nowIso() });
      return response;
    } finally {
      state.isJoining = false;
    }
  }

  async function leaveRoom() {
    try {
      if (state.ws && state.ws.readyState === WebSocket.OPEN && state.roomId) {
        await sendRequest('leaveRoom', { room_id: state.roomId });
      }
    } catch (_) { }

    resetMediaState();

    if (state.ws) {
      try { state.ws.close(); } catch (_) { }
    }
    state.ws = null;
    state.userId = null;
    emit('status', { status: 'left', at: nowIso() });
  }

  async function createRoom(options = {}) {
    const base = options.httpBase || state.httpBase || getFastifyHttpBase();
    const response = await fetch(`${base}/rooms`, {
      method: 'POST',
      headers: buildAuthHeaders(options),
      body: JSON.stringify({
        name: options.name || `Room ${Date.now()}`,
        visibility: options.visibility || DEFAULT_ROOM_VISIBILITY
      })
    });
    return response.json();
  }

  async function inviteToRoom(roomId, phone, options = {}) {
    if (!roomId) throw new Error('Missing room id');
    const base = options.httpBase || state.httpBase || getFastifyHttpBase();
    const response = await fetch(`${base}/rooms/${roomId}/invite`, {
      method: 'POST',
      headers: buildAuthHeaders(options),
      body: JSON.stringify({ to_phone_e164: phone })
    });
    return response.json();
  }

  async function requestContact(phone, options = {}) {
    const base = options.httpBase || state.httpBase || getFastifyHttpBase();
    const response = await fetch(`${base}/contacts/request`, {
      method: 'POST',
      headers: buildAuthHeaders(options),
      body: JSON.stringify({ to_phone_e164: phone })
    });
    return response.json();
  }

  async function respondContact(requestId, decision, options = {}) {
    const base = options.httpBase || state.httpBase || getFastifyHttpBase();
    const response = await fetch(`${base}/contacts/respond`, {
      method: 'POST',
      headers: buildAuthHeaders(options),
      body: JSON.stringify({ request_id: requestId, decision })
    });
    return response.json();
  }

  async function listContacts(options = {}) {
    const base = options.httpBase || state.httpBase || getFastifyHttpBase();
    const response = await fetch(`${base}/contacts`, {
      method: 'GET',
      headers: buildAuthHeaders(options)
    });
    return response.json();
  }

  function setMicEnabled(enabled) {
    if (!state.localStream) return false;
    const tracks = state.localStream.getAudioTracks();
    tracks.forEach((track) => { track.enabled = !!enabled; });
    emit('local-media', { kind: 'audio', enabled: !!enabled });
    return !!enabled;
  }

  function setCameraEnabled(enabled) {
    if (!state.localStream) return false;
    const tracks = state.localStream.getVideoTracks();
    tracks.forEach((track) => { track.enabled = !!enabled; });
    emit('local-media', { kind: 'video', enabled: !!enabled });
    return !!enabled;
  }

  function getState() {
    return {
      userId: state.userId,
      roomId: state.roomId,
      wsUrl: state.wsUrl,
      connected: !!state.ws && state.ws.readyState === WebSocket.OPEN,
      localStream: !!state.localStream
    };
  }

  window.visio = {
    connect,
    joinRoom,
    leaveRoom,
    createRoom,
    inviteToRoom,
    requestContact,
    respondContact,
    listContacts,
    setMicEnabled,
    setCameraEnabled,
    getState
  };
})();
