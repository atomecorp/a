// Activity categories: the one taxonomy of what is on (todo/evenements_publics_2026-10-26.md).
// A category says where an activity shows in the Dashboard's Activité rubrics (`plate`, a plate
// of eVe/domains/dashboard/dashboard_shows.js) and which words find it in the public OpenAgenda
// events (`agenda`, the `shows-nearby` kind fed, and its `words`). The same slugs are the
// categories a declared event carries (`publication.categories`) and its News tag.
// `free` is not a category: the Gratuit plate reads an event's price.

const category = (slug, plate, agenda, words = []) => Object.freeze({ slug, plate, agenda, words: Object.freeze(words) });

export const ACTIVITY_CATEGORIES = Object.freeze([
    category('concert', 'concerts', 'concerts', ['concert', 'musique', 'jazz', 'rock', 'chanson', 'récital']),
    category('stage', 'stage', 'stage', ['théâtre', 'humour', 'cirque', 'opéra', 'danse', 'spectacle', 'marionnette', 'stand-up']),
    category('screening', 'cinema', null),
    category('sport', 'sport', 'sport', ['sport', 'match', 'course', 'tournoi', 'marathon', 'football', 'rugby', 'basket', 'handball', 'vélo', 'randonnée']),
    category('festival', 'events', 'events', ['festival', 'fête', 'carnaval', 'foire', 'salon', 'kermesse']),
    category('expo', 'museums', 'expos', ['exposition', 'expo', 'musée', 'vernissage']),
    category('family', 'family', 'family', ['jeune public', 'enfant', 'famille', 'conte']),
    category('meal', 'outings', 'outings', ['repas', 'dîner', 'banquet', 'pique-nique', 'dégustation']),
    category('party', 'outings', 'outings', ['soirée', 'bal', 'guinguette']),
    category('workshop', 'outings', 'outings', ['atelier', 'initiation']),
    category('outing', 'hiking', null),
    category('market', 'outings', 'outings', ['marché', 'brocante', 'vide-grenier']),
    category('wellbeing', 'wellbeing', null)
]);

export const ACTIVITY_CATEGORY_SLUGS = Object.freeze(ACTIVITY_CATEGORIES.map(entry => entry.slug));

export const activityCategory = slug => ACTIVITY_CATEGORIES.find(entry => entry.slug === slug) || null;

// The categories a plate shows (Concerts → concert); none for a plate no declared event reaches.
export const activityCategoriesOfPlate = plate => ACTIVITY_CATEGORIES.filter(entry => entry.plate === plate).map(entry => entry.slug);

// The OpenAgenda words of each `shows-nearby` agenda kind, from the categories feeding it.
export const activityAgendaWords = () => ACTIVITY_CATEGORIES.reduce((words, entry) => {
    if (entry.agenda) words[entry.agenda] = [...(words[entry.agenda] || []), ...entry.words];
    return words;
}, {});
