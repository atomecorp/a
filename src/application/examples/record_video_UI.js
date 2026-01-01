// Record video/audio UI (MediaRecorder)
// - Record button, mode selector, media list, and player

(function () {
    if (typeof window === 'undefined') return;

    const ICON_ID = 'record-video-icon';
    const ICON_SRC = 'assets/images/icons/record.svg';
    const MODE_SELECTOR_ID = 'record-video-mode-selector';
    const MEDIA_SELECTOR_ID = 'record-video-media-selector';
    const MEDIA_PLAYER_ID = 'record-video-media-player';
    const BASE_LEFT = 900;

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

    async function ensureVideoApi() {
        if (typeof window.record_video === 'function') return window.record_video;
        try {
            await import('./record_video.js');
        } catch (_) {
            return null;
        }
        return (typeof window.record_video === 'function') ? window.record_video : null;
    }

    async function ensureMediaApi() {
        if (typeof window.record_video_list_media === 'function' && typeof window.record_video_play === 'function') {
            return { listMediaFiles: window.record_video_list_media, play: window.record_video_play };
        }
        try {
            await import('./record_video.js');
        } catch (_) {
            return null;
        }
        const listMediaFiles = (typeof window.record_video_list_media === 'function')
            ? window.record_video_list_media
            : null;
        const play = (typeof window.record_video_play === 'function')
            ? window.record_video_play
            : null;
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
            console.warn('[record_video_UI] Cannot attach record icon: host not found.');
            return;
        }

        const state = {
            mode: 'video',
            isRecording: false,
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
            try { icon.title = `Record ${state.mode}`; } catch (_) { }
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
                    const api = await ensureMediaApi();
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
            const api = await ensureMediaApi();
            if (!api || typeof api.listMediaFiles !== 'function') {
                mountMediaSelector([{ label: 'Media list unavailable', value: '' }]);
                return;
            }
            const result = await api.listMediaFiles({ types: ['audio', 'video'] });
            if (!result || !result.ok) {
                mountMediaSelector([{ label: 'No media available', value: '' }]);
                if (!mediaState.debugLogged && typeof window.record_audio_debug_list === 'function') {
                    mediaState.debugLogged = true;
                    window.record_audio_debug_list({ types: ['audio', 'video'] }).catch(() => null);
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
                window.record_audio_debug_list({ types: ['audio', 'video'] }).catch(() => null);
            }
            mountMediaSelector(options);
        }

        const icon = $('img', {
            id: ICON_ID,
            parent: host,
            attrs: {
                src: ICON_SRC,
                alt: 'Record media',
                title: 'Record media'
            },
            css: {
                position: 'absolute',
                top: '3px',
                left: `${BASE_LEFT}px`,
                width: '26px',
                height: '26px',
                cursor: 'pointer',
                zIndex: 9999,
                userSelect: 'none',
                pointerEvents: 'auto'
            },
            onclick: async () => {
                try {
                    const recordVideo = await ensureVideoApi();
                    if (!recordVideo) {
                        console.warn('[record_video_UI] record_video() is not available.');
                        return;
                    }
                    if (!state.isRecording) {
                        const fileName = `${state.mode}_${Date.now()}`;
                        state.ctrl = await recordVideo(fileName, null, { mode: state.mode });
                        state.isRecording = true;
                        icon.style.opacity = '0.6';
                        return;
                    }
                    if (state.ctrl && typeof state.ctrl.stop === 'function') {
                        await state.ctrl.stop();
                    }
                    state.ctrl = null;
                    state.isRecording = false;
                    icon.style.opacity = '1';
                    refreshMediaList().catch(() => null);
                } catch (e) {
                    const message = e && e.message ? e.message : String(e);
                    console.warn('[record_video_UI] Record action failed:', message);
                    renderMediaStatus(`Record failed: ${message}`, '#ffb0b0');
                    state.ctrl = null;
                    state.isRecording = false;
                    try { icon.style.opacity = '1'; } catch (_) { }
                }
            }
        });

        updateTitle(icon);

        // Mode selector (audio/video)
        try {
            const modeHolder = $('div', {
                id: 'record-video-mode-selector-holder',
                parent: host,
                css: {
                    position: 'absolute',
                    top: '3px',
                    left: `${BASE_LEFT + 34}px`,
                    width: '120px',
                    height: '26px',
                    zIndex: 9999,
                    pointerEvents: 'auto'
                }
            });

            if (typeof dropDown === 'function') {
                dropDown({
                    parent: modeHolder,
                    id: MODE_SELECTOR_ID,
                    theme: 'dark',
                    options: [
                        { label: 'Video', value: 'video' },
                        { label: 'Audio', value: 'audio' }
                    ],
                    value: state.mode,
                    onChange: (val) => {
                        state.mode = (String(val).toLowerCase() === 'audio') ? 'audio' : 'video';
                        updateTitle(icon);
                    }
                });
            } else {
                console.warn('[record_video_UI] dropDown() is not available; mode selector not shown.');
            }
        } catch (e) {
            console.warn('[record_video_UI] Failed to mount mode selector:', e && e.message ? e.message : e);
        }

        // Media selector + player (under the record button)
        try {
            mediaState.holder = $('div', {
                id: 'record-video-media-selector-holder',
                parent: host,
                css: {
                    position: 'absolute',
                    top: '32px',
                    left: `${BASE_LEFT}px`,
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
                    left: `${BASE_LEFT}px`,
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
            console.warn('[record_video_UI] Failed to mount media selector:', e && e.message ? e.message : e);
        }
    });
})();
