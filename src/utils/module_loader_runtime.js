import { perfElapsedMs, perfNowMs } from './perf_runtime.js';

const logModuleLoad = (logPrefix, event, detail = {}) => {
    try {
        if (typeof console !== 'undefined' && typeof console.warn === 'function') {
            console.warn(`${logPrefix} ${event}`, detail);
        }
    } catch (_) { }
};

export const loadModulesSequentially = async ({
    modules = [],
    baseUrl,
    logPrefix = '[Runtime]',
    target = globalThis?.window,
    onModuleLoaded,
    onModuleError
} = {}) => {
    const loadedModules = {};

    for (const entry of modules) {
        const descriptor = typeof entry === 'string'
            ? { id: entry, path: entry }
            : (entry || {});
        const moduleId = String(descriptor.id || descriptor.path || 'module');
        const rawModulePath = String(descriptor.path || descriptor.id || '');
        const modulePath = baseUrl
            ? new URL(rawModulePath, baseUrl).href
            : rawModulePath;
        const moduleStart = perfNowMs();

        try {
            const moduleNamespace = await import(modulePath);
            const totalMs = perfElapsedMs(moduleStart);

            loadedModules[moduleId] = moduleNamespace;
            if (typeof onModuleLoaded === 'function') {
                onModuleLoaded({
                    descriptor,
                    moduleId,
                    modulePath,
                    moduleNamespace,
                    totalMs
                });
            }
        } catch (error) {
            const totalMs = perfElapsedMs(moduleStart);
            logModuleLoad(logPrefix, 'module_error', {
                moduleId,
                totalMs: Math.round(totalMs),
                error: String(error?.message || error || 'module_load_failed')
            });

            if (typeof onModuleError === 'function') {
                onModuleError({
                    descriptor,
                    moduleId,
                    modulePath,
                    error,
                    totalMs
                });
            }

            throw error;
        }
    }

    return loadedModules;
};
