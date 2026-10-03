import { open } from 'node:fs/promises';
import { SocialError, delay, formBody, socialFetch } from './social_http.js';
import { SOCIAL_MEDIA_CONSTRAINTS, TIKTOK_PRIVACY_LEVELS, utf16Length } from '../../atome/src/squirrel/social/contracts.js';

// TikTok Login Kit (web) + Content Posting API v2, as documented on
// developers.tiktok.com (Login Kit for Web, Content Posting API reference).
const AUTHORIZE = 'https://www.tiktok.com/v2/auth/authorize/';
const API = 'https://open.tiktokapis.com';
const MIN_CHUNK = 5 * 1024 * 1024;
const CHUNK = 10 * 1024 * 1024;
const LIMITS = SOCIAL_MEDIA_CONSTRAINTS.tiktok;
const bearer = (record) => ({ Authorization: `Bearer ${record.access_token}`, 'Content-Type': 'application/json; charset=UTF-8' });
const scopesOf = (value) => String(value || '').split(',').map((scope) => scope.trim()).filter(Boolean);

export const tiktokAdapter = {
    network: 'tiktok',
    configured: (config) => Boolean(config.TIKTOK_CLIENT_KEY && config.TIKTOK_CLIENT_SECRET),
    // Direct Post (`video.publish`) needs TikTok's product approval; without it
    // the official route left is the inbox upload finished in the TikTok app.
    scopes: (config) => ['user.info.basic', 'video.upload', ...(config.TIKTOK_DIRECT_POST === '0' ? [] : ['video.publish'])],
    authorizeUrl({ config, state, redirectUri }) {
        const url = new URL(AUTHORIZE);
        url.search = new URLSearchParams({ client_key: config.TIKTOK_CLIENT_KEY, response_type: 'code',
            scope: tiktokAdapter.scopes(config).join(','), redirect_uri: redirectUri, state }).toString();
        return url.toString();
    },
    async exchange({ config, code, redirectUri, fetchImpl, now = Date.now() }) {
        const token = await socialFetch(fetchImpl, `${API}/v2/oauth/token/`, {
            method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: formBody({ client_key: config.TIKTOK_CLIENT_KEY, client_secret: config.TIKTOK_CLIENT_SECRET,
                code, grant_type: 'authorization_code', redirect_uri: redirectUri })
        });
        const record = tokenRecord(token, now);
        const info = await socialFetch(fetchImpl, `${API}/v2/user/info/?fields=open_id,avatar_url,display_name`, { headers: bearer(record) });
        const user = info?.data?.user || {};
        if (!user.open_id || user.open_id !== record.identity.id) throw new SocialError('social_provider_rejected');
        record.identity = { id: user.open_id, display_name: String(user.display_name || ''), avatar_url: String(user.avatar_url || '') };
        return record;
    },
    async refresh({ config, record, fetchImpl, now = Date.now() }) {
        if (!record.refresh_token || now >= record.refresh_expires_at) throw new SocialError('social_session_expired');
        const token = await socialFetch(fetchImpl, `${API}/v2/oauth/token/`, {
            method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: formBody({ client_key: config.TIKTOK_CLIENT_KEY, client_secret: config.TIKTOK_CLIENT_SECRET,
                grant_type: 'refresh_token', refresh_token: record.refresh_token })
        });
        return { ...tokenRecord(token, now), identity: record.identity, connected_at: record.connected_at };
    },
    needsRefresh: (record, now = Date.now()) => now >= record.expires_at - 60_000,
    async revoke({ config, record, fetchImpl }) {
        await socialFetch(fetchImpl, `${API}/v2/oauth/revoke/`, {
            method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: formBody({ client_key: config.TIKTOK_CLIENT_KEY, client_secret: config.TIKTOK_CLIENT_SECRET, token: record.access_token })
        });
    },
    // The upload page must name the creator and offer exactly the privacy levels
    // TikTok returns for them; an unaudited client may only post SELF_ONLY.
    async describe({ config, record, fetchImpl }) {
        const view = { photo_pull: config.TIKTOK_PULL_FROM_URL_VERIFIED === '1' && Boolean(config.SOCIAL_PUBLIC_BASE_URL),
            audited: config.TIKTOK_AUDITED === '1', creator: null };
        if (!record.scopes.includes('video.publish')) return view;
        const info = await socialFetch(fetchImpl, `${API}/v2/post/publish/creator_info/query/`, { method: 'POST', headers: bearer(record), body: '{}' });
        const data = info?.data || {};
        const offered = (data.privacy_level_options || []).filter((level) => TIKTOK_PRIVACY_LEVELS.includes(level));
        view.creator = {
            username: String(data.creator_username || ''), nickname: String(data.creator_nickname || ''),
            privacy_level_options: view.audited ? offered : offered.filter((level) => level === 'SELF_ONLY'),
            comment_disabled: data.comment_disabled === true, duet_disabled: data.duet_disabled === true,
            stitch_disabled: data.stitch_disabled === true,
            max_video_post_duration_sec: Number(data.max_video_post_duration_sec) || LIMITS.video.maxDuration
        };
        return view;
    },
    async publish(ctx) {
        const { plan, media, text, options = {}, view } = ctx;
        const direct = plan.route === 'direct';
        const postInfo = direct ? directPostInfo(options, view, media.kind) : null;
        if (media.kind === 'video') {
            if (utf16Length(text) > LIMITS.caption.video) throw new SocialError('social_media_constraint', { detail: 'caption_too_long' });
            if (direct && media.probe.duration > (view.creator?.max_video_post_duration_sec || LIMITS.video.maxDuration)) {
                throw new SocialError('social_media_constraint', { detail: 'duration_above_creator_limit' });
            }
            const chunks = chunkPlan(media.size);
            const init = await socialFetch(ctx.fetchImpl, `${API}/v2/post/publish/${direct ? 'video' : 'inbox/video'}/init/`, {
                method: 'POST', headers: bearer(ctx.record), signal: ctx.signal,
                body: JSON.stringify({ ...(direct ? { post_info: { ...postInfo, title: text } } : {}),
                    source_info: { source: 'FILE_UPLOAD', video_size: media.size, chunk_size: chunks.size, total_chunk_count: chunks.count } })
            });
            const publishId = String(init?.data?.publish_id || '');
            if (!publishId || !init?.data?.upload_url) throw new SocialError('social_provider_rejected');
            await ctx.accepted({ publish_id: publishId });
            await uploadChunks({ ...ctx, uploadUrl: init.data.upload_url, chunks });
            return waitForStatus({ ...ctx, remote: { publish_id: publishId } });
        }
        if (utf16Length(text) > LIMITS.caption.photoDescription) throw new SocialError('social_media_constraint', { detail: 'caption_too_long' });
        if (!media.publicUrl) throw new SocialError('social_public_media_url_unavailable');
        // A single request both transfers and posts: a lost answer is unconfirmed.
        const init = await socialFetch(ctx.fetchImpl, `${API}/v2/post/publish/content/init/`, {
            method: 'POST', headers: bearer(ctx.record), signal: ctx.signal,
            body: JSON.stringify({ post_info: { ...(postInfo || {}), description: text },
                source_info: { source: 'PULL_FROM_URL', photo_images: [media.publicUrl], photo_cover_index: 0 },
                post_mode: direct ? 'DIRECT_POST' : 'MEDIA_UPLOAD', media_type: 'PHOTO' })
        }, { reaches: true });
        const publishId = String(init?.data?.publish_id || '');
        if (!publishId) throw new SocialError('social_provider_rejected', { reached: true });
        await ctx.accepted({ publish_id: publishId });
        return waitForStatus({ ...ctx, remote: { publish_id: publishId } });
    },
    async status({ record, remote, fetchImpl, signal, view }) {
        const body = await socialFetch(fetchImpl, `${API}/v2/post/publish/status/fetch/`, {
            method: 'POST', headers: bearer(record), signal, body: JSON.stringify({ publish_id: remote.publish_id })
        });
        const data = body?.data || {};
        if (data.status === 'PUBLISH_COMPLETE') {
            const postId = (data.publicaly_available_post_id || [])[0];
            const username = view?.creator?.username;
            return { status: 'published', remote: { ...remote, post_id: postId ? String(postId) : null },
                url: postId && username ? `https://www.tiktok.com/@${username}/video/${postId}` : null };
        }
        if (data.status === 'SEND_TO_USER_INBOX') return { status: 'handed_off', remote };
        if (data.status === 'FAILED') {
            const reason = String(data.fail_reason || '');
            return { status: 'failed', remote, error: reason === 'auth_removed' ? 'social_session_expired' : 'social_provider_rejected', provider_code: reason || null };
        }
        return { status: 'remote_processing', remote };
    }
};

