import { contactBookPhone } from '../atome/src/shared/contact_book_hash.js';
import { normalizeCommunicationPriority } from '../atome/src/shared/communication_contract.js';

// The recipient's committed favorites grant priority. No assertion supplied by
// the sender, public directory or UI projection participates in this decision.
export async function authorizeCommunicationPriority({ vaultRouter, recipientId, sender, priority }) {
    const value = normalizeCommunicationPriority(priority);
    if (value === 'normal') return value;
    const state = await vaultRouter.getState(recipientId, recipientId);
    const raw = state?.properties?.eve_profile;
    const profile = typeof raw === 'string' ? JSON.parse(raw) : raw;
    const favorites = profile?.preferences?.contacts?.favorites;
    const senderId = String(sender.userId || ''), phone = contactBookPhone(sender.phone);
    for (const favorite of Array.isArray(favorites) ? favorites : []) {
        if (favorite.id === senderId) return value;
        if (!favorite.id) continue;
        // The current ticked card owns its identity. The remembered phone is
        // only a fallback for a removed/merged card, never for an edited card.
        const card = await vaultRouter.getState(recipientId, favorite.id);
        if (!card) {
            if (phone && contactBookPhone(favorite.phone) === phone) return value;
            continue;
        }
        if (String(card.owner_id || card.meta?.owner_id || card.vault_principal_id || '') !== String(recipientId)) continue;
        const props = card.properties || {};
        if (props.user_id === senderId || (phone && [props.phone, ...(Array.isArray(props.phones) ? props.phones : []).map(entry => entry?.value ?? entry)]
            .some(value => contactBookPhone(value) === phone))) return value;
    }
    throw new Error('communication_priority_forbidden');
}
