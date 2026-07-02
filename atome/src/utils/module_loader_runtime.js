import { perfElapsedMs, perfNowMs } from './perf_runtime.js';

const logModuleLoad = () => { };

const resolveDescriptor = (entry) => (typeof entry === 'string'
    ? { id: entry, path: entry }
    : (entry || {}));

const resolveModulePath = (descriptor, baseUrl) => {
    const rawModulePath = String(descriptor.path || descriptor.id || '');
    return baseUrl ? new URL(rawModulePath, baseUrl).href : rawModulePath;
};

const loadSingleModule = async ({ entry, baseUrl, logPrefix, onModuleLoaded, onModuleError }) => {
    const descriptor = resolveDescriptor(entry);
    const moduleId = String(descriptor.id || descriptor.path || 'module');
    const modulePath = resolveModulePath(descriptor, baseUrl);
    const moduleStart = perfNowMs();

    try {
        const moduleNamespace = await import(modulePath);
        const totalMs = perfElapsedMs(moduleStart);

        if (typeof onModuleLoaded === 'function') {
            onModuleLoaded({ descriptor, moduleId, modulePath, moduleNamespace, totalMs });
        }
        return { moduleId, moduleNamespace };
    } catch (error) {
        const totalMs = perfElapsedMs(moduleStart);
        logModuleLoad(logPrefix, 'module_error', {
            moduleId,
            totalMs: Math.round(totalMs),
            error: String(error?.message || error || 'module_load_failed')
        });

        if (typeof onModuleError === 'function') {
            onModuleError({ descriptor, moduleId, modulePath, error, totalMs });
        }

        throw error;
    }
};

export const loadModulesSequentially = async ({
    modules = [],
    baseUrl,
    logPrefix = '[Runtime]',
    onModuleLoaded,
    onModuleError
} = {}) => {
    const loadedModules = {};

    for (const entry of modules) {
        const { moduleId, moduleNamespace } = await loadSingleModule({
            entry, baseUrl, logPrefix, onModuleLoaded, onModuleError
        });
        loadedModules[moduleId] = moduleNamespace;
    }

    return loadedModules;
};

// Load independent modules in parallel. Use only for modules with no import-time
// side-effect ordering between them (e.g. pure component/builder modules read by
// their default export after all have resolved). The fetch/compile of every module
// starts in one batch instead of a serial waterfall, which removes per-module
// round-trips on cold start.
export const loadModulesConcurrently = async ({
    modules = [],
    baseUrl,
    logPrefix = '[Runtime]',
    onModuleLoaded,
    onModuleError
} = {}) => {
    const loadedModules = {};

    const results = await Promise.all(modules.map((entry) => loadSingleModule({
        entry, baseUrl, logPrefix, onModuleLoaded, onModuleError
    })));

    for (const { moduleId, moduleNamespace } of results) {
        loadedModules[moduleId] = moduleNamespace;
    }

    return loadedModules;
};
