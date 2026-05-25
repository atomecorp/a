/**
 * Server verification cache and status presentation.
 *
 * @module atome/security/serverVerificationState
 */

const verificationCache = new Map();

let currentServerStatus = {
    url: null,
    verified: false,
    official: false,
    serverId: null,
    serverName: null,
    lastVerified: null,
    error: null
};

export function getCachedVerificationResult(url, cacheDurationMs) {
    const cached = verificationCache.get(url);
    if (cached && Date.now() - cached.timestamp < cacheDurationMs) {
        return cached.result;
    }
    return null;
}

export function cacheVerificationResult(url, result) {
    verificationCache.set(url, {
        result,
        timestamp: Date.now()
    });

    currentServerStatus = {
        url,
        ...result,
        lastVerified: Date.now()
    };

    return result;
}

/**
 * Get current server verification status.
 *
 * @returns {object} Current verification status.
 */
export function getVerificationStatus() {
    return { ...currentServerStatus };
}

/**
 * Clear verification cache.
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
 * Get human-readable verification status message.
 *
 * @param {object} result - Verification result.
 * @returns {string} Status message.
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
 * Get verification icon based on status.
 *
 * @param {object} result - Verification result.
 * @returns {string} Emoji icon.
 */
export function getStatusIcon(result) {
    if (!result) return '❓';
    if (result.official) return '✅';
    if (result.verified) return '⚠️';
    if (result.success) return '🔓';
    return '❌';
}
