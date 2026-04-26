import { generateUUID } from '../adole.js';
import { getSessionState, setCurrentProjectCache, getCurrentProjectCache, clearCurrentProjectCache, updateWindowProject } from './session.js';
import { list_atomes, create_atome, delete_atome, get_atome, syncLocalProjectsToFastify } from './atomes.js';

const with_callback = (result, callback) => {
    if (typeof callback === 'function') callback(result);
    return result;
};

const dispatchProjectChanged = (detail = {}) => {
    if (typeof window === 'undefined') return;
    try {
        window.dispatchEvent(new CustomEvent('squirrel:project-changed', { detail }));
    } catch (_) { }
};

const getCurrentUserId = () => {
    const state = getSessionState();
    return state?.user?.id || null;
};

const isLoggedOut = () => getSessionState().mode === 'logged_out';

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

export async function create_project(projectName, callback) {
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
    return with_callback(result, callback);
}

export async function list_projects(callback) {
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
        includeShared: getSessionState().mode === 'authenticated'
    });

    const onlyProjects = (items) => items.filter((record) => {
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

    if (Array.isArray(tauriProjects) && tauriProjects.length > 0
        && Array.isArray(fastifyProjects)) {
        const fastifyIds = new Set(
            fastifyProjects.map((p) => p?.id || p?.atome_id).filter(Boolean).map(String)
        );
        const hasMissing = tauriProjects.some((p) => {
            const id = p?.id || p?.atome_id;
            return id && !fastifyIds.has(String(id));
        });
        if (hasMissing) {
            try {
                syncLocalProjectsToFastify({ reason: 'list_projects' }).catch(() => { });
            } catch (_) { }
        }
    }

    return with_callback(result, callback);
}

export async function delete_project(projectId, callback) {
    if (!projectId) {
        const error = 'Missing project id.';
        return with_callback({
            tauri: { success: false, error },
            fastify: { success: false, error }
        }, callback);
    }

    const result = await delete_atome(projectId);
    return with_callback(result, callback);
}

export function get_current_project_id() {
    if (typeof window !== 'undefined' && window.__currentProject?.id) {
        return window.__currentProject.id;
    }
    return null;
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

    if (ownerId && String(ownerId) !== String(currentUserId)) {
        return false;
    }

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
    dispatchProjectChanged(payload);
    return true;
}

export async function load_saved_current_project() {
    const currentUserId = getCurrentUserId();
    if (!currentUserId || isLoggedOut()) return null;

    const cached = getCurrentProjectCache();
    if (cached?.id && (!cached.userId || String(cached.userId) === String(currentUserId))) {
        return { id: cached.id, name: cached.name || null };
    }

    // Fallback: try reading user atome for current_project_id if available
    try {
        const userAtome = await get_atome(currentUserId);
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
    } catch (_) { }

    return null;
}

export default {
    create_project,
    list_projects,
    delete_project,
    get_current_project_id,
    get_current_project,
    set_current_project,
    load_saved_current_project
};
