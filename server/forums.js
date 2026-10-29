// Forums (atome/src/shared/forum_contract.js): a name and its people, made by a founder. The people chosen are
// invited (a Communication notification, as a contact request: never one blocking or blocked) and become members by accepting; until then they read nothing, not even
// who belongs (decision 7 of 26 Oct. 2026). A person not on eVe is invited by an e-mail the founder's device sends
// (decision 6): its link's token makes the account that opens it a member. A forum's posts are News publications
// whose audience is the forum: server/news_broadcast.js stores and delivers them, this module says who belongs and
// reads the thread back.
import { randomUUID } from 'node:crypto';
import db from '../database/adole.js';
import { FORUM_INVITE_KIND, FORUM_MEMBERS_MAX, FORUM_NAME_MAX, forumAudience, forumInviteId, isForumId } from '../atome/src/shared/forum_contract.js';

const text = (value) => String(value == null ? '' : value).trim();
const parseJson = (value) => { try { return JSON.parse(value); } catch { return null; } };
const nameOf = (value) => {
    const name = text(value).slice(0, FORUM_NAME_MAX);
    if (!name) throw new Error('forum_name_required');
    return name;
};

export function createForums({
    query = (...args) => db.query(...args),
    relations,
    // (targetId, senderId, notification) -> the Communication delivery.
    notify,
    // (phone) -> the account carrying this number, or null.
    findUserByPhone,
    findUserName = async () => null
}) {
    const forumOf = async (id) => {
        if (!isForumId(text(id))) throw new Error('forum_not_found');
        const row = await query('get', 'SELECT forum_id, owner_id, name FROM forums WHERE forum_id = ?', [text(id)]);
        if (!row) throw new Error('forum_not_found');
        return row;
    };
    const statusOf = async (id, userId) => text((await query('get', 'SELECT status FROM forum_members WHERE forum_id = ? AND user_id = ?',
        [text(id), text(userId)]))?.status);
    const isMember = async (id, userId) => !!text(userId) && isForumId(text(id)) && await statusOf(id, userId) === 'member';
    const memberIds = async (id) => (await query('all', `SELECT user_id FROM forum_members WHERE forum_id = ? AND status = 'member'`, [text(id)]) || [])
        .map((row) => text(row.user_id));
    const requireMember = async (userId, id) => {
        const forum = await forumOf(id);
        if (!await isMember(forum.forum_id, userId)) throw new Error('forum_not_member');
        return forum;
    };

    // The people chosen (`{ key, id?, phone?, name? }`: an account by its id, else by its number): each account is
    // invited once (never one blocking or blocked by the inviter), a member stays one; a person with no account
    // gets a token their e-mail's link carries (the inviter's device sends it). Answered by `key`.
    const invitePeople = async (forum, inviterId, people) => {
        const invited = [], unreachable = [], guests = [], inviter = text(inviterId);
        for (const person of (Array.isArray(people) ? people : []).slice(0, FORUM_MEMBERS_MAX)) {
            const key = text(person?.key || person?.id || person?.phone);
            const account = text(person?.id) || (text(person?.phone) ? text((await findUserByPhone(text(person.phone)))?.user_id) : '');
            if (!account) {
                const token = `${randomUUID()}${randomUUID()}`.replace(/-/g, '');
                await query('run', 'INSERT INTO forum_guests (token, forum_id, name, invited_by) VALUES (?, ?, ?, ?)',
                    [token, forum.forum_id, text(person?.name).slice(0, 120), inviter]);
                guests.push({ key, token });
                continue;
            }
            if (account === inviter || await statusOf(forum.forum_id, account)) { invited.push(key); continue; }
            if (await relations.blockedEitherWay(inviter, account)) { unreachable.push(key); continue; }
            await query('run', `INSERT INTO forum_members (forum_id, user_id, status, invited_by) VALUES (?, ?, 'invited', ?)`, [forum.forum_id, account, inviter]);
            await notify(account, inviter, { kind: FORUM_INVITE_KIND, id: forumInviteId(forum.forum_id), subject: forum.name, message: forum.name });
            invited.push(key);
        }
        return { invited, unreachable, guests };
    };

    const create = async (userId, message = {}) => {
        const owner = text(userId);
        const forum = { forum_id: `forum_${randomUUID()}`, owner_id: owner, name: nameOf(message.name) };
        await query('run', 'INSERT INTO forums (forum_id, owner_id, name) VALUES (?, ?, ?)', [forum.forum_id, owner, forum.name]);
        await query('run', `INSERT INTO forum_members (forum_id, user_id, status, invited_by) VALUES (?, ?, 'member', ?)`, [forum.forum_id, owner, owner]);
        return { ok: true, forum: { id: forum.forum_id, name: forum.name, owner: true, status: 'member' }, ...await invitePeople(forum, owner, message.people) };
    };
    // A member brings more people in.
    const invite = async (userId, message = {}) => {
        const forum = await requireMember(userId, message.forum);
        return { ok: true, ...await invitePeople(forum, userId, message.people) };
    };
    const respond = async (userId, message = {}) => {
        const forum = await forumOf(message.forum), status = await statusOf(forum.forum_id, userId);
        if (status !== 'invited') return { ok: true, status: status || 'none' };
        if (text(message.decision) === 'accept') {
            await query('run', `UPDATE forum_members SET status = 'member', updated_at = datetime('now') WHERE forum_id = ? AND user_id = ?`, [forum.forum_id, text(userId)]);
            return { ok: true, status: 'member', forum: { id: forum.forum_id, name: forum.name } };
        }
        await query('run', 'DELETE FROM forum_members WHERE forum_id = ? AND user_id = ?', [forum.forum_id, text(userId)]);
        return { ok: true, status: 'none' };
    };
    // The e-mail's link, opened by an account: it is the invitation's acceptance. A token serves once.
    // The invitation travels as `invite`: a message's `token` is read by the WS layer as its session.
    const claim = async (userId, message = {}) => {
        const row = await query('get', 'SELECT forum_id, claimed_by FROM forum_guests WHERE token = ?', [text(message.invite)]);
        if (!row || (text(row.claimed_by) && text(row.claimed_by) !== text(userId))) throw new Error('forum_invite_invalid');
        const forum = await forumOf(row.forum_id);
        await query('run', 'UPDATE forum_guests SET claimed_by = ? WHERE token = ?', [text(userId), text(message.invite)]);
        await query('run', `INSERT INTO forum_members (forum_id, user_id, status, invited_by) VALUES (?, ?, 'member', ?)
            ON CONFLICT(forum_id, user_id) DO UPDATE SET status = 'member', updated_at = datetime('now')`, [forum.forum_id, text(userId), forum.owner_id]);
        return { ok: true, forum: { id: forum.forum_id, name: forum.name, owner: forum.owner_id === text(userId), status: 'member' } };
    };
    // Its founder keeps it: only the others leave.
    const leave = async (userId, message = {}) => {
        const forum = await forumOf(message.forum);
        if (forum.owner_id === text(userId)) throw new Error('forum_owner_stays');
        await query('run', 'DELETE FROM forum_members WHERE forum_id = ? AND user_id = ?', [forum.forum_id, text(userId)]);
        return { ok: true };
    };
    // The forums a person belongs to or is invited to, by name.
    const list = async (userId) => {
        const rows = await query('all', `SELECT f.forum_id, f.name, f.owner_id, m.status FROM forum_members m JOIN forums f ON f.forum_id = m.forum_id
            WHERE m.user_id = ? ORDER BY f.name`, [text(userId)]) || [];
        return { ok: true, forums: rows.map((row) => ({ id: text(row.forum_id), name: text(row.name), status: text(row.status), owner: text(row.owner_id) === text(userId) })) };
    };
    // Who belongs, for a member only (an invited person learns nothing before accepting).
    const members = async (userId, message = {}) => {
        const forum = await requireMember(userId, message.forum);
        const list = [];
        for (const id of await memberIds(forum.forum_id)) list.push({ id, name: (await findUserName(id)) || '', owner: id === forum.owner_id });
        return { ok: true, members: list };
    };
    // The thread, newest first, for its members: no author blocking (or blocked by) the reader.
    const feed = async (userId, message = {}) => {
        const forum = await requireMember(userId, message.forum), reader = text(userId);
        const rows = await query('all', 'SELECT news_id, author_id, payload_json FROM news_publications WHERE audience_json = ? ORDER BY created_at DESC LIMIT ?',
            [JSON.stringify(forumAudience(forum.forum_id)), Math.max(1, Math.min(500, Number(message.limit) || 200))]) || [];
        const publications = [];
        for (const row of rows) {
            const author = text(row.author_id), publication = parseJson(row.payload_json);
            if (!publication?.properties) continue;
            if (author !== reader && await relations.blockedEitherWay(author, reader)) continue;
            publications.push({ ...publication, id: text(row.news_id) });
        }
        publications.sort((a, b) => text(b.properties.created_iso).localeCompare(text(a.properties.created_iso)));
        return { ok: true, forum: { id: forum.forum_id, name: forum.name, owner: forum.owner_id === reader }, publications };
    };

    const handle = async (message, userId) => {
        const action = text(message?.action).toLowerCase();
        if (action === 'create') return create(userId, message);
        if (action === 'invite') return invite(userId, message);
        if (action === 'respond') return respond(userId, message);
        if (action === 'claim') return claim(userId, message);
        if (action === 'leave') return leave(userId, message);
        if (action === 'list') return list(userId);
        if (action === 'members') return members(userId, message);
        if (action === 'feed') return feed(userId, message);
        throw new Error(`forum_action_unsupported:${action || 'missing'}`);
    };

    return { isMember, memberIds, create, invite, respond, claim, leave, list, members, feed, handle };
}
