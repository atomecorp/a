/**
 * User Files Management
 * 
 * Tracks file ownership for user isolation in uploads/aBox.
 * Each file is associated with the user who uploaded it.
 */

import { promises as fs } from 'fs';
import path from 'path';

// In-memory store for file ownership (in production, use database)
const fileOwnershipStore = new Map();

// Metadata file path (persisted to disk)
let metadataFilePath = null;

/**
 * Initialize the metadata storage
 */
export async function initUserFiles(uploadsDir) {
    metadataFilePath = path.join(uploadsDir, '.file_metadata.json');

    try {
        const data = await fs.readFile(metadataFilePath, 'utf8');
        const parsed = JSON.parse(data);

        for (const [fileName, meta] of Object.entries(parsed)) {
            fileOwnershipStore.set(fileName, meta);
        }

        console.log(`📁 Loaded ${fileOwnershipStore.size} file metadata entries`);
    } catch (e) {
        // File doesn't exist yet, start fresh
        console.log('📁 No existing file metadata, starting fresh');
    }
}

/**
 * Save metadata to disk
 */
async function saveMetadata() {
    if (!metadataFilePath) return;

    const data = {};
    for (const [fileName, meta] of fileOwnershipStore) {
        data[fileName] = meta;
    }

    try {
        await fs.writeFile(metadataFilePath, JSON.stringify(data, null, 2));
    } catch (e) {
        console.error('❌ Failed to save file metadata:', e.message);
    }
}

/**
 * Register a file upload with ownership
 */
export async function registerFileUpload(fileName, userId, options = {}) {
    const meta = {
        owner_id: userId,
        uploaded_at: new Date().toISOString(),
        original_name: options.originalName || fileName,
        mime_type: options.mimeType || null,
        size: options.size || 0,
        shared_with: [],
        is_public: false
    };

    fileOwnershipStore.set(fileName, meta);
    await saveMetadata();

    console.log(`📤 File registered: ${fileName} → user ${userId}`);

    return meta;
}

/**
 * Get file metadata
 */
export function getFileMetadata(fileName) {
    return fileOwnershipStore.get(fileName) || null;
}

/**
 * Get all files owned by a user
 */
export function getUserFiles(userId) {
    const files = [];

    for (const [fileName, meta] of fileOwnershipStore) {
        if (meta.owner_id === userId) {
            files.push({ name: fileName, ...meta });
        }
    }

    return files;
}

/**
 * Get files accessible by user (owned + shared)
 */
export function getAccessibleFiles(userId) {
    const files = [];

    for (const [fileName, meta] of fileOwnershipStore) {
        // Owner always has access
        if (meta.owner_id === userId) {
            files.push({ name: fileName, access: 'owner', ...meta });
            continue;
        }

        // Public files
        if (meta.is_public) {
            files.push({ name: fileName, access: 'public', ...meta });
            continue;
        }

        // Shared with user
        const shareInfo = meta.shared_with?.find(s => s.user_id === userId);
        if (shareInfo) {
            files.push({ name: fileName, access: shareInfo.permission, ...meta });
        }
    }

    return files;
}

/**
 * Check if user can access file
 */
export function canAccessFile(fileName, userId, requiredAccess = 'read') {
    const meta = fileOwnershipStore.get(fileName);

    if (!meta) {
        // File has no metadata - allow access (legacy files)
        return true;
    }

    // Owner always has full access
    if (meta.owner_id === userId) {
        return true;
    }

    // Public files - read access only
    if (meta.is_public && requiredAccess === 'read') {
        return true;
    }

    // Check shares
    const shareInfo = meta.shared_with?.find(s => s.user_id === userId);
    if (shareInfo) {
        if (requiredAccess === 'read') {
            return shareInfo.permission === 'read' || shareInfo.permission === 'write';
        }
        return shareInfo.permission === 'write';
    }

    return false;
}

/**
 * Share file with another user
 */
export async function shareFile(fileName, ownerId, targetUserId, permission = 'read') {
    const meta = fileOwnershipStore.get(fileName);

    if (!meta) {
        return { success: false, error: 'File not found' };
    }

    if (meta.owner_id !== ownerId) {
        return { success: false, error: 'Only owner can share files' };
    }

    // Remove existing share if present
    meta.shared_with = meta.shared_with.filter(s => s.user_id !== targetUserId);

    // Add new share
    meta.shared_with.push({
        user_id: targetUserId,
        permission,
        shared_at: new Date().toISOString()
    });

    await saveMetadata();

    console.log(`📤 File shared: ${fileName} → user ${targetUserId} (${permission})`);

    return { success: true };
}

/**
 * Unshare file
 */
export async function unshareFile(fileName, ownerId, targetUserId) {
    const meta = fileOwnershipStore.get(fileName);

    if (!meta) {
        return { success: false, error: 'File not found' };
    }

    if (meta.owner_id !== ownerId) {
        return { success: false, error: 'Only owner can unshare files' };
    }

    meta.shared_with = meta.shared_with.filter(s => s.user_id !== targetUserId);
    await saveMetadata();

    console.log(`🚫 File unshared: ${fileName} ← user ${targetUserId}`);

    return { success: true };
}

/**
 * Set file public/private
 */
export async function setFilePublic(fileName, ownerId, isPublic) {
    const meta = fileOwnershipStore.get(fileName);

    if (!meta) {
        return { success: false, error: 'File not found' };
    }

    if (meta.owner_id !== ownerId) {
        return { success: false, error: 'Only owner can change visibility' };
    }

    meta.is_public = isPublic;
    await saveMetadata();

    console.log(`🌐 File ${isPublic ? 'public' : 'private'}: ${fileName}`);

    return { success: true };
}

/**
 * Delete file metadata
 */
export async function deleteFileMetadata(fileName, userId) {
    const meta = fileOwnershipStore.get(fileName);

    if (!meta) {
        return { success: true }; // Already gone
    }

    if (meta.owner_id !== userId) {
        return { success: false, error: 'Only owner can delete files' };
    }

    fileOwnershipStore.delete(fileName);
    await saveMetadata();

    return { success: true };
}

/**
 * Get file stats for admin
 */
export function getFileStats() {
    const stats = {
        totalFiles: fileOwnershipStore.size,
        publicFiles: 0,
        sharedFiles: 0,
        byUser: {}
    };

    for (const [fileName, meta] of fileOwnershipStore) {
        if (meta.is_public) stats.publicFiles++;
        if (meta.shared_with?.length > 0) stats.sharedFiles++;

        const userId = meta.owner_id || 'unknown';
        stats.byUser[userId] = (stats.byUser[userId] || 0) + 1;
    }

    return stats;
}

export default {
    initUserFiles,
    registerFileUpload,
    getFileMetadata,
    getUserFiles,
    getAccessibleFiles,
    canAccessFile,
    shareFile,
    unshareFile,
    setFilePublic,
    deleteFileMetadata,
    getFileStats
};
