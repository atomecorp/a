import { loadRuntimeUserProfile } from './profile_loader.js';
import { AI_PROVIDER_DEFINITIONS, resolveOpenAiCredentialStatus } from './provider_client.js';
import { getSessionState } from '../apis/unified/adole_api/session.js';

const ASSISTANT_PROVIDER = Object.freeze({ ok: true, providerId: 'openai', provider: AI_PROVIDER_DEFINITIONS.openai,
    serverManaged: true, source: 'assistant.openai+server_vault' });

// The account's own key, held by the server vault: `null` once it is there,
// otherwise the failure the caller returns.
const requireAccountKey = async ({ userId, credentialStatus, env, options }) => {
    try {
        const status = await credentialStatus({ ...options, env, userId });
        if (typeof status?.configured !== 'boolean') throw new Error('provider_credential_status_invalid');
        return status.configured ? null : { ok: false, providerId: 'openai', error: 'no_ai_key_configured' };
    } catch (error) {
        // `link_reason` says why the host relay could not relink (a remote
        // session to sign in again); it is the half the user can act on.
        return { ok: false, providerId: 'openai', error: error.link_reason || error.message };
    }
};

// The main assistant has a fixed provider; the general provider picker remains independent.
export const resolveAssistantProviderConfig = async ({
    env = globalThis, loadProfile = () => loadRuntimeUserProfile({ env }),
    credentialStatus = resolveOpenAiCredentialStatus, ...options
} = {}) => {
    const profile = await loadProfile();
    if (!profile?.ok) return { ok: false, providerId: 'openai', error: profile?.error || 'profile_loader_failed' };
    const userId = String(profile.userId || profile.user_id || '').trim();
    if (!userId) return { ok: false, providerId: 'openai', error: 'ai_profile_user_id_missing' };
    const refused = await requireAccountKey({ userId, credentialStatus, env, options });
    if (refused) return refused;
    const metadata = profile.profile?.passkeys?.keys?.find(entry => entry.provider === 'openai');
    return { ...ASSISTANT_PROVIDER, model: metadata?.model || AI_PROVIDER_DEFINITIONS.openai.models[0] };
};

// The voice session uses the account's key and nothing of its profile (its model is
// the voice model): it no longer waits for the profile read, which queued behind the
// launch's store work for seconds before the key was even asked for.
export const resolveAssistantVoiceAccess = async ({
    env = globalThis, principal = () => getSessionState()?.user?.id,
    credentialStatus = resolveOpenAiCredentialStatus, ...options
} = {}) => {
    const userId = String(principal() || '').trim();
    if (!userId) return { ok: false, providerId: 'openai', error: 'ai_profile_user_id_missing' };
    return await requireAccountKey({ userId, credentialStatus, env, options }) || ASSISTANT_PROVIDER;
};
