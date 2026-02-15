/**
 * UnifiedSync.js
 *
 * Centralized, high-performance WebSocket API for real-time sync and sharing.
 *
 * Design goals:
 * - WebSocket-first communications for sync + sharing.
 * - Offline-first queue with deterministic replay.
 * - Bidirectional sync (Fastify ↔ Tauri) without fallbacks.
 * - Property-level sharing controls and secure direct messaging.
 * - Minimal footprint (single module) with compatibility shims.
 *
 * This module intentionally replaces legacy sync and command modules.
 */

import { shouldIgnoreRealtimePatch, rememberSelfPatch, buildFingerprint, isFromCurrentUser } from './realtime_dedupe.js';
import { TauriAdapter } from './adole.js';

// =============================================================================
// CONSTANTS
// =============================================================================

const DEFAULTS = {
    realtime: {
        heartbeatMs: 30000,
        reconnectBaseMs: 1000,
        reconnectMaxMs: 30000
    },
    rpc: {
        requestTimeoutMs: 15000,
        queueMax: 200,
        queueMaxAgeMs: 5 * 60 * 1000
    },
    auth: {
        authTimeoutMs: 8000
    }
};

const STORAGE_KEYS = {
    clientId: 'squirrel_client_id',
    queue: 'squirrel_sync_queue_v2'
};

// =============================================================================
// UTILITIES
// =============================================================================

const nowIso = () => new Date().toISOString();

const safeJsonParse = (value) => {
    try {
        return JSON.parse(value);
    } catch (_) {
        return null;
    }
};

const getClientId = () => {
    try {
        const cached = localStorage.getItem(STORAGE_KEYS.clientId);
        if (cached) return cached;
        const next = `client_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
        localStorage.setItem(STORAGE_KEYS.clientId, next);
        return next;
    } catch (_) {
        return `client_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    }
};

const isInTauriRuntime = () => {
    if (typeof window === 'undefined') return false;
    if (window.__SQUIRREL_FORCE_FASTIFY__ === true) return false;
    if (window.__SQUIRREL_FORCE_TAURI_RUNTIME__ === true) return true;
    const protocol = window.location?.protocol || '';
    const host = window.location?.hostname || '';
    if (protocol === 'tauri:' || protocol === 'asset:' || protocol === 'ipc:') return true;
    if (host === 'tauri.localhost') return true;
    const hasTauriObjects = !!(window.__TAURI__ || window.__TAURI_INTERNALS__);
    if (hasTauriObjects) return true;
    const userAgent = typeof navigator !== 'undefined' ? String(navigator.userAgent || '') : '';
    return /tauri/i.test(userAgent);
};

const detectRuntime = () => {
    if (typeof window === 'undefined') return 'unknown';
    if (isInTauriRuntime()) return 'tauri';
    if (typeof navigator !== 'undefined' && /electron/i.test(navigator.userAgent || '')) return 'electron';
    return 'browser';
};

const isLocalHostname = (hostname) => hostname === '127.0.0.1' || hostname === 'localhost';

const readLocalTauriHttpPort = () => {
    if (typeof window === 'undefined') return null;
    const allowCustomPort = window.__SQUIRREL_ALLOW_CUSTOM_TAURI_PORT__ === true;
    const forcedPort = Number(window.__SQUIRREL_TAURI_LOCAL_PORT__);
    if (allowCustomPort && Number.isFinite(forcedPort) && forcedPort > 0) {
        return forcedPort;
    }
    if (isInTauriRuntime()) return 3000;
    const raw = window.__ATOME_LOCAL_HTTP_PORT__ || window.ATOME_LOCAL_HTTP_PORT || null;
    const value = Number(raw);
    if (!Number.isFinite(value) || value <= 0) return null;
    return value;
};

const clearFastifyOverrideStorage = () => {
    if (typeof window === 'undefined') return;
    try {
        localStorage.removeItem('squirrel_tauri_fastify_url_override');
    } catch (_) { }
};

const readExpectedFastifyLoopbackPort = () => {
    const raw = window.__SQUIRREL_SERVER_CONFIG__?.fastify?.port ?? 3001;
    let expected = Number(raw);
    if (!Number.isFinite(expected) || expected <= 0) expected = 3001;
    const localPort = readLocalTauriHttpPort();
    if (localPort && expected === localPort) expected = 3001;
    return expected;
};

const isDisallowedFastifyLoopbackPort = (base) => {
    if (typeof base !== 'string' || !base.trim()) return false;
    if (!isInTauriRuntime()) return false;
    if (window.__SQUIRREL_ALLOW_CUSTOM_FASTIFY_LOOPBACK_PORT__ === true) return false;
    try {
        const parsed = new URL(base.trim());
        if (!isLocalHostname(parsed.hostname) && parsed.hostname !== '0.0.0.0') return false;
        const candidatePort = Number(parsed.port || (parsed.protocol === 'https:' ? 443 : 80));
        if (!Number.isFinite(candidatePort) || candidatePort <= 0) return false;
        return candidatePort !== readExpectedFastifyLoopbackPort();
    } catch (_) {
        return false;
    }
};

const isInvalidFastifyHttpBase = (base) => {
    if (typeof base !== 'string' || !base.trim()) return false;
    if (!isInTauriRuntime()) return false;
    if (isDisallowedFastifyLoopbackPort(base)) return true;
    const localPort = readLocalTauriHttpPort();
    if (!localPort) return false;
    try {
        const parsed = new URL(base.trim());
        if (!isLocalHostname(parsed.hostname) && parsed.hostname !== '0.0.0.0') return false;
        const candidatePort = Number(parsed.port || (parsed.protocol === 'https:' ? 443 : 80));
        return Number.isFinite(candidatePort) && candidatePort === localPort;
    } catch (_) {
        return false;
    }
};

