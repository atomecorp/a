import { digest, randomHandle, reject } from './auth_link_security.js';
import { isInviteEmail } from '../atome/src/shared/contact_invitation_contract.js';

// An invitation lifts a closed sign-up for one account: 21 days, one use, sent by mail
// to one address. Only the token's digest is kept, and the address as a keyed index
// (a new invitation of the same inviter to the same address replaces the previous one).
export const INVITE_TTL_MS = 21 * 86400000;
const LINK = '{link}';
// One header line: no line break can reach the mail's headers.
const headerText = (value, maximum) => {
    const text = String(value || '').trim();
    if (!text || text.length > maximum || /[\r\n]/.test(text)) reject('auth_request_invalid');
    return text;
};

export function createInvites({ query, transaction, proof, devices, mailer, origin, now = Date.now }) {
    // A malformed token is no invitation: the same answer as a spent one.
    const valid = async (token) => typeof token === 'string' && /^[A-Za-z0-9_-]{43}$/.test(token)
        && !!await query('get', `SELECT invite_id FROM auth_invites WHERE token_hash = ?
            AND consumed_ms IS NULL AND revoked_ms IS NULL AND expires_ms > ?`, [digest(token), now()]);
    // Before anything else of a creation (its payment included): the invitation is still open.
    async function check(token) {
        if (!await valid(token)) reject('auth_invite_invalid');
    }
    // Inside the creation's transaction: a second use, even concurrent, finds it consumed.
    async function consume(token, principalId) {
        await check(token);
        const consumed = await query('run', `UPDATE auth_invites SET consumed_ms = ?, consumed_by = ? WHERE token_hash = ?
            AND consumed_ms IS NULL AND revoked_ms IS NULL AND expires_ms > ?`, [now(), principalId, digest(token), now()]);
        if (Number(consumed.changes) !== 1) reject('auth_invite_invalid');
        const invite = await query('get', 'SELECT invite_id, inviter_principal FROM auth_invites WHERE token_hash = ?', [digest(token)]);
        await proof.audit('invite_consumed', principalId, invite.invite_id);
        return invite;
    }
    // Any account invites, from a personal device past its probation. `clientRef` (the invitation
    // atome's id on the inviting device) makes a resend after a lost answer harmless: it is mailed once.
    async function create(claims, input) {
        const email = String(input.email || '').trim().toLowerCase();
        if (!isInviteEmail(email)) reject('auth_invite_email_invalid');
        const clientRef = String(input.clientRef || '');
        if (!/^[A-Za-z0-9_-]{8,64}$/.test(clientRef)) reject('auth_request_invalid');
        const subject = headerText(input.subject, 200);
        const fromName = headerText(input.fromName, 64);
        const text = String(input.text || '');
        if (text.length > 4000 || text.split(LINK).length !== 2) reject('auth_request_invalid');
        const token = randomHandle();
        const created = await transaction(async () => {
            const key = await devices.byId(claims.cnf?.kid);
            if (!key || key.principal_id !== claims.sub || key.revoked_ms !== null) reject('auth_session_invalid');
            if (key.device_class !== 'personal' || key.restricted_until_ms > now()) reject('auth_device_cooling_off');
            const sent = await query('get', 'SELECT invite_id, expires_ms FROM auth_invites WHERE inviter_principal = ? AND client_ref = ?',
                [claims.sub, clientRef]);
            if (sent) return { duplicate: true, inviteId: sent.invite_id, expiresAt: sent.expires_ms };
            // A flood guard for the domain's mail reputation, not a quota on invitations.
            await proof.limit(`invite-hour:${claims.sub}`, 34, 3600000);
            await proof.limit(`invite-day:${claims.sub}`, 144, 86400000);
            const emailIndex = proof.keyedIndex(`invite-email:${email}`);
            await query('run', `UPDATE auth_invites SET revoked_ms = ? WHERE inviter_principal = ? AND email_index = ?
                AND consumed_ms IS NULL AND revoked_ms IS NULL`, [now(), claims.sub, emailIndex]);
            const inviteId = randomHandle();
            await query('run', `INSERT INTO auth_invites (invite_id, token_hash, inviter_principal, email_index, client_ref, created_ms, expires_ms)
                VALUES (?, ?, ?, ?, ?, ?, ?)`, [inviteId, digest(token), claims.sub, emailIndex, clientRef, now(), now() + INVITE_TTL_MS]);
            await proof.audit('invite_created', claims.sub, inviteId);
            return { inviteId, expiresAt: now() + INVITE_TTL_MS };
        });
        if (created.duplicate) return { ok: true, inviteId: created.inviteId, expiresAt: created.expiresAt };
        // Mail is network I/O: sent after the commit; an invitation that never left is withdrawn.
        try {
            await mailer.send({ to: email, fromName, subject, text: text.replace(LINK, `${origin}/#invite=${token}`) });
        } catch (error) {
            await query('run', 'DELETE FROM auth_invites WHERE invite_id = ?', [created.inviteId]);
            throw error;
        }
        return { ok: true, inviteId: created.inviteId, expiresAt: created.expiresAt };
    }
    return { valid, check, consume, create };
}
