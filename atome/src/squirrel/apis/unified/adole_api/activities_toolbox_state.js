import { create_atome, alter_atome, get_atome } from './atomes.js';
import {
    with_callback,
    getCurrentUserId,
    isLoggedOut,
    resolveProjectId,
    sanitizeLayerIdPart
} from './activities_support.js';

const sanitizeProjectState = (value) => {
    if (!value || typeof value !== 'object') return null;
    const tools = Array.isArray(value.tools) ? value.tools : [];
    return {
        version: Number.isFinite(value.version) ? value.version : 1,
        tools: tools
            .map((tool) => (tool && typeof tool === 'object' ? { ...tool } : null))
            .filter(Boolean)
    };
};

const resolveProjectStateId = (userId, projectId) => {
    const safeUser = sanitizeLayerIdPart(userId, 'user');
    const safeProject = sanitizeLayerIdPart(projectId, 'project');
    return `project_toolbox_state_${safeUser}_${safeProject}`;
};

const normalizeScopeState = (value) => {
    const scope = String(value || '').trim().toLowerCase();
    if (scope === 'global' || scope === 'activity' || scope === 'project') return scope;
    return '';
};

const resolveScopedToolboxStateId = (userId, scope, activityId = null, projectId = null) => {
    if (scope === 'project') {
        return resolveProjectStateId(userId, projectId);
    }
    const safeUser = sanitizeLayerIdPart(userId, 'user');
    const safeScope = sanitizeLayerIdPart(scope, 'scope');
    const safeActivity = sanitizeLayerIdPart(activityId, 'all');
    const safeProject = sanitizeLayerIdPart(projectId, 'all');
    return `toolbox_scope_state_${safeScope}_${safeUser}_${safeActivity}_${safeProject}`;
};

const saveScopedToolboxState = async (scope, options = {}, callback) => {
    const currentUserId = getCurrentUserId();
    if (!currentUserId || isLoggedOut()) {
        const error = 'No user logged in. Please log in first.';
        return with_callback({
            tauri: { success: false, error },
            fastify: { success: false, error }
        }, callback);
    }

    const normalizedScope = normalizeScopeState(scope || options.scope);
    if (!normalizedScope) {
        const error = 'Invalid scope for toolbox state.';
        return with_callback({
            tauri: { success: false, error },
            fastify: { success: false, error }
        }, callback);
    }

    const projectId = resolveProjectId(options);
    const activityId = options.activity_id || options.activityId || null;
    if (normalizedScope === 'project' && !projectId) {
        const error = 'Missing project id for project toolbox state.';
        return with_callback({
            tauri: { success: false, error },
            fastify: { success: false, error }
        }, callback);
    }
    if (normalizedScope === 'activity' && !activityId) {
        const error = 'Missing activity id for activity toolbox state.';
        return with_callback({
            tauri: { success: false, error },
            fastify: { success: false, error }
        }, callback);
    }

    const desktopState = sanitizeProjectState(options.desktop_state || options.desktopState);
    const atomeId = resolveScopedToolboxStateId(currentUserId, normalizedScope, activityId, projectId);
    const props = {
        scope: normalizedScope,
        activity_id: activityId || null,
        activityId: activityId || null,
        project_id: projectId,
        projectId,
        desktop_state: desktopState,
        desktopState: desktopState,
        updated_at: new Date().toISOString()
    };

    const existing = await get_atome(atomeId).catch(() => null);
    const existingAtome = existing?.atome || existing?.data || null;
    if (existingAtome && typeof existingAtome === 'object') {
        const result = await alter_atome(atomeId, props);
        return with_callback(result, callback);
    }

    const payload = {
        id: atomeId,
        atome_id: atomeId,
        type: normalizedScope === 'project' ? 'project_toolbox_state' : 'toolbox_scope_state',
        atome_type: normalizedScope === 'project' ? 'project_toolbox_state' : 'toolbox_scope_state',
        owner_id: currentUserId,
        parent_id: projectId || activityId || null,
        project_id: projectId,
        properties: props
    };
    const result = await create_atome(payload);
    return with_callback(result, callback);
};

const getScopedToolboxState = async (scope, options = {}, callback) => {
    const currentUserId = getCurrentUserId();
    if (!currentUserId || isLoggedOut()) {
        const error = 'No user logged in. Cannot read project toolbox state.';
        return with_callback({ ok: false, error, desktop_state: null }, callback);
    }

    const normalizedScope = normalizeScopeState(scope || options.scope);
    if (!normalizedScope) {
        const error = 'Invalid scope for toolbox state.';
        return with_callback({ ok: false, error, desktop_state: null }, callback);
    }

    const resolvedProjectId = options.project_id || options.projectId || resolveProjectId(options);
    const resolvedActivityId = options.activity_id || options.activityId || null;
    if (normalizedScope === 'project' && !resolvedProjectId) {
        const error = 'Missing project id.';
        return with_callback({ ok: false, error, project_id: null, desktop_state: null }, callback);
    }
    if (normalizedScope === 'activity' && !resolvedActivityId) {
        const error = 'Missing activity id.';
        return with_callback({ ok: false, error, activity_id: null, desktop_state: null }, callback);
    }

    const atomeId = resolveScopedToolboxStateId(
        currentUserId,
        normalizedScope,
        resolvedActivityId,
        resolvedProjectId
    );
    const result = await get_atome(atomeId).catch(() => null);
    const raw = result?.atome || result?.data || null;
    if (!raw || typeof raw !== 'object') {
        return with_callback({
            ok: true,
            exists: false,
            scope: normalizedScope,
            activity_id: resolvedActivityId || null,
            project_id: resolvedProjectId,
            desktop_state: null
        }, callback);
    }
    const props = raw.properties || raw.particles || raw.data || {};
    const desktopState = sanitizeProjectState(props.desktop_state || props.desktopState);
    return with_callback({
        ok: true,
        exists: true,
        scope: normalizedScope,
        activity_id: resolvedActivityId || props.activity_id || props.activityId || null,
        project_id: resolvedProjectId,
        desktop_state: desktopState
    }, callback);
};

export async function save_project_toolbox_state(options = {}, callback) {
    return saveScopedToolboxState('project', options, callback);
}

export async function get_project_toolbox_state(projectId, callback) {
    return getScopedToolboxState('project', { project_id: projectId }, callback);
}

export async function save_global_toolbox_state(options = {}, callback) {
    return saveScopedToolboxState('global', options, callback);
}

export async function get_global_toolbox_state(callback) {
    return getScopedToolboxState('global', {}, callback);
}

export async function save_activity_toolbox_state(options = {}, callback) {
    return saveScopedToolboxState('activity', options, callback);
}

export async function get_activity_toolbox_state(activityId, callback) {
    return getScopedToolboxState('activity', { activity_id: activityId }, callback);
}
