import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { getServerIdentity } from './serverIdentity.js';
import {
    createUserAtome,
    findUserByPhone,
    findUserById
} from './auth_users.js';
import { hashPassword, normalizePhone, verifyPassword } from './auth_crypto.js';

const MAX_PROVISIONING_TTL_MS = 15 * 60 * 1000;

function response(requestId, success, fields = {}) {
    return { type: 'auth-response', requestId, success, ok: success, ...fields };
}

function operationDigest(operationId) {
    return crypto.createHash('sha256').update(String(operationId)).digest('hex');
}

function validIntent(message) {
    return message?.intent === 'account_provision';
}

function validExpiry(message) {
    const expiresAt = Date.parse(String(message?.expires_at || message?.expiresAt || ''));
    const now = Date.now();
    return Number.isFinite(expiresAt) && expiresAt > now && expiresAt - now <= MAX_PROVISIONING_TTL_MS;
}

function issueToken(userId, jwtSecret) {
    return jwt.sign({ userId }, jwtSecret, { expiresIn: '7d' });
}

async function loadRecordedProvision(dataSource, operationId) {
    const rows = await dataSource.query(
        `SELECT principal_id, status, expires_at FROM account_provision_operations
         WHERE operation_digest = ? LIMIT 1`,
        [operationDigest(operationId)]
    );
    return rows?.[0] || null;
}

async function recordProvision(dataSource, operationId, principalId, expiresAt) {
    await dataSource.query(
        `INSERT INTO account_provision_operations
         (operation_digest, principal_id, status, expires_at, created_at, updated_at)
         VALUES (?, ?, 'completed', ?, datetime('now'), datetime('now'))`,
        [operationDigest(operationId), principalId, expiresAt]
    );
}

/**
 * Dedicated /ws/api owner for explicit inter-runtime Fastify account provisioning.
 * It intentionally accepts no local principal as an authentication factor.
 */
export async function handleWsApiAccountProvision(message, context) {
    if (message?.type !== 'auth' || message?.action !== 'account-provision') return null;

    const requestId = message.requestId || message.request_id || null;
    const operationId = String(message.operation_id || message.operationId || '').trim();
    const identity = getServerIdentity();
    const suppliedFingerprint = String(message.verified_server_fingerprint || message.verifiedServerFingerprint || '').trim();
    if (!identity.hasSigningCapability || !identity.fingerprint || suppliedFingerprint !== identity.fingerprint) {
        return response(requestId, false, { error: 'remote_identity_unverified' });
    }
    if (!validIntent(message)) return response(requestId, false, { error: 'invalid_provisioning_intent' });
    if (operationId.length < 16 || operationId.length > 256) {
        return response(requestId, false, { error: 'invalid_operation_id' });
    }
    if (!validExpiry(message)) return response(requestId, false, { error: 'provisioning_expired' });

    const phone = normalizePhone(message.phone);
    const password = typeof message.password === 'string' ? message.password : '';
    const username = String(message.username || '').trim() || phone;
    if (!phone || phone.length < 6 || password.length < 8) {
        return response(requestId, false, { error: 'invalid_credentials' });
    }

    const recorded = await loadRecordedProvision(context.dataSource, operationId);
    if (recorded) {
        if (recorded.status !== 'completed' || Date.parse(recorded.expires_at) < Date.now()) {
            return response(requestId, false, { error: 'provisioning_expired' });
        }
        const user = await findUserById(context.dataSource, recorded.principal_id);
        if (!user || !await verifyPassword(password, user.password_hash)) {
            return response(requestId, false, { error: 'invalid_credentials' });
        }
        const token = issueToken(user.user_id, context.jwtSecret());
        context.attach(connectionOrNull(context), user.user_id, token);
        return response(requestId, true, {
            provisioned: true,
            replayed: true,
            token,
            user: { id: user.user_id, user_id: user.user_id, username: user.username }
        });
    }

    let user = await findUserByPhone(context.dataSource, phone);
    if (user) {
        if (!await verifyPassword(password, user.password_hash)) {
            return response(requestId, false, { error: 'invalid_credentials' });
        }
    } else {
        const principalId = context.generatePrincipalId();
        user = await createUserAtome(
            context.dataSource,
            principalId,
            username,
            phone,
            await hashPassword(password),
            'private',
            {}
        );
    }

    try {
        await recordProvision(context.dataSource, operationId, user.user_id, message.expires_at || message.expiresAt);
    } catch (error) {
        const replay = await loadRecordedProvision(context.dataSource, operationId);
        if (!replay || String(replay.principal_id) !== String(user.user_id)) throw error;
    }
    const token = issueToken(user.user_id, context.jwtSecret());
    context.attach(connectionOrNull(context), user.user_id, token);
    return response(requestId, true, {
        provisioned: true,
        replayed: false,
        token,
        user: { id: user.user_id, user_id: user.user_id, username: user.username }
    });
}

function connectionOrNull(context) {
    return context.connection || null;
}
