import { validateParams } from '../ai/agent_gateway_normalize.js';

// The system's theme (R-279): Settings › Visual › Theme, by voice and by MCP — the theme chosen, one of the nine colours
// of the theme shown, and a new theme of the person's own keeping the colours shown (mockup 6, validated 23 Nov. 2026).
// Its themes and colour slots are eVe's (eVe/elements/system_ui_themes.js, which the executor checks against); run by
// eVe/intuition/tools/visual_theme_commands.js through the one visual preference writer, kept on the server.
export const VISUAL_THEME_ERRORS = Object.freeze(['INVALID_ARGUMENT', 'THEME_UNKNOWN', 'THEME_EXISTS', 'WRITE_FAILED']);
const SLOTS = Object.freeze(['text', 'surfaceGround', 'ground', 'labelBand', 'pink', 'violet', 'blue', 'peach', 'orchid']);

const theme = { type: 'string', minLength: 1, maxLength: 32, description: 'The theme: « night » (Nuit, the night blue), « amber » (Ambre, the dark grey and orange), or the name of one of the person\'s own themes.' };
const slot = { type: 'string', enum: SLOTS, description: 'The colour: text (the text and glyphs), surfaceGround (the screen\'s ground), ground (the tiles and tools), labelBand (the tiles\' headers), or a tile pastel (pink, violet, blue, peach, orchid).' };
const color = { type: 'string', pattern: '^#[0-9a-fA-F]{6}$', description: 'The colour as #rrggbb.' };
const name = { type: 'string', minLength: 1, maxLength: 32, description: 'The new theme\'s name.' };
const definitions = {
    get: [{}, [], 'Say which theme the screens wear now, its nine colours, and the themes there are.', false, 'read'],
    set: [{ theme }, ['theme'], 'Dress every screen in a theme at once (Settings › Visual › Theme), kept in the person\'s account.', true, 'write'],
    color: [{ slot, color }, ['slot', 'color'], 'Change one of the nine colours of the theme shown, at once, kept in the person\'s account.', true, 'write'],
    create: [{ name }, ['name'], 'Keep the colours shown as a new theme of the person\'s own, under a name, and wear it.', true, 'write']
};
export const VISUAL_THEME_COMMANDS = Object.freeze(Object.entries(definitions).map(([action, [properties, required, description, persistent, access]]) => Object.freeze({
    name: `visual_theme.${action}`, action, description, persistent, capability: `visual_theme.${access}`,
    input_schema: { type: 'object', additionalProperties: false, properties, required },
    output_schema: { type: 'object', required: ['ok'], properties: { ok: { type: 'boolean' }, error: { type: 'string', enum: VISUAL_THEME_ERRORS },
        theme: { type: 'string' }, themes: { type: 'array', items: { type: 'string' } }, unchanged: { type: 'boolean' },
        colors: { type: 'object' }, custom: { type: 'array', items: { type: 'object' } } } }
})));
export const validateVisualThemeInput = (action, input) => {
    const contract = VISUAL_THEME_COMMANDS.find(command => command.action === action);
    return contract && validateParams(contract.input_schema, input).ok ? null : 'INVALID_ARGUMENT';
};
export const VISUAL_THEME_ASSISTANT_INSTRUCTIONS = 'Theme: « mets le thème ambre / orange / gris », « reviens au thème nuit / bleu » calls visual_theme.set with amber, night or the name of a theme of the person\'s own; « mets le texte en vert », « le fond de l\'écran en noir » calls visual_theme.color with its slot and #rrggbb; « garde ces couleurs sous le nom X » calls visual_theme.create; done at once; « quel thème ? » calls visual_theme.get.';
