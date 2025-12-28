// ============================================
// SHARE SYSTEM (LOGIC ONLY)
// ============================================

import { AdoleAPI } from '../../squirrel/apis/unified/adole_apis.js';
import { RemoteCommands } from '/squirrel/apis/remote_commands.js';
import { BuiltinHandlers } from '/squirrel/apis/remote_command_handlers.js';

const SHARE_CREATE_COMMAND = 'share-create';
const SHARE_PUBLISH_COMMAND = 'share-publish';

let remoteHandlersRegistered = false;
let remoteStartInFlight = false;

function normalizeId(raw) {
    return raw?.atome_id || raw?.id || raw?.user_id || raw?.userId || null;
}

function normalizeParticles(raw) {
    return raw?.particles || raw?.data || {};
}

function normalizeUser(raw) {
    const particles = normalizeParticles(raw);
    return {
        id: normalizeId(raw),
        username: raw?.username || particles.username || null,
        phone: raw?.phone || particles.phone || null,
        visibility: raw?.visibility || particles.visibility || null,
        raw
    };
}

function normalizeProject(raw) {
    const particles = normalizeParticles(raw);
    return {
        id: normalizeId(raw),
        type: raw?.atome_type || raw?.type || 'project',
        name: particles.name || particles.projectName || particles.label || 'Untitled',
        particles,
        raw
    };
}

function normalizeAtome(raw) {
    const particles = normalizeParticles(raw);
    return {
        id: normalizeId(raw),
        type: raw?.atome_type || raw?.type || 'atome',
        parentId: raw?.parent_id || raw?.parentId || raw?.project_id || raw?.projectId || null,
        particles,
        raw
    };
}

function extractList(result, key) {
    const direct = result?.[key];
    if (Array.isArray(direct)) return direct;
    const data = result?.data;
    if (Array.isArray(data)) return data;
    if (Array.isArray(data?.[key])) return data[key];
    return [];
}

function pickAuthoritativeList(result, key) {
    const fastifyError = result?.fastify?.error || null;
    const tauriError = result?.tauri?.error || null;
    const fastifyItems = extractList(result?.fastify, key);
    const tauriItems = extractList(result?.tauri, key);

    if (!fastifyError) return fastifyItems;
    if (!tauriError) return tauriItems;
    return fastifyItems.length ? fastifyItems : tauriItems;
}

function pickAuthoritativeAtome(result) {
    const fastifyOk = result?.fastify && (result.fastify.success || result.fastify.ok) && !result.fastify.error;
    const tauriOk = result?.tauri && (result.tauri.success || result.tauri.ok) && !result.tauri.error;

    if (fastifyOk) return result.fastify.atome || result.fastify.data || null;
    if (tauriOk) return result.tauri.atome || result.tauri.data || null;
    return result?.fastify?.atome || result?.tauri?.atome || null;
}

async function getCurrentUser() {
    try {
        const result = await AdoleAPI.auth.current();
        if (result?.logged && result?.user) {
            return {
                id: result.user.user_id || result.user.atome_id || result.user.id || null,
                username: result.user.username || null,
                phone: result.user.phone || null
            };
        }
    } catch (_) { }
    return null;
}

function getCurrentProjectInfo() {
    if (typeof window === 'undefined') return { id: null, name: null, backgroundColor: null };
    if (window.__currentProject?.id) {
        const name = window.__currentProject.name || window.__currentProject.projectName || window.__currentProject.label || null;
        return {
            id: window.__currentProject.id,
            name,
            backgroundColor: window.__currentProject.backgroundColor || null
        };
    }
    if (typeof AdoleAPI !== 'undefined' && AdoleAPI.projects?.getCurrent) {
        return AdoleAPI.projects.getCurrent();
    }
    return { id: null, name: null, backgroundColor: null };
}

function getCurrentProjectId() {
    if (typeof window === 'undefined') return null;
    if (window.__currentProject?.id) return window.__currentProject.id;
    if (typeof AdoleAPI !== 'undefined' && AdoleAPI.projects?.getCurrentId) {
        return AdoleAPI.projects.getCurrentId();
    }
    return null;
}

function normalizeAtomeIds(raw) {
    if (Array.isArray(raw)) return raw.map(String).filter(Boolean);
    if (raw) return [String(raw)];
    return [];
}