function tokenRecord(token, now) {
    if (!token?.access_token || !token?.open_id) throw new SocialError('social_provider_rejected');
    return { network: 'tiktok', access_token: token.access_token, refresh_token: token.refresh_token || null,
        expires_at: now + (Number(token.expires_in) || 0) * 1000,
        refresh_expires_at: now + (Number(token.refresh_expires_in) || 0) * 1000,
        scopes: scopesOf(token.scope), identity: { id: token.open_id }, connected_at: now };
}

// Required UX (TikTok content sharing guidelines): the privacy level is chosen
// explicitly from the creator's options, interactions are opt-in.
function directPostInfo(options, view, kind) {
    const allowed = view?.creator?.privacy_level_options || [];
    if (!options.privacy_level || !allowed.includes(options.privacy_level)) throw new SocialError('social_option_required', { detail: 'privacy_level' });
    const info = { privacy_level: options.privacy_level, disable_comment: options.disable_comment !== false || view.creator.comment_disabled };
    if (kind === 'video') {
        info.disable_duet = options.disable_duet !== false || view.creator.duet_disabled;
        info.disable_stitch = options.disable_stitch !== false || view.creator.stitch_disabled;
    }
    if (options.brand_content_toggle === true && info.privacy_level === 'SELF_ONLY') {
        throw new SocialError('social_option_required', { detail: 'branded_content_visibility' });
    }
    info.brand_content_toggle = options.brand_content_toggle === true;
    info.brand_organic_toggle = options.brand_organic_toggle === true;
    return info;
}

