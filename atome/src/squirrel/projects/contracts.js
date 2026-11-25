import { validateParams } from '../ai/agent_gateway_normalize.js';
import { MEDIA_CONTROL_ACTIONS } from '../media_lists/contracts.js';

// The user's projects, for runtime V2, AI discovery and direct MCP calls, like books: listed and searched
// as the Trouver panel lists and searches them, created and opened by the very tools of the interface
// (`ui.new_project`, `ui.project.open`). Run by eVe/domains/projects/projects_runtime.js.
export const PROJECTS_ERRORS = Object.freeze(['INVALID_ARGUMENT', 'NOT_FOUND', 'NO_PROJECT', 'CREATE_FAILED', 'OPEN_FAILED', 'FAVORITE_FAILED', 'DELETE_FAILED',
    'PRESENTATION_UNAVAILABLE', 'BAND_TOOL_UNKNOWN', 'BAND_TOOL_FAILED', 'MEDIA_FAILED', 'ORDER_FAILED', 'FOLDER_FAILED', 'MOVE_FAILED', 'RENAME_FAILED', 'RENDER_FAILED',
    'PROXY_PENDING', 'LISTEN_ONLY']);
// The Trouver panel's categories that hold a project's objects.
export const PROJECT_SEARCH_KINDS = Object.freeze(['all', 'images', 'videos', 'sounds']);
// A project's type, as the Projets rubric's Type tool keeps it (eVe/domains/projects/project_type.js).
export const PROJECT_TYPES = Object.freeze(['health', 'code', 'creation', 'site']);
// The order the Projets rubric lays its projects in, as its Date / Nom tool sets it (user, 17 Nov. 2026).
export const PROJECT_ORDERS = Object.freeze(['date', 'name']);