const isInvalidFastifyWsUrl = (url) => {
    if (typeof url !== 'string' || !url.trim()) return false;
    const normalized = url.trim()
        .replace(/^wss:/, 'https:')
        .replace(/^ws:/, 'http:');
    return isInvalidFastifyHttpBase(normalized);
};

const resolveFastifyHttpBase = () => {
    if (typeof window === 'undefined') return '';
    const explicit = typeof window.__SQUIRREL_FASTIFY_URL__ === 'string'
        ? window.__SQUIRREL_FASTIFY_URL__.trim()
        : '';
    if (!explicit) return '';
    if (isInvalidFastifyHttpBase(explicit)) {
        clearFastifyOverrideStorage();
        return '';
    }
    return explicit.replace(/\/$/, '');
};

const resolveFastifyWsSyncUrl = () => {
    if (typeof window === 'undefined') return '';

    const explicit = typeof window.__SQUIRREL_FASTIFY_WS_SYNC_URL__ === 'string'
        ? window.__SQUIRREL_FASTIFY_WS_SYNC_URL__.trim()
        : '';
    if (explicit) {
        if (isInvalidFastifyWsUrl(explicit)) {
            clearFastifyOverrideStorage();
            return '';
        }
        return explicit;
    }

    const base = resolveFastifyHttpBase();
    if (!base) return '';

    const resolved = base
        .replace(/^https:/, 'wss:')
        .replace(/^http:/, 'ws:')
        .replace(/\/$/, '') + '/ws/sync';
    if (isInvalidFastifyWsUrl(resolved)) return '';
    return resolved;
};

const resolveFastifyWsApiUrl = () => {
    if (typeof window === 'undefined') return '';

    const explicit = typeof window.__SQUIRREL_FASTIFY_WS_API_URL__ === 'string'
        ? window.__SQUIRREL_FASTIFY_WS_API_URL__.trim()
        : '';
    if (explicit) {
        if (isInvalidFastifyWsUrl(explicit)) {
            clearFastifyOverrideStorage();
            return '';
        }
        return explicit;
    }

    const base = resolveFastifyHttpBase();
    if (!base) return '';

    const resolved = base
        .replace(/^https:/, 'wss:')
        .replace(/^http:/, 'ws:')
        .replace(/\/$/, '') + '/ws/api';
    if (isInvalidFastifyWsUrl(resolved)) return '';
    return resolved;
};

const resolveTauriWsApiUrl = () => {
    if (typeof window === 'undefined') return '';
    if (!isInTauriRuntime()) return '';
    const port = readLocalTauriHttpPort();
    if (!port) return '';
    return `ws://127.0.0.1:${port}/ws/api`;
};

const getFastifyToken = () => {
    try {
        // Check if Fastify is pointing to local server (127.0.0.1 or localhost)
        const fastifyBase = resolveFastifyHttpBase();
        const isLocalFastify = fastifyBase && (
            fastifyBase.includes('127.0.0.1') ||
            fastifyBase.includes('localhost') ||
            fastifyBase.includes('0.0.0.0')
        );

        // Use local_auth_token for local Fastify, cloud_auth_token for cloud
        if (isLocalFastify) {
            const local = localStorage.getItem('local_auth_token');
            if (local) return local;
            // Fallback to cloud token if local not available
        }

        const cloud = localStorage.getItem('cloud_auth_token');
        if (cloud) return cloud;
        const legacy = localStorage.getItem('auth_token');
        if (legacy) {
            localStorage.setItem('cloud_auth_token', legacy);
            return legacy;
        }
        return '';
    } catch (_) {
        return '';
    }
};

const getTauriToken = () => {
    try {
        return localStorage.getItem('local_auth_token') || '';
    } catch (_) {
        return '';
    }
};

const getCurrentUserId = () => {
    try {
        if (window.AdoleAPI?.auth?.getCurrentInfo) {
            const info = window.AdoleAPI.auth.getCurrentInfo();
            return info?.user_id || info?.atome_id || info?.id || null;
        }
    } catch (_) { }
    return null;
};

const readQueue = () => {
    try {
        const raw = localStorage.getItem(STORAGE_KEYS.queue);
        const parsed = safeJsonParse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
        return [];
    }
};

const writeQueue = (queue) => {
    try {
        localStorage.setItem(STORAGE_KEYS.queue, JSON.stringify(queue));
    } catch (_) { }
};

const MIRROR_CREATE_TTL_MS = 5000;
const mirrorCreateSeen = new Map();

const shouldSkipMirrorCreate = (atomeId) => {
    if (!atomeId) return true;
    const now = Date.now();
    for (const [id, ts] of mirrorCreateSeen.entries()) {
        if (now - ts > MIRROR_CREATE_TTL_MS) mirrorCreateSeen.delete(id);
    }
    const ts = mirrorCreateSeen.get(atomeId);
    return typeof ts === 'number' && (now - ts) <= MIRROR_CREATE_TTL_MS;
};

const rememberMirrorCreate = (atomeId) => {
    if (!atomeId) return;
    mirrorCreateSeen.set(atomeId, Date.now());
};

const isAlreadyExistsError = (payload) => {
    if (!payload) return false;
    if (payload.alreadyExists === true) return true;
    const msg = String(payload.error || payload.message || payload).toLowerCase();
    return msg.includes('already') || msg.includes('exists') || msg.includes('registered');
};

