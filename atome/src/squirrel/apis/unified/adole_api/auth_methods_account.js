// Authentication V1 facade on `AdoleAPI.auth`: accounts without phone, device
// pairing, approvals, devices and recovery (owner: auth_pairing_client.js).
import { FastifyAdapter } from '../adole.js';
import { setConnectionProver } from '../adole_websocket.js';
import { setSyncConnectionSigner } from '../sync_engine.js';
import { createPairingClient } from '../../../security/auth_pairing_client.js';
import { billingStorePurchase } from '../../../billing/store_purchase.js';
import { createWebAuthnApprover } from '../../../security/auth_webauthn_client.js';
import { authSigningMessage } from '../../../../shared/auth_link_contract.js';
import { deviceStore, ensureRemoteSession, installRemote } from './auth_methods_login.js';

let client = null;
// Native shells bring their own user-verified key provider (§4.3); until then
// they create no approve key and say so.
const unavailableApprover = { available: async () => false,
    register: async () => { throw new Error('auth_approve_key_unavailable'); },
    approve: async () => { throw new Error('auth_approve_key_required'); },
    verifyLocal: async () => { throw new Error('auth_approve_key_required'); } };

// iOS: a Secure Enclave approve key usable only after Face ID, Touch ID or the passcode,
// one per account scope; the OS verification is the proof, never the voice or a click.
const iosApprover = (invoke) => {
    const call = async (action, fields) => {
        const result = await invoke('auth_device_key', { action, ...fields });
        if (!result) throw new Error('auth_approve_key_unavailable');
        return result;
    };
    const sign = async (scope, challenge) => (await call('approve-sign', { scope, message: authSigningMessage(challenge) })).signature;
    return {
        available: async () => true,
        async register(challenge, { scope } = {}) {
            const { publicKey } = await call('approve-public', { scope });
            return { approve: { kind: 'native', publicKey, assurance: 'hardware_uv', challengeId: challenge.challenge, signature: await sign(scope, challenge) },
                record: { kind: 'native', scope } };
        },
        async approve(challenge, record) {
            if (record?.kind !== 'native') throw new Error('auth_approve_key_required');
            return { challengeId: challenge.challenge, signature: await sign(record.scope, challenge) };
        },
        // The Secure Enclave signs only after the user is verified: a signature is the local proof.
        async verifyLocal(record) {
            if (record?.kind !== 'native') throw new Error('auth_approve_key_required');
            const now = Date.now(), nonce = crypto.getRandomValues(new Uint8Array(32)).join('');
            await sign(record.scope, { purpose: 'local-unlock', reference: `unlock:${nonce}`, challenge: nonce, nonce, keyId: record.scope, issuedAt: now });
            return { ok: true };
        }
    };
};

export function pairingClient() {
    if (client) return client;
    const env = globalThis.window || globalThis;
    const ios = typeof env.__ATOME_IOS_NATIVE_INVOKE === 'function';
    const native = ios || !!env.__TAURI_INTERNALS__;
    const approver = ios ? iosApprover(env.__ATOME_IOS_NATIVE_INVOKE) : native ? unavailableApprover : createWebAuthnApprover({ env });
    client = createPairingClient({ devices: deviceStore(), approver,
        // Native shells also use the remote token from Swift/Rust, which cannot prove a connection yet.
        connectionProof: !native,
        send: (message) => FastifyAdapter.ws.send(message), token: () => FastifyAdapter.getToken(), ensureSession: ensureRemoteSession,
        installSession: installRemote, storePurchase: billingStorePurchase() });
    return client;
}

setConnectionProver((token, transport) => pairingClient().proveConnection(token, transport));
setSyncConnectionSigner((challenge) => pairingClient().signConnectionChallenge(challenge));

// The platform and the default name of this device, never trusted for security.
export function describeThisDevice(env = globalThis.window || globalThis) {
    const agent = String(env.navigator?.userAgent || '');
    const platform = typeof env.__ATOME_IOS_NATIVE_INVOKE === 'function' ? (/iPad/.test(agent) ? 'ipados' : 'ios')
        : /Android/.test(agent) ? 'android' : /iPhone/.test(agent) ? 'ios' : /iPad/.test(agent) ? 'ipados'
            : env.__TAURI_INTERNALS__ && /Mac OS X/.test(agent) ? 'macos' : 'web';
    const browser = /Edg\//.test(agent) ? 'Edge' : /Firefox\//.test(agent) ? 'Firefox' : /Chrome\//.test(agent) ? 'Chrome'
        : /Safari\//.test(agent) ? 'Safari' : '';
    const system = /Mac OS X/.test(agent) ? 'Mac' : /Windows/.test(agent) ? 'Windows' : /Linux/.test(agent) ? 'Linux' : '';
    const label = platform === 'web' ? [browser, system].filter(Boolean).join(' · ') : { ios: 'iPhone', ipados: 'iPad', android: 'Android', macos: 'Mac' }[platform];
    return { platform, label: label || '', asksClass: !['ios', 'ipados', 'android'].includes(platform) };
}

const withDevice = (options = {}) => ({ ...describeThisDevice(), ...options });

export const accountMethods = {
    approveKeyAvailable: () => pairingClient().approveAvailable(),
    createAccount: (options) => pairingClient().createAccount(withDevice(options)),
    // `apple` / `google` on the native iOS / Android apps, whose payment is the
    // store's in-app purchase; null where the Web payment applies.
    paymentStore: () => billingStorePurchase().store(),
    startPairing: (options) => pairingClient().startPairing(withDevice(options)),
    getPendingPairing: () => pairingClient().pendingPairing(),
    getPairingStatus: () => pairingClient().pairingStatus(),
    completePairing: () => pairingClient().completePairing(),
    cancelPairing: () => pairingClient().cancelPairing(),
    claimPairing: (code) => pairingClient().claimPairing(code),
    viewPairing: (pairId) => pairingClient().viewPairing(pairId),
    listPendingPairRequests: () => pairingClient().pendingPairRequests(),
    refusePairing: (pairId) => pairingClient().refusePairing(pairId),
    approvePairing: (pairId, choice) => pairingClient().approvePairing(pairId, choice),
    notMyAccount: () => pairingClient().notMyAccount(),
    addApproveKey: () => pairingClient().addApproveKey(),
    listDevices: () => pairingClient().listDevices(),
    renameDevice: (deviceId, label) => pairingClient().renameDevice(deviceId, label),
    revokeDevice: (deviceId) => pairingClient().revokeDevice(deviceId),
    setDeviceClass: (deviceId, deviceClass) => pairingClient().setDeviceClass(deviceId, deviceClass),
    createRecoveryCode: () => pairingClient().createRecoveryCode(),
    startRecovery: (options) => pairingClient().startRecovery(withDevice(options)),
    getPendingRecovery: () => pairingClient().pendingRecovery(),
    completeRecovery: () => pairingClient().completeRecovery(),
    abandonRecovery: () => pairingClient().abandonRecovery(),
    cancelRecovery: (recoveryId) => pairingClient().cancelRecovery(recoveryId),
    listLocalAccounts: () => pairingClient().listLocalAccounts(),
    switchAccount: (userId) => pairingClient().switchAccount(userId),
    startSharedOpen: (userId) => pairingClient().startSharedOpen(userId),
    addAccount: () => pairingClient().addAccount(),
    describeThisDevice
};
