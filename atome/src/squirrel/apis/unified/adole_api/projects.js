import { generateUUID } from '../adole.js';
import { getSessionState, setCurrentProjectCache, getCurrentProjectCache, updateWindowProject, readWindowProjectId } from './session.js';
import { list_atomes, create_atome, delete_atomes, get_atome } from './atomes.js';
import { resolveAtomeId, resolveAtomeParentId, resolveAtomeProjectId } from './atome_record_projection.js';
import { with_callback, getCurrentUserId, isLoggedOut } from './activities_support.js';
import { ATOME_CHANGE_EVENTS, dispatchAtomeChange } from '../atome_change_signal.js';

const dispatchProjectChanged = (detail = {}) => {
    if (typeof window === 'undefined') return;
    
        window.dispatchEvent(new CustomEvent('squirrel:project-changed', { detail }));
    
};

const dispatchProjectAtomeEvent = (eventName, detail = {}) => {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent(eventName, { detail }));
};

const normalizeProject = (record) => {
    if (!record || typeof record !== 'object') return null;
    const id = record.atome_id || record.id || null;
    const props = record.properties || record.particles || record.data || {};
    return {
        ...record,
        atome_id: id || record.atome_id,
        id: id || record.id,
        properties: props,
        particles: props,
        data: props
    };
};

export async function create_project(projectName, options = {}, callback = null) {
    if (typeof options === 'function') { callback = options; options = {}; }
    const currentUserId = getCurrentUserId();
    if (!currentUserId || isLoggedOut()) {
        const error = 'No user logged in. Please log in first.';
        return with_callback({
            tauri: { success: false, error },
            fastify: { success: false, error }
        }, callback);
    }

    const projectId = generateUUID();
    const properties = {
        ...(options?.properties || {}),
        name: projectName || 'untitled',
        created_at: new Date().toISOString(),
        owner_id: currentUserId
    };

    const payload = {
        id: projectId,
        atome_id: projectId,
        type: 'project',
        atome_type: 'project',
        owner_id: currentUserId,
        properties
    };

    const result = await create_atome(payload);
    const created = result?.tauri?.success === true || result?.fastify?.success === true || result?.ok === true || result?.success === true;
    const normalized = created ? {
        ...result,
        id: projectId,
        atome_id: projectId,
        project_id: projectId
    } : result;
    if (created) {
        dispatchProjectAtomeEvent('squirrel:atome-created', {
            id: projectId,
            atome_id: projectId,
            projectId,
            project_id: projectId,
            type: 'project',
            atome_type: 'project',
            properties
        });
    }
    return with_callback(normalized, callback);
}

const PROJECT_LIST_EXCLUDED_PARTICLES = Object.freeze(['preview_url']);

export async function list_projects(options = {}, callback) {
    if (typeof options === 'function') {
        callback = options;
        options = {};
    }
    const currentUserId = getCurrentUserId();
    if (!currentUserId || isLoggedOut()) {
        const error = 'No user logged in. Cannot list projects.';
        const result = {
            tauri: { projects: [], error },
            fastify: { projects: [], error },
            meta: { source: null }
        };
        return with_callback(result, callback);
    }

    const listResult = await list_atomes({
        type: 'project',
        ownerId: currentUserId,
        excludeParticleKeys: options.includePreviewSources === true ? [] : PROJECT_LIST_EXCLUDED_PARTICLES,
        includeShared: getSessionState().mode === 'authenticated'
    });

    const onlyProjects = (items) => items.filter((record) => {
        const properties = record?.properties || record?.particles || record?.data || {};
        if (record?.deleted_at || record?.deletedAt || record?.__deleted === true || properties.__deleted === true) {
            return false;
        }
        const type = record?.atome_type || record?.type || record?.kind
            || record?.properties?.type || record?.properties?.kind
            || record?.particles?.type || record?.particles?.kind
            || record?.data?.type || record?.data?.kind
            || null;
        return String(type || '').toLowerCase() === 'project';
    });

    const tauriProjects = Array.isArray(listResult?.tauri?.atomes)
        ? onlyProjects(listResult.tauri.atomes).map(normalizeProject).filter(Boolean)
        : [];
    const fastifyProjects = Array.isArray(listResult?.fastify?.atomes)
        ? onlyProjects(listResult.fastify.atomes).map(normalizeProject).filter(Boolean)
        : [];

    const result = {
        tauri: { projects: tauriProjects, error: listResult?.tauri?.error || null },
        fastify: { projects: fastifyProjects, error: listResult?.fastify?.error || null },
        meta: listResult?.meta || null
    };

    return with_callback(result, callback);
}

