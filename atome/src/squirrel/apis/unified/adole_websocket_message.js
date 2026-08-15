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
                                const deleteKeys = Array.isArray(params?.delete_keys)
                                    ? params.delete_keys
                                    : (Array.isArray(params?.deleteKeys) ? params.deleteKeys : []);
                                const isDeleted = properties?.__deleted === true || params?.deletedAt || params?.deleted_at;
                                const authorId = params?.author_id || params?.authorId || message?.author_id || message?.authorId || senderInfo.userId || null;
                                if (atomeId) {
                                    if (isDeleted) {
                                        window.dispatchEvent(new CustomEvent('squirrel:atome-deleted', { detail: { id: atomeId, atome_id: atomeId, source: 'realtime' } }));
                                    } else if (properties && typeof properties === 'object') {
                                        if (shouldIgnoreRealtimePatch(atomeId, properties, {
                                            authorId,
                                            source: 'realtime',
                                            origin: 'adole:share-sync',
                                            eventId: params?.event_id || params?.eventId || null,
                                            gestureId: params?.gesture_id || params?.gestureId || null,
                                            txId: params?.tx_id || params?.txId || null
                                        })) {
                                            return;
                                        }
                                        window.dispatchEvent(new CustomEvent('squirrel:atome-updated', {
                                            detail: {
                                                id: atomeId,
                                                atome_id: atomeId,
                                                properties,
                                                delete_keys: deleteKeys,
                                                property_versions: params?.property_versions || params?.propertyVersions || {},
                                                event_id: params?.event_id || params?.eventId || null,
                                                tx_id: params?.tx_id || params?.txId || null,
                                                gesture_id: params?.gesture_id || params?.gestureId || null,
                                                author_id: authorId,
                                                durable: params?.durable === true,
                                                source: 'realtime',
                                                origin: 'adole:share-sync',
                                                realtime_dedup_checked: true,
                                                realtime_dedup_ignore: false
                                            }
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

            // Handle surface-presence (server push, no requestId): another surface of
            // the same account came online or went away. Teleport destination lists
            // are built from this, so it must reach the UI without a poll.
            if (message.type === 'surface-presence' && typeof window !== 'undefined') {
                try {
                    window.dispatchEvent(new CustomEvent('squirrel:surface-presence', {
                        detail: {
                            event: message.event || null,
                            surface: message.surface || null,
                            timestamp: message.timestamp || null
                        }
                    }));
                } catch (_) { }
                return;
            }

            // Teleport server pushes (no requestId): an offer addressed to this
            // surface, or the outcome of one this surface sent. The object state
            // itself arrives through the ordinary share-sync patch; these are the
            // control-plane signals the UI reacts to.
            if (
                (message.type === 'teleport-offer'
                    || message.type === 'teleport-arrived'
                    || message.type === 'teleport-cancelled')
                && typeof window !== 'undefined'
            ) {
                try {
                    window.dispatchEvent(new CustomEvent(`squirrel:${message.type}`, {
                        detail: {
                            atomeId: message.atome_id || null,
                            atome_id: message.atome_id || null,
                            sessionId: message.session_id || null,
                            session_id: message.session_id || null,
                            surfaceId: message.surface_id || null,
                            fromSurfaceId: message.from_surface_id || null,
                            fromUserId: message.from_user_id || null,
                            originSurfaceId: message.origin_surface_id || null,
                            reason: message.reason || null,
                            timestamp: message.timestamp || null
                        }
                    }));
                } catch (_) { }
                return;
            }

            // Cross-user authorization pushes (§11.2): the owner must see the request
            // on whichever device they are holding, so these are principal-scoped.
            if (
                (message.type === 'surface-grant-request'
                    || message.type === 'surface-grant-granted'
                    || message.type === 'surface-grant-denied'
                    || message.type === 'surface-grant-revoked')
                && typeof window !== 'undefined'
            ) {
                try {
                    window.dispatchEvent(new CustomEvent(`squirrel:${message.type}`, {
                        detail: {
                            grant: message.grant || null,
                            fromUserId: message.from_user_id || null,
                            timestamp: message.timestamp || null
                        }
                    }));
                } catch (_) { }
                return;
            }

            // Handle surface-grant-response
            if (message.type === 'surface-grant-response' && (message.request_id || message.requestId)) {
                const pending = this.pendingRequests.get(message.request_id || message.requestId);
                if (pending) {
                    this.pendingRequests.delete(message.request_id || message.requestId);
                    clearTimeout(pending.timeout);
                    pending.resolve({
                        ok: message.success,
                        success: message.success,
                        status: message.success ? 200 : 400,
                        error: message.error,
                        grant: message.grant,
                        grants: message.grants,
                        reused: message.reused,
                        revokedBy: message.revoked_by
                    });
                }
                return;
            }

            // Remote-control server pushes: a session opened on this surface, input
            // to apply, or a session that ended. Input is high frequency, so it is
            // dispatched without any extra normalisation.
            if (
                (message.type === 'remote-control-started'
                    || message.type === 'remote-control-input'
                    || message.type === 'remote-control-ended'
                    || message.type === 'remote-control-preview-request'
                    || message.type === 'remote-control-preview-frame'
                    || message.type === 'remote-control-preview-stopped')
                && typeof window !== 'undefined'
            ) {
                try {
                    window.dispatchEvent(new CustomEvent(`squirrel:${message.type}`, {
                        detail: {
                            session: message.session || null,
                            sessionId: message.session_id || message.session?.session_id || null,
                            input: message.input || null,
                            payload: message.payload || null,
                            fromSurfaceId: message.from_surface_id || null,
                            reason: message.reason || null,
                            frame: message.frame || null,
                            width: message.width || null,
                            height: message.height || null,
                            timestamp: message.timestamp || null
                        }
                    }));
                } catch (_) { }
                return;
            }

            // Handle remote-control-response
            if (message.type === 'remote-control-response' && (message.request_id || message.requestId)) {
                const pending = this.pendingRequests.get(message.request_id || message.requestId);
                if (pending) {
                    this.pendingRequests.delete(message.request_id || message.requestId);
                    clearTimeout(pending.timeout);
                    pending.resolve({
                        ok: message.success,
                        success: message.success,
                        status: message.success ? 200 : 400,
                        error: message.error,
                        session: message.session,
                        sessions: message.sessions,
                        delivered: message.delivered
                    });
                }
                return;
            }

            // Handle teleport-response
            if (message.type === 'teleport-response' && (message.request_id || message.requestId)) {
                const pending = this.pendingRequests.get(message.request_id || message.requestId);
                if (pending) {
                    this.pendingRequests.delete(message.request_id || message.requestId);
                    clearTimeout(pending.timeout);
                    pending.resolve({
                        ok: message.success,
                        success: message.success,
                        status: message.success ? 200 : 400,
                        error: message.error,
                        atomeId: message.atome_id,
                        sessionId: message.session_id,
                        surfaceId: message.surface_id,
                        targetSurfaceId: message.target_surface_id,
                        state: message.state,
                        teleport: message.teleport,
                        surfaces: message.surfaces,
                        destination: message.destination,
                        reason: message.reason
                    });
                }
                return;
            }

            // Handle surface-response
            if (message.type === 'surface-response' && (message.request_id || message.requestId)) {
                const pending = this.pendingRequests.get(message.request_id || message.requestId);
                if (pending) {
                    this.pendingRequests.delete(message.request_id || message.requestId);
                    clearTimeout(pending.timeout);
                    pending.resolve({
                        ok: message.success,
                        success: message.success,
                        status: message.success ? 200 : 400,
                        error: message.error,
                        surface: message.surface,
                        surfaces: message.surfaces,
                        shared: message.shared,
                        restored_atome_ids: message.restored_atome_ids
                    });
                }
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
                ['events-response', 'state-current-response', 'snapshot-response', 'user-data-response', 'sync-response', 'conditions-response', 'history-response']
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
                        acknowledged: message.acknowledged ?? payload.acknowledged,
                        items: message.items ?? payload.items,
                        ids: message.ids ?? payload.ids,
                        total: message.total ?? payload.total,
                        cursor: message.cursor ?? payload.cursor,
                        revision: message.revision ?? payload.revision
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
