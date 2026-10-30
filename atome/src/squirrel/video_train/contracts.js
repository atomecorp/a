import { validateParams } from '../ai/agent_gateway_normalize.js';
import { TRAINING_EXERCISE_IDS } from '../../shared/training_catalog.js';
import { VIDEO_TRAIN_ANCHOR_MAX_MS, VIDEO_TRAIN_MEASURE_SOURCES, VIDEO_TRAIN_REPORT_REASON_MAX, VIDEO_TRAIN_TEXT_MAX } from '../../shared/video_train_contract.js';

// One contract for runtime V2, AI discovery and direct MCP calls (lot L11, cahier FEAT-005): a Sport session's
// summary sent to chosen people and an exercise's thread (VideoTrain) — every action of their screens
// (eVe/domains/video_train/) runs through these commands. The server decides every right (server/news_thread.js).
export const VIDEO_TRAIN_ERRORS = Object.freeze(['INVALID_ARGUMENT', 'AUTH_REQUIRED', 'PRESENTATION_UNAVAILABLE', 'NOT_OPEN',
    'TRAINING_EXERCISE_UNKNOWN', 'news_not_found', 'news_vote_own', 'news_report_own', 'news_retired', 'news_author_required',
    'news_thread_audience_private', 'video_train_people_required', 'video_train_recipient_without_account', 'video_train_reply_empty',
    'news_thread_ref_invalid', 'news_media_format_unsupported', 'video_train_media_without_source', 'video_train_contribution_missing',
    'video_train_nothing_to_answer', 'video_train_measure_source_invalid', 'news_replies_closed', 'news_import_not_allowed', 'news_media_missing',
    'news_thread_owner_required', 'video_train_import_failed', 'news_media_link_only', 'VIDEO_TRAIN_FAILED']);
const exercise_id = { type: 'string', enum: TRAINING_EXERCISE_IDS };
const contribution_id = { type: 'string', minLength: 1, maxLength: 200 };
const ids = { type: 'array', maxItems: 10, uniqueItems: true, items: { type: 'string', minLength: 1, maxLength: 200 } };
const words = { type: 'string', maxLength: VIDEO_TRAIN_TEXT_MAX };
const anchor = { type: 'integer', minimum: 0, maximum: VIDEO_TRAIN_ANCHOR_MAX_MS };
// Whether the people reached may take its media into their own (« Import »); not given: they may not.
const allow_import = { type: 'boolean' };
const measure = { type: 'object', additionalProperties: false, required: ['label', 'value', 'source'], properties: {
    key: { type: 'string', maxLength: 60 }, label: { type: 'string', minLength: 1, maxLength: 80 }, value: { type: 'string', minLength: 1, maxLength: 80 },
    source: { type: 'string', enum: VIDEO_TRAIN_MEASURE_SOURCES } } };
