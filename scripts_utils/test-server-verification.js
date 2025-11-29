#!/usr/bin/env node
/**
 * Test script for server identity verification
 * 
 * Usage: node scripts_utils/test-server-verification.js [server-url]
 * 
 * Example:
 *   node scripts_utils/test-server-verification.js http://localhost:3001
 */

import crypto from 'crypto';

const SERVER_URL = process.argv[2] || 'http://localhost:3001';

// ANSI colors
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const RESET = '\x1b[0m';

const log = {
    info: (msg) => console.log(`${BLUE}ℹ️  ${msg}${RESET}`),
    success: (msg) => console.log(`${GREEN}✅ ${msg}${RESET}`),
    error: (msg) => console.log(`${RED}❌ ${msg}${RESET}`),
    warn: (msg) => console.log(`${YELLOW}⚠️  ${msg}${RESET}`),
    step: (num, msg) => console.log(`\n${BLUE}[Step ${num}]${RESET} ${msg}`),
};

async function testServerVerification() {
    console.log('\n' + '='.repeat(60));
    console.log('  Server Identity Verification Test');
    console.log('='.repeat(60) + '\n');

    log.info(`Testing server: ${SERVER_URL}`);

    try {
        // Step 1: Get server identity
        log.step(1, 'Getting server identity...');

        const identityResponse = await fetch(`${SERVER_URL}/api/server/identity`);
        if (!identityResponse.ok) {
            throw new Error(`Failed to get identity: ${identityResponse.status}`);
        }

        const identity = await identityResponse.json();
        console.log(`   Server ID: ${identity.serverId}`);
        console.log(`   Server Name: ${identity.serverName}`);
        console.log(`   Has signing: ${identity.hasSigningCapability}`);
        console.log(`   Fingerprint: ${identity.fingerprint?.substring(0, 40)}...`);

        if (!identity.hasSigningCapability) {
            log.warn('Server does not have signing capability configured');
            log.warn('Server verification will not work until keys are generated');
            return;
        }

        log.success('Server identity retrieved');

        // Step 2: Generate challenge
        log.step(2, 'Generating random challenge...');

        const challenge = crypto.randomBytes(32).toString('hex');
        console.log(`   Challenge: ${challenge.substring(0, 32)}...`);
        log.success('Challenge generated');

        // Step 3: Send challenge and get signed response
        log.step(3, 'Sending challenge to server...');

        const verifyResponse = await fetch(`${SERVER_URL}/api/server/verify`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ challenge }),
        });

        if (!verifyResponse.ok) {
            throw new Error(`Verification request failed: ${verifyResponse.status}`);
        }

        const signedResponse = await verifyResponse.json();

        if (!signedResponse.success) {
            throw new Error(`Server signing failed: ${signedResponse.error}`);
        }

        console.log(`   Signature received: ${signedResponse.signature?.substring(0, 40)}...`);
        console.log(`   Timestamp: ${signedResponse.timestamp}`);
        console.log(`   Nonce: ${signedResponse.nonce}`);
        log.success('Signed response received');

        // Step 4: Verify signature locally
        log.step(4, 'Verifying signature...');

        const dataToVerify = `${signedResponse.serverId}:${challenge}:${signedResponse.timestamp}:${signedResponse.nonce}`;

        const isValid = crypto.verify(
            'RSA-SHA256',
            Buffer.from(dataToVerify, 'utf8'),
            {
                key: signedResponse.publicKey,
                padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
                saltLength: 32,
            },
            Buffer.from(signedResponse.signature, 'base64')
        );

        if (isValid) {
            log.success('Signature is VALID!');
        } else {
            log.error('Signature is INVALID!');
            return;
        }

        // Step 5: Verify fingerprint
        log.step(5, 'Verifying fingerprint...');

        const keyObj = crypto.createPublicKey(signedResponse.publicKey);
        const keyDer = keyObj.export({ type: 'spki', format: 'der' });
        const computedFingerprint = `sha256:${crypto.createHash('sha256').update(keyDer).digest('hex')}`;

        console.log(`   Received fingerprint: ${signedResponse.fingerprint}`);
        console.log(`   Computed fingerprint: ${computedFingerprint}`);

        if (computedFingerprint === signedResponse.fingerprint) {
            log.success('Fingerprint matches!');
        } else {
            log.error('Fingerprint MISMATCH!');
            return;
        }

        // Step 6: Check timestamp freshness
        log.step(6, 'Checking response freshness...');

        const responseAge = Date.now() - signedResponse.timestamp;
        console.log(`   Response age: ${responseAge}ms`);

        if (responseAge < 30000) { // 30 second max
            log.success('Response is fresh!');
        } else {
            log.warn('Response is stale (older than 30 seconds)');
        }

        // Final result
        console.log('\n' + '='.repeat(60));
        log.success('SERVER VERIFICATION COMPLETE!');
        console.log('='.repeat(60));
        console.log(`\n   Server "${signedResponse.serverName}" is authentic.`);
        console.log(`   Fingerprint: ${signedResponse.fingerprint}\n`);

    } catch (err) {
        log.error(`Test failed: ${err.message}`);
        console.error(err);
    }
}

testServerVerification();
