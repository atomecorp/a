const readHostEnv = (env) => String(env?.__HOST_ENV || '').trim().toLowerCase();

export const hasSwiftBridge = (env = globalThis) => !!(
    env?.webkit?.messageHandlers?.swiftBridge
    || env?.webkit?.messageHandlers?.squirrel
    || env?.webkit?.messageHandlers?.callback
);

export const hasIPlugBridge = (env = globalThis) => !!(
    typeof env?.__toDSP === 'function'
    || hasSwiftBridge(env)
);

export const getTauriInvoke = (env = globalThis) => {
    try {
        if (typeof env?.__TAURI_INTERNALS__?.invoke === 'function') {
            return env.__TAURI_INTERNALS__.invoke.bind(env.__TAURI_INTERNALS__);
        }
    } catch (_) { }
    try {
        if (typeof env?.__TAURI__?.invoke === 'function') {
            return env.__TAURI__.invoke.bind(env.__TAURI__);
        }
    } catch (_) { }
    try {
        if (typeof env?.__TAURI__?.core?.invoke === 'function') {
            return env.__TAURI__.core.invoke.bind(env.__TAURI__.core);
        }
    } catch (_) { }
    try {
        if (typeof env?.__ATOME_IOS_NATIVE_INVOKE === 'function') {
            return env.__ATOME_IOS_NATIVE_INVOKE.bind(env);
        }
    } catch (_) { }
    return null;
};

const isNativeKiraPlaybackValue = (value) => {
    const playback = String(value || '').trim().toLowerCase();
    return playback === 'tauri_native_kira' || playback === 'ios_native_kira';
};

export const isAuv3AudioRuntime = (env = globalThis) => {
    const hostEnv = readHostEnv(env);
    // Only match when the native host explicitly declares AUv3 mode.
    // hasSwiftBridge alone is NOT sufficient — the standalone iOS app
    // also exposes webkit.messageHandlers.swiftBridge but is NOT an AUv3.
    return hostEnv === 'auv3'
        || env?.__AUV3_MODE__ === true;
};

export const isIosHostAppRuntime = (env = globalThis) => {
    const hostEnv = readHostEnv(env);
    return hostEnv === 'app' && !isAuv3AudioRuntime(env);
};

export const isTauriAudioRuntime = (env = globalThis) => {
    if (env?.__SQUIRREL_FORCE_FASTIFY__ === true) return false;
    if (isAuv3AudioRuntime(env)) return false;
    if (env?.__SQUIRREL_FORCE_TAURI_RUNTIME__ === true) return true;
    const tauriInvoke = getTauriInvoke(env);
    const protocol = String(env?.location?.protocol || '').toLowerCase();
    const host = String(env?.location?.hostname || '').toLowerCase();
    const hostEnv = readHostEnv(env);
    if (protocol === 'tauri:' || protocol === 'asset:' || protocol === 'ipc:' || protocol === 'atome:') return true;
    if (host === 'tauri.localhost') return true;
    if (isIosHostAppRuntime(env)) return false;
    if (hostEnv === 'app') return false;
    return !!tauriInvoke;
};

