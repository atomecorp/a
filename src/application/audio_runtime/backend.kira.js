import {
  buildTauriKiraAudioPayload,
  KIRA_AUDIO_COMMANDS,
  normalizeKiraPlayInstancePayload,
  normalizeKiraStopInstancePayload
} from './kira_audio_commands.js';
import {
  getTauriInvoke,
  isIosHostAppRuntime,
  resolveAudioRuntime
} from './runtime_audio_backend.js';

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
    return;
  }

  let mode = null; // 'tauri' | 'wasm'
  let wasm = null;
  let initPromise = null;
  let wasmModulePromise = null;
  let wasmAudioManagerReady = false;

  function resolveClipId(arg) {
    if (typeof arg === 'string') return arg;
    return arg && (arg.id || arg.clip_id || arg.clipId) || '';
  }

  function emitError(context, error) {
    if (audio.__emit) {
      audio.__emit('error', { backend: 'kira', context: context, error: error });
    }
  }

  function isAuv3NativeRuntime() {
    var runtime = resolveAudioRuntime(window);
    return runtime.playback === 'ios_auv3_native' || runtime.record === 'ios_auv3_native' || runtime.runtime === 'ios_auv3';
  }

  function rejectIosHostAppBytesLoad(context) {
    var error = new Error('[backend.kira] iOS host app native playback requires a local media path');
    emitError(context, error);
    return Promise.reject(error);
  }

  function normalizeAuv3LocalPath(source) {
    if (!source) return '';
    var value = String(source).trim();
    if (!value || value.startsWith('blob:') || value.startsWith('data:')) return '';
    try {
      var parsed = new URL(value, 'atome:///');
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:' || parsed.protocol === 'atome:' || parsed.protocol === 'file:') {
        value = parsed.pathname || value;
      }
    } catch (_) { }
    value = value
      .replace(/^file:\/\/\/file\//, '')
      .replace(/^file:\/\//, '')
      .replace(/^\/file\//, '')
      .replace(/^\/+/, '');
    if (value.startsWith('api/recordings/')) return 'recordings/' + value.slice('api/recordings/'.length);
    if (value.startsWith('api/uploads/')) return value.slice('api/uploads/'.length);
    return value;
  }

  function postAuv3LocalClipLoad(source) {
    var relativePath = normalizeAuv3LocalPath(source);
    var bridge = window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.atome;
    if (!relativePath || !bridge || typeof bridge.postMessage !== 'function') return false;
    bridge.postMessage({
      type: 'iplug',
      action: 'loadLocalPath',
      relativePath: relativePath
    });
    return true;
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

  function isNativePlaybackRuntime(runtime) {
    return runtime.playback === 'tauri_native_kira'
      || runtime.playback === 'ios_native_kira'
      || runtime.playback === 'ios_auv3_native';
  }

  function loadWasmModule() {
    if (!wasmModulePromise) {
      wasmModulePromise = import('/wasm/squirrel_audio_wasm.js')
        .then(function (mod) {
          return Promise.resolve(mod.default()).then(function () {
            wasm = mod;
            return mod;
          });
        });
    }
    return wasmModulePromise;
  }

  function ensureRuntimeMode(options) {
    var shouldCreateAudioManager = !!(options && options.audioManager);
    var runtime = resolveAudioRuntime(window);
    if (isNativePlaybackRuntime(runtime)) {
      if (mode === 'tauri') return initPromise || Promise.resolve();
      if (!initPromise) {
        mode = 'tauri';
        initPromise = invoke('audio_init').catch(function (error) {
          mode = null;
          initPromise = null;
          throw error;
        });
      }
      return initPromise;
    }
    if (runtime.playback === 'web_wasm_kira') {
      mode = 'wasm';
      return loadWasmModule().then(function () {
        if (!shouldCreateAudioManager) return;
        if (wasmAudioManagerReady) return;
        return Promise.resolve(wasm.audio_init()).then(function () {
          wasmAudioManagerReady = true;
        });
      }).catch(function (error) {
        if (shouldCreateAudioManager) {
          mode = null;
          initPromise = null;
          wasmAudioManagerReady = false;
        }
        throw error;
      });
    }
    return Promise.reject(new Error('[backend.kira] Unified playback runtime unavailable'));
  }

  /**
   * Load a clip from a URL. Returns a Promise so the caller can track completion.
   */
  function loadClipFromUrl(id, url) {
    return ensureRuntimeMode({ audioManager: false }).then(function () {
      if (mode === 'tauri' && isIosHostAppRuntime(window)) {
        return rejectIosHostAppBytesLoad('load_url_requires_local_path(' + id + ')');
      }
      if (mode === 'tauri' && isAuv3NativeRuntime()) {
        if (postAuv3LocalClipLoad(url)) {
          return Promise.resolve(true);
        }
        const error = new Error('[backend.kira] AUv3 native playback requires a local media path');
        emitError('load_url_requires_local_path(' + id + ')', error);
        return Promise.reject(error);
      }
      return fetch(url);
    })
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
      await ensureRuntimeMode({ audioManager: true });
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

      return ensureRuntimeMode({ audioManager: false }).then(function () {
        if (mode === 'tauri' && path) {
          if (isAuv3NativeRuntime() && postAuv3LocalClipLoad(path)) return true;
          return invoke('audio_load_clip', { id: id, path: path }).catch(function (e) {
            emitError('load_clip(' + id + ')', e);
            throw e;
          });
        }
        if ((mode === 'tauri' || mode === 'wasm') && bytes) {
          if (mode === 'tauri' && isIosHostAppRuntime(window)) {
            return rejectIosHostAppBytesLoad('load_clip_from_bytes(' + id + ')');
          }
          if (mode === 'tauri' && isAuv3NativeRuntime()) {
            var auv3BytesError = new Error('[backend.kira] AUv3 native playback does not support byte-loaded clips');
            emitError('load_clip_from_bytes(' + id + ')', auv3BytesError);
            return Promise.reject(auv3BytesError);
          }
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
      });
    },

    destroy_clip(arg) {
      var id = resolveClipId(arg);
      if (!id) return;
      clipMeta.delete(id);
      ensureRuntimeMode({ audioManager: false }).then(function () {
        return invoke('audio_destroy_clip', { id: id });
      }).catch(function (e) {
        emitError('destroy_clip(' + id + ')', e);
      });
    },

    play(arg) {
      var id = resolveClipId(arg);
      if (id) return ensureRuntimeMode({ audioManager: true }).then(function () {
        return invoke('audio_play', { id: id });
      }).catch(function (e) {
        emitError('play(' + id + ')', e);
        throw e;
      });
      return false;
    },

    play_instance(arg) {
      if (!arg) return;
      var payload = normalizeKiraPlayInstancePayload(arg);
      if (!payload.assetId || !payload.voiceId) return;
      return ensureRuntimeMode({ audioManager: true }).then(function () {
        return invoke(
          KIRA_AUDIO_COMMANDS.PLAY_INSTANCE,
          buildTauriKiraAudioPayload(KIRA_AUDIO_COMMANDS.PLAY_INSTANCE, payload)
        );
      }).catch(function (e) {
        emitError('play_instance(' + payload.assetId + '/' + payload.voiceId + ')', e);
        throw e;
      });
    },

    stop(arg) {
      var id = resolveClipId(arg);
      if (id) return ensureRuntimeMode({ audioManager: false }).then(function () {
        return invoke('audio_stop', { id: id });
      }).catch(function (e) {
        emitError('stop(' + id + ')', e);
        throw e;
      });
      return false;
    },

    stop_instance(arg) {
      var payload = normalizeKiraStopInstancePayload(arg);
      if (payload.voiceId) return ensureRuntimeMode({ audioManager: false }).then(function () {
        return invoke(
          KIRA_AUDIO_COMMANDS.STOP_INSTANCE,
          buildTauriKiraAudioPayload(KIRA_AUDIO_COMMANDS.STOP_INSTANCE, payload)
        );
      }).catch(function (e) {
        emitError('stop_instance(' + payload.voiceId + ')', e);
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
      return ensureRuntimeMode({ audioManager: true }).then(function () {
        return invoke('audio_stop', { id: id });
      })
        .then(function () {
          return invoke('audio_play', { id: id });
        })
        .catch(function (e) {
          emitError('jump(' + id + ')', e);
          throw e;
        });
    },

    set_param(arg) {
      if (!arg) return;
      var id = resolveClipId(arg);
      if (!id) return;
      if (arg.paramId === 'volume' || arg.paramId === 'gain') {
        return ensureRuntimeMode({ audioManager: false }).then(function () {
          return invoke('audio_set_volume', { id: id, db: arg.value || 0 });
        }).catch(function (e) {
          emitError('set_volume(' + id + ')', e);
          throw e;
        });
      } else if (arg.paramId === 'playback_rate' || arg.paramId === 'speed') {
        return ensureRuntimeMode({ audioManager: false }).then(function () {
          return invoke('audio_set_playback_rate', { id: id, rate: arg.value || 1 });
        }).catch(function (e) {
          emitError('set_playback_rate(' + id + ')', e);
          throw e;
        });
      }
      return false;
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
    var runtime = resolveAudioRuntime(window);
    if (runtime.playback === 'web_wasm_kira') {
      audio.set_backend('kira');
      return;
    }
    backend.init().then(function () {
      audio.set_backend('kira');
    }).catch(function () { });
  });
})();
