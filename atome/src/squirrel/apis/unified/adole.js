/**
 * adole.js
 *
 * Shared connectivity + adapter utilities for Unified APIs.
 * Provides backend detection, URL resolution, and connection state.
 *
 * @module unified/adole
 */

import { createWebSocketAdapter } from './adole_adapter.js';
import {
    CONFIG, resolveAuthSource, resolveProfileSource, resolveDataSource, resolveSyncDirection
} from './adole_backend.js';
import {
    checkConnection, resetConnectionState, getConnectionState, checkBackends, checkServerAvailable,
    generateUUID, generateClientId, getToken, setToken, clearToken
} from './adole_connection.js';

/**
 * Tauri/Axum adapter (localhost:3000, SQLite) - WebSocket-only
 * Uses createWebSocketAdapter for full ADOLE v3.0 compliance
 */
export const TauriAdapter = createWebSocketAdapter(CONFIG.TAURI_TOKEN_KEY, 'tauri');

/**
 * Fastify adapter (config-driven, WebSocket-only)
 * Uses createWebSocketAdapter for full ADOLE v3.0 compliance
 */
export const FastifyAdapter = createWebSocketAdapter(CONFIG.FASTIFY_TOKEN_KEY, 'fastify');

export default {
    CONFIG,
    checkBackends,
    checkServerAvailable,
    generateUUID,
    generateClientId,
    getToken,
    setToken,
    clearToken,
    resolveAuthSource,
    resolveProfileSource,
    resolveDataSource,
    resolveSyncDirection,
    createWebSocketAdapter,
    TauriAdapter,
    FastifyAdapter
};


// Re-export the public adole surface (moved to backend/connection/adapter modules) for external consumers.
export { createWebSocketAdapter };
export {
    CONFIG,
    resolveAuthSource,
    resolveProfileSource,
    resolveDataSource,
    resolveSyncDirection,
    checkConnection,
    resetConnectionState,
    getConnectionState,
    checkBackends,
    checkServerAvailable,
    generateUUID,
    generateClientId,
    getToken,
    setToken,
    clearToken
};