async function resolveSharedProjectId(atomeIds) {
    for (const atomeId of atomeIds) {
        try {
            const result = await AdoleAPI.atomes.get(atomeId);
            const atome = pickAuthoritativeAtome(result);
            const type = atome?.atome_type || atome?.type || null;
            if (type === 'project') return String(atomeId);
        } catch (_) { }
    }
    return null;
}

async function getShareRequestInfo(requestAtomeId) {
    if (!requestAtomeId) return { shareType: null, atomeIds: [], projectId: null };
    try {
        const result = await AdoleAPI.atomes.get(requestAtomeId);
        const atome = pickAuthoritativeAtome(result);
        const particles = normalizeParticles(atome);
        const shareType = particles.shareType
            || particles.propertyOverrides?.__shareType
            || particles.propertyOverrides?.shareType
            || null;
        const atomeIds = normalizeAtomeIds(particles.atomeIds || particles.atome_ids || particles.atomeId || particles.atome_id);
        let projectId = particles.projectId || particles.project_id || null;
        if (!projectId && atomeIds.length) {
            projectId = await resolveSharedProjectId(atomeIds);
        }
        return { shareType, atomeIds, projectId };
    } catch (_) {
        return { shareType: null, atomeIds: [], projectId: null };
    }
}

function registerRemoteHandlers() {
    if (remoteHandlersRegistered) return;
    remoteHandlersRegistered = true;

    try {
        BuiltinHandlers.registerAll();
    } catch (e) {
        console.warn('[ShareAPI] Failed to register builtin handlers:', e.message);
    }

    try {
        RemoteCommands.register(SHARE_CREATE_COMMAND, (params, sender) => {
            if (typeof window === 'undefined') return;
            const detail = { ...(params || {}), sender: sender || null };
            window.dispatchEvent(new CustomEvent('adole-share-create', { detail }));
        });
        RemoteCommands.register(SHARE_PUBLISH_COMMAND, (params, sender) => {
            if (typeof window === 'undefined') return;
            const detail = { ...(params || {}), sender: sender || null };
            window.dispatchEvent(new CustomEvent('adole-share-publish', { detail }));
        });
    } catch (e) {
        console.warn('[ShareAPI] Failed to register share handlers:', e.message);
    }
}

async function ensureRemoteCommandsReady(explicitUserId = null) {
    registerRemoteHandlers();

    try {
        if (RemoteCommands?.isActive?.()) return true;
    } catch (_) { }

    if (remoteStartInFlight) return false;
    remoteStartInFlight = true;
    try {
        const userId = explicitUserId || (await getCurrentUser())?.id;
        if (!userId) return false;
        const started = await RemoteCommands.start(userId);
        return !!started;
    } catch (e) {
        console.warn('[ShareAPI] Failed to start RemoteCommands:', e.message);
        return false;
    } finally {
        remoteStartInFlight = false;
    }
}

if (typeof window !== 'undefined') {
    window.addEventListener('squirrel:user-logged-in', (event) => {
        const userId = event?.detail?.userId || event?.detail?.user_id || null;
        ensureRemoteCommandsReady(userId).catch(() => { });
    });

    window.__SHARE_REALTIME_PUSH__ = (atomeId, particles) => {
        try {
            return AdoleAPI.atomes.realtimePatch(atomeId, particles);
        } catch (e) {
            return Promise.reject(e);
        }
    };
}