// =============================================================================
// GENERIC WEBSOCKET CLIENT
// =============================================================================

class WsClient {
    constructor(options = {}) {
        this.purpose = options.purpose || 'generic';
        this.resolveUrl = typeof options.resolveUrl === 'function' ? options.resolveUrl : () => options.url || '';
        this.heartbeatMs = options.heartbeatMs || DEFAULTS.realtime.heartbeatMs;
        this.reconnectBaseMs = options.reconnectBaseMs || DEFAULTS.realtime.reconnectBaseMs;
        this.reconnectMaxMs = options.reconnectMaxMs || DEFAULTS.realtime.reconnectMaxMs;
        this.requestTimeoutMs = options.requestTimeoutMs || DEFAULTS.rpc.requestTimeoutMs;
        this.queueMax = options.queueMax || DEFAULTS.rpc.queueMax;
        this.queueMaxAgeMs = options.queueMaxAgeMs || DEFAULTS.rpc.queueMaxAgeMs;

        this.socket = null;
        this.state = {
            connected: false,
            connecting: false,
            endpoint: null,
            lastError: null,
            reconnectDelayMs: this.reconnectBaseMs
        };

        this.listeners = new Set();
        this.pending = new Map();
        this.queue = [];
        this.heartbeatTimer = null;
        this.reconnectTimer = null;
    }

    getState() {
        return { ...this.state };
    }

    connect() {
        if (this.state.connecting || this.state.connected) return;

        const url = this.resolveUrl();
        this.state.endpoint = url;

        if (!url) {
            this.state.lastError = 'missing-endpoint';
            this.scheduleReconnect();
            return;
        }

        this.state.connecting = true;
        try {
            this.socket = new WebSocket(url);
        } catch (error) {
            this.state.connecting = false;
            this.state.lastError = error?.message || 'connection-failed';
            this.scheduleReconnect();
            return;
        }

        this.socket.addEventListener('open', () => this.onOpen());
        this.socket.addEventListener('message', (event) => this.onMessage(event));
        this.socket.addEventListener('close', (event) => this.onClose(event));
        this.socket.addEventListener('error', () => this.onError());
    }

    disconnect(reason = 'client') {
        this.stopHeartbeat();
        this.clearReconnectTimer();
        if (this.socket) {
            try {
                this.socket.close(1000, reason);
            } catch (_) { }
        }
        this.socket = null;
        this.state.connected = false;
        this.state.connecting = false;
    }

    onOpen() {
        this.state.connected = true;
        this.state.connecting = false;
        this.state.lastError = null;
        this.state.reconnectDelayMs = this.reconnectBaseMs;
        this.startHeartbeat();
        this.flushQueue();
        this.emit({ type: 'connected', endpoint: this.state.endpoint });
    }

    onClose(event) {
        const wasConnected = this.state.connected;
        this.state.connected = false;
        this.state.connecting = false;
        if (wasConnected) {
            this.emit({ type: 'disconnected', code: event?.code, reason: event?.reason || 'closed' });
        }
        this.stopHeartbeat();
        this.scheduleReconnect();
    }

    onError() {
        this.state.lastError = 'socket-error';
        this.stopHeartbeat();
        this.scheduleReconnect();
    }

    startHeartbeat() {
        this.stopHeartbeat();
        if (!this.heartbeatMs) return;
        this.heartbeatTimer = setInterval(() => {
            if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
            try {
                this.socket.send(JSON.stringify({ type: 'ping', timestamp: Date.now() }));
            } catch (_) { }
        }, this.heartbeatMs);
    }

