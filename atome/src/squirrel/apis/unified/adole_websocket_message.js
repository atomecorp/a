// Extracted from adole_websocket.js: TauriWebSocket#handleMessage — inbound WS message dispatch.
// Applied as a prototype mixin so `this` stays bound to the socket instance.
import {
    MEDIA_PATCH_KIND_HINTS, hasMediaSourceHintsInPatch, mediaPatchHintsByAtomeId,
    normalizeMediaPatchKindHint, rememberMediaPatchHint
} from './adole_backend.js';
import { shouldIgnoreRealtimePatch } from './realtime_dedupe.js';

export const messageHandlerMixin = {
    handleMessage(data) {
        try {
            const message = JSON.parse(data);

            // Handle pong
            if (message.type === 'pong') return;

            // Handle server-pushed console-only messages
            if (message.type === 'console-message') {
                const from = message.from?.phone || message.from?.userId || 'unknown';

                // Some console-messages are actually RemoteCommands encoded as JSON (e.g. share-sync realtime).
                // In browser Fastify runtimes, the ws/api adapter receives these messages; dispatch them here so
                // realtime collaboration works Fastify->Fastify without requiring a page refresh.
                try {
                    const text = message.message;
                    if (typeof text === 'string' && text.trim().startsWith('{')) {
                        const cmd = JSON.parse(text);
                        if (cmd && typeof cmd.command === 'string') {
                            const commandName = cmd.command;
                            const params = cmd.params || {};

                            const senderInfo = {
                                userId: message.from?.userId || message.from?.user_id || null,
                                phone: message.from?.phone || null,
                                username: message.from?.username || null,
                                timestamp: message.timestamp || null
                            };

                            const applyDomPatch = (atomeId, properties = {}) => {
                                if (!atomeId || typeof document === 'undefined') return;
                                const elements = new Set();
                                const byId = document.getElementById(`eve-atome_${atomeId}`)
                                    || document.getElementById(`atome_${atomeId}`)
                                    || document.getElementById(String(atomeId));
                                if (byId) elements.add(byId);
                                if (!elements.size) return;
                                const isMediaLikeElement = (el) => {
                                    if (!el) return false;
                                    return !!el.querySelector?.('video, audio, img');
                                };
                                const patchKind = normalizeMediaPatchKindHint(
                                    properties?.kind
                                    || properties?.type
                                    || properties?.media_type
                                    || properties?.mediaType
                                    || ''
                                );
                                if (MEDIA_PATCH_KIND_HINTS.has(patchKind)) {
                                    rememberMediaPatchHint(atomeId, patchKind);
                                }
                                let mediaLikePatch = !!(String(atomeId || '').trim() && mediaPatchHintsByAtomeId.has(String(atomeId).trim()));
                                if (!mediaLikePatch && hasMediaSourceHintsInPatch(properties)) {
                                    mediaLikePatch = true;
                                }
                                if (!mediaLikePatch) {
                                    elements.forEach((el) => {
                                        if (mediaLikePatch) return;
                                        if (!isMediaLikeElement(el)) return;
                                        mediaLikePatch = true;
                                        const elKind = normalizeMediaPatchKindHint(el.dataset?.atomeKind || el.dataset?.kind || '');
                                        if (MEDIA_PATCH_KIND_HINTS.has(elKind)) rememberMediaPatchHint(atomeId, elKind);
                                    });
                                }
                                const cssProps = properties?.css && typeof properties.css === 'object' ? properties.css : null;
                                if (cssProps) {
                                    Object.entries(cssProps).forEach(([key, value]) => {
                                        elements.forEach((el) => { el.style[key] = typeof value === 'number' ? `${value}px` : String(value); });
                                    });
                                }
                                Object.entries(properties || {}).forEach(([key, value]) => {
                                    if (value == null) return;
                                    if (key === 'text' || key === 'textContent' || key === 'content') {
                                        elements.forEach((el) => {
                                            if (mediaLikePatch || isMediaLikeElement(el)) return;
                                            const textTarget = el.querySelector?.('[data-role="atome-text"]') || null;
                                            if (key === 'content') {
                                                if (textTarget instanceof HTMLElement) {
                                                    textTarget.innerHTML = String(value);
                                                    return;
                                                }
                                                const hasStructuralChildren = !!el.querySelector?.('[data-role], video, audio, img, svg, canvas');
                                                if (!hasStructuralChildren) el.innerHTML = String(value);
                                                return;
                                            }
                                            if (textTarget instanceof HTMLElement) {
                                                textTarget.textContent = String(value);
                                                return;
                                            }
                                            const hasStructuralChildren = !!el.querySelector?.('[data-role], video, audio, img, svg, canvas');
                                            if (!hasStructuralChildren) el.textContent = String(value);
                                        });
                                        return;
                                    }
                                    if (key.startsWith('css.')) {
                                        const cssKey = key.slice(4);
                                        elements.forEach((el) => { el.style[cssKey] = typeof value === 'number' ? `${value}px` : String(value); });
                                        return;
                                    }
                                    if (key === 'rotation' || key === 'rotate') {
                                        const next = String(value).includes('deg') || String(value).includes('rad')
                                            ? String(value)
                                            : `${value}deg`;
                                        elements.forEach((el) => { el.style.transform = `rotate(${next})`; });
                                        return;
                                    }
                                    if (['left', 'top', 'right', 'bottom', 'width', 'height', 'opacity', 'zIndex', 'background', 'backgroundColor', 'color']
                                        .includes(key)) {
                                        elements.forEach((el) => { el.style[key] = typeof value === 'number' ? `${value}px` : String(value); });
                                    }
                                });
                            };

                            if (commandName === 'share-create' && typeof window !== 'undefined') {
                                try {
                                    const detail = { ...(params || {}), sender: senderInfo };
                                    window.dispatchEvent(new CustomEvent('adole-share-create', { detail }));
                                    if (detail?.atomeId || detail?.atome_id) {
                                        window.dispatchEvent(new CustomEvent('squirrel:atome-created', { detail }));
                                    }
                                } catch (_) { }
                                return;
                            }

                            if (commandName === 'share-sync' && typeof window !== 'undefined') {
                                // Guard: do not apply realtime share-sync patches to anonymous sessions.
                                const localUserId = (window.__currentUser && window.__currentUser.id) ? window.__currentUser.id : null;
                                if (!localUserId) {
                                    return;
                                }

                                const atomeId = params?.atomeId || params?.atome_id || params?.id || null;
                                const properties = params?.properties || params?.particles || params?.patch || null;
                                const isDeleted = properties?.__deleted === true || params?.deletedAt || params?.deleted_at;
                                if (atomeId) {
                                    if (isDeleted) {
                                        window.dispatchEvent(new CustomEvent('squirrel:atome-deleted', { detail: { id: atomeId, atome_id: atomeId, source: 'realtime' } }));
                                    } else if (properties && typeof properties === 'object') {
                                        if (shouldIgnoreRealtimePatch(atomeId, properties)) {
                                            return;
                                        }
                                        window.dispatchEvent(new CustomEvent('squirrel:atome-updated', {
                                            detail: { id: atomeId, atome_id: atomeId, properties, source: 'realtime', origin: 'adole:share-sync' }
                                        }));
                                        applyDomPatch(atomeId, properties);
                                    }
                                }
                                return;
                            }

                            const camel = String(commandName)
                                .replace(/-([a-z])/g, (_, c) => String(c).toUpperCase());

                            const handler = (globalThis.BuiltinHandlers?.handlers?.[camel]) || null;
                            if (typeof handler === 'function') {
                                handler(params, senderInfo);
                                return;
                            }
                        }
                    }
                } catch (_) { }

                return;
            }

            // Handle auth-response
            if (message.type === 'auth-response' && (message.request_id || message.requestId)) {
                const pending = this.pendingRequests.get(message.request_id || message.requestId);
                if (pending) {
                    this.pendingRequests.delete(message.request_id || message.requestId);
                    clearTimeout(pending.timeout);
                    pending.resolve({
                        ok: message.success,
                        success: message.success,
                        status: message.success ? 200 : 400,
                        error: message.error,
                        user: message.user,
                        token: message.token,
                        userId: message.userId,
                        code: message.code,
                        otpBypassed: message.otpBypassed,
                        context: message.context
                    });
                }
                return;
            }

            // Handle atome-response
            if (message.type === 'atome-response' && (message.request_id || message.requestId)) {
                const pending = this.pendingRequests.get(message.request_id || message.requestId);
                if (pending) {
                    this.pendingRequests.delete(message.request_id || message.requestId);
                    clearTimeout(pending.timeout);
                    pending.resolve({
                        ok: message.success,
                        success: message.success,
                        status: message.success ? 200 : 400,
                        error: message.error,
                        // Server may reply with { atome } for create/get
                        atome: message.atome,
                        data: message.data ?? message.atome,
                        atomes: message.atomes,
                        count: message.count
                    });
                }
                return;
            }

            // Handle file-response
            if (message.type === 'file-response' && (message.request_id || message.requestId)) {
                const pending = this.pendingRequests.get(message.request_id || message.requestId);
                if (pending) {
                    this.pendingRequests.delete(message.request_id || message.requestId);
                    clearTimeout(pending.timeout);
                    pending.resolve({
                        ok: message.success,
                        success: message.success,
                        status: message.success ? 200 : 400,
                        error: message.error,
                        data: message.data ?? message
                    });
                }
                return;
            }

            // Handle debug-response
            if (message.type === 'debug-response' && (message.request_id || message.requestId)) {
                const pending = this.pendingRequests.get(message.request_id || message.requestId);
                if (pending) {
                    this.pendingRequests.delete(message.request_id || message.requestId);
                    clearTimeout(pending.timeout);
                    pending.resolve({
                        ok: message.success,
                        success: message.success,
                        status: message.success ? 200 : 400,
                        error: message.error,
                        tables: message.tables
                    });
                }
                return;
            }

            // Handle share-response (permissions system)
            if (message.type === 'share-response' && (message.request_id || message.requestId)) {
                const pending = this.pendingRequests.get(message.request_id || message.requestId);
                if (pending) {
                    this.pendingRequests.delete(message.request_id || message.requestId);
                    clearTimeout(pending.timeout);
                    pending.resolve({
                        ok: message.success,
                        success: message.success,
                        status: message.success ? 200 : 400,
                        error: message.error,
                        data: message.data,
                        count: message.count,
                        atome_id: message.atome_id,
                        permission: message.permission,
                        granted: message.granted
                    });
                }
                return;
            }

            // Handle direct-message-response
            if (message.type === 'direct-message-response' && (message.request_id || message.requestId)) {
                const pending = this.pendingRequests.get(message.request_id || message.requestId);
                if (pending) {
                    this.pendingRequests.delete(message.request_id || message.requestId);
                    clearTimeout(pending.timeout);
                    pending.resolve({
                        ok: message.success,
                        success: message.success,
                        status: message.success ? 200 : 400,
                        error: message.error,
                        delivered: message.delivered
                    });
                }
                return;
            }

            const secondaryId = message.request_id || message.requestId;
            if (secondaryId) {
                const pending = this.pendingRequests.get(secondaryId);
                if (pending) {
                    this.pendingRequests.delete(secondaryId);
                    clearTimeout(pending.timeout);
                    const success = message.success ?? message.ok;
                    pending.resolve({
                        ok: success !== false,
                        success: success !== false,
                        status: success === false ? 400 : 200,
                        error: message.error,
                        data: message.data ?? message
                    });
                }
            }

        } catch (e) {
            // Ignore parse errors
        }
    }

};
