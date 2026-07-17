// Extracted from adole_websocket.js: TauriWebSocket#handleMessage — inbound WS message dispatch.
// Applied as a prototype mixin so `this` stays bound to the socket instance.
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
                        data: message.data ?? message.atome ?? message,
                        atomes: message.atomes,
                        count: message.count,
                        history: message.history,
                        versions: message.versions,
                        events: message.events
                    });
                }
                return;
            }

            if (
                ['events-response', 'state-current-response', 'snapshot-response', 'user-data-response', 'sync-response']
                    .includes(message.type)
                && (message.request_id || message.requestId)
            ) {
                const pending = this.pendingRequests.get(message.request_id || message.requestId);
                if (pending) {
                    this.pendingRequests.delete(message.request_id || message.requestId);
                    clearTimeout(pending.timeout);
                    const payload = message.data && typeof message.data === 'object'
                        ? message.data
                        : message;
                    pending.resolve({
                        ok: message.success,
                        success: message.success,
                        status: message.success ? 200 : 400,
                        error: message.error,
                        data: message,
                        event: message.event ?? payload.event,
                        events: message.events ?? payload.events,
                        state: message.state ?? payload.state,
                        states: message.states ?? payload.states,
                        snapshot: message.snapshot ?? payload.snapshot,
                        snapshots: message.snapshots ?? payload.snapshots,
                        snapshot_id: message.snapshot_id ?? payload.snapshot_id,
                        atomes: message.atomes ?? payload.atomes,
                        changes: message.changes ?? payload.changes,
                        deleted: message.deleted ?? payload.deleted,
                        acknowledged: message.acknowledged ?? payload.acknowledged
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
