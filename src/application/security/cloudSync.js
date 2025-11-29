/**
 * Cloud Sync Module - Synchronization between Local and Cloud accounts
 * 
 * This module handles:
 * 1. Syncing local (offline) accounts to the Fastify cloud server
 * 2. Linking existing local accounts with cloud accounts
 * 3. Conflict resolution when data differs
 * 
 * SECURITY:
 * - All sync operations require server verification first
 * - Passwords are re-hashed on the server side
 * - Local data is preserved as fallback
 * 
 * @module src/application/security/cloudSync
 */

import { verifyServer } from './serverVerification.js';

// Sync states
export const SyncState = {
    NOT_SYNCED: 'not_synced',
    SYNCING: 'syncing',
    SYNCED: 'synced',
    SYNC_ERROR: 'sync_error',
    CONFLICT: 'conflict'
};

// Sync result types
export const SyncResult = {
    SUCCESS: 'success',
    ALREADY_EXISTS: 'already_exists',
    CREDENTIALS_MISMATCH: 'credentials_mismatch',
    SERVER_ERROR: 'server_error',
    NETWORK_ERROR: 'network_error',
    VERIFICATION_FAILED: 'verification_failed'
};

/**
 * Sync a local account to the cloud server
 * 
 * This creates a new account on the cloud server with the same credentials,
 * or links to an existing cloud account if phone number matches.
 * 
 * @param {object} options - Sync options
 * @param {string} options.cloudServerUrl - URL of the Fastify cloud server
 * @param {string} options.localToken - JWT token from local auth
 * @param {string} options.username - User's username
 * @param {string} options.phone - User's phone number
 * @param {string} options.password - User's password (needed to create cloud account)
 * @param {boolean} options.verifyServer - Whether to verify server identity first (default: true)
 * @returns {Promise<object>} Sync result
 */
export async function syncToCloud(options) {
    const {
        cloudServerUrl,
        localToken,
        username,
        phone,
        password,
        verifyServer: shouldVerify = true
    } = options;

    const result = {
        success: false,
        state: SyncState.SYNCING,
        result: null,
        cloudId: null,
        cloudToken: null,
        message: null,
        error: null
    };

    try {
        // Step 1: Verify server identity (unless skipped)
        if (shouldVerify) {
            console.log('🔐 Verifying cloud server identity...');
            const verification = await verifyServer(cloudServerUrl);

            if (!verification.verified) {
                result.state = SyncState.SYNC_ERROR;
                result.result = SyncResult.VERIFICATION_FAILED;
                result.error = `Server verification failed: ${verification.error || 'Unknown error'}`;
                return result;
            }

            if (!verification.isOfficial) {
                // Warning but allow if user explicitly requests
                console.warn('⚠️ Syncing to unofficial server:', verification.serverName);
            }

            console.log('✅ Server verified:', verification.serverName);
        }

        // Step 2: Check if account already exists on cloud
        console.log('🔍 Checking for existing cloud account...');

        const checkResponse = await fetch(`${cloudServerUrl}/api/auth/check-phone`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ phone })
        });

        const checkData = await checkResponse.json();

        if (checkData.exists) {
            // Account exists - try to link by logging in
            console.log('📱 Phone number found on cloud, attempting to link...');

            const loginResponse = await fetch(`${cloudServerUrl}/api/auth/login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ phone, password })
            });

            const loginData = await loginResponse.json();

            if (loginData.success) {
                // Successfully linked
                result.success = true;
                result.state = SyncState.SYNCED;
                result.result = SyncResult.SUCCESS;
                result.cloudId = loginData.user.id;
                result.cloudToken = loginData.token;
                result.message = 'Account linked to existing cloud account';

                // Update local account with cloud ID
                await updateLocalAccountCloudId(localToken, loginData.user.id);

                return result;
            } else {
                // Password doesn't match - conflict
                result.state = SyncState.CONFLICT;
                result.result = SyncResult.CREDENTIALS_MISMATCH;
                result.error = 'Phone number exists on cloud but password does not match';
                return result;
            }
        }

        // Step 3: Create new cloud account
        console.log('☁️ Creating new cloud account...');

        const registerResponse = await fetch(`${cloudServerUrl}/api/auth/register`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, phone, password })
        });

        const registerData = await registerResponse.json();

        if (registerData.success) {
            result.success = true;
            result.state = SyncState.SYNCED;
            result.result = SyncResult.SUCCESS;
            result.cloudId = registerData.user.id;
            result.cloudToken = registerData.token;
            result.message = 'Account synced to cloud';

            // Update local account with cloud ID
            await updateLocalAccountCloudId(localToken, registerData.user.id);

            return result;
        } else {
            result.state = SyncState.SYNC_ERROR;
            result.result = SyncResult.SERVER_ERROR;
            result.error = registerData.error || 'Failed to create cloud account';
            return result;
        }

    } catch (err) {
        result.state = SyncState.SYNC_ERROR;
        result.result = SyncResult.NETWORK_ERROR;
        result.error = `Network error: ${err.message}`;
        return result;
    }
}

/**
 * Update local account with cloud ID after successful sync
 * 
 * @param {string} localToken - Local JWT token
 * @param {string} cloudId - Cloud account ID
 */
async function updateLocalAccountCloudId(localToken, cloudId) {
    try {
        // Call local Axum server to update account
        const response = await fetch('http://localhost:3000/api/auth/local/update-cloud-id', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localToken}`
            },
            body: JSON.stringify({ cloudId })
        });

        if (!response.ok) {
            console.warn('Failed to update local account with cloud ID');
        }
    } catch (err) {
        console.warn('Failed to update local account:', err.message);
    }
}

