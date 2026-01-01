// Record video/audio UI (MediaRecorder)
// - Record button, mode selector, media list, and player

(function () {
    if (typeof window === 'undefined') return;

    const ICON_ID = 'record-video-icon';
    const ICON_SRC = 'assets/images/icons/record.svg';
    const MODE_SELECTOR_ID = 'record-video-mode-selector';
    const CAMERA_TOGGLE_ID = 'record-video-camera-toggle';
    const CAMERA_PREVIEW_ID = 'record-video-camera-preview';
    const MEDIA_SELECTOR_ID = 'record-video-media-selector';
    const MEDIA_PLAYER_ID = 'record-video-media-player';
    const BASE_LEFT = 900;
    const CAMERA_TOGGLE_LEFT = BASE_LEFT + 34;
    const MODE_LEFT = CAMERA_TOGGLE_LEFT + 74;
    const PREVIEW_STORAGE_KEY = 'record_video_camera_preview_rect';
    const PREVIEW_TOP = 32;
    const PREVIEW_HEIGHT = 140;
    const PREVIEW_WIDTH = 260;
    const PREVIEW_MIN_WIDTH = 160;
    const PREVIEW_MIN_HEIGHT = 90;
    const MEDIA_TOP = PREVIEW_TOP + PREVIEW_HEIGHT + 12;
    const PLAYER_TOP = MEDIA_TOP + 30;

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

    async function ensureCameraApi() {
        if (typeof window.camera === 'function') return window.camera;
        try {
            await import('./record_video.js');
        } catch (_) {
            return null;
        }
        return (typeof window.camera === 'function') ? window.camera : null;
    }

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    function loadPreviewRect() {
        try {
            const raw = localStorage.getItem(PREVIEW_STORAGE_KEY);
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            if (!parsed) return null;
            return {
                left: Number(parsed.left),
                top: Number(parsed.top),
                width: Number(parsed.width),
                height: Number(parsed.height)
            };
        } catch (_) {
            return null;
        }
    }

    function savePreviewRect(rect) {
        try {
            localStorage.setItem(PREVIEW_STORAGE_KEY, JSON.stringify(rect));
        } catch (_) { }
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
            ctrl: null,
            cameraEnabled: true
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
        const cameraState = {
            holder: null,
            ctrl: null,
            stream: null
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

        function clearCameraHolder() {
            if (!cameraState.holder) return;
            while (cameraState.holder.firstChild) {
                cameraState.holder.removeChild(cameraState.holder.firstChild);
            }
        }

        function renderCameraStatus(message, tone) {
            if (!cameraState.holder) return;
            clearCameraHolder();
            $('div', {
                parent: cameraState.holder,
                text: message || '',
                css: {
                    color: tone || '#cfcfcf',
                    fontSize: '11px',
                    padding: '6px',
                    textAlign: 'center'
                }
            });
        }

        async function startCameraPreview() {
            if (!cameraState.holder || cameraState.ctrl) return;
            const cameraApi = await ensureCameraApi();
            if (!cameraApi) {
                renderCameraStatus('camera() unavailable', '#ffb0b0');
                return;
            }
            clearCameraHolder();
            try {
                const ctrl = await cameraApi({
                    parent: cameraState.holder,
                    id: CAMERA_PREVIEW_ID,
                    video: true,
                    audio: false,
                    muted: true,
                    css: { width: '100%', height: '100%', objectFit: 'cover' }
                });
                cameraState.ctrl = ctrl;
                cameraState.stream = ctrl && ctrl.stream ? ctrl.stream : null;
            } catch (e) {
                const msg = e && e.message ? e.message : String(e);
                renderCameraStatus(`Camera error: ${msg}`, '#ffb0b0');
            }
        }

        function stopCameraPreview() {
            if (cameraState.ctrl && typeof cameraState.ctrl.stop === 'function') {
                try { cameraState.ctrl.stop(); } catch (_) { }
            }
            cameraState.ctrl = null;
            cameraState.stream = null;
            renderCameraStatus('Camera stopped');
        }

        async function updateCameraPreview() {
            if (!cameraState.holder) return;
            cameraState.holder.style.display = state.cameraEnabled ? 'block' : 'none';
            if (!state.cameraEnabled) {
                if (!state.isRecording) {
                    stopCameraPreview();
                }
                return;
            }
            if (state.mode !== 'video') {
                if (cameraState.ctrl) stopCameraPreview();
                renderCameraStatus('Audio mode (no camera)');
                return;
            }
            if (!cameraState.ctrl) {
                await startCameraPreview();
            }
        }

        function getPreviewRect(panel, hostEl) {
            const panelRect = panel.getBoundingClientRect();
            const hostRect = hostEl.getBoundingClientRect();
            const left = panelRect.left - hostRect.left;
            const top = panelRect.top - hostRect.top;
            return {
                left: Math.max(0, Math.round(left)),
                top: Math.max(0, Math.round(top)),
                width: Math.round(panelRect.width),
                height: Math.round(panelRect.height)
            };
        }

        function makePanelDraggable(panel, handle, hostEl) {
            let dragging = false;
            let startX = 0;
            let startY = 0;
            let startLeft = 0;
            let startTop = 0;

            const onMove = (ev) => {
                if (!dragging) return;
                const hostRect = hostEl.getBoundingClientRect();
                const maxLeft = Math.max(0, hostRect.width - panel.offsetWidth);
                const maxTop = Math.max(0, hostRect.height - panel.offsetHeight);
                const nextLeft = clamp(startLeft + (ev.clientX - startX), 0, maxLeft);
                const nextTop = clamp(startTop + (ev.clientY - startY), 0, maxTop);
                panel.style.left = `${nextLeft}px`;
                panel.style.top = `${nextTop}px`;
                panel.style.right = 'auto';
                panel.style.bottom = 'auto';
            };

            const stop = () => {
                if (!dragging) return;
                dragging = false;
                document.removeEventListener('pointermove', onMove, true);
                document.removeEventListener('pointerup', stop, true);
                document.removeEventListener('pointercancel', stop, true);
                handle.releasePointerCapture?.(handle._dragPointerId);
                savePreviewRect(getPreviewRect(panel, hostEl));
            };

            handle.addEventListener('pointerdown', (ev) => {
                if (ev.button !== undefined && ev.button !== 0) return;
                const hostRect = hostEl.getBoundingClientRect();
                const panelRect = panel.getBoundingClientRect();
                dragging = true;
                startX = ev.clientX;
                startY = ev.clientY;
                startLeft = panelRect.left - hostRect.left;
                startTop = panelRect.top - hostRect.top;
                handle._dragPointerId = ev.pointerId;
                handle.setPointerCapture?.(ev.pointerId);
                document.addEventListener('pointermove', onMove, true);
                document.addEventListener('pointerup', stop, true);
                document.addEventListener('pointercancel', stop, true);
                ev.preventDefault();
                ev.stopPropagation();
            }, { passive: false });
        }

        function makePanelResizable(panel, handle, hostEl) {
            let resizing = false;
            let startX = 0;
            let startY = 0;
            let startWidth = 0;
            let startHeight = 0;

            const onMove = (ev) => {
                if (!resizing) return;
                const hostRect = hostEl.getBoundingClientRect();
                const panelRect = panel.getBoundingClientRect();
                const maxWidth = Math.max(PREVIEW_MIN_WIDTH, hostRect.width - (panelRect.left - hostRect.left));
                const maxHeight = Math.max(PREVIEW_MIN_HEIGHT, hostRect.height - (panelRect.top - hostRect.top));
                const nextWidth = clamp(startWidth + (ev.clientX - startX), PREVIEW_MIN_WIDTH, maxWidth);
                const nextHeight = clamp(startHeight + (ev.clientY - startY), PREVIEW_MIN_HEIGHT, maxHeight);
                panel.style.width = `${nextWidth}px`;
                panel.style.height = `${nextHeight}px`;
            };

            const stop = () => {
                if (!resizing) return;
                resizing = false;
                document.removeEventListener('pointermove', onMove, true);
                document.removeEventListener('pointerup', stop, true);
                document.removeEventListener('pointercancel', stop, true);
                handle.releasePointerCapture?.(handle._resizePointerId);
                savePreviewRect(getPreviewRect(panel, hostEl));
            };

            handle.addEventListener('pointerdown', (ev) => {
                if (ev.button !== undefined && ev.button !== 0) return;
                resizing = true;
                startX = ev.clientX;
                startY = ev.clientY;
                startWidth = panel.offsetWidth;
                startHeight = panel.offsetHeight;
                handle._resizePointerId = ev.pointerId;
                handle.setPointerCapture?.(ev.pointerId);
                document.addEventListener('pointermove', onMove, true);
                document.addEventListener('pointerup', stop, true);
                document.addEventListener('pointercancel', stop, true);
                ev.preventDefault();
                ev.stopPropagation();
            }, { passive: false });
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
                        await updateCameraPreview();
                        const stream = (state.mode === 'video' && cameraState.stream) ? cameraState.stream : null;
                        state.ctrl = await recordVideo(fileName, null, {
                            mode: state.mode,
                            stream,
                            keepStream: true
                        });
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

        // Camera toggle button (to the right of record icon)
        try {
            const toggle = $('div', {
                id: CAMERA_TOGGLE_ID,
                parent: host,
                text: 'Cam On',
                css: {
                    position: 'absolute',
                    top: '3px',
                    left: `${CAMERA_TOGGLE_LEFT}px`,
                    width: '70px',
                    height: '26px',
                    lineHeight: '26px',
                    textAlign: 'center',
                    backgroundColor: '#1e7d3b',
                    color: 'white',
                    fontSize: '11px',
                    fontFamily: 'Roboto, sans-serif',
                    borderRadius: '0px',
                    cursor: 'pointer',
                    zIndex: 9999,
                    userSelect: 'none',
                    pointerEvents: 'auto'
                },
                onclick: () => {
                    state.cameraEnabled = !state.cameraEnabled;
                    toggle.textContent = state.cameraEnabled ? 'Cam On' : 'Cam Off';
                    toggle.style.backgroundColor = state.cameraEnabled ? '#1e7d3b' : '#7a2d2d';
                    updateCameraPreview().catch(() => null);
                }
            });
            if (!state.cameraEnabled) {
                toggle.textContent = 'Cam Off';
                toggle.style.backgroundColor = '#7a2d2d';
            }
        } catch (e) {
            console.warn('[record_video_UI] Failed to mount camera toggle:', e && e.message ? e.message : e);
        }

        // Mode selector (audio/video)
        try {
            const modeHolder = $('div', {
                id: 'record-video-mode-selector-holder',
                parent: host,
                css: {
                    position: 'absolute',
                    top: '3px',
                    left: `${MODE_LEFT}px`,
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
                        updateCameraPreview().catch(() => null);
                    }
                });
            } else {
                console.warn('[record_video_UI] dropDown() is not available; mode selector not shown.');
            }
        } catch (e) {
            console.warn('[record_video_UI] Failed to mount mode selector:', e && e.message ? e.message : e);
        }

        // Camera preview
        try {
            const storedRect = loadPreviewRect();
            const initialLeft = Number.isFinite(storedRect?.left) ? storedRect.left : BASE_LEFT;
            const initialTop = Number.isFinite(storedRect?.top) ? storedRect.top : PREVIEW_TOP;
            const initialWidth = Number.isFinite(storedRect?.width) ? storedRect.width : PREVIEW_WIDTH;
            const initialHeight = Number.isFinite(storedRect?.height) ? storedRect.height : PREVIEW_HEIGHT;
            cameraState.holder = $('div', {
                id: 'record-video-camera-holder',
                parent: host,
                css: {
                    position: 'absolute',
                    top: `${initialTop}px`,
                    left: `${initialLeft}px`,
                    width: `${Math.max(PREVIEW_MIN_WIDTH, initialWidth)}px`,
                    height: `${Math.max(PREVIEW_MIN_HEIGHT, initialHeight)}px`,
                    backgroundColor: '#000',
                    border: '1px solid rgba(255,255,255,0.15)',
                    borderRadius: '4px',
                    overflow: 'hidden',
                    zIndex: 9999,
                    pointerEvents: 'auto'
                }
            });
            const dragHandle = $('div', {
                parent: cameraState.holder,
                text: 'Preview',
                css: {
                    position: 'absolute',
                    top: '0px',
                    left: '0px',
                    right: '0px',
                    height: '18px',
                    lineHeight: '18px',
                    backgroundColor: 'rgba(20, 20, 20, 0.6)',
                    color: '#dcdcdc',
                    fontSize: '10px',
                    fontFamily: 'Roboto, sans-serif',
                    textAlign: 'center',
                    cursor: 'move',
                    userSelect: 'none',
                    zIndex: 2
                }
            });
            const resizeHandle = $('div', {
                parent: cameraState.holder,
                css: {
                    position: 'absolute',
                    right: '2px',
                    bottom: '2px',
                    width: '12px',
                    height: '12px',
                    borderRight: '2px solid rgba(255,255,255,0.7)',
                    borderBottom: '2px solid rgba(255,255,255,0.7)',
                    cursor: 'nwse-resize',
                    zIndex: 2
                }
            });

            makePanelDraggable(cameraState.holder, dragHandle, host);
            makePanelResizable(cameraState.holder, resizeHandle, host);
            renderCameraStatus('Camera preview');
            updateCameraPreview().catch(() => null);
        } catch (e) {
            console.warn('[record_video_UI] Failed to mount camera preview:', e && e.message ? e.message : e);
        }

        // Media selector + player (under the preview)
        try {
            mediaState.holder = $('div', {
                id: 'record-video-media-selector-holder',
                parent: host,
                css: {
                    position: 'absolute',
                    top: `${MEDIA_TOP}px`,
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
                    top: `${PLAYER_TOP}px`,
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
