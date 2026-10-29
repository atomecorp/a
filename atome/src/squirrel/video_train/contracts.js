import { validateParams } from '../ai/agent_gateway_normalize.js';
import { TRAINING_EXERCISE_IDS } from '../../shared/training_catalog.js';
import { VIDEO_TRAIN_ANCHOR_MAX_MS, VIDEO_TRAIN_REPORT_REASON_MAX, VIDEO_TRAIN_TEXT_MAX } from '../../shared/video_train_contract.js';

// One contract for runtime V2, AI discovery and direct MCP calls (lot L11, cahier FEAT-005): a Sport session's
// summary sent to chosen people and an exercise's thread (VideoTrain) — every action of their screens
// (eVe/domains/video_train/) runs through these commands. The server decides every right (server/news_thread.js).
export const VIDEO_TRAIN_ERRORS = Object.freeze(['INVALID_ARGUMENT', 'AUTH_REQUIRED', 'PRESENTATION_UNAVAILABLE', 'NOT_OPEN',
    'TRAINING_EXERCISE_UNKNOWN', 'news_not_found', 'news_vote_own', 'news_report_own', 'news_retired', 'news_author_required',
    'news_thread_audience_private', 'video_train_people_required', 'video_train_recipient_without_account', 'video_train_reply_empty',
    'news_thread_ref_invalid', 'news_media_format_unsupported', 'video_train_media_without_source', 'video_train_contribution_missing',
    'video_train_nothing_to_answer', 'VIDEO_TRAIN_FAILED']);
const exercise_id = { type: 'string', enum: TRAINING_EXERCISE_IDS };
const contribution_id = { type: 'string', minLength: 1, maxLength: 200 };
const ids = { type: 'array', maxItems: 10, uniqueItems: true, items: { type: 'string', minLength: 1, maxLength: 200 } };
const words = { type: 'string', maxLength: VIDEO_TRAIN_TEXT_MAX };
const measure = { type: 'object', additionalProperties: false, required: ['label', 'value'], properties: {
    key: { type: 'string', maxLength: 60 }, label: { type: 'string', minLength: 1, maxLength: 80 }, value: { type: 'string', minLength: 1, maxLength: 80 } } };
const definitions = {
    share: [{ exercise_id, session_id: { type: 'string', maxLength: 200 }, people: { ...ids, minItems: 1 }, measures: { type: 'array', maxItems: 21, items: measure },
        comment: words, media_atome_ids: ids }, ['exercise_id', 'people'],
    'Send a Sport session\'s summary to chosen people (contact or account ids), privately: the exercise, the user as author, only the measures given (label and value as the summary shows them; never a heart rate unless the user asks), the user\'s words and, only when the user chose one, media Atome ids. Each picture or video leaves without its EXIF and GPS. It starts the exercise\'s thread, read by those people alone.', true],
    thread: [{ exercise_id }, ['exercise_id'], 'Read the exercise\'s threads this user may read: each share (origin) newest first with its replies in their original order, each contribution\'s author, kind (video, audio, image, text), anchor_ms in its parent, votes, whether the user voted, mine, retired, and best_id (the best voted video reply, « Mieux noté »). Writes nothing.', false],
    open_thread: [{ exercise_id }, ['exercise_id'], 'Show the exercise\'s thread on the Dashboard surface. Writes nothing.', false],
    open_share: [{ exercise_id, session_id: { type: 'string', maxLength: 200 }, measures: { type: 'array', maxItems: 21, items: { ...measure,
        properties: { ...measure.properties, health: { type: 'boolean' } } } } }, ['exercise_id'],
        'Show « Envoi » of a session on the Dashboard surface (Publier): the summary\'s measures ticked (a health one, such as a heart rate, unticked), the people to choose, the user\'s words, a media only if they add one. Sends nothing.', false],
    play: [{ contribution_id }, ['contribution_id'], 'In the open thread, show a contribution and play it (a video or a sound); again, it stops.', false],
    order: [{ best: { type: 'boolean' } }, ['best'], 'In the open thread, « Votes »: best true lays each share\'s best voted video reply first then the others by votes, false the original order.', false],
    reply: [{ contribution_id, anchor_ms: { type: 'integer', minimum: 0, maximum: VIDEO_TRAIN_ANCHOR_MAX_MS }, text: words, media_atome_ids: ids },
        ['contribution_id'], 'Reply to a contribution of a thread (a share or a reply) with words or a media Atome (video, sound, picture), at anchor_ms of it when given.', true],
    vote: [{ contribution_id, on: { type: 'boolean' } }, ['contribution_id'], 'Give (on true, the default) or take back the user\'s one vote on someone else\'s contribution.', true],
    report: [{ contribution_id, reason: { type: 'string', maxLength: VIDEO_TRAIN_REPORT_REASON_MAX } }, ['contribution_id'], 'Report someone else\'s contribution (dangerous, misleading): kept for moderation, it leaves the user\'s thread.', true],
    retire: [{ contribution_id }, ['contribution_id'], 'Withdraw one of the user\'s own contributions: its words and media go, its replies stay, marked withdrawn.', true]
};
export const VIDEO_TRAIN_COMMANDS = Object.freeze(Object.entries(definitions).map(([action, [properties, required, description, persistent]]) => Object.freeze({
    name: `video_train.${action}`, action, description, persistent, capability: persistent ? 'video_train.write' : 'video_train.read',
    input_schema: { type: 'object', additionalProperties: false, properties, required },
    output_schema: { type: 'object', required: ['ok'], properties: { ok: { type: 'boolean' }, error: { type: 'string', enum: VIDEO_TRAIN_ERRORS },
        threads: { type: 'array' }, contribution_id: { type: 'string' }, votes: { type: 'number' }, voted: { type: 'boolean' }, best: { type: 'boolean' },
        delivered: { type: 'number' }, reported: { type: 'boolean' }, retired: { type: 'boolean' } } }
})));
export const VIDEO_TRAIN_CONFIRMED_COMMANDS = Object.freeze(['video_train.share', 'video_train.retire']);
export const validateVideoTrainInput = (action, input) => {
    const contract = VIDEO_TRAIN_COMMANDS.find(command => command.action === action);
    return contract && validateParams(contract.input_schema, input).ok ? null : 'INVALID_ARGUMENT';
};
export const VIDEO_TRAIN_ASSISTANT_INSTRUCTIONS = 'Sport sharing: « envoie ma séance de pompes à Léa » calls video_train.share with the exercise id, Léa\'s id and the summary\'s measures (training.read_log), never a heart rate unless asked; « prépare l\'envoi de ma séance » video_train.open_share; « montre le fil des pompes » calls video_train.open_thread; « les mieux notées » video_train.order best true; « réponds à la vidéo de Léa : bien vu » video_train.reply; « j\'aime la réponse d\'Hugo » video_train.vote; « signale cette vidéo » video_train.report; « retire mon partage » video_train.retire. Vote counts are only for the thread\'s readers: never repeat them to anyone else.';
export const videoTrainError = (error) => {
    const code = String(error?.code || error?.message || error || '').split(':')[0];
    return VIDEO_TRAIN_ERRORS.includes(code) ? code : 'VIDEO_TRAIN_FAILED';
};
