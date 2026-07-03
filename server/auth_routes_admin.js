/**
 * registerAdminRoutes — extracted from auth.js registerAuthRoutes.
 */

import path from 'path';
import fsp from 'fs/promises';
import { fileURLToPath } from 'url';
import { appendEvent } from '../database/adole.js';
import { getABoxEventBus } from './aBoxServer.js';
import { initServerIdentity, signChallenge, getServerIdentity, isConfigured as serverIdentityConfigured } from './serverIdentity.js';
import { ensureUserHome } from './userHome.js';
import { normalizePhone, generateDeterministicUserId, hashPassword, verifyPassword, requireConfiguredAuthSecret } from './auth_crypto.js';
import { createUserAtome, findUserByPhone, ensureAnonymousUser, findUserById, listAllUsers, updateUserParticle, deleteUserAtome, syncUserToTauri, ANONYMOUS_PHONE, ANONYMOUS_USERNAME, ANONYMOUS_PASSWORD, ANONYMOUS_VISIBILITY, ANONYMOUS_OPTIONAL } from './auth_users.js';
import { getUserOptionalParticles, ensureUserAtomeType, repairMistypedUserAtomes, upsertUserStateCurrent, normalizeUserOptional, normalizeAccessValue } from './auth_user_particles.js';
import { generateOTP, storeOTP, verifyOTP, readClientRateKey, enforceAuthIdentityRateLimit, enforceAuthRateLimit, sendSMS } from './auth_otp.js';
import { readRefreshTokenFromRequest, readRefreshSessions, writeRefreshSessions, createRefreshSession, consumeRefreshSession, revokeRefreshToken, setAuthCookies, COOKIE_MAX_AGE, REFRESH_COOKIE_NAME } from './auth_sessions.js';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fs = fsp;

