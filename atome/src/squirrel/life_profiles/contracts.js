import { validateParams } from '../ai/agent_gateway_normalize.js';
import { LIFE_PROFILE_FILING_KINDS, LIFE_PROFILE_NAME_MAX, LIFE_PROFILES_MAX } from '../../shared/life_profile_contract.js';

// Life profiles (user, 28 Oct. 2026): one contract for runtime V2, AI discovery and direct MCP calls,
// run by eVe/domains/life_profiles/life_profile_runtime.js — the same owner as the home's centre and
// its top mark. The active profiles are this device's; the profiles and what each item belongs to are synced.
export const LIFE_PROFILE_ERRORS = Object.freeze(['INVALID_ARGUMENT', 'AUTH_REQUIRED', 'NOT_FOUND', 'NAME_TAKEN', 'TOO_MANY', 'WRITE_FAILED']);

const id = { type: 'string', minLength: 1, maxLength: 200 };
const name = { type: 'string', minLength: 1, maxLength: LIFE_PROFILE_NAME_MAX };
const ids = { type: 'array', maxItems: LIFE_PROFILES_MAX, items: id };
const definitions = {
    list: [{}, [], 'The person\'s life profiles (id, name, color, calendar_id) in their order, and the ids active on this device ([] = every profile, the eVe logo).', false, 'read'],
    create: [{ name }, ['name'], 'Create a life profile (Pro, Sport, Passion…): it joins the row of the home\'s centre, and a calendar of the same name is created with it.', true, 'write'],
    rename: [{ profile_id: id, name }, ['profile_id', 'name'], 'Rename a life profile (its calendar takes the new name).', true, 'write'],
    color: [{ profile_id: id, color: { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' } }, ['profile_id', 'color'], 'Change a life profile\'s colour (#rrggbb, its calendar takes it too).', true, 'write'],
    delete: [{ profile_id: id }, ['profile_id'], 'Delete a life profile. Nothing else is deleted: the items it held belong again to every profile unless another profile holds them.', true, 'write'],
    activate: [{ profile_ids: ids }, ['profile_ids'], 'Work in these profiles on this device: lists and the agenda show what they hold (and what holds no profile); '
        + 'what is created takes them. [] = every profile (the eVe logo).', false, 'control'],
    assign: [{ atome_id: id, item_kind: { type: 'string', enum: LIFE_PROFILE_FILING_KINDS }, item_id: id, profile_ids: ids }, ['profile_ids'],
        'Set the profiles an item belongs to: an Atome by its atome_id (a project, a document, a media, an event), or a forum or a network '
        + 'of Publier by item_kind (forum, network) and item_id (the forum\'s id, the network\'s destination id from publish.recipients), never both. [] = every profile.', true, 'write']
};
const profileSchema = { type: 'object', properties: { id: { type: 'string' }, name: { type: 'string' }, color: { type: 'string' }, calendar_id: { type: 'string' } } };
export const LIFE_PROFILE_COMMANDS = Object.freeze(Object.entries(definitions).map(([action, [properties, required, description, persistent, access]]) => Object.freeze({
    name: `profiles.${action}`, action, description, persistent, capability: `profiles.${access}`,
    input_schema: { type: 'object', additionalProperties: false, properties, required },
    output_schema: { type: 'object', required: ['ok'], properties: { ok: { type: 'boolean' }, error: { type: 'string', enum: LIFE_PROFILE_ERRORS },
        profiles: { type: 'array', items: profileSchema }, profile: profileSchema, active: { type: 'array', items: { type: 'string' } },
        atome_id: { type: 'string' }, profile_ids: { type: 'array', items: { type: 'string' } } } }
})));
export const validateLifeProfileInput = (action, input) => {
    const contract = LIFE_PROFILE_COMMANDS.find(command => command.action === action);
    if (!contract || !validateParams(contract.input_schema, input).ok) return 'INVALID_ARGUMENT';
    if (action !== 'assign') return null;
    // An item is named one way: an Atome, or a forum or a network (its kind and its id).
    const item = 'item_kind' in input || 'item_id' in input;
    return ('atome_id' in input) === item || (item && !('item_kind' in input && 'item_id' in input)) ? 'INVALID_ARGUMENT' : null;
};
export const lifeProfileError = error => (LIFE_PROFILE_ERRORS.includes(error?.code || error?.message || error) ? (error?.code || error?.message || error) : 'WRITE_FAILED');
export const LIFE_PROFILE_ASSISTANT_INSTRUCTIONS = 'Life profiles (contexts: Pro, Sport, Passion, Privé…): « passe en mode pro », « mets-moi sur mon profil sport » call profiles.activate '
    + 'with that profile\'s id (profiles.list gives them); « tous les profils », « reviens à tout » profiles.activate with []; « active aussi Passion » adds its id to the active ones. '
    + '« crée un profil Musique » profiles.create; « renomme… » profiles.rename; « mets Sport en bleu » profiles.color; « supprime le profil… » profiles.delete. « mets ce projet dans Pro » profiles.assign '
    + 'with the project\'s atome_id; « range ce forum dans Sport » profiles.assign with item_kind forum and its item_id. Never invent an id.';
