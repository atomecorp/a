const consoleLogsEnabled = () => {
    try {
        if (typeof globalThis !== 'undefined' && globalThis?.__SQUIRREL_CONSOLE_LOGS__ === true) {
            return true;
        }
        if (typeof window !== 'undefined' && window?.__SQUIRREL_CONSOLE_LOGS__ === true) {
            return true;
        }
    } catch (_) {
    }
    return false;
};

export const silenceJsConsole = (target = globalThis) => {
    if (!target || consoleLogsEnabled()) return;
    if (target.__SQUIRREL_CONSOLE_SILENCED__ === true) return;

    const runtimeConsole = target.console;
    if (!runtimeConsole || typeof runtimeConsole !== 'object') return;

    try {
        target.__SQUIRREL_CONSOLE_SILENCED__ = true;
        target.__SQUIRREL_ORIGINAL_CONSOLE__ = {
            log: runtimeConsole.log,
            info: runtimeConsole.info,
            warn: runtimeConsole.warn,
            error: runtimeConsole.error,
            debug: runtimeConsole.debug,
            trace: runtimeConsole.trace
        };

        const noop = () => {};
        runtimeConsole.log = noop;
        runtimeConsole.info = noop;
        runtimeConsole.warn = noop;
        runtimeConsole.error = noop;
        runtimeConsole.debug = noop;
        runtimeConsole.trace = noop;
    } catch (_) {
    }
};

silenceJsConsole();