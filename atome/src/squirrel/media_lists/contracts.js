import { validateParams } from '../ai/agent_gateway_normalize.js';
import { MEDIA_LIST_ENTRIES_MAX, MEDIA_LIST_ENTRY_SCHEMA, MEDIA_LIST_KINDS, MEDIA_LIST_NAME_MAX } from '../../shared/media_list_contract.js';

// eVe's media lists (BUG-033, user 30 Oct. 2026): one contract for runtime V2, AI discovery and direct MCP calls,
// run by eVe/domains/media/media_list_runtime.js — the same owner as Médias › Listes, the rubrics' Listes tools and
// a media's hold « Ajouter à une liste ».
export const MEDIA_LIST_ERRORS = Object.freeze(['INVALID_ARGUMENT', 'AUTH_REQUIRED', 'NOT_FOUND', 'NAME_TAKEN', 'LIST_FULL',
    'VERSION_CONFLICT', 'PRESENTATION_UNAVAILABLE', 'WRITE_FAILED']);

const id = { type: 'string', minLength: 1, maxLength: 200 };
const name = { type: 'string', minLength: 1, maxLength: MEDIA_LIST_NAME_MAX, pattern: '\\S' };
const kind = { type: 'string', enum: MEDIA_LIST_KINDS };
const shown = { type: 'string', enum: ['all', 'audio', 'video'] };
// An entry given: its id is the list's to compute (source, provider, ref), a caller may leave it out.
const entry = { ...MEDIA_LIST_ENTRY_SCHEMA, required: MEDIA_LIST_ENTRY_SCHEMA.required.filter(key => key !== 'id') };
const entries = { type: 'array', minItems: 1, maxItems: MEDIA_LIST_ENTRIES_MAX, items: entry };
const definitions = {
    list: [{ media: shown, list_id: id, entry_id: { type: 'string', minLength: 1, maxLength: 400 } }, [], 'The person\'s media lists (id, name, kind, count), '
        + 'those a rubric shows when media is audio or video (its kind and the mixed ones); with entry_id, whether each holds that entry (holds); '
        + 'with list_id, that list with its entries.', false, 'read'],
    create: [{ name, kind, entries: { ...entries, minItems: 0 } }, ['name'], 'Create a media list (kind mixed by default, audio or video), optionally with its first entries.', true, 'write'],
    rename: [{ list_id: id, name }, ['list_id', 'name'], 'Rename a media list.', true, 'write'],
    add: [{ list_id: id, entries }, ['list_id', 'entries'], 'Add media to a list (an entry already there is left as it is). An entry: { media audio|video, '
        + 'source file|music|online, ref, provider, label, detail, image, duration }; its id, computed, is source:provider:ref.', true, 'write'],
    remove: [{ list_id: id, entry_ids: { type: 'array', minItems: 1, maxItems: MEDIA_LIST_ENTRIES_MAX, items: { type: 'string', minLength: 1, maxLength: 400 } } },
        ['list_id', 'entry_ids'], 'Take entries out of a media list (the media themselves stay).', true, 'write'],
    delete: [{ list_id: id }, ['list_id'], 'Delete a media list (its media stay where they are).', true, 'write'],
    open: [{ media: shown, list_id: id }, [], 'Show the media lists on the current presentation surface (media filters them), or one list.', false, 'control']
};
const entrySchema = { type: 'object', properties: MEDIA_LIST_ENTRY_SCHEMA.properties };
const listSchema = { type: 'object', properties: { id: { type: 'string' }, name: { type: 'string' }, kind: { type: 'string' }, count: { type: 'integer' }, holds: { type: 'boolean' },
    entries: { type: 'array', items: entrySchema } } };
export const MEDIA_LIST_COMMANDS = Object.freeze(Object.entries(definitions).map(([action, [properties, required, description, persistent, access]]) => Object.freeze({
    name: `media_lists.${action}`, action, description, persistent, capability: `media_lists.${access}`,
    input_schema: { type: 'object', additionalProperties: false, properties, required },
    output_schema: { type: 'object', required: ['ok'], properties: { ok: { type: 'boolean' }, error: { type: 'string', enum: MEDIA_LIST_ERRORS },
        lists: { type: 'array', items: listSchema }, list: listSchema, changed: { type: 'integer', minimum: 0 } } }
})));
export const validateMediaListInput = (action, input) => {
    const contract = MEDIA_LIST_COMMANDS.find(command => command.action === action);
    return contract && validateParams(contract.input_schema, input).ok ? null : 'INVALID_ARGUMENT';
};
export const mediaListError = error => (MEDIA_LIST_ERRORS.includes(error?.code || error?.message || error) ? (error?.code || error?.message || error) : 'WRITE_FAILED');
export const MEDIA_LIST_ASSISTANT_INSTRUCTIONS = 'Media lists (eVe\'s own, mixing sounds, songs and videos): « montre mes listes » calls media_lists.open; '
    + '« crée une liste Soirée » media_lists.create; « renomme la liste… » media_lists.rename; « ajoute cette vidéo à ma liste Sport » media_lists.add with the entry; '
    + '« enlève… de la liste » media_lists.remove; « supprime la liste… » media_lists.delete (confirmed). media_lists.list gives the ids; never invent one.';
