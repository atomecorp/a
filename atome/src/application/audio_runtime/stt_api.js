// Tauri -> native STT bridge
// Exposes window.__TAURI__.stt and window.__TAURI_INTERNALS__.stt when the STT plugin is available.
// Desktop-only event bridge: relies on Tauri's global event API when present.

(function () {
    if (typeof window === 'undefined') return;

    const tauri = window.__TAURI__ || null;
    const internals = window.__TAURI_INTERNALS__ || null;
    if (!tauri && !internals) return;

    const getInvoke = () => {
        try {
            if (tauri && typeof tauri.invoke === 'function') return tauri.invoke.bind(tauri);
            if (internals && typeof internals.invoke === 'function') return internals.invoke.bind(internals);
        } catch (_) { }
        return null;
    };

    const getEventListen = () => {
        try {
            if (tauri?.event && typeof tauri.event.listen === 'function') {
                return tauri.event.listen.bind(tauri.event);
            }
            if (tauri?.window?.getCurrentWindow && typeof tauri.window.getCurrentWindow === 'function') {
                const currentWindow = tauri.window.getCurrentWindow();
                if (currentWindow && typeof currentWindow.listen === 'function') {
                    return currentWindow.listen.bind(currentWindow);
                }
            }
        } catch (_) { }
        return null;
    };

    const invoke = getInvoke();
    if (!invoke) {
        return;
    }

    const listen = getEventListen();
    const wrapListener = async (eventName, handler) => {
        if (typeof listen !== 'function') {
            return () => {};
        }
        const unlisten = await listen(eventName, (event) => {
            handler(event?.payload ?? event);
        });
        return typeof unlisten === 'function' ? unlisten : () => {};
    };

    const stt = {
        async isAvailable() {
            return invoke('plugin:stt|is_available');
        },
        async getSupportedLanguages() {
            return invoke('plugin:stt|get_supported_languages');
        },
        async checkPermission() {
            return invoke('plugin:stt|check_permission');
        },
        async requestPermission() {
            return invoke('plugin:stt|request_permission');
        },
        async start(config = {}) {
            return invoke('plugin:stt|start_listening', { config });
        },
        async stop() {
            return invoke('plugin:stt|stop_listening');
        },
        async onResult(handler) {
            return wrapListener('plugin:stt:result', handler);
        },
        async onStateChange(handler) {
            return wrapListener('plugin:stt:stateChange', handler);
        },
        async onError(handler) {
            return wrapListener('plugin:stt:error', handler);
        },
        async onDownloadProgress(handler) {
            return wrapListener('stt://download-progress', handler);
        }
    };

    if (tauri && !tauri.stt) {
        tauri.stt = stt;
    }
    if (internals && !internals.stt) {
        internals.stt = stt;
    }
})();
