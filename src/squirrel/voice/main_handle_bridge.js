const HANDLE_SELECTOR = '[data-role="main-toolbox-handle"]';
const LONG_PRESS_DELAY_MS = 520;
const MOVE_CANCEL_PX = 10;
const BRIDGE_KEY = '__SQUIRREL_VOICE_MAIN_HANDLE_BRIDGE__';

import { emitPerfEvent, perfElapsedMs, perfLog, perfNowMs } from '../../utils/perf_runtime.js';

const defaultImportModule = (path) => import(path);

const getClientPoint = (event) => {
    if (!event) return null;
    if (typeof event.clientX === 'number' && typeof event.clientY === 'number') {
        return { x: event.clientX, y: event.clientY };
    }
    const touch = event.touches?.[0] || event.changedTouches?.[0];
    if (touch && typeof touch.clientX === 'number' && typeof touch.clientY === 'number') {
        return { x: touch.clientX, y: touch.clientY };
    }
    return null;
};

const resolveDistanceExceeded = (origin, next) => {
    if (!origin || !next) return false;
    return Math.max(
        Math.abs(Number(next.x || 0) - Number(origin.x || 0)),
        Math.abs(Number(next.y || 0) - Number(origin.y || 0))
    ) > MOVE_CANCEL_PX;
};

const clearTimer = (state) => {
    if (!state?.timer) return;
    clearTimeout(state.timer);
    state.timer = 0;
};

const toggleDilasPanel = async ({
    env,
    anchorEl = null,
    importModule = defaultImportModule
} = {}) => {
    const panelPerfStart = perfNowMs();
    if (!env || typeof env !== 'object') return false;
    if (typeof env.toggle_dilas_panel !== 'function') {
        const module = await importModule('./dilas_panel.js');
        if (typeof module?.bootstrapDilasPanel === 'function') {
            module.bootstrapDilasPanel({ env });
        } else if (typeof module?.openDilasPanel === 'function') {
            await module.openDilasPanel({ env });
            return true;
        }
    }
    if (typeof env.toggle_dilas_panel === 'function') {
        await env.toggle_dilas_panel({ anchorEl });
        const totalMs = perfElapsedMs(panelPerfStart);
        perfLog('[Perf] voice.togglePanel', { totalMs, mode: 'toggle' });
        emitPerfEvent('voice.toggle_panel', { ok: true, totalMs, mode: 'toggle' });
        return true;
    }
    if (typeof env.open_dilas_panel === 'function') {
        await env.open_dilas_panel({ anchorEl });
        const totalMs = perfElapsedMs(panelPerfStart);
        perfLog('[Perf] voice.togglePanel', { totalMs, mode: 'open' });
        emitPerfEvent('voice.toggle_panel', { ok: true, totalMs, mode: 'open' });
        return true;
    }
    env.console?.warn?.('[voice.main_handle] dilas panel toggle unavailable');
    emitPerfEvent('voice.toggle_panel', {
        ok: false,
        totalMs: perfElapsedMs(panelPerfStart),
        error: 'dilas_panel_unavailable'
    });
    return false;
};

const openDilasPanel = async ({
    env,
    anchorEl = null,
    importModule = defaultImportModule
} = {}) => {
    const panelPerfStart = perfNowMs();
    if (!env || typeof env !== 'object') return false;
    if (typeof env.open_dilas_panel !== 'function' && typeof env.toggle_dilas_panel !== 'function') {
        const module = await importModule('./dilas_panel.js');
        if (typeof module?.bootstrapDilasPanel === 'function') {
            module.bootstrapDilasPanel({ env });
        } else if (typeof module?.openDilasPanel === 'function') {
            await module.openDilasPanel({ env });
            return true;
        }
    }
    if (typeof env.toggle_dilas_panel === 'function') {
        await env.toggle_dilas_panel({ anchorEl });
        const totalMs = perfElapsedMs(panelPerfStart);
        perfLog('[Perf] voice.openPanel', { totalMs, mode: 'toggle' });
        emitPerfEvent('voice.open_panel', { ok: true, totalMs, mode: 'toggle' });
        return true;
    }
    if (typeof env.open_dilas_panel !== 'function') {
        env.console?.warn?.('[voice.main_handle] open_dilas_panel unavailable');
        emitPerfEvent('voice.open_panel', {
            ok: false,
            totalMs: perfElapsedMs(panelPerfStart),
            error: 'dilas_panel_unavailable'
        });
        return false;
    }
    await env.open_dilas_panel({ anchorEl });
    const totalMs = perfElapsedMs(panelPerfStart);
    perfLog('[Perf] voice.openPanel', { totalMs, mode: 'open' });
    emitPerfEvent('voice.open_panel', { ok: true, totalMs, mode: 'open' });
    return true;
};

