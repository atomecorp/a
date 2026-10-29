import { validateParams } from '../ai/agent_gateway_normalize.js';

// One contract for runtime V2, AI discovery and direct MCP calls: Publier (eVe/domains/publish/, user decisions of
// 28 Oct. 2026) — a text and media sent to the eVe feed, people and the social networks, now or at a time, the
// sends planned in the Agenda's « Publications » calendar, edited, updated, sent now or cancelled. Every action of
// the panel runs through these commands (eVe/domains/publish/publish_commands.js).
export const PUBLISH_ERRORS = Object.freeze(['INVALID_ARGUMENT', 'AUTH_REQUIRED', 'publish_empty', 'publish_recipient_required',
    'publish_recipient_unknown', 'publish_event_not_found', 'publish_not_pending', 'publish_update_unreachable', 'scheduled_due_past',
    'social_option_required', 'PUBLISH_FAILED']);
const text = { type: 'string', maxLength: 5000 };
const id = { type: 'string', minLength: 1, maxLength: 200 };
const ids = { type: 'array', maxItems: 10, uniqueItems: true, items: id };
const due_at = { type: 'string', format: 'date-time', maxLength: 40 };
const event_id = id;
const recipients = {
    feed: { type: 'boolean' }, people: ids,
    networks: { type: 'array', maxItems: 8, uniqueItems: true, items: { type: 'string', pattern: '^(tiktok|instagram|facebook:profile|facebook:page:[0-9]{1,40})$' } }
};
const definitions = {
    recipients: [{}, [], 'List who Publier can send to under the active life profile: the eVe feed, people (id, label: the book, the favourites, the accepted contacts) and the social networks (id, label: tiktok, instagram, facebook:page:<id> for each Page the user runs, else facebook:profile), with the TikTok privacy levels offered when TikTok takes a direct post. Writes nothing.', false],
    open: [{ text, attachment_ids: ids, ...recipients }, [], 'Show Publier with this text, these media Atome ids and these recipients ticked; the user finishes and sends. Sends nothing.', false],
    send: [{ text, attachment_ids: ids, ...recipients, tiktok_privacy: { type: 'string', maxLength: 40 }, due_at }, [],
        'Send a text and media Atome ids to the eVe feed (feed true), people (their ids) and networks (their ids): now, or at due_at, held by the server and shown in the Agenda\'s « Publications » calendar. What leaves at due_at is the content as it stands then. A network only the user can finish (share sheet, copied text) is handed to them now, told at a time. TikTok\'s direct post needs tiktok_privacy, one of the levels publish.recipients gives, chosen by the user.', true],
    list: [{}, [], 'List the sends planned and done in the « Publications » calendar: event_id, kind (send or update), parent_event_id, state (pending, sent, partial, failed, cancelled), due_at, title, text, recipients named. Writes nothing.', false],
    open_planned: [{ event_id }, ['event_id'], 'Show a planned send (or update) in Publier: its content, its time, its updates. Writes nothing.', false],
    edit: [{ event_id, text, due_at }, ['event_id'], 'Change a send still to come: its text and/or its time. The server keeps the new content.', true],
    update: [{ event_id, text, due_at }, ['event_id', 'due_at'], 'Plan an update of a send (its event): the new text at due_at, applied in place where the channel edits a post (the eVe feed, a Facebook Page), never published again elsewhere.', true],
    send_now: [{ event_id }, ['event_id'], 'Send a planned send now, as it stands; one refused before is sent again.', true],
    cancel: [{ event_id }, ['event_id'], 'Cancel a send still to come and its updates: it never leaves, its event leaves the Agenda.', true]
};
export const PUBLISH_COMMANDS = Object.freeze(Object.entries(definitions).map(([action, [properties, required, description, persistent]]) => Object.freeze({
    name: `publish.${action}`, action, description, persistent, capability: persistent ? 'publish.write' : 'publish.read',
    input_schema: { type: 'object', additionalProperties: false, properties, required },
    output_schema: { type: 'object', required: ['ok'], properties: { ok: { type: 'boolean' }, error: { type: 'string', enum: PUBLISH_ERRORS },
        feed: { type: 'boolean' }, people: { type: 'array' }, networks: { type: 'array' }, tiktok_privacy: { type: 'array' }, sends: { type: 'array' },
        event_id: { type: 'string' }, scheduled: { type: 'boolean' }, sent: { type: 'boolean' }, missed: { type: 'array' } } }
})));
export const PUBLISH_CONFIRMED_COMMANDS = Object.freeze(['publish.send', 'publish.edit', 'publish.update', 'publish.send_now', 'publish.cancel']);
export const validatePublishInput = (action, input) => {
    const contract = PUBLISH_COMMANDS.find(command => command.action === action);
    return contract && validateParams(contract.input_schema, input).ok ? null : 'INVALID_ARGUMENT';
};
export const PUBLISH_ASSISTANT_INSTRUCTIONS = 'Publishing: « publie sur le fil : Concert samedi » calls publish.send with feed true; « envoie ça à Léa et sur Facebook demain à 9 h » finds their ids with publish.recipients then publish.send with people, networks and due_at; « prépare une publication » publish.open; « qu\'est-ce que j\'ai programmé ? » publish.list; « décale la publication de demain à 18 h » publish.edit; « ajoute une mise à jour lundi » publish.update; « envoie-la maintenant » publish.send_now; « annule-la » publish.cancel. TikTok: ask the user who may see the post among the levels given, never choose for them.';
export const publishError = (error) => {
    const code = String(error?.code || error?.message || error || '').split(':')[0];
    if (code === 'publish_account_required') return 'AUTH_REQUIRED';
    return PUBLISH_ERRORS.includes(code) ? code : 'PUBLISH_FAILED';
};
