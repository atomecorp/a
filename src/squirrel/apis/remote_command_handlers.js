/**
 * Built-in Remote Command Handlers
 * 
 * Standard handlers for common remote commands.
 * These can be enabled/disabled individually.
 * 
 * Usage:
 *   import { BuiltinHandlers } from './remote_command_handlers.js';
 *   import { RemoteCommands } from './remote_commands.js';
 *   
 *   // Register all built-in handlers
 *   BuiltinHandlers.registerAll();
 *   
 *   // Or register specific handlers
 *   BuiltinHandlers.register('create-element');
 *   BuiltinHandlers.register('show-notification');
 */

import { RemoteCommands } from './remote_commands.js';

const REMOTE_COMMAND_HANDLERS_DEBUG = (typeof window !== 'undefined' && window.__REMOTE_COMMAND_HANDLERS_DEBUG__ === true);
function _rcDebugLog(...args) {
    if (REMOTE_COMMAND_HANDLERS_DEBUG) console.log(...args);
}

/**
 * Handler: create-element
 * Creates a DOM element using Squirrel $ syntax
 * 
 * Params:
 *   - tag: string (default: 'div')
 *   - id: string (optional, auto-generated if not provided)
 *   - parent: string (CSS selector, default: '#view')
 *   - css: object (CSS styles)
 *   - text: string (optional)
 *   - html: string (optional)
 */
