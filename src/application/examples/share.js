// ============================================
// SHARE SYSTEM (LOGIC ONLY)
// ============================================

import { AdoleAPI } from '../../squirrel/apis/unified/adole_apis.js';
import { RemoteCommands } from '/squirrel/apis/remote_commands.js';
import { BuiltinHandlers } from '/squirrel/apis/remote_command_handlers.js';

const SHARE_SYNC_COMMAND = 'share-sync';
const SHARE_ACCEPTED_COMMAND = 'share-accepted';
const SHARE_DELETE_COMMAND = 'share-delete';

let _realtimeInstalled = false;
let _wrappedAlterInstalled = false;
let _wrappedDeleteInstalled = false;
let _wrappedRealtimePatchInstalled = false;
let _suppressSyncForAtomeIds = new Set();
let _outboxIndexCache = { builtAt: 0, index: new Map() };
let _peersIndexCache = { builtAt: 0, index: new Map() };
let _realtimeSharesCache = { builtAt: 0, items: [] };

// Backpressure/coalescing for high-frequency realtime patches (e.g. drag)
// atomeId -> { inFlight: boolean, pending: object|null, lastKey: string }
const _realtimePatchStateByAtomeId = new Map();

let _builtinHandlersRegistered = false;

// Runtime peer discovery for linked-share realtime.
// This enables bidirectional collaboration even when a device doesn't have
// local share_request inbox records (e.g. Tauri-only / single-DB setups).
const _runtimePeersByAtomeId = new Map();

function _rememberRuntimePeer(atomeId, peerUserId) {
    const a = String(atomeId || '');
    const p = String(peerUserId || '');
    if (!a || !p) return;
    if (!_runtimePeersByAtomeId.has(a)) _runtimePeersByAtomeId.set(a, new Map());
    _runtimePeersByAtomeId.get(a).set(p, Date.now());
}

function _getRuntimePeers(atomeId, maxAgeMs = 15 * 60 * 1000) {
    const a = String(atomeId || '');
    if (!a) return [];
    const m = _runtimePeersByAtomeId.get(a);
    if (!m) return [];
    const now = Date.now();
    const out = [];
    for (const [peerId, lastSeenAt] of m.entries()) {
        if ((now - lastSeenAt) <= maxAgeMs) out.push(peerId);
    }
    return out;
}

async function ensureRemoteCommandsReady(explicitUserId = null) {
    try {
        if (!_builtinHandlersRegistered) {
            BuiltinHandlers.registerAll();
            _builtinHandlersRegistered = true;
        }
    } catch (e) {
        console.warn('[ShareAPI] Failed to register builtin remote handlers:', e.message);
    }

    try {
        if (RemoteCommands?.isActive?.()) return true;
    } catch (_) { }

    try {
        const userId = explicitUserId
            || (await getCurrentUser())?.id
            || (typeof window !== 'undefined' ? window.__currentUser?.id : null);

        if (!userId) return false;
        const started = await RemoteCommands.start(userId);
        return !!started;
    } catch (e) {
        console.warn('[ShareAPI] Failed to start RemoteCommands:', e.message);
        return false;
    }
}

function _withSuppressedSync(atomeId, fn) {
    if (!atomeId) return fn();
    _suppressSyncForAtomeIds.add(String(atomeId));
    const cleanup = () => {
        try { _suppressSyncForAtomeIds.delete(String(atomeId)); } catch (_) { }
    };
    try {
        const p = fn();
        if (p && typeof p.finally === 'function') return p.finally(cleanup);
        cleanup();
        return p;
    } catch (e) {
        cleanup();
        throw e;
    }
}

function _extractShareTypeFromRequestParticles(particles) {
    const po = particles?.propertyOverrides || {};
    return po?.__shareType || particles?.shareType || 'linked';
}

function _normalizeProtectedGroupKey(particleKey) {
    const key = String(particleKey || '');
    if (!key) return '';
    if (['left', 'top', 'right', 'bottom'].includes(key)) return 'position';
    if (['color', 'backgroundColor'].includes(key)) return 'color';
    return key;
}

function _extractRuleAllowList(rule) {
    if (!rule) return null;
    if (rule === true) return ['owner'];
    if (typeof rule === 'string') {
        const s = rule.trim();
        if (!s) return null;
        if (s === 'owner' || s === 'owner-only') return ['owner'];
        return [s];
    }
    if (Array.isArray(rule)) return rule.map(String);
    if (typeof rule === 'object') {
        const allow = rule.allow || rule.allowed || null;
        if (Array.isArray(allow)) return allow.map(String);
        if (rule.ownerOnly === true) return ['owner'];
    }
    return null;
}

function _isUserAllowedByRule({ userId, ownerId, rule }) {
    const u = String(userId || '');
    const o = String(ownerId || '');
    if (!u) return false;
    if (u === o) return true;
    const allow = _extractRuleAllowList(rule);
    if (!allow) return null; // no rule => no extra restriction
    if (allow.includes('owner')) return false;
    return allow.includes(u);
}

function _filterParticlesByPermissions({ particles, actorUserId, ownerUserId, permissions }) {
    if (!particles || typeof particles !== 'object') return {};
    const actor = String(actorUserId || '');
    const owner = String(ownerUserId || '');
    if (!actor) return { ...particles };
    if (actor === owner) return { ...particles };

    // Base alter permission
    if (permissions && permissions.alter === false) return {};

    const rules = (permissions && (permissions.particles || permissions.protectedParticles || permissions.propertyRules)) || null;
    if (!rules || typeof rules !== 'object') return { ...particles };

    const out = {};
    for (const [k, v] of Object.entries(particles)) {
        const groupKey = _normalizeProtectedGroupKey(k);
        const rule = (groupKey && rules[groupKey] !== undefined) ? rules[groupKey] : rules[k];
        const allowed = _isUserAllowedByRule({ userId: actor, ownerId: owner, rule });
        if (allowed === false) continue;
        out[k] = v;
    }
    return out;
}

