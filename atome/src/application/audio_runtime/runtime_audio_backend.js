const readHostEnv = (env) => String(env?.__HOST_ENV || '').trim().toLowerCase();

export const hasSwiftBridge = (env = globalThis) => !!(
    env?.webkit?.messageHandlers?.swiftBridge
    || env?.webkit?.messageHandlers?.squirrel
    || env?.webkit?.messageHandlers?.callback
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
    return playback === 'tauri_native_kira'
        || playback === 'ios_native_kira'
        || playback === 'ios_auv3_native';
};

export const isAuv3AudioRuntime = (env = globalThis) => {
    const hostEnv = readHostEnv(env);
    // Only match when the native host explicitly declares AUv3 mode.
    // hasSwiftBridge alone is NOT sufficient — the standalone iOS app
    // also exposes webkit.messageHandlers.swiftBridge but is NOT an AUv3.
    if (hostEnv === 'app') return false;
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
    if (isIosHostAppRuntime(env)) return false;
    if (hostEnv === 'app') return false;
    if (protocol === 'tauri:' || protocol === 'asset:' || protocol === 'ipc:' || protocol === 'atome:') return true;
    if (host === 'tauri.localhost') return true;
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
    const nativeKiraRequired = isAuv3AudioRuntime(env)
        || isIosHostAppRuntime(env)
        || isTauriAudioRuntime(env);
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
            hasSwiftBridge: false,
            tauriInvoke,
            native_kira_required: true
        };
    }

    if (isTauriAudioRuntime(env)) {
        return {
            runtime: 'tauri_native',
            playback: 'unsupported',
            record: 'unsupported',
            preferredFacadeBackendOrder: ['kira'],
            hasSwiftBridge: false,
            tauriInvoke: null,
            native_kira_required: true
        };
    }

    if (isIosHostAppRuntime(env)) {
        if (tauriInvoke) {
            return {
                runtime: 'ios_app',
                playback: 'ios_native_kira',
                record: 'ios_native_kira',
                preferredFacadeBackendOrder: ['kira'],
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
            hasSwiftBridge: false,
            tauriInvoke: null
        };
    }

    return {
        runtime: 'unknown',
        playback: 'unsupported',
        record: 'unsupported',
        preferredFacadeBackendOrder: [],
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
        return 'native_audio_recorder';
    }
    if (runtime.record === 'web_capture') {
        return 'web_capture_recorder';
    }
    return 'unsupported';
};

export const isNativeKiraPlayback = (env = globalThis) => (
    isNativeKiraPlaybackValue(resolveAudioRuntime(env)?.playback)
);

export const isStrictNativeKiraPlaybackRuntime = (env = globalThis) => (
    isNativeKiraPlayback(env)
    || isIosHostAppRuntime(env)
    || isAuv3AudioRuntime(env)
    || isTauriAudioRuntime(env)
);

export const resolveNativeMediaLocalPath = (...values) => {
    for (const value of values) {
        const raw = String(value ?? '').trim();
        if (!raw || raw.startsWith('blob:') || raw.startsWith('data:')) continue;
        const decoded = (() => {
            try { return decodeURIComponent(raw); }
            catch (_) { return raw; }
        })();
        if (/^(?:\/var\/|\/private\/var\/|data\/users\/|recordings\/)/i.test(decoded)) {
            return decoded;
        }
        if (/^\//.test(decoded) && !/^\/api\//i.test(decoded)) {
            return decoded;
        }
        if (!/^[a-z][a-z0-9+.-]*:/i.test(decoded) && /^[^?#]+\.[a-z0-9]{2,8}$/i.test(decoded)) {
            return decoded.replace(/^\/+/, '');
        }
        let parsed = null;
        try {
            parsed = new URL(raw, 'atome:///');
        } catch (_) {
            parsed = null;
        }
        const pathname = parsed ? String(parsed.pathname || '').trim() : raw;
        const normalizedPath = (() => {
            try { return decodeURIComponent(pathname); }
            catch (_) { return pathname; }
        })()
            .replace(/^file:\/\/\/file\//i, '')
            .replace(/^file:\/\//i, '')
            .replace(/^\/file\//i, '')
            .replace(/^file\//i, '');
        if (/^(?:\/var\/|\/private\/var\/|data\/users\/|recordings\/)/i.test(normalizedPath)) {
            return normalizedPath;
        }
        if (/^\//.test(normalizedPath) && !/^\/api\//i.test(normalizedPath)) {
            return normalizedPath;
        }
        if (!/^[a-z][a-z0-9+.-]*:/i.test(raw)
            && !/^\/?api\//i.test(normalizedPath)
            && /^[^?#]+\.[a-z0-9]{2,8}$/i.test(normalizedPath)) {
            return normalizedPath.replace(/^\/+/, '');
        }
        if (parsed && parsed.protocol === 'atome:') {
            const atomePath = normalizedPath.replace(/^\/+/, '');
            if (/^api\//i.test(atomePath)) continue;
            if (atomePath) return atomePath;
        }
    }
    return '';
};

export const resolveNativeMediaLocalPathFromObject = (source = {}, extra = {}) => {
    const object = source && typeof source === 'object' ? source : {};
    const meta = object.meta && typeof object.meta === 'object' ? object.meta : {};
    const extras = object.extras && typeof object.extras === 'object' ? object.extras : {};
    const extrasMeta = extras.meta && typeof extras.meta === 'object' ? extras.meta : {};
    const extraObject = extra && typeof extra === 'object' ? extra : {};
    return resolveNativeMediaLocalPath(
        object.native_audio_path,
        object.nativeAudioPath,
        object.local_path,
        object.localPath,
        object.file_path,
        object.filePath,
        object.path_or_bookmark,
        object.pathOrBookmark,
        object.path,
        meta.native_audio_path,
        meta.nativeAudioPath,
        meta.local_path,
        meta.localPath,
        meta.file_path,
        meta.filePath,
        meta.path_or_bookmark,
        meta.pathOrBookmark,
        meta.path,
        extras.native_audio_path,
        extras.nativeAudioPath,
        extras.local_path,
        extras.localPath,
        extras.file_path,
        extras.filePath,
        extras.path_or_bookmark,
        extras.pathOrBookmark,
        extras.path,
        extrasMeta.native_audio_path,
        extrasMeta.nativeAudioPath,
        extrasMeta.local_path,
        extrasMeta.localPath,
        extrasMeta.file_path,
        extrasMeta.filePath,
        extrasMeta.path_or_bookmark,
        extrasMeta.pathOrBookmark,
        extrasMeta.path,
        extraObject.native_audio_path,
        extraObject.nativeAudioPath,
        extraObject.local_path,
        extraObject.localPath,
        extraObject.file_path,
        extraObject.filePath,
        extraObject.path_or_bookmark,
        extraObject.pathOrBookmark,
        extraObject.path
    );
};
