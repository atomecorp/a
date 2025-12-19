/**
 * Remote Commands Module
 * 
 * Professional architecture for receiving and handling remote commands
 * via WebSocket direct-message system.
 * 
 * Features:
 * - Connects only after user login (not at module load)
 * - Command registry pattern for extensibility
 * - Sender validation and filtering
 * - Dedicated WebSocket (doesn't interfere with adole.js)
 * - Auto-reconnect with authentication
 * 
 * Usage:
 *   import { RemoteCommands } from './remote_commands.js';
 *   
 *   // Register a command handler
 *   RemoteCommands.register('create-element', (params, sender) => {
 *     console.log('Creating element:', params);
 *   });
 *   
 *   // Start listening (call after user login)
 *   await RemoteCommands.start();
 *   
 *   // Stop listening
 *   RemoteCommands.stop();
 */

const CONFIG = {
    WS_URL: null, // Will be loaded from server_config.json
    RECONNECT_DELAY: 5000,
    AUTH_TIMEOUT: 8000,
    DEBUG: false
};

// Command handler registry
const commandHandlers = new Map();

// Allowed senders (empty = allow all authenticated users)
let allowedSenders = new Set();

// WebSocket state
let socket = null;
let isConnected = false;
let isAuthenticated = false;
let currentUserId = null;
let reconnectTimer = null;
let pingTimer = null;
let configLoaded = false;

/**
 * Load WebSocket URL from server_config.json
 * Single source of truth for server configuration
 */
async function loadConfigOnce() {
    if (configLoaded && CONFIG.WS_URL) return CONFIG.WS_URL;

    if (typeof window !== 'undefined' && typeof window.__SQUIRREL_FASTIFY_WS_API_URL__ === 'string') {
        const wsUrl = window.__SQUIRREL_FASTIFY_WS_API_URL__.trim();
        if (wsUrl) {
            CONFIG.WS_URL = wsUrl;
            configLoaded = true;
            return CONFIG.WS_URL;
        }
    }

    try {
        const isTauriRuntime = !!(window.__TAURI__ || window.__TAURI_INTERNALS__);
        const localPort = window.__ATOME_LOCAL_HTTP_PORT__ || 3001;
        const localBase = isTauriRuntime ? `http://127.0.0.1:${localPort}` : '';
        const configUrl = isTauriRuntime ? `${localBase}/server_config.json` : '/server_config.json';

        const response = await fetch(configUrl, { cache: 'no-store' });
        if (!response || !response.ok) {
            // Do not permanently cache a failure: server may be starting up.
            return null;
        }

        const config = await response.json();
        const host = config?.fastify?.host || '127.0.0.1';
        const port = config?.fastify?.port || localPort;
        const apiWsPath = config?.fastify?.apiWsPath || '/ws/api';

        const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
        CONFIG.WS_URL = `${protocol}://${host}:${port}${apiWsPath}`;
        configLoaded = true;

        log('Loaded config from server_config.json:', CONFIG.WS_URL);
        return CONFIG.WS_URL;
    } catch (error) {
        log('Failed to load server_config.json:', error.message);
        // Do not permanently cache a failure.
        return null;
    }
}

/**
 * Debug log helper
 */
function log(...args) {
    if (CONFIG.DEBUG) {
        console.log('[RemoteCommands]', ...args);
    }
}

/**
 * Get auth token from localStorage
 * Uses the same logic as check.js getFastifyToken()
 */
function getToken() {
    try {
        const hostname = window.location?.hostname || '';
        const isTauriRuntime = !!(window.__TAURI__ || window.__TAURI_INTERNALS__);
        const isLocalDev = isTauriRuntime
            || hostname === 'localhost'
            || hostname === '127.0.0.1'
            || hostname === ''
            || hostname.startsWith('192.168.')
            || hostname.startsWith('10.');

        // For Fastify ws/api calls we must prefer the Fastify-issued JWT.
        // local_auth_token may come from Tauri and can be signed with a different secret.
        const token = isLocalDev
            ? (localStorage.getItem('cloud_auth_token') || localStorage.getItem('auth_token') || localStorage.getItem('local_auth_token'))
            : (localStorage.getItem('cloud_auth_token') || localStorage.getItem('auth_token') || localStorage.getItem('local_auth_token'));

        return token && token.length > 10 ? token : null;
    } catch {
        return null;
    }
}

/**
 * Register a command handler
 * @param {string} commandName - The command name to handle
 * @param {Function} handler - Handler function (params, senderInfo) => void
 */
function register(commandName, handler) {
    if (typeof handler !== 'function') {
        throw new Error(`Handler for "${commandName}" must be a function`);
    }
    commandHandlers.set(commandName, handler);
    log(`Registered handler for command: ${commandName}`);
}

/**
 * Unregister a command handler
 * @param {string} commandName - The command name to unregister
 */
function unregister(commandName) {
    commandHandlers.delete(commandName);
    log(`Unregistered handler for command: ${commandName}`);
}

/**
 * Set allowed senders (for filtering)
 * @param {string[]} userIds - Array of allowed user IDs (empty = allow all)
 */
