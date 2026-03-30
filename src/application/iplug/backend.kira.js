import { getTauriInvoke, resolveAudioRuntime } from './runtime_audio_backend.js';

// Kira backend for Squirrel.av.audio
// Routes audio commands to either Tauri invoke (native) or WASM module (web).
// Replaces the legacy iplug + html backends with a unified CPAL/Kira engine.

(function () {
  const audio = window.Squirrel && window.Squirrel.av && window.Squirrel.av.audio;
  if (!audio) {
    console.warn('[backend.kira] Squirrel.av.audio not found; load audio.facade.js first');
    return;
  }

  let mode = null; // 'tauri' | 'wasm'
  let wasm = null;

  function resolveClipId(arg) {
    if (typeof arg === 'string') return arg;
    return arg && (arg.id || arg.clip_id || arg.clipId) || '';
  }

  function invoke(cmd, args) {
    if (mode === 'tauri') {
      const tauriInvoke = getTauriInvoke(window);
      if (!tauriInvoke) {
        return Promise.reject(new Error('[backend.kira] Tauri invoke() not available'));
      }
      return tauriInvoke(cmd, args || {});
    }
    if (mode === 'wasm' && wasm && typeof wasm[cmd] === 'function') {
      try {
        return Promise.resolve(wasm[cmd](...Object.values(args || {})));
      } catch (e) {
        return Promise.reject(e);
      }
    }
    return Promise.reject(new Error('[backend.kira] No audio backend available'));
  }

  function loadClipFromUrl(id, url) {
    fetch(url)
      .then(function (r) { return r.arrayBuffer(); })
      .then(function (buf) {
        const bytes = new Uint8Array(buf);
        if (mode === 'wasm' && wasm && typeof wasm.audio_load_clip_from_bytes === 'function') {
          wasm.audio_load_clip_from_bytes(id, bytes);
          return;
        }
        return invoke('audio_load_clip_from_bytes', { id: id, bytes: Array.from(bytes) });
      })
      .catch(function (e) {
        console.warn('[backend.kira] fetch+load error:', e);
      });
  }

  var backend = {
    async init() {
      const runtime = resolveAudioRuntime(window);
      if (runtime.playback === 'tauri_native_kira') {
        mode = 'tauri';
        await invoke('audio_init');
        console.log('[backend.kira] Initialized via Tauri (native CPAL + Kira)');
        return;
      }
      if (runtime.playback === 'web_wasm_kira') {
        mode = 'wasm';
        try {
          var mod = await import('/wasm/squirrel_audio_wasm.js');
          await mod.default();
          wasm = mod;
          wasm.audio_init();
          console.log('[backend.kira] Initialized via WASM (CPAL + Kira)');
          return;
        } catch (e) {
          mode = null;
          console.warn('[backend.kira] WASM module not available:', e.message);
          throw e;
        }
      }
      throw new Error('[backend.kira] Unified playback runtime unavailable');
    },

    create_clip(arg) {
      var id = resolveClipId(arg);
      if (!id) return;
      var path = arg && (arg.path_or_bookmark || arg.path) || '';
      var url = arg && arg.url || '';
      var bytes = arg && arg.bytes || null;

      if (mode === 'tauri' && path) {
        invoke('audio_load_clip', { id: id, path: path }).catch(function (e) {
          console.warn('[backend.kira] load_clip error:', e);
        });
        return;
      }
      if ((mode === 'tauri' || mode === 'wasm') && bytes) {
        if (mode === 'wasm' && wasm && typeof wasm.audio_load_clip_from_bytes === 'function') {
          try { wasm.audio_load_clip_from_bytes(id, bytes); }
          catch (e) { console.warn('[backend.kira] wasm load error:', e); }
          return;
        }
        invoke('audio_load_clip_from_bytes', { id: id, bytes: Array.from(bytes) }).catch(function (e) {
          console.warn('[backend.kira] load_clip_from_bytes error:', e);
        });
        return;
      }
      if ((mode === 'tauri' || mode === 'wasm') && url) {
        loadClipFromUrl(id, url);
      }
    },

    destroy_clip(arg) {
      var id = resolveClipId(arg);
      if (id) invoke('audio_destroy_clip', { id: id }).catch(function () {});
    },

    play(arg) {
      var id = resolveClipId(arg);
      if (id) invoke('audio_play', { id: id }).catch(function (e) {
        console.warn('[backend.kira] play error:', e);
      });
    },

    stop(arg) {
      var id = resolveClipId(arg);
      if (id) invoke('audio_stop', { id: id }).catch(function (e) {
        console.warn('[backend.kira] stop error:', e);
      });
    },

    stop_clip(arg) {
      backend.stop(arg);
    },

    jump() {
      console.warn('[backend.kira] jump() not yet implemented');
    },

    set_param(arg) {
      if (!arg) return;
      var id = resolveClipId(arg);
      if (!id) return;
      if (arg.paramId === 'volume' || arg.paramId === 'gain') {
        invoke('audio_set_volume', { id: id, db: arg.value || 0 }).catch(function () {});
      } else if (arg.paramId === 'playback_rate' || arg.paramId === 'speed') {
        invoke('audio_set_playback_rate', { id: id, rate: arg.value || 1 }).catch(function () {});
      }
    },

    map_midi() {},
    add_marker() {},
    remove_marker() {},
    set_marker_follow_actions() {},
    clear_marker_follow_actions() {},
    query_clip() {},

    dispatch_batch(batch) {
      for (var i = 0; i < batch.length; i++) {
        var cmd = batch[i];
        if (typeof backend[cmd.name] === 'function') {
          backend[cmd.name](cmd.arg);
        }
      }
    }
  };

  audio.__register_backend('kira', backend);

  Promise.resolve().then(function () {
    backend.init().then(function () {
      audio.set_backend('kira');
    }).catch(function () {
      // Kira not available (expected for AUv3, possible for browser without WASM).
      // Re-trigger detection so a fallback backend (iplug or html) can activate.
      if (typeof audio.detect_and_set_backend === 'function') {
        audio.detect_and_set_backend();
      }
    });
  });
})();
