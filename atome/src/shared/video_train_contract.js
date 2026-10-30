// VideoTrain (cahier FEAT-005, lot L11, user defaults of 28 Oct. 2026): an exercise's thread of News
// publications. A session shared to chosen people is a thread's origin (`thread_ref` = the exercise);
// replies (video, sound, picture or text) carry their parent and the moment of it they answer
// (`anchor_ms`). One vote per voter and contribution, counted by the server and shown only to the thread's
// readers. « Votes » lit: the best voted accessible video reply first (« Mieux noté »), then the others by
// votes; ties go to the older, then to the id. Shared by the server (server/news_thread.js) and the
// client (eVe/domains/video_train/).

export const VIDEO_TRAIN_KINDS = Object.freeze(['video', 'audio', 'image', 'text']);
export const VIDEO_TRAIN_TEXT_MAX = 2000;
export const VIDEO_TRAIN_ANCHOR_MAX_MS = 24 * 3600 * 1000;
export const VIDEO_TRAIN_REPORT_REASON_MAX = 300;
// A contribution whose author allowed, at its send, the people it reaches to take its media into their own
// (« Import », validated mockup r005_08, user 2026-10-30): its publication carries this property, true.
export const VIDEO_TRAIN_IMPORT_PROPERTY = 'video_train_import';
// Where a shared measure comes from (cahier FEAT-005): `instrumented` (a clock or a sensor measured it), `typed` (the
// person entered it), `computed` (eVe derived it from other values: a volume, an estimated energy, a count from a time
// and a tempo), `declared` (the person said it was done). Each measure leaves with its source, in its data and its text.
export const VIDEO_TRAIN_MEASURE_SOURCES = Object.freeze(['instrumented', 'typed', 'computed', 'declared']);
const THREAD_REF = /^training:[a-z0-9_]{1,80}$/;

export const trainingThreadRef = exerciseId => `training:${String(exerciseId || '').trim()}`;
export const isVideoTrainThreadRef = value => THREAD_REF.test(String(value || ''));

// The kind of a contribution: its first media's, else text.
export const videoTrainKindOf = (members = []) => {
    const type = String((Array.isArray(members) ? members : []).find(member => member?.properties?.media_src)?.type || '').toLowerCase();
    if (type.includes('video')) return 'video';
    if (type.includes('audio') || type.includes('sound')) return 'audio';
    if (type.includes('image') || type.includes('photo')) return 'image';
    return 'text';
};

// Older first, then the id: the original order, and the tie rule of the votes.
const byAge = (a, b) => String(a.created_at).localeCompare(String(b.created_at)) || String(a.id).localeCompare(String(b.id));
const byVotes = (a, b) => (Number(b.votes) || 0) - (Number(a.votes) || 0) || byAge(a, b);
// « Mieux noté »: only a video reply still there (neither retired nor its origin) can be it.
const eligible = reply => reply.kind === 'video' && !reply.retired && !reply.origin_retired && !!reply.media_src;
export const bestVideoReply = (replies = []) => [...replies].filter(eligible).sort(byVotes)[0] || null;

// The original order: the replies to the share by age, each followed by the replies made to it, by age too (a
// reply to a reply right under the one it answers, R-005 Q52 B), whatever second they were made in.
const byThread = (replies) => {
    const ids = new Set(replies.map(reply => reply.id));
    const under = parent => replies.filter(reply => (ids.has(reply.parent_id) ? reply.parent_id : null) === parent).sort(byAge);
    const walk = parent => under(parent).flatMap(reply => [reply, ...walk(reply.id)]);
    return walk(null);
};
// The replies in the order shown: the original order, or (`best`) the best video first, then the rest by votes.
export const rankVideoTrainReplies = (replies = [], { best = false } = {}) => {
    if (!best) return byThread(replies);
    const top = bestVideoReply(replies);
    return [...(top ? [top] : []), ...replies.filter(reply => reply !== top).sort(byVotes)];
};