export function registerAdminRoutes(server, { dataSource, isProduction }) {
    server.post('/api/admin/apply-update', async (request, reply) => {
        const { path: filePath, content } = request.body || {};

        // Validate input
        if (!filePath || typeof filePath !== 'string') {
            return reply.code(400).send({
                success: false,
                error: 'Path is required'
            });
        }

        if (typeof content !== 'string') {
            return reply.code(400).send({
                success: false,
                error: 'Content is required'
            });
        }

        // Security: Define allowed and protected paths
        const allowedPrefixes = ['atome/src/squirrel', 'atome/src/application/core', 'atome/security'];
        const allowedFiles = ['atome/src/version.json']; // Fichiers spécifiques autorisés
        const protectedPrefixes = ['atome/src/application/examples', 'atome/src/application/config'];

        // Check if path is protected
        for (const protectedPath of protectedPrefixes) {
            if (filePath.startsWith(protectedPath)) {
                return reply.code(403).send({
                    success: false,
                    error: `Path ${protectedPath} is protected and cannot be updated`
                });
            }
        }

        // Check if path is allowed (prefix ou fichier spécifique)
        const isAllowed = allowedPrefixes.some(prefix => filePath.startsWith(prefix))
            || allowedFiles.includes(filePath);
        if (!isAllowed) {
            return reply.code(403).send({
                success: false,
                error: 'Path is not in allowed update directories'
            });
        }

        // Prevent path traversal attacks
        if (filePath.includes('..') || filePath.includes('//')) {
            return reply.code(403).send({
                success: false,
                error: 'Invalid path'
            });
        }

        try {
            const { promises: fsPromises } = await import('fs');
            const pathModule = await import('path');
            const { fileURLToPath } = await import('url');

            const __dirname = pathModule.dirname(fileURLToPath(import.meta.url));
            const projectRoot = pathModule.join(__dirname, '..');
            const targetPath = pathModule.join(projectRoot, filePath);

            // Create parent directories if needed
            const parentDir = pathModule.dirname(targetPath);
            await fsPromises.mkdir(parentDir, { recursive: true });

            // Write the file
            await fsPromises.writeFile(targetPath, content, 'utf8');

            console.log(`📝 [Admin] Updated file: ${filePath}`);

            return {
                success: true,
                path: filePath,
                message: 'File updated successfully'
            };
        } catch (error) {
            request.log.error({ err: error }, 'Failed to write update file');
            return reply.code(500).send({
                success: false,
                error: 'Failed to write file: ' + error.message
            });
        }
    });

    /**
     * POST /api/admin/batch-update
     * Batch download and update files from GitHub (admin only)
     */
    server.post('/api/admin/batch-update', async (request, reply) => {
        const { files, version } = request.body || {};

        if (!files || !Array.isArray(files)) {
            return reply.code(400).send({
                success: false,
                error: 'Files array is required'
            });
        }

        const allowedPrefixes = ['atome/src/squirrel', 'atome/src/application/core', 'atome/security'];
        const allowedFiles = ['atome/src/version.json'];
        const protectedPrefixes = ['atome/src/application/examples', 'atome/src/application/config'];

        const { promises: fsPromises } = await import('fs');
        const pathModule = await import('path');
        const { fileURLToPath } = await import('url');

        const __dirname = pathModule.dirname(fileURLToPath(import.meta.url));
        const projectRoot = pathModule.join(__dirname, '..');

        const updatedFiles = [];
        const errors = [];

        for (const file of files) {
            const { path: filePath, url } = file;

            if (!filePath || !url) {
                errors.push({ path: filePath || 'unknown', error: 'Missing path or url' });
                continue;
            }

            // Check protected paths
            const isProtected = protectedPrefixes.some(p => filePath.startsWith(p));
            if (isProtected) {
                errors.push({ path: filePath, error: 'Path is protected' });
                continue;
            }

            // Check allowed paths
            const isAllowed = allowedPrefixes.some(p => filePath.startsWith(p)) || allowedFiles.includes(filePath);
            if (!isAllowed) {
                errors.push({ path: filePath, error: 'Path not in allowed directories' });
                continue;
            }

            // Prevent path traversal
            if (filePath.includes('..') || filePath.includes('//')) {
                errors.push({ path: filePath, error: 'Invalid path' });
                continue;
            }

            try {
                // Download from GitHub
                const response = await fetch(url);
                if (!response.ok) {
                    errors.push({ path: filePath, error: `GitHub returned ${response.status}` });
                    continue;
                }

                const content = await response.text();
                const targetPath = pathModule.join(projectRoot, filePath);

                // Create parent directories
                const parentDir = pathModule.dirname(targetPath);
                await fsPromises.mkdir(parentDir, { recursive: true });

                // Write file
                await fsPromises.writeFile(targetPath, content, 'utf8');
                updatedFiles.push(filePath);

            } catch (error) {
                errors.push({ path: filePath, error: error.message });
            }
        }

        // Update version file if provided
        if (version && version.path && version.content) {
            try {
                const versionPath = pathModule.join(projectRoot, version.path);
                const parentDir = pathModule.dirname(versionPath);
                await fsPromises.mkdir(parentDir, { recursive: true });
                await fsPromises.writeFile(versionPath, version.content, 'utf8');
            } catch (error) {
                errors.push({ path: version.path, error: error.message });
            }
        }

        console.log(`📥 [Admin] Batch update: ${updatedFiles.length} files updated, ${errors.length} errors`);

        return {
            success: errors.length === 0,
            filesUpdated: updatedFiles.length,
            updated: updatedFiles,
            errors: errors.length > 0 ? errors : null
        };
    });

    /**
     * POST /api/admin/sync-from-zip
     * Downloads ZIP from GitHub, extracts src/, syncs files
     */
    server.post('/api/admin/sync-from-zip', async (request, reply) => {
        const { zipUrl, extractPath = 'src', protectedPaths = [] } = request.body;

        if (!zipUrl) {
            return reply.code(400).send({ success: false, error: 'Missing zipUrl' });
        }

        console.log('📦 Sync from ZIP:', zipUrl);
        console.log('📂 Extract path:', extractPath);
        console.log('🛡️ Protected paths:', protectedPaths);
        console.log('📂 Project root:', PROJECT_ROOT);

        try {
            // Download ZIP
            const response = await fetch(zipUrl);
            if (!response.ok) {
                throw new Error(`GitHub returned status ${response.status}`);
            }

            const zipBuffer = Buffer.from(await response.arrayBuffer());
            console.log('📥 Downloaded ZIP:', zipBuffer.length, 'bytes');

            // Use AdmZip to extract
            const AdmZip = (await import('adm-zip')).default;
            const zip = new AdmZip(zipBuffer);
            const entries = zip.getEntries();

            console.log('📦 ZIP contains', entries.length, 'entries');

            // Find root prefix (e.g., "a-main/")
            let rootPrefix = '';
            if (entries.length > 0) {
                const firstName = entries[0].entryName;
                const idx = firstName.indexOf('/');
                if (idx > 0) {
                    rootPrefix = firstName.substring(0, idx + 1);
                }
            }
            console.log('📁 ZIP root prefix:', rootPrefix);

            const updatedFiles = [];
            const errors = [];

            for (const entry of entries) {
                // Skip directories
                if (entry.isDirectory) continue;

                const name = entry.entryName;

                // Strip root prefix
                const relativePath = name.startsWith(rootPrefix)
                    ? name.substring(rootPrefix.length)
                    : name;

                // Only process files exactly in the configured extractPath folder.
                // For the default "src/" path, this excludes sibling roots such as "platforms/desktop-tauri/".
                const extractPrefix = extractPath.replace(/\/$/, '') + '/';
                if (!relativePath.startsWith(extractPrefix)) {
                    continue;
                }

                // Check if protected
                const isProtected = protectedPaths.some(p => relativePath.startsWith(p));
                if (isProtected) {
                    console.log('🛡️ Skipping protected:', relativePath);
                    continue;
                }

                // Write file to PROJECT_ROOT (not process.cwd which might be server/)
                const targetPath = path.join(PROJECT_ROOT, relativePath);
                const targetDir = path.dirname(targetPath);

                console.log('📝 Writing:', relativePath, '→', targetPath);

                try {
                    await fs.mkdir(targetDir, { recursive: true });
                    await fs.writeFile(targetPath, entry.getData());
                    updatedFiles.push(relativePath);
                } catch (e) {
                    console.log('❌ Error writing:', relativePath, e.message);
                    errors.push({ path: relativePath, error: e.message });
                }
            }

            console.log('✅ Updated', updatedFiles.length, 'files');
            if (errors.length > 0) {
                console.log('⚠️', errors.length, 'errors');
            }

            return {
                success: errors.length === 0,
                filesUpdated: updatedFiles.length,
                updated: updatedFiles,
                errors: errors.length > 0 ? errors : null
            };

        } catch (error) {
            console.error('❌ Sync from ZIP failed:', error.message);
            return reply.code(500).send({ success: false, error: error.message });
        }
    });

    // =========================================================================
    // REFRESH TOKEN - POST /api/auth/refresh
    // =========================================================================
}
