// Rencontre (meeting people): one contract for the profile editor, the Dashboard's
// journey and the server that matches. A person declares on their own card what
// they come for (goals, each with its themes), who they are and look for (sex,
// orientation, the people they seek) and where (a country, a city or region they
// type — never a position read from the device). The server matches from these
// declarations only and never shows them. What a match may see of a person is
// their card for Rencontre: a hook, a presentation and their photos. The people
// a searcher hid never come back.

// The goals a card can declare, each with its themes (none: the goal alone).
// `all` is a search choice only (every goal), never a declaration.
export const MEETING_GOALS = Object.freeze([
    Object.freeze({ key: 'professional', themes: Object.freeze(['health', 'science_tech', 'education', 'commerce', 'administration', 'culture']) }),
    Object.freeze({ key: 'sex', themes: Object.freeze([]), intimate: true }),
    Object.freeze({ key: 'love', themes: Object.freeze([]), intimate: true }),
    Object.freeze({ key: 'friendship', themes: Object.freeze([]) }),
    Object.freeze({ key: 'help', themes: Object.freeze(['home_help', 'homework', 'computing', 'paperwork', 'repairs']) }),
    Object.freeze({ key: 'advice', themes: Object.freeze(['education', 'computing', 'health', 'daily_life', 'paperwork']) }),
    Object.freeze({ key: 'discussion', themes: Object.freeze(['philosophy', 'misc', 'science', 'sport', 'music', 'cinema', 'health']) }),
    Object.freeze({ key: 'passion', themes: Object.freeze(['sport', 'shows', 'music', 'cinema']) })
]);
export const MEETING_SEARCH_ALL = 'all';
export const MEETING_SEXES = Object.freeze(['woman', 'man', 'other']);
export const MEETING_ORIENTATIONS = Object.freeze(['hetero', 'homo', 'bi']);
// Where a search looks: all of France, the whole world, or the city or region the
// searcher declared on their own card.
export const MEETING_SCOPES = Object.freeze(['france', 'world', 'area']);

// Rencontre is for adults only. The age is read from the birth date of the
// person's own card (`bio.birth`), never from a declaration: a missing, unreadable,
// impossible or future date, or one under 18 years ago, keeps Rencontre closed —
// no entry, no section on the card, no search, and the person never appears in it.
export const MEETING_MINIMUM_AGE = 18;
const OLDEST_AGE = 120;

// A birth date, as typed: day/month/year (`12/03/1990`, `12.03.1990`, `12-03-1990`)
// or year-month-day (`1990-03-12`, an ISO timestamp too). The age in whole years
// at `now`, or null when the date is not a real one.
export const ageFromBirth = (birth, now = new Date()) => {
    const parts = text(birth).split('T')[0].split(/[/.-]/);
    if (parts.length !== 3 || parts.some(part => !part || !/^\d+$/.test(part))) return null;
    const [year, month, day] = (parts[0].length === 4 ? parts : [...parts].reverse()).map(Number);
    if (String(year).length !== 4) return null;
    const date = new Date(year, month - 1, day);
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day || date > now) return null;
    const age = now.getFullYear() - year - (now < new Date(now.getFullYear(), month - 1, day) ? 1 : 0);
    return age <= OLDEST_AGE ? age : null;
};

// May the owner of this birth date see, declare for and appear in Rencontre?
export const meetingAllowed = (birth, now = new Date()) => (ageFromBirth(birth, now) ?? -1) >= MEETING_MINIMUM_AGE;

// The Rencontre card: its photos (beside the profile photo), its one-line hook, its presentation.
export const MEETING_PHOTOS_MAX = 6;
export const MEETING_HOOK_MAX = 60;
export const MEETING_PRESENTATION_MAX = 1000;
const MEETING_HIDDEN_MAX = 500;

const text = value => String(value == null ? '' : value).trim();
const list = value => (Array.isArray(value) ? value.map(text).filter(Boolean) : []);
const fold = value => text(value).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const goalOf = key => MEETING_GOALS.find(goal => goal.key === key) || null;

