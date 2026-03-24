/**
 * STT normalization layer for noisy voice transcripts.
 *
 * Instead of adding phrase-by-phrase hacks, this module provides
 * a generic fuzzy normalization that cleans up common STT artifacts
 * before the utterance reaches the intent classifier.
 *
 * Supported normalizations:
 * - Diacritics stripping
 * - Common STT homophones / misspellings
 * - Word boundary normalization
 * - Filler word removal
 * - Number normalization (french spoken numbers)
 */

// ---------------------------------------------------------------------------
// Core text normalization
// ---------------------------------------------------------------------------

const stripDiacritics = (text) => text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

const normalizeWhitespace = (text) => text
    .replace(/['']/g, "'")
    .replace(/\s+/g, ' ')
    .trim();

// ---------------------------------------------------------------------------
// French STT corrections (common recognition errors)
// ---------------------------------------------------------------------------

const FRENCH_STT_CORRECTIONS = [
    // Mail-related
    [/\bmel(?:le?)?\b/gi, 'mail'],
    [/\bm[eéè]l(?:le?)?\b/gi, 'mail'],
    [/\bmeyl\b/gi, 'mail'],
    [/\bnon[\s-]?lu(?:e?s?)?\b/gi, 'non lu'],
    [/\bn\w{0,3}\s+lu(?:e?s?)?\b/gi, 'non lu'],
    [/\bnion\s+lu(?:e?s?)?\b/gi, 'non lu'],
    [/\bnoueavu?x?\b/gi, 'nouveau'],
    [/\bnouvo\b/gi, 'nouveau'],
    [/\bplsu\b/gi, 'plus'],
    [/\bpuls\b/gi, 'plus'],
    [/\bancien\b/gi, 'ancien'],
    [/\brep[oô]n(?:ds?)?\b/gi, 'reponds'],
    [/\bre?pon(?:ds?)?\b/gi, 'reponds'],
    [/\barchi?v[eé]r?\b/gi, 'archiver'],
    [/\bsupp?r[iy]m[eé]r?\b/gi, 'supprimer'],
    [/\benv[oi]y?[eé]r?\b/gi, 'envoyer'],

    // Calendar-related
    [/\brendez[\s-]?vous\b/gi, 'rendez-vous'],
    [/\brdv\b/gi, 'rendez-vous'],

    // Contacts-related
    [/\bcontacte?\b/gi, 'contact'],
    [/\bkontact?\b/gi, 'contact'],

    // Commands
    [/\barr[eê]te?\b/gi, 'arrete'],
    [/\bstope?\b/gi, 'stop'],
    [/\bsuivan(?:te?)?\b/gi, 'suivant'],
    [/\bpre?ce?dent(?:e?)?\b/gi, 'precedent'],
    [/\bannull?e?r?\b/gi, 'annuler'],
    [/\bre?sum[eé]r?\b/gi, 'resumer'],

    // Question markers
    [/\bais?\s*[-]?\s*je\b/gi, 'ai je'],
    [/\best[\s-]ce[\s-]que?\b/gi, 'est ce que'],
    [/\by[\s-]a[\s-]t[\s-]il\b/gi, 'y a t il'],
    [/\bcomb[iy]en\b/gi, 'combien'],

    // Common verbs
    [/\bcherch[eé]r?\b/gi, 'chercher'],
    [/\brecherch[eé]r?\b/gi, 'rechercher'],
    [/\blir[eé]?\b/gi, 'lire'],
    [/\bcr[eé]+r?\b/gi, 'creer'],
    [/\bmod[iy]f[iy][eé]r?\b/gi, 'modifier'],

    // Filler words removal
    [/\b(?:euh|heu|hum|hmm|bah|ben)\b/gi, ''],
    [/\b(?:s'il\s+(?:te|vous)\s+plait|s'?te?\s*plait)\b/gi, '']
];

// ---------------------------------------------------------------------------
// English STT corrections (common recognition errors)
// ---------------------------------------------------------------------------

const ENGLISH_STT_CORRECTIONS = [
    // Mail-related
    [/\bmaile?\b/gi, 'mail'],
    [/\be[\s-]?mail\b/gi, 'email'],
    [/\bunred\b/gi, 'unread'],
    [/\bdeleet\b/gi, 'delete'],
    [/\breplye?\b/gi, 'reply'],
    [/\barchieve\b/gi, 'archive'],
    [/\barchiv\b/gi, 'archive'],

    // Filler words removal
    [/\b(?:uh|um|hmm|like|you know)\b/gi, '']
];