async function _listRealtimeShares(api, currentUserId) {
    const now = Date.now();
    if (Array.isArray(_realtimeSharesCache.items) && (now - _realtimeSharesCache.builtAt) < 5000) {
        return _realtimeSharesCache.items;
    }

    const items = [];
    try {
        const result = await api.atomes.list({ type: 'share_request', ownerId: currentUserId });
        const all = normalizeDualListResult(result, 'atomes');
        for (const raw of all) {
            const particles = raw?.particles || raw?.data || {};
            const shareType = _extractShareTypeFromRequestParticles(particles);
            if (shareType !== 'linked') continue;
            if ((particles.mode || null) !== 'real-time') continue;
            const status = particles.status || null;
            if (status !== 'active' && status !== 'pending') continue;
            const atomeIds = Array.isArray(particles.atomeIds) ? particles.atomeIds.map(String) : [];
            if (!atomeIds.length) continue;
            items.push({
                requestId: particles.requestId || null,
                box: particles.box || null,
                status,
                mode: particles.mode || null,
                shareType,
                sharerId: particles.sharerId || null,
                targetUserId: particles.targetUserId || null,
                atomeIds,
                permissions: particles.permissions || null
            });
        }
    } catch (e) {
        console.warn('[ShareAPI] Failed to list realtime shares:', e.message);
    }

    _realtimeSharesCache = { builtAt: now, items };
    return items;
}

async function _getPermissionContextForOutboundMutation(api, currentUserId, atomeId) {
    const id = String(atomeId || '');
    if (!id) return { ownerUserId: null, permissions: null };

    const shares = await _listRealtimeShares(api, currentUserId);

    // If current user is receiver, there should be an inbox entry.
    const inbox = shares.find(s => s.box === 'inbox' && Array.isArray(s.atomeIds) && s.atomeIds.includes(id));
    if (inbox && inbox.sharerId) {
        return { ownerUserId: String(inbox.sharerId), permissions: inbox.permissions || null };
    }

    // Default: treat current as owner.
    return { ownerUserId: String(currentUserId || ''), permissions: null };
}

async function _getPermissionContextForInboundCommand(api, currentUserId, atomeId, peerUserId) {
    const id = String(atomeId || '');
    const peer = String(peerUserId || '');
    if (!id || !peer) return null;

    const shares = await _listRealtimeShares(api, currentUserId);
    const entry = shares.find(s => {
        if (!Array.isArray(s.atomeIds) || !s.atomeIds.includes(id)) return false;
        if (s.box === 'inbox') return String(s.sharerId || '') === peer;
        if (s.box === 'outbox') return String(s.targetUserId || '') === peer;
        return false;
    });
    if (!entry) return null;

    const ownerUserId = (entry.box === 'inbox')
        ? String(entry.sharerId || '')
        : String(currentUserId || '');

    return { ownerUserId, permissions: entry.permissions || null, entry };
}

async function _buildOutboxIndex(api, currentUserId) {
    const now = Date.now();
    if (_outboxIndexCache.index && (now - _outboxIndexCache.builtAt) < 5000) {
        return _outboxIndexCache.index;
    }

    const index = new Map();
    try {
        const result = await api.atomes.list({ type: 'share_request', ownerId: currentUserId });
        const all = normalizeDualListResult(result, 'atomes');
        for (const raw of all) {
            const particles = raw?.particles || raw?.data || {};
            if ((particles.box || null) !== 'outbox') continue;
            if ((particles.status || null) !== 'active') continue;
            const shareType = _extractShareTypeFromRequestParticles(particles);
            if (shareType !== 'linked') continue;
            if ((particles.mode || null) !== 'real-time') continue;

            const targetUserId = particles.targetUserId || null;
            if (!targetUserId) continue;

            const sharedAtomes = Array.isArray(particles.sharedAtomes) ? particles.sharedAtomes : [];
            for (const item of sharedAtomes) {
                const originalAtomeId = item?.originalId || item?.original_atome_id || item?.originalAtomeId;
                const sharedAtomeId = item?.sharedAtomeId || item?.shared_atome_id || item?.createdAtomeId;
                if (!originalAtomeId || !sharedAtomeId) continue;
                const key = String(originalAtomeId);
                if (!index.has(key)) index.set(key, []);
                index.get(key).push({
                    targetUserId: String(targetUserId),
                    sharedAtomeId: String(sharedAtomeId),
                    requestId: particles.requestId || null
                });
            }
        }
    } catch (e) {
        console.warn('[ShareAPI] Failed to build outbox index:', e.message);
    }

    _outboxIndexCache = { builtAt: now, index };
    return index;
}

async function _buildRealtimePeersIndex(api, currentUserId) {
    const now = Date.now();
    if (_peersIndexCache.index && (now - _peersIndexCache.builtAt) < 5000) {
        return _peersIndexCache.index;
    }

    const index = new Map();
    try {
        const result = await api.atomes.list({ type: 'share_request', ownerId: currentUserId });
        const all = normalizeDualListResult(result, 'atomes');

        for (const raw of all) {
            const particles = raw?.particles || raw?.data || {};
            const box = particles.box || null;
            const status = particles.status || null;
            const mode = particles.mode || null;
            const shareType = _extractShareTypeFromRequestParticles(particles);

            if (shareType !== 'linked') continue;
            if (mode !== 'real-time') continue;
            // Linked-share realtime should start immediately after share creation.
            // Share requests are created as `pending` for UI approval, but permissions are already granted.
            if (status !== 'active' && status !== 'pending') continue;

            const atomeIds = Array.isArray(particles.atomeIds) ? particles.atomeIds : [];
            if (!atomeIds.length) continue;

            let peerUserId = null;
            if (box === 'outbox') peerUserId = particles.targetUserId || null;
            if (box === 'inbox') peerUserId = particles.sharerId || null;
            if (!peerUserId) continue;

            for (const atomeId of atomeIds) {
                if (!atomeId) continue;
                const key = String(atomeId);
                if (!index.has(key)) index.set(key, new Set());
                index.get(key).add(String(peerUserId));
            }
        }
    } catch (e) {
        console.warn('[ShareAPI] Failed to build realtime peers index:', e.message);
    }

    // Convert Sets to Arrays for stable iteration
    const normalized = new Map();
    for (const [k, set] of index.entries()) {
        normalized.set(k, Array.from(set));
    }

    _peersIndexCache = { builtAt: now, index: normalized };
    return normalized;
}

