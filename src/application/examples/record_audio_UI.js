// Record audio UI (icon + selectors)
// - Positions match legacy layout
// - Backend: iPlug2 or WebAudio
// - Source: mic or plugin output

(function () {
    if (typeof window === 'undefined') return;

    const ICON_ID = 'record-audio-icon';
    const ICON_SRC = 'assets/images/icons/record.svg';
    const MEDIA_SELECTOR_ID = 'record-audio-media-selector';
    const MEDIA_PLAYER_ID = 'record-audio-media-player';

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
            await import('../eVe/APIS/audio_api.js');
        } catch (_) { }
        return (typeof window.record_audio === 'function') ? window.record_audio : null;
    }

    async function ensureAudioApi() {
        if (typeof window.record_audio_list_media === 'function' && typeof window.record_audio_play === 'function') {
            return { listMediaFiles: window.record_audio_list_media, play: window.record_audio_play };
        }
        try {
            await import('../eVe/APIS/audio_api.js');
        } catch (_) { }
        const listMediaFiles = (typeof window.record_audio_list_media === 'function')
            ? window.record_audio_list_media
            : (typeof window.list_user_media_files === 'function' ? window.list_user_media_files : null);
        const play = (typeof window.record_audio_play === 'function')
            ? window.record_audio_play
            : (typeof window.play === 'function' ? window.play : null);
        if (!listMediaFiles || !play) return null;
        return { listMediaFiles, play };
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
        const mediaState = {
            holder: null,
            player: null,
            selector: null,
            map: new Map(),
            entries: [],
            revoke: null,
            debugLogged: false
        };

        function updateTitle(icon) {
            try { icon.title = `Record audio (${state.backend}, ${state.source})`; } catch (_) { }
        }

        function clearMediaPlayer() {
            if (mediaState.revoke) {
                try { mediaState.revoke(); } catch (_) { }
            }
            mediaState.revoke = null;
            if (!mediaState.player) return;
            while (mediaState.player.firstChild) {
                mediaState.player.removeChild(mediaState.player.firstChild);
            }
        }

        function renderMediaStatus(message, tone) {
            if (!mediaState.player) return;
            clearMediaPlayer();
            $('div', {
                parent: mediaState.player,
                text: message || '',
                css: { color: tone || '#cfcfcf', fontSize: '11px', padding: '4px' }
            });
        }

        function renderMediaPlayer(entry, playback) {
            if (!mediaState.player) return;
            clearMediaPlayer();
            if (!playback || !playback.ok) {
                const msg = playback && playback.error ? playback.error : 'Unable to open media';
                $('div', {
                    parent: mediaState.player,
                    text: msg,
                    css: { color: '#ffb0b0', fontSize: '11px', padding: '4px' }
                });
                return;
            }

            $('div', {
                parent: mediaState.player,
                text: entry && entry.name ? entry.name : (playback.name || 'media'),
                css: { color: '#e6e6e6', fontSize: '11px', marginBottom: '4px' }
            });

            const kind = playback.kind || 'other';
            if (kind === 'image') {
                $('img', {
                    parent: mediaState.player,
                    attrs: { src: playback.url, alt: playback.name || 'image' },
                    css: { maxWidth: '100%', maxHeight: '140px', display: 'block' }
                });
            } else if (kind === 'video') {
                const video = $('video', {
                    parent: mediaState.player,
                    attrs: { src: playback.url, controls: true },
                    css: { width: '100%', maxHeight: '140px', display: 'block' }
                });
                try { video.load(); } catch (_) { }
            } else if (kind === 'audio') {
                const audio = $('audio', {
                    parent: mediaState.player,
                    attrs: { src: playback.url, controls: true },
                    css: { width: '100%', display: 'block' }
                });
                try { audio.load(); } catch (_) { }
            } else {
                $('a', {
                    parent: mediaState.player,
                    text: 'Open file',
                    attrs: { href: playback.url, target: '_blank', rel: 'noopener' },
                    css: { color: '#8fd3ff', fontSize: '12px' }
                });
            }

            mediaState.revoke = playback.revoke || null;
        }

        function mountMediaSelector(options) {
            if (!mediaState.holder) return;
            if (mediaState.selector && typeof mediaState.selector.destroyDropDown === 'function') {
                try { mediaState.selector.destroyDropDown(); } catch (_) { }
            }
            while (mediaState.holder.firstChild) {
                mediaState.holder.removeChild(mediaState.holder.firstChild);
            }
            if (typeof dropDown !== 'function') {
                $('div', {
                    parent: mediaState.holder,
                    text: 'media selector unavailable',
                    css: { color: '#fff', fontSize: '12px', padding: '4px' }
                });
                return;
            }
            mediaState.selector = dropDown({
                parent: mediaState.holder,
                id: MEDIA_SELECTOR_ID,
                theme: 'dark',
                options,
                value: '',
                css: {
                    display: 'inline-block',
                    width: '260px',
                    height: '26px',
                    lineHeight: '26px',
                    backgroundColor: '#00f',
                    color: 'white',
                    borderRadius: '0px',
                    margin: '0px',
                    padding: '0px'
                },
                listCss: {
                    width: '260px'
                },
                textCss: {
                    color: 'white'
                },
                onChange: async (value, label, idx) => {
                    const selected = String(value ?? '');
                    if (!selected) {
                        renderMediaStatus('No media selected');
                        return;
                    }
                    const entryByIndex = (typeof idx === 'number' && idx > 0)
                        ? (mediaState.entries[idx - 1] || null)
                        : null;
                    const entry = entryByIndex || mediaState.map.get(selected) || null;
                    const displayName = (entry && (entry.name || entry.file_name)) || label || selected;
                    renderMediaStatus(`Selected: ${displayName}`, '#8fd3ff');
                    const api = await ensureAudioApi();
                    if (!api || typeof api.play !== 'function') {
                        renderMediaPlayer(entry, { ok: false, error: 'play() not available' });
                        return;
                    }
                    try {
                        const playback = await api.play(entry || selected);
                        renderMediaPlayer(entry, playback);
                    } catch (e) {
                        renderMediaPlayer(entry, { ok: false, error: e && e.message ? e.message : String(e) });
                    }
                }
            });
        }

        async function refreshMediaList() {
            if (!mediaState.holder) return;
            const api = await ensureAudioApi();
            if (!api || typeof api.listMediaFiles !== 'function') {
                mountMediaSelector([{ label: 'Media list unavailable', value: '' }]);
                return;
            }
            const result = await api.listMediaFiles({ types: ['audio', 'video', 'image'] });
            if (!result || !result.ok) {
                if (result && result.error === 'auth_required') {
                    const msg = 'Connectez-vous pour voir les medias';
                    mountMediaSelector([{ label: msg, value: '' }]);
                    renderMediaStatus(msg, '#ffb0b0');
                    return;
                }
                mountMediaSelector([{ label: 'No media available', value: '' }]);
                if (!mediaState.debugLogged && typeof window.record_audio_debug_list === 'function') {
                    mediaState.debugLogged = true;
                    window.record_audio_debug_list({ types: ['audio', 'video', 'image'] }).catch(() => null);
                }
                return;
            }

            mediaState.map.clear();
            mediaState.entries = [];
            const options = [{ label: 'Select media...', value: '' }];
            result.files.forEach((file) => {
                const key = String(file.id || file.file_name || file.name || '');
                if (!key) return;
                mediaState.map.set(key, file);
                mediaState.entries.push(file);
                const shared = file.shared ? ' (shared)' : '';
                const kind = file.kind ? ` [${file.kind}]` : '';
                options.push({ label: `${file.name || file.file_name || key}${shared}${kind}`, value: key });
            });
            if (!result.files.length && !mediaState.debugLogged && typeof window.record_audio_debug_list === 'function') {
                mediaState.debugLogged = true;
                window.record_audio_debug_list({ types: ['audio', 'video', 'image'] }).catch(() => null);
            }
            mountMediaSelector(options);
        }

        async function startIPlug2(icon) {
            const fileName = `${state.source}_${Date.now()}.wav`;
            try {
                const recordAudio = await ensureWebAudioRecorder();
                if (recordAudio) {
                    state.ctrl = await recordAudio(fileName, null, { backend: 'iplug2', source: state.source });
                    state.sessionId = null;
                    state.isRecording = true;
                    icon.style.opacity = '0.6';
                    return true;
                }
            } catch (e) {
                console.warn('[record_audio_UI] record_audio() iPlug2 start failed:', e && e.message ? e.message : e);
            }

            if (typeof window.record_start !== 'function') {
                console.warn('[record_audio_UI] record_start() not available.');
                return false;
            }
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
            try {
                if (state.ctrl && typeof state.ctrl.stop === 'function') {
                    await state.ctrl.stop();
                } else if (state.sessionId && typeof window.record_stop === 'function') {
                    await window.record_stop(state.sessionId);
                } else {
                    return false;
                }
            } catch (e) {
                console.warn('[record_audio_UI] iPlug2 stop failed:', e && e.message ? e.message : e);
            }
            state.ctrl = null;
            state.sessionId = null;
            state.isRecording = false;
            icon.style.opacity = '1';
            refreshMediaList().catch(() => null);
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
            refreshMediaList().catch(() => null);
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

        // Media selector + player (under the record button)
        try {
            mediaState.holder = $('div', {
                id: 'record-audio-media-selector-holder',
                parent: host,
                css: {
                    position: 'absolute',
                    top: '32px',
                    left: '600px',
                    width: '260px',
                    height: '26px',
                    zIndex: 9999,
                    pointerEvents: 'auto'
                }
            });

            mediaState.player = $('div', {
                id: MEDIA_PLAYER_ID,
                parent: host,
                css: {
                    position: 'absolute',
                    top: '62px',
                    left: '600px',
                    width: '260px',
                    minHeight: '60px',
                    maxHeight: '180px',
                    padding: '6px',
                    backgroundColor: 'rgba(0, 0, 0, 0.6)',
                    color: 'white',
                    borderRadius: '4px',
                    zIndex: 9998,
                    pointerEvents: 'auto'
                }
            });

            renderMediaStatus('No media selected');
            refreshMediaList().catch(() => null);
        } catch (e) {
            console.warn('[record_audio_UI] Failed to mount media selector:', e && e.message ? e.message : e);
        }
    });
})();
