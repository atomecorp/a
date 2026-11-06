import { validateParams } from '../ai/agent_gateway_normalize.js';
import { LIST_ENTRY_SCHEMA, LIST_KINDS, LIST_NAME_MAX } from '../../shared/list_share_contract.js';

// Sending a list to someone and answering one received (register R-115 « Partage », cahier D25): one family for every
// list of eVe (#shared/list_share_contract.js) — the medications, the supplements, a playlist, the shopping list, a
// programme, a protocol template, any list of atomes — on one engine (eVe/domains/sharing/list_share_runtime.js); the
// shopping basket shared live (`live`) and the protocol templates (Modèles) go through it too.
export const SHARE_ERRORS = Object.freeze(['INVALID_ARGUMENT', 'AUTH_REQUIRED', 'NOT_FOUND', 'NOT_A_LIST', 'CONTACT_REQUIRED', 'NOT_LINKED',
    'NOT_ACCEPTED', 'PROVIDER_UNAVAILABLE', 'COMMIT_FAILED',
    // A health list is sealed for each recipient's published key (#shared/share_key_contract.js): one without a key, or a
    // device without the account's keys, cannot seal or open it.
    'SHARE_KEY_UNAVAILABLE', 'SHARE_KEY_LOCKED', 'SHARE_KEY_INVALID']);

const id = { type: 'string', minLength: 1, maxLength: 400 };
const kind = { type: 'string', enum: LIST_KINDS };
const name = { type: 'string', minLength: 1, maxLength: LIST_NAME_MAX, pattern: '\\S' };
const person = { type: 'object', additionalProperties: false, required: ['name'], properties: { contact_id: id, account_id: id, name } };
const definitions = {
    send: [{ atome_id: id, list_kind: kind, user_ids: { type: 'array', minItems: 1, maxItems: 34, items: id },
        phones: { type: 'array', minItems: 1, maxItems: 34, items: { type: 'string', minLength: 3, maxLength: 32 } }, linked: { type: 'boolean' },
        live: { type: 'boolean' }, note: { type: 'string', maxLength: 1000 } }, [],
        'Send a list to contacts (their account ids, or phones for a book contact known by number only): atome_id names the list (a playlist, a programme, a protocol template, a list made with share.list_create), list_kind alone the user\'s own medications or supplements. Linked by default: each later version reaches them to validate; linked false sends a copy; live true shares it to work on together (the shopping list: they see, add, tick and remove its items with the user); note: the user\'s own words with it. They validate it before it becomes theirs; someone it is already shared with is not asked again.', true],
    pending: [{}, [], 'What waits for the user\'s answer: the lists sent to them (and drafts of the assistant) not answered yet, and each new version of a list they follow.', false],
    view: [{ share_id: id, draft_id: id }, [], 'Read a list received (share_id) or a draft (draft_id) whole: its name, version and entries, a changed entry with what it was before.', false],
    accept: [{ share_id: id, draft_id: id }, [], 'Validate a list received or its new version (share_id), or a draft of the assistant (draft_id): it becomes the user\'s.', true],
    refuse: [{ share_id: id, draft_id: id }, [], 'Refuse a list received or its new version (share_id), or a draft (draft_id).', true],
    detach: [{ share_id: id }, ['share_id'], 'Keep a copy of a linked list received and stop following its sender\'s versions.', true],
    revoke: [{ share_id: id }, ['share_id'], 'Stop a share the user made (or one received).', true],
    sent: [{ atome_id: id, list_kind: kind }, [], 'The lists the user sent: to whom (principal_id), linked or a copy, and their state (pending until accepted); atome_id or list_kind (the user\'s own medications, supplements or shopping list) keeps one list\'s.', false],
    list_create: [{ list_kind: kind, name, for_person: person }, ['list_kind', 'name'],
        'A new list (« + »): for the user, or for a third party (for_person with their name): a list for someone else stays with the user, never on the user\'s Dashboard nor Agenda.', true],
    list_delete: [{ list_id: id }, ['list_id'],
        'Delete a list the user made with share.list_create (one kept for someone else, an ordonnance): its lines (a health list\'s products, their intakes and reminders), its paper and the list itself. Ask the user before calling it.', true],
    draft: [{ list_kind: { type: 'string', enum: ['medications', 'supplements'] }, name, entries: { type: 'array', minItems: 1, maxItems: 144, items: LIST_ENTRY_SCHEMA },
        message: { type: 'string', minLength: 1, maxLength: 1000, pattern: '\\S' }, photo_atome_id: id }, ['list_kind', 'name', 'entries', 'message'],
        'A draft list the assistant made (from a prescription\'s photo, a dictation), with her words (message: « Ton ordonnance, lue dans la BDPM : 3 médicaments »): it reaches the user as a list received from eVe, applied only once they validate it.', true],
    announce: [{ atome_id: id }, ['atome_id'], 'Tell the people a linked list was sent to that it changed: each receives the new version to validate.', true]
};
const shareSchema = { type: 'object', properties: { share_id: { type: 'string' }, atome_id: { type: 'string' }, owner_id: { type: 'string' },
    principal_id: { type: 'string' }, status: { type: 'string' }, share_type: { type: 'string' }, list_kind: { type: 'string' }, list_name: { type: 'string' } } };
export const SHARE_COMMANDS = Object.freeze(Object.entries(definitions).map(([action, [properties, required, description, persistent]]) => Object.freeze({
    name: `share.${action}`, action, description, persistent, capability: persistent ? 'share.write' : 'share.read',
    input_schema: { type: 'object', additionalProperties: false, properties, required },
    output_schema: { type: 'object', required: ['ok'], properties: { ok: { type: 'boolean' }, error: { type: 'string', enum: SHARE_ERRORS },
        shares: { type: 'array', items: shareSchema }, list: { type: 'object' }, list_id: { type: 'string' }, draft_id: { type: 'string' },
        version: { type: 'number' } } }
})));
export const SHARE_CONFIRMED_COMMANDS = Object.freeze(['share.send', 'share.accept', 'share.refuse', 'share.detach', 'share.revoke', 'share.list_delete']);
export const validateShareInput = (action, input) => {
    const contract = SHARE_COMMANDS.find(command => command.action === action);
    if (!contract || !validateParams(contract.input_schema, input).ok) return 'INVALID_ARGUMENT';
    if (['view', 'accept', 'refuse'].includes(action) && Boolean(input.share_id) === Boolean(input.draft_id)) return 'INVALID_ARGUMENT';
    if (action === 'send' && (Boolean(input.atome_id) === Boolean(input.list_kind) || !(input.user_ids?.length || input.phones?.length))) return 'INVALID_ARGUMENT';
    return null;
};
export const shareError = error => (SHARE_ERRORS.includes(error?.code || error?.message || error) ? (error?.code || error?.message || error) : 'COMMIT_FAILED');
export const SHARE_ASSISTANT_INSTRUCTIONS = 'Lists between people: « envoie ma liste de médicaments à Marie » calls share.send with list_kind medications and her account id; « envoie la playlist Soirée à Paul » calls share.send with the list\'s atome_id; « qu\'est-ce qu\'on m\'a envoyé » calls share.pending; « valide la liste de Julien » calls share.accept, « refuse-la » share.refuse, « garde une copie » share.detach; « fais une liste pour maman » calls share.list_create with for_person; « partage ma liste de courses avec Marie » calls share.send with list_kind shopping and live true, share.sent with list_kind shopping tells with whom, share.revoke stops it. A list received is never applied before the user validates it. A prescription read for the user becomes share.draft, never a treatment applied.';
