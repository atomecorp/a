// Kira backend for Squirrel.av.audio
// Routes audio commands to either Tauri invoke (native) or WASM module (web).
// Replaces the legacy iplug + html backends with a unified CPAL/Kira engine.

(function () {
  const audio = window.Squirrel && window.Squirrel.av && window.Squirrel.av.audio;
  if (!audio) {
    console.warn('[backend.kira] Squirrel.av.audio not found; load audio.facade.js first');
    return;
  }

  let mode = null;   // 'tauri' | 'wasm'
  let wasm = null;    // WASM module reference

  // Detect environment
  function isTauri() {
    return !!(window.__TAURI__ && window.__TAURI__.core && window.__TAURI__.core.invoke);
  }

  function invoke(cmd, args) {
    if (mode === 'tauri') {
      return window.__TAURI__.core.invoke(cmd, args || {});
    }
    // WASM mode — call the exported function directly
    if (mode === 'wasm' && wasm && typeof wasm[cmd] === 'function') {
      try {
        return Promise.resolve(wasm[cmd](...Object.values(args || {})));
      } catch (e) {
        return Promise.reject(e);
      }
    }
    return Promise.reject(new Error('[backend.kira] No audio backend available'));
  }

  // Backend API matching Squirrel.av.audio facade expectations
  var backend = {

    async init() {
      if (isTauri()) {
        mode = 'tauri';
        await invoke('audio_init');
        console.log('[backend.kira] Initialized via Tauri (native CPAL + Kira)');
      } else {
        // Try loading WASM module
        mode = 'wasm';
        try {
          var mod = await import('/wasm/squirrel_audio_wasm.js');
          await mod.default();
          wasm = mod;
          wasm.audio_init();
          console.log('[backend.kira] Initialized via WASM (CPAL + Kira)');
        } catch (e) {
          mode = null;
          console.warn('[backend.kira] WASM module not available:', e.message);
          throw e;
        }
      }
    },

    create_clip(arg) {
      if (!arg || !arg.id) return;
      if (mode === 'tauri') {
        var path = arg.path_or_bookmark || arg.path || '';
        invoke('audio_load_clip', { id: arg.id, path: path }).catch(function (e) {
          console.warn('[backend.kira] load_clip error:', e);
        });
      } else if (mode === 'wasm' && arg.bytes) {
        // WASM cannot read files — bytes must be provided
        try { wasm.audio_load_clip_from_bytes(arg.id, arg.bytes); }
        catch (e) { console.warn('[backend.kira] wasm load error:', e); }
      } else if (mode === 'wasm' && arg.url) {
        // Fetch then load
        fetch(arg.url)
          .then(function (r) { return r.arrayBuffer(); })
          .then(function (buf) {
            wasm.audio_load_clip_from_bytes(arg.id, new Uint8Array(buf));
          })
          .catch(function (e) { console.warn('[backend.kira] wasm fetch+load error:', e); });
      }
    },

    destroy_clip(arg) {
      var id = (typeof arg === 'string') ? arg : (arg && arg.id);
      if (id) invoke('audio_destroy_clip', { id: id }).catch(function () {});
    },

    play(arg) {
      var id = (typeof arg === 'string') ? arg : (arg && arg.id);
      if (id) invoke('audio_play', { id: id }).catch(function (e) {
        console.warn('[backend.kira] play error:', e);
      });
    },

    stop(arg) {
      var id = (typeof arg === 'string') ? arg : (arg && arg.id);
      if (id) invoke('audio_stop', { id: id }).catch(function (e) {
        console.warn('[backend.kira] stop error:', e);
      });
    },

    stop_clip(arg) {
      backend.stop(arg);
    },

    jump(arg) {
      // Kira does not expose seek on StaticSoundHandle directly via our bridge yet
      console.warn('[backend.kira] jump() not yet implemented');
    },

    set_param(arg) {
      if (!arg) return;
      if (arg.paramId === 'volume' || arg.paramId === 'gain') {
        invoke('audio_set_volume', { id: arg.id || arg.clipId, db: arg.value || 0 })
          .catch(function () {});
      } else if (arg.paramId === 'playback_rate' || arg.paramId === 'speed') {
        invoke('audio_set_playback_rate', { id: arg.id || arg.clipId, rate: arg.value || 1 })
          .catch(function () {});
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

  // Register the backend
  audio.__register_backend('kira', backend);

  // Auto-init: try to activate kira backend
  // Use a microtask to let the facade finish loading
  Promise.resolve().then(function () {
    backend.init().then(function () {
      audio.set_backend('kira');
    }).catch(function () {
      // Kira not available, facade keeps current backend
    });
  });
})();
