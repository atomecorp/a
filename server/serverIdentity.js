/**
 * Server Identity Module - Cryptographic Server Verification
 * 
 * This module handles RSA key-based server identity verification.
 * It allows clients to verify that a server is an official Squirrel server
 * by challenging the server to sign a random nonce with its private key.
 * 
 * SECURITY:
 * - Private keys are loaded from files specified in .env (NEVER committed to Git)
 * - Public keys can be distributed to clients
 * - Challenge-response prevents replay attacks
 * - Timestamp verification prevents old responses from being reused
 * 
 * @module server/serverIdentity
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Signature algorithm
const ALGORITHM = 'RSA-SHA256';
const SIGNATURE_PADDING = crypto.constants.RSA_PKCS1_PSS_PADDING;
const SALT_LENGTH = 32;

// Server identity state
let privateKey = null;
let publicKey = null;
let publicKeyFingerprint = null;
let serverId = null;
let serverName = null;
let initialized = false;

/**
 * Initialize server identity from environment variables
 * Keys are loaded from paths specified in .env
 * 
 * @returns {boolean} True if initialization successful
 */
export function initServerIdentity() {
    if (initialized) {
        return !!privateKey;
    }

    const privateKeyPath = process.env.SERVER_PRIVATE_KEY_PATH;
    const publicKeyPath = process.env.SERVER_PUBLIC_KEY_PATH;
    serverId = process.env.SERVER_ID || 'squirrel-server-unknown';
    serverName = process.env.SERVER_NAME || 'Squirrel Server';

    if (!privateKeyPath || !publicKeyPath) {
        console.warn('⚠️  SERVER_PRIVATE_KEY_PATH or SERVER_PUBLIC_KEY_PATH not configured');
        console.warn('⚠️  Server signature verification will be disabled');
        console.warn('⚠️  Run "npm run generate-keys" to create server keys');
        initialized = true;
        return false;
    }

    try {
        const resolvedPrivatePath = path.resolve(__dirname, '..', privateKeyPath);
        const resolvedPublicPath = path.resolve(__dirname, '..', publicKeyPath);

        // Check if key files exist
        if (!fs.existsSync(resolvedPrivatePath)) {
            console.warn(`⚠️  Private key not found at: ${resolvedPrivatePath}`);
            console.warn('⚠️  Run "npm run generate-keys" to create server keys');
            initialized = true;
            return false;
        }

        if (!fs.existsSync(resolvedPublicPath)) {
            console.warn(`⚠️  Public key not found at: ${resolvedPublicPath}`);
            initialized = true;
            return false;
        }

        // Load keys
        privateKey = fs.readFileSync(resolvedPrivatePath, 'utf8');
        publicKey = fs.readFileSync(resolvedPublicPath, 'utf8');

        // Compute public key fingerprint (for client verification)
        publicKeyFingerprint = computeFingerprint(publicKey);

        console.log(`🔐 Server identity initialized:`);
        console.log(`   ID: ${serverId}`);
        console.log(`   Name: ${serverName}`);
        console.log(`   Fingerprint: ${publicKeyFingerprint.substring(0, 32)}...`);

        initialized = true;
        return true;

    } catch (err) {
        console.error('❌ Failed to load server identity keys:', err.message);
        initialized = true;
        return false;
    }
}

/**
 * Compute SHA-256 fingerprint of a public key
 * 
 * @param {string} publicKeyPem - Public key in PEM format
 * @returns {string} Fingerprint in format "sha256:hexstring"
 */
function computeFingerprint(publicKeyPem) {
    const keyObj = crypto.createPublicKey(publicKeyPem);
    const keyDer = keyObj.export({ type: 'spki', format: 'der' });
    const hash = crypto.createHash('sha256').update(keyDer).digest('hex');
    return `sha256:${hash}`;
}

/**
 * Sign a challenge with the server's private key
 * Used for challenge-response authentication
 * 
 * @param {string} challenge - Random challenge string from client
 * @returns {object} Signed response object
 */
export function signChallenge(challenge) {
    if (!privateKey) {
        return {
            success: false,
            verified: false,
            error: 'Server signature not configured',
            errorCode: 'NO_SIGNING_CAPABILITY'
        };
    }

    try {
        const timestamp = Date.now();
        const nonce = crypto.randomBytes(16).toString('hex');

        // Data to sign: serverId:challenge:timestamp:nonce
        const dataToSign = `${serverId}:${challenge}:${timestamp}:${nonce}`;

        // Sign with RSA-PSS
        const signature = crypto.sign(
            ALGORITHM,
            Buffer.from(dataToSign, 'utf8'),
            {
                key: privateKey,
                padding: SIGNATURE_PADDING,
                saltLength: SALT_LENGTH
            }
        ).toString('base64');

        return {
            success: true,
            verified: true,
            serverId,
            serverName,
            challenge,
            timestamp,
            nonce,
            signature,
            publicKey,
            fingerprint: publicKeyFingerprint,
            algorithm: 'RSA-PSS-SHA256'
        };

    } catch (err) {
        console.error('❌ Challenge signing failed:', err.message);
        return {
            success: false,
            verified: false,
            error: 'Signing failed',
            errorCode: 'SIGNING_ERROR'
        };
    }
}

/**
 * Get server identity information (public, no secrets)
 * 
 * @returns {object} Server identity info
 */
export function getServerIdentity() {
    return {
        serverId,
        serverName,
        hasSigningCapability: !!privateKey,
        publicKey: publicKey || null,
        fingerprint: publicKeyFingerprint || null,
        algorithm: 'RSA-PSS-SHA256',
        initialized
    };
}

/**
 * Verify a signature (for testing purposes)
 * In production, clients verify signatures locally
 * 
 * @param {string} data - Original data that was signed
 * @param {string} signatureBase64 - Base64 encoded signature
 * @returns {boolean} True if signature is valid
 */
export function verifySignature(data, signatureBase64) {
    if (!publicKey) return false;

    try {
        return crypto.verify(
            ALGORITHM,
            Buffer.from(data, 'utf8'),
            {
                key: publicKey,
                padding: SIGNATURE_PADDING,
                saltLength: SALT_LENGTH
            },
            Buffer.from(signatureBase64, 'base64')
        );
    } catch (err) {
        console.error('Signature verification failed:', err.message);
        return false;
    }
}

/**
 * Check if server identity is properly configured
 * 
 * @returns {boolean} True if server can sign challenges
 */
export function isConfigured() {
    return initialized && !!privateKey;
}

export default {
    initServerIdentity,
    signChallenge,
    getServerIdentity,
    verifySignature,
    isConfigured
};