async function _registerRealtimeHandlers() {
    if (_realtimeInstalled) return;
    _realtimeInstalled = true;

    try {
        // Ensure we can receive share-sync and notifications
        await ensureRemoteCommandsReady();

        RemoteCommands.register(SHARE_SYNC_COMMAND, async (params, sender) => {
            try {
                const api = window.AdoleAPI || AdoleAPI;
                const current = await getCurrentUser();
                if (!current?.id) return;

                // New linked-share payload: patch a shared atome (same ID) for realtime collaboration
                const atomeId = params?.atomeId || params?.atome_id || null;
                const directPatch = params?.particles || null;
                if (atomeId && directPatch && typeof directPatch === 'object') {
                    // Enforce per-property permissions (sender-based) when possible
                    try {
                        const ctx = await _getPermissionContextForInboundCommand(api, current.id, String(atomeId), sender?.userId);
                        if (ctx && ctx.ownerUserId && ctx.permissions) {
                            const filtered = _filterParticlesByPermissions({
                                particles: directPatch,
                                actorUserId: sender?.userId,
                                ownerUserId: ctx.ownerUserId,
                                permissions: ctx.permissions
                            });
                            if (!filtered || Object.keys(filtered).length === 0) return;
                            params = { ...params, particles: filtered };
                        }
                    } catch (_) { }

                    // Linked share uses the same atome_id: DB is already updated by the author.
                    // Here we only apply a UI patch to reflect changes in realtime.
                    try {
                        const ui = BuiltinHandlers?.handlers?.shareSync;
                        if (typeof ui === 'function') {
                            ui({ atomeId: String(atomeId), particles: params?.particles || directPatch }, sender);
                        }
                    } catch (_) { }

                    // Learn peer so we can sync back in Tauri-only scenarios.
                    try {
                        if (sender?.userId) _rememberRuntimePeer(String(atomeId), String(sender.userId));
                    } catch (_) { }
                    return;
                }

                const direction = params?.direction || null;
                const originalAtomeId = params?.originalAtomeId || null;
                const sharedAtomeId = params?.sharedAtomeId || null;
                const particlesPatch = params?.particles || null;

                if (!particlesPatch || typeof particlesPatch !== 'object') return;

                // Enforce per-property permissions (sender-based) when possible
                try {
                    const anchorAtomeId = direction === 'to-origin' ? String(originalAtomeId || '') : String(sharedAtomeId || '');
                    if (anchorAtomeId) {
                        const ctx = await _getPermissionContextForInboundCommand(api, current.id, anchorAtomeId, sender?.userId);
                        if (ctx && ctx.ownerUserId && ctx.permissions) {
                            const filtered = _filterParticlesByPermissions({
                                particles: particlesPatch,
                                actorUserId: sender?.userId,
                                ownerUserId: ctx.ownerUserId,
                                permissions: ctx.permissions
                            });
                            if (!filtered || Object.keys(filtered).length === 0) return;
                            params = { ...params, particles: filtered };
                        }
                    }
                } catch (_) { }

                // Update receiver copy
                if (direction === 'to-copy') {
                    let targetId = sharedAtomeId;

                    // Fallback lookup for legacy payloads
                    if (!targetId && originalAtomeId && sender?.userId) {
                        const listRes = await api.atomes.list({ ownerId: current.id });
                        const atomes = normalizeAtomesFromListResult(listRes);
                        const found = atomes.find(a => {
                            const p = a.particles || {};
                            return String(p.originalAtomeId || '') === String(originalAtomeId) &&
                                String(p.sharedFrom || '') === String(sender.userId) &&
                                String(p.shareType || 'linked') === 'linked';
                        });
                        if (found?.id) targetId = found.id;
                    }

                    if (!targetId) return;

                    // Apply UI patch immediately when possible
                    try {
                        const ui = BuiltinHandlers?.handlers?.shareSync;
                        if (typeof ui === 'function') {
                            ui({ atomeId: String(targetId), particles: params?.particles || particlesPatch }, sender);
                        }
                    } catch (_) { }

                    await _withSuppressedSync(targetId, () => api.atomes.alter(targetId, params?.particles || particlesPatch));
                    return;
                }

                // Update origin (sender side)
                if (direction === 'to-origin') {
                    if (!originalAtomeId) return;

                    // Apply UI patch immediately when possible
                    try {
                        const ui = BuiltinHandlers?.handlers?.shareSync;
                        if (typeof ui === 'function') {
                            ui({ atomeId: String(originalAtomeId), particles: params?.particles || particlesPatch }, sender);
                        }
                    } catch (_) { }

                    await _withSuppressedSync(originalAtomeId, () => api.atomes.alter(originalAtomeId, params?.particles || particlesPatch));
                    return;
                }
            } catch (e) {
                console.warn('[ShareAPI] share-sync handler error:', e.message);
            }
        });

        RemoteCommands.register(SHARE_DELETE_COMMAND, async (params, sender) => {
            try {
                const targetId = String(params?.atomeId || params?.sharedAtomeId || params?.originalAtomeId || '');
                if (!targetId) return;

                const candidates = [
                    document.getElementById('atome_' + targetId),
                    document.getElementById(targetId)
                ].filter(Boolean);

                for (const el of candidates) {
                    try { el.remove(); } catch (_) { }
                }

                try {
                    window.dispatchEvent(new CustomEvent('adole-share-deleted', {
                        detail: {
                            atomeId: targetId,
                            from: sender?.userId || null,
                            at: params?.at || new Date().toISOString()
                        }
                    }));
                } catch (_) { }
            } catch (e) {
                console.warn('[ShareAPI] share-delete handler error:', e.message);
            }
        });

        RemoteCommands.register(SHARE_ACCEPTED_COMMAND, async (params, sender) => {
            try {
                const api = window.AdoleAPI || AdoleAPI;
                const current = await getCurrentUser();
                if (!current?.id) return;

                const requestId = params?.requestId || null;
                if (!requestId) return;

                // Mark matching outbox request as active so realtime sync can use it
                const listRes = await api.atomes.list({ type: 'share_request', ownerId: current.id });
                const all = normalizeDualListResult(listRes, 'atomes');
                const outbox = all.filter(a => {
                    const p = a.particles || a.data || {};
                    return (p.box === 'outbox') && (p.requestId === requestId);
                });

                for (const req of outbox) {
                    const id = req.atome_id || req.id;
                    if (!id) continue;
                    await api.atomes.alter(id, {
                        status: 'active',
                        acceptedAt: new Date().toISOString(),
                        acceptedBy: sender?.userId || null,
                        linkMappings: params?.mappings || null
                    });
                }

                // Invalidate cache
                _outboxIndexCache.builtAt = 0;
                _peersIndexCache.builtAt = 0;
            } catch (e) {
                console.warn('[ShareAPI] share-accepted handler error:', e.message);
            }
        });
    } catch (e) {
        console.warn('[ShareAPI] Failed to register realtime handlers:', e.message);
    }
}

