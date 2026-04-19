const readPerfFlag = (name) => {
    try {
        if (typeof window !== 'undefined' && window?.[name] === true) return true;
        if (typeof globalThis !== 'undefined' && globalThis?.[name] === true) return true;
    } catch (_) { }
    return false;
};

export const perfNowMs = () => {
    if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
        return performance.now();
    }
    return Date.now();
};

export const perfElapsedMs = (startMs) => Math.max(0, Math.round((perfNowMs() - Number(startMs || 0)) * 10) / 10);

export const perfLogsEnabled = () => (
    readPerfFlag('__EVE_PERF_LOGS__')
    || readPerfFlag('__SQUIRREL_PERF_LOGS__')
);

export const perfEventsEnabled = () => (
    perfLogsEnabled()
    || readPerfFlag('__EVE_PERF_EVENTS__')
    || readPerfFlag('__SQUIRREL_PERF_EVENTS__')
);

export const perfLog = (...args) => {
    if (!perfLogsEnabled()) return;
    console.log(...args);
};

export const emitPerfEvent = (name, detail = {}) => {
    if (!perfEventsEnabled()) return false;
    if (typeof window === 'undefined' || typeof CustomEvent !== 'function') return false;
    try {
        window.dispatchEvent(new CustomEvent('squirrel:perf', {
            detail: {
                name: String(name || ''),
                atMs: perfNowMs(),
                ...detail
            }
        }));
        return true;
    } catch (_) {
        return false;
    }
};