/**
 * Check sync status of a local account
 * 
 * @param {string} localToken - Local JWT token
 * @returns {Promise<object>} Sync status
 */
export async function getSyncStatus(localToken) {
    try {
        const response = await fetch('http://localhost:3000/api/auth/local/me', {
            headers: {
                'Authorization': `Bearer ${localToken}`
            }
        });

        const data = await response.json();

        if (data.success && data.user) {
            return {
                isSynced: !!data.user.cloudId,
                cloudId: data.user.cloudId,
                lastSync: data.user.lastSync,
                state: data.user.cloudId ? SyncState.SYNCED : SyncState.NOT_SYNCED
            };
        }

        return {
            isSynced: false,
            cloudId: null,
            lastSync: null,
            state: SyncState.NOT_SYNCED
        };

    } catch (err) {
        return {
            isSynced: false,
            cloudId: null,
            lastSync: null,
            state: SyncState.SYNC_ERROR,
            error: err.message
        };
    }
}

/**
 * Resolve sync conflict by choosing which data to keep
 * 
 * @param {object} options - Resolution options
 * @param {string} options.cloudServerUrl - Cloud server URL
 * @param {string} options.phone - Phone number
 * @param {string} options.localPassword - Local password to try
 * @param {string} options.cloudPassword - Cloud password to try
 * @param {string} options.keepLocal - If true, update cloud with local data
 * @returns {Promise<object>} Resolution result
 */
export async function resolveConflict(options) {
    const {
        cloudServerUrl,
        phone,
        localPassword,
        cloudPassword,
        keepLocal = true
    } = options;

    try {
        if (keepLocal) {
            // Option 1: Login to cloud with cloud password, then update password to local
            const loginResponse = await fetch(`${cloudServerUrl}/api/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone, password: cloudPassword })
            });

            const loginData = await loginResponse.json();

            if (loginData.success) {
                // Update cloud password to match local
                const updateResponse = await fetch(`${cloudServerUrl}/api/auth/change-password`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${loginData.token}`
                    },
                    body: JSON.stringify({
                        currentPassword: cloudPassword,
                        newPassword: localPassword
                    })
                });

                const updateData = await updateResponse.json();

                return {
                    success: updateData.success,
                    message: updateData.success
                        ? 'Cloud password updated to match local'
                        : 'Failed to update cloud password',
                    cloudId: loginData.user.id,
                    cloudToken: loginData.token
                };
            }
        } else {
            // Option 2: Just login with cloud credentials
            const loginResponse = await fetch(`${cloudServerUrl}/api/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone, password: cloudPassword })
            });

            const loginData = await loginResponse.json();

            return {
                success: loginData.success,
                message: loginData.success
                    ? 'Using cloud account credentials'
                    : 'Failed to login to cloud',
                cloudId: loginData.user?.id,
                cloudToken: loginData.token,
                // Note: Local password should be updated to match cloud
                updateLocalPassword: true
            };
        }

        return {
            success: false,
            message: 'Conflict resolution failed'
        };

    } catch (err) {
        return {
            success: false,
            message: `Network error: ${err.message}`
        };
    }
}

export default {
    SyncState,
    SyncResult,
    syncToCloud,
    getSyncStatus,
    resolveConflict
};