function handleCreateElement(params, sender) {
    _rcDebugLog('[BuiltinHandlers] create-element called with:', params);

    if (typeof window.$ !== 'function') {
        console.error('[BuiltinHandlers] Squirrel $ not available');
        return;
    }

    const {
        tag = 'div',
        id = `remote_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        parent,
        css = {},
        text,
        html
    } = params;

    // Build config - don't set parent if not specified, let Squirrel use its default (#view)
    const config = {
        id,
        css: {
            position: 'absolute',
            zIndex: '9999',
            pointerEvents: 'auto',
            ...css
        }
    };

    // Determine parent: explicit > current project container > default (#view)
    if (parent) {
        config.parent = parent;
    } else {
        // Try to attach to current project container if available
        const currentProjectId = window.__currentProject?.id ||
            (typeof AdoleAPI !== 'undefined' && AdoleAPI.projects?.getCurrentId?.());

        if (currentProjectId) {
            const projectContainer = document.getElementById('project_view_' + currentProjectId);
            if (projectContainer) {
                config.parent = '#project_view_' + currentProjectId;
                _rcDebugLog('[BuiltinHandlers] Attaching to current project:', currentProjectId.substring(0, 8) + '...');
            }
        }
        // If no current project, Squirrel will use default #view
    }

    if (text !== undefined) config.text = text;
    if (html !== undefined) config.html = html;

    _rcDebugLog('[BuiltinHandlers] Creating element with config:', config);

    const element = window.$(tag, config);

    _rcDebugLog('[BuiltinHandlers] Element created:', element, 'parent:', element?.parentElement?.id);

    _rcDebugLog(`[BuiltinHandlers] Created element #${id} from ${sender.username || sender.userId}`);

    return element;
}

/**
 * Handler: remove-element
 * Removes a DOM element by ID
 * 
 * Params:
 *   - id: string (element ID to remove)
 */
function handleRemoveElement(params, sender) {
    const { id } = params;
    if (!id) {
        console.error('[BuiltinHandlers] remove-element: missing id');
        return;
    }

    const element = document.getElementById(id);
    if (element) {
        element.remove();
        _rcDebugLog(`[BuiltinHandlers] Removed element #${id} from ${sender.username || sender.userId}`);
    } else {
        console.warn(`[BuiltinHandlers] Element #${id} not found`);
    }
}

/**
 * Handler: update-element
 * Updates an existing DOM element
 * 
 * Params:
 *   - id: string (element ID)
 *   - css: object (CSS styles to apply)
 *   - text: string (optional)
 *   - html: string (optional)
 */
function handleUpdateElement(params, sender) {
    const { id, css, text, html } = params;
    if (!id) {
        console.error('[BuiltinHandlers] update-element: missing id');
        return;
    }

    const element = document.getElementById(id);
    if (!element) {
        console.warn(`[BuiltinHandlers] Element #${id} not found`);
        return;
    }

    if (css && typeof css === 'object') {
        Object.assign(element.style, css);
    }

    if (text !== undefined) {
        element.textContent = text;
    }

    if (html !== undefined) {
        element.innerHTML = html;
    }

    _rcDebugLog(`[BuiltinHandlers] Updated element #${id} from ${sender.username || sender.userId}`);
}

/**
 * Handler: show-notification
 * Shows a temporary notification on screen
 * 
 * Params:
 *   - message: string
 *   - type: 'info' | 'success' | 'warning' | 'error' (default: 'info')
 *   - duration: number (ms, default: 3000)
 */
function handleShowNotification(params, sender) {
    if (typeof window.$ !== 'function') {
        console.error('[BuiltinHandlers] Squirrel $ not available');
        return;
    }

    const {
        message = 'Notification',
        type = 'info',
        duration = 3000
    } = params;

    const colors = {
        info: { bg: '#2196F3', text: 'white' },
        success: { bg: '#4CAF50', text: 'white' },
        warning: { bg: '#FF9800', text: 'black' },
        error: { bg: '#f44336', text: 'white' }
    };

    const color = colors[type] || colors.info;
    const notifId = `notif_${Date.now()}`;

    const notif = window.$('div', {
        id: notifId,
        parent: 'body',
        css: {
            position: 'fixed',
            top: '20px',
            right: '20px',
            padding: '15px 25px',
            backgroundColor: color.bg,
            color: color.text,
            borderRadius: '8px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            zIndex: '99999',
            fontFamily: 'system-ui, sans-serif',
            fontSize: '14px',
            maxWidth: '300px',
            wordWrap: 'break-word',
            opacity: '0',
            transform: 'translateX(100%)',
            transition: 'all 0.3s ease'
        },
        text: message
    });

    // Animate in
    requestAnimationFrame(() => {
        notif.style.opacity = '1';
        notif.style.transform = 'translateX(0)';
    });

    // Auto-remove
    setTimeout(() => {
        notif.style.opacity = '0';
        notif.style.transform = 'translateX(100%)';
        setTimeout(() => notif.remove(), 300);
    }, duration);

    console.log(`[BuiltinHandlers] Notification from ${sender.username || sender.userId}: ${message}`);
}

/**
 * Handler: execute-code
 * Executes JavaScript code (DANGEROUS - use with caution)
 * Disabled by default, must be explicitly enabled
 * 
 * Params:
 *   - code: string (JavaScript code to execute)
 */
let executeCodeEnabled = false;

function handleExecuteCode(params, sender) {
    if (!executeCodeEnabled) {
        console.warn('[BuiltinHandlers] execute-code is disabled for security');
        return;
    }

    const { code } = params;
    if (!code || typeof code !== 'string') {
        console.error('[BuiltinHandlers] execute-code: missing or invalid code');
        return;
    }

    console.log(`[BuiltinHandlers] Executing code from ${sender.username || sender.userId}`);

    try {
        // Execute in a somewhat isolated context
        const fn = new Function('sender', code);
        fn(sender);
    } catch (e) {
        console.error('[BuiltinHandlers] Code execution error:', e);
    }
}

/**
 * Handler: ping
 * Simple ping/pong for testing connectivity
 * 
 * Params: none
 */
function handlePing(params, sender) {
    console.log(`[BuiltinHandlers] Ping received from ${sender.username || sender.userId}`);

    // Send pong back
    RemoteCommands.sendCommand(sender.userId, 'pong', {
        timestamp: Date.now(),
        receivedAt: new Date().toISOString()
    });
}

/**
 * Handler: pong
 * Response to ping
 * 
 * Params:
 *   - timestamp: number
 *   - receivedAt: string
 */
function handlePong(params, sender) {
    const latency = Date.now() - (params.timestamp || Date.now());
    console.log(`[BuiltinHandlers] Pong from ${sender.username || sender.userId} - latency: ${latency}ms`);
}

const _shareSyncDedup = new Map();

/**
 * Handler: share-sync
 * Applies incoming property changes for an atome (linked-share realtime)
 *
 * Params:
 *   - atomeId: string
 *   - properties: object
 */
function handleShareSync(params, sender) {
    const atomeId = params?.atomeId || params?.atome_id || params?.id;
    const properties = params?.properties || params?.particles || params?.patch || null;

    // Some apps may send legacy direction-based payloads (handled elsewhere).
    // Builtin handler should ignore those quietly.
    if (!atomeId) return;
    if (!properties || typeof properties !== 'object') {
        return;
    }

    // Deletion broadcast (realtimePatch uses { __deleted: true })
    if (properties.__deleted === true || properties.deleted === true || properties.__action === 'delete') {
        const candidatesToRemove = [
            document.getElementById('atome_' + atomeId),
            document.getElementById(atomeId)
        ].filter(Boolean);

        for (const el of candidatesToRemove) {
            try { el.remove(); } catch (_) { }
        }
        return;
    }

    // Dedupe identical patches arriving close together (e.g. server broadcast + direct message)
    try {
        const payload = JSON.stringify(properties);
        const now = Date.now();
        const last = _shareSyncDedup.get(String(atomeId));
        if (last && last.payload === payload && (now - last.at) < 100) return;
        _shareSyncDedup.set(String(atomeId), { payload, at: now });
    } catch (_) { }

    const candidates = [
        document.getElementById('atome_' + atomeId),
        document.getElementById(atomeId)
    ].filter(Boolean);

    if (candidates.length === 0) {
        // Atome might not be currently rendered in this view; don't force reload.
        return;
    }

    const normalizeCssValue = (key, value) => {
        if (value === null || value === undefined) return null;

        // Numbers should be px for positional/dimensions.
        const pxKeys = new Set(['left', 'top', 'right', 'bottom', 'width', 'height', 'margin', 'marginLeft', 'marginTop']);
        if (typeof value === 'number' && pxKeys.has(key)) return `${value}px`;

        return String(value);
    };

    for (const el of candidates) {
        if ('left' in properties) {
            const v = normalizeCssValue('left', properties.left);
            if (v !== null) el.style.left = v;
        }
        if ('top' in properties) {
            const v = normalizeCssValue('top', properties.top);
            if (v !== null) el.style.top = v;
        }

        // Color can arrive as `color` (Adole particle) or `backgroundColor` (some UIs)
        if ('color' in properties) {
            const v = normalizeCssValue('backgroundColor', properties.color);
            if (v !== null) el.style.backgroundColor = v;
        }
        if ('backgroundColor' in properties) {
            const v = normalizeCssValue('backgroundColor', properties.backgroundColor);
            if (v !== null) el.style.backgroundColor = v;
        }

        if ('borderRadius' in properties) {
            const v = normalizeCssValue('borderRadius', properties.borderRadius);
            if (v !== null) el.style.borderRadius = v;
        }

        if ('opacity' in properties) {
            const raw = properties.opacity;
            const v = (typeof raw === 'number') ? String(raw) : normalizeCssValue('opacity', raw);
            if (v !== null) el.style.opacity = v;
        }
    }

    if (window.__SHARE_SYNC_DEBUG__ === true) {
        console.log('[BuiltinHandlers] share-sync applied', {
            atomeId: String(atomeId).substring(0, 8),
            from: sender?.userId || sender?.username || 'unknown',
            keys: Object.keys(properties)
        });
    }
}

// Handler registry
const handlers = {
    'create-element': handleCreateElement,
    'remove-element': handleRemoveElement,
    'update-element': handleUpdateElement,
    'show-notification': handleShowNotification,
    'execute-code': handleExecuteCode,
    'ping': handlePing,
    'pong': handlePong,
    'share-sync': handleShareSync
};

// Safe handlers (enabled by default with registerAll)
const safeHandlers = [
    'create-element',
    'remove-element',
    'update-element',
    'show-notification',
    'ping',
    'pong',
    'share-sync'
];

/**
 * Register a specific handler
 */
function register(commandName) {
    const handler = handlers[commandName];
    if (!handler) {
        console.error(`[BuiltinHandlers] Unknown handler: ${commandName}`);
        return false;
    }
    RemoteCommands.register(commandName, handler);
    return true;
}

/**
 * Unregister a specific handler
 */
function unregister(commandName) {
    RemoteCommands.unregister(commandName);
}

/**
 * Register all safe handlers
 */
function registerAll() {
    safeHandlers.forEach(name => register(name));
    console.log('[BuiltinHandlers] All safe handlers registered');
}

/**
 * Unregister all handlers
 */
function unregisterAll() {
    Object.keys(handlers).forEach(name => unregister(name));
    console.log('[BuiltinHandlers] All handlers unregistered');
}

/**
 * Enable dangerous execute-code handler (use with extreme caution)
 */
function enableExecuteCode() {
    executeCodeEnabled = true;
    console.warn('[BuiltinHandlers] ⚠️ execute-code handler ENABLED - this is dangerous!');
}

/**
 * Disable execute-code handler
 */
function disableExecuteCode() {
    executeCodeEnabled = false;
    console.log('[BuiltinHandlers] execute-code handler disabled');
}

export const BuiltinHandlers = {
    register,
    unregister,
    registerAll,
    unregisterAll,
    enableExecuteCode,
    disableExecuteCode,

    // Direct access to handlers for custom use
    handlers: {
        createElement: handleCreateElement,
        removeElement: handleRemoveElement,
        updateElement: handleUpdateElement,
        showNotification: handleShowNotification,
        ping: handlePing,
        pong: handlePong,
        shareSync: handleShareSync
    }
};

// Expose handlers on globalThis so other runtimes (e.g. Unified ws/api adapter)
// can dispatch incoming console-message commands without importing this module.
// This is intentionally side-effect-light (no auto-registering).
try {
    if (typeof globalThis !== 'undefined') {
        globalThis.BuiltinHandlers = BuiltinHandlers;
    }
} catch (_) { }

export default BuiltinHandlers;
