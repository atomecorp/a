/**
 * User files message/WebSocket API — ADOLE v3.0
 *
 * Transport layer for file operations: dispatches inbound WS `file` messages to
 * the file operations in userFiles.js and wires the handler on the aBox event
 * bus. Split out so userFiles.js holds pure operations. One-way dependency on
 * userFiles.js (no back-import), so no cycle.
 */

import { getABoxEventBus } from './aBoxServer.js';
import {
    getUserFiles,
    getAccessibleFiles,
    getFileMetadata,
    canAccessFile,
    setFilePublic,
    deleteFile,
    getFileStats
} from './userFiles.js';

/**
 * Handle file WebSocket messages
 */
export async function handleFileMessage(message, userId) {
    const { action, requestId } = message;

    if (!userId) {
        return { requestId, success: false, error: 'Unauthorized' };
    }

    try {
        switch (action) {
            case 'list': {
                const files = await getUserFiles(userId);
                return { requestId, success: true, data: files };
            }

            case 'accessible': {
                const files = await getAccessibleFiles(userId);
                return { requestId, success: true, data: files };
            }

            case 'get': {
                const { atome_id, file_name } = message;
                const meta = await getFileMetadata(atome_id || file_name, { userId });
                if (!meta) {
                    return { requestId, success: false, error: 'File not found' };
                }
                const canAccess = await canAccessFile(meta.atome_id, userId);
                if (!canAccess) {
                    return { requestId, success: false, error: 'Access denied' };
                }
                return { requestId, success: true, data: meta };
            }

            case 'set-public': {
                const { atome_id, is_public } = message;
                const result = await setFilePublic(atome_id, userId, is_public);
                return { requestId, ...result };
            }

            case 'delete': {
                const { atome_id } = message;
                const result = await deleteFile(atome_id, userId);
                return { requestId, ...result };
            }

            case 'stats': {
                const stats = await getFileStats();
                return { requestId, success: true, data: stats };
            }

            default:
                return { requestId, success: false, error: `Unknown action: ${action}` };
        }
    } catch (error) {
        console.error('File message error:', error.message);
        return { requestId, success: false, error: error.message };
    }
}

/**
 * Register file WebSocket handler
 */
export function registerFileWebSocket() {
    const eventBus = getABoxEventBus();
    if (!eventBus) {
        console.warn('EventBus not available, file WebSocket handler not registered');
        return;
    }

    eventBus.on('file', async (message, socket) => {
        const userId = socket?.userId || message.userId;
        const response = await handleFileMessage(message, userId);

        if (socket && typeof socket.send === 'function') {
            socket.send(JSON.stringify({ type: 'file-response', ...response }));
        }
    });

    console.log('File WebSocket handler registered (ADOLE v3.0)');
}

/**
 * Initialize user files system (backward compatibility)
 * In ADOLE v3.0, initialization is handled by the database module
 */
export async function initUserFiles(uploadsDir) {
    console.log('User files system initialized (ADOLE v3.0) - uploads:', uploadsDir);
    // Register WebSocket handler
    registerFileWebSocket();
    return true;
}
