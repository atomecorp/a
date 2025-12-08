/**
 * Unified API - Main Entry Point
 * 
 * Provides a single import for all unified APIs:
 * - UnifiedAuth: Authentication (register, login, logout, etc.)
 * - UnifiedAtome: Document CRUD (ADOLE compliant)
 * - UnifiedUserData: User data management
 * - UnifiedSync: Real-time synchronization
 * 
 * Also exports adapters for direct backend access if needed.
 * 
 * @module unified
 * 
 * @example
 * import { UnifiedAuth, UnifiedAtome, UnifiedSync } from '../../squirrel/apis/unified/index.js';
 * 
 * // Register and login
 * await UnifiedAuth.register({ username: "user", password: "pass123" });
 * await UnifiedAuth.login({ username: "user", password: "pass123" });
 * 
 * // Create document
 * const doc = await UnifiedAtome.create({
 *     kind: "code_file",
 *     data: { name: "hello.js", content: "console.log('hi');" }
 * });
 * 
 * // Sync
 * await UnifiedSync.syncNow();
 */

import UnifiedAuth from './UnifiedAuth.js';
import UnifiedAtome from './UnifiedAtome.js';
import UnifiedUserData from './UnifiedUserData.js';
import UnifiedSync from './UnifiedSync.js';
import SyncWebSocket from './SyncWebSocket.js';
import TauriAdapter from './adapters/TauriAdapter.js';
import FastifyAdapter from './adapters/FastifyAdapter.js';

/**
 * Check if user is authenticated on any backend
 * Convenience function for quick auth checks
 * @returns {boolean} True if authenticated on at least one backend
 */
function isAuthenticated() {
    return TauriAdapter.getToken() || FastifyAdapter.getToken();
}

// Export all APIs
export {
    UnifiedAuth,
    UnifiedAtome,
    UnifiedUserData,
    UnifiedSync,
    SyncWebSocket,
    TauriAdapter,
    FastifyAdapter,
    isAuthenticated
};

// Default export with all APIs
export default {
    Auth: UnifiedAuth,
    Atome: UnifiedAtome,
    UserData: UnifiedUserData,
    Sync: UnifiedSync,
    WebSocket: SyncWebSocket,
    adapters: {
        Tauri: TauriAdapter,
        Fastify: FastifyAdapter
    }
};