// What a project holds (D36, user 5 Nov. 2026: deleting a project deletes its content): every atome of its scope (the
// record's `project_id`, the server's own index of a project) and, recursively, every atome held by one of them
// (`meta.parent_id`), held ones first so the project goes last.
const PROJECT_CONTENT_LIMIT = Number.MAX_SAFE_INTEGER;
async function project_content(projectId) {
    const listed = await list_atomes({ project_id: projectId, limit: PROJECT_CONTENT_LIMIT });
    const side = listed?.meta?.source === 'tauri' ? 'tauri' : 'fastify';
    if (listed?.[side]?.error) return { ok: false, error: listed[side].error };
    const records = (listed[side].atomes || []).map(record => ({ id: String(resolveAtomeId(record) || ''), type: record.atome_type || record.type || null,
        project: String(resolveAtomeProjectId(record) || ''), parent: String(resolveAtomeParentId(record) || '') })).filter(record => record.id && record.id !== projectId);
    const held = new Set([projectId]), order = [];
    for (let grew = true; grew;) {
        grew = false;
        for (const record of records) {
            if (held.has(record.id) || (record.project !== projectId && !held.has(record.parent))) continue;
            held.add(record.id); order.push(record); grew = true;
        }
    }
    return { ok: true, records: order.reverse() };
}

// The projects held by `projectId` (a Données folder's subfolders, a project imported into an open one: R-202 Q14/Q17), at
// every depth: each is its own scope (`project_id` its own id), held by its canonical parent (`meta.parent_id`), so its
// project's content listing never names it. Deepest first, as their content goes before them.
async function held_projects(projectId) {
    const listed = await list_atomes({ type: 'project', limit: PROJECT_CONTENT_LIMIT });
    const side = listed?.meta?.source === 'tauri' ? 'tauri' : 'fastify';
    if (listed?.[side]?.error) return { ok: false, error: listed[side].error };
    const parentOf = new Map((listed[side].atomes || []).map(record => [String(resolveAtomeId(record) || ''), String(resolveAtomeParentId(record) || '')]));
    // A chain that comes back on itself never reaches the project: records written before the server refused a
    // parent cycle (a project its own parent, 1 Oct. 2026) froze the page in this walk on every deletion (R-212, 21 Nov. 2026).
    const depthOf = (id) => {
        const seen = new Set([id]);
        let depth = 0;
        for (let at = parentOf.get(id); at; at = parentOf.get(at)) {
            if (at === projectId) return depth + 1;
            if (seen.has(at)) return 0;
            seen.add(at);
            depth += 1;
        }
        return 0;
    };
    const held = [...parentOf.keys()].map(id => ({ id, depth: id && id !== projectId ? depthOf(id) : 0 })).filter(entry => entry.depth > 0);
    return { ok: true, ids: held.sort((a, b) => b.depth - a.depth).map(entry => entry.id) };
}

// Everything deleted with a project, the project last: each held project's content then that project, deepest first,
// then the project's own content (D36: deleting a project deletes its content; R-202: a folder goes with all it holds).
async function project_deletion(projectId) {
    const nested = await held_projects(projectId);
    if (!nested.ok) return nested;
    const records = [];
    for (const id of [...nested.ids, projectId]) {
        const content = await project_content(id);
        if (!content.ok) return content;
        records.push(...content.records, ...(id === projectId ? [] : [{ id, type: 'project', project: id, parent: '' }]));
    }
    return { ok: true, records };
}