const definitions = {
    share: [{ exercise_id, session_id: { type: 'string', maxLength: 200 }, people: { ...ids, minItems: 1 }, measures: { type: 'array', maxItems: 21, items: measure },
        comment: words, media_atome_ids: ids, allow_import }, ['exercise_id', 'people'],
    'Send a Sport session\'s summary to chosen people (contact or account ids), privately: the exercise, the user as author, only the measures given (label and value as the summary shows them, each with its source: instrumented when a clock or a sensor measured it, typed when the user entered it, computed when derived from other values such as a volume or an estimated energy, declared when the user said it was done; never a heart rate unless the user asks), the user\'s words and, only when the user chose one, media Atome ids. Each picture or video leaves without its EXIF and GPS; a third party\'s video (a YouTube or PeerTube Atome) may not be redistributed and leaves as its link alone (link_only: how many). allow_import true lets those people take its media into their own (only when the user says so). It starts the exercise\'s thread, read by those people alone.', true],
    thread: [{ exercise_id }, ['exercise_id'], 'Read the exercise\'s threads this user may read: each share (origin) newest first with its replies in their original order, each contribution\'s author, kind (video, audio, image, text), anchor_ms in its parent, votes, whether the user voted, mine, retired, replies_open (« Avis »), importable, parent_id (a reply to a reply names its parent), best_id (the best voted video reply, « Mieux noté ») and moderation (how many contributions are reported in the threads the user started). Writes nothing.', false],
    open_thread: [{ exercise_id }, ['exercise_id'], 'Show the exercise\'s thread on the Dashboard surface. Writes nothing.', false],
    open_share: [{ exercise_id, session_id: { type: 'string', maxLength: 200 }, measures: { type: 'array', maxItems: 21, items: { ...measure,
        properties: { ...measure.properties, health: { type: 'boolean' } } } } }, ['exercise_id'],
        'Show « Envoi » of a session on the Dashboard surface (Publier): the summary\'s measures, each with its source, ticked (a health one, such as a heart rate, unticked), the people to choose, the user\'s words, a media only if they add one. Sends nothing.', false],
    play: [{ contribution_id, at_ms: anchor }, ['contribution_id'], 'In the open thread, show a contribution and play it (a video or a sound), from at_ms when given (a reply\'s anchor: the passage it answers, in its parent); again without at_ms, it stops.', false],
    order: [{ best: { type: 'boolean' } }, ['best'], 'In the open thread, « Votes »: best true lays each share\'s best voted video reply first then the others by votes, false the original order.', false],
    reply: [{ contribution_id, anchor_ms: anchor, text: words, media_atome_ids: ids, allow_import },
        ['contribution_id'], 'Reply to a contribution of a thread (a share or a reply) with words or a media Atome (video, sound, picture), at anchor_ms of it when given; refused when its author closed its replies (news_replies_closed).', true],
    vote: [{ contribution_id, on: { type: 'boolean' } }, ['contribution_id'], 'Give (on true, the default) or take back the user\'s one vote on someone else\'s contribution.', true],
    report: [{ contribution_id, reason: { type: 'string', maxLength: VIDEO_TRAIN_REPORT_REASON_MAX } }, ['contribution_id'], 'Report someone else\'s contribution (dangerous, misleading): kept for moderation, it leaves the user\'s thread.', true],
    retire: [{ contribution_id }, ['contribution_id'], 'Withdraw one of the user\'s own contributions, or (« Retir. » in « Signalés ») a contribution of a thread the user started: its words and media go, its replies stay, marked withdrawn.', true],
    replies: [{ contribution_id, open: { type: 'boolean' } }, ['contribution_id', 'open'], '« Avis » on one of the user\'s own contributions: open false closes its replies (no one can reply any more, the replies made stay), true opens them again.', true],
    import: [{ contribution_id }, ['contribution_id'], '« Import »: the contribution\'s media (its clean copy) joins the user\'s own media. Always for the user\'s own contribution; for someone else\'s only when its author allowed it at the send (else news_import_not_allowed); never a third party\'s video, which went as its link alone (news_media_link_only).', true],
    forward: [{ contribution_id, people: { ...ids, minItems: 1 }, comment: words, media_atome_ids: ids, allow_import }, ['contribution_id', 'people'],
        '« Envoi » of one of the user\'s own contributions: the same contribution (its media cleaned again) sent privately to other chosen people (contact or account ids), as a new share of the same exercise\'s thread, the user\'s words before it.', true],
    open_forward: [{ contribution_id }, ['contribution_id'], 'In the open thread, show « Envoi » of one of the user\'s own contributions (Publier: the people to choose, the user\'s words). Sends nothing.', false],
    reported: [{ exercise_id }, ['exercise_id'], '« Signalés »: the contributions reported in the exercise\'s threads the user started, each with its author, anchor_ms and reports (its count of reports). Writes nothing.', false],
    level: [{ level: { type: 'string', enum: ['thread', 'reported'] } }, ['level'], 'In the open thread, show the thread itself or its « Signalés » level (the user\'s threads\' reported contributions). Writes nothing.', false],
    dismiss: [{ contribution_id }, ['contribution_id'], '« Garder » in « Signalés »: the user, owner of the thread, keeps a reported contribution: its reports are dismissed and it leaves « Signalés » (it stays hidden for whoever reported it).', true]
};
export const VIDEO_TRAIN_COMMANDS = Object.freeze(Object.entries(definitions).map(([action, [properties, required, description, persistent]]) => Object.freeze({
    name: `video_train.${action}`, action, description, persistent, capability: persistent ? 'video_train.write' : 'video_train.read',
    input_schema: { type: 'object', additionalProperties: false, properties, required },
    output_schema: { type: 'object', required: ['ok'], properties: { ok: { type: 'boolean' }, error: { type: 'string', enum: VIDEO_TRAIN_ERRORS },
        threads: { type: 'array' }, contribution_id: { type: 'string' }, votes: { type: 'number' }, voted: { type: 'boolean' }, best: { type: 'boolean' },
        delivered: { type: 'number' }, link_only: { type: 'number' }, reported: { type: 'boolean' }, retired: { type: 'boolean' }, replies_open: { type: 'boolean' },
        dismissed: { type: 'boolean' }, moderation: { type: 'number' }, contributions: { type: 'array' }, media_atome_id: { type: 'string' },
        level: { type: 'string' } } }
})));
export const VIDEO_TRAIN_CONFIRMED_COMMANDS = Object.freeze(['video_train.share', 'video_train.retire', 'video_train.forward']);
export const validateVideoTrainInput = (action, input) => {
    const contract = VIDEO_TRAIN_COMMANDS.find(command => command.action === action);
    return contract && validateParams(contract.input_schema, input).ok ? null : 'INVALID_ARGUMENT';
};
export const VIDEO_TRAIN_ASSISTANT_INSTRUCTIONS = 'Sport sharing: « envoie ma séance de pompes à Léa » calls video_train.share with the exercise id, Léa\'s id and the summary\'s measures (training.read_log), never a heart rate unless asked; « prépare l\'envoi de ma séance » video_train.open_share; « montre le fil des pompes » calls video_train.open_thread; « les mieux notées » video_train.order best true; « réponds à la vidéo de Léa : bien vu » video_train.reply; « j\'aime la réponse d\'Hugo » video_train.vote; « signale cette vidéo » video_train.report; « retire mon partage » video_train.retire; « ferme les réponses de ma vidéo » video_train.replies open false; « garde la vidéo de Léa dans mes médias » video_train.import; « envoie aussi ma vidéo à Hugo » video_train.forward; « montre les signalements » video_train.level reported (video_train.reported to read them), « garde-la » video_train.dismiss; « lis le passage auquel Fanny répond » video_train.play on the parent with at_ms her anchor_ms. Vote counts are only for the thread\'s readers: never repeat them to anyone else.';
export const videoTrainError = (error) => {
    const code = String(error?.code || error?.message || error || '').split(':')[0];
    return VIDEO_TRAIN_ERRORS.includes(code) ? code : 'VIDEO_TRAIN_FAILED';
};