    stopHeartbeat() {
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = null;
        }
    }

    scheduleReconnect() {
        if (this.reconnectTimer) return;
        const delay = Math.min(this.state.reconnectDelayMs, this.reconnectMaxMs);
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            this.state.reconnectDelayMs = Math.min(delay * 1.8, this.reconnectMaxMs);
            this.connect();
        }, delay);
    }

    clearReconnectTimer() {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
    }

    onMessage(event) {
        const payload = safeJsonParse(event?.data);
        if (!payload) return;

        const responseId = payload.requestId || payload.id || payload.request_id || null;
        if (responseId && this.pending.has(responseId)) {
            const entry = this.pending.get(responseId);
            if (entry) {
                clearTimeout(entry.timeoutId);
                this.pending.delete(responseId);
                if (payload.success === false || payload.error) {
                    entry.reject(new Error(payload.error || 'request-failed'));
                } else {
                    entry.resolve(payload);
                }
                return;
            }
        }
        if (payload.type === 'event' && payload.eventType) {
            const base = payload.payload && typeof payload.payload === 'object' ? payload.payload : {};
            const eventPayload = {
                ...base,
                type: payload.eventType,
                timestamp: base.timestamp || payload.timestamp || new Date().toISOString()
            };
            this.emit(eventPayload);
            return;
        }

        this.emit(payload);
    }

    emit(payload) {
        for (const listener of this.listeners) {
            try {
                listener(payload);
            } catch (_) { }
        }
    }

    subscribe(listener) {
        if (typeof listener === 'function') {
            this.listeners.add(listener);
        }
        return () => this.listeners.delete(listener);
    }

    send(payload) {
        if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return false;
        try {
            this.socket.send(JSON.stringify(payload));
            return true;
        } catch (_) {
            return false;
        }
    }

    request(payload, options = {}) {
        const requestId = payload.requestId || payload.request_id || payload.id || `req_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
        const timeoutMs = options.timeoutMs || this.requestTimeoutMs;
        const fullPayload = { ...payload, requestId };

        if (this.state.connected && this.socket?.readyState === WebSocket.OPEN) {
            return this.sendRequest(fullPayload, requestId, timeoutMs);
        }

        return this.queueRequest(fullPayload, requestId, timeoutMs);
    }

    sendRequest(payload, requestId, timeoutMs) {
        return new Promise((resolve, reject) => {
            const timeoutId = setTimeout(() => {
                this.pending.delete(requestId);
                reject(new Error('request-timeout'));
            }, timeoutMs);

            this.pending.set(requestId, { resolve, reject, timeoutId });
            const ok = this.send(payload);
            if (!ok) {
                clearTimeout(timeoutId);
                this.pending.delete(requestId);
                reject(new Error('send-failed'));
            }
        });
    }

    queueRequest(payload, requestId, timeoutMs) {
        return new Promise((resolve, reject) => {
            const now = Date.now();
            this.queue = this.queue.filter((item) => now - item.queuedAt < this.queueMaxAgeMs);
            if (this.queue.length >= this.queueMax) {
                reject(new Error('queue-full'));
                return;
            }
            this.queue.push({ payload, requestId, timeoutMs, resolve, reject, queuedAt: now });
            this.connect();
        });
    }

    flushQueue() {
        if (!this.queue.length || !this.state.connected) return;
        const items = [...this.queue];
        this.queue = [];
        items.forEach((item) => {
            this.sendRequest(item.payload, item.requestId, item.timeoutMs)
                .then(item.resolve)
                .catch(item.reject);
        });
    }
}

// =============================================================================
// UNIFIED SYNC STATE
// =============================================================================

const runtime = detectRuntime();
const clientId = getClientId();

const realtimeSocket = new WsClient({
    purpose: 'realtime',
    resolveUrl: resolveFastifyWsSyncUrl,
    heartbeatMs: DEFAULTS.realtime.heartbeatMs,
    reconnectBaseMs: DEFAULTS.realtime.reconnectBaseMs,
    reconnectMaxMs: DEFAULTS.realtime.reconnectMaxMs
});

const fastifyApiSocket = new WsClient({
    purpose: 'fastify-api',
    resolveUrl: resolveFastifyWsApiUrl,
    heartbeatMs: DEFAULTS.realtime.heartbeatMs,
    reconnectBaseMs: DEFAULTS.realtime.reconnectBaseMs,
    reconnectMaxMs: DEFAULTS.realtime.reconnectMaxMs,
    requestTimeoutMs: DEFAULTS.rpc.requestTimeoutMs
});

const tauriApiSocket = new WsClient({
    purpose: 'tauri-api',
    resolveUrl: resolveTauriWsApiUrl,
    heartbeatMs: DEFAULTS.realtime.heartbeatMs,
    reconnectBaseMs: DEFAULTS.realtime.reconnectBaseMs,
    reconnectMaxMs: DEFAULTS.realtime.reconnectMaxMs,
    requestTimeoutMs: DEFAULTS.rpc.requestTimeoutMs
});

const syncQueue = readQueue();

const realtimeState = {
    connected: false,
    serverAvailable: null
};

const realtimeListeners = new Map();

const normalizeAtomePayload = (payload = {}) => {
    const atome = payload.atome || payload.data?.atome || payload.data || payload.record || null;
    const atomeId = payload.atomeId || payload.atome_id || atome?.atome_id || atome?.id || null;
    const properties = atome?.properties || atome?.particles || atome?.data || payload.properties || payload.particles || null;
    return { atome, atomeId, properties };
};

const normalizeOwnershipInfo = (payload, atome) => {
    const ownerId = payload?.owner_id || payload?.ownerId || atome?.owner_id || atome?.ownerId || atome?.owner || null;
    const sharedWith = payload?.shared_with || payload?.sharedWith || atome?.shared_with || atome?.sharedWith || null;
    const isShared = payload?.isShared === true || atome?.isShared === true;
    return { ownerId, sharedWith, isShared };
};

const canMirrorToLocal = ({ ownerId, sharedWith, isShared }, currentUserId) => {
    if (!currentUserId) return false;
    if (ownerId && String(ownerId) === String(currentUserId)) return true;
    if (isShared) return true;
    if (Array.isArray(sharedWith) && sharedWith.some((id) => String(id) === String(currentUserId))) return true;
    if (!ownerId && !sharedWith && !isShared) return true;
    return false;
};

const buildLocalMirrorProps = ({ properties, atomeType, parentId, ownerId }) => {
    if (!properties || typeof properties !== 'object') return null;
    const merged = { ...properties };
    if (atomeType && merged.type == null && merged.atome_type == null && merged.kind == null) {
        merged.type = atomeType;
    }
    if (parentId && merged.parent_id == null && merged.parentId == null) {
        merged.parent_id = parentId;
        merged.parentId = parentId;
    }
    if (ownerId && merged.owner_id == null && merged.ownerId == null) {
        merged.owner_id = ownerId;
        merged.ownerId = ownerId;
    }
    return merged;
};

const mirrorUpdateToLocal = async ({ atomeId, properties, atomeType, parentId, ownerId }) => {
    if (!atomeId || !properties || typeof properties !== 'object') return;
    if (!TauriAdapter?.atome?.update) return;
    const tokenPresent = !!(TauriAdapter?.getToken && TauriAdapter.getToken());
    if (!tokenPresent) return;
    const payload = buildLocalMirrorProps({ properties, atomeType, parentId, ownerId });
    if (!payload) return;
    try {
        await TauriAdapter.atome.update(atomeId, payload);
    } catch (_) { }
};

const mirrorDeleteToLocal = async (atomeId) => {
    if (!atomeId) return;
    if (!TauriAdapter?.atome?.softDelete) return;
    const tokenPresent = !!(TauriAdapter?.getToken && TauriAdapter.getToken());
    if (!tokenPresent) return;
    try {
        await TauriAdapter.atome.softDelete(atomeId);
    } catch (_) { }
};

const coerceStyleValue = (value) => {
    if (value == null) return '';
    if (typeof value === 'number') return `${value}px`;
    return String(value);
};

/**
 * Check if an atome element is currently in local editing mode.
 * When true, we must NOT apply remote patches to avoid destroying the editing state.
 * @param {HTMLElement} el - The atome host element
 * @returns {boolean} True if the element is being edited locally
 */
const isElementInEditMode = (el) => {
    if (!el) return false;
    // Check the host's editing flag
    if (el.dataset?.eveTextEditing === 'true') return true;
    // Check if any child text container is contenteditable and focused
    const textContainer = el.querySelector?.('[data-role="atome-text"]');
    if (textContainer?.isContentEditable) {
        // Check if this element or its children have focus
        const activeEl = document.activeElement;
        if (activeEl === textContainer || textContainer.contains?.(activeEl)) {
            return true;
        }
    }
    return false;
};

/**
 * Extract semantic text content from an atome's text container.
 * Converts browser-generated div/br structures back to plain text with newlines.
 * @param {HTMLElement} textContainer - The [data-role="atome-text"] element
 * @returns {string} Semantic text content with proper line breaks
 */
const extractSemanticText = (textContainer) => {
    if (!textContainer) return '';
    // Clone to avoid modifying the original
    const clone = textContainer.cloneNode(true);
    // Replace <br> with newlines
    clone.querySelectorAll('br').forEach((br) => {
        br.replaceWith('\n');
    });
    // Replace block-level divs with newline + content
    clone.querySelectorAll('div').forEach((div) => {
        const text = div.textContent || '';
        div.replaceWith('\n' + text);
    });
    // Get text and clean up multiple consecutive newlines
    let text = clone.textContent || '';
    // Trim leading newline that may result from first div replacement
    text = text.replace(/^\n/, '');
    return text;
};

/**
 * Apply semantic text content to an atome's text container.
 * Preserves the DOM structure by targeting [data-role="atome-text"] specifically.
 * @param {HTMLElement} hostEl - The atome host element
 * @param {string} textValue - The semantic text content to apply
 */
const applySemanticTextToElement = (hostEl, textValue) => {
    if (!hostEl) return;
    // Find the dedicated text container
    const textContainer = hostEl.querySelector?.('[data-role="atome-text"]');
    if (textContainer) {
        // Apply text only to the text container, preserving other children (resize-handle, etc.)
        textContainer.textContent = String(textValue);
    } else {
        // Fallback: if no text container exists, check if this is a simple text element
        // Only set textContent if there are no special child elements to preserve
        const hasStructuralChildren = hostEl.querySelector?.('[data-role]');
        if (!hasStructuralChildren) {
            hostEl.textContent = String(textValue);
        } else {
            // Element has structural children but no text container - create one
            console.warn('[UnifiedSync] Atome has structural children but no [data-role="atome-text"]. Text not applied to preserve structure.');
        }
    }
};

const applyAtomePatchToDom = (atomeId, properties = {}) => {
    if (!atomeId || typeof document === 'undefined') return;
    const elements = new Set();
    const idCandidates = [
        `atome_${atomeId}`,
        String(atomeId)
    ];
    idCandidates.forEach((id) => {
        const el = document.getElementById(id);
        if (el) elements.add(el);
    });

    const escapedId = (typeof CSS !== 'undefined' && CSS.escape)
        ? CSS.escape(String(atomeId))
        : String(atomeId).replace(/"/g, '\\"');
    const dataNodes = document.querySelectorAll(`[data-atome-id="${escapedId}"]`);
    dataNodes.forEach((el) => elements.add(el));

    if (!elements.size) return;

    // Filter out elements that are currently being edited locally
    // to prevent remote patches from destroying the editing state
    const patchableElements = new Set();
    elements.forEach((el) => {
        if (!isElementInEditMode(el)) {
            patchableElements.add(el);
        }
    });

    // If all elements are in edit mode, skip patching entirely
    if (!patchableElements.size) {
        return;
    }

    const cssProps = properties?.css && typeof properties.css === 'object' ? properties.css : null;
    if (cssProps) {
        Object.entries(cssProps).forEach(([key, value]) => {
            patchableElements.forEach((el) => {
                el.style[key] = coerceStyleValue(value);
            });
        });
    }

    Object.entries(properties || {}).forEach(([key, value]) => {
        if (value == null) return;
        if (key === 'text' || key === 'content' || key === 'textContent') {
            // CRITICAL FIX: Apply text to the dedicated text container,
            // NOT to the host element, to preserve DOM structure
            patchableElements.forEach((el) => {
                applySemanticTextToElement(el, value);
            });
            return;
        }
        if (key.startsWith('css.')) {
            const cssKey = key.slice(4);
            patchableElements.forEach((el) => { el.style[cssKey] = coerceStyleValue(value); });
            return;
        }
        if (key === 'rotation' || key === 'rotate') {
            const next = String(value).includes('deg') || String(value).includes('rad')
                ? String(value)
                : `${value}deg`;
            patchableElements.forEach((el) => { el.style.transform = `rotate(${next})`; });
            return;
        }
        if (key === 'left' || key === 'top' || key === 'right' || key === 'bottom'
            || key === 'width' || key === 'height' || key === 'opacity'
            || key === 'zIndex' || key === 'background' || key === 'backgroundColor'
            || key === 'color') {
            patchableElements.forEach((el) => { el.style[key] = coerceStyleValue(value); });
        }
    });
};

// Export for use by other modules
export { extractSemanticText, isElementInEditMode };

const dispatchAtomeEvent = (type, payload) => {
    if (typeof window === 'undefined') return;
    const { atome, atomeId, properties } = normalizeAtomePayload(payload);
    if (!atomeId && !atome) return;
    const detail = {
        id: atomeId || atome?.id || atome?.atome_id || null,
        atome_id: atomeId || atome?.atome_id || atome?.id || null,
        atome,
        properties: properties || atome?.properties || atome?.particles || atome?.data || null,
        source: 'realtime'
    };
    window.dispatchEvent(new CustomEvent(type, { detail }));
};

// =============================================================================
// REAL-TIME SYNC API
// =============================================================================

const connectRealtime = async (options = {}) => {
    const onPayload = (payload) => {
        if (!payload || !payload.type) return;

        if (payload.type === 'atome:created') {
            const { atome, atomeId, properties } = normalizeAtomePayload(payload);
            const ownerId = atome?.owner_id || atome?.ownerId || payload.owner_id || payload.ownerId || null;
            const currentUserId = getCurrentUserId();

            // SECURITY: Check if this atome belongs to the current user or is explicitly shared
            // Only check sharing if we have a valid currentUserId
            const isSharedWithUser = currentUserId && (
                payload.shared_with?.includes?.(currentUserId)
                || payload.sharedWith?.includes?.(currentUserId)
                || atome?.shared_with?.includes?.(currentUserId)
                || atome?.sharedWith?.includes?.(currentUserId)
                || payload.isShared === true
                || atome?.isShared === true
            );

            // Owner check requires both currentUserId and ownerId to be valid
            const isOwnedByCurrentUser = currentUserId && ownerId && String(ownerId) === String(currentUserId);

            // If user is not authenticated, don't mirror anything to local DB
            // If user is authenticated, only mirror if owned or shared
            const canMirrorToLocal = currentUserId && (isOwnedByCurrentUser || isSharedWithUser);

            // Always dispatch event for UI updates (non-persistent)
            dispatchAtomeEvent('squirrel:atome-created', payload);
            if (properties) applyAtomePatchToDom(atomeId, properties);

            // SECURITY FIX: Only mirror to Tauri DB if owned by current user or explicitly shared
            if (runtime === 'tauri' && atomeId && !shouldSkipMirrorCreate(atomeId)) {
                if (!canMirrorToLocal) {
                    // Skip mirroring - this atome belongs to another user and is not shared
                    return;
                }

                const atomeType = atome?.atome_type || atome?.type || payload.atomeType || payload.atome_type || 'atome';
                const parentId = atome?.parent_id || atome?.parentId || null;
                const particles = properties || atome?.particles || atome?.properties || atome?.data || null;

                rememberMirrorCreate(atomeId);
                const tauriTokenPresent = !!(TauriAdapter?.getToken && TauriAdapter.getToken());
                if (tauriTokenPresent) {
                    TauriAdapter.atome.create({
                        id: atomeId,
                        atome_id: atomeId,
                        type: atomeType,
                        atome_type: atomeType,
                        parent_id: parentId,
                        owner_id: ownerId,
                        properties: particles || {},
                        sync: true
                    }).then((res) => {
                        if (res && (res.ok || res.success || isAlreadyExistsError(res))) return;
                        mirrorCreateSeen.delete(atomeId);
                    }).catch((err) => {
                        mirrorCreateSeen.delete(atomeId);
                    });
                } else {
                    mirrorCreateSeen.delete(atomeId);
                }
            }
        }
        if (payload.type === 'atome:updated' || payload.type === 'atome:altered') {
            const { atomeId, properties } = normalizeAtomePayload(payload);
            const atome = payload.atome || payload.data?.atome || payload.data || payload.record || null;
            const atomeType = atome?.atome_type || atome?.type || payload.atomeType || payload.atome_type || null;
            const parentId = atome?.parent_id || atome?.parentId || payload.parent_id || payload.parentId || null;
            const currentUserId = getCurrentUserId();
            const ownership = normalizeOwnershipInfo(payload, atome);
            if (runtime === 'tauri' && atomeId && properties && canMirrorToLocal(ownership, currentUserId)) {
                mirrorUpdateToLocal({
                    atomeId,
                    properties,
                    atomeType,
                    parentId,
                    ownerId: ownership.ownerId
                });
            }
            const authorId = payload.authorId || payload.author_id
                || payload.params?.authorId || payload.params?.author_id || null;
            if (authorId && isFromCurrentUser(authorId)) {
                return;
            }
            if (properties && shouldIgnoreRealtimePatch(atomeId, properties, { authorId })) {
                return;
            }
            dispatchAtomeEvent('squirrel:atome-updated', payload);
            if (properties) applyAtomePatchToDom(atomeId, properties);
        }
        if (payload.type === 'atome:deleted') {
            const { atomeId } = normalizeAtomePayload(payload);
            if (runtime === 'tauri' && atomeId) {
                mirrorDeleteToLocal(atomeId);
            }
            dispatchAtomeEvent('squirrel:atome-deleted', payload);
        }

        // Forward to external listeners
        const listeners = realtimeListeners.get(payload.type) || [];
        listeners.forEach((fn) => {
            try { fn(payload); } catch (_) { }
        });

        if (options.onAtomeCreated && payload.type === 'atome:created') {
            options.onAtomeCreated(payload);
        }
        if (options.onAtomeUpdated && payload.type === 'atome:updated') {
            options.onAtomeUpdated(payload);
        }
        if (options.onAtomeAltered && payload.type === 'atome:altered') {
            options.onAtomeAltered(payload);
        }
        if (options.onAtomeDeleted && payload.type === 'atome:deleted') {
            options.onAtomeDeleted(payload);
        }
    };

    const onConnected = () => {
        realtimeState.connected = true;
        realtimeState.serverAvailable = true;
        realtimeSocket.send({
            type: 'register',
            clientId,
            clientType: runtime,
            timestamp: nowIso()
        });

        try { flushQueue('fastify'); } catch (_) { }

        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('squirrel:sync-ready', {
                detail: { endpoint: realtimeSocket.getState().endpoint, runtime, backend: 'fastify' }
            }));
        }

        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('squirrel:sync-connected', {
                detail: { endpoint: realtimeSocket.getState().endpoint, runtime }
            }));
        }

        if (typeof options.onConnected === 'function') {
            options.onConnected({ clientId });
        }
    };

    const onDisconnected = (payload) => {
        realtimeState.connected = false;
        if (typeof options.onDisconnected === 'function') {
            options.onDisconnected(payload);
        }
    };

    realtimeSocket.subscribe((payload) => {
        if (payload?.type === 'connected') onConnected();
        if (payload?.type === 'disconnected') onDisconnected(payload);
        onPayload(payload);
    });

    realtimeSocket.connect();
    return true;
};

const disconnectRealtime = () => {
    realtimeSocket.disconnect('client');
    realtimeState.connected = false;
};

const isRealtimeConnected = () => realtimeSocket.getState().connected;

const getRealtimeState = () => ({
    ...realtimeSocket.getState(),
    serverAvailable: realtimeState.serverAvailable
});

const requestRealtimeSync = () => realtimeSocket.send({ type: 'sync_request', timestamp: Date.now() });

const onRealtime = (eventType, callback) => {
    if (!realtimeListeners.has(eventType)) {
        realtimeListeners.set(eventType, []);
    }
    realtimeListeners.get(eventType).push(callback);
    return () => {
        const list = realtimeListeners.get(eventType) || [];
        realtimeListeners.set(eventType, list.filter((fn) => fn !== callback));
    };
};

// =============================================================================
// WS/API REQUESTS (FASTIFY + TAURI)
// =============================================================================

const requestApi = async (backend, payload, options = {}) => {
    const socket = backend === 'tauri' ? tauriApiSocket : fastifyApiSocket;

    const token = backend === 'tauri' ? getTauriToken() : getFastifyToken();
    const headers = {
        ...(payload.headers || {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {})
    };

    const requestPayload = {
        ...payload,
        headers
    };

    return socket.request(requestPayload, options);
};

const apiRequest = (backend, method, path, body = null, headers = {}) => {
    return requestApi(backend, {
        type: 'api-request',
        id: `api_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        method,
        path,
        body,
        headers
    });
};

