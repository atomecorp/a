// Pure route planning, shared by the server (which decides) and the client
// (which renders). It only reads the public account view — never a token.
//
// Official possibilities this encodes:
// - TikTok: video by FILE_UPLOAD, Direct Post (`video.publish`) or inbox upload
//   finished in the app (`video.upload`); photos only by PULL_FROM_URL from a
//   domain verified in the TikTok developer portal; no text-only post.
// - Instagram: API publishing only for professional accounts (Business or
//   Media_Creator) with `instagram_business_content_publish`; images JPEG from a
//   public URL; no text-only post. A personal account gets the system share.
// - Facebook: a Page the user administers (`pages_manage_posts` + CREATE_CONTENT
//   task) accepts text, photo and video; a personal profile has no publishing
//   API, so only the share sheet or copied text + the official site remain.

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

const assisted = (kind, handoff, notes) => {
    if (kind === 'text') return { route: null, error: 'social_text_only_unsupported', notes };
    return handoff?.system_share === true
        ? { route: 'app_transfer', transfer: 'system_share', notes }
        : { route: 'export', notes };
};

const planTiktok = (account, kind, handoff) => {
    if (kind === 'text') return { route: null, error: 'social_text_only_unsupported', notes: [] };
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
    if (kind === 'text') return { route: null, error: 'social_text_only_unsupported', notes: [] };
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
    if (account?.state === 'expired') return { route: null, error: 'social_session_expired', notes: [] };
    if (!connected(account)) return { route: null, error: 'social_not_connected', notes: [] };
    const page = (account.pages || []).find((entry) => entry.id === pageId);
    if (!page) return { route: null, error: 'social_destination_invalid', notes: [] };
    if (!page.can_post || !has(account, 'pages_manage_posts')) return { route: null, error: 'social_permission_missing', notes: [] };
    return { route: 'direct', notes: [], kind };
};

const planFacebookProfile = (kind, handoff) => (kind === 'text'
    ? { route: 'app_transfer', transfer: 'copy_open', notes: [] }
    : assisted(kind, handoff, []));

export function planSocialDestination({ destination, accounts = {}, kind, handoff = {} }) {
    const base = { destination, network: String(destination || '').split(':')[0] };
    if (!kind) return { ...base, route: null, error: 'social_content_empty', notes: [] };
    if (destination === 'tiktok') return { ...base, ...planTiktok(accounts.tiktok, kind, handoff) };
    if (destination === 'instagram') return { ...base, ...planInstagram(accounts.instagram, kind, handoff) };
    if (destination === 'facebook:profile') return { ...base, ...planFacebookProfile(kind, handoff) };
    const page = /^facebook:page:([0-9]{1,40})$/.exec(String(destination || ''));
    if (page) return { ...base, ...planFacebookPage(accounts.facebook, page[1], kind) };
    return { ...base, route: null, error: 'social_destination_invalid', notes: [] };
}

// Every destination atome can offer for the current accounts, in a stable order.
export function listSocialDestinations(accounts = {}) {
    const pages = connected(accounts.facebook) ? (accounts.facebook.pages || []) : [];
    return [
        { id: 'tiktok', network: 'tiktok', account: accounts.tiktok?.identity || null },
        { id: 'instagram', network: 'instagram', account: accounts.instagram?.identity || null },
        ...pages.map((page) => ({ id: `facebook:page:${page.id}`, network: 'facebook', page: { id: page.id, name: page.name } })),
        { id: 'facebook:profile', network: 'facebook', account: null }
    ];
}
