// Diffusion serveur des News (done/communication_news_broadcast_2026-09-30.md, L4/L5).
//
// Une publication est enregistree UNE fois, puis le serveur choisit ses destinataires :
// - audience 'all' : tout utilisateur (abonne par defaut, D1), sauf l'auteur ;
// - audience { group: [ids] } : ces destinataires, s'ils sont en contact avec l'auteur (D3) ;
// - jamais un utilisateur bloque par l'auteur ou qui a bloque l'auteur (D4) ;
// - filtre par la liste blanche de tags du destinataire : vide = tout, sinon au moins un
//   tag commun (D1/D2) ;
// - audience { community: id } : les membres de cette communaute (server/communities.js),
//   sans filtre de tags (en etre membre est l'abonnement) ; son auteur doit en etre membre ;
// - audience { forum: id } : de meme, les membres de ce forum (server/forums.js).
// Un destinataire en echec n'arrete jamais les suivants.
// VideoTrain (server/news_thread.js): an origin carries `news_thread_ref` and goes to chosen people only; a
// reply (`message.reply`: parent_id, anchor_ms) is told to its parent's and origin's authors, read by the thread.
// A media leaves as a clean copy, its EXIF and GPS stripped (`cleanMedia`, server/news_media_cleaner.js).

import db from '../database/adole.js';
import { hasPrivateProgramAncestor } from './syncShareHierarchy.js';
import { communityAudience, communityOfAudience } from '../atome/src/shared/community_contract.js';
import { forumAudience, forumOfAudience } from '../atome/src/shared/forum_contract.js';
import { createNewsThread } from './news_thread.js';

const text = (value) => String(value == null ? '' : value).trim();
const parseJson = (value, fallback) => { try { return value ? JSON.parse(value) : fallback; } catch { return fallback; } };

// Meme algorithme que `slugifyNewsTag` (eVe/domains/news/news_tag_vocabulary.js) : un slug
// calcule d'un cote doit etre identique de l'autre.
export const slugifyTag = (value = '') => String(value == null ? '' : value)
    .trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

export const normalizeTags = (input = []) => {
    const seen = new Map();
    for (const entry of Array.isArray(input) ? input : []) {
        const label = text(typeof entry === 'string' ? entry : (entry?.label || entry?.slug));
        const slug = slugifyTag(typeof entry === 'string' ? entry : (entry?.slug || entry?.label));
        if (!slug || slug.length > 80 || seen.has(slug)) continue;
        seen.set(slug, { slug, label: (label || slug).slice(0, 120) });
        if (seen.size >= 32) break;
    }
    return [...seen.values()];
};

export const acceptsTags = (whitelist = [], tags = []) => {
    if (!Array.isArray(whitelist) || whitelist.length === 0) return true;
    const slugs = new Set(tags.map((tag) => tag.slug));
    return whitelist.some((slug) => slugs.has(slug));
};

