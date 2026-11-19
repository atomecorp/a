// Pure route planning, shared by the reference server (which decides) and the client (which renders); the
// atome-server's `providers/social/plan.rs` follows the same rules. It only reads the public account view —
// never a token: `networks` is `social.accounts`' answer, `[{ network, configured, accounts: [{ account, state,
// scopes, pages? }] }]`.
//
// Official possibilities this encodes (what each network takes: SOCIAL_NETWORK_CONTENT):
// - TikTok: video by FILE_UPLOAD, Direct Post (`video.publish`) or inbox upload
//   finished in the app (`video.upload`); photos only by PULL_FROM_URL from a
//   domain verified in the TikTok developer portal; no text-only post.
// - Instagram: API publishing only for professional accounts (Business or
//   Media_Creator) with `instagram_business_content_publish`; images JPEG from a
//   public URL; no text-only post. A personal account gets the system share.
// - Facebook: a Page the user administers (`pages_manage_posts` + CREATE_CONTENT
//   task) accepts text, photo and video; a personal profile has no publishing
//   API, so only the share sheet or copied text + the official site remain.
// - Threads: text, images and videos pulled from a public URL (`threads_content_publish`).
// - YouTube: videos only (`youtube.upload`); a text or an image is skipped and named.
// - LinkedIn: the member's own posts (`w_member_social`).
// - Bluesky, Mastodon, Telegram (a bot in a channel), Discord (a channel's webhook): text,
//   image, video, uploaded by the server.
//
// A destination names an account (`<network>:<account>`, R-190); the bare network (`tiktok`,
// `instagram`, ...) is its first enabled account; Facebook keeps `facebook:page:<id>` and
// `facebook:profile`.
import { SOCIAL_MEDIA_CONSTRAINTS, SOCIAL_NETWORK_CONTENT, SOCIAL_NETWORKS } from './contracts.js';

