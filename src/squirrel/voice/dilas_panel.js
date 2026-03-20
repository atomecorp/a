import { createEveDialog, revealEveDialog } from '../../application/eVe/elements/design.js';
import { eveT, onEveLocaleChange } from '../../application/eVe/i18n/i18n.js';
import { mountHomeVoiceSurface } from './home_surface.js';

const PANEL_KEY = '__SQUIRREL_DILAS_PANEL__';

const toText = (value) => String(value || '').trim();

const ensureDilasPanel = async ({
    env = globalThis
} = {}) => {
    if (!env?.document) return null;
    if (env[PANEL_KEY]) return env[PANEL_KEY];

    let closePanel = async () => true;
    const dialog = createEveDialog({
        id: 'eve_dilas_dialog',
        title: eveT('eve.voice.eve.title', 'eVe'),
        titleKey: 'eve.voice.eve.title',
        titleFallback: 'eVe',
        css: {
            left: '96px',
            top: '96px',
            width: '460px'
        },
        showFooter: false,
        showBodyFooter: false,
        showClose: true,
        onClose: () => {
            void closePanel();
        }
    });

    if (dialog?.body) {
        Object.assign(dialog.body.style, {
            overflowY: 'auto',
            overflowX: 'hidden'
        });
    }

    const headerVoiceWrap = env.document.createElement('div');
    headerVoiceWrap.id = 'eve_dilas_dialog__voice_status';
    Object.assign(headerVoiceWrap.style, {
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        marginLeft: 'auto',
        marginRight: '10px',
        minWidth: '0',
        maxWidth: '240px'
    });

    const headerVoiceText = env.document.createElement('div');
    headerVoiceText.id = 'eve_dilas_dialog__voice_status__text';
    Object.assign(headerVoiceText.style, {
        fontSize: '10px',
        color: 'rgba(255,255,255,0.82)',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        minWidth: '0'
    });

    const headerVoiceMeterHost = env.document.createElement('div');
    headerVoiceMeterHost.id = 'eve_dilas_dialog__voice_status__meter';
    Object.assign(headerVoiceMeterHost.style, {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minWidth: '116px',
        height: '26px'
    });

    headerVoiceWrap.append(headerVoiceText, headerVoiceMeterHost);
    dialog.header?.insertBefore(headerVoiceWrap, env.document.getElementById('eve_dilas_dialog__close') || null);

    const host = env.document.createElement('div');
    host.id = 'eve_dilas_dialog_voice_surface';
    Object.assign(host.style, {
        width: '100%',
        display: 'flex',
        flexDirection: 'column'
    });
    dialog.body.appendChild(host);

    let surfacePromise = null;
    let runtimeUnsubscribe = () => {};

    const syncHeaderState = () => {
        const controller = host?.__eveHomeVoiceSurfaceController;
        const state = controller?.getState?.() || null;
        if (!state) {
            headerVoiceText.textContent = '';
            return;
        }
        if (toText(state.errorMessage)) {
            headerVoiceText.textContent = state.errorMessage;
            return;
        }
        if (state.processing) {
            headerVoiceText.textContent = 'Je reflechis';
            return;
        }
        if (state.speaking) {
            headerVoiceText.textContent = 'Je parle';
            return;
        }
        if (state.listening) {
            headerVoiceText.textContent = 'J ecoute';
            return;
        }
        headerVoiceText.textContent = '';
    };

    const ensureSurface = () => {
        if (surfacePromise) return surfacePromise;
        surfacePromise = mountHomeVoiceSurface({
            env,
            host,
            textOnly: true
        }).catch((error) => {
            surfacePromise = null;
            env.console?.warn?.('[voice.dilas_panel] Failed to mount Dilas surface:', error?.message || error);
            return null;
        }).then((controller) => {
            const meterCanvas = host.querySelector('[data-role="eve-voice-meter"]');
            if (meterCanvas && meterCanvas.parentNode !== headerVoiceMeterHost) {
                headerVoiceMeterHost.innerHTML = '';
                headerVoiceMeterHost.appendChild(meterCanvas);
            }
            syncHeaderState();
            try { runtimeUnsubscribe(); } catch (_) { }
            runtimeUnsubscribe = env?.Squirrel?.voice?.subscribe?.(() => {
                syncHeaderState();
            }) || (() => {});
            return controller;
        });
        return surfacePromise;
    };

    const open = async () => {
        revealEveDialog(dialog, { center: false });
        const controller = await ensureSurface();
        controller?.activate?.();
        syncHeaderState();
        return controller;
    };

    const close = async () => {
        if (dialog?.root) {
            dialog.root.style.display = 'none';
        }
        await host?.__eveHomeVoiceSurfaceController?.deactivate?.();
        syncHeaderState();
        return true;
    };
    closePanel = close;
    if (dialog?.root) {
        dialog.root.style.display = 'none';
    }

    onEveLocaleChange(() => {
        host?.__eveHomeVoiceSurfaceController?.refreshLabels?.();
        syncHeaderState();
    });

    env.open_dilas_panel = open;
    env.close_dilas_panel = close;
    env[PANEL_KEY] = {
        dialog,
        host,
        ensureSurface,
        open,
        close,
        get controller() {
            return host?.__eveHomeVoiceSurfaceController || null;
        },
        destroy() {
            try { runtimeUnsubscribe(); } catch (_) { }
        }
    };
    return env[PANEL_KEY];
};

export const openDilasPanel = async ({
    env = (typeof window !== 'undefined' ? window : globalThis)
} = {}) => {
    const panel = await ensureDilasPanel({ env });
    if (!panel) return null;
    return panel.open();
};

export const bootstrapDilasPanel = ({
    env = (typeof window !== 'undefined' ? window : globalThis)
} = {}) => {
    ensureDilasPanel({ env }).catch((error) => {
        env.console?.warn?.('[voice.dilas_panel] bootstrap failed:', error?.message || error);
    });
    return true;
};
