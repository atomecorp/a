import { validateParams } from '../ai/agent_gateway_normalize.js';

// The user's projects, for runtime V2, AI discovery and direct MCP calls, like books: listed and searched
// as the Trouver panel lists and searches them, created and opened by the very tools of the interface
// (`ui.new_project`, `ui.project.open`). Run by eVe/domains/projects/projects_runtime.js.
export const PROJECTS_ERRORS = Object.freeze(['INVALID_ARGUMENT', 'NOT_FOUND', 'NO_PROJECT', 'CREATE_FAILED', 'OPEN_FAILED', 'FAVORITE_FAILED',
    'PRESENTATION_UNAVAILABLE', 'BAND_TOOL_UNKNOWN', 'BAND_TOOL_FAILED']);
// The Trouver panel's categories that hold a project's objects.
export const PROJECT_SEARCH_KINDS = Object.freeze(['all', 'images', 'videos', 'sounds']);
// A project's type, as the Projets rubric's Type tool keeps it (eVe/domains/projects/project_type.js).
export const PROJECT_TYPES = Object.freeze(['health', 'code', 'creation']);

const id = { type: 'string', minLength: 1, maxLength: 200 };
const text = { type: 'string', minLength: 1, maxLength: 200, pattern: '\\S' };
const limit = { type: 'integer', minimum: 1, maximum: 200 };
const definitions = {
    list: [{ query: text, limit, favorites: { type: 'boolean' }, type: { type: 'string', enum: PROJECT_TYPES } }, [], 'List the user\'s projects, last changed first: project_id, name, whether it is a favourite, and which one is current (open, or last opened while the Dashboard shows). `query` keeps the projects whose name holds it; `favorites` true keeps the favourites only, as the Dashboard\'s Favori tool does; `type` keeps one type (health, code, creation), as its Type tool does.', false],
    create: [{ name: { type: 'string', minLength: 1, maxLength: 512, pattern: '\\S' } }, [],
        'Create a new empty project (named `name`, else the next default name) and open it. Returns its project_id.', true],
    open: [{ project_id: id }, ['project_id'], 'Open one of the user\'s projects (its project_id from projects.list).', false],
    favorite: [{ project_id: id, favorite: { type: 'boolean' } }, ['project_id', 'favorite'],
        'Add one of the user\'s projects to the favourites (favorite true) or take it out of them (false), as a hold on its Dashboard tile does.', true],
    band_tool: [{ tool_id: id, project_id: id }, ['tool_id'],
        'Lay a tool in a project\'s bottom tool band (the current project when project_id is not given), as laying it from Trouver › Outils onto the project does; kept once. Returns its band key.', true],
    search: [{ text, project_id: id, kind: { type: 'string', enum: PROJECT_SEARCH_KINDS }, limit }, ['text'],
        'Search the objects of one project (the current one when project_id is not given: open, or last opened while the Dashboard shows) whose name, text, type or tags hold `text`, as the Trouver panel does; `kind` keeps images, videos or sounds only.', false]
};
const projectSchema = { type: 'object', required: ['project_id', 'name'], properties: {
    project_id: { type: 'string' }, name: { type: 'string' }, updated_at: { type: 'string' }, current: { type: 'boolean' }, favorite: { type: 'boolean' }, type: { type: 'string', enum: PROJECT_TYPES } } };
const itemSchema = { type: 'object', required: ['atome_id', 'type', 'name'], properties: {
    atome_id: { type: 'string' }, type: { type: 'string' }, name: { type: 'string' }, updated_at: { type: 'string' } } };
export const PROJECTS_COMMANDS = Object.freeze(Object.entries(definitions).map(([action, [properties, required, description, persistent]]) => Object.freeze({
    name: `projects.${action}`, action, description, persistent, capability: persistent ? 'projects.write' : 'projects.read',
    input_schema: { type: 'object', additionalProperties: false, properties, required },
    output_schema: { type: 'object', required: ['ok'], properties: { ok: { type: 'boolean' }, error: { type: 'string', enum: PROJECTS_ERRORS },
        project_id: { type: 'string' }, key: { type: 'string' }, projects: { type: 'array', items: projectSchema }, items: { type: 'array', items: itemSchema },
        total: { type: 'integer' } } }
})));
export const validateProjectsInput = (action, input) => {
    const contract = PROJECTS_COMMANDS.find(command => command.action === action);
    return contract && validateParams(contract.input_schema, input).ok ? null : 'INVALID_ARGUMENT';
};
export const PROJECTS_ASSISTANT_INSTRUCTIONS = 'Projects: « quels sont mes projets », « trouve mon projet <nom> » call projects.list '
    + '(query: the name); « ouvre le projet <nom> » calls projects.open with the project_id read from projects.list; « crée un projet '
    + '<nom> » calls projects.create; « mes projets favoris » calls projects.list with favorites true; « ajoute <projet> aux favoris » / « retire <projet> des favoris » '
    + 'calls projects.favorite (favorite true / false, project_id from projects.list); « mets l\'outil <outil> dans la bande du projet » calls projects.band_tool (tool_id); « cherche <mot> dans ce projet / dans <projet> » calls projects.search (project_id from '
    + 'projects.list for another project; kind images, videos or sounds when the user names them).';