const SIGNATURES = [
    ['image/png', (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47],
    ['image/jpeg', (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff],
    ['image/gif', (b) => b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46],
    ['image/webp', (b) => ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 12) === 'WEBP'],
    ['video/webm', (b) => b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3],
    ['video/quicktime', (b) => ascii(b, 4, 8) === 'ftyp' && ascii(b, 8, 10) === 'qt'],
    ['video/mp4', (b) => ascii(b, 4, 8) === 'ftyp']
];
const ascii = (bytes, start, end) => String.fromCharCode(...bytes.subarray(start, end));

// The real type from the first bytes; the file name or a declared MIME is
// never trusted. Returns null for anything that is not a supported image/video.
export const sniffMediaMime = (bytes) => {
    const head = bytes instanceof Uint8Array ? bytes.subarray(0, 16) : new Uint8Array(0);
    if (head.length < 12) return null;
    return SIGNATURES.find(([, test]) => test(head))?.[0] || null;
};

const has = (account, scope) => Array.isArray(account?.scopes) && account.scopes.includes(scope);
const connected = (account) => account?.state === 'connected';
const failed = (error) => ({ route: null, error, notes: [] });

// The longest text a network takes with this content (characters, or UTF-16 code units where the network
// counts them so), and the detail named when it is longer; null where the network sets no limit.
const TIKTOK_CAPTION = SOCIAL_MEDIA_CONSTRAINTS.tiktok.caption;
const TEXT_LIMITS = {
    bluesky: [300, false, 'text_too_long'], mastodon: [500, false, 'text_too_long'], threads: [500, false, 'text_too_long'],
    linkedin: [3000, false, 'text_too_long'], discord: [2000, false, 'text_too_long'], youtube: [5000, false, 'caption_too_long']
};
export const socialTextLimit = (network, kind) => {
    const [max, utf16, detail] = network === 'tiktok'
        ? (kind === 'video' ? [TIKTOK_CAPTION.video, true, 'caption_too_long'] : kind === 'image' ? [TIKTOK_CAPTION.photoDescription, true, 'caption_too_long'] : [])
        : network === 'telegram' ? (kind === 'text' ? [4096, true, 'text_too_long'] : [1024, true, 'caption_too_long'])
            : TEXT_LIMITS[network] || [];
    return max ? { max, utf16, detail } : null;
};

const assisted = (kind, handoff, notes) => {
    if (kind === 'text') return { route: null, error: 'social_text_only_unsupported', notes };
    return handoff?.system_share === true
        ? { route: 'app_transfer', transfer: 'system_share', notes }
        : { route: 'export', notes };
};

const planTiktok = (account, kind, handoff) => {
    const notes = [];
    if (account?.state === 'expired') notes.push('social_session_expired');
    if (connected(account)) {
        const pullable = kind === 'video' || account.photo_pull === true;
        if (!pullable) notes.push('social_public_media_url_unavailable');
        else if (has(account, 'video.publish')) return { route: 'direct', notes };
        else if (has(account, 'video.upload')) return { route: 'app_transfer', transfer: 'provider_inbox', notes };
        else notes.push('social_permission_missing');
    }
    return assisted(kind, handoff, notes);
};

const planInstagram = (account, kind, handoff) => {
    const notes = [];
    if (account?.state === 'expired') notes.push('social_session_expired');
    if (connected(account)) {
        if (!has(account, 'instagram_business_content_publish')) notes.push('social_permission_missing');
        else if (kind === 'image' && account.public_media !== true) notes.push('social_public_media_url_unavailable');
        else return { route: 'direct', notes };
    }
    return assisted(kind, handoff, notes);
};

const planFacebookPage = (account, pageId, kind) => {
    if (account?.state === 'expired') return failed('social_session_expired');
    if (!connected(account)) return failed('social_not_connected');
    const page = (account.pages || []).find((entry) => entry.id === pageId);
    if (!page) return failed('social_destination_invalid');
    if (!page.can_post || !has(account, 'pages_manage_posts')) return failed('social_permission_missing');
    return { route: 'direct', notes: [], kind };
};

const planFacebookProfile = (kind, handoff) => (kind === 'text'
    ? { route: 'app_transfer', transfer: 'copy_open', notes: [] }
    : assisted(kind, handoff, []));

// The networks the server uploads to, connected and allowed to publish.
const planUploaded = (account, kind, scope) => {
    if (account?.state === 'expired') return failed('social_session_expired');
    if (!connected(account)) return failed('social_not_connected');
    if (scope && !has(account, scope)) return failed('social_permission_missing');
    return { route: 'direct', notes: [], kind };
};

const PLANNERS = {
    tiktok: planTiktok,
    instagram: planInstagram,
    threads: (account, kind) => (kind !== 'text' && connected(account) && account.public_media !== true
        ? failed('social_public_media_url_unavailable') : planUploaded(account, kind, 'threads_content_publish')),
    youtube: (account, kind) => planUploaded(account, kind, 'https://www.googleapis.com/auth/youtube.upload'),
    linkedin: (account, kind) => planUploaded(account, kind, 'w_member_social')
};

const ACCOUNT_ID = /^[A-Za-z0-9._@-]{1,120}$/;
const accountsOf = (networks, network) => (Array.isArray(networks) ? networks : [])
    .find((entry) => entry?.network === network)?.accounts || [];
// The account a destination names, else the network's first enabled one.
const accountIn = (networks, network, wanted) => accountsOf(networks, network)
    .find((account) => (wanted ? account.account === wanted : account.state !== 'disabled'));

// What a content kind a network does not take is refused with (never sent a degraded version).
const refusal = (network, kind) => (SOCIAL_NETWORK_CONTENT[network]?.[kind] !== false ? null
    : failed(kind === 'text' ? 'social_text_only_unsupported' : 'social_media_type_unsupported'));

const planAccount = (network, wanted, networks, kind, handoff) => {
    const account = accountIn(networks, network, wanted);
    const planned = refusal(network, kind)
        || (wanted && !account ? failed('social_account_not_found')
            : (PLANNERS[network] || ((entry, content) => planUploaded(entry, content, null)))(account, kind, handoff));
    return account?.account ? { ...planned, account: account.account } : planned;
};

export function planSocialDestination({ destination, networks = [], kind, handoff = {} }) {
    const id = String(destination || '');
    const base = { destination, network: id.split(':')[0] };
    if (!kind) return { ...base, ...failed('social_content_empty') };
    if (id === 'facebook:profile') return { ...base, ...planFacebookProfile(kind, handoff) };
    const page = /^facebook:page:([0-9]{1,40})$/.exec(id);
    if (page) {
        const holder = accountsOf(networks, 'facebook').find((account) => (account.pages || []).some((entry) => entry.id === page[1]))
            || accountIn(networks, 'facebook', '');
        const planned = planFacebookPage(holder, page[1], kind);
        return { ...base, ...planned, ...(holder?.account ? { account: holder.account } : {}) };
    }
    const [network, ...rest] = id.split(':');
    const wanted = rest.join(':');
    if (network === 'facebook' || !SOCIAL_NETWORKS.includes(network) || (rest.length && !ACCOUNT_ID.test(wanted))) {
        return { ...base, ...failed('social_destination_invalid') };
    }
    return { ...base, ...planAccount(network, wanted, networks, kind, handoff) };
}

// Every destination atome can offer for the current accounts, in the networks' order: each enabled account as
// `<network>:<account>` (a Facebook account's Pages as `facebook:page:<id>`, then the personal profile); TikTok and
// Instagram stay offered with no account, by the share sheet or an export.
export function listSocialDestinations(networks = []) {
    return SOCIAL_NETWORKS.flatMap((network) => {
        const enabled = accountsOf(networks, network).filter((account) => account.state !== 'disabled');
        if (network === 'facebook') {
            return [...enabled.filter(connected).flatMap((account) => (account.pages || []).map((page) => ({
                id: `facebook:page:${page.id}`, network, account: account.account, page: { id: page.id, name: page.name } }))),
            { id: 'facebook:profile', network, account: null }];
        }
        if (!enabled.length) return network === 'tiktok' || network === 'instagram' ? [{ id: network, network, account: null }] : [];
        return enabled.map((account) => ({ id: `${network}:${account.account}`, network, account: account.account,
            identity: account.identity || null }));
    });
}
