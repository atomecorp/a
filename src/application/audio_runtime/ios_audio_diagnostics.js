const MAX_FIELD_LENGTH = 1800;
const MAX_ARRAY_ITEMS = 16;
const MAX_OBJECT_KEYS = 48;

const isIosWebkitConsoleAvailable = (env = globalThis) => !!(
    env?.webkit?.messageHandlers?.console
    && typeof env.webkit.messageHandlers.console.postMessage === 'function'
);

const readHostScope = (env = globalThis) => {
    const hostEnv = String(env?.__HOST_ENV || '').trim().toLowerCase();
    if (hostEnv === 'auv3') return 'auv3';
    if (hostEnv === 'app') return 'ios_app';
    return isIosWebkitConsoleAvailable(env) ? 'ios_webkit' : 'web';
};

const limitText = (value) => {
    const text = String(value == null ? '' : value);
    return text.length > MAX_FIELD_LENGTH
        ? `${text.slice(0, MAX_FIELD_LENGTH)}...<truncated:${text.length}>`
        : text;
};

const serializeDiagnosticValue = (value, depth = 0, seen = new WeakSet()) => {
    if (value == null) return value;
    const type = typeof value;
    if (type === 'string') return limitText(value);
    if (type === 'number' || type === 'boolean') return value;
    if (type === 'bigint') return String(value);
    if (type === 'function') return `[Function:${value.name || 'anonymous'}]`;
    if (value instanceof Error) {
        return {
            name: value.name || 'Error',
            message: limitText(value.message || ''),
            stack: limitText(value.stack || '')
        };
    }
    if (depth >= 4) return limitText(Object.prototype.toString.call(value));
    if (type !== 'object') return limitText(String(value));
    if (seen.has(value)) return '[Circular]';
    seen.add(value);
    if (Array.isArray(value)) {
        return value
            .slice(0, MAX_ARRAY_ITEMS)
            .map((item) => serializeDiagnosticValue(item, depth + 1, seen));
    }
    const output = {};
    Object.keys(value).slice(0, MAX_OBJECT_KEYS).forEach((key) => {
        output[key] = serializeDiagnosticValue(value[key], depth + 1, seen);
    });
    return output;
};

const postIosDiagnostic = (payload) => {
    if (!isIosWebkitConsoleAvailable(globalThis)) return false;
    globalThis.webkit.messageHandlers.console.postMessage(payload);
    return true;
};

export const emitIosAudioDiagnostic = (event, detail = {}, level = 'info') => {
    const payload = {
        component: 'ios_audio',
        level: String(level || 'info').toLowerCase(),
        event: String(event || 'event'),
        message: String(event || 'event'),
        data: {
            host_scope: readHostScope(globalThis),
            timestamp_ms: Date.now(),
            detail: serializeDiagnosticValue(detail)
        }
    };
    if (postIosDiagnostic(payload)) return true;
    if (level === 'error' && typeof console !== 'undefined' && typeof console.error === 'function') {
        console.error('[ios_audio]', payload.event, payload.data.detail);
    }
    return false;
};

const formatConsoleArgument = (value) => {
    if (typeof value === 'string') return limitText(value);
    const serialized = serializeDiagnosticValue(value);
    if (serialized == null) return String(serialized);
    if (typeof serialized === 'string') return serialized;
    return limitText(JSON.stringify(serialized));
};

const summarizeElement = (node) => {
    const element = node && node.nodeType === 3 ? node.parentElement : node;
    if (!element || element.nodeType !== 1) return null;
    return {
        tag: String(element.tagName || '').toLowerCase(),
        id: String(element.id || '').trim() || null,
        class_name: String(element.className || '').trim().slice(0, 220) || null,
        role: String(element.getAttribute?.('role') || '').trim() || null,
        aria_label: String(element.getAttribute?.('aria-label') || '').trim() || null,
        title: String(element.getAttribute?.('title') || '').trim() || null,
        text: String(element.textContent || '').trim().slice(0, 120) || null,
        dataset: serializeDiagnosticValue(element.dataset || {})
    };
};

