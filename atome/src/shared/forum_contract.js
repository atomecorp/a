// Forums (user decisions 3, 4, 6 and 7 of 26 Oct. 2026; mockups f1–f3 validated 29 Oct.): a name and the people
// chosen for it, a true forum — every member writes and reads the others' posts and sees who belongs; a person
// added is invited and reads nothing before accepting. Shared by the server (server/forums.js) and the app
// (eVe/domains/forum/). A forum's posts are News publications whose audience is the forum.

export const FORUM_NAME_MAX = 60;
export const FORUM_MEMBERS_MAX = 200;
const FORUM_ID = /^forum_[a-z0-9-]{8,64}$/;
export const isForumId = id => typeof id === 'string' && FORUM_ID.test(id);
export const forumAudience = id => ({ forum: String(id) });
export const forumOfAudience = audience => (audience && typeof audience === 'object' && isForumId(audience.forum) ? audience.forum : '');
// The invitation received in Communication carries its forum in its id.
export const FORUM_INVITE_KIND = 'forum-invite';
export const forumInviteId = forumId => `forum_invite_${forumId}`;
export const forumOfInvite = item => {
    const id = String(item?.id || '').replace(/^forum_invite_/, '');
    return item?.kind === FORUM_INVITE_KIND && isForumId(id) ? id : '';
};
// The link an e-mail invitation carries: opened by an account, it makes it a member.
export const FORUM_INVITE_PARAM = 'forum_invite';
export const forumInviteLink = (origin, token) => `${String(origin).replace(/\/+$/, '')}/?${FORUM_INVITE_PARAM}=${encodeURIComponent(token)}`;
