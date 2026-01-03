/**
 * User Files Management - ADOLE v3.0
 * 
 * Tracks file ownership using the ADOLE atomes table.
 * Files are stored as atomes with atome_type matching their format (image, sound, text, etc.).
 * Sharing uses the permissions table.
 * All operations via WebSocket.
 */

import path from 'path';
import db from '../database/adole.js';
import { getABoxEventBus } from './aBoxServer.js';
import { checkPermission, PERMISSION } from './sharing.js';

const FILE_ATOME_TYPES = Object.freeze(['file', 'image', 'video', 'sound', 'text', 'shape', 'raw']);
const FILE_ATOME_TYPES_SQL = FILE_ATOME_TYPES.map(() => '?').join(', ');
const FILE_ATOME_TYPES_SET = new Set(FILE_ATOME_TYPES);

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.tiff', '.tif', '.ico']);
const SHAPE_EXTENSIONS = new Set(['.svg']);
const VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.webm', '.mkv', '.avi', '.mpeg', '.mpg', '.m4v']);
const SOUND_EXTENSIONS = new Set(['.mp3', '.wav', '.ogg', '.flac', '.aac', '.m4a', '.aiff', '.aif', '.opus']);
const TEXT_EXTENSIONS = new Set(['.txt', '.md', '.markdown', '.csv', '.tsv', '.log']);
const TEXT_MIME_TYPES = new Set(['text/plain', 'text/markdown', 'text/csv', 'text/tab-separated-values']);

function normalizeMimeType(mimeType) {
    return typeof mimeType === 'string' ? mimeType.trim().toLowerCase() : '';
}

function normalizeExtension(fileName) {
    return typeof fileName === 'string' ? path.extname(fileName).toLowerCase() : '';
}

function normalizeFileAtomeType(value) {
    const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
    return FILE_ATOME_TYPES_SET.has(normalized) ? normalized : null;
}

function inferFileAtomeType(fileName, mimeType) {
    const ext = normalizeExtension(fileName);
    const mime = normalizeMimeType(mimeType);

    if (SHAPE_EXTENSIONS.has(ext) || mime === 'image/svg+xml') return 'shape';
    if (IMAGE_EXTENSIONS.has(ext) || (mime.startsWith('image/') && mime !== 'image/svg+xml')) return 'image';
    if (VIDEO_EXTENSIONS.has(ext) || mime.startsWith('video/')) return 'video';
    if (SOUND_EXTENSIONS.has(ext) || mime.startsWith('audio/')) return 'sound';
    if (TEXT_EXTENSIONS.has(ext) || TEXT_MIME_TYPES.has(mime)) return 'text';
    return 'raw';
}

function resolveFileAtomeType(fileName, options = {}) {
    const explicit = normalizeFileAtomeType(options.atomeType || options.atome_type);
    if (explicit) return explicit;
    const sourceName = typeof options.originalName === 'string' && options.originalName.trim()
        ? options.originalName
        : fileName;
    const inferred = inferFileAtomeType(sourceName, options.mimeType || options.mime_type || options.mime);
    return normalizeFileAtomeType(inferred) || 'raw';
}

function fileTypeWhere(alias = 'a') {
    return `${alias}.atome_type IN (${FILE_ATOME_TYPES_SQL})`;
}

