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
 * @module atome/security/serverVerification
 */

import {
    VERIFICATION_SETTINGS,
    getTrustedServer,
    findServerByFingerprint,
    findServerByUrl,
    isDevelopmentMode
} from './trusted_keys.js';
import {
    computeFingerprint,
    generateChallenge,
    verifySignature
} from './serverVerificationCrypto.js';
import {
    cacheVerificationResult,
    clearVerificationCache,
    getCachedVerificationResult,
    getStatusIcon,
    getStatusMessage,
    getVerificationStatus
} from './serverVerificationState.js';

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
        const cached = getCachedVerificationResult(normalizedUrl, VERIFICATION_SETTINGS.cacheDurationMs);
        if (cached) return cached;
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
                result.success = true;
                result.verified = true;
                result.official = false;
                result.serverName = trustedByUrl.name || 'Local Development Server';
                result.warnings.push('Development mode: localhost trusted without cryptographic verification');
                return cacheVerificationResult(normalizedUrl, result);
            }
        }

        // Step 1: Get server identity

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

            return cacheVerificationResult(normalizedUrl, result);
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

            return cacheVerificationResult(normalizedUrl, result);
        }

        // Step 2: Check if server ID is in trusted list
        const trustedServer = getTrustedServer(identity.serverId);

        if (!trustedServer) {
            result.warnings.push(`Server ID "${identity.serverId}" is not in trusted list`);
        }

        // Step 3: Challenge-response verification

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
            return cacheVerificationResult(normalizedUrl, result);
        }

        const verifyData = await verifyResponse.json();

        if (!verifyData.success || !verifyData.verified) {
            result.error = verifyData.error || 'Server verification failed';
            return cacheVerificationResult(normalizedUrl, result);
        }

        // Step 4: Verify the timestamp is fresh
        const responseAge = Date.now() - verifyData.timestamp;
        if (responseAge > VERIFICATION_SETTINGS.maxResponseAgeMs) {
            result.error = 'Server response too old (possible replay attack)';
            return cacheVerificationResult(normalizedUrl, result);
        }

        // Step 5: Verify the signature
        const dataToSign = `${verifyData.serverId}:${challenge}:${verifyData.timestamp}:${verifyData.nonce}`;

        // Use trusted public key if available, otherwise use server-provided key
        const keyToUse = trustedServer?.publicKey || verifyData.publicKey;

        if (!keyToUse) {
            result.error = 'No public key available for verification';
            return cacheVerificationResult(normalizedUrl, result);
        }


        const signatureValid = await verifySignature(
            keyToUse,
            dataToSign,
            verifyData.signature
        );

        if (!signatureValid) {
            result.error = 'Invalid server signature';
            return cacheVerificationResult(normalizedUrl, result);
        }

        // Step 6: Verify fingerprint matches trusted server
        result.fingerprint = verifyData.fingerprint;

        if (trustedServer?.fingerprint) {
            // Compute fingerprint from the key we used
            const computedFingerprint = await computeFingerprint(keyToUse);

            if (computedFingerprint !== trustedServer.fingerprint) {
                result.error = 'Server fingerprint does not match trusted record';
                result.warnings.push('Possible key substitution attack');
                return cacheVerificationResult(normalizedUrl, result);
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


        return cacheVerificationResult(normalizedUrl, result);

    } catch (err) {
        if (err.name === 'AbortError') {
            result.error = 'Verification request timed out';
        } else {
            result.error = `Verification failed: ${err.message}`;
        }


        // Allow connection with warning if settings permit
        if (VERIFICATION_SETTINGS.allowUnofficialServers) {
            result.success = true;
            result.warnings.push('Connection allowed despite verification failure');
        }

        return cacheVerificationResult(normalizedUrl, result);
    }
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

export {
    clearVerificationCache,
    computeFingerprint,
    generateChallenge,
    getStatusIcon,
    getStatusMessage,
    getVerificationStatus
};

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
