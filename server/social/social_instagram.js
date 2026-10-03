import { createReadStream } from 'node:fs';
import { SocialError, delay, formBody, socialFetch } from './social_http.js';

// Instagram API with Instagram Login (Business Login for Instagram), v25.0.
// Only professional accounts (Business or Media_Creator) can authorize it;
// personal accounts have no publishing API and use the system share sheet.
const AUTHORIZE = 'https://www.instagram.com/oauth/authorize';
const TOKEN = 'https://api.instagram.com/oauth/access_token';
const GRAPH = 'https://graph.instagram.com';
const VERSION = 'v25.0';
const RUPLOAD = 'https://rupload.facebook.com/ig-api-upload';
const SCOPES = ['instagram_business_basic', 'instagram_business_content_publish'];
const DAY = 86_400_000;
const scopesOf = (value) => (Array.isArray(value) ? value : String(value || '').split(',')).map((scope) => String(scope).trim()).filter(Boolean);
const graph = (path, params = {}) => `${GRAPH}/${VERSION}/${path}?${new URLSearchParams(params)}`;

export const instagramAdapter = {
    network: 'instagram',
    configured: (config) => Boolean(config.INSTAGRAM_APP_ID && config.INSTAGRAM_APP_SECRET),
    scopes: () => SCOPES,
    authorizeUrl({ config, state, redirectUri }) {
        const url = new URL(AUTHORIZE);
        url.search = new URLSearchParams({ client_id: config.INSTAGRAM_APP_ID, redirect_uri: redirectUri,
            response_type: 'code', scope: SCOPES.join(','), state }).toString();
        return url.toString();
    },
    async exchange({ config, code, redirectUri, fetchImpl, now = Date.now() }) {
        const short = await socialFetch(fetchImpl, TOKEN, { method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: formBody({ client_id: config.INSTAGRAM_APP_ID, client_secret: config.INSTAGRAM_APP_SECRET,
                grant_type: 'authorization_code', redirect_uri: redirectUri, code }) });
        const granted = Array.isArray(short?.data) ? short.data[0] : short;
        if (!granted?.access_token) throw new SocialError('social_provider_rejected');
        const long = await socialFetch(fetchImpl, `${GRAPH}/access_token?${new URLSearchParams({
            grant_type: 'ig_exchange_token', client_secret: config.INSTAGRAM_APP_SECRET, access_token: granted.access_token })}`);
        if (!long?.access_token) throw new SocialError('social_provider_rejected');
        const me = await socialFetch(fetchImpl, graph('me', { fields: 'user_id,username,name,account_type,profile_picture_url', access_token: long.access_token }));
        if (!me?.user_id) throw new SocialError('social_provider_rejected');
        return { network: 'instagram', access_token: long.access_token, issued_at: now,
            expires_at: now + (Number(long.expires_in) || 0) * 1000, scopes: scopesOf(granted.permissions),
            identity: { id: String(me.user_id), username: String(me.username || ''), display_name: String(me.name || ''),
                account_type: String(me.account_type || ''), avatar_url: String(me.profile_picture_url || '') }, connected_at: now };
    },
    // A long-lived token lasts 60 days and can be refreshed once it is 24 h old.
    needsRefresh: (record, now = Date.now()) => now - record.issued_at > DAY && record.expires_at - now < 7 * DAY,
    async refresh({ record, fetchImpl, now = Date.now() }) {
        if (now >= record.expires_at) throw new SocialError('social_session_expired');
        const body = await socialFetch(fetchImpl, `${GRAPH}/refresh_access_token?${new URLSearchParams({
            grant_type: 'ig_refresh_token', access_token: record.access_token })}`);
        if (!body?.access_token) throw new SocialError('social_session_expired');
        return { ...record, access_token: body.access_token, issued_at: now, expires_at: now + (Number(body.expires_in) || 0) * 1000 };
    },
    revoke: null,
    async describe({ config }) {
        return { public_media: Boolean(config.SOCIAL_PUBLIC_BASE_URL) };
    },
    async publish(ctx) {
        const { record, media, text, fetchImpl, signal } = ctx;
        const igId = record.identity.id;
        if (ctx.remote?.container_id) return instagramAdapter.finish(ctx);
        const fields = media.kind === 'video'
            ? { media_type: 'REELS', upload_type: 'resumable', caption: text }
            : { image_url: media.publicUrl, caption: text };
        if (media.kind === 'image' && !media.publicUrl) throw new SocialError('social_public_media_url_unavailable');
        const container = await socialFetch(fetchImpl, `${GRAPH}/${VERSION}/${igId}/media`, { method: 'POST', signal,
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: formBody({ ...fields, access_token: record.access_token }) });
        const containerId = String(container?.id || '');
        if (!containerId) throw new SocialError('social_provider_rejected');
        await ctx.accepted({ container_id: containerId });
        if (media.kind === 'video') {
            await socialFetch(fetchImpl, `${RUPLOAD}/${VERSION}/${containerId}`, { method: 'POST', signal, duplex: 'half',
                headers: { Authorization: `OAuth ${record.access_token}`, offset: '0', file_size: String(media.size) },
                body: createReadStream(media.path) });
            ctx.progress?.(1);
        }
        return instagramAdapter.finish({ ...ctx, remote: { container_id: containerId } });
    },
    // Waits for the container, then publishes it. Called again by `status` when
    // a long video was still processing at the end of the first attempt.
    async finish(ctx) {
        const { record, fetchImpl, signal, remote } = ctx;
        const attempts = ctx.pollAttempts ?? 120;
        for (let attempt = 0; attempt < attempts; attempt += 1) {
            const state = await containerStatus(ctx);
            if (state === 'PUBLISHED') return { status: 'published', remote };
            if (state === 'ERROR' || state === 'EXPIRED') return { status: 'failed', remote, error: 'social_provider_rejected', provider_code: state };
            if (state === 'FINISHED') {
                await ctx.publishing?.(remote);
                const published = await socialFetch(fetchImpl, `${GRAPH}/${VERSION}/${record.identity.id}/media_publish`, {
                    method: 'POST', signal, headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: formBody({ creation_id: remote.container_id, access_token: record.access_token }) }, { reaches: true });
                const mediaId = String(published?.id || '');
                // The post is live at this point: a failed permalink read only loses the link.
                const permalink = mediaId ? await socialFetch(fetchImpl, graph(mediaId, { fields: 'permalink', access_token: record.access_token }), { signal })
                    .then((body) => body?.permalink || null).catch(() => null) : null;
                return { status: 'published', remote: { ...remote, media_id: mediaId || null }, url: permalink };
            }
            await delay(ctx.pollIntervalMs ?? 5000, signal);
        }
        return { status: 'remote_processing', remote };
    },
    async status(ctx) {
        const state = await containerStatus(ctx);
        if (state === 'PUBLISHED') return { status: 'published', remote: ctx.remote };
        if (state === 'ERROR' || state === 'EXPIRED') return { status: 'failed', remote: ctx.remote, error: 'social_provider_rejected', provider_code: state };
        // An unconfirmed delivery is only verified here. A container still
        // FINISHED was never published (a container publishes once), so the
        // delivery becomes retryable and the retry reuses this same container.
        if (state === 'FINISHED' && ctx.verifyOnly) return { status: 'failed', remote: ctx.remote, error: 'social_provider_unavailable' };
        if (state === 'FINISHED') return instagramAdapter.finish({ ...ctx, pollAttempts: 1 });
        return { status: ctx.verifyOnly ? 'unconfirmed' : 'remote_processing', remote: ctx.remote };
    }
};

async function containerStatus({ record, remote, fetchImpl, signal }) {
    const body = await socialFetch(fetchImpl, graph(remote.container_id, { fields: 'status_code', access_token: record.access_token }), { signal });
    return String(body?.status_code || '');
}
