import { createEncryptedTokenVault } from './token_vault.js';
import { requestProviderService } from '../ai/provider_broker.js';

// Earlier versions sealed the user's secrets in this device's localStorage with a
// key kept beside them, so a recovered or new device never saw them. They move to
// the account vault once, then leave the device. The OpenAI key goes to its own
// server-side provider entry; every other secret keeps its entry id.
const deviceKeyId = (userId) => `squirrel.home.device_key.${encodeURIComponent(userId)}`;
const ownedBy = (userId) => {
    const scope = encodeURIComponent(userId);
    return (entryId) => entryId.startsWith(`ai.provider.${scope}.`) || entryId.startsWith(`home.credential.${scope}.`)
        || entryId === `mail.auth.${scope}` || entryId === `voice.wake.verifier.${scope}`;
};

export const moveDeviceSecretsToAccount = async ({ userId, storage, security, request = requestProviderService } = {}) => {
    const principal = String(userId || '').trim();
    const secret = principal && storage?.getItem(deviceKeyId(principal));
    if (!secret) return { ok: true, moved: 0 };
    const local = createEncryptedTokenVault({ storage, secret });
    const openAiEntry = `ai.provider.${encodeURIComponent(principal)}.openai`;
    let moved = 0;
    for (const { entry_id: entryId, metadata } of local.list().items.filter((item) => ownedBy(principal)(item.entry_id))) {
        const record = await local.read(entryId);
        if (entryId === openAiEntry) {
            const key = String(record.value?.apiKey ?? record.value ?? '').trim();
            // A key the provider refuses opens nothing anywhere: it is not carried over.
            if (key) await request('credential.store', { key }, { expectedPrincipal: principal }).catch((error) => {
                if (error?.message !== 'invalid_api_key') throw error;
            });
        } else await security.storeToken(entryId, record.value, metadata);
        local.remove(entryId);
        moved += 1;
    }
    if (!local.list().items.some((item) => ownedBy(principal)(item.entry_id))) storage.removeItem(deviceKeyId(principal));
    return { ok: true, moved };
};