export const describeAudioRuntimeEnvironment = (env = globalThis) => {
    const hostEnv = readHostEnv(env);
    const hasTauriInternalsInvoke = (() => {
        try { return typeof env?.__TAURI_INTERNALS__?.invoke === 'function'; }
        catch (_) { return false; }
    })();
    const hasTauriInvoke = (() => {
        try { return typeof env?.__TAURI__?.invoke === 'function'; }
        catch (_) { return false; }
    })();
    const hasTauriCoreInvoke = (() => {
        try { return typeof env?.__TAURI__?.core?.invoke === 'function'; }
        catch (_) { return false; }
    })();
    const tauriInvokeAvailable = typeof getTauriInvoke(env) === 'function';
    const nativeKiraRequired = isAuv3AudioRuntime(env) || isIosHostAppRuntime(env);
    const nativeKiraAvailable = isAuv3AudioRuntime(env)
        || ((isTauriAudioRuntime(env) || isIosHostAppRuntime(env)) && tauriInvokeAvailable);
    const nativeKiraMissingReason = (() => {
        if (!nativeKiraRequired || nativeKiraAvailable) return null;
        if (isIosHostAppRuntime(env) && !tauriInvokeAvailable) {
            return hasSwiftBridge(env)
                ? 'ios_app_missing_native_invoke_swiftbridge_only'
                : 'ios_app_missing_native_invoke';
        }
        if (isAuv3AudioRuntime(env) && !hasSwiftBridge(env)) {
            return 'auv3_missing_swift_bridge';
        }
        return 'native_kira_backend_unavailable';
    })();
    return {
        host_env: hostEnv || null,
        auv3_mode: env?.__AUV3_MODE__ === true,
        force_fastify: env?.__SQUIRREL_FORCE_FASTIFY__ === true,
        force_tauri: env?.__SQUIRREL_FORCE_TAURI_RUNTIME__ === true,
        tauri_invoke_available: tauriInvokeAvailable,
        has_tauri_internals_invoke: hasTauriInternalsInvoke,
        has_tauri_invoke: hasTauriInvoke,
        has_tauri_core_invoke: hasTauriCoreInvoke,
        has_tauri_object: !!env?.__TAURI__,
        has_tauri_internals_object: !!env?.__TAURI_INTERNALS__,
        has_swift_bridge: hasSwiftBridge(env),
        has_iplug_bridge: hasIPlugBridge(env),
        is_auv3_audio_runtime: isAuv3AudioRuntime(env),
        is_ios_host_app_runtime: isIosHostAppRuntime(env),
        is_tauri_audio_runtime: isTauriAudioRuntime(env),
        native_kira_required: nativeKiraRequired,
        native_kira_available: nativeKiraAvailable,
        native_kira_missing_reason: nativeKiraMissingReason
    };
};

export const resolveAudioRuntime = (env = globalThis) => {
    const tauriInvoke = getTauriInvoke(env);
    const wasmAvailable = typeof env?.WebAssembly !== 'undefined';
    const hasWebCapture = !!env?.navigator?.mediaDevices?.getUserMedia;

    if (isAuv3AudioRuntime(env)) {
        return {
            runtime: 'ios_auv3',
            playback: 'ios_auv3_native',
            record: 'ios_auv3_native',
            preferredFacadeBackendOrder: ['kira'],
            hasIPlugBridge: hasIPlugBridge(env),
            hasSwiftBridge: hasSwiftBridge(env),
            tauriInvoke: null,
            native_kira_required: true
        };
    }

    if (isTauriAudioRuntime(env) && tauriInvoke) {
        return {
            runtime: 'tauri_native',
            playback: 'tauri_native_kira',
            record: 'tauri_native_kira',
            preferredFacadeBackendOrder: ['kira'],
            hasIPlugBridge: hasIPlugBridge(env),
            hasSwiftBridge: false,
            tauriInvoke
        };
    }

    if (isIosHostAppRuntime(env)) {
        if (tauriInvoke) {
            return {
                runtime: 'ios_app',
                playback: 'ios_native_kira',
                record: 'ios_native_kira',
                preferredFacadeBackendOrder: ['kira'],
                hasIPlugBridge: hasIPlugBridge(env),
                hasSwiftBridge: hasSwiftBridge(env),
                tauriInvoke,
                native_kira_required: true
            };
        }
        return {
            runtime: 'ios_app',
            playback: 'unsupported',
            record: 'unsupported',
            preferredFacadeBackendOrder: ['kira'],
            hasIPlugBridge: hasIPlugBridge(env),
            hasSwiftBridge: hasSwiftBridge(env),
            tauriInvoke: null,
            native_kira_required: true
        };
    }

    if (wasmAvailable || hasWebCapture) {
        return {
            runtime: 'web',
            playback: wasmAvailable ? 'web_wasm_kira' : 'unsupported',
            record: hasWebCapture ? 'web_capture' : 'unsupported',
            preferredFacadeBackendOrder: wasmAvailable ? ['kira'] : [],
            hasIPlugBridge: hasIPlugBridge(env),
            hasSwiftBridge: false,
            tauriInvoke: null
        };
    }

    return {
        runtime: 'unknown',
        playback: 'unsupported',
        record: 'unsupported',
        preferredFacadeBackendOrder: [],
        hasIPlugBridge: hasIPlugBridge(env),
        hasSwiftBridge: hasSwiftBridge(env),
        tauriInvoke: null
    };
};

