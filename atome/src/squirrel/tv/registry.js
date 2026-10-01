// Canonical identities never imply distribution rights or playback availability.
export const normalizeTvQuery = value => String(value ?? '').normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
export const TV_PROVIDERS = Object.freeze(['tf1', 'francetv', 'm6', 'rmc', 'canal', 't18', 'sofast']);
const definitions = [
    ['tf1', 'TF1', ['la une', 'la 1'], 'tf1', 'generaliste'],
    ['france2', 'France 2', ['fr2', 'la 2', 'la deux'], 'francetv', 'generaliste'],
    ['france3', 'France 3', ['fr3', 'la 3', 'la trois'], 'francetv', 'generaliste'],
    ['france4', 'France 4', ['fr4', 'la 4'], 'francetv', 'jeunesse'],
    ['france5', 'France 5', ['fr5', 'la 5', 'la cinq'], 'francetv', 'decouverte'],
    ['franceinfo', 'franceinfo', ['france info'], 'francetv', 'information'],
    ['m6', 'M6', ['la 6', 'la six'], 'm6', 'generaliste'],
    ['w9', 'W9', [], 'm6', 'generaliste'], ['6ter', '6ter', ['six ter'], 'm6', 'generaliste'],
    ['bfmtv', 'BFM TV', ['bfm', 'bfmtv'], 'rmc', 'information'],
    ['rmcdecouverte', 'RMC Découverte', ['rmc decouverte'], 'rmc', 'decouverte'],
    ['rmcstory', 'RMC Story', [], 'rmc', 'decouverte'],
    ['cnews', 'CNEWS', ['c news'], 'canal', 'information'],
    ['cstar', 'CStar', ['c star'], 'canal', 'musique'], ['t18', 'T18', ['t 18'], 't18', 'generaliste']
];
export const TV_CHANNELS = Object.freeze(definitions.map(([id, name, aliases, provider, category]) => Object.freeze({
    id, name, aliases: Object.freeze(aliases), provider, type: 'live', playback: 'provider',
    country: 'FR', language: 'fr', categories: Object.freeze([category]),
    routes: Object.freeze([Object.freeze({ provider, verification: 'RIGHTS_NOT_VERIFIED' })])
})));
export function findTvChannels(channels, query = '', category = '') {
    const text = normalizeTvQuery(query).replace(/^(?:ouvre|mets|lance|affiche(?:-moi| moi)?|je veux regarder|passe sur)\s+/, '');
    const eligible = channels.filter(channel => !category || channel.categories.includes(normalizeTvQuery(category)));
    if (!text) return eligible;
    const values = channel => [channel.id, channel.name, ...channel.aliases].map(normalizeTvQuery);
    const exact = eligible.filter(channel => values(channel).includes(text));
    if (exact.length) return exact;
    return eligible.filter(channel => [...values(channel), ...channel.categories.map(normalizeTvQuery)].some(value => value.includes(text)));
}
export function resolveTvChannel(channels, query) {
    const matches = findTvChannels(channels, query);
    if (!matches.length) return { ok: false, error: 'CHANNEL_NOT_FOUND', candidates: [] };
    if (matches.length > 1) return { ok: false, error: 'AMBIGUOUS_CHANNEL', candidates: matches };
    return { ok: true, channel: matches[0] };
}
