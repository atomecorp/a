import { validateParams } from '../ai/agent_gateway_normalize.js';

// The import panel (AGENTS.md rule 18): the one import of eVe, for a project (`import`) and for
// every media choice (a wallpaper, a photo, a picture to retouch). One contract for runtime V2,
// AI discovery and direct MCP calls; eVe/intuition/tools/media_import_commands.js runs each
// command through the panel's own intents, exactly as its band tools and pictures do.
// A media of the person is named by its `media_id` (media_import.list gives them).
export const MEDIA_IMPORT_ERRORS = Object.freeze(['INVALID_ARGUMENT', 'NOT_OPEN', 'NOT_FOUND', 'SOURCE_UNAVAILABLE', 'CAMERA_UNAVAILABLE',
    'NOTHING_CHOSEN', 'IMPORT_FAILED']);
export const MEDIA_IMPORT_KINDS = Object.freeze(['image', 'video', 'audio']);

const id = { type: 'string', minLength: 1, maxLength: 600 };
const definitions = {
    state: [{}, [], 'What the import panel shows now: open or not, what it asks for (kinds; a choice for something, or an import into the project), the source shown, the media chosen, the camera.', false, 'read'],
    list: [{ kind: { type: 'string', enum: MEDIA_IMPORT_KINDS }, limit: { type: 'integer', minimum: 1, maximum: 200 } }, [],
        'List the person\'s own media (pictures, videos, sounds), newest first: media_id, name, kind, date.', false, 'read'],
    open: [{}, [], 'Open the import panel to import media into the current project (the project\'s Import tool); the user sees it.', false, 'control'],
    source: [{ view: { type: 'string', enum: ['medias', 'album', 'files'] } }, ['view'],
        'In the open import panel: show the person\'s media (medias), the device\'s album, or outside files.', false, 'control'],
    camera: [{ kind: { type: 'string', enum: ['photo', 'video'] } }, ['kind'],
        'In the open import panel: turn the camera on for a photo, or start recording a video.', false, 'control'],
    take: [{}, [], 'In the open import panel: take the photo the camera shows, or stop the video being recorded; the take joins the person\'s media and is chosen.', true, 'control'],
    choose: [{ media_ids: { type: 'array', minItems: 1, maxItems: 50, items: id }, confirm: { type: 'boolean' } }, [],
        'In the open import panel: choose media of the person (media_ids, from media_import.list), then, unless confirm is false, give the choice to what asked for it (Choix) or import it into the project (Import).', true, 'control'],
    close: [{}, [], 'Close the import panel without choosing anything.', false, 'control']
};
const mediaSchema = { type: 'object', properties: { media_id: { type: 'string' }, name: { type: 'string' }, kind: { type: 'string' }, date: { type: 'string' } } };
export const MEDIA_IMPORT_COMMANDS = Object.freeze(Object.entries(definitions).map(([action, [properties, required, description, persistent, access]]) => Object.freeze({
    name: `media_import.${action}`, action, description, persistent, capability: `media_import.${access}`,
    input_schema: { type: 'object', additionalProperties: false, properties, required },
    output_schema: { type: 'object', required: ['ok'], properties: { ok: { type: 'boolean' }, error: { type: 'string', enum: MEDIA_IMPORT_ERRORS },
        open: { type: 'boolean' }, media: { type: 'array', items: mediaSchema }, chosen: { type: 'array', items: mediaSchema },
        kinds: { type: 'array', items: { type: 'string' } }, picking: { type: 'boolean' }, source: { type: 'string' }, camera: { type: 'string' } } }
})));
export const validateMediaImportInput = (action, input) => {
    const contract = MEDIA_IMPORT_COMMANDS.find(command => command.action === action);
    return contract && validateParams(contract.input_schema, input).ok ? null : 'INVALID_ARGUMENT';
};
export const MEDIA_IMPORT_ASSISTANT_INSTRUCTIONS = 'Import (one panel for every import): « importe une image / une vidéo » in a project calls media_import.open; while the import panel is open (media_import.state says what it asks for: a wallpaper, a photo, a picture to retouch), « montre mes photos » calls media_import.source with view medias, « prends une photo » media_import.camera photo then media_import.take, « filme » media_import.camera video then media_import.take to stop, « prends celle de la montagne » media_import.list then media_import.choose with its media_id. Never invent a media_id.';