export async function delete_project(projectId, callback) {
    if (!projectId) {
        const error = 'Missing project id.';
        return with_callback({
            tauri: { success: false, error },
            fastify: { success: false, error }
        }, callback);
    }

    const content = await project_deletion(String(projectId));
    if (!content.ok) {
        const error = `project_content_unreadable:${content.error}`;
        return with_callback({ tauri: { success: false, error }, fastify: { success: false, error } }, callback);
    }
    const result = await delete_atomes([...content.records.map(record => record.id), String(projectId)]);
    const deleted = result?.tauri?.success === true || result?.fastify?.success === true || result?.ok === true || result?.success === true;
    if (deleted) {
        // Every atome it held is announced gone, as a commit announces it (atome_change_signal.js): a calendar event of the
        // project leaves the calendar's reads and its alarms, native ones included, at once.
        if (typeof window !== 'undefined') content.records.forEach(record => dispatchAtomeChange(window, ATOME_CHANGE_EVENTS.deleted, { id: record.id,
            atome_id: record.id, project_id: projectId, atome_type: record.type, source: 'local', origin: 'commit', durable: true }));
        dispatchProjectAtomeEvent('squirrel:atome-deleted', {
            id: projectId,
            atome_id: projectId,
            projectId,
            project_id: projectId,
            type: 'project',
            atome_type: 'project'
        });
    }
    return with_callback(result, callback);
}

export function get_current_project_id() {
    return readWindowProjectId();
}

export function get_current_project() {
    if (typeof window !== 'undefined' && window.__currentProject) {
        return window.__currentProject;
    }
    return null;
}

export async function set_current_project(projectId, projectName = null, ownerId = null, persist = true) {
    const currentUserId = getCurrentUserId();
    if (!currentUserId || isLoggedOut() || !projectId) return false;

    const payload = {
        id: String(projectId),
        name: projectName || null,
        userId: currentUserId,
        updatedAt: Date.now()
    };

    if (persist) {
        setCurrentProjectCache(payload);
    }

    updateWindowProject(payload);
    dispatchProjectChanged({
        ...payload,
        ownerId: ownerId ? String(ownerId) : null
    });
    return true;
}

// A project that is no longer the person's (a share they left, or that its owner ended): it stops being their current
// project, remembered on this device and named in the session, so no screen lists it as theirs. Another project stays current.
export function forget_current_project(projectId) {
    const id = String(projectId || '');
    if (!id) throw new Error('forget_current_project_id_required');
    if (readWindowProjectId() !== id && String(getCurrentProjectCache()?.id || '') !== id) return false;
    setCurrentProjectCache(null);
    updateWindowProject(null);
    return true;
}

export async function load_saved_current_project() {
    const currentUserId = getCurrentUserId();
    if (!currentUserId || isLoggedOut()) return null;

    const cached = getCurrentProjectCache();
    if (cached?.id && cached.userId && String(cached.userId) === String(currentUserId)) {
        return { id: cached.id, name: cached.name || null };
    }

    // Fallback: try reading user atome for current_project_id if available.
    // A brand-new web account has no user atome in the local workspace yet: that
    // means "nothing saved", not a failure. Throwing here failed the workspace boot
    // eleven times, so the Communication owner (messages, News) never loaded.
        let userAtome = null;
        try {
            userAtome = await get_atome(currentUserId);
        } catch (error) {
            if (String(error?.message || error) !== 'atome_not_available_locally') throw error;
            return null;
        }
        if (getCurrentUserId() !== currentUserId || isLoggedOut()) throw new Error('project_bootstrap_context_changed');
        const selected = getCurrentProjectCache();
        if (selected?.userId === currentUserId && selected.id && selected.id !== cached?.id) {
            return { id: selected.id, name: selected.name || null };
        }
        const raw = userAtome?.atome || userAtome?.data || null;
        if (raw && typeof raw === 'object') {
            const props = raw.properties || raw.particles || raw.data || {};
            const savedId = props.current_project_id || props.currentProjectId || null;
            const savedName = props.current_project_name || props.currentProjectName || null;
            if (savedId) {
                const payload = { id: String(savedId), name: savedName || null, userId: currentUserId };
                setCurrentProjectCache(payload);
                return { id: payload.id, name: payload.name };
            }
        }
    

    return null;
}

export default {
    create_project,
    list_projects,
    delete_project,
    get_current_project_id,
    get_current_project,
    set_current_project,
    forget_current_project,
    load_saved_current_project
};