const atomeRequest = (backend, action, data = {}) => {
    return requestApi(backend, {
        type: 'atome',
        action,
        requestId: `atome_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        data
    });
};

const shareRequest = (backend, action, data = {}) => {
    return requestApi(backend, {
        type: 'share',
        action,
        requestId: `share_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        ...data
    });
};

// =============================================================================
// OFFLINE QUEUE
// =============================================================================

const enqueueOperation = (operation) => {
    const item = { id: `op_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, ...operation, queuedAt: nowIso() };
    syncQueue.push(item);
    writeQueue(syncQueue);
    return item;
};

const flushQueue = async (backend = 'fastify') => {
    if (!syncQueue.length) return { success: true, flushed: 0 };

    const remaining = [];
    let flushed = 0;

    for (const item of syncQueue) {
        try {
            if (item.type === 'share') {
                await shareRequest(backend, item.action, item.data || {});
                flushed += 1;
                continue;
            }
            if (item.type === 'atome') {
                await atomeRequest(backend, item.action, item.data || {});
                flushed += 1;
                continue;
            }
            if (item.type === 'api') {
                await apiRequest(backend, item.method, item.path, item.body, item.headers || {});
                flushed += 1;
                continue;
            }
        } catch (_) {
            remaining.push(item);
        }
    }

    syncQueue.length = 0;
    remaining.forEach((item) => syncQueue.push(item));
    writeQueue(syncQueue);

    return { success: true, flushed, remaining: remaining.length };
};

// =============================================================================
// COMMANDS (DIRECT MESSAGES)
// =============================================================================

const commandState = {
    active: false,
    currentUserId: null,
    authInFlight: false,
    allowedSenders: new Set(),
    handlers: new Map()
};

const onCommandMessage = (payload) => {
    if (!payload || payload.type !== 'console-message') return;
    const senderId = payload.from?.userId || payload.from?.user_id || null;
    if (commandState.allowedSenders.size && senderId && !commandState.allowedSenders.has(senderId)) return;

    const msgText = payload.message || '';
    const parsed = safeJsonParse(msgText);
    if (!parsed || typeof parsed.command !== 'string') return;

    const handler = commandState.handlers.get(parsed.command);
    if (!handler) return;

    try {
        handler(parsed.params || {}, payload.from || {});
    } catch (_) { }
};

const ensureCommandAuth = async (userId) => {
    if (commandState.authInFlight) return false;

    // Try Fastify token first, then Tauri token (they share the same JWT_SECRET)
    let token = getFastifyToken();
    if (!token) {
        token = getTauriToken();
    }
    if (!token) {
        return false;
    }

    commandState.authInFlight = true;
    const authPayload = {
        type: 'auth',
        action: 'me',
        requestId: `auth_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        token,
        registerAs: userId || commandState.currentUserId || undefined
    };

    try {
        const response = await fastifyApiSocket.request(authPayload, { timeoutMs: DEFAULTS.auth.authTimeoutMs });
        if (response?.success) {
            commandState.currentUserId = userId || response?.user?.user_id || response?.user?.id || commandState.currentUserId;
            commandState.authInFlight = false;
            return true;
        }
    } catch (err) {
    }

    commandState.authInFlight = false;
    return false;
};

