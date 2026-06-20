import { VOICE_LOCAL_COMMANDS, normalizeLocalVoiceCommand } from './session_runtime.js';

export const DEFAULT_ECHO_COOLDOWN_MS = 1200;

const LOW_INFORMATION_TOKENS = new Set([
    'tout',
    'tous',
    'toutes',
    'oui',
    'non',
    'mais',
    'bon',
    'alors',
    'donc',
    'ok',
    'hum',
    'hein'
]);
const AFFIRMATIVE_TOKENS = new Set([
    'oui',
    'ouais',
    'ok',
    'okay',
    'd accord',
    'dac',
    'vas y',
    'continue',
    'continuer'
]);
const NEGATIVE_TOKENS = new Set([
    'non',
    'nan',
    'no',
    'stop',
    'annule',
    'annuler',
    'laisse tomber',
    'pas maintenant'
]);
const COMMAND_START_TOKENS = new Set([
    'ouvre',
    'ouvre-moi',
    'lis',
    'ajoute',
    'cree',
    'crée',
    'supprime',
    'efface',
    'cherche',
    'trouve',
    'montre',
    'lance',
    'ferme',
    'appelle',
    'envoie',
    'reponds',
    'réponds',
    'resume',
    'résume',
    'marque',
    'archive'
]);
const QUESTION_START_TOKENS = new Set([
    'qui',
    'que',
    'quoi',
    'quel',
    'quelle',
    'quels',
    'quelles',
    'ou',
    'où',
    'quand',
    'combien',
    'comment',
    'est-ce',
    'est',
    'ai',
    'as',
    'a',
    'dois',
    'peux',
    'peut'
]);
const INTERRUPT_COMMANDS = new Set([
    VOICE_LOCAL_COMMANDS.STOP,
    VOICE_LOCAL_COMMANDS.CANCEL
]);

export const toText = (value) => String(value || '').trim();

export const normalizeComparisonText = (value = '') => toText(value)
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export const isLikelyAssistantEcho = ({
    heard = '',
    assistant = '',
    now = Date.now(),
    spokenAt = 0,
    cooldownMs = DEFAULT_ECHO_COOLDOWN_MS
} = {}) => {
    const heardText = normalizeComparisonText(heard);
    const assistantText = normalizeComparisonText(assistant);
    if (!heardText || !assistantText) return false;
    if (now - Number(spokenAt || 0) > cooldownMs) return false;
    if (heardText.length < 4) return false;
    return heardText === assistantText || assistantText.includes(heardText) || heardText.includes(assistantText);
};

export const isTranscriptActionable = (value = '') => {
    const normalized = normalizeComparisonText(value);
    if (!normalized) return false;
    const words = normalized.split(' ').filter(Boolean);
    if (words.length >= 2) return true;
    const [first = ''] = words;
    if (!first) return false;
    if (LOW_INFORMATION_TOKENS.has(first)) return false;
    if ([
        'mail', 'mails', 'agenda', 'calendrier', 'contact', 'contacts', 'compte', 'projet',
        'ouvre', 'ouvre', 'lis', 'ajoute', 'cree', 'supprime', 'stop', 'annule', 'suivant',
        'precedent', 'reponds', 'resume'
    ].some((token) => normalized.includes(token))) {
        return true;
    }
    return first.length >= 6;
};

export const mergeTranscriptFragments = (prefix = '', next = '') => {
    const left = toText(prefix);
    const right = toText(next);
    if (!left) return right;
    if (!right) return left;
    const normalizedLeft = normalizeComparisonText(left);
    const normalizedRight = normalizeComparisonText(right);
    if (normalizedLeft && normalizedLeft === normalizedRight) return right;
    if (normalizedLeft && normalizedRight && normalizedRight.startsWith(normalizedLeft)) return right;
    return `${left} ${right}`.trim();
};

export const isClearlyCompleteCommand = (value = '') => {
    const normalized = normalizeComparisonText(value);
    if (!normalized) return false;
    const words = normalized.split(' ').filter(Boolean);
    if (words.length < 2 || words.length > 8) return false;
    const [first = ''] = words;
    if (!first) return false;
    if (COMMAND_START_TOKENS.has(first)) return true;
    if (QUESTION_START_TOKENS.has(first) && words.length >= 3) return true;
    return false;
};

export const isAffirmativeDecision = (value = '') => AFFIRMATIVE_TOKENS.has(normalizeComparisonText(value));

export const isNegativeDecision = (value = '') => NEGATIVE_TOKENS.has(normalizeComparisonText(value));

export const detectInterruptCommand = (value = '') => {
    const normalized = normalizeComparisonText(value);
    if (!normalized) return null;
    const words = normalized.split(' ').filter(Boolean);
    if (words.length > 4) return null;
    const parsed = normalizeLocalVoiceCommand(value);
    if (!parsed || !INTERRUPT_COMMANDS.has(parsed.command)) return null;
    const matchedAlias = normalizeComparisonText(parsed.matched_alias || '');
    if (!matchedAlias) return null;
    if (normalized === matchedAlias || normalized.startsWith(`${matchedAlias} `)) {
        return parsed;
    }
    return null;
};
