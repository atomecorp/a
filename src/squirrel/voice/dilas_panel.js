import { createEveDialog, revealEveDialog } from '../../application/eVe/elements/design.js';
import { eveT, onEveLocaleChange } from '../../application/eVe/i18n/i18n.js';
import { mountHomeVoiceSurface } from './home_surface.js';

const PANEL_KEY = '__SQUIRREL_DILAS_PANEL__';

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

    const host = env.document.createElement('div');
    host.id = 'eve_dilas_dialog_voice_surface';
    Object.assign(host.style, {
        width: '100%',
        display: 'flex',
        flexDirection: 'column'
    });
    dialog.body.appendChild(host);

    let surfacePromise = null;
    const ensureSurface = () => {
        if (surfacePromise) return surfacePromise;
        surfacePromise = mountHomeVoiceSurface({
            env,
            host
        }).catch((error) => {
            surfacePromise = null;
            env.console?.warn?.('[voice.dilas_panel] Failed to mount Dilas surface:', error?.message || error);
            return null;
        });
        return surfacePromise;
    };

    const open = async () => {
        revealEveDialog(dialog, { center: false });
        const controller = await ensureSurface();
        controller?.activate?.();
        return controller;
    };

    const close = async () => {
        if (dialog?.root) {
            dialog.root.style.display = 'none';
        }
        await host?.__eveHomeVoiceSurfaceController?.deactivate?.();
        return true;
    };
    closePanel = close;
    if (dialog?.root) {
        dialog.root.style.display = 'none';
    }

    onEveLocaleChange(() => {
        host?.__eveHomeVoiceSurfaceController?.refreshLabels?.();
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
