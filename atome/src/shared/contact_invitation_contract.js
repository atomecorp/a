// An invitation to atome.one, kept as an Atome of the inviter: written on the device first, so one made
// offline waits there and leaves at the next connection (eVe/intuition/tools/contact_invite.js); the server
// mails it from its own sender with a link valid 21 days, for one account (server/auth_invites.js).
export const CONTACT_INVITATION_ATOME_TYPE = 'contact_invitation';
export const CONTACT_INVITATION_STATES = Object.freeze(['pending', 'sent', 'failed']);
// One address, without a display name or a list: what the server accepts too.
export const INVITE_EMAIL_PATTERN = /^[^\s@<>"(),;:\\[\]]+@[^\s@<>"(),;:\\[\]]+\.[^\s@<>"(),;:\\[\]]+$/;
export const isInviteEmail = value => typeof value === 'string' && value.length <= 254 && INVITE_EMAIL_PATTERN.test(value);
export const INVITE_MESSAGE_MAX = 1000;
export const contactInvitationId = id => `contact_invitation_${id}`;
export const CONTACT_INVITATION_TYPE = Object.freeze({ type: CONTACT_INVITATION_ATOME_TYPE, kind: 'data_model', traits: ['data'], schema: {
    email: { type: 'string', maxLength: 254 }, message: { type: 'string', maxLength: INVITE_MESSAGE_MAX },
    state: { type: 'string', enum: CONTACT_INVITATION_STATES }, error: { type: 'string', maxLength: 80 },
    created_at: { type: 'string' }, sent_at: { type: 'string' }, expires_at: { type: 'string' },
    access: { type: 'string', enum: ['private'] }, visibility: { type: 'string', enum: ['private'] } } });