async function _installAlterWrapper() {
    if (_wrappedAlterInstalled) return;
    _wrappedAlterInstalled = true;

    const api = window.AdoleAPI || AdoleAPI;
    if (!api?.atomes?.alter) return;

    // Avoid double-wrapping
    if (api.atomes.alter && api.atomes.alter.__shareWrapped) return;

    const originalAlter = api.atomes.alter.bind(api.atomes);

    const pushRealtimePatch = async (atomeId, newParticles) => {
        try {
            const id = String(atomeId || '');
            if (!id) return;
            if (_suppressSyncForAtomeIds.has(id)) return;
            if (!newParticles || typeof newParticles !== 'object') return;

            // Enforce property-level permissions for the current user (outbound)
            try {
                const current = await getCurrentUser();
                if (!current?.id) return;
                const ctx = await _getPermissionContextForOutboundMutation(api, current.id, id);
                const filtered = _filterParticlesByPermissions({
                    particles: newParticles,
                    actorUserId: current.id,
                    ownerUserId: ctx?.ownerUserId || null,
                    permissions: ctx?.permissions || null
                });
                if (!filtered || Object.keys(filtered).length === 0) return;
                newParticles = filtered;
            } catch (_) { }

            // Clean/unified realtime:
            // send a broadcast-only patch to the server (ws/api action='realtime'),
            // which then fan-outs to all share recipients.
            if (!api?.atomes?.realtimePatch) return;

            const key = (() => {
                try { return JSON.stringify(newParticles); } catch { return String(Date.now()); }
            })();

            const existing = _realtimePatchStateByAtomeId.get(id) || { inFlight: false, pending: null, lastKey: '' };
            // Skip duplicates when not in-flight
            if (!existing.inFlight && existing.lastKey === key) return;

            existing.pending = newParticles;
            _realtimePatchStateByAtomeId.set(id, existing);

            if (existing.inFlight) return;
            existing.inFlight = true;

            const loop = async () => {
                try {
                    while (true) {
                        const state = _realtimePatchStateByAtomeId.get(id);
                        if (!state || !state.pending) break;

                        const payload = state.pending;
                        state.pending = null;
                        try {
                            state.lastKey = JSON.stringify(payload);
                        } catch (_) {
                            state.lastKey = String(Date.now());
                        }

                        // Await to apply backpressure and keep the websocket buffer healthy
                        await api.atomes.realtimePatch(id, payload);
                    }
                } catch (_) {
                    // silent
                } finally {
                    const state = _realtimePatchStateByAtomeId.get(id);
                    if (state) state.inFlight = false;
                }
            };

            loop();
        } catch (_) {
            // Keep this silent by default to avoid drag spam.
        }
    };

    // Allow UI code (like check.js drag) to push realtime updates without persisting to DB.
    // Fire-and-forget usage: window.__SHARE_REALTIME_PUSH__(atomeId, { left, top })
    window.__SHARE_REALTIME_PUSH__ = (atomeId, particles) => pushRealtimePatch(atomeId, particles);

    const wrapped = async (atomeId, newParticles, callback) => {
        // Enforce property-level permissions before persisting
        try {
            const id = String(atomeId || '');
            if (id && newParticles && typeof newParticles === 'object') {
                const current = await getCurrentUser();
                if (current?.id) {
                    const ctx = await _getPermissionContextForOutboundMutation(api, current.id, id);
                    const filtered = _filterParticlesByPermissions({
                        particles: newParticles,
                        actorUserId: current.id,
                        ownerUserId: ctx?.ownerUserId || null,
                        permissions: ctx?.permissions || null
                    });
                    if (!filtered || Object.keys(filtered).length === 0) {
                        return {
                            tauri: { success: false, data: null, error: 'Blocked by share permissions' },
                            fastify: { success: false, data: null, error: 'Blocked by share permissions' },
                            blocked: true
                        };
                    }
                    newParticles = filtered;
                }
            }
        } catch (_) { }

        const res = await originalAlter(atomeId, newParticles, callback);

        try {
            const id = String(atomeId || '');
            if (!id) return res;
            if (_suppressSyncForAtomeIds.has(id)) return res;

            const current = await getCurrentUser();
            if (!current?.id) return res;

            // Only attempt sync when local update actually succeeded
            const ok = !!(res?.tauri?.success || res?.fastify?.success);
            if (!ok) return res;

            // Linked-share realtime: send patch to peers for the same atome ID
            await pushRealtimePatch(id, newParticles, current.id);

            // Load atome to detect if it's a linked shared copy
            const got = await api.atomes.get(id);
            const atome = got?.tauri?.atome || got?.fastify?.atome;
            const particles = atome?.particles || atome?.data || {};

            const shareType = particles.shareType || 'linked';

            // Receiver copy -> send patch back to origin
            if (shareType === 'linked' && particles.originalAtomeId && particles.sharedFrom) {
                await RemoteCommands.sendCommand(String(particles.sharedFrom), SHARE_SYNC_COMMAND, {
                    direction: 'to-origin',
                    originalAtomeId: String(particles.originalAtomeId),
                    particles: newParticles,
                    fromUserId: current.id,
                    at: new Date().toISOString()
                });
                return res;
            }

            // Origin atome -> push patch to all active linked copies
            const outboxIndex = await _buildOutboxIndex(api, current.id);
            const targets = outboxIndex.get(id) || [];
            if (!targets.length) return res;

            for (const t of targets) {
                if (!t?.targetUserId || !t?.sharedAtomeId) continue;
                await RemoteCommands.sendCommand(String(t.targetUserId), SHARE_SYNC_COMMAND, {
                    direction: 'to-copy',
                    originalAtomeId: id,
                    sharedAtomeId: String(t.sharedAtomeId),
                    particles: newParticles,
                    fromUserId: current.id,
                    requestId: t.requestId || null,
                    at: new Date().toISOString()
                });
            }
        } catch (e) {
            console.warn('[ShareAPI] Realtime sync send failed:', e.message);
        }

        return res;
    };

    wrapped.__shareWrapped = true;
    api.atomes.alter = wrapped;
}

