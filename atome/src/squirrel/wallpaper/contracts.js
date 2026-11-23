import { validateParams } from '../ai/agent_gateway_normalize.js';

// The wallpaper, by voice and by MCP: eVe's own wallpaper back (Settings › Visual › Wallpaper « Rétablir le fond par
// défaut »), whatever replaced it. Run by eVe/intuition/tools/background.js#restoreDefaultBackground, the Background
// panel's own owner, kept on the server.
export const WALLPAPER_ERRORS = Object.freeze(['INVALID_ARGUMENT', 'WRITE_FAILED']);
export const WALLPAPER_COMMANDS = Object.freeze([Object.freeze({
    name: 'wallpaper.restore_default', action: 'restore_default', persistent: true, capability: 'wallpaper.write',
    description: 'Put eVe\'s own wallpaper back on every screen at once, whatever replaced it (a colour, an image, a video), kept in the person\'s account.',
    input_schema: { type: 'object', additionalProperties: false, properties: {}, required: [] },
    output_schema: { type: 'object', required: ['ok'], properties: { ok: { type: 'boolean' }, error: { type: 'string', enum: WALLPAPER_ERRORS } } }
})]);
export const validateWallpaperInput = (action, input) => {
    const contract = WALLPAPER_COMMANDS.find(command => command.action === action);
    return contract && validateParams(contract.input_schema, input).ok ? null : 'INVALID_ARGUMENT';
};
export const WALLPAPER_ASSISTANT_INSTRUCTIONS = 'Wallpaper: « remets le fond d\'écran par défaut », « le fond d\'eVe » calls wallpaper.restore_default; done at once.';