function setAllowedSenders(userIds) {
    allowedSenders = new Set(userIds);
    log(`Allowed senders set:`, userIds.length === 0 ? 'ALL' : userIds);
}

/**
 * Check if sender is allowed
 */
function isSenderAllowed(senderId) {
    if (allowedSenders.size === 0) return true;
    return allowedSenders.has(senderId);
}

/**
 * Handle incoming message
 */
function handleMessage(data) {
    try {
        const message = JSON.parse(data);

        // Ignore pong
        if (message.type === 'pong') return;

        // Ignore direct-message-response (ACKs from our own sends)
        if (message.type === 'direct-message-response') return;

        // Handle console-message (this is how incoming direct-messages arrive)
        if (message.type === 'console-message') {
            processCommand(message);
            return;
        }

        // Handle auth-response (for initial auth)
        if (message.type === 'auth-response') {
            // Handled by authenticate() promise
            return;
        }

    } catch (e) {
        // Ignore parse errors
    }
}

/**
 * Process a potential command from a console-message
 */
function processCommand(message) {
    // Extract sender info - check various possible field names
    const senderId = message.from?.userId || message.from?.user_id || message.senderId || message.sender_id;
    const senderPhone = message.from?.phone || message.senderPhone || message.sender_phone;
    const senderUsername = message.from?.username || message.senderUsername || message.sender_username;
    const messageText = message.message;

    // Ignore probe messages (from check.js probe loop)
    if (messageText && typeof messageText === 'string' && messageText.includes('dm_probe')) {
        return;
    }

    log('Processing message:', { senderId, currentUserId, from: message.from, type: message.type });

    // Validate sender
    if (!isSenderAllowed(senderId)) {
        log(`Ignoring command from unauthorized sender: ${senderId}`);
        return;
    }

    // Don't process commands from self (avoid loops)
    if (senderId && senderId === currentUserId) {
        log('Ignoring command from self');
        return;
    }

    // Try to parse as JSON command
    let cmd;
    try {
        cmd = JSON.parse(messageText);
    } catch {
        // Not a JSON command, ignore
        log('Received non-command message:', messageText?.substring(0, 50));
        return;
    }

    // Validate command structure
    if (!cmd || typeof cmd.command !== 'string') {
        log('Invalid command structure:', cmd);
        return;
    }

    const commandName = cmd.command;
    const params = cmd.params || {};

    // Look up handler
    const handler = commandHandlers.get(commandName);
    if (!handler) {
        log(`No handler registered for command: ${commandName}`);
        return;
    }

    // Build sender info
    const senderInfo = {
        userId: senderId,
        phone: senderPhone,
        username: senderUsername,
        timestamp: message.timestamp
    };

    log(`Executing command "${commandName}" from ${senderUsername || senderId}`);

    // Execute handler
    try {
        handler(params, senderInfo);
    } catch (e) {
        console.error(`[RemoteCommands] Error executing command "${commandName}":`, e);
    }
}

/**
 * Authenticate the WebSocket connection
 */
function authenticate() {
    return new Promise((resolve) => {
        const token = getToken();
        if (!token) {
            log('No auth token available');
            resolve(false);
            return;
        }

        const authId = `rc_auth_${Date.now()}`;
        let resolved = false;

        const onMessage = (event) => {
            if (resolved) return;
            try {
                const m = JSON.parse(event.data);
                if (m.type === 'auth-response' && m.requestId === authId) {
                    socket.removeEventListener('message', onMessage);
                    resolved = true;
                    if (m.success) {
                        isAuthenticated = true;
                        // Only set from auth if not already set by start()
                        const authUserId = m.user?.user_id || m.user?.userId || m.user?.atome_id || m.user?.id || m.user?.sub;
                        if (!currentUserId) {
                            currentUserId = authUserId;
                        }
                        log(`Authenticated (WS user: ${m.user?.username}/${authUserId}, using: ${currentUserId})`);
                        resolve(true);
                    } else {
                        log('Authentication failed:', m.error);
                        resolve(false);
                    }
                }
            } catch { }
        };

        socket.addEventListener('message', onMessage);

        // Include registerAs to tell server which user ID to use for message routing
        // (important when multiple apps share the same token in localStorage)
        socket.send(JSON.stringify({
            type: 'auth',
            action: 'me',
            requestId: authId,
            token,
            registerAs: currentUserId || undefined
        }));

        // Timeout
        setTimeout(() => {
            if (!resolved) {
                socket.removeEventListener('message', onMessage);
                resolved = true;
                log('Authentication timeout');
                resolve(false);
            }
        }, CONFIG.AUTH_TIMEOUT);
    });
}

/**
 * Start ping/pong to keep connection alive
 */
function startPing() {
    stopPing();
    pingTimer = setInterval(() => {
        if (isConnected && socket?.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: 'ping' }));
        }
    }, 30000);
}

/**
 * Stop ping
 */
function stopPing() {
    if (pingTimer) {
        clearInterval(pingTimer);
        pingTimer = null;
    }
}