async function _installRealtimePatchWrapper() {
    if (_wrappedRealtimePatchInstalled) return;
    _wrappedRealtimePatchInstalled = true;

    const api = window.AdoleAPI || AdoleAPI;
    if (!api?.atomes?.realtimePatch) return;
    if (api.atomes.realtimePatch && api.atomes.realtimePatch.__shareWrapped) return;

    const original = api.atomes.realtimePatch.bind(api.atomes);

    const wrapped = async (atomeId, particles, callback) => {
        try {
            const id = String(atomeId || '');
            if (id && particles && typeof particles === 'object') {
                const current = await getCurrentUser();
                if (current?.id) {
                    const ctx = await _getPermissionContextForOutboundMutation(api, current.id, id);
                    const filtered = _filterParticlesByPermissions({
                        particles,
                        actorUserId: current.id,
                        ownerUserId: ctx?.ownerUserId || null,
                        permissions: ctx?.permissions || null
                    });
                    if (!filtered || Object.keys(filtered).length === 0) {
                        return {
                            tauri: { success: false, data: null, error: 'Blocked by share permissions' },
                            fastify: { success: false, data: null, error: 'Blocked by share permissions' },
                            blocked: true
                        };
                    }
                    particles = filtered;
                }
            }
        } catch (_) { }

        return original(atomeId, particles, callback);
    };

    wrapped.__shareWrapped = true;
    api.atomes.realtimePatch = wrapped;
}

async function _installDeleteWrapper() {
    if (_wrappedDeleteInstalled) return;
    _wrappedDeleteInstalled = true;

    const api = window.AdoleAPI || AdoleAPI;
    if (!api?.atomes?.delete) return;
    if (api.atomes.delete && api.atomes.delete.__shareWrapped) return;

    const originalDelete = api.atomes.delete.bind(api.atomes);

    // Fire-and-forget usage: window.__SHARE_REALTIME_DELETE__(atomeId)
    window.__SHARE_REALTIME_DELETE__ = async (atomeId) => {
        try {
            const id = String(atomeId || '');
            if (!id) return;
            const current = await getCurrentUser();
            if (!current?.id) return;
            await ensureRemoteCommandsReady(current.id);
            await RemoteCommands.sendCommand('*', SHARE_DELETE_COMMAND, {
                atomeId: id,
                fromUserId: current.id,
                at: new Date().toISOString()
            });
        } catch (_) {
            // silent
        }
    };

    const wrapped = async (atomeId, callback) => {
        const id = String(atomeId || '');
        if (!id) return originalDelete(atomeId, callback);

        let currentUserId = null;
        let precomputedTargets = [];
        let precomputedRuntimePeers = [];

        try {
            const current = await getCurrentUser();
            if (current?.id) {
                currentUserId = String(current.id);
                // If this user is the sharer, outbox index tells us who to notify.
                const outboxIndex = await _buildOutboxIndex(api, currentUserId);
                precomputedTargets = outboxIndex.get(id) || [];
                precomputedRuntimePeers = _getRuntimePeers(id);
            }
        } catch (_) { }

        // Enforce delete permission for receivers
        try {
            const current = await getCurrentUser();
            if (current?.id) {
                const ctx = await _getPermissionContextForOutboundMutation(api, current.id, id);
                const ownerId = String(ctx?.ownerUserId || '');
                const perms = ctx?.permissions || null;
                if (ownerId && String(current.id) !== ownerId) {
                    const allowed = !!(perms && perms.delete === true);
                    if (!allowed) {
                        return {
                            tauri: { success: false, data: null, error: 'Blocked by share permissions' },
                            fastify: { success: false, data: null, error: 'Blocked by share permissions' },
                            blocked: true
                        };
                    }
                }
            }
        } catch (_) { }

        const res = await originalDelete(atomeId, callback);

        try {
            const current = await getCurrentUser();
            if (!current?.id) return res;
            currentUserId = String(current.id);

            const ok = !!(res?.tauri?.success || res?.fastify?.success);
            if (!ok) return res;

            // 1) Broadcast a realtime "deleted" patch so linked-share participants remove immediately
            try {
                if (typeof api.atomes.realtimePatch === 'function') {
                    await api.atomes.realtimePatch(id, { __deleted: true, deletedBy: current.id, at: new Date().toISOString() });
                }
            } catch (_) { }

            // 2) Direct-message recipients (works even when ws/api realtime fanout isn't wired)
            try {
                await ensureRemoteCommandsReady(current.id);

                // Notify outbox recipients
                for (const t of precomputedTargets) {
                    if (!t?.targetUserId) continue;
                    const targetAtomeId = String(t.sharedAtomeId || id);
                    await RemoteCommands.sendCommand(String(t.targetUserId), SHARE_DELETE_COMMAND, {
                        atomeId: targetAtomeId,
                        originalAtomeId: id,
                        requestId: t.requestId || null,
                        fromUserId: current.id,
                        at: new Date().toISOString()
                    });
                }

                // Notify runtime peers (bidirectional collaboration cases)
                for (const peerId of precomputedRuntimePeers) {
                    if (!peerId) continue;
                    await RemoteCommands.sendCommand(String(peerId), SHARE_DELETE_COMMAND, {
                        atomeId: id,
                        fromUserId: current.id,
                        at: new Date().toISOString()
                    });
                }
            } catch (_) { }
        } catch (_) { }

        return res;
    };

    wrapped.__shareWrapped = true;
    api.atomes.delete = wrapped;
}

async function getCurrentUser() {
    try {
        const api = window.AdoleAPI || AdoleAPI;
        if (!api?.auth?.current) return null;
        const result = await api.auth.current();
        if (result?.logged && result?.user) {
            const id = result.user.user_id || result.user.atome_id || result.user.id;
            return { id, ...result.user };
        }
        return null;
    } catch (e) {
        console.error('[ShareAPI] Failed to get current user:', e);
        return null;
    }
}

function pickFirstAvailable(obj, paths) {
    for (const path of paths) {
        try {
            const parts = path.split('.');
            let cur = obj;
            for (const p of parts) {
                if (!cur) { cur = null; break; }
                cur = cur[p];
            }
            if (cur !== undefined && cur !== null && String(cur).trim() !== '') return cur;
        } catch (_) {
            // ignore
        }
    }
    return null;
}

