import { validateParams } from '../ai/agent_gateway_normalize.js';

// One contract for the eVe interface, the runtime tools, MCP and the server.
// Every limit below was read in the provider's official documentation
// (TikTok Content Posting API v2, Instagram API with Instagram Login, Facebook
// Graph API v25.0) on 2026-10-03; a limit that was not documented is not
// enforced locally — the provider's own refusal is reported instead.
export const SOCIAL_NETWORKS = Object.freeze(['tiktok', 'instagram', 'facebook']);

// What the user ends up doing. `direct`: atome publishes through the provider
// API. `app_transfer`: the content is handed to the network's app (provider
// inbox, system share sheet, or copied text + official page) and the user
// finishes there. `export`: the prepared file is saved for a manual upload.
export const SOCIAL_ROUTES = Object.freeze(['direct', 'app_transfer', 'export']);
export const SOCIAL_TRANSFERS = Object.freeze(['provider_inbox', 'system_share', 'copy_open']);

// Internal delivery model. `handed_off` (given to the network's app) and
// `exported` (file saved for a manual upload) never mean published;
// `unconfirmed` is a publish request whose answer was lost: it must be
// verified, never resent. `ready` is a prepared delivery not sent yet.
export const SOCIAL_STATUSES = Object.freeze(['ready', 'preparing', 'transferring', 'remote_processing', 'published',
    'handed_off', 'exported', 'unconfirmed', 'cancelled', 'failed']);
export const SOCIAL_TERMINAL_STATUSES = Object.freeze(['published', 'handed_off', 'exported', 'cancelled', 'failed']);

export const SOCIAL_ERRORS = Object.freeze([
    'social_not_configured', 'social_not_connected', 'social_session_expired', 'social_authorization_denied',
    'social_authorization_expired', 'social_permission_missing', 'social_account_incompatible',
    'social_media_missing', 'social_media_unreadable', 'social_media_type_unsupported', 'social_media_constraint',
    'social_text_only_unsupported', 'social_content_empty', 'social_public_media_url_unavailable',
    'social_provider_rejected', 'social_provider_rate_limited', 'social_provider_unavailable',
    'social_network_interrupted', 'social_publish_unconfirmed', 'social_job_not_found', 'social_job_busy',
    'social_destination_invalid', 'social_option_required', 'social_cancelled', 'social_app_unavailable',
    'social_handoff_unavailable', 'social_request_invalid'
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
const destinationId = { type: 'string', minLength: 1, maxLength: 160, pattern: '^(tiktok|instagram|facebook:profile|facebook:page:[0-9]{1,40})$' };
const tiktokOptions = { type: 'object', additionalProperties: false, properties: {
    privacy_level: { type: 'string', enum: TIKTOK_PRIVACY_LEVELS },
    disable_comment: { type: 'boolean' }, disable_duet: { type: 'boolean' }, disable_stitch: { type: 'boolean' },
    brand_content_toggle: { type: 'boolean' }, brand_organic_toggle: { type: 'boolean' }
} };
const deliverySchema = { type: 'object', additionalProperties: false, required: ['id'], properties: {
    id: destinationId, options: tiktokOptions
} };
const jobId = { type: 'string', pattern: '^[a-f0-9]{32}$' };

const shapes = {
    accounts: [{}, [], 'read', 'List the social network connections of the signed-in atome user: account identity from the provider, connection state and what each destination allows. Never returns tokens.'],
    connect: [{ network: { type: 'string', enum: SOCIAL_NETWORKS } }, ['network'], 'control', 'Open the official login page of TikTok, Instagram (professional accounts) or Facebook and wait for the user to authorize atome. Requires a user gesture; atome never asks for the network password.'],
    disconnect: [{ network: { type: 'string', enum: SOCIAL_NETWORKS } }, ['network'], 'write', 'Disconnect a social account from atome and revoke its tokens where the provider allows it.'],
    prepare: [{ content: SOCIAL_CONTENT_SCHEMA, destinations: { type: 'array', minItems: 1, maxItems: 8, uniqueItems: true, items: destinationId },
        handoff: { type: 'object', additionalProperties: false, properties: { system_share: { type: 'boolean' } } } },
    ['content', 'destinations'], 'read', 'Check text and an existing image or video against each destination, prepare the variants it needs (the original asset is never modified) and return the exact preview. Publishes nothing.'],
    publish: [{ job_id: jobId, deliveries: { type: 'array', minItems: 1, maxItems: 8, items: deliverySchema } },
        ['job_id', 'deliveries'], 'write', 'Send a prepared job to the chosen destinations. Each destination keeps its own result; a destination already published, handed off or unconfirmed is never sent again.'],
    status: [{ job_id: jobId }, ['job_id'], 'read', 'Read the real state of every destination of a sharing job, refreshing provider processing state.'],
    cancel: [{ job_id: jobId, destination: destinationId }, ['job_id'], 'write', 'Cancel the destinations of a job that have not been accepted by the provider yet and delete its temporary files.']
};
export const SOCIAL_COMMANDS = Object.freeze(Object.entries(shapes).map(([action, [properties, required, access, description]]) => Object.freeze({
    action, name: 'social.' + action, description, access,
    capability: access === 'read' ? 'social.read' : 'social.write',
    input_schema: { type: 'object', additionalProperties: false, properties, required }
})));

export function validateSocialInput(action, input = {}) {
    const schema = SOCIAL_COMMANDS.find((command) => command.action === action)?.input_schema;
    return schema && validateParams(schema, input).ok ? null : 'social_request_invalid';
}

export const socialContentKind = (content = {}) => {
    if (content?.media?.kind === 'image' || content?.media?.kind === 'video') return content.media.kind;
    return String(content?.text || '').trim() ? 'text' : null;
};

// UTF-16 code units, the unit TikTok documents for its caption limits.
export const utf16Length = (value) => String(value || '').length;