const installHandleBridge = ({
    env,
    handle,
    importModule = defaultImportModule
}) => {
    if (!handle || handle.__squirrelVoiceMainHandleBound === true) return false;
    handle.__squirrelVoiceMainHandleBound = true;

    const state = {
        timer: 0,
        startPoint: null,
        active: false,
        triggered: false,
        suppressClicksUntil: 0
    };

    const cancel = () => {
        clearTimer(state);
        state.active = false;
        state.startPoint = null;
    };

    const trigger = async () => {
        state.triggered = true;
        state.suppressClicksUntil = Date.now() + 900;
        handle.dataset.voiceHoldActive = 'true';
        try {
            await toggleDilasPanel({ env, anchorEl: handle, importModule });
        } catch (error) {
            env.console?.warn?.('[voice.main_handle] long-press open failed:', error?.message || error);
        } finally {
            delete handle.dataset.voiceHoldActive;
        }
    };

    const begin = (event) => {
        cancel();
        state.active = true;
        state.triggered = false;
        state.startPoint = getClientPoint(event);
        state.timer = setTimeout(() => {
            state.timer = 0;
            if (!state.active) return;
            void trigger();
        }, LONG_PRESS_DELAY_MS);
    };

    const move = (event) => {
        if (!state.active || !state.timer) return;
        const point = getClientPoint(event);
        if (resolveDistanceExceeded(state.startPoint, point)) {
            cancel();
        }
    };

    const end = () => {
        const hadTrigger = state.triggered === true;
        cancel();
        state.triggered = false;
        return hadTrigger;
    };

    handle.addEventListener('click', (event) => {
        if (Date.now() >= state.suppressClicksUntil) return;
        event.preventDefault();
        event.stopPropagation();
        if (typeof event.stopImmediatePropagation === 'function') {
            event.stopImmediatePropagation();
        }
    }, true);

    if (typeof env.PointerEvent === 'function') {
        handle.addEventListener('pointerdown', begin, { passive: true });
        handle.addEventListener('pointermove', move, { passive: true });
        handle.addEventListener('pointerup', end, { passive: true });
        handle.addEventListener('pointercancel', end, { passive: true });
        handle.addEventListener('pointerleave', end, { passive: true });
    } else {
        handle.addEventListener('mousedown', begin, { passive: true });
        handle.addEventListener('mousemove', move, { passive: true });
        handle.addEventListener('mouseup', end, { passive: true });
        handle.addEventListener('mouseleave', end, { passive: true });
        handle.addEventListener('touchstart', begin, { passive: true });
        handle.addEventListener('touchmove', move, { passive: true });
        handle.addEventListener('touchend', end, { passive: true });
        handle.addEventListener('touchcancel', end, { passive: true });
    }

    return true;
};

export const bootstrapMainHandleVoiceEntry = ({
    env = (typeof window !== 'undefined' ? window : globalThis),
    importModule = defaultImportModule
} = {}) => {
    if (!env?.document || env[BRIDGE_KEY]) return env?.[BRIDGE_KEY] || null;

    const attach = () => {
        const handles = Array.from(env.document.querySelectorAll(HANDLE_SELECTOR));
        handles.forEach((handle) => {
            installHandleBridge({ env, handle, importModule });
        });
        return handles.length;
    };

    attach();

    let observer = null;
    if (typeof env.MutationObserver === 'function' && env.document.body) {
        observer = new env.MutationObserver(() => {
            attach();
        });
        observer.observe(env.document.body, {
            subtree: true,
            childList: true
        });
    }

    env[BRIDGE_KEY] = {
        attach,
        destroy() {
            observer?.disconnect?.();
            delete env[BRIDGE_KEY];
        }
    };
    return env[BRIDGE_KEY];
};
