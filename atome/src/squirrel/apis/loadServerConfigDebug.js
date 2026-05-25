export function applyDebugConfig(config, { isInTauriRuntime = () => false } = {}) {
    if (typeof window === 'undefined') return;
    const logging = config?.logging;
    if (!logging) return;
    if (!isInTauriRuntime() && typeof window.__CHECK_DEBUG__ === 'boolean') {
        globalThis.__CHECK_DEBUG__ = window.__CHECK_DEBUG__;
        return;
    }
    if (typeof logging.debugEnabled === 'boolean') {
        window.__CHECK_DEBUG__ = logging.debugEnabled;
        globalThis.__CHECK_DEBUG__ = window.__CHECK_DEBUG__;
        return;
    }
    if (logging.disableUiLogs === true) {
        window.__CHECK_DEBUG__ = false;
        globalThis.__CHECK_DEBUG__ = window.__CHECK_DEBUG__;
    }
}
