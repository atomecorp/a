import { generateRecoveryCode, readRecoveryCode, recoveryLookupInput, recoveryProof, recoveryVerifierInput, recoveryWrapKey } from '../../shared/auth_recovery_code.js';
import { backupDigest, createBackupKeyring } from './backup_keyring.js';

// Authentication V1 client (§6.2 – §6.8): account creation without phone,
// device pairing, approvals, devices, recovery and the connection proof. Keys
// live in the device store under an account scope; nothing secret is stored but
// the account's backup keys (#backup_keyring.js), which the server never opens.
const hex = (bytes) => Array.from(new Uint8Array(bytes), (value) => value.toString(16).padStart(2, '0')).join('');

export function createPairingClient({ devices, approver, send, token, ensureSession, installSession, connectionProof = false,
    storePurchase, crypto = globalThis.crypto, now = Date.now }) {
    const keyring = createBackupKeyring({ devices, crypto });
    async function request(action, fields = {}) {
        const result = await send({ type: 'auth', action, ...fields });
        if (!result?.ok && result?.offline === true) throw new Error('auth_server_unreachable');
        if (!result?.ok) throw new Error(result?.error || 'auth_connection_unavailable');
        return result;
    }
    // The access token lives 15 minutes and is renewed on demand, as for every authenticated call.
    const authenticated = async (action, fields = {}) => {
        await ensureSession();
        const bearer = token();
        if (!bearer) throw new Error('auth_session_required');
        return request(action, { ...fields, token: bearer });
    };
    const checkChallenge = (challenge, purpose, reference) => {
        if (challenge?.purpose !== purpose || (reference && challenge.reference !== reference)
            || !Number.isSafeInteger(challenge.issuedAt) || Math.abs(now() - challenge.issuedAt) > 60000) throw new Error('auth_challenge_invalid');
        return challenge;
    };
    // The native key stores accept a 64-hex scope only; the browser store takes it as well.
    const newScope = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), (value) => value.toString(16).padStart(2, '0')).join('');
    // The approve key is created only on a personal device whose platform verifies its user.
    async function registerApprove(register, deviceClass, scope) {
        if (deviceClass === 'shared' || !await approver.available()) return null;
        return approver.register(checkChallenge(register, 'approve-key-register'), { scope });
    }
    async function accept(result, scope, approveRecord, deviceClass = 'personal') {
        const device = await devices.forScope(scope);
        if (!result?.token || !result.user?.id || result.session?.keyId !== device.keyId) throw new Error('auth_session_invalid');
        await devices.put('session', { scope, phone: result.user.phone || null, session: result.session, userId: result.user.id, deviceClass });
        if (approveRecord) await devices.put(`approve:${scope}`, approveRecord);
        await installSession(result, { scope });
        return result;
    }
    async function sessionRecord() {
        const record = await devices.read('session');
        if (!record?.session?.id) throw new Error('auth_session_required');
        return record;
    }
    const deviceOf = (record) => (record.scope ? devices.forScope(record.scope) : devices.forPhone(record.phone));
    // A session enrolled by SMS before V1 has no scope of its own: its device key's
    // (the phone scope) also names its approve key.
    const scopeOf = async (record) => record.scope || (await deviceOf(record)).scope;
    // Approve-class purposes: the server names the challenge, the approve key proves the user.
    async function approval(purpose, extra = {}) {
        const record = await sessionRecord();
        const fields = { sessionId: record.session.id, generation: record.session.generation };
        const response = await request('approval-challenge', { ...fields, purpose, ...extra });
        const stored = await devices.read(`approve:${await scopeOf(record)}`);
        if (!stored) throw new Error('auth_approve_key_required');
        const challenge = checkChallenge(response.challenge, purpose);
        return { ...fields, approval: await approver.approve(challenge, stored) };
    }
    return {
        approveAvailable: () => approver.available(),
        signupStatus: (invite) => request('signup-status', { invite: invite || undefined }),
        // Mailed by the server from its own sender; `clientRef` makes a resend after a lost answer harmless.
        createInvite: ({ email, clientRef, subject, fromName, text }) => authenticated('invite-create', { email, clientRef, subject, fromName, text }),
        async createAccount({ deviceClass, platform = 'web', label = '', payment = { method: 'card' }, invite } = {}) {
            const scope = newScope();
            const device = await devices.forScope(scope);
            // A store sheet may stay open for minutes: buy before the 60 s challenge.
            const paid = await storePurchase.creationPayment(payment, device.keyId);
            const clientNonce = devices.randomHandle();
            const pre = await request('account-create-challenge', { sessionKey: device.publicKey, clientNonce, invite });
            const signed = await device.sign(checkChallenge(pre.challenge, 'create-account', `create:${device.keyId}`));
            const approve = await registerApprove(pre.register, deviceClass, scope);
            const result = await request('account-create', { sessionKey: device.publicKey, clientNonce, invite, ...signed, connectionProof,
                approve: approve?.approve || null, deviceMeta: { platform, label }, deviceClass, payment: paid });
            return accept(result, scope, approve?.record, deviceClass);
        },
        // New device: a request code and a match number to show and to speak.
        async startPairing({ handle = '', phone = '', deviceClass, platform = 'web', label = '' } = {}) {
            const scope = newScope();
            const device = await devices.forScope(scope);
            const pre = await request('pair-start-challenge', { sessionKey: device.publicKey });
            const approve = await registerApprove(pre.register, deviceClass, scope);
            // The approving device seals the account's backup keys for this key alone.
            const backupPair = await keyring.pairKey();
            const result = await request('pair-start', { sessionKey: device.publicKey, handle: String(handle || '').trim() || undefined,
                phone: String(phone || '').trim() || undefined, connectionProof, backupKey: await keyring.publicJwk(backupPair),
                approve: approve?.approve || null, deviceMeta: { platform, label }, deviceClass });
            const attempt = { scope, pairId: result.pairId, code: result.code, matchNumber: result.matchNumber,
                expiresAt: result.expiresAt, approve: approve?.record || null, deviceClass, backupKey: backupPair.privateKey };
            await devices.put('pair-attempt', attempt);
            return { code: attempt.code, matchNumber: attempt.matchNumber, expiresAt: attempt.expiresAt, pairId: attempt.pairId };
        },
        pendingPairing: () => devices.read('pair-attempt'),
        async pairingStatus() {
            const attempt = await devices.read('pair-attempt');
            if (!attempt) return null;
            const device = await devices.forScope(attempt.scope);
            const { challenge } = await request('pair-requester-challenge', { pairId: attempt.pairId, purpose: 'pair-resume' });
            const result = await request('pair-status', { pairId: attempt.pairId, ...await device.sign(checkChallenge(challenge, 'pair-resume', attempt.pairId)) });
            return { state: result.state, expiresAt: result.expiresAt };
        },
        async completePairing() {
            const attempt = await devices.read('pair-attempt');
            if (!attempt) throw new Error('auth_pair_unknown');
            const device = await devices.forScope(attempt.scope);
            const { challenge } = await request('pair-requester-challenge', { pairId: attempt.pairId, purpose: 'pair-complete' });
            const result = await request('pair-complete', { pairId: attempt.pairId, ...await device.sign(checkChallenge(challenge, 'pair-complete', attempt.pairId)) });
            await devices.remove('pair-attempt');
            const accepted = await accept(result, attempt.scope, attempt.approve, attempt.deviceClass);
            if (result.backupKeys && attempt.backupKey) await keyring.receive(result.user.id, result.backupKeys, attempt.backupKey);
            return accepted;
        },
        // A shared device holding an account's key asks its owner to open it once more (§6.4).
        async startSharedOpen(userId) {
            const target = await devices.read(`account:${userId}`);
            if (target?.deviceClass !== 'shared' || !target.scope) throw new Error('auth_account_unknown');
            const device = await devices.forScope(target.scope);
            const { challenge } = await request('shared-open-challenge', { sessionKey: device.publicKey });
            const signed = await device.sign(checkChallenge(challenge, 'shared-open', `shared:${device.keyId}`));
            const result = await request('shared-open-start', { sessionKey: device.publicKey, ...signed });
            const attempt = { scope: target.scope, pairId: result.pairId, code: result.code, matchNumber: result.matchNumber,
                expiresAt: result.expiresAt, approve: null, deviceClass: 'shared' };
            await devices.put('pair-attempt', attempt);
            return { code: attempt.code, matchNumber: attempt.matchNumber, expiresAt: attempt.expiresAt, pairId: attempt.pairId };
        },
        async cancelPairing() {
            const attempt = await devices.read('pair-attempt');
            if (!attempt) return { ok: true };
            if (attempt.expiresAt > now()) {
                const device = await devices.forScope(attempt.scope);
                const { challenge } = await request('pair-requester-challenge', { pairId: attempt.pairId, purpose: 'pair-cancel' });
                await request('pair-cancel', { pairId: attempt.pairId, ...await device.sign(checkChallenge(challenge, 'pair-cancel', attempt.pairId)) });
            }
            await devices.remove('pair-attempt');
            return { ok: true };
        },
        // Approver side: a typed or dictated code, or a notice naming the request.
        claimPairing: (code) => authenticated('pair-claim', { code: String(code || '').replace(/\D/g, '') }),
        viewPairing: (pairId) => authenticated('pair-view', { pairId }),
        // Requests waiting for this account, newest first; only a device holding
        // an approve key can answer them, the others are not asked.
        async pendingPairRequests() {
            const record = await devices.read('session');
            if (!record?.session?.id || !await devices.read(`approve:${await scopeOf(record)}`)) return [];
            return (await authenticated('pair-pending')).requests || [];
        },
        refusePairing: (pairId) => authenticated('pair-cancel', { pairId }),
        async approvePairing(pairId, choice) {
            // The new device (a shared one never) receives the account's backup keys, sealed for its key.
            const { request: asked } = await authenticated('pair-view', { pairId });
            const backupKeys = asked?.backupKey ? await keyring.sealFor(await keyring.ensure((await sessionRecord()).userId), asked.backupKey) : undefined;
            const fields = await approval('pair-approve', { pairId, choice: Number(choice), backup: await backupDigest(backupKeys, crypto) });
            return request('pair-approve', { ...fields, pairId, choice: Number(choice), backupKeys });
        },
        // "Not my account": the new device withdraws itself at once.
        async notMyAccount() {
            const record = await sessionRecord();
            const device = await deviceOf(record);
            const fields = { sessionId: record.session.id, generation: record.session.generation };
            const { challenge } = await request('session-challenge', { ...fields, purpose: 'not-my-account' });
            await request('not-my-account', { ...fields, ...await device.sign(checkChallenge(challenge, 'not-my-account', `${fields.sessionId}:${fields.generation}`)) });
            await devices.remove('session');
            if (record.userId) await devices.remove(`account:${record.userId}`);
            return { ok: true };
        },
        // Several accounts on one personal device (§6.5): each keeps its own keys and
        // session; switching proves the person locally with that account's approve key.
        async listLocalAccounts() {
            const current = await devices.read('session');
            const accounts = [];
            for (const key of await devices.keys('account:')) {
                const account = await devices.read(key);
                if (account?.userId) accounts.push({ userId: account.userId, name: account.user?.username && !/^user_/.test(account.user.username)
                    ? account.user.username : account.handle || '', handle: account.handle || '', current: current?.userId === account.userId,
                deviceClass: account.deviceClass || 'personal' });
            }
            return accounts;
        },
        async switchAccount(userId) {
            const target = await devices.read(`account:${userId}`);
            if (!target?.session) throw new Error('auth_account_unknown');
            // A shared device never reopens an account by itself: its owner approves (startSharedOpen).
            if (target.deviceClass === 'shared') throw new Error('auth_shared_open_required');
            const approve = target.scope ? await devices.read(`approve:${target.scope}`) : null;
            if (!approve) throw new Error('auth_approve_key_required');
            await approver.verifyLocal(approve);
            const device = await deviceOf(target);
            const { user, handle: _handle, ...session } = target;
            await devices.put('session', session);
            await devices.put('local-grant', { phone: target.phone || null, scope: target.scope, keyId: device.keyId, user, locked: false });
            await devices.put('workspace-identity', { id: user.id, locked: false });
            return { ok: true, reload: true };
        },
        // The current account stays listed (its session and keys are kept); the device
        // returns to the first launch to create or open another one.
        async addAccount() {
            await sessionRecord();
            await devices.remove('session');
            const grant = await devices.read('local-grant');
            if (grant) await devices.put('local-grant', { ...grant, locked: true });
            await devices.put('workspace-identity', { locked: true });
            return { ok: true, reload: true };
        },
        // A device enrolled before approve keys (or after losing its own) adds one.
        async addApproveKey() {
            const record = await sessionRecord();
            const scope = await scopeOf(record);
            const device = await deviceOf(record);
            const fields = { sessionId: record.session.id, generation: record.session.generation };
            const pre = await request('approve-key-add-challenge', fields);
            const signed = await device.sign(checkChallenge(pre.challenge, 'approve-key-add', `${fields.sessionId}:${fields.generation}`));
            const approve = await registerApprove(pre.register, 'personal', scope);
            if (!approve) throw new Error('auth_approve_key_unavailable');
            const result = await request('approve-key-add', { ...fields, ...signed, approve: approve.approve });
            await devices.put(`approve:${scope}`, approve.record);
            return result;
        },
        listDevices: () => authenticated('devices-list'),
        // The account's backup keys on this device, made the first time a copy needs them; none without an account.
        async backupKeys() {
            const record = await devices.read('session');
            return record?.session?.id && record.userId ? keyring.ensure(record.userId) : null;
        },
        renameDevice: (deviceId, label) => authenticated('device-rename', { deviceId, label }),
        async revokeDevice(deviceId) {
            return request('device-revoke', { ...await approval('device-revoke', { subject: { deviceId } }), deviceId });
        },
        async setDeviceClass(deviceId, deviceClass) {
            return request('device-class', { ...await approval('device-class', { subject: { deviceId, deviceClass } }), deviceId, deviceClass });
        },
        // The code is shown once; the server keeps a verifier of its proof only, and the
        // account's backup keys wrapped by a key only the code derives.
        async createRecoveryCode() {
            const record = await sessionRecord();
            const generated = generateRecoveryCode(crypto);
            const proof = await recoveryProof(generated, crypto);
            const digest = async (text) => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
            const verifier = await digest(recoveryVerifierInput(record.userId, proof));
            // The lookup lets the code alone find its account when every device is lost.
            const lookup = await digest(recoveryLookupInput(proof));
            const backupKeys = await keyring.wrap(await keyring.ensure(record.userId), await recoveryWrapKey(generated.core, crypto));
            const subject = { verifier, lookup, backup: await backupDigest(backupKeys, crypto) };
            await request('recovery-code-set', { ...await approval('recovery-code-set', { subject }), verifier, lookup, backupKeys });
            return { ok: true, code: generated.code };
        },
        async startRecovery({ handle = '', phone = '', code, platform = 'web', label = '' } = {}) {
            const typed = readRecoveryCode(code);
            const scope = newScope();
            const device = await devices.forScope(scope);
            const pre = await request('recovery-start-challenge', { sessionKey: device.publicKey });
            const approve = await registerApprove(pre.register, 'personal', scope);
            const result = await request('recovery-start', { handle: String(handle || '').trim() || undefined,
                phone: String(phone || '').trim() || undefined, code: await recoveryProof(typed, crypto), sessionKey: device.publicKey, connectionProof,
                approve: approve?.approve || null, deviceMeta: { platform, label } });
            // Only its key is kept until the space opens (non-extractable): the code itself is never stored.
            const attempt = { scope, recoveryId: result.recoveryId, notBefore: result.notBefore, approve: approve?.record || null,
                wrapKey: typed.version === 2 ? await recoveryWrapKey(typed.core, crypto) : null };
            await devices.put('recovery-attempt', attempt);
            return { recoveryId: attempt.recoveryId, notBefore: attempt.notBefore };
        },
        pendingRecovery: () => devices.read('recovery-attempt'),
        async completeRecovery() {
            const attempt = await devices.read('recovery-attempt');
            if (!attempt) throw new Error('auth_recovery_unavailable');
            const device = await devices.forScope(attempt.scope);
            const fields = { recoveryId: attempt.recoveryId, sessionKey: device.publicKey };
            const { challenge } = await request('recovery-requester-challenge', { ...fields, purpose: 'recovery-complete' });
            const result = await request('recovery-complete', { ...fields, ...await device.sign(checkChallenge(challenge, 'recovery-complete', attempt.recoveryId)) });
            await devices.remove('recovery-attempt');
            const accepted = await accept(result, attempt.scope, attempt.approve, 'personal');
            if (result.backupKeys && attempt.wrapKey) await keyring.unwrap(result.user.id, result.backupKeys, attempt.wrapKey);
            return accepted;
        },
        async abandonRecovery() { await devices.remove('recovery-attempt'); return { ok: true }; },
        async cancelRecovery(recoveryId) {
            return request('recovery-cancel', { ...await approval('recovery-cancel', { subject: { recoveryId } }), recoveryId });
        },
        // Signs a connection challenge with the current session key (the /ws/sync handshake).
        async signConnectionChallenge(challenge) {
            const device = await deviceOf(await sessionRecord());
            if (challenge?.keyId !== device.keyId) throw new Error('auth_device_binding_mismatch');
            return device.sign(checkChallenge(challenge, 'connection'));
        },
        // Proves the session key on the current connection (§6.6).
        async proveConnection(bearer, transport) {
            const record = await sessionRecord();
            const device = await deviceOf(record);
            const challenge = await transport({ type: 'auth', action: 'connection-challenge', token: bearer });
            if (!challenge?.ok) throw new Error(challenge?.error || 'auth_connection_proof_required');
            if (challenge.challenge?.keyId !== device.keyId) throw new Error('auth_device_binding_mismatch');
            const proof = await transport({ type: 'auth', action: 'connection-proof', token: bearer,
                ...await device.sign(checkChallenge(challenge.challenge, 'connection')) });
            if (!proof?.ok) throw new Error(proof?.error || 'auth_connection_proof_required');
        }
    };
}
