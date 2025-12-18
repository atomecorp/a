/**
 * Trusted Server Keys Registry
 * 
 * This file contains the public keys and fingerprints of official Squirrel servers.
 * Clients use this information to verify server authenticity before sending credentials.
 * 
 * HOW IT WORKS:
 * 1. Server sends its public key and signs a challenge
 * 2. Client verifies the signature using the public key
 * 3. Client checks that the public key fingerprint matches a trusted entry
 * 4. If match found in TRUSTED_SERVERS, the server is marked as "official"
 * 5. If no match, user is warned that the server is "unofficial/custom"
 * 
 * ADDING A NEW OFFICIAL SERVER:
 * 1. Generate keys with: npm run generate-keys
 * 2. Copy the public key and fingerprint from the output
 * 3. Add a new entry to TRUSTED_SERVERS below
 * 4. Deploy the updated trusted_keys.js with the app
 * 
 * SECURITY:
 * - This file is safe to commit to Git (contains only PUBLIC keys)
 * - Private keys are NEVER stored here
 * - Fingerprints prevent key substitution attacks
 * 
 * @module src/application/security/trusted_keys
 */

// =============================================================================
// TRUSTED OFFICIAL SERVERS
// =============================================================================

/**
 * Registry of official Squirrel/Atome servers
 * 
 * Each entry contains:
 * - name: Human-readable server name
 * - fingerprint: SHA-256 hash of public key (sha256:hexstring)
 * - urls: Array of valid URLs for this server
 * - publicKey: PEM-encoded public key (optional, for verification)
 * - environment: 'production', 'staging', or 'development'
 */
export const TRUSTED_SERVERS = {
    // =========================================================================
    // PRODUCTION SERVERS
    // =========================================================================

    // Main production server (example - replace with real keys after generation)
    // 'squirrel-server-prod-001': {
    //     name: 'Squirrel Official Server',
    //     fingerprint: 'sha256:abcdef1234567890...', // Replace with real fingerprint
    //     urls: [
    //         'https://api.atome.cloud',
    //         'https://squirrel.atome.cloud'
    //     ],
    //     environment: 'production',
    //     publicKey: `-----BEGIN PUBLIC KEY-----
    // MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA...
    // -----END PUBLIC KEY-----`
    // },

    // =========================================================================
    // DEVELOPMENT SERVERS (remove in production builds)
    // =========================================================================

    // Local development server - keys generated via npm run generate-keys
    'squirrel-server-dev': {
        name: 'Squirrel Development Server',
        fingerprint: 'sha256:90bc6840e76d120ec751f323bd4ab578b3c69aa1b310a98a1ae3350d4a77ef50',
        urls: [],
        environment: 'development',
        publicKey: `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAk9tPEuFhdWmpBQ88zIKT
jPRNA4jQiuZFuJrYxCumwjYx6gGNA0Gju3gvgUCoU4By+r4IpCBzSGevezLGxI1I
EV4JEteBqzdXb82e0sc65FuCuAyWBY2uEsLHQHlSY0GBbVmOh0NMYBcItwSa/aL7
a7wueCno5mYee0yaMYVSpotZ3xT+eR09GlbHZfinQnAFPtPSvxzdmbR6XDiCxFKv
7JySZnkezGK1HNStLE6qKJzNIMxeUdHqiSTZGflGi+daBjbB2tCEXWuEstChWo9J
QoDDRJdWfI6q7vwYJIOxpF6LFue8t87kV5aE1Uy+BhPS58Pyc7T5AC4jIOkVPZJw
vwIDAQAB
-----END PUBLIC KEY-----`,
        // Development servers are trusted by default for convenience
        trustWithoutVerification: false // Now properly verified with real keys
    }
};

// =============================================================================
// VERIFICATION SETTINGS
// =============================================================================

/**
 * Global verification settings
 */
export const VERIFICATION_SETTINGS = {
    // Allow connections to servers not in TRUSTED_SERVERS?
    // Set to false in production for maximum security
    allowUnofficialServers: true,

    // Warn user when connecting to unofficial servers?
    warnOnUnofficialServer: true,

    // Maximum age of challenge response (prevents replay attacks)
    maxResponseAgeMs: 30000, // 30 seconds

    // Cache verification results for performance
    cacheDurationMs: 300000, // 5 minutes

    // Minimum challenge length
    minChallengeLength: 32,

    // Development mode - skip verification for localhost
    trustLocalhostInDev: true
};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Check if a server ID is in the trusted list
 * 
 * @param {string} serverId - Server ID to check
 * @returns {object|null} Trusted server entry or null
 */
export function getTrustedServer(serverId) {
    return TRUSTED_SERVERS[serverId] || null;
}

/**
 * Check if a fingerprint matches any trusted server
 * 
 * @param {string} fingerprint - Fingerprint to check (sha256:hexstring)
 * @returns {object|null} Trusted server entry or null
 */
export function findServerByFingerprint(fingerprint) {
    if (!fingerprint) return null;

    for (const [serverId, server] of Object.entries(TRUSTED_SERVERS)) {
        if (server.fingerprint === fingerprint) {
            return { serverId, ...server };
        }
    }
    return null;
}

/**
 * Check if a URL belongs to a trusted server
 * 
 * @param {string} url - URL to check
 * @returns {object|null} Trusted server entry or null
 */
export function findServerByUrl(url) {
    if (!url) return null;

    // Normalize URL
    const normalizedUrl = url.replace(/\/$/, '').toLowerCase();

    const getDynamicTrustedUrls = (serverId, server) => {
        const urls = [];

        if (Array.isArray(server.urls)) {
            urls.push(...server.urls);
        }

        if (typeof window !== 'undefined' && serverId === 'squirrel-server-dev') {
            const configured = window.__SQUIRREL_FASTIFY_URL__;
            if (typeof configured === 'string' && configured.trim()) {
                const base = configured.trim().replace(/\/$/, '');
                urls.push(base);
                urls.push(base.replace(/^http:/, 'https:'));
                urls.push(base.replace(/^https:/, 'http:'));
            }
        }

        return urls;
    };

    for (const [serverId, server] of Object.entries(TRUSTED_SERVERS)) {
        for (const trustedUrl of getDynamicTrustedUrls(serverId, server)) {
            if (normalizedUrl === trustedUrl.replace(/\/$/, '').toLowerCase()) {
                return { serverId, ...server };
            }
        }
    }
    return null;
}

/**
 * Get all trusted servers for a specific environment
 * 
 * @param {string} environment - 'production', 'staging', or 'development'
 * @returns {object[]} Array of server entries
 */
export function getServersByEnvironment(environment) {
    return Object.entries(TRUSTED_SERVERS)
        .filter(([_, server]) => server.environment === environment)
        .map(([serverId, server]) => ({ serverId, ...server }));
}

/**
 * Check if we're in development mode
 * 
 * @returns {boolean} True if development mode
 */
export function isDevelopmentMode() {
    // Check various indicators of development mode
    if (typeof window !== 'undefined') {
        // Browser environment
        const hostname = window.location?.hostname || '';
        return hostname === 'localhost' || hostname === '127.0.0.1';
    }
    // Node environment
    return process.env.NODE_ENV !== 'production';
}

export default {
    TRUSTED_SERVERS,
    VERIFICATION_SETTINGS,
    getTrustedServer,
    findServerByFingerprint,
    findServerByUrl,
    getServersByEnvironment,
    isDevelopmentMode
};