// A card's declarations, cleaned: unknown goals and themes dropped, the canonical order kept.
export const normalizeMeetingProfile = (value = {}) => {
    const source = value && typeof value === 'object' ? value : {};
    const declared = new Map((Array.isArray(source.goals) ? source.goals : [])
        .map(entry => [text(entry?.goal ?? entry), Array.isArray(entry?.themes) ? entry.themes.map(text) : []]));
    const goals = MEETING_GOALS.filter(goal => declared.has(goal.key))
        .map(goal => ({ goal: goal.key, themes: goal.themes.filter(theme => declared.get(goal.key).includes(theme)) }));
    const seeking = Array.isArray(source.seeking) ? MEETING_SEXES.filter(sex => source.seeking.map(text).includes(sex)) : [];
    return {
        goals,
        sex: MEETING_SEXES.includes(text(source.sex)) ? text(source.sex) : '',
        orientation: MEETING_ORIENTATIONS.includes(text(source.orientation)) ? text(source.orientation) : '',
        seeking,
        country: text(source.country).slice(0, 80),
        area: text(source.area).slice(0, 120),
        hook: text(source.hook).slice(0, MEETING_HOOK_MAX),
        presentation: text(source.presentation).slice(0, MEETING_PRESENTATION_MAX),
        photos: [...new Set(list(source.photos))].slice(0, MEETING_PHOTOS_MAX),
        hidden: [...new Set(list(source.hidden))].slice(-MEETING_HIDDEN_MAX)
    };
};

// What the server keeps to match a card (never its photos, texts or hidden people).
export const meetingDeclarations = (profile) => {
    const { goals, sex, orientation, seeking, country, area } = normalizeMeetingProfile(profile);
    return { goals, sex, orientation, seeking, country, area };
};

// A card with no goal declared never appears in Rencontre, whatever its visibility.
export const meetingDeclared = profile => normalizeMeetingProfile(profile).goals.length > 0;

// Two people match for an intimate goal when each one is among the people the other seeks.
const seeksEachOther = (searcher, candidate) => !!searcher.sex && !!candidate.sex
    && candidate.seeking.includes(searcher.sex) && searcher.seeking.includes(candidate.sex);

// Does `candidate` answer the search `{ goal, theme, scope, query }` of `searcher`?
// `name`: the candidate's published name (for the query); `candidateId`: their
// account, never shown again once the searcher hid it.
export const meetingMatches = ({ searcher: searcherValue = {}, candidate: candidateValue = {}, search = {}, name = '', candidateId = '' }) => {
    const searcher = normalizeMeetingProfile(searcherValue), candidate = normalizeMeetingProfile(candidateValue);
    if (!candidate.goals.length || (candidateId && searcher.hidden.includes(text(candidateId)))) return false;
    const goalKey = text(search.goal), theme = text(search.theme);
    const declared = goalKey === MEETING_SEARCH_ALL ? candidate.goals : candidate.goals.filter(entry => entry.goal === goalKey);
    if (!declared.length) return false;
    // A goal declared without themes covers them all; with themes, the theme sought must be one of them.
    if (theme && !declared.some(entry => !entry.themes.length || entry.themes.includes(theme))) return false;
    if (goalOf(goalKey)?.intimate && !seeksEachOther(searcher, candidate)) return false;
    const scope = MEETING_SCOPES.includes(text(search.scope)) ? text(search.scope) : 'world';
    if (scope === 'france' && fold(candidate.country) !== 'france') return false;
    if (scope === 'area' && (!searcher.area || fold(candidate.area) !== fold(searcher.area))) return false;
    // The words typed: the published name, or the city or region the person declared.
    const needle = fold(search.query);
    if (needle && !fold(name).includes(needle) && !fold(candidate.area).includes(needle)) return false;
    return true;
};