const ShareAPI = {
    async list_users() {
        try {
            const result = await AdoleAPI.auth.list();
            return { ok: true, data: result };
        } catch (e) {
            return { ok: false, error: e.message };
        }
    },

    async list_users_normalized() {
        const res = await this.list_users();
        if (!res.ok) return { ok: false, error: res.error, items: [] };
        const raw = pickAuthoritativeList(res.data, 'users');
        const users = raw.map(normalizeUser).filter(u => u.id);
        const seen = new Set();
        const unique = [];
        for (const user of users) {
            if (seen.has(user.id)) continue;
            seen.add(user.id);
            unique.push(user);
        }
        return { ok: true, items: unique };
    },

    async list_projects() {
        try {
            const result = await AdoleAPI.projects.list();
            return { ok: true, data: result };
        } catch (e) {
            return { ok: false, error: e.message };
        }
    },

    async list_projects_normalized() {
        const res = await this.list_projects();
        if (!res.ok) return { ok: false, error: res.error, items: [] };
        const raw = pickAuthoritativeList(res.data, 'projects');
        const projects = raw.map(normalizeProject).filter(p => p.id);
        return { ok: true, items: projects };
    },

    async list_current_project_atomes_normalized() {
        try {
            const projectId = getCurrentProjectId();
            if (!projectId) return { ok: false, error: 'No current project', items: [] };

            const result = await AdoleAPI.atomes.list({ projectId });
            const raw = pickAuthoritativeList(result, 'atomes');
            const atomes = raw.map(normalizeAtome).filter(a => a.id);

            const filtered = atomes.filter(a => {
                if (a.type === 'project' || a.type === 'user') return false;
                if (a.type === 'share_request') return false;
                const projectMatch = a.parentId === projectId
                    || a.particles.projectId === projectId
                    || a.particles.project_id === projectId;
                return projectMatch;
            });

            const items = filtered.map(a => {
                const label = a.particles.name || a.particles.label || a.type;
                return { id: a.id, type: a.type, label, particles: a.particles };
            });

            const projectInfo = getCurrentProjectInfo();
            const projectLabel = projectInfo?.name || 'Current project';
            if (!items.some(item => String(item.id) === String(projectId))) {
                items.unshift({ id: projectId, type: 'project', label: projectLabel, particles: {} });
            }

            return { ok: true, items, projectId };
        } catch (e) {
            return { ok: false, error: e.message, items: [] };
        }
    },

    async list_shares() {
        try {
            const result = await AdoleAPI.atomes.list({ type: 'share_request', skipOwner: true });
            const raw = pickAuthoritativeList(result, 'atomes');
            const items = raw.map((a) => {
                const particles = normalizeParticles(a);
                return {
                    atomeId: normalizeId(a),
                    requestId: particles.requestId || null,
                    box: particles.box || null,
                    status: particles.status || null,
                    sharerId: particles.sharerId || particles.sharer_id || null,
                    targetPhone: particles.targetPhone || particles.target_phone || null,
                    targetUserId: particles.targetUserId || particles.target_user_id || null,
                    atomeIds: particles.atomeIds || [],
                    permissions: particles.permissions || null,
                    mode: particles.mode || null,
                    timestamp: particles.timestamp || null,
                    shareMeta: particles.propertyOverrides?.__shareMeta || null,
                    shareType: particles.shareType || particles.propertyOverrides?.__shareType || null
                };
            }).filter(item => item.atomeId || item.requestId);

            items.sort((a, b) => String(b.timestamp || '').localeCompare(String(a.timestamp || '')));
            return { ok: true, items };
        } catch (e) {
            return { ok: false, error: e.message, items: [] };
        }
    },

    async share_with(users_cible, type_de_partage_or_options, duree_du_partage = null, condition = null) {
        const targets = Array.isArray(users_cible) ? users_cible : [];

        const options = (typeof type_de_partage_or_options === 'object' && type_de_partage_or_options)
            ? type_de_partage_or_options
            : {
                mode: type_de_partage_or_options,
                atomeIds: Array.isArray(duree_du_partage) ? duree_du_partage : [],
                duration: condition || null
            };

        const mode = options.mode || 'real-time';
        const shareType = options.shareType || 'linked';
        const atomeIds = Array.isArray(options.atomeIds) ? options.atomeIds.map(String).filter(Boolean) : [];
        const permissions = options.permissions || { read: true, alter: true, delete: false, create: true };
        const duration = options.duration || duree_du_partage || null;
        const shareCondition = options.condition || condition || null;

        if (!targets.length) return { ok: false, error: 'No target users provided', results: [] };
        if (!atomeIds.length) return { ok: false, error: 'No atomes selected', results: [] };

        const results = [];
        for (const target of targets) {
            const phone = target?.phone || null;
            if (!phone) {
                results.push({ ok: false, error: 'Missing target phone' });
                continue;
            }

            const overrides = {
                __shareType: shareType,
                __targetUserId: target?.userId ? String(target.userId) : undefined
            };

            if (duration || shareCondition) {
                overrides.__shareMeta = {
                    duration: duration || null,
                    condition: shareCondition || null
                };
            }

            const shareResult = await AdoleAPI.sharing.share(phone, atomeIds, permissions, mode, overrides, null);
            const ok = !!(shareResult?.tauri?.success || shareResult?.fastify?.success);
            results.push({
                ok,
                phone,
                shareResult,
                error: ok ? null : (shareResult?.tauri?.error || shareResult?.fastify?.error || 'Share failed')
            });
            if (!ok) {
                console.warn('[ShareAPI] share_with failed', {
                    phone,
                    atomeIds,
                    permissions,
                    mode,
                    shareType,
                    shareResult
                });
            }
        }

        const ok = results.every(r => r.ok);
        return { ok, results };
    },

    async push_share(shareEntry) {
        try {
            if (!shareEntry?.atomeId && !shareEntry?.requestId) {
                return { ok: false, error: 'Missing share request id' };
            }

            const res = await AdoleAPI.sharing.publish({
                requestAtomeId: shareEntry.atomeId,
                requestId: shareEntry.requestId
            });

            const ok = !!(res?.ok || res?.success);
            return { ok, data: res, error: ok ? null : (res?.error || res?.message || 'Publish failed') };
        } catch (e) {
            return { ok: false, error: e.message };
        }
    },

    async accept_request(requestAtomeId) {
        try {
            if (!requestAtomeId) return { ok: false, error: 'Missing requestAtomeId' };
            const receiverProjectId = getCurrentProjectId();
            const shareInfo = await getShareRequestInfo(requestAtomeId);
            const res = await AdoleAPI.sharing.respond({
                requestAtomeId: requestAtomeId,
                status: 'accepted',
                receiverProjectId: receiverProjectId || null
            });
            const ok = !!(res?.ok || res?.success);
            const imported = Array.isArray(res?.data?.copies) ? res.data.copies.length : 0;
            let sharedProjectId = shareInfo.projectId || null;
            if (ok && !sharedProjectId && Array.isArray(shareInfo.atomeIds) && shareInfo.atomeIds.length) {
                try {
                    sharedProjectId = await resolveSharedProjectId(shareInfo.atomeIds);
                } catch (_) {
                    sharedProjectId = null;
                }
            }
            if (ok && typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('adole-share-imported', {
                    detail: {
                        projectId: receiverProjectId || null,
                        requestAtomeId,
                        shareType: shareInfo.shareType || null,
                        sharedProjectId,
                        atomeIds: shareInfo.atomeIds || []
                    }
                }));
            }
            return {
                ok,
                imported,
                shareType: shareInfo.shareType || null,
                sharedProjectId,
                data: res,
                error: ok ? null : (res?.error || res?.message || 'Accept failed')
            };
        } catch (e) {
            return { ok: false, error: e.message };
        }
    },

    async reject_request(requestAtomeId) {
        try {
            if (!requestAtomeId) return { ok: false, error: 'Missing requestAtomeId' };
            const res = await AdoleAPI.sharing.respond({
                requestAtomeId: requestAtomeId,
                status: 'rejected'
            });
            const ok = !!(res?.ok || res?.success);
            return { ok, data: res, error: ok ? null : (res?.error || res?.message || 'Reject failed') };
        } catch (e) {
            return { ok: false, error: e.message };
        }
    },

    async set_request_status(requestAtomeId, status) {
        try {
            if (!requestAtomeId) return { ok: false, error: 'Missing requestAtomeId' };
            if (!status) return { ok: false, error: 'Missing status' };
            const res = await AdoleAPI.atomes.alter(requestAtomeId, {
                status: String(status),
                statusUpdatedAt: new Date().toISOString()
            });
            const ok = !!(res?.tauri?.success || res?.fastify?.success);
            return { ok, data: res, error: ok ? null : (res?.tauri?.error || res?.fastify?.error || 'Status update failed') };
        } catch (e) {
            return { ok: false, error: e.message };
        }
    },

    get_selected_atome_id() {
        if (typeof window === 'undefined') return null;
        return window.__selectedAtomeId || null;
    }
};

export { ShareAPI };
export default ShareAPI;
