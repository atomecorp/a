/**
 * Server Verification Module - Client-side Cryptographic Verification
 * 
 * This module verifies that a remote server is an official Squirrel server
 * using RSA challenge-response authentication.
 * 
 * VERIFICATION FLOW:
 * 1. Client generates random challenge (32+ bytes)
 * 2. Client sends challenge to server /api/server/verify
 * 3. Server signs challenge with private key and returns signature
 * 4. Client verifies signature using server's public key
 * 5. Client checks if server's fingerprint is in trusted list
 * 6. If all checks pass, server is marked as "verified" and optionally "official"
 * 
 * SECURITY FEATURES:
 * - Challenge-response prevents replay attacks
 * - Timestamp verification prevents old responses
 * - Fingerprint matching identifies official servers
 * - Public key pinning prevents MITM attacks
 * 
 * @module src/application/security/serverVerification
 */

import {
    TRUSTED_SERVERS,
    VERIFICATION_SETTINGS,
    getTrustedServer,
    findServerByFingerprint,
    findServerByUrl,
    isDevelopmentMode
} from './trusted_keys.js';

// =============================================================================
// VERIFICATION STATE
// =============================================================================

// Cache for verification results
const verificationCache = new Map();

// Current verification status
let currentServerStatus = {
    url: null,
    verified: false,
    official: false,
    serverId: null,
    serverName: null,
    lastVerified: null,
    error: null
};

// =============================================================================
// CRYPTOGRAPHIC UTILITIES
// =============================================================================

/**
 * Generate a cryptographically secure random challenge
 * 
 * @param {number} length - Length in bytes (default: 32)
 * @returns {string} Hex-encoded challenge string
 */
