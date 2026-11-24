import { validateParams } from '../ai/agent_gateway_normalize.js';

// The Dashboard's captures (Audio, Vidéo, Photo, Texte dicté, MIDI) and the lists of what they and
// Créer made (user, 27 Oct. 2026): one contract for runtime V2, AI discovery and direct MCP calls,
// run by eVe/domains/capture/capture_runtime.js through the list on screen — the same owners as its
// band (Enreg., Arrêter, Caméra, Aperçu, Préc., Lire, Suiv., Suppr.). An item is named by its `atome_id`
// (captures.state gives the open list's).
export const CAPTURE_ERRORS = Object.freeze(['INVALID_ARGUMENT', 'NOT_OPEN', 'NOT_FOUND', 'NOTHING_PLAYING', 'NOTHING_RECORDING',
    'PROJECT_UNAVAILABLE', 'PRESENTATION_UNAVAILABLE', 'CAMERA_UNAVAILABLE', 'TAKE_EMPTY', 'WRITE_FAILED']);
export const CAPTURE_KINDS = Object.freeze(['audio', 'video', 'photo', 'text', 'midi']);

const id = { type: 'string', minLength: 1, maxLength: 200 };
const definitions = {
    state: [{}, [], 'The list open on the Dashboard (a capture\'s or a creation\'s): its items (atome_id, kind, label, newest last), the current one, whether its preview shows, what plays and whether a take records.', false, 'read'],
    start: [{ kind: { type: 'string', enum: CAPTURE_KINDS }, duration_seconds: { type: 'number', minimum: 1, maximum: 86400 } }, ['kind'],
        'Open a capture on the Dashboard and start it at once in the last project: a sound, a video, the photo camera, a dictated text, a MIDI take. Its list shows under the preview. '
        + 'duration_seconds (not for a photo): the take stops by itself that long after it really started, and is kept (« filme pendant 10 secondes »); '
        + 'the result gives its take and stops_at.', true, 'write'],
    stop: [{ take: { type: 'integer', minimum: 1 } }, [], 'End the take recording (it is kept and becomes current in its list). '
        + 'take: only that take (the number captures.start gave); another one recording is left alone (NOTHING_RECORDING). '
        + 'TAKE_EMPTY: the take stopped but held nothing (silence, no picture), so nothing was kept.', true, 'write'],
    close: [{}, [], 'Close the capture open on the Dashboard (its bottom record tool): a take recording is stopped and kept, the camera turned off; '
        + 'a capture begun from a list (Créer) gives that list back.', true, 'write'],
    camera: [{}, [], 'Film with the next camera while one shows (Dashboard capture, a take on a project, the import panel): the photo camera reopens on it; '
        + 'a video take ends there, kept, and the next take starts at once on it. CAMERA_UNAVAILABLE: no camera showing, or only one camera.', true, 'write'],
    show: [{ atome_id: id, step: { type: 'string', enum: ['previous', 'next'] } }, [],
        'Make an item of the open list current (shown in its preview, nothing playing): by its atome_id, or the one before or after (Préc., Suiv.).', false, 'control'],
    play: [{ atome_id: id }, [], 'Play an item of the open list (the current one when none is given): a sound, a video in the preview, a text read aloud. Played again: it stops.', false, 'control'],
    pause: [{}, [], 'Pause the sound or video playing in the open list, or play it on.', false, 'control'],
    preview: [{ visible: { type: 'boolean' } }, ['visible'], 'Show or take away the open list\'s preview (Aperçu); taken away, the rows fill the list.', false, 'control'],
    fullscreen: [{ enabled: { type: 'boolean' } }, ['enabled'], 'Put the item shown in the open list on the whole screen, or give the list back (its double touch).', false, 'control'],
    delete: [{ atome_ids: { type: 'array', minItems: 1, maxItems: 500, items: id } }, ['atome_ids'],
        'Delete items of the open list from their project (Suppr.).', true, 'write']
};
const itemSchema = { type: 'object', properties: { atome_id: { type: 'string' }, kind: { type: 'string' }, label: { type: 'string' } } };
export const CAPTURE_COMMANDS = Object.freeze(Object.entries(definitions).map(([action, [properties, required, description, persistent, access]]) => Object.freeze({
    name: `captures.${action}`, action, description, persistent, capability: `captures.${access}`,
    input_schema: { type: 'object', additionalProperties: false, properties, required },
    output_schema: { type: 'object', required: ['ok'], properties: { ok: { type: 'boolean' }, error: { type: 'string', enum: CAPTURE_ERRORS },
        open: { type: 'boolean' }, project_id: { type: 'string' }, current: { type: 'string' }, previewing: { type: 'boolean' }, playing: { type: 'string' },
        recording: { type: 'boolean' }, take: { type: 'integer' }, stops_at: { type: 'string' }, items: { type: 'array', items: itemSchema }, removed: { type: 'array', items: { type: 'string' } } } }
})));
export const validateCaptureInput = (action, input) => {
    const contract = CAPTURE_COMMANDS.find(command => command.action === action);
    return contract && validateParams(contract.input_schema, input).ok ? null : 'INVALID_ARGUMENT';
};
// A take the recorder refuses for holding nothing (audio_core_record_persist.js, the video recorder's empty output) stopped
// all the same: it answers TAKE_EMPTY, never a failed write.
const EMPTY_TAKE_CAUSES = Object.freeze(['audio_recording_empty', 'video_recording_empty_output']);
export const captureError = (error) => {
    const cause = error?.code || error?.message || error;
    if (EMPTY_TAKE_CAUSES.includes(cause)) return 'TAKE_EMPTY';
    return CAPTURE_ERRORS.includes(cause) ? cause : 'WRITE_FAILED';
};
export const CAPTURE_ASSISTANT_INSTRUCTIONS = 'Captures and their lists: « enregistre un son / une vidéo », « prends une photo », « dicte un texte » call captures.start '
    + '(kind audio, video, photo, text); a length asked (« filme pendant 10 secondes », « enregistre 30 secondes de son », « dicte pendant une minute ») '
    + 'is its duration_seconds, never a stop called yourself; « arrête » during a take calls captures.stop; « arrête dans 2 minutes » calls timer.schedule '
    + 'with tool captures.stop and delay_seconds 120; « ferme la capture » captures.close; « change de caméra », « l\'autre caméra » captures.camera. On the list open: captures.state gives its items; « la précédente », '
    + '« la suivante » call captures.show (step); « lis-la », « joue-la », « lis-moi ce texte » captures.play; « pause » captures.pause; « cache / montre l\'aperçu » '
    + 'captures.preview; « plein écran », « sors du plein écran » captures.fullscreen; « supprime-la » captures.delete with the atome_id of the current item (captures.state). Never invent an atome_id.';
