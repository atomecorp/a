// VideoTrain on the News (cahier FEAT-005, lot L11, user defaults of 28 Oct. 2026): one conversation model.
// A thread's origin is a News publication sent to chosen people (audience `{ group }`) with a `thread_ref`
// (the exercise, atome/src/shared/video_train_contract.js); a reply is a publication with its `parent_id`,
// its origin (`root_id`), the moment of the parent it answers (`anchor_ms`) and the audience `{ thread }`.
// Rights, here and nowhere else: a thread is read by its origin's author and the people it was sent to,
// never by someone its author blocks or who blocks them, and a contribution is hidden from one whose
// author blocks them either way or who reported it. Votes: one per voter and contribution, never on one's
// own, counted here and seen only by the thread's readers. A contribution withdrawn by its author keeps
// its row (its replies stay, marked « retiré »), its media and words gone.
// Validated mockups r005_08/09 (user, 2026-10-30): its author closes or opens its replies (« Avis »: the ones made
// stay), takes its media into their own (« Import », and a reader only when its author allowed it at the send) and
// sends it again to other people (`forwardSource`, a new origin of the same thread). The thread's owner (its origin's
// author) moderates it: the contributions reported in it with their count (« Signalés »), each kept (its reports
// dismissed) or withdrawn. A thread is always private (sent to chosen people): there is no public thread, so none
// for an account under 15 either.
import { VIDEO_TRAIN_ANCHOR_MAX_MS, VIDEO_TRAIN_IMPORT_PROPERTY, VIDEO_TRAIN_REPORT_REASON_MAX, bestVideoReply, isVideoTrainThreadRef,
    videoTrainKindOf } from '../atome/src/shared/video_train_contract.js';

const text = (value) => String(value == null ? '' : value).trim();
const parseJson = (value, fallback) => { try { return value ? JSON.parse(value) : fallback; } catch { return fallback; } };
const fail = (code) => { throw new Error(code); };

