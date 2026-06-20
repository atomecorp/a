import { DEFAULT_LANG, readEnv } from './service_support.js';

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
    if (depth > 2 || value == null) return;
    if (typeof value === 'string' || typeof value === 'number') {
        const text = String(value || '').trim();
        if (text.length >= 2 && text.length <= 80) {
            target.add(text);
        }
        return;
    }
    if (Array.isArray(value)) {
        value.slice(0, 10).forEach((entry) => appendSpeechHintsFromValue(target, entry, depth + 1));
        return;
    }
    if (typeof value === 'object') {
        const preferredKeys = [
            'name', 'title', 'label', 'subject', 'organization', 'project', 'project_name',
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

    return Array.from(hints)
        .map((entry) => String(entry || '').trim())
        .filter(Boolean)
        .slice(0, 64);
};

export const applyHintedSpeechCorrections = (value = '', hints = []) => {
    let text = String(value || '').trim();
    if (!text) return text;

    const normalizedHints = Array.isArray(hints) ? hints : [];
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
    return text.replace(/\s+/g, ' ').trim();
};

export const scoreSpeechCandidate = (candidate = {}, hints = []) => {
    const text = String(candidate?.text || '').trim();
    if (!text) return Number.NEGATIVE_INFINITY;
    const normalized = normalizeSpeechText(text);
    const compact = compactSpeechText(text);
    let score = Number.isFinite(candidate?.confidence) ? Number(candidate.confidence) : 0;
    let matchedHints = 0;
    for (const hint of Array.isArray(hints) ? hints : []) {
        const hintText = String(hint || '').trim();
        if (!hintText) continue;
        const hintNormalized = normalizeSpeechText(hintText);
        const hintCompact = compactSpeechText(hintText);
        if (!hintNormalized) continue;
        if (normalized === hintNormalized || compact === hintCompact) {
            score += 0.85;
            matchedHints += 1;
            continue;
        }
        if (normalized.includes(hintNormalized) || hintNormalized.includes(normalized)) {
            score += 0.5;
            matchedHints += 1;
            continue;
        }
        if (hintCompact && (compact.includes(hintCompact) || hintCompact.includes(compact))) {
            score += 0.34;
            matchedHints += 1;
        }
    }
    if (matchedHints > 1) score += Math.min(0.3, matchedHints * 0.08);
    return score;
};

export const selectBestSpeechCandidate = (candidates = [], hints = []) => {
    const normalizedCandidates = Array.isArray(candidates)
        ? candidates
            .map((entry) => ({
                text: applyHintedSpeechCorrections(entry?.text || '', hints),
                confidence: Number.isFinite(entry?.confidence) ? Number(entry.confidence) : null
            }))
            .filter((entry) => entry.text)
        : [];
    if (!normalizedCandidates.length) {
        return {
            text: '',
            confidence: null
        };
    }
    let best = normalizedCandidates[0];
    let bestScore = scoreSpeechCandidate(best, hints);
    for (const candidate of normalizedCandidates.slice(1)) {
        const score = scoreSpeechCandidate(candidate, hints);
        if (score > bestScore) {
            best = candidate;
            bestScore = score;
        }
    }
    return best;
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
