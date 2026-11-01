// The stdio bridge's own seat (scripts/mcp/atome_mcp_stdio.mjs): a key held by this program, paired to the
// person's account like a new device (validated mockup MD1c). The bridge prints a two-digit number; eVe asks
// « Tapez le nombre affiché sur <label> » on the person's device; once approved the server enrolls the key as a
// program's (server/auth_devices.js `mcp_program`) and the session token names that seat (`prg`), so the relay
// answers MCP for it alone. The access token lives 15 minutes: the seat renews it with its key.
//
// `seatFile` (optional): the seat kept between runs (private key and session, mode 0600) so the program stays the
// same program in Réglages › Mon matériel; without it the seat lives as long as the process.
import crypto from 'node:crypto';
import fs from 'node:fs';
import { createPairingClient } from '../../atome/src/squirrel/security/auth_pairing_client.js';
import { authSigningMessage } from '../../atome/src/shared/auth_link_contract.js';
import { publicDeviceKey, randomHandle } from '../../server/auth_link_security.js';

const STATUS_POLL_MS = 2000;
const RENEW_EVERY_MS = 10 * 60 * 1000;

const deviceFor = (privateKey) => {
    const { jwk: publicKey, keyId } = publicDeviceKey(crypto.createPublicKey(privateKey).export({ format: 'jwk' }));
    return { keyId, publicKey, sign: async challenge => ({ challengeId: challenge.challenge,
        signature: crypto.sign('sha256', Buffer.from(authSigningMessage(challenge)), { key: privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64url') }) };
};
const readSeat = (file) => {
    if (!file || !fs.existsSync(file)) return null;
    const seat = JSON.parse(fs.readFileSync(file, 'utf8'));
    return { ...seat, privateKey: crypto.createPrivateKey({ key: seat.privateJwk, format: 'jwk' }) };
};
const keepSeat = (file, { privateKey, session, userId }) => {
    if (!file) return;
    fs.writeFileSync(file, JSON.stringify({ privateJwk: privateKey.export({ format: 'jwk' }), session, userId }), { mode: 0o600 });
};
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

/** `request(message)`: one `/ws/api` message, resolves its answer. Resolves `{ token() }` once the seat is open. */
export async function openProgramSeat({ request, account, label, host, seatFile = null, log }) {
    const auth = async (action, fields) => {
        const answer = await request({ type: 'auth', action, ...fields });
        if (!answer?.ok) throw new Error(answer?.error || `auth_${action}_failed`);
        return answer;
    };
    let seat = readSeat(seatFile);
    let token = null;
    if (!seat) {
        if (!account) throw new Error('mcp_seat_account_required');
        const privateKey = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' }).privateKey;
        const device = deviceFor(privateKey);
        const records = new Map();
        let installed = null;
        const pairing = createPairingClient({ devices: { forScope: async () => device, randomHandle, put: async (key, value) => records.set(key, value),
            read: async key => records.get(key), remove: async key => records.delete(key), keys: async prefix => [...records.keys()].filter(key => key.startsWith(prefix)) },
        approver: { available: async () => false }, send: message => request(message), token: () => null, ensureSession: async () => {},
        installSession: async (result) => { installed = result; }, crypto: globalThis.crypto });
        const who = String(account).trim();
        const asked = await pairing.startPairing({ ...(who.startsWith('+') ? { phone: who } : { handle: who }),
            deviceClass: 'program', platform: 'mcp_program', label, host });
        log(`type ${String(asked.matchNumber).padStart(2, '0')} in eVe to accept « ${label} » (until ${new Date(asked.expiresAt).toLocaleTimeString()})`);
        for (;;) {
            const { state } = await pairing.pairingStatus();
            if (state === 'approved') break;
            if (state !== 'pending') throw new Error(`mcp_seat_pairing_${state}`);
            await wait(STATUS_POLL_MS);
        }
        await pairing.completePairing();
        seat = { privateKey, session: installed.session, userId: installed.user.id };
        token = installed.token;
        keepSeat(seatFile, seat);
        log(`accepted on ${installed.user.handle || 'the account'}`);
    }
    const device = deviceFor(seat.privateKey);
    const renew = async () => {
        const fields = { sessionId: seat.session.id, generation: seat.session.generation };
        const { challenge } = await auth('session-challenge', { ...fields, purpose: 'renew' });
        const result = await auth('session-renew', { ...fields, ...await device.sign(challenge) });
        if (!result.token || result.user?.id !== seat.userId || result.session?.keyId !== device.keyId) throw new Error('auth_session_invalid');
        seat = { ...seat, session: result.session };
        keepSeat(seatFile, seat);
        token = result.token;
    };
    if (!token) await renew();
    const timer = setInterval(() => renew().catch((error) => { log(`session renewal failed: ${error.message}`); process.exit(1); }), RENEW_EVERY_MS);
    timer.unref();
    return { token: () => token };
}
