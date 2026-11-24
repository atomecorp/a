import { validateParams } from '../ai/agent_gateway_normalize.js';

// One contract for the eVe interface, the runtime tools, MCP and the server (the Rust atome-server reads the
// generated schemas: eVe/registry/generated/ai_provider_catalog.json, `npm run registry:build`). The media limits
// below were read in the provider's official documentation (TikTok Content Posting API v2, Instagram API with
// Instagram Login, Facebook Graph API v25.0) on 2026-10-03; a limit that was not documented is not enforced
// locally — the provider's own refusal is reported instead.
// The networks of universal publishing (R-190 §5 bis, validated 16 Nov. 2026), mirrored by the Rust
// `providers/social/sessions.rs` `Network`. X is not coded; Steam and Heroku were dropped.
export const SOCIAL_NETWORKS = Object.freeze(['tiktok', 'instagram', 'facebook', 'threads', 'youtube', 'linkedin', 'bluesky', 'mastodon',
    'telegram', 'discord']);

// What each network's official API takes (R-190 §2): a network that does not take the content is skipped and
// named at the result, never sent a degraded version.
export const SOCIAL_NETWORK_CONTENT = Object.freeze({
    tiktok: Object.freeze({ text: false, image: true, video: true }),
    instagram: Object.freeze({ text: false, image: true, video: true }),
    facebook: Object.freeze({ text: true, image: true, video: true }),
    threads: Object.freeze({ text: true, image: true, video: true }),
    youtube: Object.freeze({ text: false, image: false, video: true }),
    linkedin: Object.freeze({ text: true, image: true, video: true }),
    bluesky: Object.freeze({ text: true, image: true, video: true }),
    mastodon: Object.freeze({ text: true, image: true, video: true }),
    telegram: Object.freeze({ text: true, image: true, video: true }),
    discord: Object.freeze({ text: true, image: true, video: true })
});

// How a network is linked once. `oauth`: its official authorization page (Mastodon needs the person's instance
// first, Bluesky their handle). `credentials`: no authorization page; a robot's token or a server's link typed
// once in the network's accordion (M1, M7) and kept in the server vault, never sent back to a client.
export const SOCIAL_NETWORK_SETUP = Object.freeze({
    mastodon: Object.freeze({ link: 'oauth', fields: Object.freeze(['instance']) }),
    bluesky: Object.freeze({ link: 'oauth', fields: Object.freeze(['handle']) }),
    telegram: Object.freeze({ link: 'credentials', fields: Object.freeze(['bot_token', 'chat_id']), required: Object.freeze(['bot_token', 'chat_id']) }),
    discord: Object.freeze({ link: 'credentials', fields: Object.freeze(['webhook_url', 'bot_token', 'channel_id']), required: Object.freeze(['webhook_url']) })
});
export const socialNetworkLink = network => SOCIAL_NETWORK_SETUP[network]?.link || 'oauth';

// A destination: `<network>` (its first account) or `<network>:<account>`; Facebook keeps its Pages and profile.
export const SOCIAL_DESTINATION_PATTERN = '^(facebook:profile|facebook:page:[0-9]{1,40}|(tiktok|instagram|threads|youtube|linkedin|bluesky|mastodon|telegram|discord)(:[A-Za-z0-9._@-]{1,120})?)$';

