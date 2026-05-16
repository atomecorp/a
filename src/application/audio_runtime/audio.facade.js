import { getPlayRecordCore } from './play_record_core.js';
import { resolveAudioRuntime } from './runtime_audio_backend.js';

// Squirrel AV Audio Facade — Unified Audio Engine entry point
// Exposes Squirrel.av.audio with a single playback authority: kira.
// - Playback backend: kira (Tauri native CPAL+Kira / iOS native Kira / WASM Kira)
// - Dynamic routing to the active runtime-backed Kira engine
// - Event bus (type -> Set(callback))
// - detect_and_set_backend() follows the runtime's single-authority contract
// - UI->DSP batching with dual strategy: microtask for low-latency, RAF cap for UI sync
// Notes: Keep JS allocations out of the audio thread; backends talk to native or Kira/WASM.

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
        try { fn(payload); } catch { }
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
  let active = null; // 'kira'

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
  const immediateNames = new Set(['create_clip', 'destroy_clip', 'play', 'play_instance', 'stop', 'stop_clip', 'stop_instance', 'jump', 'set_param']);
  const callBackendMethod = (name, arg) => {
    if (!active || !backends[active] || typeof backends[active][name] !== 'function') {
      return false;
    }
    // low-latency calls go immediately
    if (immediateNames.has(name)) {
      try { return backends[active][name](arg); } catch { return false; }
    }
    // batch others UI->DSP calls
    enqueue({ name, arg });
    // Return lightweight ack; results delivered via events
    return true;
  };
  const proxyCall = (name) => (arg) => callBackendMethod(name, arg);

  const coreCall = (method, arg) => {
    try {
      const core = getPlayRecordCore(window);
      return core[method](arg);
    } catch (_) {
      return false;
    }
  };

  audio.set_backend = (name) => {
    if (!backends[name]) return false;
    active = name; emit('backend_changed', { backend: name }); return true;
  };
  audio.get_backend = () => active;
  audio.get_runtime = () => resolveAudioRuntime(window);

  audio.detect_and_set_backend = () => {
    const runtime = resolveAudioRuntime(window);
    if (!runtime.preferredFacadeBackendOrder.includes('kira')) {
      return null;
    }
    if (backends['kira'] && audio.set_backend('kira')) {
      return 'kira';
    }
    return null;
  };

  // Public API (façade)
  audio.create_clip = (arg) => coreCall('loadAsset', arg);
  audio.destroy_clip = (arg) => coreCall('destroyAsset', (typeof arg === 'string' ? arg : (arg && (arg.id || arg.clip_id || arg.clipId || arg.assetId || arg.asset_id))));
  audio.play = (arg) => coreCall('playAsset', arg);
  audio.play_instance = (arg) => coreCall('playVoice', arg);
  audio.stop = (arg) => coreCall('stopAsset', arg);
  audio.stop_instance = (arg) => coreCall('stopVoice', arg);
  audio.stop_clip = (arg) => coreCall('stopAsset', arg);
  audio.jump = (arg) => coreCall('jumpAsset', arg);
  audio.set_param = (arg = {}) => {
    const id = arg && (arg.id || arg.clip_id || arg.clipId || arg.voiceId || arg.voice_id);
    if (arg?.paramId === 'volume' || arg?.paramId === 'gain') return coreCall('setVoiceGain', id ? { voiceId: id, gain: arg.value } : arg);
    if (arg?.paramId === 'playback_rate' || arg?.paramId === 'speed') return coreCall('setVoiceRate', id ? { voiceId: id, rate: arg.value } : arg);
    return callBackendMethod('set_param', arg);
  };
  audio.map_midi = proxyCall('map_midi');
  audio.add_marker = proxyCall('add_marker');
  audio.remove_marker = proxyCall('remove_marker');
  audio.set_marker_follow_actions = proxyCall('set_marker_follow_actions');
  audio.clear_marker_follow_actions = proxyCall('clear_marker_follow_actions');
  audio.query_clip = proxyCall('query_clip');

  // Backend registration hooks
  audio.__register_backend = (name, api) => { backends[name] = api; };
  audio.__call_backend_method = callBackendMethod;
  audio.__emit = emit; // allow backends to emit on the facade bus

  // Auto detect backend
  audio.detect_and_set_backend();
})();
