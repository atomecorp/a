import {
    hasSwiftBridge,
    isAuv3AudioRuntime
} from './runtime_audio_backend.js';

const getAuv3Bridge = (env = globalThis) => {
    if (!isAuv3AudioRuntime(env) || !hasSwiftBridge(env)) return null;
    return env.webkit?.messageHandlers?.swiftBridge || null;
};

export const shouldUseAuv3HostPlayback = (env = globalThis) => !!getAuv3Bridge(env);

const extractRelativePath = (src) => {
    if (!src) return null;
    const str = String(src).trim();
    if (!str.startsWith('atome:')) return null;

    try {
        const url = new URL(str);
        let path = url.pathname || '';
        if (url.host === 'audio' && path.length > 1) return path.slice(1);
        if (path.startsWith('/audio/')) return path.slice('/audio/'.length);
        if (path.startsWith('/api/recordings/')) {
            return `recordings/${decodeURIComponent(path.slice('/api/recordings/'.length))}`;
        }
        if (path.startsWith('/api/uploads/')) return decodeURIComponent(path.slice('/api/uploads/'.length));
        if (path.startsWith('/')) path = path.slice(1);
        if (path.startsWith('api/recordings/')) {
            return `recordings/${decodeURIComponent(path.slice('api/recordings/'.length))}`;
        }
        if (path.startsWith('api/uploads/')) return decodeURIComponent(path.slice('api/uploads/'.length));
        return path || null;
    } catch (_) {
        const match = str.match(/^atome:\/{2,3}(?:audio\/)?(.+)/);
        return match ? match[1] : null;
    }
};

const extractFilenameFromSource = (src) => {
    if (!src) return null;
    const str = String(src).trim();
    if (!str || str.startsWith('blob:') || str.startsWith('data:')) return null;
    const apiMatch = str.match(/\/api\/(?:uploads|recordings)\/([^?#]+)/i);
    if (apiMatch) {
        try { return decodeURIComponent(apiMatch[1]); } catch (_) { return apiMatch[1]; }
    }
    const parts = str.split('/').filter(Boolean);
    const last = parts[parts.length - 1];
    if (last && /\.\w{2,5}$/i.test(last)) {
        try { return decodeURIComponent(last); } catch (_) { return last; }
    }
    return null;
};

const resolveAuv3PositionNormalized = (node) => {
    const currentTime = Number.isFinite(Number(node?.dataset?.eveAuv3PlaybackTime))
        ? Number(node.dataset.eveAuv3PlaybackTime)
        : Number(node?.currentTime);
    const duration = Number.isFinite(Number(node?.duration)) && Number(node.duration) > 0
        ? Number(node.duration)
        : Number(node?.dataset?.eveAuv3PlaybackDuration);
    if (!Number.isFinite(currentTime) || currentTime < 0) return null;
    if (!Number.isFinite(duration) || duration <= 0) return null;
    return Math.max(0, Math.min(0.999999, currentTime / duration));
};

const playVisualOnlyElement = (node) => {
    const tagName = String(node.tagName || '').toLowerCase();
    if (tagName === 'video') {
        try { node.muted = true; } catch (_) { }
        try { node.play().catch(() => { }); } catch (_) { }
        return;
    }
    try { node.muted = true; } catch (_) { }
    try { node.volume = 0; } catch (_) { }
    try { node.play().catch(() => { }); } catch (_) { }
};

const resolveNativePlaybackPath = (node) => {
    const src = String(node.currentSrc || node.src || '').trim();
    const stableSource = String(node?.dataset?.eveMediaSource || '').trim();
    return extractRelativePath(src)
        || (stableSource ? extractFilenameFromSource(stableSource) : null)
        || extractFilenameFromSource(src);
};

export const auv3PlayMedia = (node, env = globalThis) => {
    const bridge = getAuv3Bridge(env);
    if (!bridge || !node) return false;

    playVisualOnlyElement(node);
    const relativePath = resolveNativePlaybackPath(node);
    if (relativePath) {
        const payload = {
            action: 'loadAndPlay',
            relativePath
        };
        const positionNormalized = resolveAuv3PositionNormalized(node);
        if (positionNormalized != null) payload.positionNormalized = positionNormalized;
        bridge.postMessage(payload);
        return true;
    }

    bridge.postMessage({ type: 'param', id: 'play', value: 1 });
    return true;
};

export const auv3StopMedia = (env = globalThis) => {
    const bridge = getAuv3Bridge(env);
    if (!bridge) return false;
    bridge.postMessage({ type: 'param', id: 'play', value: 0 });
    return true;
};

export const auv3StopSlot = (slotId, env = globalThis) => {
    const bridge = getAuv3Bridge(env);
    if (!bridge || !slotId) return false;
    bridge.postMessage({ action: 'stopSlot', slotId: String(slotId) });
    return true;
};

export const auv3ClearAuxSlots = (env = globalThis) => {
    const bridge = getAuv3Bridge(env);
    if (!bridge) return false;
    bridge.postMessage({ action: 'clearAuxSlots' });
    return true;
};

export const auv3StopNode = (node) => {
    if (!node) return;
    try { node.pause(); } catch (_) { }
};
