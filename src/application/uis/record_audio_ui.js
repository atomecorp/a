// iPlug2 recorder UI (Squirrel-only)

(function () {
    if (typeof window === 'undefined') return;

    function onReady(cb) {
        if (window.Squirrel && window.Squirrel.$) {
            cb();
        } else {
            window.addEventListener('squirrel:ready', cb, { once: true });
        }
    }

    onReady(() => {
        const $ = (window.Squirrel && window.Squirrel.$) ? window.Squirrel.$ : window.$;
        const Button = (window.Squirrel && window.Squirrel.Button) ? window.Squirrel.Button : window.Button;
        const resolvedHost = (typeof grab === 'function')
            ? (grab('intuition') || grab('inutuition') || grab('view'))
            : null;
        const host = resolvedHost || 'body';

        if (!$ || !Button) return;
        if (typeof grab === 'function' && grab('record-audio-panel')) return;

        const state = {
            recording: false,
            sessionId: null,
            source: 'mic',
            sampleRate: null,
            channels: null
        };

        const panel = $('div', {
            id: 'record-audio-panel',
            parent: host,
            css: {
                position: 'absolute',
                top: '10px',
                left: '10px',
                padding: '10px 12px',
                borderRadius: '8px',
                background: 'linear-gradient(135deg, rgba(20,24,28,0.95), rgba(8,10,12,0.95))',
                border: '1px solid rgba(255,255,255,0.08)',
                color: '#e8e8e8',
                fontFamily: 'Roboto, sans-serif',
                fontSize: '11px',
                zIndex: 100000,
                width: '220px'
            }
        });

        $('div', {
            parent: panel,
            text: 'Recorder',
            css: {
                fontSize: '12px',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                marginBottom: '8px',
                color: '#9fd3ff'
            }
        });

        const status = $('div', {
            parent: panel,
            text: 'Idle',
            css: {
                marginBottom: '8px',
                color: '#a0a0a0'
            }
        });

        const row = $('div', {
            parent: panel,
            css: {
                display: 'flex',
                gap: '8px',
                alignItems: 'center',
                marginBottom: '10px'
            }
        });

        const recordButton = Button({
            parent: row,
            text: 'Record',
            onText: 'Stop',
            offText: 'Record',
            template: 'material_design_blue',
            onStyle: { backgroundColor: '#c62828' },
            offStyle: { backgroundColor: '#445566' },
            initialState: false,
            onAction: async () => {
                if (typeof window.record_start !== 'function') {
                    status.$({ text: 'record_start() unavailable', css: { color: '#ff6b6b' } });
                    recordButton.setOffState();
                    return;
                }
                status.$({ text: 'Starting...', css: { color: '#9fd3ff' } });
                try {
                    const fileName = `${state.source}_${Date.now()}.wav`;
                    const sessionId = await window.record_start({
                        source: state.source,
                        fileName,
                        sampleRate: state.sampleRate,
                        channels: state.channels
                    });
                    state.sessionId = sessionId;
                    state.recording = true;
                    status.$({ text: `Recording (${state.source})`, css: { color: '#f7c26e' } });
                } catch (err) {
                    state.recording = false;
                    status.$({ text: err && err.message ? err.message : 'Record start failed', css: { color: '#ff6b6b' } });
                    recordButton.setOffState();
                }
            },
            offAction: async () => {
                if (!state.sessionId || typeof window.record_stop !== 'function') {
                    state.recording = false;
                    state.sessionId = null;
                    status.$({ text: 'No active session', css: { color: '#ff6b6b' } });
                    return;
                }
                status.$({ text: 'Stopping...', css: { color: '#9fd3ff' } });
                try {
                    const payload = await window.record_stop(state.sessionId);
                    const path = payload && (payload.path || payload.file_name || 'done');
                    status.$({ text: `Saved: ${path}`, css: { color: '#8fe3a7' } });
                } catch (err) {
                    status.$({ text: err && err.message ? err.message : 'Record stop failed', css: { color: '#ff6b6b' } });
                }
                state.recording = false;
                state.sessionId = null;
            }
        });

        const selectors = $('div', {
            parent: panel,
            css: {
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '8px'
            }
        });

        const sourceWrap = $('div', { parent: selectors });
        $('div', { parent: sourceWrap, text: 'Source', css: { marginBottom: '4px', color: '#8aa0b5' } });
        if (typeof dropDown === 'function') {
            dropDown({
                parent: sourceWrap,
                id: 'record_source_selector',
                theme: 'dark',
                options: [
                    { label: 'Mic', value: 'mic' },
                    { label: 'Plugin', value: 'plugin' }
                ],
                value: state.source,
                onChange: (val) => {
                    state.source = normalizeSource(val);
                }
            });
        }

        const rateWrap = $('div', { parent: selectors });
        $('div', { parent: rateWrap, text: 'Sample Rate', css: { marginBottom: '4px', color: '#8aa0b5' } });
        if (typeof dropDown === 'function') {
            dropDown({
                parent: rateWrap,
                id: 'record_rate_selector',
                theme: 'dark',
                options: [
                    { label: 'Auto', value: 'auto' },
                    { label: '16 kHz', value: '16000' },
                    { label: '44.1 kHz', value: '44100' },
                    { label: '48 kHz', value: '48000' }
                ],
                value: 'auto',
                onChange: (val) => {
                    state.sampleRate = (val === 'auto') ? null : Number(val);
                }
            });
        }

        const channelWrap = $('div', { parent: selectors, css: { gridColumn: '1 / span 2' } });
        $('div', { parent: channelWrap, text: 'Channels', css: { marginBottom: '4px', color: '#8aa0b5' } });
        if (typeof dropDown === 'function') {
            dropDown({
                parent: channelWrap,
                id: 'record_channel_selector',
                theme: 'dark',
                options: [
                    { label: 'Auto', value: 'auto' },
                    { label: 'Mono', value: '1' },
                    { label: 'Stereo', value: '2' }
                ],
                value: 'auto',
                onChange: (val) => {
                    state.channels = (val === 'auto') ? null : Number(val);
                }
            });
        }

        function normalizeSource(val) {
            const v = (typeof val === 'string' ? val : '').toLowerCase();
            return (v === 'plugin' || v === 'plugin_output') ? 'plugin' : 'mic';
        }
    });
})();
