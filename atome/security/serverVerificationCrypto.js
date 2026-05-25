/**
 * Server verification cryptographic helpers.
 *
 * @module atome/security/serverVerificationCrypto
 */

/**
 * Generate a cryptographically secure random challenge.
 *
 * @param {number} length - Length in bytes.
 * @returns {string} Hex-encoded challenge string.
 */
export function generateChallenge(length = 32) {
    const array = new Uint8Array(length);
    crypto.getRandomValues(array);
    return Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Convert PEM-encoded public key to ArrayBuffer.
 *
 * @param {string} pem - PEM-encoded public key.
 * @returns {ArrayBuffer} Key as ArrayBuffer.
 */
export function pemToArrayBuffer(pem) {
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
 * Convert Base64 string to ArrayBuffer.
 *
 * @param {string} base64 - Base64 encoded string.
 * @returns {ArrayBuffer} Decoded ArrayBuffer.
 */
export function base64ToArrayBuffer(base64) {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
}

/**
 * Compute SHA-256 fingerprint of a public key.
 *
 * @param {string} publicKeyPem - PEM-encoded public key.
 * @returns {Promise<string>} Fingerprint in format "sha256:hexstring".
 */
export async function computeFingerprint(publicKeyPem) {
    const keyBuffer = pemToArrayBuffer(publicKeyPem);
    const hashBuffer = await crypto.subtle.digest('SHA-256', keyBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return `sha256:${hashHex}`;
}

/**
 * Verify RSA-PSS signature using Web Crypto API.
 *
 * @param {string} publicKeyPem - PEM-encoded public key.
 * @param {string} data - Original data that was signed.
 * @param {string} signatureBase64 - Base64-encoded signature.
 * @returns {Promise<boolean>} True if signature is valid.
 */
export async function verifySignature(publicKeyPem, data, signatureBase64) {
    try {
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

        const signatureBuffer = base64ToArrayBuffer(signatureBase64);
        const dataBuffer = new TextEncoder().encode(data);

        return crypto.subtle.verify(
            {
                name: 'RSA-PSS',
                saltLength: 32
            },
            cryptoKey,
            signatureBuffer,
            dataBuffer
        );
    } catch (err) {
        return false;
    }
}
