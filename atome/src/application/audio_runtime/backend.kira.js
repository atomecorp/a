import {
  buildTauriKiraAudioPayload,
  KIRA_AUDIO_COMMANDS,
  normalizeKiraPlayInstancePayload,
  normalizeKiraVoiceEnvelope,
  normalizeKiraStopInstancePayload
} from './kira_audio_commands.js';
import {
  getTauriInvoke,
  isIosHostAppRuntime,
  resolveAudioRuntime
} from './runtime_audio_backend.js';
import { createKiraClipMeta, isAuv3NativeRuntime, postAuv3LocalClipLoad } from './kira_backend_support.js';
import { createKiraLiveMethods } from './kira_live_methods.js';

// Kira backend for Squirrel.av.audio
// Routes audio commands to either Tauri invoke (native) or WASM module (web).
// Replaces legacy HTML/native split backends with a unified CPAL/Kira engine.

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

  function rejectIosHostAppBytesLoad(context) {
    var error = new Error('[backend.kira] iOS host app native playback requires a local media path');
    emitError(context, error);
    return Promise.reject(error);
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
          return fetch('/wasm/squirrel_audio_wasm_bg.wasm')
            .then(function (response) {
              if (!response.ok) throw new Error('kira_wasm_load_failed:' + response.status);
              return response.arrayBuffer();
            })
            .then(function (bytes) {
              mod.initSync({ module: bytes });
            })
            .then(function () {
            wasm = mod;
            return mod;
            });
        });
    }
    return wasmModulePromise;
  }

  // Keep module download/compilation off the interaction path. Creating the
  // audio manager remains deferred until unlock(), which callers invoke from
  // the real user action that starts playback.
  function prewarmWasmModule() {
    return loadWasmModule().catch(function (error) {
      wasmModulePromise = null;
      wasm = null;
      throw error;
    });
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
          var durationSeconds = Number(wasm.audio_load_clip_from_bytes(id, bytes));
          return {
            success: true,
            duration_seconds: Number.isFinite(durationSeconds) && durationSeconds > 0 ? durationSeconds : null
          };
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

  // Markers and sprites of each clip, kept JS-side (`kira_backend_support.js`).
  var clipMeta = createKiraClipMeta();
  var ensureClipMeta = clipMeta.ensure;

  var backend = {
    prewarm() {
      var runtime = resolveAudioRuntime(window);
      if (runtime.playback !== 'web_wasm_kira') return Promise.resolve();
      return prewarmWasmModule();
    },

    // The touch that plays also wakes an engine asleep (BUG-068).
    unlock() {
      return ensureRuntimeMode({ audioManager: true }).then(function () { return backend.wake(); });
    },

    async init() {
      await backend.unlock();
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
          if (mode === 'wasm' && wasm && typeof wasm.audio_load_clip_from_bytes === 'function') {
            try {
              var durationSeconds = Number(wasm.audio_load_clip_from_bytes(id, bytes));
              return {
                success: true,
                duration_seconds: Number.isFinite(durationSeconds) && durationSeconds > 0 ? durationSeconds : null
              };
            }
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

    // Sample-accurate overdub: the AudioContext the Web engine renders into
    // (recording opens its worklet on it), and the engine's render clock — a
    // promise on the native engine, whose clock also stamps host instants.
    shared_context() { return mode === 'wasm' && wasm && wasmAudioManagerReady ? wasm.audio_shared_context() : null; },
    render_clock() {
      if (mode === 'tauri') return invoke('audio_render_clock', {}).then(function (r) { return r && r.clock ? Object.assign({ host_clock: true }, r.clock) : null; }, function () { return null; });
      return mode === 'wasm' && wasm && wasmAudioManagerReady ? wasm.audio_render_clock() : null;
    },

    // Many voices in one call (one native round trip), each started on its own
    // rendered frame with its loop and envelope; resolves with their start frames.
    schedule_instances(list) {
      var voices = list.map(function (arg) {
        var payload = normalizeKiraPlayInstancePayload(arg);
        var frame = Number(arg && arg.startRenderFrame);
        if (!payload.assetId || !payload.voiceId || !Number.isFinite(frame)) {
          throw new Error('[backend.kira] schedule_instances requires asset, voice and frame');
        }
        return Object.assign(buildTauriKiraAudioPayload(KIRA_AUDIO_COMMANDS.PLAY_INSTANCE, payload),
          { startRenderFrame: Math.max(0, Math.round(frame)), envelope: normalizeKiraVoiceEnvelope(arg.envelope) });
      });
      if (mode === 'tauri') return invoke('audio_schedule_instances', { voices: voices }).then(function (r) { return r.start_render_frames; });
      if (mode !== 'wasm') return Promise.reject(new Error('[backend.kira] sample-accurate scheduling requires a Kira engine'));
      return ensureRuntimeMode({ audioManager: true }).then(function () {
        return Array.from(wasm.audio_schedule_voices(voices));
      });
    },

    // A late end for a scheduled or sounding voice (frames of its own count).
    set_voice_end(arg) {
      var voiceId = String((arg && (arg.voiceId || arg.voice_id)) || '');
      var endFrame = Math.max(0, Math.round(Number(arg && arg.endFrame) || 0));
      var releaseFrames = Math.max(0, Math.round(Number(arg && arg.releaseFrames) || 0));
      if (mode === 'tauri') return invoke('audio_set_voice_end', { voiceId: voiceId, endFrame: endFrame, releaseFrames: releaseFrames });
      return mode === 'wasm' && wasm && wasmAudioManagerReady ? wasm.audio_set_voice_end(voiceId, endFrame, releaseFrames) : false;
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

    // Mixer graph (atome-mix-graph): program compiled from the canonical timeline mix.
    mix_apply(program) {
      return ensureRuntimeMode({ audioManager: true }).then(function () {
        if (mode === 'wasm') return wasm.audio_mix_apply(program);
        return invoke('audio_mix_apply', { program: program }).then(function (r) { return r && r.strips; });
      });
    },

    mix_levels() {
      if (mode === 'wasm') return wasm && wasmAudioManagerReady ? Promise.resolve(Array.from(wasm.audio_mix_levels())) : Promise.resolve([]);
      return invoke('audio_mix_levels', {}).then(function (r) { return (r && r.levels) || []; });
    },

    mix_cut_tail(moduleId) {
      return ensureRuntimeMode({ audioManager: true }).then(function () {
        return mode === 'wasm' ? wasm.audio_mix_cut_tail(moduleId) : invoke('audio_mix_cut_tail', { moduleId: moduleId });
      });
    },

    // A capture (.nam) or an impulse response for the `dsp` modules naming
    // `assetId`. Native reads `path` itself; the Web engine takes the decoded
    // data: `capture` (the .nam text) or `impulse` { left, right, sampleRate }.
    mix_asset_load(arg) {
      var assetId = String((arg && arg.assetId) || '');
      if (!assetId) return Promise.reject(new Error('mix_asset_load needs an assetId'));
      return ensureRuntimeMode({ audioManager: true }).then(function () {
        if (mode !== 'wasm') return invoke('audio_mix_asset_load', { assetId: assetId, path: String(arg.path || '') });
        if (typeof arg.capture === 'string') return wasm.audio_mix_asset_load_capture(assetId, arg.capture);
        if (arg.impulse && arg.impulse.left) {
          var impulse = arg.impulse;
          return wasm.audio_mix_asset_load_impulse(assetId, Float32Array.from(impulse.left), impulse.right ? Float32Array.from(impulse.right) : undefined, Number(impulse.sampleRate));
        }
        throw new Error('mix_asset_load on the Web needs a capture or an impulse');
      });
    },

    mix_asset_unload(assetId) {
      return ensureRuntimeMode({ audioManager: true }).then(function () {
        return mode === 'wasm' ? wasm.audio_mix_asset_unload(String(assetId)) : invoke('audio_mix_asset_unload', { assetId: String(assetId) });
      });
    },

    // The real inputs and outputs a strip can use. Web: the destination's
    // channels and the browser's audio inputs; native: the engine's devices.
    mix_output_devices() {
      return ensureRuntimeMode({ audioManager: false }).then(function () {
        if (mode !== 'wasm') return invoke('audio_mix_devices', {}).then(function (r) { return (r && r.devices) || { outputs: [], inputs: [] }; });
        var context = wasm && wasmAudioManagerReady ? wasm.audio_shared_context() : null;
        var outputs = context ? [{ id: 'default', name: '', channels: Number(context.destination.maxChannelCount) || 2, isDefault: true }] : [];
        var media = window.navigator && window.navigator.mediaDevices;
        if (!media || typeof media.enumerateDevices !== 'function') return Promise.resolve({ outputs: outputs, inputs: [] });
        return media.enumerateDevices().then(function (devices) {
          return { outputs: outputs, inputs: devices.filter(function (device) { return device.kind === 'audioinput'; })
            .map(function (device) { return { id: device.deviceId || 'default', name: device.label || '', channels: 2 }; }) };
        });
      });
    },

    mix_live_push(arg) {
      if (mode !== 'wasm' || !wasm || !wasmAudioManagerReady || !arg) return false;
      wasm.audio_mix_live_push(String(arg.deviceId || ''), arg.pcm);
      return true;
    },

    mix_module_state(moduleId) {
      if (mode === 'wasm') return Promise.resolve(wasm && wasmAudioManagerReady ? wasm.audio_mix_module_state(moduleId) : null);
      return invoke('audio_mix_module_state', { moduleId: moduleId }).then(function (r) { return r ? r.state : null; });
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
      } else if (arg.paramId === 'pan' || arg.paramId === 'panning') {
        return ensureRuntimeMode({ audioManager: false }).then(function () {
          return invoke('audio_set_pan', { id: id, pan: Number(arg.value) || 0 });
        }).catch(function (e) {
          emitError('set_pan(' + id + ')', e);
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

    ...clipMeta.methods,
    ...createKiraLiveMethods({ invoke, ensureRuntimeMode, readWasm: () => (mode === 'wasm' ? wasm : null),
      readEngine: () => (mode === 'wasm' && wasmAudioManagerReady ? wasm : null) }),

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
      return backend.prewarm().catch(function (error) {
        emitError('wasm_prewarm', error);
      });
    }
    backend.init().then(function () {
      audio.set_backend('kira');
    }).catch(function () { });
  });
})();
