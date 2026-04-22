#!/usr/bin/env node

/**
 * Server Key Generator - RSA Key Pair Generation Utility
 * 
 * Generates RSA key pairs for server identity verification.
 * Run this script ONCE during initial server setup.
 * 
 * Usage:
 *   npm run generate-keys
 *   node scripts_utils/generate-server-keys.js
 *   node scripts_utils/generate-server-keys.js --output ./custom/path
 * 
 * Output:
 *   - server.key (private key) - KEEP SECRET, never commit to Git
 *   - server.pub (public key) - Can be shared, add to trusted_keys.js
 * 
 * SECURITY WARNINGS:
 * - Private key must NEVER be committed to Git
 * - Private key must be stored securely
 * - Public key fingerprint should be added to trusted_keys.js
 * 
 * @module scripts_utils/generate-server-keys
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import readline from 'readline';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Default output directory
const DEFAULT_OUTPUT_DIR = path.join(__dirname, '..', 'server', 'certificates');

// RSA key parameters
const KEY_SIZE = 2048; // bits (2048 is secure, 4096 for extra security)
const PUBLIC_EXPONENT = 65537;

/**
 * Generate RSA key pair
 */
function generateKeyPair() {
    console.log(`\n🔐 Generating ${KEY_SIZE}-bit RSA key pair...\n`);

    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
        modulusLength: KEY_SIZE,
        publicExponent: PUBLIC_EXPONENT,
        publicKeyEncoding: {
            type: 'spki',
            format: 'pem'
        },
        privateKeyEncoding: {
            type: 'pkcs8',
            format: 'pem'
        }
    });

    return { publicKey, privateKey };
}

/**
 * Compute SHA-256 fingerprint of public key
 */
function computeFingerprint(publicKeyPem) {
    const keyObj = crypto.createPublicKey(publicKeyPem);
    const keyDer = keyObj.export({ type: 'spki', format: 'der' });
    const hash = crypto.createHash('sha256').update(keyDer).digest('hex');
    return `sha256:${hash}`;
}

/**
 * Generate a random server ID
 */
function generateServerId() {
    const randomPart = crypto.randomBytes(4).toString('hex');
    return `squirrel-server-${randomPart}`;
}

/**
 * Interactive prompt
 */
function prompt(question) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    return new Promise(resolve => {
        rl.question(question, answer => {
            rl.close();
            resolve(answer);
        });
    });
}

/**
 * Main function
 */
async function main() {
    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║         SQUIRREL SERVER KEY GENERATOR                        ║');
    console.log('║                                                              ║');
    console.log('║  This tool generates RSA keys for server verification.      ║');
    console.log('║  Keys allow clients to verify server authenticity.          ║');
    console.log('╚══════════════════════════════════════════════════════════════╝');

    // Parse command line arguments
    const args = process.argv.slice(2);
    let outputDir = DEFAULT_OUTPUT_DIR;

    const outputIndex = args.indexOf('--output');
    if (outputIndex !== -1 && args[outputIndex + 1]) {
        outputDir = path.resolve(args[outputIndex + 1]);
    }

    // Check if keys already exist
    const privateKeyPath = path.join(outputDir, 'server.key');
    const publicKeyPath = path.join(outputDir, 'server.pub');

    if (fs.existsSync(privateKeyPath) || fs.existsSync(publicKeyPath)) {
        console.log('\n⚠️  Warning: Keys already exist in output directory!');
        console.log(`   Directory: ${outputDir}`);
        console.log('');

        const answer = await prompt('Do you want to overwrite existing keys? (yes/no): ');
        if (answer.toLowerCase() !== 'yes') {
            console.log('\n❌ Operation cancelled. Existing keys preserved.');
            process.exit(0);
        }
    }

    // Generate server ID
    const defaultServerId = generateServerId();
    console.log('\n📝 Server Configuration');
    console.log('────────────────────────────────────────');

    const serverId = await prompt(`Enter server ID [${defaultServerId}]: `) || defaultServerId;
    const serverName = await prompt('Enter server name [Squirrel Server]: ') || 'Squirrel Server';

    // Generate keys
    const { publicKey, privateKey } = generateKeyPair();
    const fingerprint = computeFingerprint(publicKey);

    // Create output directory
    fs.mkdirSync(outputDir, { recursive: true });

    // Create .gitkeep to preserve directory structure
    fs.writeFileSync(path.join(outputDir, '.gitkeep'), '# This file keeps the directory in Git\n');

    // Write keys
    fs.writeFileSync(privateKeyPath, privateKey, { mode: 0o600 }); // Read/write only for owner
    fs.writeFileSync(publicKeyPath, publicKey, { mode: 0o644 }); // Readable by all

    // Output results
    console.log('\n✅ Keys generated successfully!');
    console.log('────────────────────────────────────────────────────────────────');
    console.log(`📂 Output directory: ${outputDir}`);
    console.log(`🔑 Private key: ${privateKeyPath}`);
    console.log(`🔓 Public key:  ${publicKeyPath}`);
    console.log('');
    console.log('📋 Server Identity:');
    console.log(`   Server ID:    ${serverId}`);
    console.log(`   Server Name:  ${serverName}`);
    console.log(`   Fingerprint:  ${fingerprint}`);
    console.log('');

    // Generate .env additions
    console.log('────────────────────────────────────────────────────────────────');
    console.log('📝 Add these lines to your .env file:');
    console.log('');
    console.log(`SERVER_ID=${serverId}`);
    console.log(`SERVER_NAME=${serverName}`);
    console.log(`SERVER_PRIVATE_KEY_PATH=./server/certificates/server.key`);
    console.log(`SERVER_PUBLIC_KEY_PATH=./server/certificates/server.pub`);
    console.log('');

    // Generate trusted_keys.js entry
    console.log('────────────────────────────────────────────────────────────────');
    console.log('📝 Add this entry to src/application/security/trusted_keys.js:');
    console.log('');
    console.log(`    '${serverId}': {`);
    console.log(`        name: '${serverName}',`);
    console.log(`        fingerprint: '${fingerprint}',`);
    console.log(`        publicKey: \`${publicKey.replace(/\n/g, '\\n')}\``);
    console.log(`    },`);
    console.log('');

    // Security warnings
    console.log('────────────────────────────────────────────────────────────────');
    console.log('⚠️  SECURITY WARNINGS:');
    console.log('');
    console.log('   1. NEVER commit server.key to Git');
    console.log('   2. Keep server.key secure and backed up');
    console.log('   3. server.pub can be shared publicly');
    console.log('   4. Add fingerprint to trusted_keys.js for official servers');
    console.log('   5. Rotate keys periodically (yearly recommended)');
    console.log('');
    console.log('────────────────────────────────────────────────────────────────');
    console.log('✅ Setup complete! Restart your server to load the new keys.');
    console.log('');
}

// Run main function
main().catch(err => {
    console.error('❌ Error:', err.message);
    process.exit(1);
});