export function createNewsBroadcast({
    query = (...args) => db.query(...args),
    relations,
    deliver,
    listUserIds,
    findUserName = async () => null,
    // (identifier, { ownerId }) -> metadonnees du fichier (server/userFiles.js getFileMetadata).
    getFileMetadata = async () => null,
    vaultProvider = null,
    // (authorId, fileMeta) -> { atomeId } of the clean copy the audience reads (server/news_media_cleaner.js).
    cleanMedia = null,
    // () -> server/communities.js (created after this broadcast: it seeds through `distribute`).
    getCommunities = () => null,
    // () -> server/forums.js.
    getForums = () => null
}) {
    const communities = () => {
        const service = getCommunities();
        if (!service) throw new Error('communities_unavailable');
        return service;
    };
    // A community or a forum: an allow-list of members, its posts never leaving them (no tag filter, no repost out).
    const circleOf = (audience) => {
        const community = communityOfAudience(audience);
        if (community) return { kind: 'community', members: communities(), id: community, audience: communityAudience(community) };
        const forum = forumOfAudience(audience);
        if (!forum) return null;
        const members = getForums();
        if (!members) throw new Error('forums_unavailable');
        return { kind: 'forum', members, id: forum, audience: forumAudience(forum) };
    };
    const threads = createNewsThread({ query, relations });
    // Un media n'est publiable que par son proprietaire : sinon lister l'id d'un media
    // d'autrui suffirait a en ouvrir la lecture a toute l'audience.
    const ownsAtome = async (authorId, atomeId) => {
        const registry = await query('get', 'SELECT vault_principal_id FROM vault_object_registry WHERE atome_id = ?', [atomeId]);
        if (registry) return text(registry.vault_principal_id) === authorId;
        const row = await query('get', 'SELECT owner_id FROM atomes WHERE atome_id = ?', [atomeId]);
        return !!row && text(row.owner_id) === authorId;
    };
    // La source publiee est reecrite par le serveur : `/api/uploads/<id du fichier>` est la
    // seule forme qui designe le fichier de l'AUTEUR quand un autre compte la lit.
    const resolvePublishedMedia = async (authorId, member = {}) => {
        const atomeId = text(member?.properties?.media_atome_id);
        if (!atomeId || !await ownsAtome(authorId, atomeId)) return null;
        const srcName = decodeURIComponent(text(member?.properties?.media_src).split('?')[0].split('/').pop() || '');
        const meta = (await getFileMetadata(atomeId)) || (srcName ? await getFileMetadata(srcName, { ownerId: authorId }) : null);
        if (!meta || text(meta.owner_id) !== authorId) return null;
        if (typeof cleanMedia !== 'function') throw new Error('news_media_cleaner_missing');
        const clean = await cleanMedia(authorId, meta);
        return { fileAtomeId: clean.atomeId, src: `/api/uploads/${encodeURIComponent(clean.atomeId)}` };
    };
    const subscriptionOf = async (userId) => {
        const row = await query('get', 'SELECT tags_json FROM news_subscriptions WHERE user_id = ?', [text(userId)]);
        return parseJson(row?.tags_json, []);
    };

    const registerTags = async (tags) => {
        for (const tag of tags) {
            await query('run',
                `INSERT INTO news_tags (slug, label, use_count) VALUES (?, ?, 1)
                 ON CONFLICT(slug) DO UPDATE SET use_count = news_tags.use_count + 1, updated_at = datetime('now')`,
                [tag.slug, tag.label]);
        }
    };

    const resolveAudience = async (authorId, audience) => {
        const circle = circleOf(audience);
        if (circle) return (await circle.members.memberIds(circle.id)).filter((id) => id !== authorId);
        if (audience && typeof audience === 'object' && Array.isArray(audience.group)) {
            const ids = [...new Set(audience.group.map(text).filter(Boolean))].filter((id) => id !== authorId);
            const allowed = [];
            for (const id of ids) if ((await relations.canCommunicate(authorId, id)).ok) allowed.push(id);
            return allowed;
        }
        return (await listUserIds()).map(text).filter((id) => id && id !== authorId);
    };

    const publish = async (authorId, message = {}) => {
        const author = text(authorId);
        const source = message.publication && typeof message.publication === 'object' ? message.publication : null;
        if (!source) throw new Error('news_publication_required');
        const props = { ...(source.properties || {}) };
        const sourceMembers = Array.isArray(props.news_payload?.members) ? props.news_payload.members : [];
        const sourceIds = [props.news_source_project_id, source.id,
            ...sourceMembers.flatMap(member => [member?.id, member?.properties?.media_atome_id])];
        for (const atomeId of new Set(sourceIds.map(text).filter(Boolean))) {
            if (vaultProvider && await hasPrivateProgramAncestor({ provider: vaultProvider, ownerId: author, atomeId })) {
                throw new Error('program_sharing_not_finalized');
            }
        }
        const newsId = text(props.news_id || source.id);
        const postId = text(source.id || props.news_post_id || newsId);
        if (!newsId || !postId) throw new Error('news_id_required');
        const existing = await query('get', 'SELECT author_id FROM news_publications WHERE news_id = ?', [postId]);
        if (existing && text(existing.author_id) !== author) throw new Error('news_author_mismatch');

        const tags = normalizeTags(message.tags ?? props.news_payload?.tags ?? []);
        // L'identite de l'auteur est celle de la session, jamais celle du client.
        const authorName = (await findUserName(author)) || '';
        const media = [];
        const members = [];
        for (const member of sourceMembers) {
            if (!text(member?.properties?.media_atome_id)) { members.push(member); continue; }
            const resolved = await resolvePublishedMedia(author, member);
            if (!resolved) continue;
            media.push(resolved.fileAtomeId);
            members.push({ ...member, properties: { ...member.properties, media_src: resolved.src } });
        }
        const payload = props.news_payload && typeof props.news_payload === 'object'
            ? { ...props.news_payload, members } : props.news_payload;
        const publication = {
            ...source,
            id: postId,
            properties: { ...props, ...(payload ? { news_payload: payload } : {}), author_id: author, author_name: authorName, news_tags: tags }
        };
        const circle = circleOf(message.audience);
        if (circle && !await circle.members.isMember(circle.id, author)) throw new Error(`${circle.kind}_not_member`);
        const reply = message.reply && typeof message.reply === 'object' ? message.reply : null;
        const thread = reply ? await threads.replyContext(author, reply)
            : text(props.news_thread_ref) ? threads.originContext(text(props.news_thread_ref), message.audience) : null;
        if (thread) Object.assign(publication.properties, { news_thread_ref: thread.ref, parent_id: thread.parent, anchor_ms: thread.anchor });
        // A thread's origin keeps the people it may reach (contacts, never blocked): they alone read the thread.
        const audience = thread?.root ? { thread: thread.root } : thread ? { group: await resolveAudience(author, message.audience) }
            : circle ? circle.audience : message.audience && typeof message.audience === 'object' ? message.audience : 'all';
        if (thread && !thread.root && !audience.group.length) throw new Error('news_thread_audience_private');

        if (!existing) await registerTags(tags);
        return distribute({ author, postId, projectId: text(props.news_source_project_id) || null, publication, tags, audience, media, thread });
    };

    // A publication stored once, then delivered to its audience (blocks and tag whitelists respected).
    const distribute = async ({ author, postId, projectId, publication, tags, audience, media, thread = null }) => {
        const props = publication.properties || {};
        await query('run',
            `INSERT INTO news_publications (news_id, author_id, project_id, title, summary, tags_json, audience_json, payload_json, media_json,
             thread_ref, root_id, parent_id, anchor_ms)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(news_id) DO UPDATE SET title = excluded.title, summary = excluded.summary,
             tags_json = excluded.tags_json, audience_json = excluded.audience_json,
             payload_json = excluded.payload_json, media_json = excluded.media_json, updated_at = datetime('now')`,
            [postId, author, projectId, text(props.title), text(props.preview),
                JSON.stringify(tags), JSON.stringify(audience), JSON.stringify(publication), JSON.stringify(media),
                thread?.ref || null, thread?.root || null, thread?.parent || null, thread?.anchor ?? null]);
        const candidates = thread?.root ? await threads.replyRecipients(author, thread.parent) : await resolveAudience(author, audience);
        const circle = circleOf(audience);
        const result = { ok: true, news_id: postId, tags, delivered: 0, filtered: 0, blocked: 0, failed: 0, recipients: [] };
        for (const userId of candidates) {
            try {
                if (await relations.blockedEitherWay(author, userId)) { result.blocked += 1; continue; }
                // A thread's people were chosen by name: no tag of theirs narrows it.
                if (!circle && !thread && !acceptsTags(await subscriptionOf(userId), tags)) { result.filtered += 1; continue; }
                await deliver(userId, author, {
                    kind: 'publication', id: postId,
                    subject: text(props.title) || null,
                    message: text(props.preview),
                    publication
                });
                result.delivered += 1;
                result.recipients.push(userId);
            } catch (error) {
                result.failed += 1;
                console.warn('[news] delivery failed', userId, error?.message || error);
            }
        }
        return result;
    };

    // A publication `userId` received: one of its audience, neither side blocking the other.
    const received = async (userId, newsId) => {
        const row = await query('get', 'SELECT * FROM news_publications WHERE news_id = ?', [text(newsId)]);
        if (!row || text(row.author_id) === text(userId) || await relations.blockedEitherWay(row.author_id, userId)) return null;
        const audience = parseJson(row.audience_json, 'all'), circle = circleOf(audience);
        if (text(row.thread_ref)) return await threads.readable(userId, row) && !row.retired_at ? row : null;
        if (circle) return await circle.members.isMember(circle.id, userId) ? row : null;
        if (Array.isArray(audience?.group) ? !audience.group.map(text).includes(text(userId))
            : !acceptsTags(await subscriptionOf(userId), parseJson(row.tags_json, []))) return null;
        return row;
    };
    // Aimer: the author alone learns it (no public count). Unknown or not received: nothing, silently.
    const like = async (userId, message = {}) => {
        const row = await received(userId, message.newsId);
        if (!row) return { ok: true, delivered: false };
        const title = text(parseJson(row.payload_json, {})?.properties?.title || row.title);
        await deliver(text(row.author_id), text(userId), { kind: 'news-like', id: `like_${row.news_id}_${text(userId)}`, subject: title || null, message: title });
        return { ok: true, delivered: true };
    };
    // Reprendre: the publication again, to the reposter's audience, credited to its author;
    // its media stay the author's and readable by that audience (`canReadNewsMedia`).
    // A community's or a forum's post is taken up in it: it never leaves the members.
    const repost = async (userId, message = {}) => {
        const row = await received(userId, message.newsId);
        if (!row) throw new Error('news_not_found');
        // A thread stays among its people.
        if (text(row.thread_ref)) throw new Error('news_thread_private');
        const source = parseJson(row.payload_json, null);
        if (!source?.properties) throw new Error('news_not_found');
        const postId = `repost_${row.news_id}_${text(userId)}`;
        const origin = source.properties.reposted_from || { news_id: row.news_id, author_id: text(row.author_id), author_name: text(source.properties.author_name) };
        const publication = { ...source, id: postId, properties: { ...source.properties, news_id: postId, news_post_id: postId, news_source_project_id: '',
            author_id: text(userId), author_name: (await findUserName(userId)) || '', reposted_from: origin } };
        const circle = circleOf(parseJson(row.audience_json, 'all'));
        return distribute({ author: text(userId), postId, projectId: null, publication, tags: parseJson(row.tags_json, []),
            audience: circle ? circle.audience : 'all', media: parseJson(row.media_json, []) });
    };

    const setSubscriptions = async (userId, tags) => {
        const slugs = normalizeTags(tags).map((tag) => tag.slug);
        await query('run',
            `INSERT INTO news_subscriptions (user_id, tags_json) VALUES (?, ?)
             ON CONFLICT(user_id) DO UPDATE SET tags_json = excluded.tags_json, updated_at = datetime('now')`,
            [text(userId), JSON.stringify(slugs)]);
        return { ok: true, tags: slugs };
    };

    const searchTags = async (queryText = '', limit = 20) => {
        const needle = `%${slugifyTag(queryText)}%`;
        const plain = `%${text(queryText).toLowerCase()}%`;
        const rows = await query('all',
            `SELECT slug, label, origin, use_count FROM news_tags
             WHERE slug LIKE ? OR lower(label) LIKE ? ORDER BY use_count DESC, slug ASC LIMIT ?`,
            [needle, plain, Math.max(1, Math.min(100, Number(limit) || 20))]) || [];
        return { ok: true, tags: rows.map((row) => ({ slug: row.slug, label: row.label, origin: row.origin, count: Number(row.use_count) || 0 })) };
    };

    // Medias references par une News que `userId` a le droit de lire (D6).
    // Meme regle que la diffusion : un compte REEL (jamais un visiteur anonyme), non bloque,
    // a qui la News est parvenue (groupe, ou liste blanche de tags qui l'accepte).
    const canReadNewsMedia = async (userId, atomeId, { authorId = '' } = {}) => {
        const reader = text(userId);
        if (!reader || reader === 'anonymous') return false;
        // Seules les News du PROPRIETAIRE du fichier comptent.
        // A repost lends its audience the media of the publication's author.
        const ownerOf = (row) => text(parseJson(row.payload_json, {})?.properties?.reposted_from?.author_id) || text(row.author_id);
        const rows = (await query('all',
            `SELECT news_id, author_id, audience_json, tags_json, payload_json, media_json, thread_ref, root_id FROM news_publications WHERE media_json LIKE ?`,
            [`%${JSON.stringify(text(atomeId)).slice(1, -1)}%`]) || [])
            // LIKE only narrows: an id that merely contains this one (its clean copy `newsclean_<id>`) opens nothing.
            .filter((row) => parseJson(row.media_json, []).map(text).includes(text(atomeId)))
            .filter((row) => !text(authorId) || ownerOf(row) === text(authorId));
        if (!rows.length) return false;
        const account = await query('get', `SELECT atome_id FROM atomes WHERE atome_id = ? AND atome_type = 'user' AND deleted_at IS NULL`, [reader]);
        if (!account) return false;
        for (const row of rows) {
            if (text(row.author_id) === reader) return true;
            if (await relations.blockedEitherWay(row.author_id, reader)) continue;
            if (text(row.thread_ref)) {
                if (await threads.readable(reader, row)) return true;
                continue;
            }
            const audience = parseJson(row.audience_json, 'all'), circle = circleOf(audience);
            if (circle) {
                if (await circle.members.isMember(circle.id, reader)) return true;
                continue;
            }
            if (Array.isArray(audience?.group)) {
                if (audience.group.map(text).includes(reader)) return true;
                continue;
            }
            if (acceptsTags(await subscriptionOf(reader), parseJson(row.tags_json, []))) return true;
        }
        return false;
    };

    const handle = async (message, userId) => {
        const action = text(message?.action).toLowerCase();
        if (action === 'publish') return publish(userId, message);
        if (action === 'subscriptions-get') return { ok: true, tags: await subscriptionOf(userId) };
        if (action === 'subscriptions-set') return setSubscriptions(userId, message.tags);
        if (action === 'tags-search') return searchTags(message.query, message.limit);
        if (action === 'like') return like(userId, message);
        if (action === 'repost') return repost(userId, message);
        if (action === 'thread') return threads.thread(userId, text(message.threadRef));
        if (action === 'vote') return threads.vote(userId, message);
        if (action === 'report') return threads.report(userId, message);
        if (action === 'retire') return threads.retire(userId, message);
        throw new Error(`news_action_unsupported:${action || 'missing'}`);
    };

    return { publish, distribute, like, repost, setSubscriptions, subscriptionOf, searchTags, canReadNewsMedia, handle };
}
