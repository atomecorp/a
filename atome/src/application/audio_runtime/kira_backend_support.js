import { resolveAudioRuntime } from './runtime_audio_backend.js';

// Pieces of the Kira backend (`backend.kira.js`) that hold no engine state:
// the AUv3 extension's local media paths, and the markers kept for each clip.

export function isAuv3NativeRuntime() {
  var runtime = resolveAudioRuntime(window);
  return runtime.playback === 'ios_auv3_native' || runtime.record === 'ios_auv3_native' || runtime.runtime === 'ios_auv3';
}

// A media path the AUv3 extension can open from the app group: blob, data and
// remote sources have none.
export function normalizeAuv3LocalPath(source) {
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

export function postAuv3LocalClipLoad(source) {
  var relativePath = normalizeAuv3LocalPath(source);
  var bridge = window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.atome;
  if (!relativePath || !bridge || typeof bridge.postMessage !== 'function') return false;
  bridge.postMessage({
    action: 'loadLocalPath',
    relativePath: relativePath
  });
  return true;
}

// Markers and sprites of each clip (JS-side, synchronized with the facade), and
// the backend commands that edit and read them.
export function createKiraClipMeta() {
  var clipMeta = new Map(); // id -> { markers: Map, sprites: Map }
  function ensure(id) {
    if (!clipMeta.has(id)) {
      clipMeta.set(id, { markers: new Map(), sprites: new Map() });
    }
    return clipMeta.get(id);
  }
  var methods = {
    add_marker(arg) {
      if (!arg || !arg.clip_id || !arg.name) return;
      var meta = ensure(arg.clip_id);
      meta.markers.set(arg.name, { name: arg.name, frame: arg.frame || 0 });
    },

    remove_marker(arg) {
      if (!arg || !arg.clip_id || !arg.name) return;
      var meta = clipMeta.get(arg.clip_id);
      if (meta) meta.markers.delete(arg.name);
    },

    set_marker_follow_actions(arg) {
      if (!arg || !arg.clip_id || !arg.marker) return;
      var meta = ensure(arg.clip_id);
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
    }
  };
  return { ensure: ensure, delete: (id) => clipMeta.delete(id), methods: methods };
}
