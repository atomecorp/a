// Communities: a network in the network (atome/src/shared/community_contract.js).
// A community is an allow-list of members kept by its host account. Its posts are
// News publications whose audience is the community: server/news_broadcast.js stores
// and delivers them, this module says who belongs and reads the thread back.
// Joining is the person's opt-in; the host moderates: Refuse (the person may join
// again after COMMUNITY_REFUSAL_DAYS), Ban (never again, and their posts leave the
// thread). A refused or banned person who asks to join learns nothing (silent, like
// a refused contact request). Created on first use: the host account (the account
// of the phone `host.phoneEnv` names, else a new account in the host's name) and its
// opening posts.
import db from '../database/adole.js';
import { COMMUNITIES, COMMUNITY_REFUSAL_DAYS, communityAudience } from '../atome/src/shared/community_contract.js';

const text = (value) => String(value == null ? '' : value).trim();
const parseJson = (value) => { try { return JSON.parse(value); } catch { return null; } };

export function createCommunities({
    query = (...args) => db.query(...args),
    relations,
    // ({ author, postId, projectId, publication, tags, audience, media }) -> the News store and delivery.
    distribute,
    findUserByPhone,
    // ({ name, phone }) -> { user_id } : a new account.
    createAccount,
    findUserName = async () => null,
    env = process.env
}) {
    const definitionOf = (id) => {
        const definition = COMMUNITIES[text(id)];
        if (!definition) throw new Error('community_unknown');
        return definition;
    };
    const audienceJson = (id) => JSON.stringify(communityAudience(id));

    const seed = async (definition, hostId) => {
        const now = Date.now(), authorName = (await findUserName(hostId)) || definition.host.name;
        for (const post of definition.openingPosts) {
            const postId = `${definition.id}_${post.key}`;
            const publication = { id: postId, type: 'news_publication', properties: {
                source_domain: 'community', community: definition.id, community_post_key: post.key, news_id: postId, news_post_id: postId,
                author_id: hostId, author_name: authorName, title: '', preview: '',
                created_iso: new Date(now - post.ageHours * 3600000).toISOString(),
                news_payload: { schema_version: 1, tags: [], members: [{ id: `${postId}_image`, type: 'image', properties: { media_src: post.image } }] } } };
            await distribute({ author: hostId, postId, projectId: null, publication, tags: [], audience: communityAudience(definition.id), media: [] });
        }
    };
    // Two first requests at once create the community once.
    const creating = new Map();
    const ensure = async (id) => {
        const definition = definitionOf(id);
        const row = await query('get', 'SELECT community_id, host_id FROM communities WHERE community_id = ?', [definition.id]);
        if (row) return row;
        if (!creating.has(definition.id)) {
            creating.set(definition.id, (async () => {
                const phone = text(env[definition.host.phoneEnv]);
                const existing = phone ? await findUserByPhone(phone) : null;
                const hostId = text(existing?.user_id) || text((await createAccount({ name: definition.host.name, phone: phone || null })).user_id);
                await query('run', 'INSERT INTO communities (community_id, host_id) VALUES (?, ?)', [definition.id, hostId]);
                await seed(definition, hostId);
                return { community_id: definition.id, host_id: hostId };
            })().finally(() => creating.delete(definition.id)));
        }
        return creating.get(definition.id);
    };

    const memberRow = (id, userId) => query('get',
        `SELECT status, julianday('now') - julianday(updated_at) AS age_days FROM community_members WHERE community_id = ? AND user_id = ?`, [id, text(userId)]);
    const setStatus = (id, userId, status) => query('run',
        `INSERT INTO community_members (community_id, user_id, status) VALUES (?, ?, ?)
         ON CONFLICT(community_id, user_id) DO UPDATE SET status = excluded.status, updated_at = datetime('now')`, [id, text(userId), status]);

    const isMember = async (id, userId) => {
        const community = await ensure(id);
        if (!text(userId)) return false;
        return text(userId) === community.host_id || (await memberRow(community.community_id, userId))?.status === 'member';
    };
    const memberIds = async (id) => {
        const community = await ensure(id);
        const rows = await query('all', `SELECT user_id FROM community_members WHERE community_id = ? AND status = 'member'`, [community.community_id]) || [];
        return [...new Set([community.host_id, ...rows.map((row) => text(row.user_id))])];
    };

    const join = async (userId, id) => {
        const community = await ensure(id);
        if (text(userId) === community.host_id) return { ok: true, joined: true };
        const row = await memberRow(community.community_id, userId);
        if (row?.status === 'banned' || (row?.status === 'refused' && Number(row.age_days) < COMMUNITY_REFUSAL_DAYS)) return { ok: true, joined: false };
        await setStatus(community.community_id, userId, 'member');
        return { ok: true, joined: true };
    };
    // Leaving keeps a refusal or a ban: it never clears the host's decision.
    const leave = async (userId, id) => {
        const community = await ensure(id);
        await query('run', `DELETE FROM community_members WHERE community_id = ? AND user_id = ? AND status = 'member'`, [community.community_id, text(userId)]);
        return { ok: true };
    };

    const requireHost = async (userId, id) => {
        const community = await ensure(id);
        if (text(userId) !== community.host_id) throw new Error('community_host_required');
        return community;
    };
    const moderate = async (userId, id, action, targetId) => {
        const community = await requireHost(userId, id), target = text(targetId);
        if (!target || target === community.host_id) throw new Error('community_target_invalid');
        if (action === 'unban') await query('run', 'DELETE FROM community_members WHERE community_id = ? AND user_id = ?', [community.community_id, target]);
        else await setStatus(community.community_id, target, action === 'ban' ? 'banned' : 'refused');
        return { ok: true };
    };
    const members = async (userId, id) => {
        const community = await requireHost(userId, id);
        const rows = await query('all', 'SELECT user_id, status FROM community_members WHERE community_id = ? ORDER BY updated_at DESC', [community.community_id]) || [];
        const list = [];
        for (const row of rows) list.push({ id: text(row.user_id), status: row.status, name: (await findUserName(row.user_id)) || '' });
        return { ok: true, members: list };
    };
    // A post leaves the thread by its author or the host, with its reposts.
    const removePost = async (userId, id, newsId) => {
        const community = await ensure(id), postId = text(newsId);
        const row = await query('get', 'SELECT author_id FROM news_publications WHERE news_id = ? AND audience_json = ?', [postId, audienceJson(community.community_id)]);
        if (!row) throw new Error('community_post_not_found');
        if (text(userId) !== community.host_id && text(userId) !== text(row.author_id)) throw new Error('community_host_required');
        await query('run', `DELETE FROM news_publications WHERE audience_json = ? AND (news_id = ? OR news_id LIKE ? ESCAPE '\\')`,
            [audienceJson(community.community_id), postId, `repost\\_${postId.replace(/[\\%_]/g, '\\$&')}\\_%`]);
        return { ok: true };
    };

    // The thread, newest first, for its members: neither a banned author nor one blocking (or blocked by) the reader.
    const feed = async (userId, id, { limit = 200 } = {}) => {
        const community = await ensure(id), reader = text(userId);
        if (!await isMember(community.community_id, reader)) return { ok: true, member: false, host: false, publications: [] };
        const banned = new Set((await query('all', `SELECT user_id FROM community_members WHERE community_id = ? AND status = 'banned'`,
            [community.community_id]) || []).map((row) => text(row.user_id)));
        const rows = await query('all', 'SELECT news_id, author_id, payload_json FROM news_publications WHERE audience_json = ? ORDER BY created_at DESC LIMIT ?',
            [audienceJson(community.community_id), Math.max(1, Math.min(500, Number(limit) || 200))]) || [];
        const publications = [];
        for (const row of rows) {
            const author = text(row.author_id), publication = parseJson(row.payload_json);
            if (!publication?.properties || banned.has(author)) continue;
            if (author !== reader && await relations.blockedEitherWay(author, reader)) continue;
            publications.push({ ...publication, id: text(row.news_id) });
        }
        publications.sort((a, b) => text(b.properties.created_iso).localeCompare(text(a.properties.created_iso)));
        return { ok: true, member: true, host: reader === community.host_id, host_id: community.host_id, publications };
    };

    const handle = async (message, userId) => {
        const action = text(message?.action).toLowerCase(), id = text(message?.community);
        if (action === 'join') return join(userId, id);
        if (action === 'leave') return leave(userId, id);
        if (action === 'feed') return feed(userId, id, message);
        if (action === 'members') return members(userId, id);
        if (action === 'refuse' || action === 'ban' || action === 'unban') return moderate(userId, id, action, message.userId);
        if (action === 'remove-post') return removePost(userId, id, message.newsId);
        throw new Error(`community_action_unsupported:${action || 'missing'}`);
    };

    return { ensure, isMember, memberIds, join, leave, feed, members, moderate, removePost, handle };
}
