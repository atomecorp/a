// Debug utilities centralized around window.__CHECK_DEBUG__
// DEBUG flag: true to allow verbose logs; false to silence log/info/debug while keeping warn/error.
export function isDebugEnabled() {
    return typeof window !== 'undefined' && window.__CHECK_DEBUG__ === true;
}

export function shouldLogLevel(level) {
    const enabled = isDebugEnabled();
    if (!level) return enabled;
    const l = String(level).toLowerCase();
    // Always keep errors and warnings; gate lower levels behind DEBUG.
    if (l === 'error' || l === 'warn') return true;
    return enabled;
}

export function wrapConsoleForDebug(consoleObj = console) {
    const methods = ['log', 'info', 'debug'];
    methods.forEach((method) => {
        const original = consoleObj[method];
        consoleObj[method] = (...args) => {
            if (!isDebugEnabled()) return;
            original.apply(consoleObj, args);
        };
    });
}