export const resolveVoiceCaptureProvider = (env = globalThis) => {
    const explicit = String(env?.__SQUIRREL_RECORD_PROVIDER__ || '').trim().toLowerCase();
    if (explicit) return explicit;
    const runtime = resolveAudioRuntime(env);
    if (runtime.record === 'tauri_native_kira'
        || runtime.record === 'ios_auv3_native'
        || runtime.record === 'ios_native_kira') {
        return 'iplug_native_recorder';
    }
    if (runtime.record === 'web_capture') {
        return 'web_capture_recorder';
    }
    return 'unsupported';
};

export const isNativeKiraPlayback = (env = globalThis) => (
    isNativeKiraPlaybackValue(resolveAudioRuntime(env)?.playback)
);

// ─── AUv3 host-routed media playback helpers ────────────────────────
// These must be used instead of HTMLMediaElement.play() in AUv3 so that
// audio goes through the host render callback (mixer) instead of the
// iOS device speaker.
//
// Strategy: keep the WebView media element muted/visual-only and send a native
// playback command to Swift. Decoding and audio rendering happen in the host.

const _getAuv3Bridge = (env = globalThis) => {
    if (!isAuv3AudioRuntime(env) || !hasSwiftBridge(env)) return null;
    return env.webkit?.messageHandlers?.swiftBridge || null;
};

export const shouldUseAuv3HostPlayback = (env = globalThis) => !!_getAuv3Bridge(env);

// ─── Native command-based AUv3 playback ─────────────────────────────
// Audio is decoded and played entirely by the Swift native engine
// (loadLocalFile → decodeFile → internalRenderBlock) which runs
// independently of the WebView. The JS side only sends commands.
//
// This ensures audio continues when the AUv3 window is closed.

/**
 * Extract the relative audio path from an atome:// URL.
 * Handles:
 *   atome:///audio/Alive.m4a  → "Alive.m4a"
 *   atome://audio/Alive.m4a   → "Alive.m4a"
 *   /audio/subfolder/file.wav → "subfolder/file.wav"
 *   https://server/files/x.mp3 → null (not a local file)
 */
const _extractRelativePath = (src) => {
    if (!src) return null;
    const str = String(src).trim();
    // Only handle atome:// scheme (local files)
    if (!str.startsWith('atome:')) return null;

    try {
        const url = new URL(str);
        let path = url.pathname || '';
        // atome:///audio/X → pathname = "/audio/X"
        // atome://audio/X → host = "audio", pathname = "/X"
        if (url.host === 'audio' && path.length > 1) {
            return path.slice(1); // Remove leading /
        }
        if (path.startsWith('/audio/')) {
            return path.slice('/audio/'.length);
        }
        if (path.startsWith('/api/recordings/')) {
            return `recordings/${decodeURIComponent(path.slice('/api/recordings/'.length))}`;
        }
        if (path.startsWith('/api/uploads/')) {
            return decodeURIComponent(path.slice('/api/uploads/'.length));
        }
        if (path.startsWith('/')) path = path.slice(1);
        if (path.startsWith('api/recordings/')) {
            return `recordings/${decodeURIComponent(path.slice('api/recordings/'.length))}`;
        }
        if (path.startsWith('api/uploads/')) {
            return decodeURIComponent(path.slice('api/uploads/'.length));
        }
        return path || null;
    } catch (_) {
        // URL parse failed; try regex
        const m = str.match(/^atome:\/{2,3}(?:audio\/)?(.+)/);
        return m ? m[1] : null;
    }
};