// ---------------------------------------------------------------------------
// French number normalization
// ---------------------------------------------------------------------------

const FRENCH_NUMBERS = {
    'un': '1', 'une': '1', 'deux': '2', 'trois': '3', 'quatre': '4',
    'cinq': '5', 'six': '6', 'sept': '7', 'huit': '8', 'neuf': '9',
    'dix': '10', 'onze': '11', 'douze': '12', 'treize': '13',
    'quatorze': '14', 'quinze': '15', 'seize': '16',
    'vingt': '20', 'trente': '30'
};

const normalizeFrenchNumbers = (text) => {
    let result = text;
    // Only replace standalone spoken-number words that are used as quantities
    // Example: "dans trois jours" → "dans 3 jours"
    for (const [word, digit] of Object.entries(FRENCH_NUMBERS)) {
        result = result.replace(
            new RegExp(`\\b${word}\\b`, 'gi'),
            digit
        );
    }
    return result;
};

// ---------------------------------------------------------------------------
// Levenshtein-based fuzzy matching for domain keywords
// ---------------------------------------------------------------------------

const levenshteinDistance = (a, b) => {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;
    const matrix = [];
    for (let i = 0; i <= b.length; i++) matrix[i] = [i];
    for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            const cost = b[i - 1] === a[j - 1] ? 0 : 1;
            matrix[i][j] = Math.min(
                matrix[i - 1][j] + 1,
                matrix[i][j - 1] + 1,
                matrix[i - 1][j - 1] + cost
            );
        }
    }
    return matrix[b.length][a.length];
};

const DOMAIN_KEYWORDS = [
    'mail', 'mails', 'email', 'emails', 'message', 'messages',
    'contact', 'contacts', 'carnet',
    'calendrier', 'agenda', 'rendez-vous', 'calendar',
    'non lu', 'archiver', 'supprimer', 'envoyer', 'repondre', 'lire',
    'unread', 'archive', 'delete', 'send', 'reply', 'read'
];

/**
 * Attempts to correct a word if it's within Levenshtein distance 2
 * of a known domain keyword.
 */
const fuzzyCorrectWord = (word) => {
    if (word.length < 4) return word;
    for (const keyword of DOMAIN_KEYWORDS) {
        const dist = levenshteinDistance(word, keyword);
        if (dist === 1) {
            return keyword;
        }
    }
    return word;
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Normalizes a raw STT transcript for intent classification.
 *
 * @param {string} rawUtterance - The raw transcript from STT.
 * @param {object} options
 * @param {string} options.locale - The locale hint (e.g. 'fr-FR', 'en-US').
 * @returns {string} Cleaned up utterance ready for intent classification.
 */
export const normalizeSTTUtterance = (rawUtterance, { locale = 'fr-FR' } = {}) => {
    if (!rawUtterance || typeof rawUtterance !== 'string') return '';

    let text = normalizeWhitespace(rawUtterance);
    text = stripDiacritics(text);
    text = text.toLowerCase();

    // Apply locale-specific corrections
    const isFrench = String(locale || '').toLowerCase().startsWith('fr');
    const corrections = isFrench ? FRENCH_STT_CORRECTIONS : ENGLISH_STT_CORRECTIONS;

    for (const [pattern, replacement] of corrections) {
        text = text.replace(pattern, replacement);
    }

    // Normalize numbers for French
    if (isFrench) {
        text = normalizeFrenchNumbers(text);
    }

    // Fuzzy correct individual words against domain keywords
    text = text.split(/\s+/).map(fuzzyCorrectWord).join(' ');

    // Final whitespace cleanup
    text = normalizeWhitespace(text);

    return text;
};

/**
 * Returns a confidence score for how much the normalized text
 * matches known domain vocabulary.
 *
 * @param {string} normalizedText
 * @returns {number} Score between 0 and 1.
 */
export const domainConfidence = (normalizedText) => {
    if (!normalizedText) return 0;
    const words = normalizedText.split(/\s+/);
    if (!words.length) return 0;
    let matches = 0;
    for (const word of words) {
        if (DOMAIN_KEYWORDS.includes(word)) matches++;
    }
    return matches / words.length;
};