export const SOCIAL_ERRORS = Object.freeze([
    'social_not_configured', 'social_not_connected', 'social_session_expired', 'social_authorization_denied',
    'social_authorization_expired', 'social_permission_missing', 'social_account_incompatible',
    'social_media_missing', 'social_media_unreadable', 'social_media_type_unsupported', 'social_media_constraint',
    'social_text_only_unsupported', 'social_content_empty', 'social_public_media_url_unavailable',
    'social_provider_rejected', 'social_provider_rate_limited', 'social_provider_unavailable',
    'social_network_interrupted', 'social_publish_unconfirmed', 'social_job_not_found', 'social_job_busy',
    'social_destination_invalid', 'social_option_required', 'social_cancelled', 'social_app_unavailable',
    'social_handoff_unavailable', 'social_request_invalid',
    // A scheduled send: a destination only the person can finish (share sheet, export, copied text), and an
    // update a network's API cannot apply to a post (Instagram, TikTok, a personal profile).
    'social_needs_person', 'social_update_unsupported',
    // A reply to a received message or comment (R-190 §5 bis), an account chosen by its id, a robot's link refused.
    'social_reply_window_closed', 'social_reply_unsupported', 'social_account_not_found', 'social_credentials_invalid'
]);
export const normalizeSocialError = (code) => (SOCIAL_ERRORS.includes(code) ? code : 'social_provider_unavailable');

// Constraints from the official documentation (see the header). Units: bytes,
// pixels, seconds, frames per second.
export const SOCIAL_MEDIA_CONSTRAINTS = Object.freeze({
    tiktok: Object.freeze({
        video: { containers: ['mp4', 'mov', 'webm'], codecs: ['h264', 'hevc', 'vp8', 'vp9'], minSide: 360, maxSide: 4096,
            minFps: 23, maxFps: 60, maxDuration: 600, maxBytes: 4 * 1024 ** 3 },
        image: { formats: ['jpeg', 'webp'], maxSide: 1080, maxBytes: 20 * 1024 ** 2 },
        caption: { video: 2200, photoTitle: 90, photoDescription: 4000 }
    }),
    instagram: Object.freeze({
        video: { containers: ['mp4', 'mov'], codecs: ['h264', 'hevc'], audioCodecs: ['aac'], maxAudioRate: 48000,
            minFps: 23, maxFps: 60, maxWidth: 1920, minDuration: 3, maxDuration: 900, maxBytes: 300 * 1024 ** 2 },
        image: { formats: ['jpeg'], minWidth: 320, maxWidth: 1440, minAspect: 4 / 5, maxAspect: 1.91, maxBytes: 8 * 1024 ** 2 }
    }),
    facebook: Object.freeze({
        image: { formats: ['jpeg', 'png', 'gif', 'bmp', 'tiff'], maxBytes: 4 * 1024 ** 2 }
    })
});

export const TIKTOK_PRIVACY_LEVELS = Object.freeze(['PUBLIC_TO_EVERYONE', 'MUTUAL_FOLLOW_FRIENDS', 'FOLLOWER_OF_CREATOR', 'SELF_ONLY']);

// The asset contract consumed by sharing. `file` names an asset already stored
// for the principal (the media record's `file_name`, or its Atome id); the
// server resolves it with its own access check and never modifies it. Any
// producer (Finder/Media panel today, ZRecord Canvas exports later) hands over
// this shape and nothing else.
const mediaSchema = { type: 'object', additionalProperties: false, required: ['file', 'kind'], properties: {
    file: { type: 'string', minLength: 1, maxLength: 512, pattern: '^[^/\\\\\\u0000]+$' },
    kind: { type: 'string', enum: ['image', 'video'] },
    name: { type: 'string', maxLength: 255 },
    owner_id: { type: 'string', maxLength: 128 }
} };
export const SOCIAL_CONTENT_SCHEMA = Object.freeze({ type: 'object', additionalProperties: false, properties: {
    text: { type: 'string', maxLength: 10000 },
    media: { anyOf: [mediaSchema, { type: 'null' }] }
} });
const destinationId = { type: 'string', minLength: 1, maxLength: 160, pattern: SOCIAL_DESTINATION_PATTERN };
// A delivery's options: TikTok's own fields (unchanged), `youtube` (its title, visibility and audience, M3), and the
// text Bluesky and Threads publish when it differs from the content's (their own length limits).
const youtubeOptions = { type: 'object', additionalProperties: false, properties: {
    title: { type: 'string', maxLength: 100 }, visibility: { type: 'string', enum: ['private', 'unlisted', 'public'] },
    made_for_kids: { type: 'boolean' }
} };
const networkText = (maxLength) => ({ type: 'object', additionalProperties: false, properties: {
    text: { type: 'string', minLength: 1, maxLength }
} });
const deliveryOptions = { type: 'object', additionalProperties: false, properties: {
    privacy_level: { type: 'string', enum: TIKTOK_PRIVACY_LEVELS },
    disable_comment: { type: 'boolean' }, disable_duet: { type: 'boolean' }, disable_stitch: { type: 'boolean' },
    brand_content_toggle: { type: 'boolean' }, brand_organic_toggle: { type: 'boolean' },
    youtube: youtubeOptions, bluesky: networkText(300), threads: networkText(500)
} };
const deliverySchema = { type: 'object', additionalProperties: false, required: ['id'], properties: {
    id: destinationId, options: deliveryOptions
} };
const jobId = { type: 'string', pattern: '^[a-f0-9]{32}$' };

