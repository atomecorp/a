// Minimal mediasoup UI for MVP testing (Atome/Squirrel)

(function () {
  if (typeof window === 'undefined') return;

  const PANEL_STORAGE_KEY = 'visio_mvp_panel_rect';

  function onReady(cb) {
    const run = () => {
      if (typeof document === 'undefined') return;
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', cb, { once: true });
      } else {
        cb();
      }
    };
    if (typeof window.$ === 'function' || (window.Squirrel && window.Squirrel.$)) {
      run();
    } else {
      window.addEventListener('squirrel:ready', run, { once: true });
    }
  }

  function resolveHost() {
    if (typeof document === 'undefined') return null;
    const view = document.getElementById('view');
    if (view) return view;
    const intuition = document.getElementById('intuition');
    if (intuition) return intuition;
    return document.body || document.documentElement;
  }

  function attachStream(el, stream, muted) {
    if (!el) return;
    try {
      el.srcObject = stream;
      el.muted = !!muted;
      const play = el.play();
      if (play && typeof play.catch === 'function') play.catch(() => {});
    } catch (_) { }
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function loadPanelRect() {
    try {
      const raw = localStorage.getItem(PANEL_STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed) return null;
      return {
        left: Number(parsed.left),
        top: Number(parsed.top)
      };
    } catch (_) {
      return null;
    }
  }

  function savePanelRect(rect) {
    try {
      localStorage.setItem(PANEL_STORAGE_KEY, JSON.stringify(rect));
    } catch (_) { }
  }

  function makePanelDraggable(panel, handle) {
    let dragging = false;
    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startTop = 0;

    const onMove = (ev) => {
      if (!dragging) return;
      const maxLeft = Math.max(0, window.innerWidth - panel.offsetWidth);
      const maxTop = Math.max(0, window.innerHeight - panel.offsetHeight);
      const nextLeft = clamp(startLeft + (ev.clientX - startX), 0, maxLeft);
      const nextTop = clamp(startTop + (ev.clientY - startY), 0, maxTop);
      panel.style.left = `${nextLeft}px`;
      panel.style.top = `${nextTop}px`;
      panel.style.right = 'auto';
      panel.style.bottom = 'auto';
    };

    const stop = () => {
      if (!dragging) return;
      dragging = false;
      document.removeEventListener('pointermove', onMove, true);
      document.removeEventListener('pointerup', stop, true);
      document.removeEventListener('pointercancel', stop, true);
      handle.releasePointerCapture?.(handle._dragPointerId);
      savePanelRect({
        left: panel.offsetLeft,
        top: panel.offsetTop
      });
    };

    const startDrag = (ev) => {
      if (ev.button !== undefined && ev.button !== 0) return;
      dragging = true;
      startX = ev.clientX;
      startY = ev.clientY;
      startLeft = panel.offsetLeft;
      startTop = panel.offsetTop;
      handle._dragPointerId = ev.pointerId;
      handle.setPointerCapture?.(ev.pointerId);
      document.addEventListener('pointermove', onMove, true);
      document.addEventListener('pointerup', stop, true);
      document.addEventListener('pointercancel', stop, true);
      ev.preventDefault();
      ev.stopPropagation();
    };

    if (window.PointerEvent) {
      handle.addEventListener('pointerdown', startDrag, { passive: false });
    } else {
      handle.addEventListener('mousedown', (ev) => {
        startDrag(ev);
        const move = (e) => onMove(e);
        const up = () => {
          stop();
          document.removeEventListener('mousemove', move, true);
          document.removeEventListener('mouseup', up, true);
        };
        document.addEventListener('mousemove', move, true);
        document.addEventListener('mouseup', up, true);
      }, { passive: false });
    }
  }

  onReady(() => {
    const $ = window.Squirrel?.$ || window.$;
    if (!$) return;

    if (document.getElementById('visio-mvp-root')) return;

    const host = resolveHost();
    if (!host) return;

    const state = {
      micEnabled: true,
      cameraEnabled: true
    };

    const remoteVideos = new Map();

    const root = $('div', {
      id: 'visio-mvp-root',
      parent: host,
      css: {
        padding: '16px',
        margin: '10px',
        maxWidth: '980px',
        backgroundColor: '#121212',
        color: '#e8e8e8',
        borderRadius: '12px',
        fontFamily: '"Space Grotesk", "Segoe UI", sans-serif',
        position: 'fixed',
        top: '12px',
        left: '12px',
        zIndex: 10000010,
        pointerEvents: 'auto'
      }
    });

    const header = $('div', {
      parent: root,
      text: 'Visio MVP (mediasoup)',
      css: {
        fontSize: '18px',
        fontWeight: '600',
        marginBottom: '12px',
        cursor: 'move',
        userSelect: 'none'
      }
    });

    const savedRect = loadPanelRect();
    if (savedRect && Number.isFinite(savedRect.left) && Number.isFinite(savedRect.top)) {
      root.style.left = `${savedRect.left}px`;
      root.style.top = `${savedRect.top}px`;
      root.style.right = 'auto';
      root.style.bottom = 'auto';
    }

    makePanelDraggable(root, header);

    const status = $('div', {
      parent: root,
      text: 'Idle',
      css: {
        padding: '8px 10px',
        backgroundColor: '#1f1f1f',
        borderRadius: '8px',
        fontSize: '12px',
        marginBottom: '12px'
      }
    });

    const form = $('div', {
      parent: root,
      css: { display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '12px' }
    });

    const phoneInput = $('input', {
      parent: form,
      attrs: { type: 'text', placeholder: 'Your phone (+33...)' },
      css: {
        padding: '8px',
        borderRadius: '6px',
        border: '1px solid #2b2b2b',
        backgroundColor: '#0e0e0e',
        color: '#e8e8e8',
        minWidth: '160px'
      }
    });

    const roomInput = $('input', {
      parent: form,
      attrs: { type: 'text', placeholder: 'Room ID' },
      css: {
        padding: '8px',
        borderRadius: '6px',
        border: '1px solid #2b2b2b',
        backgroundColor: '#0e0e0e',
        color: '#e8e8e8',
        minWidth: '180px'
      }
    });

    const inviteInput = $('input', {
      parent: form,
      attrs: { type: 'text', placeholder: 'Invite phone' },
      css: {
        padding: '8px',
        borderRadius: '6px',
        border: '1px solid #2b2b2b',
        backgroundColor: '#0e0e0e',
        color: '#e8e8e8',
        minWidth: '160px'
      }
    });

    const controls = $('div', {
      parent: root,
      css: { display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' }
    });

    function makeButton(label, handler) {
      return $('button', {
        parent: controls,
        text: label,
        onclick: handler,
        css: {
          padding: '8px 12px',
          borderRadius: '6px',
          backgroundColor: '#2a2a2a',
          color: '#e8e8e8',
          border: '1px solid #3c3c3c',
          cursor: 'pointer'
        }
      });
    }

    makeButton('Connect', async () => {
      if (!window.visio) return;
      try {
        status.textContent = 'Connecting...';
        await window.visio.connect({ phone: phoneInput.value.trim() || undefined });
        status.textContent = 'Connected';
      } catch (error) {
        status.textContent = `Connect error: ${error.message}`;
      }
    });

    makeButton('Create room', async () => {
      if (!window.visio) return;
      try {
        status.textContent = 'Creating room...';
        const result = await window.visio.createRoom({
          phone: phoneInput.value.trim() || undefined
        });
        if (result?.room_id) {
          roomInput.value = result.room_id;
          status.textContent = `Room created: ${result.room_id}`;
        } else {
          status.textContent = result?.error || 'Room creation failed';
        }
      } catch (error) {
        status.textContent = `Room error: ${error.message}`;
      }
    });

    makeButton('Join', async () => {
      if (!window.visio) return;
      const roomId = roomInput.value.trim();
      if (!roomId) {
        status.textContent = 'Room ID required';
        return;
      }
      try {
        status.textContent = 'Joining...';
        await window.visio.joinRoom(roomId, {
          phone: phoneInput.value.trim() || undefined,
          media: { audio: true, video: true }
        });
        status.textContent = `Joined room ${roomId}`;
      } catch (error) {
        status.textContent = `Join error: ${error.message}`;
      }
    });

    makeButton('Leave', async () => {
      if (!window.visio) return;
      await window.visio.leaveRoom();
      status.textContent = 'Left room';
    });

    makeButton('Toggle mic', () => {
      if (!window.visio) return;
      state.micEnabled = !state.micEnabled;
      window.visio.setMicEnabled(state.micEnabled);
      status.textContent = `Mic ${state.micEnabled ? 'on' : 'off'}`;
    });

    makeButton('Toggle camera', () => {
      if (!window.visio) return;
      state.cameraEnabled = !state.cameraEnabled;
      window.visio.setCameraEnabled(state.cameraEnabled);
      status.textContent = `Camera ${state.cameraEnabled ? 'on' : 'off'}`;
    });

    makeButton('Invite', async () => {
      if (!window.visio) return;
      const roomId = roomInput.value.trim();
      const invitePhone = inviteInput.value.trim();
      if (!roomId || !invitePhone) {
        status.textContent = 'Room ID + invite phone required';
        return;
      }
      try {
        status.textContent = 'Sending invite...';
        const result = await window.visio.inviteToRoom(roomId, invitePhone, {
          phone: phoneInput.value.trim() || undefined
        });
        if (result?.success) {
          status.textContent = 'Invite sent';
        } else {
          status.textContent = result?.error || 'Invite failed';
        }
      } catch (error) {
        status.textContent = `Invite error: ${error.message}`;
      }
    });

    makeButton('Request contact', async () => {
      if (!window.visio) return;
      const invitePhone = inviteInput.value.trim();
      if (!invitePhone) {
        status.textContent = 'Invite phone required';
        return;
      }
      try {
        status.textContent = 'Sending request...';
        const result = await window.visio.requestContact(invitePhone, {
          phone: phoneInput.value.trim() || undefined
        });
        if (result?.success) {
          status.textContent = 'Request sent';
        } else {
          status.textContent = result?.error || 'Request failed';
        }
      } catch (error) {
        status.textContent = `Request error: ${error.message}`;
      }
    });

    const videoWrap = $('div', {
      parent: root,
      css: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: '12px',
        backgroundColor: '#0e0e0e',
        padding: '12px',
        borderRadius: '10px'
      }
    });

    const localCard = $('div', {
      parent: videoWrap,
      css: {
        border: '1px solid #202020',
        borderRadius: '8px',
        padding: '6px'
      }
    });

    $('div', {
      parent: localCard,
      text: 'Local',
      css: { fontSize: '11px', marginBottom: '6px', color: '#bdbdbd' }
    });

    const localVideo = $('video', {
      parent: localCard,
      attrs: { autoplay: true, playsinline: true, muted: true },
      css: { width: '100%', borderRadius: '6px', backgroundColor: '#000' }
    });

    const remoteCard = $('div', {
      parent: videoWrap,
      css: {
        border: '1px solid #202020',
        borderRadius: '8px',
        padding: '6px',
        minHeight: '120px'
      }
    });

    $('div', {
      parent: remoteCard,
      text: 'Remote',
      css: { fontSize: '11px', marginBottom: '6px', color: '#bdbdbd' }
    });

    const remoteList = $('div', {
      parent: remoteCard,
      css: { display: 'flex', flexDirection: 'column', gap: '8px' }
    });

    window.addEventListener('visio:status', (event) => {
      if (!event.detail) return;
      const text = event.detail.message || event.detail.status || 'status';
      status.textContent = `${text}`;
    });

    window.addEventListener('visio:local-stream', (event) => {
      if (!event.detail?.stream) return;
      attachStream(localVideo, event.detail.stream, true);
    });

    window.addEventListener('visio:remote-stream', (event) => {
      const detail = event.detail || {};
      const producerId = detail.producerId;
      const stream = detail.stream;
      if (!producerId || !stream || remoteVideos.has(producerId)) return;

      const holder = document.createElement('div');
      holder.style.display = 'flex';
      holder.style.flexDirection = 'column';
      holder.style.gap = '4px';

      const label = document.createElement('div');
      label.textContent = producerId.slice(0, 8);
      label.style.fontSize = '10px';
      label.style.color = '#9a9a9a';

      const hasVideo = stream.getVideoTracks().length > 0;
      const mediaEl = document.createElement(hasVideo ? 'video' : 'audio');
      mediaEl.autoplay = true;
      mediaEl.playsInline = true;
      mediaEl.controls = !hasVideo;
      mediaEl.style.width = '100%';
      mediaEl.style.borderRadius = '6px';
      mediaEl.style.backgroundColor = '#000';

      holder.appendChild(label);
      holder.appendChild(mediaEl);
      remoteList.appendChild(holder);

      attachStream(mediaEl, stream, false);
      remoteVideos.set(producerId, holder);
    });

    window.addEventListener('visio:remote-closed', (event) => {
      const producerId = event.detail?.producerId;
      if (!producerId) return;
      const holder = remoteVideos.get(producerId);
      if (holder && holder.parentNode) {
        holder.parentNode.removeChild(holder);
      }
      remoteVideos.delete(producerId);
    });
  });
})();
