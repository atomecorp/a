// Public events guard (anti-abuse, decided with the user on 2026-10-26, todo/evenements_publics_2026-10-26.md Q3):
// an event goes live at once (post-moderation) within these limits, all on the server:
// - 5 publications a day, 1 while the account is younger than 72 h;
// - 30 events still to come at most;
// - 3 events hidden by reports within 30 days suspend publishing for 30 days.
// Three reports from distinct accounts hide an event (server/public_events.js).

const DAY_MS = 24 * 3600 * 1000;

export const PUBLIC_EVENT_LIMITS = Object.freeze({
    perDay: 5,
    newAccountMs: 3 * DAY_MS,
    newAccountPerDay: 1,
    active: 30,
    hiddenToSuspend: 3,
    hiddenWindowMs: 30 * DAY_MS,
    suspensionMs: 30 * DAY_MS,
    reportsToHide: 3
});

const timeOf = (value) => {
    const text = String(value || '').trim();
    return Date.parse(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(text) ? `${text.replace(' ', 'T')}Z` : text);
};

// `admit(authorId)` answers the reason refusing a NEW publication (`quota`, `suspended`), or null.
export function createPublicEventGuard({ store, findUserById, now = () => Date.now(), limits = PUBLIC_EVENT_LIMITS }) {
    const admit = async (authorId) => {
        const at = now();
        const counts = await store.authorCounts(authorId, { sinceMs: at - DAY_MS, nowMs: at,
            hiddenSinceMs: at - limits.hiddenWindowMs - limits.suspensionMs });
        const hidden = counts.hidden.map(timeOf).filter(Number.isFinite);
        for (let index = limits.hiddenToSuspend - 1; index < hidden.length; index += 1) {
            if (hidden[index] - hidden[index - limits.hiddenToSuspend + 1] <= limits.hiddenWindowMs && at - hidden[index] < limits.suspensionMs) return 'suspended';
        }
        const created = timeOf((await findUserById(authorId).catch(() => null))?.created_at);
        const young = !Number.isFinite(created) || at - created < limits.newAccountMs;
        if (counts.published >= (young ? limits.newAccountPerDay : limits.perDay)) return 'quota';
        if (counts.active >= limits.active) return 'quota';
        return null;
    };
    return { admit, limits };
}
