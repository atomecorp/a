import { loadRuntimeUserProfile } from './profile_loader.js';
import { AI_PROVIDER_DEFINITIONS, resolveOpenAiCredentialStatus } from './provider_client.js';

// The main assistant has a fixed provider; the general provider picker remains independent.
export const resolveAssistantProviderConfig = async ({
    env = globalThis, loadProfile = () => loadRuntimeUserProfile({ env }),
    credentialStatus = resolveOpenAiCredentialStatus, ...options
} = {}) => {
    const profile = await loadProfile();
    if (!profile?.ok) return { ok: false, providerId: 'openai', error: profile?.error || 'profile_loader_failed' };
    const userId = String(profile.userId || profile.user_id || '').trim();
    if (!userId) return { ok: false, providerId: 'openai', error: 'ai_profile_user_id_missing' };
    try {
        const status = await credentialStatus({ ...options, env, userId });
        if (typeof status?.configured !== 'boolean') throw new Error('provider_credential_status_invalid');
        if (status.configured === false) return { ok: false, providerId: 'openai', error: 'no_ai_key_configured' };
        const metadata = profile.profile?.passkeys?.keys?.find(entry => entry.provider === 'openai');
        return { ok: true, providerId: 'openai', provider: AI_PROVIDER_DEFINITIONS.openai,
            serverManaged: true, model: metadata?.model || AI_PROVIDER_DEFINITIONS.openai.models[0],
            source: 'assistant.openai+server_vault' };
    } catch (error) {
        // `link_reason` says why the host relay could not relink (a remote
        // session to sign in again); it is the half the user can act on.
        return { ok: false, providerId: 'openai', error: error.link_reason || error.message };
    }
};