/**
 * Extract a playable filename from any source URL or API path.
 * Handles:
 *   /api/uploads/Evolution_2.wav       → "Evolution_2.wav"
 *   /api/recordings/take_01.m4a        → "take_01.m4a"
 *   blob:atome://xxx                   → null (check dataset)
 *   http://127.0.0.1:62740/api/uploads/file.wav → "file.wav"
 *   data/users/xxx/Downloads/file.wav  → "file.wav"
 */
const _extractFilenameFromSource = (src) => {
    if (!src) return null;
    const str = String(src).trim();
    if (!str || str.startsWith('blob:') || str.startsWith('data:')) return null;
    // Match /api/uploads/<name> or /api/recordings/<name>
    const apiMatch = str.match(/\/api\/(?:uploads|recordings)\/([^?#]+)/i);
    if (apiMatch) {
        try { return decodeURIComponent(apiMatch[1]); } catch (_) { return apiMatch[1]; }
    }
    // Last path segment for data/users/... paths
    const parts = str.split('/').filter(Boolean);
    const last = parts[parts.length - 1];
    if (last && /\.\w{2,5}$/i.test(last)) {
        try { return decodeURIComponent(last); } catch (_) { return last; }
    }
    return null;
};

export const auv3PlayMedia = (node, env = globalThis) => {
    const bridge = _getAuv3Bridge(env);
    if (!bridge || !node) return false;

    const src = String(node.currentSrc || node.src || '').trim();
    const stableSource = String(node?.dataset?.eveMediaSource || '').trim();

    // 1) Try atome:// scheme direct path (e.g. atome:///audio/file.wav)
    let relativePath = _extractRelativePath(src);

    // 2) If src is a blob/http URL, extract filename from the stable source
    if (!relativePath && stableSource) {
        const filename = _extractFilenameFromSource(stableSource);
        if (filename) relativePath = filename;
    }

    // 3) Last resort: try to extract filename from the src itself
    if (!relativePath) {
        const filename = _extractFilenameFromSource(src);
        if (filename) relativePath = filename;
    }

    const tagName = String(node.tagName || '').toLowerCase();

    // For video elements: play muted in WebView for visual display
    if (tagName === 'video') {
        try { node.muted = true; } catch (_) { }
        try { node.play().catch(() => { }); } catch (_) { }
    } else {
        // For audio elements: mute and play silently so that
        // clip.media.paused becomes false (prevents repeated
        // requestClipMediaPlay / loadAndPlay calls each frame).
        try { node.muted = true; } catch (_) { }
        try { node.volume = 0; } catch (_) { }
        try { node.play().catch(() => { }); } catch (_) { }
    }

    if (relativePath) {
        // Send the file path/name to Swift for native decode + auto-play
        bridge.postMessage({
            action: 'loadAndPlay',
            relativePath: relativePath
        });
    } else {
        // No identifiable source: toggle play state directly
        // Swift will play whatever file is already loaded, or test tone
        bridge.postMessage({ type: 'param', id: 'play', value: 1 });
    }

    return true;
};

export const auv3StopMedia = (env = globalThis) => {
    const bridge = _getAuv3Bridge(env);
    if (!bridge) return false;
    bridge.postMessage({ type: 'param', id: 'play', value: 0 });
    return true;
};

export const auv3StopSlot = (slotId, env = globalThis) => {
    const bridge = _getAuv3Bridge(env);
    if (!bridge || !slotId) return false;
    bridge.postMessage({ action: 'stopSlot', slotId: String(slotId) });
    return true;
};

export const auv3ClearAuxSlots = (env = globalThis) => {
    const bridge = _getAuv3Bridge(env);
    if (!bridge) return false;
    bridge.postMessage({ action: 'clearAuxSlots' });
    return true;
};

export const auv3StopNode = (node) => {
    // No JS-side sources to stop — playback is fully native.
    // Mute the HTML element if it was playing (video)
    if (node) {
        try { node.pause(); } catch (_) { }
    }
};
