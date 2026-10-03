import { SOCIAL_NETWORKS } from '../../atome/src/squirrel/social/contracts.js';
import { SOCIAL_CONFIG_KEYS } from '../auth_secret_config.js';
import { tiktokAdapter } from './social_tiktok.js';
import { instagramAdapter } from './social_instagram.js';
import { facebookAdapter } from './social_facebook.js';
import { SocialError } from './social_http.js';
import { awaitSocialAuthorization, cancelSocialAuthorization, startSocialAuthorization } from './social_oauth.js';

// Social sessions of one atome principal: the provider tokens live only in that
// principal's encrypted server vault (`social.<network>` records); the client
// only ever receives the public view built here.
export const SOCIAL_ADAPTERS = Object.freeze({ tiktok: tiktokAdapter, instagram: instagramAdapter, facebook: facebookAdapter });

export const readSocialConfig = (env = process.env) => Object.fromEntries(SOCIAL_CONFIG_KEYS.map((key) => [key, String(env[key] || '')]));

const recordName = (network) => `social.${network}`;
const assertNetwork = (network) => {
    if (!SOCIAL_NETWORKS.includes(network)) throw new SocialError('social_request_invalid');
    return SOCIAL_ADAPTERS[network];
};
const configured = (adapter, config) => adapter.configured(config) && /^https:\/\//.test(config.SOCIAL_PUBLIC_BASE_URL);

// A usable session or the reason there is none. An access token about to expire
// is refreshed (and stored) here, the only place a refresh happens.
export async function loadSocialSession(network, { vault, config, fetchImpl, now = Date.now() }) {
    const adapter = assertNetwork(network);
    let record = await vault.readRecord(recordName(network));
    if (!record) return { adapter, record: null, state: 'disconnected' };
    if (adapter.needsRefresh(record, now)) {
        try {
            record = await adapter.refresh({ config, record, fetchImpl, now });
            await vault.storeRecord(recordName(network), record);
        } catch (error) {
            if (error?.code === 'social_session_expired') return { adapter, record, state: 'expired' };
            throw error;
        }
    }
    if (record.expires_at && now >= record.expires_at) return { adapter, record, state: 'expired' };
    return { adapter, record, state: 'connected' };
}

export async function describeSocialSession(session, { config, fetchImpl }) {
    if (session.state !== 'connected') return {};
    try { return await session.adapter.describe({ config, record: session.record, fetchImpl }); }
    catch (error) {
        if (error?.code === 'social_session_expired') { session.state = 'expired'; return {}; }
        return { describe_error: error?.code || 'social_provider_unavailable' };
    }
}

export async function socialAccountView(network, ctx) {
    const adapter = assertNetwork(network);
    if (!configured(adapter, ctx.config)) return { network, configured: false, state: 'not_configured' };
    const session = await loadSocialSession(network, ctx).catch((error) => ({
        adapter, record: null, state: 'disconnected', error: error?.code || 'social_provider_unavailable' }));
    const extra = await describeSocialSession(session, ctx);
    const { record } = session;
    return { network, configured: true, state: session.state, ...(session.error ? { error: session.error } : {}),
        identity: record?.identity || null, scopes: record?.scopes || [], expires_at: record?.expires_at || null,
        ...(network === 'facebook' && record ? { pages: facebookAdapter.publicPages(record) } : {}), ...extra };
}

export async function listSocialAccounts(ctx) {
    const entries = await Promise.all(SOCIAL_NETWORKS.map(async (network) => [network, await socialAccountView(network, ctx)]));
    return Object.fromEntries(entries);
}

export function startSocialConnection({ network, principal, ctx }) {
    const adapter = assertNetwork(network);
    if (!configured(adapter, ctx.config)) throw new SocialError('social_not_configured');
    const { vault, config, fetchImpl } = ctx;
    return startSocialAuthorization({ principal, network, adapter, config,
        // Runs in the OAuth callback, bound to the principal that started it.
        complete: async (code, redirectUri) => {
            const record = await adapter.exchange({ config, code, redirectUri, fetchImpl });
            await vault.storeRecord(recordName(network), record);
            return socialAccountView(network, ctx);
        } });
}

export const awaitSocialConnection = ({ principal, attemptId, signal }) => awaitSocialAuthorization({ principal, attemptId, signal });
export const cancelSocialConnection = ({ principal, attemptId }) => cancelSocialAuthorization({ principal, attemptId });

// The tokens are deleted from atome in every case; revocation at the provider
// is attempted where it is documented and its outcome reported, not hidden.
export async function disconnectSocialAccount(network, { vault, config, fetchImpl }) {
    const adapter = assertNetwork(network);
    const record = await vault.readRecord(recordName(network));
    let revoked = adapter.revoke ? false : null;
    if (record && adapter.revoke && adapter.configured(config)) {
        revoked = await adapter.revoke({ config, record, fetchImpl }).then(() => true, () => false);
    }
    vault.removeRecord(recordName(network));
    return { network, state: 'disconnected', provider_revoked: revoked };
}
