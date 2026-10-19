import { createAccountAuth } from './auth_accounts.js';
import { BILLING_PUBLIC_ERRORS } from './billing/store_purchases.js';
import { createApprovals } from './auth_approvals.js';
import { createPairing } from './auth_pairing.js';
import { createRecovery } from './auth_recovery.js';
import { resolveWebAuthnConfig } from './auth_webauthn.js';
import { readDeviceSessionToken, validateConnectionDeviceSession } from './auth_session_validation.js';
import { randomHandle } from './auth_link_security.js';
import { wsApiConnections } from './wsApiState.js';

// Authentication V1 on `/ws/api`: accounts without phone, device pairing with
// number matching, recovery, device management. Same `auth` / `auth-response`
// envelope as the phone-link owner, which delegates these actions here.
export const ACCOUNT_ACTIONS = new Set(['account-create-challenge', 'account-create', 'approve-key-add-challenge', 'approve-key-add',
    'approval-challenge', 'pair-start-challenge', 'pair-start', 'pair-claim', 'pair-pending', 'pair-view', 'pair-approve',
    'pair-requester-challenge', 'pair-status', 'pair-complete', 'pair-cancel', 'not-my-account',
    'recovery-code-set', 'recovery-start-challenge', 'recovery-start', 'recovery-cancel', 'recovery-requester-challenge',
    'recovery-status', 'recovery-complete', 'devices-list', 'device-rename', 'device-revoke', 'device-class',
    'connection-challenge', 'connection-proof', 'shared-open-challenge', 'shared-open-start']);
// Actions answered only for an authenticated connection (bearer of this account).
const AUTHENTICATED = new Set(['pair-claim', 'pair-pending', 'pair-view', 'devices-list', 'device-rename']);
export const ACCOUNT_PUBLIC_ERRORS = ['auth_device_class_required', 'auth_payment_method_invalid', 'auth_approve_key_required',
    'auth_user_verification_required', 'auth_webauthn_rejected', 'auth_webauthn_invalid', 'auth_webauthn_attestation_unsupported',
    'auth_webauthn_algorithm_unsupported', 'auth_webauthn_counter_regressed', 'auth_pairing_invalid', 'auth_pairing_locked',
    'auth_pair_unknown', 'auth_pair_not_approved', 'auth_recovery_unavailable', 'auth_recovery_not_ready', 'auth_handle_unavailable',
    'auth_connection_proof_required', ...BILLING_PUBLIC_ERRORS];

