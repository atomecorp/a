import { resolveAudioRuntime } from './runtime_audio_backend.js';

// Squirrel AV Audio Facade — Unified Audio Engine entry point
// Exposes Squirrel.av.audio with a switchable backend (kira | iplug | html)
// - Primary backend: kira (Tauri native CPAL+Kira / WASM Kira)
// - Bridge backend: iplug (AUv3 swiftBridge, deprecated for production playback)
// - Fallback backend: html (WebAudio, browser-only when kira unavailable)
// - Dynamic routing to active backend
// - Event bus (type -> Set(callback))
// - detect_and_set_backend() prefers kira > iplug > html
// - UI->DSP batching with dual strategy: microtask for low-latency, RAF cap for UI sync
// Notes: Keep JS allocs out of the audio thread; backends talk to native or WebAudio.

(function () {
  const ns = (window.Squirrel = window.Squirrel || {});
  const av = (ns.av = ns.av || {});
  const audio = (av.audio = av.audio || {});

  // Event bus
  const listeners = new Map(); // type -> Set(fn)
  function emit(type, payload) {
    const set = listeners.get(type);
    if (set) {
      for (const fn of set) {
        try { fn(payload); } catch (e) { console.warn('[audio.facade] event handler error:', e); }
      }
    }
  }
  audio.on = (type, fn) => {
    if (!listeners.has(type)) listeners.set(type, new Set());
    listeners.get(type).add(fn);
  };
  audio.off = (type, fn) => { const s = listeners.get(type); if (s) s.delete(fn); };

  // Backend registry
  const backends = Object.create(null);
  let active = null; // 'kira' | 'iplug' | 'html'

  // ─── Dual-strategy command queue ───────────────────────────────────
  // Immediate calls (play/stop/jump/set_param) bypass the queue entirely.
  // Batched calls use requestAnimationFrame so that dispatch happens once per
  // frame, avoiding microtask stacking that can starve video rendering and
  // cause choppy playback.
  const q = [];
  let flushScheduled = false;

  function flush() {
    flushScheduled = false;
    if (!active || q.length === 0) return;
    const batch = q.splice(0, q.length);
    try {
      backends[active].dispatch_batch(batch);
    } catch (e) {
      console.warn('[audio.facade] dispatch_batch error:', e);
    }
  }

  function enqueue(cmd) {
    q.push(cmd);
    if (!flushScheduled) {
      flushScheduled = true;
      requestAnimationFrame(flush);
    }
  }

  // API facade: routes to active backend
  const immediateNames = new Set(['play', 'stop', 'stop_clip', 'jump', 'set_param']);
  const proxyCall = (name) => (arg) => {
    if (!active || !backends[active] || typeof backends[active][name] !== 'function') {
      console.warn('[audio.facade] No backend for', name); return false;
    }
    // low-latency calls go immediately
    if (immediateNames.has(name)) {
      try { backends[active][name](arg); } catch (e) { console.warn('[audio.facade] immediate call failed:', e); }
      return true;
    }
    // batch others UI->DSP calls
    enqueue({ name, arg });
    // Return lightweight ack; results delivered via events
    return true;
  };

  audio.set_backend = (name) => {
    if (!backends[name]) return false;
    active = name; emit('backend_changed', { backend: name }); return true;
  };
  audio.get_backend = () => active;
  audio.get_runtime = () => resolveAudioRuntime(window);

  audio.detect_and_set_backend = (order = null) => {
    const runtime = resolveAudioRuntime(window);
    const preferredOrder = Array.isArray(order) && order.length
      ? order
      : runtime.preferredFacadeBackendOrder;
    const available = [];
    if (backends['kira']) available.push('kira');
    if (runtime.hasIPlugBridge) available.push('iplug');
    if (window.AudioContext || window.webkitAudioContext) available.push('html');
    for (const pref of preferredOrder) {
      if (available.includes(pref) && audio.set_backend(pref)) {
        return pref;
      }
    }
    return null;
  };

  // Public API (façade)
  audio.create_clip = proxyCall('create_clip');
  audio.destroy_clip = proxyCall('destroy_clip');
  audio.play = proxyCall('play');
  audio.stop = proxyCall('stop');
  audio.stop_clip = proxyCall('stop_clip');
  audio.jump = proxyCall('jump');
  audio.set_param = proxyCall('set_param');
  audio.map_midi = proxyCall('map_midi');
  audio.add_marker = proxyCall('add_marker');
  audio.remove_marker = proxyCall('remove_marker');
  audio.set_marker_follow_actions = proxyCall('set_marker_follow_actions');
  audio.clear_marker_follow_actions = proxyCall('clear_marker_follow_actions');
  audio.query_clip = proxyCall('query_clip');

  // Backend registration hooks
  audio.__register_backend = (name, api) => { backends[name] = api; };
  audio.__emit = emit; // allow backends to emit on the facade bus

  // Auto detect backend
  audio.detect_and_set_backend();
})();