function generateChallenge(length = 32) {
    const array = new Uint8Array(length);
    crypto.getRandomValues(array);
    return Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Convert PEM-encoded public key to ArrayBuffer
 * 
 * @param {string} pem - PEM-encoded public key
 * @returns {ArrayBuffer} Key as ArrayBuffer
 */
function pemToArrayBuffer(pem) {
    const base64 = pem
        .replace(/-----BEGIN PUBLIC KEY-----/, '')
        .replace(/-----END PUBLIC KEY-----/, '')
        .replace(/[\r\n\s]/g, '');

    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
}

/**
 * Convert Base64 string to ArrayBuffer
 * 
 * @param {string} base64 - Base64 encoded string
 * @returns {ArrayBuffer} Decoded ArrayBuffer
 */
function base64ToArrayBuffer(base64) {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
}

/**
 * Compute SHA-256 fingerprint of a public key
 * 
 * @param {string} publicKeyPem - PEM-encoded public key
 * @returns {Promise<string>} Fingerprint in format "sha256:hexstring"
 */
async function computeFingerprint(publicKeyPem) {
    const keyBuffer = pemToArrayBuffer(publicKeyPem);
    const hashBuffer = await crypto.subtle.digest('SHA-256', keyBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return `sha256:${hashHex}`;
}

/**
 * Verify RSA-PSS signature using Web Crypto API
 * 
 * @param {string} publicKeyPem - PEM-encoded public key
 * @param {string} data - Original data that was signed
 * @param {string} signatureBase64 - Base64-encoded signature
 * @returns {Promise<boolean>} True if signature is valid
 */
async function verifySignature(publicKeyPem, data, signatureBase64) {
    try {
        // Import the public key
        const keyBuffer = pemToArrayBuffer(publicKeyPem);
        const cryptoKey = await crypto.subtle.importKey(
            'spki',
            keyBuffer,
            {
                name: 'RSA-PSS',
                hash: 'SHA-256'
            },
            false,
            ['verify']
        );

        // Convert signature from base64
        const signatureBuffer = base64ToArrayBuffer(signatureBase64);

        // Encode data as UTF-8
        const dataBuffer = new TextEncoder().encode(data);

        // Verify signature
        const isValid = await crypto.subtle.verify(
            {
                name: 'RSA-PSS',
                saltLength: 32
            },
            cryptoKey,
            signatureBuffer,
            dataBuffer
        );

        return isValid;

    } catch (err) {
        console.error('[serverVerification] Signature verification error:', err);
        return false;
    }
}

// =============================================================================
// SERVER VERIFICATION
// =============================================================================

/**
 * Verify that a server is authentic
 * 
 * @param {string} serverUrl - Base URL of the server to verify
 * @param {object} options - Verification options
 * @param {boolean} options.forceRefresh - Bypass cache
 * @param {number} options.timeout - Request timeout in ms
 * @returns {Promise<object>} Verification result
 */
export async function verifyServer(serverUrl, options = {}) {
    const { forceRefresh = false, timeout = 10000 } = options;

    // Normalize URL
    const normalizedUrl = serverUrl.replace(/\/$/, '');

    // Check cache first (unless force refresh)
    if (!forceRefresh) {
        const cached = verificationCache.get(normalizedUrl);
        if (cached && Date.now() - cached.timestamp < VERIFICATION_SETTINGS.cacheDurationMs) {
            console.log('[serverVerification] Using cached result for', normalizedUrl);
            return cached.result;
        }
    }

    // Initialize result
    const result = {
        success: false,
        verified: false,
        official: false,
        serverId: null,
        serverName: null,
        fingerprint: null,
        error: null,
        warnings: [],
        timestamp: Date.now()
    };

    try {
        // Check if this is a known trusted URL
        const trustedByUrl = findServerByUrl(normalizedUrl);

        // Development mode shortcut for localhost
        if (isDevelopmentMode() && VERIFICATION_SETTINGS.trustLocalhostInDev) {
            const isLocalhost = normalizedUrl.includes('localhost') || normalizedUrl.includes('127.0.0.1');
            if (isLocalhost && trustedByUrl?.trustWithoutVerification) {
                console.log('[serverVerification] Development mode: trusting localhost');
                result.success = true;
                result.verified = true;
                result.official = false;
                result.serverName = trustedByUrl.name || 'Local Development Server';
                result.warnings.push('Development mode: localhost trusted without cryptographic verification');
                return cacheResult(normalizedUrl, result);
            }
        }

        // Step 1: Get server identity
        console.log('[serverVerification] Fetching server identity from', normalizedUrl);

        const identityController = new AbortController();
        const identityTimeout = setTimeout(() => identityController.abort(), timeout);

        let identityResponse;
        try {
            identityResponse = await fetch(`${normalizedUrl}/api/server/identity`, {
                method: 'GET',
                signal: identityController.signal
            });
        } finally {
            clearTimeout(identityTimeout);
        }

        if (!identityResponse.ok) {
            result.error = 'Server does not support identity verification';
            result.warnings.push('Server may be an older version or unofficial');

            // Allow connection with warning if settings permit
            if (VERIFICATION_SETTINGS.allowUnofficialServers) {
                result.success = true;
                result.warnings.push('Connecting to unverified server (allowed by settings)');
            }

            return cacheResult(normalizedUrl, result);
        }

        const identity = await identityResponse.json();
        result.serverId = identity.serverId;
        result.serverName = identity.serverName;

        // Check if server has signing capability
        if (!identity.hasSigningCapability) {
            result.error = 'Server does not have signing capability';
            result.warnings.push('Server cannot prove its identity cryptographically');

            if (VERIFICATION_SETTINGS.allowUnofficialServers) {
                result.success = true;
            }

            return cacheResult(normalizedUrl, result);
        }

        // Step 2: Check if server ID is in trusted list
        const trustedServer = getTrustedServer(identity.serverId);

        if (!trustedServer) {
            result.warnings.push(`Server ID "${identity.serverId}" is not in trusted list`);
        }

        // Step 3: Challenge-response verification
        console.log('[serverVerification] Sending challenge to server');

        const challenge = generateChallenge(VERIFICATION_SETTINGS.minChallengeLength);

        const verifyController = new AbortController();
        const verifyTimeout = setTimeout(() => verifyController.abort(), timeout);

        let verifyResponse;
        try {
            verifyResponse = await fetch(`${normalizedUrl}/api/server/verify`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ challenge }),
                signal: verifyController.signal
            });
        } finally {
            clearTimeout(verifyTimeout);
        }

        if (!verifyResponse.ok) {
            result.error = 'Server verification endpoint failed';
            return cacheResult(normalizedUrl, result);
        }

        const verifyData = await verifyResponse.json();

        if (!verifyData.success || !verifyData.verified) {
            result.error = verifyData.error || 'Server verification failed';
            return cacheResult(normalizedUrl, result);
        }

        // Step 4: Verify the timestamp is fresh
        const responseAge = Date.now() - verifyData.timestamp;
        if (responseAge > VERIFICATION_SETTINGS.maxResponseAgeMs) {
            result.error = 'Server response too old (possible replay attack)';
            return cacheResult(normalizedUrl, result);
        }

        // Step 5: Verify the signature
        const dataToSign = `${verifyData.serverId}:${challenge}:${verifyData.timestamp}:${verifyData.nonce}`;

        // Use trusted public key if available, otherwise use server-provided key
        const keyToUse = trustedServer?.publicKey || verifyData.publicKey;

        if (!keyToUse) {
            result.error = 'No public key available for verification';
            return cacheResult(normalizedUrl, result);
        }

        console.log('[serverVerification] Verifying signature');

        const signatureValid = await verifySignature(
            keyToUse,
            dataToSign,
            verifyData.signature
        );

        if (!signatureValid) {
            result.error = 'Invalid server signature';
            return cacheResult(normalizedUrl, result);
        }

        // Step 6: Verify fingerprint matches trusted server
        result.fingerprint = verifyData.fingerprint;

        if (trustedServer?.fingerprint) {
            // Compute fingerprint from the key we used
            const computedFingerprint = await computeFingerprint(keyToUse);

            if (computedFingerprint !== trustedServer.fingerprint) {
                result.error = 'Server fingerprint does not match trusted record';
                result.warnings.push('Possible key substitution attack');
                return cacheResult(normalizedUrl, result);
            }

            // Server is verified AND official
            result.official = true;
        } else {
            // Server signature is valid but not in trusted list
            result.warnings.push('Server verified but not in official trusted list');

            // Check if fingerprint matches any known server
            const knownServer = findServerByFingerprint(verifyData.fingerprint);
            if (knownServer) {
                result.official = true;
                result.warnings.push(`Matched to official server: ${knownServer.name}`);
            }
        }

        // All checks passed
        result.success = true;
        result.verified = true;

        console.log('[serverVerification] Server verified:', result);

        return cacheResult(normalizedUrl, result);

    } catch (err) {
        if (err.name === 'AbortError') {
            result.error = 'Verification request timed out';
        } else {
            result.error = `Verification failed: ${err.message}`;
        }

        console.error('[serverVerification] Error:', err);

        // Allow connection with warning if settings permit
        if (VERIFICATION_SETTINGS.allowUnofficialServers) {
            result.success = true;
            result.warnings.push('Connection allowed despite verification failure');
        }

        return cacheResult(normalizedUrl, result);
    }
}