const network = { type: 'string', enum: SOCIAL_NETWORKS };
const account = { type: 'string', minLength: 1, maxLength: 120, pattern: '^[A-Za-z0-9._@:-]{1,120}$' };
const field = { type: 'string', minLength: 1, maxLength: 512 };
// The fields of a network linked by `credentials` (SOCIAL_NETWORK_SETUP).
const credentialFields = { type: 'object', additionalProperties: false, properties: {
    bot_token: field, chat_id: { type: 'string', minLength: 1, maxLength: 128 }, webhook_url: { ...field, pattern: '^https://' },
    channel_id: { type: 'string', minLength: 1, maxLength: 64, pattern: '^[0-9]{1,64}$' }
} };
// Where a received message came from (the notification's `origin`, R-190 §5 bis).
const origin = { type: 'object', required: ['network', 'account', 'thread'], properties: {
    network, account, kind: { type: 'string', enum: ['dm', 'comment', 'mention'] }, thread: { type: 'string', minLength: 1, maxLength: 256 },
    remote_id: { type: 'string', maxLength: 256 }
} };
const ids = { type: 'array', maxItems: 8, uniqueItems: true, items: { type: 'string', minLength: 1, maxLength: 128 } };

// [properties, required, access, description, mcp]: `mcp: false` keeps a command off MCP and the assistant (a robot's
// token is typed by the person in Settings, never dictated nor relayed).
const shapes = {
    accounts: [{}, [], 'read', 'List the social network connections of the signed-in atome user, network by network: whether the atome server offers the network, then each linked account (its id, the identity the provider returned, connected, expired or disabled, what it was allowed). Never returns tokens.'],
    connect: [{ network, instance: { type: 'string', minLength: 3, maxLength: 253, pattern: '^[A-Za-z0-9.-]+$' }, handle: { type: 'string', minLength: 3, maxLength: 253 } },
        ['network'], 'control', 'Open the official authorization page of a social network (Mastodon: on the person\'s instance; Bluesky: for their handle) and wait for the user to authorize atome. Requires a user gesture; atome never asks for the network password. Telegram and Discord have no such page: they are linked once in Settings › Communication › Social networks.'],
    disconnect: [{ network, account }, ['network'], 'write', 'Disconnect one account of a social network (every account without `account`) and revoke its tokens where the provider allows it; the messages kept from it are removed.'],
    'account.enable': [{ network, account, enabled: { type: 'boolean' } }, ['network', 'account', 'enabled'], 'write', 'Use or stop using a linked account (an Instagram account, a Facebook Page) without erasing it.'],
    'credentials.save': [{ network: { type: 'string', enum: Object.keys(SOCIAL_NETWORK_SETUP).filter(key => SOCIAL_NETWORK_SETUP[key].link === 'credentials') }, fields: credentialFields },
        ['network', 'fields'], 'write', 'Keep the robot token and channel (Telegram) or the webhook link (Discord) the person typed, in the server vault.', false],
    prepare: [{ content: SOCIAL_CONTENT_SCHEMA, destinations: { type: 'array', minItems: 1, maxItems: 8, uniqueItems: true, items: destinationId },
        handoff: { type: 'object', additionalProperties: false, properties: { system_share: { type: 'boolean' } } } },
    ['content', 'destinations'], 'read', 'Check text and an existing image or video against each destination, prepare the variants it needs (the original asset is never modified) and return the exact preview. Publishes nothing.'],
    publish: [{ job_id: jobId, deliveries: { type: 'array', minItems: 1, maxItems: 8, items: deliverySchema } },
        ['job_id', 'deliveries'], 'write', 'Send a prepared job to the chosen destinations. Each destination keeps its own result; a destination already published, handed off or unconfirmed is never sent again.'],
    status: [{ job_id: jobId }, ['job_id'], 'read', 'Read the real state of every destination of a sharing job, refreshing provider processing state.'],
    cancel: [{ job_id: jobId, destination: destinationId }, ['job_id'], 'write', 'Cancel the destinations of a job that have not been accepted by the provider yet and delete its temporary files.'],
    delete: [{ job_id: jobId, destination: destinationId }, ['job_id', 'destination'], 'write', 'Remove from the network a post this job published to that destination, where the provider allows it. The job keeps its history.'],
    reply: [{ notification_id: { type: 'string', minLength: 1, maxLength: 160 }, origin, text: { type: 'string', minLength: 1, maxLength: 10000 },
        attachment_ids: ids, private: { type: 'boolean' } }, ['text'], 'write', 'Answer a message or a comment received from a social network, on that network only (a private message, a reply under the comment, an Instagram private reply), named by its notification id or its origin. The reply is kept in the same thread on atome.'],
    'thread.read': [{ network, account, thread: { type: 'string', minLength: 1, maxLength: 256 }, cursor: { type: 'string', maxLength: 256 } },
        ['network', 'account', 'thread'], 'read', 'Read a conversation received from a social network, as kept on atome: its messages (sent or received, each with its origin), the newest page first, then `nextCursor`.']
};
// Every command the server validates (the generated catalog); SOCIAL_MCP_COMMANDS the ones MCP and the assistant reach.
export const SOCIAL_COMMANDS = Object.freeze(Object.entries(shapes).map(([action, [properties, required, access, description, mcp = true]]) => Object.freeze({
    action, name: 'social.' + action, description, access, mcp,
    capability: access === 'read' ? 'social.read' : 'social.write',
    input_schema: { type: 'object', additionalProperties: false, properties, required }
})));

export const SOCIAL_MCP_COMMANDS = Object.freeze(SOCIAL_COMMANDS.filter(command => command.mcp));
// `social.reply` speaks for the person on a network and `social.delete` removes a post there: the user confirms them, as
// a connection, a publication, a disconnection.
export const SOCIAL_CONFIRMED_COMMANDS = Object.freeze(['social.connect', 'social.publish', 'social.disconnect', 'social.account.enable', 'social.delete', 'social.reply']);

export function validateSocialInput(action, input = {}) {
    const schema = SOCIAL_COMMANDS.find((command) => command.action === action)?.input_schema;
    if (!schema || !validateParams(schema, input).ok) return 'social_request_invalid';
    // A reply names what it answers: its notification, or its origin.
    if (action === 'reply' && !input.notification_id && !input.origin) return 'social_request_invalid';
    const setup = SOCIAL_NETWORK_SETUP[input.network];
    if (action === 'credentials.save' && (setup?.required || []).some(key => !input.fields?.[key])) return 'social_request_invalid';
    return null;
}

export const socialContentKind = (content = {}) => {
    if (content?.media?.kind === 'image' || content?.media?.kind === 'video') return content.media.kind;
    return String(content?.text || '').trim() ? 'text' : null;
};