// Media transfer guide: chunks of 5–64 MB, a video under 5 MB is one chunk, the
// last chunk absorbs the remainder (up to 128 MB), at most 1000 chunks.
export function chunkPlan(size) {
    if (size < MIN_CHUNK) return { size, count: 1 };
    const count = Math.floor(size / CHUNK);
    if (count > 1000) throw new SocialError('social_media_constraint', { detail: 'file_too_large' });
    return { size: CHUNK, count };
}

async function uploadChunks({ fetchImpl, signal, uploadUrl, chunks, media, progress }) {
    const handle = await open(media.path, 'r');
    try {
        for (let index = 0; index < chunks.count; index += 1) {
            const start = index * chunks.size;
            const end = index === chunks.count - 1 ? media.size - 1 : start + chunks.size - 1;
            const bytes = Buffer.alloc(end - start + 1);
            await handle.read(bytes, 0, bytes.length, start);
            // Once the last chunk may have arrived, TikTok can publish: a lost
            // answer from that point on is unconfirmed, not retryable.
            await socialFetch(fetchImpl, uploadUrl, { method: 'PUT', signal, body: bytes, headers: {
                'Content-Type': media.mime, 'Content-Length': String(bytes.length),
                'Content-Range': `bytes ${start}-${end}/${media.size}` } }, { reaches: index === chunks.count - 1 });
            progress?.((end + 1) / media.size);
        }
    } finally { await handle.close(); }
}

async function waitForStatus(ctx) {
    const attempts = ctx.pollAttempts ?? 30;
    const intervalMs = ctx.pollIntervalMs ?? 3000;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
        const result = await tiktokAdapter.status(ctx);
        if (result.status !== 'remote_processing') return result;
        await delay(intervalMs, ctx.signal);
    }
    return { status: 'remote_processing', remote: ctx.remote };
}