/**
 * Cache verification result
 */
function cacheResult(url, result) {
    verificationCache.set(url, {
        result,
        timestamp: Date.now()
    });

    // Update current status
    currentServerStatus = {
        url,
        ...result,
        lastVerified: Date.now()
    };

    return result;
}

// =============================================================================
// STATUS & UTILITIES
// =============================================================================

/**
 * Get current server verification status
 * 
 * @returns {object} Current verification status
 */
export function getVerificationStatus() {
    return { ...currentServerStatus };
}

/**
 * Clear verification cache
 */
export function clearVerificationCache() {
    verificationCache.clear();
    currentServerStatus = {
        url: null,
        verified: false,
        official: false,
        serverId: null,
        serverName: null,
        lastVerified: null,
        error: null
    };
}

/**
 * Check if a server URL requires verification
 * 
 * @param {string} url - Server URL
 * @returns {boolean} True if verification required
 */
export function requiresVerification(url) {
    if (!VERIFICATION_SETTINGS.allowUnofficialServers) {
        return true; // Always require verification in strict mode
    }

    // In development, localhost doesn't require verification
    if (isDevelopmentMode() && VERIFICATION_SETTINGS.trustLocalhostInDev) {
        const isLocalhost = url.includes('localhost') || url.includes('127.0.0.1');
        if (isLocalhost) return false;
    }

    return true;
}

/**
 * Get human-readable verification status message
 * 
 * @param {object} result - Verification result
 * @returns {string} Status message
 */
export function getStatusMessage(result) {
    if (!result) {
        return 'Not verified';
    }

    if (result.official) {
        return `✅ Official Server: ${result.serverName || result.serverId}`;
    }

    if (result.verified) {
        return `⚠️ Verified but unofficial: ${result.serverName || result.serverId}`;
    }

    if (result.success && result.warnings?.length > 0) {
        return `⚠️ Connected with warnings: ${result.warnings[0]}`;
    }

    if (result.error) {
        return `❌ Verification failed: ${result.error}`;
    }

    return '❓ Unknown status';
}

/**
 * Get verification icon based on status
 * 
 * @param {object} result - Verification result
 * @returns {string} Emoji icon
 */
export function getStatusIcon(result) {
    if (!result) return '❓';
    if (result.official) return '✅';
    if (result.verified) return '⚠️';
    if (result.success) return '🔓';
    return '❌';
}

// =============================================================================
// EXPORTS
// =============================================================================

export default {
    verifyServer,
    getVerificationStatus,
    clearVerificationCache,
    requiresVerification,
    getStatusMessage,
    getStatusIcon,
    generateChallenge,
    computeFingerprint
};
