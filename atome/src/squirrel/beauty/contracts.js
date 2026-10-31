import { validateParams } from '../ai/agent_gateway_normalize.js';

// One contract for runtime V2, AI discovery and direct MCP calls: Activité › Bien-être › Beauté (R-006 Q68, validated by the
// user on 2026-10-31): photos of the same pose taken over time, the last one shown faintly over the camera to take it again
// the same way, two dates of a pose side by side, a weekly reminder in the personal calendar
// (eVe/domains/beauty/beauty_runtime.js). The photos are the person's own media (one capture path, AGENTS.md rule 18).
export const BEAUTY_POSES = Object.freeze(['front', 'three_quarter', 'profile_left', 'profile_right']);
export const BEAUTY_ZONES = Object.freeze(['face', 'body', 'hands', 'hair']);
export const BEAUTY_VIEWS = Object.freeze(['shot', 'compare']);
export const BEAUTY_ERRORS = Object.freeze(['INVALID_ARGUMENT', 'AUTH_REQUIRED', 'PRESENTATION_UNAVAILABLE', 'CALENDAR_UNAVAILABLE', 'BEAUTY_WRITE_FAILED',
    'BEAUTY_CAPTURE_FAILED', 'BEAUTY_PHOTO_NOT_FOUND']);
const id = { type: 'string', minLength: 1, maxLength: 200 };
const pose = { type: 'string', enum: BEAUTY_POSES, description: 'front (« de face »), three_quarter (3/4), profile_left, profile_right.' };
const zone = { type: 'string', enum: BEAUTY_ZONES, description: 'face (Visage), body (Corps), hands (Mains), hair (Cheveux).' };
const day = { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$', maxLength: 10 };
const media = { type: 'object', additionalProperties: false, required: ['id', 'file_name'], properties: { id, file_name: id,
    file_path: { type: 'string', maxLength: 500 }, owner_id: { type: 'string', maxLength: 200 }, mime_type: { type: 'string', maxLength: 120 },
    width: { type: 'number', minimum: 0 }, height: { type: 'number', minimum: 0 } } };
const definitions = {
    open: [{ view: { type: 'string', enum: BEAUTY_VIEWS }, pose, zone, from: day, to: day }, [],
        'Show the Beauté card on the Dashboard surface: view shot (default) the guided shot of pose and zone (the camera, the last photo of that pose shown faintly over it), view compare (« Suivi ») two photos of that pose side by side, from and to the days compared (the nearest photo of each; the first and the last by default). Writes nothing.', false],
    list_photos: [{ pose, zone }, [], 'List the Beauté photos (newest first), of one pose and zone when given: id (a media Atome of the person), pose, zone, at.', false],
    shoot: [{ pose, zone }, [], 'Take a Beauté photo now with the camera on the Beauté card (opened on its guided shot first, pose and zone chosen when given): it joins the person\'s media and the Beauté photos. Returns photo.', true],
    add_photo: [{ media, pose, zone }, ['media', 'pose', 'zone'], 'File one of the person\'s media (a photo just taken by the one capture path, or chosen from their media) as a Beauté photo of pose and zone.', true],
    read_reminder: [{}, [], 'Read the Beauté reminder: its weekly event in the personal calendar (event_id, weekday 0 = Monday, hour), or null.', false],
    set_reminder: [{ on: { type: 'boolean' }, weekday: { type: 'integer', minimum: 0, maximum: 6 }, hour: { type: 'integer', minimum: 5, maximum: 22 } }, ['on'],
        'Turn the Beauté reminder on (a weekly event with its alarm in the personal calendar, on weekday, 0 = Monday, today\'s by default, at hour, 9 by default) or off (its event removed).', true]
};
export const BEAUTY_COMMANDS = Object.freeze(Object.entries(definitions).map(([action, [properties, required, description, persistent]]) => Object.freeze({
    name: `beauty.${action}`, action, description, persistent, capability: persistent ? 'beauty.write' : 'beauty.read',
    input_schema: { type: 'object', additionalProperties: false, properties, required },
    output_schema: { type: 'object', required: ['ok'], properties: { ok: { type: 'boolean' }, error: { type: 'string', enum: BEAUTY_ERRORS },
        photos: { type: 'array' }, photo: { type: ['object', 'null'] }, reminder: { type: ['object', 'null'] }, view: { type: 'string' } } }
})));
export const validateBeautyInput = (action, input) => {
    const contract = BEAUTY_COMMANDS.find(command => command.action === action);
    return contract && validateParams(contract.input_schema, input).ok ? null : 'INVALID_ARGUMENT';
};
export const BEAUTY_ASSISTANT_INSTRUCTIONS = 'Beauté: « prends ma photo beauté de face » calls beauty.shoot with pose front (zone face unless said); « montre mon suivi beauté », « compare mon visage du 2 octobre et d\'aujourd\'hui » call beauty.open with view compare and from / to; « rappelle-moi ma photo beauté chaque dimanche » calls beauty.set_reminder on true weekday 6; « plus de rappel beauté » with on false.';
export const beautyError = error => BEAUTY_ERRORS.includes(error?.code || error?.message || error) ? (error?.code || error?.message || error) : 'BEAUTY_WRITE_FAILED';