/**
 * Schedule reconnect
 */
function scheduleReconnect() {
    if (reconnectTimer) return;
    reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        connect();
    }, CONFIG.RECONNECT_DELAY);
}

/**
 * Connect to WebSocket and authenticate
 */
async function connect() {
    if (isConnected || socket?.readyState === WebSocket.CONNECTING) {
        return true;
    }

    const token = getToken();
    if (!token) {
        log('Cannot connect: no auth token');
        return false;
    }

    // Load config from server_config.json before connecting
    await loadConfigOnce();

    if (!CONFIG.WS_URL) {
        log('Cannot connect: missing WS_URL (server_config.json not available yet)');
        return false;
    }

    return new Promise((resolve) => {
        try {
            socket = new WebSocket(CONFIG.WS_URL);

            socket.onopen = async () => {
                isConnected = true;
                log('WebSocket connected');

                const authSuccess = await authenticate();
                if (authSuccess) {
                    startPing();
                    resolve(true);
                } else {
                    socket.close();
                    resolve(false);
                }
            };

            socket.onclose = () => {
                isConnected = false;
                isAuthenticated = false;
                stopPing();
                log('WebSocket disconnected');
                scheduleReconnect();
            };

            socket.onerror = () => {
                // Will trigger onclose
            };

            socket.onmessage = (event) => {
                handleMessage(event.data);
            };

            // Connection timeout
            setTimeout(() => {
                if (socket?.readyState === WebSocket.CONNECTING) {
                    socket.close();
                    resolve(false);
                }
            }, 5000);

        } catch (e) {
            log('Connection error:', e);
            resolve(false);
        }
    });
}

/**
 * Start the remote commands listener
 * Call this after user login
 * @param {string} userId - The actual logged-in user ID (not from WebSocket auth)
 */
async function start(userId) {
    log('Starting remote commands listener...');

    // Store the actual user ID passed from the app (not from WebSocket auth)
    // Fallback to global current user state if available.
    const resolvedUserId = userId || (typeof window !== 'undefined' ? window.__currentUser?.id : null);

    if (resolvedUserId) {
        currentUserId = resolvedUserId;
        log(`Using app user ID: ${resolvedUserId}`);
    }

    const connected = await connect();
    if (connected) {
        log('✅ Remote commands listener active');
    } else {
        log('❌ Failed to start remote commands listener');
    }
    return connected;
}

/**
 * Stop the remote commands listener
 */
function stop() {
    log('Stopping remote commands listener...');

    if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
    }

    stopPing();

    if (socket) {
        socket.onclose = null; // Prevent reconnect
        socket.close();
        socket = null;
    }

    isConnected = false;
    isAuthenticated = false;
    currentUserId = null;

    log('Remote commands listener stopped');
}

/**
 * Check if listener is active
 */
function isActive() {
    return isConnected && isAuthenticated;
}

/**
 * Get current user ID
 */
function getCurrentUserId() {
    return currentUserId;
}

/**
 * Send a command to another user
 * @param {string} target - Target user ID or phone number
 * @param {string} commandName - Command name
 * @param {object} params - Command parameters
 */
async function sendCommand(target, commandName, params = {}) {
    if (!isAuthenticated || !socket || socket.readyState !== WebSocket.OPEN) {
        log('Cannot send command: not connected');
        return { success: false, error: 'not_connected' };
    }

    const requestId = `rc_cmd_${Date.now()}_${Math.random().toString(16).slice(2)}`;

    // Detect if target is a phone number (digits only) or user ID (contains letters/dashes)
    const isPhone = /^\d+$/.test(target);

    return new Promise((resolve) => {
        let resolved = false;

        const onMessage = (event) => {
            if (resolved) return;
            try {
                const m = JSON.parse(event.data);
                if (m.type === 'direct-message-response' && m.requestId === requestId) {
                    socket.removeEventListener('message', onMessage);
                    resolved = true;
                    resolve({
                        success: m.success,
                        delivered: m.delivered,
                        queued: m.queued,
                        error: m.error
                    });
                }
            } catch { }
        };

        socket.addEventListener('message', onMessage);

        const payload = {
            type: 'direct-message',
            requestId,
            message: JSON.stringify({
                command: commandName,
                params
            })
        };

        // Use toPhone or toUserId based on target format
        if (isPhone) {
            payload.toPhone = target;
        } else {
            payload.toUserId = target;
        }

        socket.send(JSON.stringify(payload));

        // Timeout
        setTimeout(() => {
            if (!resolved) {
                socket.removeEventListener('message', onMessage);
                resolved = true;
                resolve({ success: false, error: 'timeout' });
            }
        }, 8000);
    });
}

// Export the module
export const RemoteCommands = {
    // Configuration
    setDebug: (enabled) => { CONFIG.DEBUG = enabled; },

    // Handler registration
    register,
    unregister,

    // Security
    setAllowedSenders,

    // Lifecycle
    start,
    stop,
    isActive,
    getCurrentUserId,

    // Sending
    sendCommand
};

export default RemoteCommands;
