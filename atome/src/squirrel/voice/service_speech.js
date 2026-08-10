import { DEFAULT_LANG, readEnv } from './service_support.js';
import { collectProjectSceneContext } from './project_scene_collector.js';

export const COMMON_SPEECH_HINTS = Object.freeze([
    'Atome',
    'eVe',
    'Jean-Eric'
]);
export const normalizeVoiceLocale = (value = '') => String(value || '').trim().replace('_', '-').toLowerCase();

export const stripDiacritics = (value = '') => String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

export const normalizeSpeechText = (value = '') => stripDiacritics(value)
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export const compactSpeechText = (value = '') => normalizeSpeechText(value)
    .replace(/[\s'-]+/g, '')
    .trim();

const speechWordSequence = (value = '') => normalizeSpeechText(value)
    .replace(/['-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const uniqueSpeechHints = (hints = []) => {
    const unique = new Map();
    for (const hint of Array.isArray(hints) ? hints : []) {
        const canonical = String(hint || '').trim();
        const key = speechWordSequence(canonical);
        if (key && !unique.has(key)) unique.set(key, canonical);
    }
    return Array.from(unique.values());
};

export const speechEditDistance = (left = '', right = '') => {
    const a = String(left);
    const b = String(right);
    const row = Array.from({ length: b.length + 1 }, (_, index) => index);
    for (let i = 1; i <= a.length; i += 1) {
        let diagonal = row[0];
        row[0] = i;
        for (let j = 1; j <= b.length; j += 1) {
            const previous = row[j];
            row[j] = Math.min(row[j] + 1, row[j - 1] + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
            diagonal = previous;
        }
    }
    return row[b.length];
};

export const escapeRegExp = (value = '') => String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const resolveSpeechLocale = (value = '') => {
    const normalized = normalizeVoiceLocale(value);
    if (!normalized) return DEFAULT_LANG;
    if (normalized === 'fr') return 'fr-FR';
    if (normalized === 'en') return 'en-US';
    const [language = '', region = ''] = normalized.split('-');
    if (!language) return DEFAULT_LANG;
    if (!region) {
        if (language === 'fr') return 'fr-FR';
        if (language === 'en') return 'en-US';
        return language;
    }
    return `${language}-${region.toUpperCase()}`;
};

export const appendSpeechHintsFromValue = (target, value, depth = 0) => {
    if (depth > 4 || value == null) return;
    if (typeof value === 'string' || typeof value === 'number') {
        const text = String(value || '').trim();
        if (text.length >= 2 && text.length <= 80) {
            target.add(text);
        }
        return;
    }
    if (Array.isArray(value)) {
        value.slice(0, 20).forEach((entry) => appendSpeechHintsFromValue(target, entry, depth + 1));
        return;
    }
    if (typeof value === 'object') {
        const preferredKeys = [
            'name', 'title', 'label', 'text', 'type', 'atome_type', 'subject', 'organization', 'project', 'project_name',
            'query_text', 'reply_target', 'participant_hint', 'tool_name', 'tool_id', 'atome_id'
        ];
        preferredKeys.forEach((key) => {
            if (key in value) appendSpeechHintsFromValue(target, value[key], depth + 1);
        });
    }
};

export const collectSpeechHints = (env, sessionRuntime, sessionId, options = {}) => {
    const hints = new Set(COMMON_SPEECH_HINTS);
    appendSpeechHintsFromValue(hints, options?.speechHints);
    appendSpeechHintsFromValue(hints, readEnv(env, '__EVE_VOICE_SPEECH_HINTS'));
    appendSpeechHintsFromValue(hints, readEnv(env, '__currentUser')?.name || readEnv(env, '__currentUser')?.first_name);
    appendSpeechHintsFromValue(hints, collectProjectSceneContext(env)?.atomes);

    const workingMemory = sessionRuntime?.workingMemory || null;
    if (workingMemory) {

        appendSpeechHintsFromValue(hints, workingMemory.getSessionPreferences?.());


        appendSpeechHintsFromValue(hints, workingMemory.listActiveEntities?.());

        for (const domain of ['atome', 'mail', 'contacts', 'calendar']) {

            appendSpeechHintsFromValue(hints, workingMemory.getCurrentItem?.(domain));

        }
    }

    if (sessionRuntime && sessionId) {

        const snapshot = sessionRuntime.getSession(sessionId);
        appendSpeechHintsFromValue(hints, snapshot?.conversation?.active_intent);
        appendSpeechHintsFromValue(hints, snapshot?.conversation?.last_user_text);

    }

    return uniqueSpeechHints(Array.from(hints)).slice(0, 64);
};

export const applyHintedSpeechCorrections = (value = '', hints = []) => {
    let text = String(value || '').trim();
    if (!text) return text;

    const normalizedHints = uniqueSpeechHints(hints);
    for (const hint of normalizedHints) {
        const canonical = String(hint || '').trim();
        if (!canonical) continue;
        const hintNormalized = normalizeSpeechText(canonical);
        if (hintNormalized === 'atome') {
            text = text.replace(/\batom(?:e)?\b/gi, canonical);
            continue;
        }
        if (hintNormalized === 'eve') {
            text = text.replace(/\beve\b/gi, canonical);
            continue;
        }
        const tokens = canonical.split(/[\s'-]+/).map((entry) => entry.trim()).filter(Boolean);
        if (tokens.length >= 2 || /[-']/.test(canonical)) {
            const pattern = new RegExp(`\\b${tokens.map((entry) => escapeRegExp(entry)).join("[\\s'’_\\-]*")}\\b`, 'gi');
            text = text.replace(pattern, canonical);
        }
    }
    const commandText = speechWordSequence(text);
    const commandLike = /\b(deplace\w*|bouge\w*|decale\w*|move\w*|selection\w*|renomme\w*)\b/.test(commandText);
    if (commandLike) {
        const excluded = new Set(['atome', 'eve', 'jean eric', 'text', 'texte', 'shape', 'forme', 'image', 'video', 'sound', 'son', 'audio']);
        const fuzzyHints = normalizedHints
            .map((canonical) => ({ canonical, normalized: speechWordSequence(canonical) }))
            .filter((entry) => entry.normalized.length >= 5 && !entry.normalized.includes(' ') && !excluded.has(entry.normalized));
        text = text.replace(/\b[A-Za-zÀ-ÿ0-9-]{5,}\b/gu, (word) => {
            const normalizedWord = speechWordSequence(word);
            if (!normalizedWord || fuzzyHints.some((entry) => entry.normalized === normalizedWord)) return word;
            const matches = fuzzyHints
                .map((entry) => ({ ...entry, distance: speechEditDistance(normalizedWord, entry.normalized) }))
                .filter((entry) => entry.distance <= 2 && entry.distance / Math.max(normalizedWord.length, entry.normalized.length) <= 0.34)
                .sort((left, right) => left.distance - right.distance);
            if (matches.length !== 1 && matches[0]?.distance === matches[1]?.distance) return word;
            return matches[0]?.canonical || word;
        });
        if (/\b(droite|gauche|haut|bas|right|left|up|down)\b/.test(speechWordSequence(text))) {
            text = text.replace(/\btrois\s+piscines?\b/gi, 'trois cents pixels');
        }
    }
    return text.replace(/\s+/g, ' ').trim();
};

export const scoreSpeechCandidate = (candidate = {}, hints = []) => {
    return evaluateSpeechCandidate(candidate, hints).selection_score;
};

export const normalizeSpeechConfidence = (value) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return 0;
    if (numeric >= 0 && numeric <= 1) return numeric;
    if (numeric <= 0) return 0;
    return numeric / (numeric + 30);
};

export const evaluateSpeechCandidate = (candidate = {}, hints = []) => {
    const text = String(candidate?.text || '').trim();
    if (!text) {
        return {
            text: '',
            confidence: null,
            normalized_confidence: 0,
            selection_score: Number.NEGATIVE_INFINITY,
            matched_hints: []
        };
    }
    const normalized = speechWordSequence(text);
    const compact = compactSpeechText(text);
    const confidence = Number.isFinite(candidate?.confidence) ? Number(candidate.confidence) : null;
    const normalizedConfidence = normalizeSpeechConfidence(confidence);
    let score = normalizedConfidence;
    const matchedHints = [];
    for (const hint of uniqueSpeechHints(hints)) {
        const hintText = String(hint || '').trim();
        if (!hintText) continue;
        const hintNormalized = speechWordSequence(hintText);
        const hintCompact = compactSpeechText(hintText);
        if (!hintNormalized) continue;
        if (normalized === hintNormalized || compact === hintCompact) {
            score += 0.85;
            matchedHints.push(hintText);
            continue;
        }
        if (` ${normalized} `.includes(` ${hintNormalized} `)) {
            score += 0.5;
            matchedHints.push(hintText);
            continue;
        }
        if (hintCompact && compact === hintCompact) {
            score += 0.34;
            matchedHints.push(hintText);
        }
    }
    if (matchedHints.length > 1) score += Math.min(0.3, matchedHints.length * 0.08);
    return {
        text,
        confidence,
        normalized_confidence: normalizedConfidence,
        selection_score: score,
        matched_hints: matchedHints
    };
};

export const selectBestSpeechCandidate = (candidates = [], hints = []) => {
    const normalizedCandidates = Array.isArray(candidates)
        ? candidates
            .map((entry) => evaluateSpeechCandidate({
                text: applyHintedSpeechCorrections(entry?.text || '', hints),
                confidence: Number.isFinite(entry?.confidence) ? Number(entry.confidence) : null
            }, hints))
            .filter((entry) => entry.text)
        : [];
    if (!normalizedCandidates.length) {
        return {
            text: '',
            confidence: null,
            normalized_confidence: 0,
            selection_score: Number.NEGATIVE_INFINITY,
            matched_hints: [],
            selection_reason: 'no_candidate',
            alternatives: []
        };
    }
    let best = normalizedCandidates[0];
    let bestScore = best.selection_score;
    for (const candidate of normalizedCandidates.slice(1)) {
        const score = candidate.selection_score;
        if (score > bestScore) {
            best = candidate;
            bestScore = score;
        }
    }
    return {
        ...best,
        selection_reason: best.matched_hints.length ? 'semantic_hint' : 'normalized_confidence',
        alternatives: normalizedCandidates
    };
};

export const resolvePreferredSpeechVoice = (synth, {
    lang = DEFAULT_LANG,
    voiceId = null
} = {}) => {
    if (!synth || typeof synth.getVoices !== 'function') return null;
    const voices = synth.getVoices();
    if (!Array.isArray(voices) || !voices.length) return null;

    if (voiceId) {
        const explicit = voices.find((voice) => voice?.name === voiceId || voice?.voiceURI === voiceId);
        if (explicit) return explicit;
    }

    const normalizedLang = normalizeVoiceLocale(lang);
    const langRoot = normalizedLang.split('-')[0] || normalizedLang;
    const preferredNames = langRoot === 'fr'
        ? ['thomas', 'amelie', 'aurelie', 'marie', 'remy', 'audrey', 'super', 'premium', 'enhanced']
        : ['premium', 'enhanced', 'natural', 'neural'];

    let best = null;
    let bestScore = Number.NEGATIVE_INFINITY;

    for (const voice of voices) {
        const voiceLocale = normalizeVoiceLocale(voice?.lang);
        const voiceName = String(voice?.name || '').toLowerCase();
        const voiceUri = String(voice?.voiceURI || '').toLowerCase();
        const localeMatches = voiceLocale === normalizedLang
            || voiceLocale.startsWith(`${langRoot}-`)
            || voiceLocale === langRoot;
        if (!localeMatches) continue;
        let score = 0;

        if (voiceLocale === normalizedLang) score += 120;
        else if (voiceLocale.startsWith(`${langRoot}-`)) score += 90;
        else if (voiceLocale === langRoot) score += 75;

        if (voice?.localService === true) score += 20;
        if (voice?.default === true) score += 8;

        for (const keyword of preferredNames) {
            if (voiceName.includes(keyword) || voiceUri.includes(keyword)) {
                score += 12;
            }
        }

        if (voiceName.includes('compact') || voiceUri.includes('compact')) score -= 6;
        if (voiceName.includes('novelty') || voiceUri.includes('novelty')) score -= 20;

        if (score > bestScore) {
            bestScore = score;
            best = voice;
        }
    }

    return best;
};
