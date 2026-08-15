import { createConditionRegistry } from './registry.js';
import { createConditionService } from './service.js';
import { registerCanonicalConditionSources } from './property_catalog.js';
import { registerLiveConditionSources } from './live_sources.js';
import { createNativeHealthConnector } from './native_health.js';

const SERVICE_KEY = '__SQUIRREL_CONDITIONS_SERVICE__';

const stateType = (state = {}) => state.type || state.atome_type || state.properties?.type || null;

const filterStates = (states, { type = null, types = [], projectId = null, project_id = null } = {}) => {
    const allowedTypes = new Set([type, ...types].filter(Boolean).map((entry) => String(entry).toLowerCase()));
    const expectedProject = projectId || project_id || null;
    return (Array.isArray(states) ? states : []).filter((state) => {
        if (allowedTypes.size && !allowedTypes.has(String(stateType(state) || '').toLowerCase())) return false;
        if (!expectedProject) return true;
        const candidateProject = state.project_id || state.projectId || state.meta?.project_id
            || state.properties?.project_id || state.properties?.projectId;
        return String(candidateProject || '') === String(expectedProject);
    });
};

export const createGlobalConditionsApi = ({ env = globalThis } = {}) => {
    if (!env || typeof env !== 'object') throw new Error('Global conditions bootstrap requires an object-like environment');
    if (env[SERVICE_KEY]) return env[SERVICE_KEY];
    const registry = createConditionRegistry();
    registerCanonicalConditionSources(registry);
    const resolveAtomeApi = () => env.Atome || env.window?.Atome || null;
    const nativeInvoke = env.__ATOME_IOS_NATIVE_INVOKE || env.window?.__ATOME_IOS_NATIVE_INVOKE || null;
    const liveSources = registerLiveConditionSources(registry, {
        geolocation: env.navigator?.geolocation || env.window?.navigator?.geolocation || null,
        navigatorState: env.navigator || env.window?.navigator || null,
        eventTarget: env.addEventListener ? env : env.window,
        healthConnector: createNativeHealthConnector({
            invoke: typeof nativeInvoke === 'function' ? nativeInvoke.bind(env) : null,
            eventTarget: env.addEventListener ? env : env.window
        })
    });
    const loadStates = async (scope = {}, options = {}) => {
        const api = resolveAtomeApi();
        if (typeof api?.listStateCurrent !== 'function') return [];
        const projectId = scope.projectId || scope.project_id || options.projectId || options.project_id || null;
        const states = await api.listStateCurrent(projectId, {
            includeTotal: false,
            excludeSystem: options.excludeSystem === true
        });
        return filterStates(states, { ...scope, ...options, projectId });
    };
    const subscribeAtomeChanges = (dependencies, callback) => {
        const eventBus = resolveAtomeApi()?.eventBus || env.AtomeEventBus || env.window?.AtomeEventBus;
        if (typeof eventBus?.on !== 'function') return () => {};
        return eventBus.on('atome:changed', callback);
    };
    const remoteConditions = async (action, request) => {
        const api = resolveAtomeApi();
        if (typeof api?.queryConditions !== 'function') return null;
        const response = await api.queryConditions(request, { action });
        if (response?.ok === false || response?.success === false) {
            throw new Error(response.error || 'condition_remote_query_failed');
        }
        return response || null;
    };
    const service = createConditionService({
        registry,
        commit: (...args) => {
            const api = resolveAtomeApi();
            if (typeof api?.commit !== 'function') throw new Error('condition_commit_unavailable');
            return api.commit(...args);
        },
        read: (...args) => {
            const api = resolveAtomeApi();
            if (typeof api?.getStateCurrent !== 'function') return null;
            return api.getStateCurrent(...args);
        },
        list: (options = {}) => {
            return loadStates({ candidateSource: 'atome' }, options);
        },
        loadCandidates: loadStates,
        subscribeDependencies: subscribeAtomeChanges,
        liveSources,
        executeQueryOnce: (request) => remoteConditions('once', request),
        discoverProperties: async (request) => {
            const response = await remoteConditions('properties-discover', request);
            return response?.items || null;
        }
    });
    env.Squirrel = env.Squirrel || {};
    env.Squirrel.conditions = service;
    env.atome = env.atome || {};
    env.atome.conditions = service;
    env[SERVICE_KEY] = service;
    return service;
};

export const bootstrapGlobalConditions = ({
    env = (typeof window !== 'undefined' ? window : globalThis)
} = {}) => createGlobalConditionsApi({ env });

if (typeof window !== 'undefined') bootstrapGlobalConditions({ env: window });
