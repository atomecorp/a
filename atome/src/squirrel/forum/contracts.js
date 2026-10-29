import { validateParams } from '../ai/agent_gateway_normalize.js';

// One contract for runtime V2, AI discovery and direct MCP calls: forums (eVe/domains/forum/, user decisions 3, 4, 6, 7
// of 26 Oct. 2026) — made from people with a name, a true forum where every member writes and reads the others' posts
// and sees who belongs; a person added is invited and reads nothing before accepting; a person not on eVe gets an
// e-mail with a link. Every action of the screens runs through these commands (eVe/domains/forum/forum_commands.js).
export const FORUM_ERRORS = Object.freeze(['INVALID_ARGUMENT', 'AUTH_REQUIRED', 'PRESENTATION_UNAVAILABLE', 'forum_not_found', 'forum_not_member',
    'forum_name_required', 'forum_owner_stays', 'forum_invite_invalid', 'forum_post_empty', 'publish_recipient_unknown', 'scheduled_due_past', 'FORUM_FAILED']);
const id = { type: 'string', minLength: 1, maxLength: 200 };
const forum_id = { type: 'string', pattern: '^forum_[a-z0-9-]{8,64}$' };
const people = { type: 'array', minItems: 1, maxItems: 200, uniqueItems: true, items: id };
const definitions = {
    list: [{}, [], 'List the forums of the user: id, name, status (member, or invited: an invitation waiting for the user\'s answer), owner (the user made it). Writes nothing.', false],
    create: [{ name: { type: 'string', minLength: 1, maxLength: 60 }, people }, ['name', 'people'],
        'Make a forum named name with these people (their ids, as publish.recipients lists them): each one on eVe is invited and joins by accepting; one with no eVe account but an e-mail address gets an e-mail with an invitation link. Answers missed: the people it could not reach.', true],
    invite: [{ forum_id, people }, ['forum_id', 'people'], 'Invite more people (their ids) to a forum the user belongs to, as create does.', true],
    respond: [{ forum_id, accept: { type: 'boolean' } }, ['forum_id', 'accept'], 'Answer an invitation to a forum: accept (the user becomes a member) or refuse.', true],
    leave: [{ forum_id }, ['forum_id'], 'Leave a forum (its maker keeps it).', true],
    members: [{ forum_id }, ['forum_id'], 'List who belongs to a forum the user is a member of: id, name, owner. Writes nothing.', false],
    posts: [{ forum_id }, ['forum_id'], 'Read a forum\'s posts, newest first: id, author, text, created_at. Writes nothing.', false],
    post: [{ forum_id, text: { type: 'string', minLength: 1, maxLength: 5000 }, due_at: { type: 'string', format: 'date-time', maxLength: 40 } }, ['forum_id', 'text'],
        'Write a post in a forum: now, or at due_at (held by the server, shown in the Agenda\'s « Publications » calendar).', true],
    open: [{ forum_id }, ['forum_id'], 'Show a forum on the Dashboard: its posts, the field writing one. Writes nothing.', false]
};
export const FORUM_COMMANDS = Object.freeze(Object.entries(definitions).map(([action, [properties, required, description, persistent]]) => Object.freeze({
    name: `forum.${action}`, action, description, persistent, capability: persistent ? 'forum.write' : 'forum.read',
    input_schema: { type: 'object', additionalProperties: false, properties, required },
    output_schema: { type: 'object', required: ['ok'], properties: { ok: { type: 'boolean' }, error: { type: 'string', enum: FORUM_ERRORS },
        forums: { type: 'array' }, forum: { type: 'object' }, members: { type: 'array' }, posts: { type: 'array' }, missed: { type: 'array' },
        mailed: { type: 'number' }, scheduled: { type: 'boolean' }, event_id: { type: 'string' }, post_id: { type: 'string' }, status: { type: 'string' } } }
})));
export const FORUM_CONFIRMED_COMMANDS = Object.freeze(['forum.create', 'forum.invite', 'forum.respond', 'forum.leave', 'forum.post']);
export const validateForumInput = (action, input) => {
    const contract = FORUM_COMMANDS.find(command => command.action === action);
    return contract && validateParams(contract.input_schema, input).ok ? null : 'INVALID_ARGUMENT';
};
export const FORUM_ASSISTANT_INSTRUCTIONS = 'Forums: « crée un forum Chorale avec Léa et Marc » finds their ids with publish.recipients then forum.create; « mes forums » forum.list; « qui est dans Chorale ? » forum.members; « écris dans Chorale : répétition jeudi » forum.post (with due_at when a time is said); « ouvre Chorale » forum.open; an invitation received: forum.respond with the user\'s answer, never chosen for them.';
export const forumError = (error) => {
    const code = String(error?.code || error?.message || error || '').split(':')[0];
    if (code === 'forum_auth_unavailable' || code === 'forum_auth_required') return 'AUTH_REQUIRED';
    return FORUM_ERRORS.includes(code) ? code : 'FORUM_FAILED';
};
