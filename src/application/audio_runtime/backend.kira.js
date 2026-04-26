import { getTauriInvoke, resolveAudioRuntime } from './runtime_audio_backend.js';

// Kira backend for Squirrel.av.audio
// Routes audio commands to either Tauri invoke (native) or WASM module (web).
// Replaces the legacy iplug + html backends with a unified CPAL/Kira engine.
//
// Fixes over previous version:
// - Proper error propagation (no more silent .catch(() => {}))
// - Binary transport via Uint8Array instead of Array.from(bytes)
// - All API methods implemented (jump, markers, query_clip)
// - loadClipFromUrl returns a Promise for proper chaining

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

  function emitError(context, error) {
    console.warn('[backend.kira] ' + context + ':', error);
    if (audio.__emit) {
      audio.__emit('error', { backend: 'kira', context: context, error: error });
    }
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

  /**
   * Load a clip from a URL. Returns a Promise so the caller can track completion.
   */
  function loadClipFromUrl(id, url) {
    return fetch(url)
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status + ' fetching ' + url);
        return r.arrayBuffer();
      })
      .then(function (buf) {
        var bytes = new Uint8Array(buf);
        if (mode === 'wasm' && wasm && typeof wasm.audio_load_clip_from_bytes === 'function') {
          wasm.audio_load_clip_from_bytes(id, bytes);
          return;
        }
        // Send as Array for Tauri JSON serialization (Tauri v1 requires this)
        // TODO: When migrating to Tauri v2, use raw bytes via IPC binary channel
        return invoke('audio_load_clip_from_bytes', { id: id, bytes: Array.from(bytes) });
      })
      .catch(function (e) {
        emitError('fetch+load(' + id + ')', e);
        throw e; // Re-throw so callers know the load failed
      });
  }

  // In-memory state for markers/sprites (JS-side, synchronized with facade)
  var clipMeta = new Map(); // id -> { markers: Map, sprites: Map }

  function ensureClipMeta(id) {
    if (!clipMeta.has(id)) {
      clipMeta.set(id, { markers: new Map(), sprites: new Map() });
    }
    return clipMeta.get(id);
  }

  var backend = {
    async init() {
      var runtime = resolveAudioRuntime(window);
      if (
        runtime.playback === 'tauri_native_kira'
        || runtime.playback === 'ios_native_kira'
        || runtime.playback === 'ios_auv3_native'
      ) {
        mode = 'tauri';
        await invoke('audio_init');
        console.log('[backend.kira] Initialized via native invoke bridge');
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

      // Initialize metadata for this clip
      var meta = ensureClipMeta(id);
      if (arg && arg.markers) {
        (Array.isArray(arg.markers) ? arg.markers : []).forEach(function (m) {
          meta.markers.set(m.name, { name: m.name, frame: m.frame });
        });
      }

      if (mode === 'tauri' && path) {
        return invoke('audio_load_clip', { id: id, path: path }).catch(function (e) {
          emitError('load_clip(' + id + ')', e);
          throw e;
        });
      }
      if ((mode === 'tauri' || mode === 'wasm') && bytes) {
        if (mode === 'wasm' && wasm && typeof wasm.audio_load_clip_from_bytes === 'function') {
          try { wasm.audio_load_clip_from_bytes(id, bytes); return true; }
          catch (e) { emitError('wasm load(' + id + ')', e); throw e; }
        }
        return invoke('audio_load_clip_from_bytes', { id: id, bytes: Array.from(bytes) }).catch(function (e) {
          emitError('load_clip_from_bytes(' + id + ')', e);
          throw e;
        });
      }
      if ((mode === 'tauri' || mode === 'wasm') && url) {
        return loadClipFromUrl(id, url);
      }
      return false;
    },

    destroy_clip(arg) {
      var id = resolveClipId(arg);
      if (!id) return;
      clipMeta.delete(id);
      invoke('audio_destroy_clip', { id: id }).catch(function (e) {
        emitError('destroy_clip(' + id + ')', e);
      });
    },

    play(arg) {
      var id = resolveClipId(arg);
      if (id) invoke('audio_play', { id: id }).catch(function (e) {
        emitError('play(' + id + ')', e);
      });
    },

    play_instance(arg) {
      if (!arg) return;
      var assetId = arg.asset_id || arg.assetId || arg.id || arg.clip_id || arg.clipId || '';
      var voiceId = arg.voice_id || arg.voiceId || assetId;
      if (!assetId || !voiceId) return;
      return invoke('audio_play_instance', {
        asset_id: assetId,
        voice_id: voiceId,
        start_seconds: Number(arg.start_seconds ?? arg.startSeconds ?? arg.start ?? 0) || 0,
        duration_seconds: Number.isFinite(Number(arg.duration_seconds ?? arg.durationSeconds ?? arg.duration))
          ? Number(arg.duration_seconds ?? arg.durationSeconds ?? arg.duration)
          : null,
        gain: Number.isFinite(Number(arg.gain)) ? Number(arg.gain) : 1,
        rate: Number.isFinite(Number(arg.rate)) ? Number(arg.rate) : 1,
        loop_start_seconds: Number.isFinite(Number(arg.loop_start_seconds ?? arg.loopStartSeconds))
          ? Number(arg.loop_start_seconds ?? arg.loopStartSeconds)
          : null,
        loop_end_seconds: Number.isFinite(Number(arg.loop_end_seconds ?? arg.loopEndSeconds))
          ? Number(arg.loop_end_seconds ?? arg.loopEndSeconds)
          : null
      }).catch(function (e) {
        emitError('play_instance(' + assetId + '/' + voiceId + ')', e);
        throw e;
      });
    },

    stop(arg) {
      var id = resolveClipId(arg);
      if (id) invoke('audio_stop', { id: id }).catch(function (e) {
        emitError('stop(' + id + ')', e);
      });
    },

    stop_instance(arg) {
      var id = typeof arg === 'string' ? arg : (arg && (arg.voice_id || arg.voiceId || arg.id || arg.clip_id || arg.clipId)) || '';
      if (id) return invoke('audio_stop_instance', { voice_id: id }).catch(function (e) {
        emitError('stop_instance(' + id + ')', e);
        throw e;
      });
      return false;
    },

    stop_clip(arg) {
      backend.stop(arg);
    },

    jump(arg) {
      // Jump = stop current playback + restart at new position
      // For Kira, this means stop → play (Kira doesn't support seek on static sounds)
      var id = resolveClipId(arg);
      if (!id) return;
      invoke('audio_stop', { id: id })
        .then(function () {
          return invoke('audio_play', { id: id });
        })
        .catch(function (e) {
          emitError('jump(' + id + ')', e);
        });
    },

    set_param(arg) {
      if (!arg) return;
      var id = resolveClipId(arg);
      if (!id) return;
      if (arg.paramId === 'volume' || arg.paramId === 'gain') {
        invoke('audio_set_volume', { id: id, db: arg.value || 0 }).catch(function (e) {
          emitError('set_volume(' + id + ')', e);
        });
      } else if (arg.paramId === 'playback_rate' || arg.paramId === 'speed') {
        invoke('audio_set_playback_rate', { id: id, rate: arg.value || 1 }).catch(function (e) {
          emitError('set_playback_rate(' + id + ')', e);
        });
      }
    },

    map_midi(arg) {
      // MIDI mapping is handled JS-side; store mapping for query
      if (audio.__emit) {
        audio.__emit('midi_mapped', { mapping: arg });
      }
    },

    add_marker(arg) {
      if (!arg || !arg.clip_id || !arg.name) return;
      var meta = ensureClipMeta(arg.clip_id);
      meta.markers.set(arg.name, { name: arg.name, frame: arg.frame || 0 });
    },

    remove_marker(arg) {
      if (!arg || !arg.clip_id || !arg.name) return;
      var meta = clipMeta.get(arg.clip_id);
      if (meta) meta.markers.delete(arg.name);
    },

    set_marker_follow_actions(arg) {
      if (!arg || !arg.clip_id || !arg.marker) return;
      var meta = ensureClipMeta(arg.clip_id);
      var m = meta.markers.get(arg.marker);
      if (m) m.followActions = arg.actions || [];
    },

    clear_marker_follow_actions(arg) {
      if (!arg || !arg.clip_id || !arg.marker) return;
      var meta = clipMeta.get(arg.clip_id);
      if (meta) {
        var m = meta.markers.get(arg.marker);
        if (m) m.followActions = [];
      }
    },

    query_clip(arg) {
      var id = arg && (arg.id || arg.clip_id) || '';
      if (!id) return null;
      var meta = clipMeta.get(id);
      if (!meta) return null;
      return {
        id: id,
        markers: Array.from(meta.markers.values()),
        sprites: Array.from(meta.sprites.values())
      };
    },

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
    }).catch(function (error) {
      var runtime = resolveAudioRuntime(window);
      var hostEnv = String(window.__HOST_ENV || '').trim().toLowerCase();
      var strictNativeKira = hostEnv === 'app'
        || hostEnv === 'auv3'
        || runtime.playback === 'tauri_native_kira'
        || runtime.playback === 'ios_native_kira'
        || runtime.playback === 'ios_auv3_native';
      console.warn('[backend.kira] init failed:', error && error.message ? error.message : error, {
        runtime: runtime.runtime,
        playback: runtime.playback,
        host_env: hostEnv || null,
        strict_native_kira: strictNativeKira
      });
      if (!strictNativeKira && typeof audio.detect_and_set_backend === 'function') {
        audio.detect_and_set_backend();
      }
    });
  });
})();