const findPlaybackInteractionElement = (target) => {
    let node = target && target.nodeType === 3 ? target.parentElement : target;
    for (let depth = 0; node && depth < 7; depth += 1, node = node.parentElement) {
        if (!node || node.nodeType !== 1) continue;
        const haystack = [
            node.id,
            node.className,
            node.getAttribute?.('role'),
            node.getAttribute?.('aria-label'),
            node.getAttribute?.('title'),
            node.dataset?.toolId,
            node.dataset?.toolKey,
            node.dataset?.nameKey,
            node.dataset?.footerToolKey,
            node.dataset?.action,
            node.dataset?.event,
            node.textContent
        ].map((value) => String(value || '').toLowerCase()).join(' ');
        const isPlaybackTarget = (
            haystack.includes('play')
            || haystack.includes('transport')
            || haystack.includes('mtrack')
            || haystack.includes('timeline')
        );
        if (isPlaybackTarget) return node;
    }
    return null;
};

const installPlaybackInteractionBridge = () => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return false;
    if (window.__ATOME_IOS_PLAYBACK_INTERACTION_BRIDGE_INSTALLED__ === true) return true;
    window.__ATOME_IOS_PLAYBACK_INTERACTION_BRIDGE_INSTALLED__ = true;
    ['pointerdown', 'click', 'touchend', 'keydown'].forEach((eventName) => {
        document.addEventListener(eventName, (event) => {
            const key = String(event?.key || '').trim();
            const playbackKey = key === ' ' || String(event?.code || '').trim() === 'Space';
            const target = playbackKey
                ? event.target
                : findPlaybackInteractionElement(event.target);
            if (!target) return;
            emitIosAudioDiagnostic(`ui:${eventName}`, {
                key: key || null,
                code: String(event?.code || '').trim() || null,
                pointer_type: String(event?.pointerType || '').trim() || null,
                button: Number.isFinite(Number(event?.button)) ? Number(event.button) : null,
                client_x: Number.isFinite(Number(event?.clientX)) ? Math.round(Number(event.clientX)) : null,
                client_y: Number.isFinite(Number(event?.clientY)) ? Math.round(Number(event.clientY)) : null,
                default_prevented: event?.defaultPrevented === true,
                target: summarizeElement(event.target),
                playback_target: summarizeElement(target)
            });
        }, true);
    });
    return true;
};

export const installIosConsoleBridge = () => {
    if (typeof window === 'undefined') return false;
    if (window.__ATOME_IOS_CONSOLE_BRIDGE_INSTALLED__ === true) return true;
    if (!isIosWebkitConsoleAvailable(window)) return false;

    const originalConsole = {
        log: typeof window.console?.log === 'function' ? window.console.log.bind(window.console) : null,
        info: typeof window.console?.info === 'function' ? window.console.info.bind(window.console) : null,
        warn: typeof window.console?.warn === 'function' ? window.console.warn.bind(window.console) : null,
        error: typeof window.console?.error === 'function' ? window.console.error.bind(window.console) : null,
        debug: typeof window.console?.debug === 'function' ? window.console.debug.bind(window.console) : null
    };

    const forwardConsole = (level, args) => {
        postIosDiagnostic({
            component: 'js_console',
            level,
            message: Array.from(args || []).map(formatConsoleArgument).join(' '),
            data: {
                host_scope: readHostScope(window),
                timestamp_ms: Date.now()
            }
        });
    };

    ['log', 'info', 'warn', 'error', 'debug'].forEach((level) => {
        window.console[level] = (...args) => {
            forwardConsole(level === 'log' ? 'info' : level, args);
            const original = originalConsole[level] || originalConsole.log;
            if (original) original(...args);
        };
    });

    window.addEventListener('error', (event) => {
        emitIosAudioDiagnostic('window_error', {
            message: event?.message || '',
            source: event?.filename || '',
            line: event?.lineno || 0,
            column: event?.colno || 0,
            error: event?.error || null
        }, 'error');
    });

    window.addEventListener('unhandledrejection', (event) => {
        emitIosAudioDiagnostic('unhandled_rejection', {
            reason: event?.reason || null
        }, 'error');
    });

    window.__ATOME_IOS_CONSOLE_BRIDGE_INSTALLED__ = true;
    installPlaybackInteractionBridge();
    emitIosAudioDiagnostic('console_bridge_installed', {
        host_scope: readHostScope(window)
    });
    return true;
};

installIosConsoleBridge();
