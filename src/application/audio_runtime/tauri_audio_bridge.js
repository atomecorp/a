// Tauri -> native audio bridge (API only)
// - Defines window.__toDSP(msg) to call Tauri invoke('iplug_send')
// - Polls native events via invoke('iplug_poll_events') and forwards them to window.__fromDSP
//
// Notes:
// - We poll because the global __TAURI__ API surface may not expose event.listen in this build.
// - All logs/messages are in English.

(function () {
    if (typeof window === 'undefined') return;

    const isTauri = !!(window.__TAURI__ || window.__TAURI_INTERNALS__);
    if (!isTauri) return;

    function getInvoke() {
        try {
            if (window.__TAURI_INTERNALS__ && typeof window.__TAURI_INTERNALS__.invoke === 'function') {
                return window.__TAURI_INTERNALS__.invoke.bind(window.__TAURI_INTERNALS__);
            }
            if (window.__TAURI__ && window.__TAURI__.core && typeof window.__TAURI__.core.invoke === 'function') {
                return window.__TAURI__.core.invoke.bind(window.__TAURI__.core);
            }
            if (window.__TAURI__ && typeof window.__TAURI__.invoke === 'function') return window.__TAURI__.invoke.bind(window.__TAURI__);
        } catch (_) { }
        return null;
    }

    const invoke = getInvoke();
    if (!invoke) {
        console.warn('[tauri_audio_bridge] Tauri invoke() not available; native audio bridge disabled.');
        return;
    }

    // Native -> UI helpers
    function forwardNativeEvent(evt) {
        if (!evt || typeof evt !== 'object') return;
        const type = evt.type || null;
        const payload = evt.payload && typeof evt.payload === 'object' ? evt.payload : (evt.payload != null ? { value: evt.payload } : {});
        if (!type) return;

        // Primary: existing iPlug backend expects window.__fromDSP({type,payload})
        try {
            if (typeof window.__fromDSP === 'function') {
                window.__fromDSP({ type, payload });
            }
        } catch (e) {
            console.warn('[tauri_audio_bridge] __fromDSP handler failed:', e && e.message ? e.message : e);
        }

        // Also dispatch the recorder-specific CustomEvent used by recorder API
        try {
            if (type === 'record_started' || type === 'record_done' || type === 'record_error') {
                window.dispatchEvent(new CustomEvent('iplug_recording', { detail: { type, ...payload } }));
            }
        } catch (_) { }
    }

    // Poll native events
    let polling = false;
    let disposed = false;
    let intervalId = null;
    let pollingStarted = false;
    async function pollOnce() {
        if (disposed || polling) return;
        polling = true;
        try {
            const events = await invoke('iplug_poll_events', {}).catch(() => null);
            if (disposed) return;
            if (Array.isArray(events)) {
                for (const evt of events) forwardNativeEvent(evt);
            }
        } finally {
            polling = false;
        }
    }

    function ensurePollingStarted() {
        if (disposed || pollingStarted) return;
        pollingStarted = true;
        try {
            intervalId = setInterval(pollOnce, POLL_MS);
        } catch (_) {
            intervalId = null;
        }
        pollOnce();
    }

    // UI -> native
    if (typeof window.__toDSP !== 'function') {
        window.__toDSP = function (msg) {
            try {
                ensurePollingStarted();
                // Fire-and-forget (do not await on UI path)
                invoke('iplug_send', { msg: msg }).catch((e) => {
                    console.warn('[tauri_audio_bridge] iplug_send failed:', e && e.message ? e.message : e);
                });
            } catch (e) {
                console.warn('[tauri_audio_bridge] __toDSP failed:', e && e.message ? e.message : e);
            }
        };
    }

    // 20Hz is enough for UI-level record_done delivery.
    const POLL_MS = 50;

    const dispose = () => {
        disposed = true;
        pollingStarted = false;
        if (intervalId !== null) {
            try { clearInterval(intervalId); } catch (_) { }
            intervalId = null;
        }
    };
    try { window.addEventListener('beforeunload', dispose, { once: true }); } catch (_) { }
    try { window.addEventListener('pagehide', dispose, { once: true }); } catch (_) { }
})();
