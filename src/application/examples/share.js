// ============================================
// SHARE SYSTEM (LOGIC ONLY)
// ============================================

import { AdoleAPI } from '../../squirrel/apis/unified/adole_apis.js';
import { RemoteCommands } from '/squirrel/apis/remote_commands.js';

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

        const permissions = options?.permissions || { read: true, alter: true, delete: false, create: false };
        const propertyOverrides = { __shareMeta: buildShareMeta({ duration, condition: cond }) };

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

        const results = [];
        for (const target of users_cible) {
            const phone = target?.phone;
            if (!phone) {
                results.push({ ok: false, error: 'Missing target phone' });
                continue;
            }

            const shareResult = await api.sharing.share(phone, atomeIds, permissions, mode, propertyOverrides, null);
            const backendOk = !!(shareResult?.tauri?.success || shareResult?.fastify?.success);
            results.push({
                ok: backendOk,
                phone,
                shareResult,
                error: backendOk ? null : (shareResult?.tauri?.error || shareResult?.fastify?.error || 'Share failed')
            });

            const resolved = await resolveUserByPhone(phone);
            if (resolved?.id) {
                const msg = (mode === 'validation-based')
                    ? `A share request was created (${mode}). Open Share to accept/reject.`
                    : `A share was created (${mode}). Open Share to import into a project.`;
                await notifyUser(resolved.id, {
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

            const api = window.AdoleAPI || AdoleAPI;
            const current = await getCurrentUser();
            if (!current?.id) return { ok: false, error: 'Not logged in' };

            const projectId = getCurrentProjectIdFromGlobals();
            if (!projectId) return { ok: false, error: 'No current project selected' };

            const got = await api.atomes.get(requestAtomeId);
            const atome = got?.tauri?.atome || got?.fastify?.atome;
            if (!atome) return { ok: false, error: 'Share request not found' };

            const particles = atome.particles || atome.data || {};
            const status = particles.status || 'pending';
            const box = particles.box || 'inbox';

            if (box !== 'inbox') return { ok: false, error: 'Not an inbox request' };
            if (status === 'accepted') return { ok: true, alreadyAccepted: true };
            if (status === 'rejected') return { ok: false, error: 'Request already rejected' };

            const sharedAtomes = Array.isArray(particles.sharedAtomes) ? particles.sharedAtomes : [];
            if (!sharedAtomes.length) return { ok: false, error: 'Request has no payload to import' };

            const createdIds = [];
            for (const item of sharedAtomes) {
                const sharedData = item?.sharedData || item?.shared_data || null;
                if (!sharedData) continue;
                const type = sharedData.type || 'shape';
                const p = sharedData.particles || {};

                // Remove inbox markers if present
                const particlesClean = { ...p };
                delete particlesClean.inboxItem;
                delete particlesClean.assignedToProject;

                const created = await api.atomes.create({
                    type,
                    ownerId: current.id,
                    projectId,
                    particles: {
                        ...particlesClean,
                        inboxItem: false,
                        assignedToProject: true,
                        importedFromShareRequest: requestAtomeId,
                        importedAt: new Date().toISOString()
                    }
                });

                const createdId = created?.tauri?.data?.id || created?.fastify?.data?.id || created?.tauri?.data?.atome_id || created?.fastify?.data?.atome_id;
                if (createdId) createdIds.push(createdId);
            }

            await api.atomes.alter(requestAtomeId, {
                status: 'accepted',
                acceptedAt: new Date().toISOString(),
                importedAtomesCount: createdIds.length,
                importedAtomeIds: createdIds
            });

            return { ok: true, imported: createdIds.length, importedIds: createdIds };
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

window.ShareAPI = ShareAPI;

export { ShareAPI };
export default ShareAPI;