const id = { type: 'string', minLength: 1, maxLength: 200 };
const text = { type: 'string', minLength: 1, maxLength: 200, pattern: '\\S' };
const limit = { type: 'integer', minimum: 1, maximum: 200 };
const definitions = {
    list: [{ query: text, limit, favorites: { type: 'boolean' }, type: { type: 'string', enum: PROJECT_TYPES } }, [], 'List the user\'s projects, last changed first: project_id, name, whether it is a favourite, and which one is current (open, or last opened while the Dashboard shows). `query` keeps the projects whose name holds it; `favorites` true keeps the favourites only, as the Dashboard\'s Favori tool does; `type` keeps one type (health, code, creation, or site: a project that has its website), as its Type tool does.', false],
    create: [{ name: { type: 'string', minLength: 1, maxLength: 512, pattern: '\\S' } }, [],
        'Create a new empty project (named `name`, else the next default name) and open it. Returns its project_id.', true],
    open: [{ project_id: id }, ['project_id'], 'Open one of the user\'s projects (its project_id from projects.list), or one another person shares with the user (atome_id from share.folders) where their access is read (opened to read) or write. LISTEN_ONLY: the user only listens to it (projects.proxy_play plays it).', false],
    favorite: [{ project_id: id, favorite: { type: 'boolean' } }, ['project_id', 'favorite'],
        'Add one of the user\'s projects to the favourites (favorite true) or take it out of them (false), as a hold on its Dashboard tile does.', true],
    order: [{ order: { type: 'string', enum: PROJECT_ORDERS } }, ['order'],
        'Lay the Dashboard\'s projects (Projets, Réalisations › Créations) by date (the one last used first, then the last changed) or by name (alphabetical), as the rubric\'s Date / Nom tool does; kept in the account.', true],
    // Médiathèque › Données (R-202): a folder is a project marked as a folder, nested in another (parent_id).
    folder: [{ name: text, parent_id: id }, [],
        'Create a folder in Médiathèque › Données (inside the folder parent_id, from projects.list, else at its root), as its « Dossier » tool does; named `name`, else « Dossier ». Returns its project_id.', true],
    move: [{ atome_id: id, folder_id: id }, ['atome_id', 'folder_id'],
        'Move a file or a folder of Médiathèque › Données (atome_id) into a folder (folder_id), as carrying it onto that folder does. A folder never goes into one of its own.', true],
    rename: [{ project_id: id, name: { type: 'string', minLength: 1, maxLength: 512, pattern: '\\S' } }, ['project_id', 'name'],
        'Rename one of the user\'s projects or Données folders (its project_id from projects.list), as « Nom » in its hold does.', true],
    data_order: [{ order: { type: 'string', enum: PROJECT_ORDERS } }, ['order'],
        'Lay Médiathèque › Données by name (alphabetical, the default) or by date (the last changed first), as its Nom / Date tool does; kept in the account.', true],
    delete: [{ project_id: id }, ['project_id'],
        'Delete one of the user\'s projects (its project_id from projects.list) with everything it holds, as « Supprimer » in a hold on its Dashboard tile does. Ask the user before calling it.', true],
    band_tool: [{ tool_id: id, project_id: id }, ['tool_id'],
        'Lay a tool in a project\'s bottom tool band (the current project when project_id is not given), as laying it from Trouver › Outils onto the project does; kept once. Returns its band key.', true],
    media: [{ action: { type: 'string', enum: MEDIA_CONTROL_ACTIONS }, atome_id: id }, ['action'],
        'Act on a media of the current project as its touches do outside Édition (D23): its controls over the picture shown (controls) or hidden (hide_controls), '
        + 'the whole screen (fullscreen, atome_id the media) or back (exit_fullscreen), the next or previous media of the project on the whole screen, '
        + 'resume (play), pause, ten seconds back (rewind) or ahead (forward). atome_id: the media (projects.search kind videos, images or sounds); '
        + 'without it, the one on the whole screen. NOT_FOUND: no such media; NO_PROJECT: no project shown.', false],
    // R-349: the light proxy a project shared at « Écoute » is heard by (eVe/core/media_engine/project_proxy_render.js).
    proxy_render: [{ project_id: id }, ['project_id'],
        'Render one of the user\'s projects (its project_id from projects.list) into its light proxy, the one a person it is shared with at « Écoute » plays, replacing the previous one: an MP4 (its picture and its sound) when something is seen, else its sound alone; eVe renders it by itself once the project is shared and after it changes. Returns proxy_id, mime and duration_seconds. RENDER_FAILED: the project has no sound or its engine refused it.', true],
    // R-349 lot 3b: a project shared with the user, played as its card's touch plays it (eVe/domains/dashboard/dashboard_projects_proxy.js).
    proxy_play: [{ project_id: id }, ['project_id'],
        'Play the light proxy of a project another person shares with the user (its project_id: atome_id from share.folders) as a media on the Dashboard, as a touch on its card does; where the user\'s access is read or write and no proxy is rendered yet, the project opens instead. NOT_FOUND: no such project shared with the user; PROXY_PENDING: the user only listens and its proxy is not rendered yet; PRESENTATION_UNAVAILABLE: no Dashboard shown.', false],
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
        total: { type: 'integer' }, proxy_id: { type: 'string' }, duration_seconds: { type: 'number' } } }
})));
export const validateProjectsInput = (action, input) => {
    const contract = PROJECTS_COMMANDS.find(command => command.action === action);
    return contract && validateParams(contract.input_schema, input).ok ? null : 'INVALID_ARGUMENT';
};
export const PROJECTS_ASSISTANT_INSTRUCTIONS = 'Données (the download folder of the Médiathèque, R-202): « crée un dossier <nom> » calls projects.folder (parent_id: the folder it goes in, from projects.list); « mets <fichier> dans <dossier> » calls projects.move; « renomme <dossier> en <nom> » calls projects.rename; « range Données par date / par nom » calls projects.data_order. '
    + 'Projects: « quels sont mes projets », « trouve mon projet <nom> » call projects.list '
    + '(query: the name); « ouvre le projet <nom> » calls projects.open with the project_id read from projects.list; « crée un projet '
    + '<nom> » calls projects.create; « mes projets favoris » calls projects.list with favorites true; « supprime le projet <nom> » calls projects.delete with the project_id read from projects.list, once the user confirmed; « ajoute <projet> aux favoris » / « retire <projet> des favoris » '
    + 'calls projects.favorite (favorite true / false, project_id from projects.list); « range mes projets par nom / par date » calls projects.order (name / date); « mets cette vidéo en plein écran », « la suivante », « montre les commandes » on a project\'s media calls projects.media; « mets l\'outil <outil> dans la bande du projet » calls projects.band_tool (tool_id); « fais l\'aperçu du projet <nom> », « mets à jour l\'écoute de <projet> » calls projects.proxy_render (project_id from projects.list); « lis / écoute le projet partagé <nom> » calls projects.proxy_play (project_id: atome_id from share.folders), then « ouvre-le » calls projects.open with that project_id (LISTEN_ONLY when the user only listens); « cherche <mot> dans ce projet / dans <projet> » calls projects.search (project_id from '
    + 'projects.list for another project; kind images, videos or sounds when the user names them).';