export function createWsAccountAuth({ service, database, jwtSecret, createAccount, findById, disconnectSession, billing, now = Date.now }) {
    const { proof, devices, handles, sessions } = service;
    const query = database.query, transaction = database.withTransaction;
    // Server-originated notices reach the live connections of the account;
    // the payload names an internal action, never a URL or a secret.
    const notify = async (principalId, notice, { exceptDeviceId = null, personalOnly = false } = {}) => {
        if (!principalId) return;
        for (const connection of wsApiConnections) {
            const claims = connection._wsApiDeviceClaims;
            if (claims?.sub !== principalId || connection.readyState !== 1) continue;
            if (exceptDeviceId || personalOnly) {
                const key = await devices.byId(claims.cnf?.kid);
                if (!key || (exceptDeviceId && devices.deviceOf(key) === exceptDeviceId)) continue;
                if (personalOnly && (key.device_class !== 'personal' || key.restricted_until_ms > now())) continue;
            }
            connection.send(JSON.stringify({ type: 'auth-notice', ...notice }));
        }
    };
    const approvals = createApprovals({ query, proof, webauthn: resolveWebAuthnConfig(), now });
    const accounts = createAccountAuth({ query, transaction, proof, sessions, devices, handles, approvals, createAccount, notify, disconnectSession, now, billing });
    const pairing = createPairing({ query, transaction, proof, sessions, devices, handles, approvals, accounts, findById, notify, disconnectSession, now });
    const recovery = createRecovery({ query, transaction, proof, sessions, devices, handles, approvals, accounts, findById, notify, disconnectSession, now });
    // The waiting device hears about its request on the socket it asked from.
    const tellRequester = (pairId, state) => {
        for (const connection of wsApiConnections) {
            if (connection._authPairRequestId === pairId && connection.readyState === 1) {
                connection.send(JSON.stringify({ type: 'auth-pair-update', pairId, state }));
            }
        }
    };
    async function claimsOf(message, connection) {
        const claims = await validateConnectionDeviceSession(connection, message.token, jwtSecret()) || connection._wsApiDeviceClaims;
        if (!claims || claims.auth_version !== 1) throw new Error('auth_session_invalid');
        return claims;
    }
    async function handle(message, connection, network) {
        const claims = AUTHENTICATED.has(message.action) || message.action === 'pair-cancel' && !message.signature
            ? await claimsOf(message, connection) : null;
        switch (message.action) {
            case 'account-create-challenge': return accounts.createChallenge(message, network);
            case 'account-create': return accounts.create(message, network);
            case 'approve-key-add-challenge': return accounts.approveKeyAddChallenge(message);
            case 'approve-key-add': return accounts.approveKeyAdd(message);
            case 'approval-challenge':
                if (message.purpose === 'pair-approve') return pairing.approveChallenge(message);
                return accounts.approvalChallenge(message);
            case 'pair-start-challenge': return pairing.startChallenge(message, network);
            case 'pair-start': {
                const result = await pairing.start(message, network);
                connection._authPairRequestId = result.pairId;
                return result;
            }
            case 'shared-open-challenge': return pairing.sharedOpenChallenge(message, network);
            case 'shared-open-start': {
                const result = await pairing.sharedOpenStart(message, network);
                connection._authPairRequestId = result.pairId;
                return result;
            }
            case 'pair-claim': return pairing.claim(message, claims);
            case 'pair-pending': return pairing.pending(message, claims);
            case 'pair-view': return pairing.view(message, claims);
            case 'pair-approve': {
                const result = await pairing.approve(message);
                tellRequester(result.pairId, result.rejected ? 'rejected' : 'approved');
                return result;
            }
            case 'pair-requester-challenge': return pairing.requesterChallenge(message);
            case 'pair-status': {
                const result = await pairing.status(message);
                connection._authPairRequestId = message.pairId;
                return result;
            }
            case 'pair-complete': {
                const result = await pairing.complete(message);
                delete connection._authPairRequestId;
                return result;
            }
            case 'pair-cancel': {
                const result = await pairing.cancel(message, claims);
                tellRequester(message.pairId, 'cancelled');
                return result;
            }
            case 'not-my-account': return pairing.notMine(message);
            case 'recovery-code-set': return recovery.setCode(message);
            case 'recovery-start-challenge': return recovery.startChallenge(message, network);
            case 'recovery-start': return recovery.start(message, network);
            case 'recovery-cancel': return recovery.cancel(message);
            case 'recovery-requester-challenge': return recovery.requesterChallenge(message);
            case 'recovery-status': return recovery.status(message);
            case 'recovery-complete': return recovery.complete(message);
            // Proof of possession of the session key for this connection (§6.6).
            case 'connection-challenge': {
                const token = await readDeviceSessionToken(message.token, jwtSecret());
                connection._wsApiConnectionNonce ||= randomHandle();
                return { ok: true, challenge: await proof.challenge('connection', connection._wsApiConnectionNonce, token.cnf.kid) };
            }
            case 'connection-proof': {
                const token = await readDeviceSessionToken(message.token, jwtSecret());
                const key = await devices.byId(token.cnf.kid);
                if (!connection._wsApiConnectionNonce || !key) throw new Error('auth_session_invalid');
                await transaction(() => proof.consumeProof(message, 'connection', connection._wsApiConnectionNonce, JSON.parse(key.public_key)));
                connection._wsApiProvenKeyId = token.cnf.kid;
                await validateConnectionDeviceSession(connection, message.token, jwtSecret());
                return { ok: true };
            }
            case 'devices-list': return { ...await accounts.listDevices({ principalId: claims.sub, keyId: claims.cnf.kid }),
                handle: await handles.assign(claims.sub), recoveryCode: await recovery.hasCode(claims.sub) };
            case 'device-rename': return accounts.renameDevice({ principalId: claims.sub, deviceId: message.deviceId, label: message.label });
            case 'device-revoke': return accounts.revokeDevice(message);
            case 'device-class': return accounts.setDeviceClass(message);
            default: throw new Error('auth_request_invalid');
        }
    }
    return { handle, notify, accounts, pairing, recovery };
}