function looksLikeUuid(id) {
    if (!id) return false;
    const s = String(id);
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

function getSelectedAtomeId() {
    if (typeof window === 'undefined') return null;
    const selected = window.__selectedAtomeId;
    if (!selected) return null;
    if (!looksLikeUuid(selected)) return null;
    return String(selected);
}

function getCurrentProjectIdFromGlobals() {
    const api = window.AdoleAPI || AdoleAPI;
    try {
        if (api?.projects?.getCurrentId) {
            const id = api.projects.getCurrentId();
            if (id) return id;
        }
    } catch (_) { }
    return null;
}

function normalizeAtomesFromListResult(result) {
    const atomes = normalizeDualListResult(result, 'atomes');
    return atomes.map(a => {
        const id = a.atome_id || a.id;
        const type = a.atome_type || a.type || 'unknown';
        const parentId = a.parent_id || a.parentId || a.project_id || a.projectId || null;
        const particles = a.particles || a.data || {};
        const label = particles.name || particles.text || `${type} (${String(id).slice(0, 8)})`;
        return { id, type, parentId, label, particles, raw: a };
    });
}

function normalizeDualListResult(result, key) {
    const tauriItems = result?.tauri?.[key] || [];
    const fastifyItems = result?.fastify?.[key] || [];
    return [...tauriItems, ...fastifyItems];
}

function dedupeById(items, getId) {
    const seen = new Set();
    const out = [];
    for (const item of items) {
        const id = getId(item);
        if (!id) continue;
        if (seen.has(id)) continue;
        seen.add(id);
        out.push(item);
    }
    return out;
}

function normalizeUsersFromListResult(result) {
    const users = normalizeDualListResult(result, 'users');
    const normalized = users
        .map(u => {
            const id = u.user_id || u.atome_id || u.id;
            const username = u.username || u.data?.username || u.particles?.username || 'Unknown';
            const phone = u.phone || u.data?.phone || u.particles?.phone || null;
            return { id, username, phone, raw: u };
        });
    return dedupeById(normalized, (u) => u.id);
}

function normalizeProjectsFromListResult(result) {
    const projects = normalizeDualListResult(result, 'projects');
    const normalized = projects
        .map(p => {
            const id = p.atome_id || p.id;
            const name = p.name || p.data?.name || p.particles?.name || 'Unnamed Project';
            return { id, name, raw: p };
        });
    return dedupeById(normalized, (p) => p.id);
}

function safeString(v) {
    if (v === null || v === undefined) return '';
    return String(v);
}

async function resolveUserByPhone(phone) {
    if (!phone) return null;
    const api = window.AdoleAPI || AdoleAPI;

    // Scalable path: O(1) lookup, avoids enumerating large public directories.
    try {
        if (api?.auth?.lookupPhone) {
            const found = await api.auth.lookupPhone(phone);
            if (found && (found.id || found.user_id)) {
                return {
                    id: found.id || found.user_id,
                    username: found.username,
                    phone: found.phone
                };
            }
        }
    } catch {
        // Ignore and fallback to directory list.
    }

    const usersResult = await api.auth.list();
    const users = normalizeDualListResult(usersResult, 'users');
    const found = users.find(u => (u.phone || u.data?.phone || u.particles?.phone) === phone);
    if (!found) return null;
    return {
        id: found.user_id || found.atome_id || found.id,
        username: found.username || found.data?.username || found.particles?.username,
        phone: found.phone || found.data?.phone || found.particles?.phone
    };
}

async function notifyUser(userId, payload) {
    try {
        if (!userId) return { ok: false, error: 'Missing userId' };
        await ensureRemoteCommandsReady();
        const result = await RemoteCommands.sendCommand(userId, 'show-notification', payload);
        return { ok: true, result };
    } catch (e) {
        return { ok: false, error: e.message };
    }
}

function buildShareMeta({ duration, condition }) {
    const meta = {};
    if (duration) meta.duration = duration;
    if (condition) meta.condition = condition;
    return meta;
}

const ShareAPI = {
    async list_users() {
        try {
            const api = window.AdoleAPI || AdoleAPI;
            const result = await api.auth.list();
            return { ok: true, data: result };
        } catch (e) {
            return { ok: false, error: e.message };
        }
    },

    async list_users_normalized() {
        const res = await this.list_users();
        if (!res.ok) return { ok: false, error: res.error, items: [] };
        return { ok: true, items: normalizeUsersFromListResult(res.data) };
    },

    async list_projects() {
        try {
            const api = window.AdoleAPI || AdoleAPI;
            const result = await api.projects.list();
            return { ok: true, data: result };
        } catch (e) {
            return { ok: false, error: e.message };
        }
    },

    async list_projects_normalized() {
        const res = await this.list_projects();
        if (!res.ok) return { ok: false, error: res.error, items: [] };
        return { ok: true, items: normalizeProjectsFromListResult(res.data) };
    },

    async list_current_project_atomes_normalized() {
        try {
            const api = window.AdoleAPI || AdoleAPI;
            const current = await getCurrentUser();
            if (!current?.id) return { ok: false, error: 'Not logged in', items: [] };

            const projectId = getCurrentProjectIdFromGlobals();
            if (!projectId) return { ok: false, error: 'No current project', items: [] };

            const result = await api.atomes.list({ ownerId: current.id });
            const all = normalizeAtomesFromListResult(result);
            const filtered = all.filter(a => {
                if (!a?.id) return false;
                const particles = a.particles || {};
                const particleProjectId = particles.projectId || particles.project_id || null;
                const belongsToProject = (a.parentId === projectId) || (particleProjectId === projectId);
                if (!belongsToProject) return false;
                if (a.type === 'project' || a.type === 'user') return false;
                if (a.type === 'message' || a.type === 'share_request') return false;
                return true;
            });

            let unique = dedupeById(filtered, (x) => x.id);

            unique.sort((a, b) => safeString(a.type).localeCompare(safeString(b.type)) || safeString(a.label).localeCompare(safeString(b.label)));

            return { ok: true, items: unique, projectId };
        } catch (e) {
            return { ok: false, error: e.message, items: [] };
        }
    },

    async list_shares() {
        try {
            const api = window.AdoleAPI || AdoleAPI;
            const result = await api.atomes.list({ type: 'share_request' });
            const items = normalizeDualListResult(result, 'atomes');

            const mapped = items
                .map(a => {
                    const particles = a.particles || a.data || {};
                    return {
                        atomeId: a.atome_id || a.id,
                        requestId: particles.requestId,
                        box: particles.box || null,
                        status: particles.status || null,
                        sharerId: particles.sharerId || null,
                        targetPhone: particles.targetPhone,
                        targetUserId: particles.targetUserId,
                        atomeIds: particles.atomeIds || [],
                        permissions: particles.permissions || null,
                        mode: particles.mode,
                        timestamp: particles.timestamp,
                        shareMeta: particles.propertyOverrides?.__shareMeta || null,
                        sharedAtomes: particles.sharedAtomes || []
                    };
                })
                .filter(e => e.requestId || e.atomeId);

            const seen = new Set();
            const deduped = [];
            for (const entry of mapped) {
                const key = entry.requestId || entry.atomeId;
                if (seen.has(key)) continue;
                seen.add(key);
                deduped.push(entry);
            }

            deduped.sort((a, b) => safeString(b.timestamp).localeCompare(safeString(a.timestamp)));

            return { ok: true, items: deduped };
        } catch (e) {
            return { ok: false, error: e.message, items: [] };
        }
    },

    /**
     * Share API
     * @param {Array<{phone:string, userId?:string, username?:string}>} targets
     * @param {Object} options
     * @param {'real-time'|'validation-based'} options.mode
     * @param {Array<string>} options.atomeIds
     * @param {string|null} [options.duration]
     * @param {string|null} [options.condition]
     * @param {Object} [options.permissions]
     */
    async share_with(users_cible, type_de_partage_or_options, duree_du_partage = null, condition = null) {
        const api = window.AdoleAPI || AdoleAPI;

        // Ensure realtime handlers are ready as early as possible
        _registerRealtimeHandlers().catch(() => { });
        _installAlterWrapper().catch(() => { });
        _installRealtimePatchWrapper().catch(() => { });
        _installDeleteWrapper().catch(() => { });

        const options = (type_de_partage_or_options && typeof type_de_partage_or_options === 'object')
            ? type_de_partage_or_options
            : {
                mode: type_de_partage_or_options || 'real-time',
                duration: duree_du_partage,
                condition
            };

        const mode = options?.mode || 'real-time';
        const atomeIds = Array.isArray(options?.atomeIds) ? options.atomeIds : [];
        const duration = options?.duration || null;
        const cond = options?.condition || null;

        const shareType = options?.shareType || options?.linkType || 'linked';

        const permissions = options?.permissions || { read: true, alter: true, delete: false, create: false };
        const propertyOverrides = {
            __shareMeta: buildShareMeta({ duration, condition: cond }),
            __shareType: String(shareType)
        };

        if (!Array.isArray(users_cible) || users_cible.length === 0) {
            return { ok: false, error: 'No targets provided' };
        }
        if (!atomeIds.length) {
            const selected = getSelectedAtomeId();
            if (selected) {
                options.atomeIds = [String(selected)];
            } else {
                return { ok: false, error: 'No atomes to share. Select an atome first.' };
            }
        }
        if (!['real-time', 'validation-based'].includes(mode)) {
            return { ok: false, error: 'Invalid share mode' };
        }

        const current = await getCurrentUser();
        if (!current?.id) {
            return { ok: false, error: 'Not logged in' };
        }

        // Needed for notifications + realtime commands in this example
        await ensureRemoteCommandsReady(current.id);

        const results = [];
        for (const target of users_cible) {
            const phone = target?.phone;
            if (!phone) {
                results.push({ ok: false, error: 'Missing target phone' });
                continue;
            }

            // Hint the underlying API with the canonical userId to avoid slow phone lookup.
            const perTargetOverrides = {
                ...propertyOverrides,
                __targetUserId: target?.userId ? String(target.userId) : undefined
            };

            const shareResult = await api.sharing.share(phone, atomeIds, permissions, mode, perTargetOverrides, null);
            const backendOk = !!(shareResult?.tauri?.success || shareResult?.fastify?.success);
            results.push({
                ok: backendOk,
                phone,
                shareResult,
                error: backendOk ? null : (shareResult?.tauri?.error || shareResult?.fastify?.error || 'Share failed')
            });

            // Notify immediately if userId is known; fallback to phone lookup only if needed.
            const notifyId = target?.userId ? String(target.userId) : (await resolveUserByPhone(phone))?.id;
            if (notifyId) {
                const msg = (mode === 'validation-based')
                    ? `A share request was created (${mode}). Open Share to accept/reject.`
                    : `A share was created (${mode}). Open Share to import into a project.`;
                await notifyUser(notifyId, {
                    title: 'New share',
                    message: msg,
                    duration: 3500
                });
            }
        }

        const ok = results.every(r => r.ok);
        return { ok, results };
    },

    /**
     * Push a validation-based share by re-sharing its atomes.
     * This uses the existing share primitive and records a new share_request entry.
     */
    async push_share(shareEntry) {
        try {
            if (!shareEntry?.targetPhone) return { ok: false, error: 'Missing targetPhone' };
            const atomeIds = Array.isArray(shareEntry.atomeIds) ? shareEntry.atomeIds : [];
            if (!atomeIds.length) return { ok: false, error: 'Missing atomeIds' };

            const duration = shareEntry?.shareMeta?.duration || null;
            const condition = shareEntry?.shareMeta?.condition || null;

            const permissions = shareEntry.permissions || { read: true, alter: true, delete: false, create: false };

            const res = await this.share_with(
                [{ phone: shareEntry.targetPhone, userId: shareEntry.targetUserId }],
                {
                    mode: 'validation-based',
                    atomeIds,
                    duration,
                    condition,
                    permissions
                }
            );

            const resolved = await resolveUserByPhone(shareEntry.targetPhone);
            if (resolved?.id) {
                await notifyUser(resolved.id, {
                    title: 'Share update',
                    message: 'A new shared state was pushed.',
                    duration: 3500
                });
            }

            return res;
        } catch (e) {
            return { ok: false, error: e.message };
        }
    }
    ,

    async accept_request(requestAtomeId) {
        try {
            if (!requestAtomeId) return { ok: false, error: 'Missing requestAtomeId' };

            // Ensure realtime handlers are ready as early as possible
            _registerRealtimeHandlers().catch(() => { });
            _installAlterWrapper().catch(() => { });

            const api = window.AdoleAPI || AdoleAPI;
            const current = await getCurrentUser();
            if (!current?.id) return { ok: false, error: 'Not logged in' };

            await ensureRemoteCommandsReady(current.id);

            const projectId = getCurrentProjectIdFromGlobals();
            if (!projectId) return { ok: false, error: 'No current project selected' };

            const got = await api.atomes.get(requestAtomeId);
            const atome = got?.tauri?.atome || got?.fastify?.atome;
            if (!atome) return { ok: false, error: 'Share request not found' };

            const particles = atome.particles || atome.data || {};
            const status = particles.status || 'pending';
            const box = particles.box || 'inbox';

            const shareType = _extractShareTypeFromRequestParticles(particles);

            if (box !== 'inbox') return { ok: false, error: 'Not an inbox request' };
            if (status === 'accepted' || status === 'active') return { ok: true, alreadyAccepted: true };
            if (status === 'rejected') return { ok: false, error: 'Request already rejected' };

            const sharedAtomes = Array.isArray(particles.sharedAtomes) ? particles.sharedAtomes : [];
            if (!sharedAtomes.length) return { ok: false, error: 'Request has no payload to import' };

            const importedIds = [];
            const mappings = [];

            // Preload recipient atomes once for legacy requests (copy-based)
            const listRes = await api.atomes.list({ ownerId: current.id });
            const recipientAtomes = normalizeAtomesFromListResult(listRes);

            for (const item of sharedAtomes) {
                const originalAtomeId = item?.originalId || item?.original_atome_id || item?.originalAtomeId || null;
                let sharedAtomeId = item?.sharedAtomeId || item?.shared_atome_id || item?.createdAtomeId || null;

                // Permission-based linked share: shared atome is the original atome (same ID)
                if (!sharedAtomeId && shareType === 'linked' && originalAtomeId) {
                    sharedAtomeId = originalAtomeId;
                }

                // Legacy fallback: find existing shared copy created by the sharer
                if (!sharedAtomeId && originalAtomeId) {
                    const found = recipientAtomes.find(a => {
                        const p = a.particles || {};
                        return String(p.originalAtomeId || '') === String(originalAtomeId) &&
                            String(p.sharedFrom || '') === String(particles.sharerId || '') &&
                            String(p.shareType || 'linked') === String(shareType);
                    });
                    if (found?.id) sharedAtomeId = found.id;
                }

                if (!sharedAtomeId) continue;

                if (shareType === 'linked') {
                    // Linked share keeps the same atome_id; we must NOT move it between projects.
                    // Instead, create a local link inside the receiver's current project.
                    const linkParticles = {
                        type: 'share_link',
                        projectId: String(projectId),
                        project_id: String(projectId),
                        linkedAtomeId: String(sharedAtomeId),
                        originalAtomeId: originalAtomeId ? String(originalAtomeId) : null,
                        shareRequestId: String(requestAtomeId),
                        sharerId: particles.sharerId || null,
                        mode: particles.mode || null,
                        inboxItem: false,
                        assignedToProject: true,
                        acceptedAt: new Date().toISOString()
                    };

                    // Avoid duplicates: if a link already exists in this project for the same linkedAtomeId, reuse it.
                    let existingLinkId = null;
                    try {
                        const existing = await api.atomes.list({ type: 'share_link', ownerId: current.id });
                        const links = normalizeAtomesFromListResult(existing);
                        const found = links.find(a => {
                            const p = a.particles || a.data || {};
                            const pid = a.project_id || a.projectId || a.parent_id || a.parentId;
                            return String(p.linkedAtomeId || '') === String(sharedAtomeId) && String(pid || '') === String(projectId);
                        });
                        if (found?.id) existingLinkId = String(found.id);
                    } catch (_) { }

                    if (!existingLinkId) {
                        await api.atomes.create({
                            type: 'share_link',
                            ownerId: current.id,
                            projectId: projectId,
                            particles: linkParticles
                        });
                    }

                    importedIds.push(String(sharedAtomeId));
                    if (originalAtomeId) mappings.push({ originalAtomeId: String(originalAtomeId), sharedAtomeId: String(sharedAtomeId) });
                } else {
                    // Copy-based share: assign shared atome into the currently opened project
                    await api.atomes.alter(sharedAtomeId, {
                        projectId,
                        project_id: projectId,
                        assignedToProject: true,
                        inboxItem: false,
                        acceptedAt: new Date().toISOString(),
                        importedFromShareRequest: requestAtomeId
                    });

                    importedIds.push(String(sharedAtomeId));
                    if (originalAtomeId) mappings.push({ originalAtomeId: String(originalAtomeId), sharedAtomeId: String(sharedAtomeId) });
                }
            }

            const newStatus = (shareType === 'linked' && (particles.mode || '') === 'real-time') ? 'active' : 'accepted';

            await api.atomes.alter(requestAtomeId, {
                status: newStatus,
                acceptedAt: new Date().toISOString(),
                importedAtomesCount: importedIds.length,
                importedAtomeIds: importedIds,
                linkMappings: mappings
            });

            // Notify sharer so they can activate outbox record for realtime sync
            try {
                if (particles.sharerId && particles.requestId && newStatus === 'active') {
                    await RemoteCommands.sendCommand(String(particles.sharerId), SHARE_ACCEPTED_COMMAND, {
                        requestId: particles.requestId,
                        mappings,
                        targetUserId: current.id,
                        at: new Date().toISOString()
                    });
                }
            } catch (_) { }

            _peersIndexCache.builtAt = 0;

            // Trigger UI/project refresh without a full page reload
            try {
                if (typeof window !== 'undefined') {
                    window.dispatchEvent(new CustomEvent('adole-share-imported', {
                        detail: { projectId, importedIds, requestAtomeId }
                    }));
                }
            } catch (_) { }

            return { ok: true, imported: importedIds.length, importedIds };
        } catch (e) {
            return { ok: false, error: e.message };
        }
    },

    async reject_request(requestAtomeId) {
        try {
            if (!requestAtomeId) return { ok: false, error: 'Missing requestAtomeId' };
            const api = window.AdoleAPI || AdoleAPI;
            await api.atomes.alter(requestAtomeId, {
                status: 'rejected',
                rejectedAt: new Date().toISOString()
            });
            return { ok: true };
        } catch (e) {
            return { ok: false, error: e.message };
        }
    },

    async set_request_status(requestAtomeId, status) {
        try {
            if (!requestAtomeId) return { ok: false, error: 'Missing requestAtomeId' };
            if (!status) return { ok: false, error: 'Missing status' };

            const api = window.AdoleAPI || AdoleAPI;
            await api.atomes.alter(requestAtomeId, {
                status: String(status),
                statusUpdatedAt: new Date().toISOString()
            });
            return { ok: true };
        } catch (e) {
            return { ok: false, error: e.message };
        }
    },

    get_selected_atome_id() {
        return getSelectedAtomeId();
    }
};

// Install realtime plumbing eagerly (safe no-op if RemoteCommands not started yet)
_registerRealtimeHandlers().catch(() => { });
_installAlterWrapper().catch(() => { });
_installRealtimePatchWrapper().catch(() => { });
_installDeleteWrapper().catch(() => { });

window.ShareAPI = ShareAPI;

export { ShareAPI };
export default ShareAPI;
