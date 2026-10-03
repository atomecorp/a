import { readFile, stat } from 'node:fs/promises';
import { SocialError, formBody, socialFetch } from './social_http.js';

// Facebook Login (manual flow) + Pages API + Video API resumable upload, v25.0.
// Publishing exists for Pages the user administers only: a personal profile
// has no publishing API (it is offered the share sheet or copied text instead).
const VERSION = 'v25.0';
const DIALOG = `https://www.facebook.com/${VERSION}/dialog/oauth`;
const GRAPH = `https://graph.facebook.com/${VERSION}`;
const GRAPH_VIDEO = `https://graph-video.facebook.com/${VERSION}`;
const SCOPES = ['pages_show_list', 'pages_read_engagement', 'pages_manage_posts'];
const query = (params) => new URLSearchParams(params).toString();

const pageOf = (record, pageId) => {
    const page = (record.pages || []).find((entry) => entry.id === pageId);
    if (!page) throw new SocialError('social_destination_invalid');
    if (!page.access_token || !page.tasks.includes('CREATE_CONTENT')) throw new SocialError('social_permission_missing');
    return page;
};

export const facebookAdapter = {
    network: 'facebook',
    configured: (config) => Boolean(config.FACEBOOK_APP_ID && config.FACEBOOK_APP_SECRET),
    scopes: () => SCOPES,
    authorizeUrl({ config, state, redirectUri }) {
        return `${DIALOG}?${query({ client_id: config.FACEBOOK_APP_ID, redirect_uri: redirectUri, state,
            response_type: 'code', scope: SCOPES.join(',') })}`;
    },
    async exchange({ config, code, redirectUri, fetchImpl, now = Date.now() }) {
        const short = await socialFetch(fetchImpl, `${GRAPH}/oauth/access_token?${query({ client_id: config.FACEBOOK_APP_ID,
            redirect_uri: redirectUri, client_secret: config.FACEBOOK_APP_SECRET, code })}`);
        // A long-lived user token (~60 days); the Page tokens read with it do not expire.
        const long = await socialFetch(fetchImpl, `${GRAPH}/oauth/access_token?${query({ grant_type: 'fb_exchange_token',
            client_id: config.FACEBOOK_APP_ID, client_secret: config.FACEBOOK_APP_SECRET, fb_exchange_token: short?.access_token || '' })}`);
        if (!long?.access_token) throw new SocialError('social_provider_rejected');
        const token = long.access_token;
        const [me, permissions, accounts] = await Promise.all([
            socialFetch(fetchImpl, `${GRAPH}/me?${query({ fields: 'id,name', access_token: token })}`),
            socialFetch(fetchImpl, `${GRAPH}/me/permissions?${query({ access_token: token })}`),
            socialFetch(fetchImpl, `${GRAPH}/me/accounts?${query({ fields: 'id,name,access_token,tasks', access_token: token })}`)
        ]);
        if (!me?.id) throw new SocialError('social_provider_rejected');
        return { network: 'facebook', access_token: token,
            expires_at: long.expires_in ? now + Number(long.expires_in) * 1000 : null,
            scopes: (permissions?.data || []).filter((entry) => entry.status === 'granted').map((entry) => String(entry.permission)),
            identity: { id: String(me.id), display_name: String(me.name || '') },
            pages: (accounts?.data || []).map((page) => ({ id: String(page.id), name: String(page.name || ''),
                access_token: String(page.access_token || ''), tasks: Array.isArray(page.tasks) ? page.tasks.map(String) : [] })),
            connected_at: now };
    },
    // No refresh grant exists for user tokens: an expired session reconnects.
    needsRefresh: () => false,
    async refresh() { throw new SocialError('social_session_expired'); },
    async revoke({ record, fetchImpl }) {
        await socialFetch(fetchImpl, `${GRAPH}/me/permissions?${query({ access_token: record.access_token })}`, { method: 'DELETE' });
    },
    async describe() { return {}; },
    publicPages: (record) => (record.pages || []).map((page) => ({ id: page.id, name: page.name, can_post: page.tasks.includes('CREATE_CONTENT') })),
    async publish(ctx) {
        const { record, plan, media, text, fetchImpl, signal } = ctx;
        const page = pageOf(record, plan.destination.split(':')[2]);
        if (!media) {
            await ctx.publishing?.({});
            const post = await socialFetch(fetchImpl, `${GRAPH}/${page.id}/feed`, { method: 'POST', signal,
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: formBody({ message: text, access_token: page.access_token }) }, { reaches: true });
            return published(ctx, page, { post_id: String(post?.id || '') });
        }
        if (media.kind === 'image') {
            const form = new FormData();
            form.append('source', new Blob([await readFile(media.path)], { type: media.mime }), media.name);
            if (text) form.append('caption', text);
            form.append('access_token', page.access_token);
            await ctx.publishing?.({});
            const photo = await socialFetch(fetchImpl, `${GRAPH}/${page.id}/photos`, { method: 'POST', signal, body: form }, { reaches: true });
            return published(ctx, page, { photo_id: String(photo?.id || ''), post_id: String(photo?.post_id || '') });
        }
        const size = (await stat(media.path)).size;
        const session = await socialFetch(fetchImpl, `${GRAPH}/${ctx.config.FACEBOOK_APP_ID}/uploads?${query({
            file_name: media.name, file_length: String(size), file_type: media.mime, access_token: record.access_token })}`, { method: 'POST', signal });
        if (!String(session?.id || '').startsWith('upload:')) throw new SocialError('social_provider_rejected');
        const uploaded = await socialFetch(fetchImpl, `${GRAPH}/${session.id}`, { method: 'POST', signal,
            headers: { Authorization: `OAuth ${record.access_token}`, file_offset: '0' }, body: await readFile(media.path) });
        if (!uploaded?.h) throw new SocialError('social_provider_rejected');
        ctx.progress?.(1);
        await ctx.publishing?.({});
        const video = await socialFetch(fetchImpl, `${GRAPH_VIDEO}/${page.id}/videos`, { method: 'POST', signal,
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: formBody({ description: text || undefined, fbuploader_video_file_chunk: uploaded.h, access_token: page.access_token }) }, { reaches: true });
        const videoId = String(video?.id || '');
        if (!videoId) throw new SocialError('social_provider_rejected', { reached: true });
        await ctx.accepted({ video_id: videoId, page_id: page.id });
        return facebookAdapter.status({ ...ctx, remote: { video_id: videoId, page_id: page.id } });
    },
    async status({ record, remote, fetchImpl, signal }) {
        if (!remote.video_id) return { status: remote.post_id ? 'published' : 'unconfirmed', remote };
        const page = pageOf(record, remote.page_id);
        const body = await socialFetch(fetchImpl, `${GRAPH}/${remote.video_id}?${query({ fields: 'status', access_token: page.access_token })}`, { signal });
        const state = String(body?.status?.video_status || '');
        if (state === 'ready') return { status: 'published', remote };
        if (state === 'error' || state === 'expired') return { status: 'failed', remote, error: 'social_provider_rejected', provider_code: state };
        return { status: 'remote_processing', remote };
    }
};

async function published({ fetchImpl, signal }, page, remote) {
    const id = remote.post_id || remote.photo_id;
    if (!id) throw new SocialError('social_provider_rejected', { reached: true });
    // The post exists at this point: a failed permalink read only loses the link.
    const url = await socialFetch(fetchImpl, `${GRAPH}/${id}?${query({ fields: 'permalink_url', access_token: page.access_token })}`, { signal })
        .then((body) => body?.permalink_url || null).catch(() => null);
    return { status: 'published', remote: { ...remote, page_id: page.id }, url };
}