export async function registerFileUpload(fileName, userId, options = {}) {
    const now = new Date().toISOString();
    const atomeId = options.atomeId || options.atome_id || `file-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const atomeType = resolveFileAtomeType(fileName, options);

    try {
        // Create atome for the file
        await db.query('run', `
            INSERT OR REPLACE INTO atomes (atome_id, atome_type, owner_id, created_at, updated_at)
            VALUES (
                ?, ?, ?, 
                COALESCE((SELECT created_at FROM atomes WHERE atome_id = ?), ?),
                ?
            )
        `, [atomeId, atomeType, userId, atomeId, now, now]);

        // Store file metadata as particles
        const particles = {
            file_name: fileName,
            original_name: options.originalName || fileName,
            mime_type: options.mimeType || null,
            file_path: options.filePath || null,
            size: options.size || 0,
            is_public: false
        };

        for (const [key, value] of Object.entries(particles)) {
            if (value !== null) {
                await db.query('run', `
                    INSERT OR REPLACE INTO particles (atome_id, particle_key, particle_value, updated_at)
                    VALUES (?, ?, ?, ?)
                `, [atomeId, key, JSON.stringify(value), now]);
            }
        }

        console.log(`File registered: ${fileName} -> user ${userId}`);

        // Emit via WebSocket
        emitFileEvent('upload', { atome_id: atomeId, atome_type: atomeType, file_name: fileName, owner_id: userId });

        return {
            success: true,
            atome_id: atomeId,
            atome_type: atomeType,
            file_name: fileName,
            owner_id: userId,
            ...particles
        };

    } catch (error) {
        console.error('Failed to register file:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Get file metadata by atome_id or file_name
 */
export async function getFileMetadata(identifier, options = {}) {
    try {
        const { ownerId = null, userId = null } = options;
        // Try by atome_id first
        let atome = await db.query('get', `
            SELECT a.atome_id, a.atome_type, a.owner_id, a.created_at
            FROM atomes a
            WHERE a.atome_id = ? AND ${fileTypeWhere('a')} AND a.deleted_at IS NULL
        `, [identifier, ...FILE_ATOME_TYPES]);

        // If not found, try by file_name particle
        if (!atome) {
            if (ownerId) {
                atome = await db.query('get', `
                    SELECT a.atome_id, a.atome_type, a.owner_id, a.created_at
                    FROM atomes a
                    JOIN particles p ON a.atome_id = p.atome_id
                    WHERE p.particle_key = 'file_name' AND p.particle_value = ?
                    AND a.owner_id = ?
                    AND ${fileTypeWhere('a')} AND a.deleted_at IS NULL
                `, [JSON.stringify(identifier), ownerId, ...FILE_ATOME_TYPES]);

                if (!atome) {
                    atome = await db.query('get', `
                        SELECT a.atome_id, a.atome_type, a.owner_id, a.created_at
                        FROM atomes a
                        JOIN particles p ON a.atome_id = p.atome_id
                        WHERE p.particle_key = 'original_name' AND p.particle_value = ?
                        AND a.owner_id = ?
                        AND ${fileTypeWhere('a')} AND a.deleted_at IS NULL
                    `, [JSON.stringify(identifier), ownerId, ...FILE_ATOME_TYPES]);
                }
            } else if (userId) {
                const accessible = await getAccessibleFiles(userId);
                const matches = (accessible || []).filter((file) => {
                    return file.file_name === identifier || file.original_name === identifier;
                });
                if (matches.length === 1) {
                    return matches[0];
                }
            } else {
                atome = await db.query('get', `
                    SELECT a.atome_id, a.atome_type, a.owner_id, a.created_at
                    FROM atomes a
                    JOIN particles p ON a.atome_id = p.atome_id
                    WHERE p.particle_key = 'file_name' AND p.particle_value = ?
                    AND ${fileTypeWhere('a')} AND a.deleted_at IS NULL
                `, [JSON.stringify(identifier), ...FILE_ATOME_TYPES]);
            }
        }

        if (!atome) return null;

        // Get all particles for this file
        const particles = await db.query('all', `
            SELECT particle_key, particle_value FROM particles WHERE atome_id = ?
        `, [atome.atome_id]);

        const meta = {
            atome_id: atome.atome_id,
            atome_type: atome.atome_type,
            owner_id: atome.owner_id,
            created_at: atome.created_at
        };

        for (const p of (particles || [])) {
            try {
                meta[p.particle_key] = JSON.parse(p.particle_value);
            } catch {
                meta[p.particle_key] = p.particle_value;
            }
        }

        return meta;

    } catch (error) {
        console.error('Failed to get file metadata:', error.message);
        return null;
    }
}

/**
 * Get all files owned by a user
 */
export async function getUserFiles(userId) {
    const files = await db.query('all', `
        SELECT a.atome_id, a.atome_type, a.owner_id, a.created_at, a.updated_at
        FROM atomes a
        WHERE a.owner_id = ? AND ${fileTypeWhere('a')} AND a.deleted_at IS NULL
        ORDER BY a.created_at DESC
    `, [userId, ...FILE_ATOME_TYPES]);

    const result = [];
    for (const file of (files || [])) {
        const particles = await db.query('all', `
            SELECT particle_key, particle_value FROM particles WHERE atome_id = ?
        `, [file.atome_id]);

        const meta = { ...file };
        for (const p of (particles || [])) {
            try {
                meta[p.particle_key] = JSON.parse(p.particle_value);
            } catch {
                meta[p.particle_key] = p.particle_value;
            }
        }
        result.push(meta);
    }

    return result;
}

/**
 * Get files accessible by user (owned + shared via permissions table)
 */
export async function getAccessibleFiles(userId) {
    const files = await db.query('all', `
        SELECT DISTINCT a.atome_id, a.atome_type, a.owner_id, a.created_at, a.updated_at,
            CASE WHEN a.owner_id = ? THEN 'owner' 
                 WHEN p.can_write = 1 THEN 'write'
                 ELSE 'read' END as access
        FROM atomes a
        LEFT JOIN permissions p ON a.atome_id = p.atome_id AND p.principal_id = ?
        WHERE ${fileTypeWhere('a')} AND a.deleted_at IS NULL
        AND (a.owner_id = ? OR (p.can_read = 1 AND (p.expires_at IS NULL OR p.expires_at > datetime('now'))))
        ORDER BY a.created_at DESC
    `, [userId, userId, ...FILE_ATOME_TYPES, userId]);

    const result = [];
    for (const file of (files || [])) {
        const particles = await db.query('all', `
            SELECT particle_key, particle_value FROM particles WHERE atome_id = ?
        `, [file.atome_id]);

        const meta = { ...file };
        for (const p of (particles || [])) {
            try {
                meta[p.particle_key] = JSON.parse(p.particle_value);
            } catch {
                meta[p.particle_key] = p.particle_value;
            }
        }
        result.push(meta);
    }

    return result;
}

/**
 * Check if user can access file
 */
export async function canAccessFile(fileIdentifier, userId, requiredAccess = 'read') {
    const meta = await getFileMetadata(fileIdentifier);

    if (!meta) {
        // File not in DB - allow access (legacy files)
        return true;
    }

    // Owner always has full access
    if (meta.owner_id === userId) {
        return true;
    }

    // Check public flag
    if (meta.is_public && requiredAccess === 'read') {
        return true;
    }

    // Check permissions table
    const permLevel = requiredAccess === 'write' ? PERMISSION.WRITE : PERMISSION.READ;
    return await checkPermission(userId, meta.atome_id, permLevel);
}

/**
 * Set file public/private
 */
export async function setFilePublic(atomeId, ownerId, isPublic) {
    const meta = await getFileMetadata(atomeId);

    if (!meta) {
        return { success: false, error: 'File not found' };
    }

    if (meta.owner_id !== ownerId) {
        return { success: false, error: 'Only owner can change visibility' };
    }

    const now = new Date().toISOString();

    // Update or insert is_public particle
    const existing = await db.query('get', `
        SELECT 1 FROM particles WHERE atome_id = ? AND particle_key = 'is_public'
    `, [atomeId]);

    if (existing) {
        await db.query('run', `
            UPDATE particles SET particle_value = ?, updated_at = ?
            WHERE atome_id = ? AND particle_key = 'is_public'
        `, [JSON.stringify(isPublic), now, atomeId]);
    } else {
        await db.query('run', `
            INSERT INTO particles (atome_id, particle_key, particle_value, updated_at)
            VALUES (?, 'is_public', ?, ?)
        `, [atomeId, JSON.stringify(isPublic), now]);
    }

    console.log(`File ${isPublic ? 'public' : 'private'}: ${atomeId}`);
    emitFileEvent('visibility', { atome_id: atomeId, is_public: isPublic });

    return { success: true };
}

function normalizeFileSharePermissions(permissions) {
    if (typeof permissions === 'number') {
        return permissions;
    }

    if (typeof permissions === 'string') {
        const value = permissions.toLowerCase();
        if (value === 'write') {
            return { can_read: true, can_write: true, can_delete: false, can_share: false, can_create: false };
        }
        if (value === 'delete') {
            return { can_read: true, can_write: true, can_delete: true, can_share: false, can_create: false };
        }
        if (value === 'admin') {
            return { can_read: true, can_write: true, can_delete: true, can_share: true, can_create: true };
        }
        return { can_read: true, can_write: false, can_delete: false, can_share: false, can_create: false };
    }

    if (permissions && typeof permissions === 'object') {
        const read = permissions.can_read ?? permissions.canRead ?? permissions.read ?? false;
        const write = permissions.can_write ?? permissions.canWrite ?? permissions.write ?? false;
        const del = permissions.can_delete ?? permissions.canDelete ?? permissions.delete ?? false;
        const share = permissions.can_share ?? permissions.canShare ?? permissions.share ?? false;
        const create = permissions.can_create ?? permissions.canCreate ?? permissions.create ?? false;
        return { can_read: !!read, can_write: !!write, can_delete: !!del, can_share: !!share, can_create: !!create };
    }

    return { can_read: true, can_write: false, can_delete: false, can_share: false, can_create: false };
}

/**
 * Delete file (soft delete)
 */
export async function deleteFile(atomeId, userId) {
    const meta = await getFileMetadata(atomeId);

    if (!meta) {
        return { success: true }; // Already gone
    }

    if (meta.owner_id !== userId) {
        return { success: false, error: 'Only owner can delete files' };
    }

    const now = new Date().toISOString();
    await db.query('run', `
        UPDATE atomes SET deleted_at = ? WHERE atome_id = ?
    `, [now, atomeId]);

    console.log(`File deleted: ${atomeId}`);
    emitFileEvent('delete', { atome_id: atomeId });

    return { success: true };
}

/**
 * Get file stats
 */
export async function getFileStats() {
    const stats = await db.query('get', `
        SELECT 
            COUNT(*) as total_files,
            COUNT(DISTINCT owner_id) as unique_owners
        FROM atomes a
        WHERE ${fileTypeWhere('a')} AND a.deleted_at IS NULL
    `, [...FILE_ATOME_TYPES]);

    const publicCount = await db.query('get', `
        SELECT COUNT(*) as count
        FROM particles p
        JOIN atomes a ON p.atome_id = a.atome_id
        WHERE p.particle_key = 'is_public' AND p.particle_value = 'true'
        AND ${fileTypeWhere('a')} AND a.deleted_at IS NULL
    `, [...FILE_ATOME_TYPES]);

    const sharedCount = await db.query('get', `
        SELECT COUNT(DISTINCT atome_id) as count
        FROM permissions p
        JOIN atomes a ON p.atome_id = a.atome_id
        WHERE ${fileTypeWhere('a')} AND a.deleted_at IS NULL
    `, [...FILE_ATOME_TYPES]);

    return {
        totalFiles: stats?.total_files || 0,
        uniqueOwners: stats?.unique_owners || 0,
        publicFiles: publicCount?.count || 0,
        sharedFiles: sharedCount?.count || 0
    };
}

/**
 * Emit file event via WebSocket
 */
function emitFileEvent(action, data) {
    try {
        const eventBus = getABoxEventBus();
        if (eventBus) {
            eventBus.emit('event', {
                type: 'file-event',
                action,
                ...data,
                timestamp: new Date().toISOString()
            });
        }
    } catch (e) {
        console.warn('Failed to emit file event:', e.message);
    }
}

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

/**
 * Share a file with another user (backward compatibility wrapper)
 */
export async function shareFile(fileIdentifier, granterId, targetUserId, permissions) {
    const { createShare } = await import('./sharing.js');
    const meta = await getFileMetadata(fileIdentifier, { ownerId: granterId });
    if (!meta) {
        return { success: false, error: 'File not found' };
    }
    const payload = normalizeFileSharePermissions(permissions);
    const result = await createShare(granterId, meta.atome_id, targetUserId, payload);
    if (result?.success) {
        return { ...result, file: meta };
    }
    return result;
}

/**
 * Revoke file sharing (backward compatibility wrapper)
 */
export async function unshareFile(fileIdentifier, granterId, targetUserId) {
    const { revokeShare } = await import('./sharing.js');
    const meta = await getFileMetadata(fileIdentifier, { ownerId: granterId });
    if (!meta) {
        return { success: false, error: 'File not found' };
    }

    const permission = await db.query('get', `
        SELECT permission_id
        FROM permissions
        WHERE atome_id = ? AND principal_id = ?
        ORDER BY permission_id DESC
        LIMIT 1
    `, [meta.atome_id, targetUserId]);

    if (!permission?.permission_id) {
        return { success: false, error: 'Permission not found' };
    }

    const result = await revokeShare(granterId, permission.permission_id);
    if (result?.success) {
        return { ...result, file: meta };
    }
    return result;
}

export default {
    initUserFiles,
    registerFileUpload,
    getFileMetadata,
    getUserFiles,
    getAccessibleFiles,
    canAccessFile,
    setFilePublic,
    deleteFile,
    getFileStats,
    shareFile,
    unshareFile,
    handleFileMessage,
    registerFileWebSocket
};
