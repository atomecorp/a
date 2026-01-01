// Record audio UI (icon + selectors)
// - Positions match legacy layout
// - Backend: iPlug2 or WebAudio
// - Source: mic or plugin output

(function () {
    if (typeof window === 'undefined') return;

    const ICON_ID = 'record-audio-icon';
    const ICON_SRC = 'assets/images/icons/record.svg';

    function onReady(cb) {
        const run = () => {
            if (typeof document === 'undefined') return;
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', cb, { once: true });
            } else {
                cb();
            }
        };
        if (typeof window.$ === 'function' || (window.Squirrel && window.Squirrel.$)) {
            run();
        } else {
            window.addEventListener('squirrel:ready', run, { once: true });
        }
    }

    function resolveHost() {
        if (typeof document === 'undefined') return null;
        const view = document.getElementById('view');
        if (view) return view;
        const intuition = document.getElementById('intuition');
        if (intuition) return intuition;
        if (typeof grab === 'function') {
            return grab('view') || grab('intuition') || grab('inutuition') || null;
        }
        return document.body || document.documentElement;
    }

    function hasIPlugBridge() {
        try {
            return !!(
                typeof window.__toDSP === 'function' ||
                (window.webkit && window.webkit.messageHandlers && (
                    window.webkit.messageHandlers.swiftBridge ||
                    window.webkit.messageHandlers.squirrel ||
                    window.webkit.messageHandlers.callback
                ))
            );
        } catch (_) {
            return false;
        }
    }

    async function ensureWebAudioRecorder() {
        if (typeof window.record_audio === 'function') return window.record_audio;
        try {
            await import('./record_audio.js');
        } catch (_) {
            return null;
        }
        return (typeof window.record_audio === 'function') ? window.record_audio : null;
    }

    onReady(() => {
        if (typeof document === 'undefined') return;
        const $ = window.Squirrel.$ || window.$;
        if (!$) return;
        if (document.getElementById(ICON_ID)) return;

        const host = resolveHost();
        if (!host) {
            console.warn('[record_audio_UI] Cannot attach record icon: host not found.');
            return;
        }
        if (document.getElementById(ICON_ID)) return;

        const state = {
            backend: hasIPlugBridge() ? 'iplug2' : 'webaudio',
            source: 'mic',
            isRecording: false,
            sessionId: null,
            ctrl: null
        };

        function updateTitle(icon) {
            try { icon.title = `Record audio (${state.backend}, ${state.source})`; } catch (_) { }
        }

        async function startIPlug2(icon) {
            if (typeof window.record_start !== 'function') {
                console.warn('[record_audio_UI] record_start() not available.');
                return false;
            }
            const fileName = `${state.source}_${Date.now()}.wav`;
            try {
                const sessionId = await window.record_start({ source: state.source, fileName });
                state.sessionId = sessionId;
                state.isRecording = true;
                icon.style.opacity = '0.6';
                return true;
            } catch (e) {
                console.warn('[record_audio_UI] iPlug2 start failed:', e && e.message ? e.message : e);
                return false;
            }
        }

        async function stopIPlug2(icon) {
            if (!state.sessionId || typeof window.record_stop !== 'function') {
                return false;
            }
            try {
                await window.record_stop(state.sessionId);
            } catch (e) {
                console.warn('[record_audio_UI] iPlug2 stop failed:', e && e.message ? e.message : e);
            }
            state.sessionId = null;
            state.isRecording = false;
            icon.style.opacity = '1';
            return true;
        }

        async function startWebAudio(icon) {
            const recordAudio = await ensureWebAudioRecorder();
            if (!recordAudio) {
                console.warn('[record_audio_UI] record_audio() not available.');
                return false;
            }
            const fileName = `${state.source}_${Date.now()}.wav`;
            try {
                state.ctrl = await recordAudio(fileName, null, { backend: 'webaudio', source: state.source });
                state.isRecording = true;
                icon.style.opacity = '0.6';
                return true;
            } catch (e) {
                console.warn('[record_audio_UI] WebAudio start failed:', e && e.message ? e.message : e);
                return false;
            }
        }

        async function stopWebAudio(icon) {
            if (state.ctrl && typeof state.ctrl.stop === 'function') {
                try {
                    await state.ctrl.stop();
                } catch (e) {
                    console.warn('[record_audio_UI] WebAudio stop failed:', e && e.message ? e.message : e);
                }
            }
            state.ctrl = null;
            state.isRecording = false;
            icon.style.opacity = '1';
            return true;
        }

        const icon = $('img', {
            id: ICON_ID,
            parent: host,
            attrs: {
                src: ICON_SRC,
                alt: 'Record audio',
                title: 'Record audio'
            },
            css: {
                position: 'absolute',
                top: '3px',
                left: '600px',
                width: '26px',
                height: '26px',
                cursor: 'pointer',
                zIndex: 9999,
                userSelect: 'none',
                pointerEvents: 'auto'
            },
            onclick: async () => {
                try {
                    if (!state.isRecording) {
                        if (state.backend === 'iplug2') {
                            await startIPlug2(icon);
                        } else {
                            await startWebAudio(icon);
                        }
                        return;
                    }

                    if (state.backend === 'iplug2') {
                        await stopIPlug2(icon);
                    } else {
                        await stopWebAudio(icon);
                    }
                } catch (e) {
                    console.warn('[record_audio_UI] Record action failed:', e && e.message ? e.message : e);
                    state.ctrl = null;
                    state.sessionId = null;
                    state.isRecording = false;
                    try { icon.style.opacity = '1'; } catch (_) { }
                }
            }
        });

        updateTitle(icon);

        // Backend selector (same position as legacy)
        try {
            const backendHolder = $('div', {
                id: 'record-audio-backend-selector-holder',
                parent: host,
                css: {
                    position: 'absolute',
                    top: '3px',
                    left: '634px',
                    width: '110px',
                    height: '26px',
                    zIndex: 9999,
                    pointerEvents: 'auto'
                }
            });

            if (typeof dropDown === 'function') {
                const iplugAvailable = hasIPlugBridge();
                if (!iplugAvailable && state.backend === 'iplug2') state.backend = 'webaudio';
                dropDown({
                    parent: backendHolder,
                    id: 'record_audio_backend_selector',
                    theme: 'dark',
                    options: [
                        { label: 'WebAudio', value: 'webaudio' },
                        { label: 'iPlug2', value: 'iplug2' }
                    ],
                    value: state.backend,
                    onChange: (val) => {
                        if (val === 'iplug2' && !iplugAvailable) {
                            state.backend = 'webaudio';
                            console.warn('[record_audio_UI] iPlug2 backend is not available; using WebAudio.');
                        } else {
                            state.backend = (val === 'iplug2') ? 'iplug2' : 'webaudio';
                        }
                        updateTitle(icon);
                    }
                });
            } else {
                console.warn('[record_audio_UI] dropDown() is not available; backend selector not shown.');
            }
        } catch (e) {
            console.warn('[record_audio_UI] Failed to mount backend selector:', e && e.message ? e.message : e);
        }

        // Source selector (same position as legacy)
        try {
            const sourceHolder = $('div', {
                id: 'record-audio-source-selector-holder',
                parent: host,
                css: {
                    position: 'absolute',
                    top: '3px',
                    left: '748px',
                    width: '140px',
                    height: '26px',
                    zIndex: 9999,
                    pointerEvents: 'auto'
                }
            });

            if (typeof dropDown === 'function') {
                dropDown({
                    parent: sourceHolder,
                    id: 'record_audio_source_selector',
                    theme: 'dark',
                    options: [
                        { label: 'Microphone', value: 'mic' },
                        { label: 'Plugin Output', value: 'plugin' }
                    ],
                    value: state.source,
                    onChange: (val) => {
                        state.source = (val === 'plugin') ? 'plugin' : 'mic';
                        updateTitle(icon);
                    }
                });
            } else {
                console.warn('[record_audio_UI] dropDown() is not available; source selector not shown.');
            }
        } catch (e) {
            console.warn('[record_audio_UI] Failed to mount source selector:', e && e.message ? e.message : e);
        }
    });
})();