const commands = {
    async start(userId) {
        fastifyApiSocket.subscribe(onCommandMessage);
        fastifyApiSocket.connect();
        const ok = await ensureCommandAuth(userId || getCurrentUserId());
        commandState.active = ok;
        return ok;
    },
    stop() {
        commandState.active = false;
    },
    isActive() {
        return commandState.active;
    },
    getCurrentUserId() {
        return commandState.currentUserId || getCurrentUserId();
    },
    setAllowedSenders(list = []) {
        commandState.allowedSenders = new Set(list);
    },
    register(name, handler) {
        if (typeof handler !== 'function') return false;
        commandState.handlers.set(name, handler);
        return true;
    },
    unregister(name) {
        commandState.handlers.delete(name);
    },
    async sendCommand(targetUserIdOrPhone, command, params = {}) {
        if (!commandState.active) {
            const ok = await commands.start(commandState.currentUserId || getCurrentUserId());
            if (!ok) return { success: false, error: 'commands-not-active' };
        }

        const message = JSON.stringify({ command, params });
        const payload = {
            type: 'direct-message',
            requestId: `dm_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            message
        };

        const rawTarget = String(targetUserIdOrPhone || '');
        const looksLikeUuid = /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-/.test(rawTarget);
        if (rawTarget.includes('+') || (!looksLikeUuid && rawTarget.length >= 8)) {
            payload.toPhone = rawTarget;
        } else {
            payload.toUserId = rawTarget;
        }

        try {
            const response = await fastifyApiSocket.request(payload, { timeoutMs: DEFAULTS.rpc.requestTimeoutMs });
            return { success: true, ...response };
        } catch (error) {
            return { success: false, error: error?.message || 'direct-message-failed' };
        }
    }
};

// Built-in handlers (safe subset)
const builtinHandlers = {
    registerAll() {
        commands.register('ping', () => { });
        commands.register('pong', () => { });
        commands.register('share-sync', (params) => {
            const atomeId = params?.atomeId || params?.atome_id || params?.id;
            const properties = params?.properties || params?.particles || params?.patch || null;
            if (!atomeId || !properties || typeof properties !== 'object') return;
            if (shouldIgnoreRealtimePatch(atomeId, properties)) return;

            applyAtomePatchToDom(atomeId, properties);
            dispatchAtomeEvent('squirrel:atome-updated', { atomeId, properties });
        });
        return true;
    },
    register(name) {
        return commands.register(name, () => { });
    }
};

commands.builtin = builtinHandlers;

// =============================================================================
// SHARE API
// =============================================================================

const share = {
    request(data) {
        return shareRequest('fastify', 'request', data);
    },
    respond(data) {
        return shareRequest('fastify', 'respond', data);
    },
    revoke(data) {
        return shareRequest('fastify', 'revoke', data);
    },
    myShares(data) {
        return shareRequest('fastify', 'my-shares', data);
    },
    sharedWithMe(data) {
        return shareRequest('fastify', 'shared-with-me', data);
    },
    accessible(data) {
        return shareRequest('fastify', 'accessible', data);
    },
    check(data) {
        return shareRequest('fastify', 'check', data);
    }
};

// =============================================================================
// UNIFIED API
// =============================================================================

const UnifiedSync = {
    init(options = {}) {
        if (typeof window !== 'undefined') {
            window.Squirrel = window.Squirrel || {};
            window.Squirrel.Sync = UnifiedSync;
            window.Squirrel.SyncEngine = {
                subscribe: (listener) => realtimeSocket.subscribe(listener),
                send: (payload) => realtimeSocket.send(payload),
                getState: () => getRealtimeState(),
                requestSync: () => requestRealtimeSync(),
                disconnect: () => disconnectRealtime(),
                retry: () => realtimeSocket.connect()
            };
            window.Squirrel.VersionSync = window.Squirrel.SyncEngine;
        }

        if (options.autoCommands !== false) {
            try { commands.builtin.registerAll(); } catch (_) { }
            try {
                const uid = getCurrentUserId();
                if (uid) commands.start(uid);
            } catch (_) { }
        }

        if (options.autoConnect !== false) {
            connectRealtime({});
        }
    },

    connectRealtime,
    disconnectRealtime,
    isRealtimeConnected,
    getRealtimeState,
    requestRealtimeSync,
    on: onRealtime,

    requestApi,
    apiRequest,
    atomeRequest,
    shareRequest,

    enqueueOperation,
    flushQueue,

    share,
    commands
};

export default UnifiedSync;
export { UnifiedSync };
