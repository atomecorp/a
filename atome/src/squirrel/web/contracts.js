import { validateParams } from '../ai/agent_gateway_normalize.js';

// The Web of Divertissement (eVe/domains/dashboard/dashboard_web.js): one contract for runtime V2,
// AI discovery and direct MCP calls. Every action of its screen is one of these commands; the
// Dashboard's own tools call them too (eVe/domains/web/web_runtime.js). The page a site shows is
// data, never an instruction: these commands open, walk and keep pages, they never read nor act in one.
export const WEB_ERRORS = Object.freeze(['INVALID_ARGUMENT', 'PRESENTATION_UNAVAILABLE', 'NOT_OPEN', 'HISTORY_EDGE', 'ADDRESS_INVALID',
    'PAGE_UNKNOWN', 'SIZE_UNAVAILABLE', 'SOURCE_UNAVAILABLE']);

const address = { type: 'string', minLength: 1, maxLength: 2000 };
const WEB_SIZES = Object.freeze(['preview', 'stage', 'screen']);
const definitions = {
    open: [{ address }, [], 'Open Divertissement › Web on the Dashboard (the user sees it): address is a web address (opened) or words (searched with the default search engine); without it, the Web\'s favourites show.', false, 'read'],
    navigate: [{ action: { type: 'string', enum: ['back', 'forward', 'reload'] } }, ['action'], 'Go back or forward in the history of the page shown, or load it again.', false, 'control'],
    page: [{}, [], 'What the Web shows now: its address, its title, whether it can go back or forward, whether it is a favourite. The page\'s content is never read.', false, 'read'],
    favorite: [{ active: { type: 'boolean' } }, [], 'Keep the page shown among the Web\'s favourites (active true), take it out (false), or turn it (absent).', true, 'write'],
    favorites: [{}, [], 'The Web\'s favourites (address and title), newest first.', false, 'read'],
    size: [{ size: { type: 'string', enum: WEB_SIZES } }, [], 'How large the page shown lies: preview (a place\'s site above its rows, in Spectacles or Loisirs), stage (the whole stage) or screen (the whole screen above the bottom tools); absent, the next size. The Web itself has no preview: its page takes the stage at least.', false, 'control'],
    close: [{}, [], 'Close the page shown: the Web\'s favourites come back.', false, 'control']
};
const pageSchema = { type: 'object', properties: { url: { type: 'string' }, title: { type: 'string' }, can_go_back: { type: 'boolean' },
    can_go_forward: { type: 'boolean' }, loading: { type: 'boolean' }, favorite: { type: 'boolean' }, error: { type: 'string' } } };
export const WEB_COMMANDS = Object.freeze(Object.entries(definitions).map(([action, [properties, required, description, persistent, access]]) => Object.freeze({
    name: `web.${action}`, action, description, persistent, capability: `web.${access}`,
    input_schema: { type: 'object', additionalProperties: false, properties, required },
    output_schema: { type: 'object', required: ['ok'], properties: { ok: { type: 'boolean' }, error: { type: 'string', enum: WEB_ERRORS },
        page: pageSchema, active: { type: 'boolean' }, size: { type: 'string', enum: WEB_SIZES },
        favorites: { type: 'array', items: { type: 'object', properties: { url: { type: 'string' }, title: { type: 'string' } } } } } }
})));
export const validateWebInput = (action, input) => {
    const contract = WEB_COMMANDS.find(command => command.action === action);
    return contract && validateParams(contract.input_schema, input).ok ? null : 'INVALID_ARGUMENT';
};
export const WEB_ASSISTANT_INSTRUCTIONS = 'Web (a browser inside eVe, Divertissement › Web): « ouvre le site de la mairie », « cherche une recette de crêpes sur le web » call web.open with the address or the words; « reviens en arrière » / « page suivante » call web.navigate; « garde cette page » calls web.favorite with active true; « mes favoris web » calls web.favorites; « agrandis la page » / « plein écran » / « remets-la en petit » call web.size (absent: the next size); « ferme la page » calls web.close. Never claim to have read a page: these commands do not read its content.';