export function createNewsThread({ query, relations }) {
    const rowOf = id => query('get', 'SELECT * FROM news_publications WHERE news_id = ?', [text(id)]);
    const rootOf = async row => (text(row.root_id) ? rowOf(row.root_id) : row);
    const readsOrigin = async (reader, root) => {
        if (!root || !reader || reader === 'anonymous') return false;
        if (text(root.author_id) === reader) return true;
        const audience = parseJson(root.audience_json, 'all');
        if (!Array.isArray(audience?.group) || !audience.group.map(text).includes(reader)) return false;
        return !await relations.blockedEitherWay(root.author_id, reader);
    };
    // `row` readable by `userId`: its thread's origin is, and neither side of its own author blocks the other.
    const readable = async (userId, row) => {
        const reader = text(userId);
        if (!row || !text(row.thread_ref) || !await readsOrigin(reader, await rootOf(row))) return false;
        return text(row.author_id) === reader || !await relations.blockedEitherWay(row.author_id, reader);
    };
    const readableRow = async (userId, newsId) => {
        const row = await rowOf(newsId);
        if (!await readable(userId, row)) fail('news_not_found');
        return row;
    };
    // Who a new reply is told to: its parent's author and its origin's, never its own author.
    const replyRecipients = async (authorId, parentId) => {
        const parent = await rowOf(parentId), root = parent && await rootOf(parent);
        return [...new Set([text(parent?.author_id), text(root?.author_id)])].filter(id => id && id !== text(authorId));
    };
    // What a reply needs before it is stored: its parent readable and still there, its origin, its anchor.
    const replyContext = async (authorId, reply = {}) => {
        const parent = await readableRow(authorId, reply.parent_id);
        const root = await rootOf(parent);
        if (parent.retired_at || root.retired_at) fail('news_retired');
        if (parent.replies_closed_at) fail('news_replies_closed');
        const anchor = Math.round(Number(reply.anchor_ms));
        return { ref: text(root.thread_ref), root: text(root.news_id), parent: text(parent.news_id),
            anchor: Number.isFinite(anchor) && anchor >= 0 ? Math.min(anchor, VIDEO_TRAIN_ANCHOR_MAX_MS) : null };
    };
    // An origin's reference checked: a thread is private, sent to chosen people only.
    const originContext = (ref, audience) => {
        if (!isVideoTrainThreadRef(ref)) fail('news_thread_ref_invalid');
        if (!Array.isArray(audience?.group) || !audience.group.length) fail('news_thread_audience_private');
        return { ref, root: null, parent: null, anchor: null };
    };

    const contributionOf = (row, { votes, voted, reader, originRetired }) => {
        const publication = parseJson(row.payload_json, {}), props = publication.properties || {};
        const members = props.news_payload?.members || [], retired = !!row.retired_at, mine = text(row.author_id) === reader;
        const media = retired ? null : members.find(member => member?.properties?.media_src) || null;
        // A third party's video shared as its link alone (server/news_broadcast.js#linkOnlyMember, R-005 Q33).
        const link = retired ? null : members.find(member => member?.properties?.media_link) || null;
        return { id: text(row.news_id), parent_id: text(row.parent_id) || null, root_id: text(row.root_id) || null,
            author_id: text(row.author_id), author_name: text(props.author_name), kind: videoTrainKindOf(members),
            media_src: media ? text(media.properties.media_src) : '', media_link: link ? text(link.properties.media_link) : '', title: retired ? '' : text(props.title), text: retired ? '' : text(props.preview),
            training: retired ? null : props.training || null, anchor_ms: row.anchor_ms == null ? null : Number(row.anchor_ms),
            created_at: text(row.created_at), votes: votes.get(text(row.news_id)) || 0, voted: voted.has(text(row.news_id)),
            mine, retired, origin_retired: originRetired, replies_open: !retired && !row.replies_closed_at,
            importable: !!media && (mine || props[VIDEO_TRAIN_IMPORT_PROPERTY] === true) };
    };
    const countVotes = async (ids, reader) => {
        if (!ids.length) return { votes: new Map(), voted: new Set() };
        const marks = ids.map(() => '?').join(',');
        const rows = await query('all', `SELECT news_id, COUNT(*) AS n FROM news_votes WHERE news_id IN (${marks}) GROUP BY news_id`, ids) || [];
        const own = await query('all', `SELECT news_id FROM news_votes WHERE voter_id = ? AND news_id IN (${marks})`, [reader, ...ids]) || [];
        return { votes: new Map(rows.map(row => [text(row.news_id), Number(row.n) || 0])), voted: new Set(own.map(row => text(row.news_id))) };
    };
    // The exercise's threads `userId` reads, the newest origin first, each with its replies in their original
    // order and its « Mieux noté » (`best_id`).
    const thread = async (userId, ref) => {
        const reader = text(userId);
        if (!isVideoTrainThreadRef(ref)) fail('news_thread_ref_invalid');
        const rows = await query('all', 'SELECT * FROM news_publications WHERE thread_ref = ? ORDER BY created_at ASC, news_id ASC', [ref]) || [];
        const reported = new Set((await query('all', 'SELECT news_id FROM news_reports WHERE reporter_id = ?', [reader]) || []).map(row => text(row.news_id)));
        const shown = [];
        for (const row of rows) if (!reported.has(text(row.news_id)) && await readable(reader, row)) shown.push(row);
        const { votes, voted } = await countVotes(shown.map(row => text(row.news_id)), reader);
        const threads = shown.filter(row => !text(row.root_id)).reverse().map((root) => {
            const originRetired = !!root.retired_at, at = { votes, voted, reader, originRetired };
            const replies = shown.filter(row => text(row.root_id) === text(root.news_id)).map(row => contributionOf(row, at));
            return { origin: contributionOf(root, { ...at, originRetired: false }), replies, best_id: bestVideoReply(replies)?.id || null };
        });
        return { ok: true, thread_ref: ref, threads, moderation: (await reportedRows(reader, ref)).length };
    };
    // The contributions reported in the threads `owner` started (their origin's author), still there and not kept,
    // each with its count of reports not dismissed; the latest reported first.
    const reportedRows = async (owner, ref) => await query('all', `SELECT p.*, COUNT(r.reporter_id) AS reports, o.retired_at AS origin_retired_at
        FROM news_reports r JOIN news_publications p ON p.news_id = r.news_id
        JOIN news_publications o ON o.news_id = COALESCE(NULLIF(p.root_id, ''), p.news_id)
        WHERE r.dismissed_at IS NULL AND p.retired_at IS NULL AND p.thread_ref = ? AND o.author_id = ?
        GROUP BY p.news_id ORDER BY MAX(r.created_at) DESC, p.news_id ASC`, [ref, text(owner)]) || [];
    const reported = async (userId, ref) => {
        const owner = text(userId);
        if (!isVideoTrainThreadRef(ref)) fail('news_thread_ref_invalid');
        const rows = await reportedRows(owner, ref);
        const { votes, voted } = await countVotes(rows.map(row => text(row.news_id)), owner);
        return { ok: true, thread_ref: ref, reported: rows.map(row => ({ ...contributionOf(row, { votes, voted, reader: owner,
            originRetired: !!row.origin_retired_at }), reports: Number(row.reports) || 0 })) };
    };
    // `row` of a thread `userId` started (its origin's author): the moderator's.
    const ownedThreadRow = async (userId, newsId) => {
        const row = await rowOf(newsId);
        if (!row || !text(row.thread_ref) || text((await rootOf(row))?.author_id) !== text(userId)) fail('news_thread_owner_required');
        return row;
    };
    // « Garder »: its reports dismissed (each reporter still does not see it), it leaves « Signalés ».
    const dismiss = async (userId, { newsId } = {}) => {
        const row = await ownedThreadRow(userId, newsId);
        await query('run', `UPDATE news_reports SET dismissed_at = datetime('now') WHERE news_id = ? AND dismissed_at IS NULL`, [text(row.news_id)]);
        return { ok: true, news_id: text(row.news_id), dismissed: true };
    };
    // One's own contribution, never withdrawn: `userId` its author.
    const ownRow = async (userId, newsId) => {
        const row = await rowOf(newsId);
        if (!row || !text(row.thread_ref) || text(row.author_id) !== text(userId)) fail('news_author_required');
        if (row.retired_at) fail('news_retired');
        return row;
    };
    // « Avis »: its replies opened or closed by its author; the replies made stay.
    const setReplies = async (userId, { newsId, open = true } = {}) => {
        const row = await ownRow(userId, newsId);
        await query('run', `UPDATE news_publications SET replies_closed_at = ${open === false ? "datetime('now')" : 'NULL'}, updated_at = datetime('now')
            WHERE news_id = ?`, [text(row.news_id)]);
        return { ok: true, news_id: text(row.news_id), replies_open: open !== false };
    };
    // « Import »: the media a reader may take into their own (its author always, another reader when allowed at the send).
    const importSource = async (userId, { newsId } = {}) => {
        const reader = text(userId), row = await readableRow(reader, newsId);
        if (row.retired_at) fail('news_retired');
        const props = parseJson(row.payload_json, {}).properties || {};
        const members = props.news_payload?.members || [], media = members.find(member => member?.properties?.media_src);
        // A third party's video went as its link alone: there is no file to take (R-005 Q33).
        if (!media && members.some(member => member?.properties?.media_link)) fail('news_media_link_only');
        if (!media) fail('news_media_missing');
        if (text(row.author_id) !== reader && props[VIDEO_TRAIN_IMPORT_PROPERTY] !== true) fail('news_import_not_allowed');
        return { ok: true, news_id: text(row.news_id), kind: videoTrainKindOf([media]), media_src: text(media.properties.media_src), title: text(props.title) };
    };
    // « Envoi »: one's own contribution as it was sent (its media named by the author's own Atomes, cleaned again on
    // the way out), without its place in the thread: the publication of a new origin.
    const forwardSource = async (userId, { newsId } = {}) => {
        const row = await ownRow(userId, newsId);
        const kept = { ...parseJson(row.payload_json, {}).properties, news_thread_ref: text(row.thread_ref) };
        // Its place, its author (the session's, set again) and its import allowance (the new send's) are not carried.
        for (const key of ['parent_id', 'anchor_ms', 'author_id', 'author_name', 'news_tags', VIDEO_TRAIN_IMPORT_PROPERTY]) delete kept[key];
        return kept;
    };
    const vote = async (userId, { newsId, on = true } = {}) => {
        const voter = text(userId), row = await readableRow(voter, newsId);
        if (text(row.author_id) === voter) fail('news_vote_own');
        if (row.retired_at) fail('news_retired');
        if (on === false) await query('run', 'DELETE FROM news_votes WHERE news_id = ? AND voter_id = ?', [text(row.news_id), voter]);
        else await query('run', 'INSERT OR IGNORE INTO news_votes (news_id, voter_id) VALUES (?, ?)', [text(row.news_id), voter]);
        const { votes, voted } = await countVotes([text(row.news_id)], voter);
        return { ok: true, news_id: text(row.news_id), votes: votes.get(text(row.news_id)) || 0, voted: voted.has(text(row.news_id)) };
    };
    // A report is kept once per reader and hides the contribution from them.
    const report = async (userId, { newsId, reason = '' } = {}) => {
        const reporter = text(userId), row = await readableRow(reporter, newsId);
        if (text(row.author_id) === reporter) fail('news_report_own');
        await query('run', 'INSERT OR IGNORE INTO news_reports (news_id, reporter_id, reason) VALUES (?, ?, ?)',
            [text(row.news_id), reporter, text(reason).slice(0, VIDEO_TRAIN_REPORT_REASON_MAX)]);
        return { ok: true, news_id: text(row.news_id), reported: true };
    };
    // Withdrawn by its author, or by its thread's owner (« Signalés »): its row stays (its replies keep their parent),
    // its words and media go.
    const retire = async (userId, { newsId } = {}) => {
        const row = await rowOf(newsId);
        if (!row || !text(row.thread_ref)) fail('news_author_required');
        if (text(row.author_id) !== text(userId) && text((await rootOf(row))?.author_id) !== text(userId)) fail('news_author_required');
        const publication = parseJson(row.payload_json, {}), props = publication.properties || {};
        const emptied = { ...publication, properties: { ...props, title: '', preview: '', training: null,
            news_payload: { ...(props.news_payload || {}), members: [] } } };
        await query('run', `UPDATE news_publications SET retired_at = datetime('now'), title = '', summary = '', payload_json = ?, media_json = '[]',
            updated_at = datetime('now') WHERE news_id = ?`, [JSON.stringify(emptied), text(row.news_id)]);
        return { ok: true, news_id: text(row.news_id), retired: true };
    };
    return { readable, replyContext, originContext, replyRecipients, thread, vote, report, retire, reported, dismiss, setReplies, importSource,
        forwardSource };
}
