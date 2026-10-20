// The communities of the network (a network in the network): people sharing one
// goal, their posts seen by every member, kept by a host account that moderates.
// Shared by the server (server/communities.js) and the app (eVe/domains/community/).
// A host's opening posts carry a key, not words: each app shows them in its language
// (`eve.sleep_routine.community.post.<key>.title|text`), with a picture shipped in the app.

export const COMMUNITY_MEMBER_STATUSES = Object.freeze(['member', 'refused', 'banned']);
// A refused person may join again after this delay; a banned one never.
export const COMMUNITY_REFUSAL_DAYS = 30;

export const COMMUNITIES = Object.freeze({
    sleep_circle: Object.freeze({
        id: 'sleep_circle',
        host: Object.freeze({ name: 'Morphée', phoneEnv: 'SLEEP_CIRCLE_HOST_PHONE' }),
        face: './assets/images/sleep/moon_clouds.jpg',
        // Newest first: a picture and one piece of advice each.
        openingPosts: Object.freeze([
            Object.freeze({ key: 'ritual', image: './assets/images/sleep/candle.jpg', ageHours: 0 }),
            Object.freeze({ key: 'dinner', image: './assets/images/sleep/pumpkin_soup.jpg', ageHours: 24 }),
            Object.freeze({ key: 'welcome', image: './assets/images/sleep/moon_clouds.jpg', ageHours: 48 })
        ])
    })
});

export const communityAudience = id => ({ community: String(id) });
export const communityOfAudience = audience => (audience && typeof audience === 'object' && typeof audience.community === 'string'
    && COMMUNITIES[audience.community] ? audience.community : '');
