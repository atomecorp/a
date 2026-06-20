import { toText, normalizeComparisonText } from './home_surface_transcript.js';

export const resolveLocale = () => {
    const runtimeLocale = globalThis?.AtomeLocale?.get?.()
        || globalThis?.Squirrel?.locale?.get?.()
        || globalThis?.eveLocale
        || globalThis?.EveLocale?.get?.();
    const locale = toText(runtimeLocale) || toText(globalThis?.document?.documentElement?.lang) || 'fr-FR';
    if (!locale) return 'fr-FR';
    const normalized = locale.replace('_', '-').toLowerCase();
    if (normalized === 'fr') return 'fr-FR';
    if (normalized === 'en') return 'en-US';
    if (/^[a-z]{2}-[a-z]{2}$/.test(normalized)) {
        const [language, region] = normalized.split('-');
        return `${language}-${region.toUpperCase()}`;
    }
    return locale;
};

export const isEnglish = (locale = '') => toText(locale).toLowerCase().startsWith('en');

export const looksLikeInternalToolSummary = (value = '') => {
    const normalized = normalizeComparisonText(value);
    if (!normalized) return false;
    if (/^(mail|calendar|contact|contacts|bank|atome)[\s:./_-]/.test(normalized)) return true;
    return /^(list|read|search|next unread|summarize|draft|send|create|update|delete|open|ensure|share|export|import|push|grant|publish|alter|move|crop)\b/.test(normalized)
        && /(mail|calendar|contact|contacts|bank|atome|event|events|draft|user|users|source|sources)\b/.test(normalized);
};

export const localizeVoiceError = (code = '', locale = 'fr-FR') => {
    const english = isEnglish(locale);
    switch (toText(code)) {
    case 'unsupported_stt':
    case 'voice_stt_backend_unavailable':
    case 'browser_speech_recognition_unavailable':
        return english
            ? 'Voice recognition is unavailable here. Do you want to continue by typing?'
            : 'La reconnaissance vocale est indisponible ici. Veux-tu continuer par écrit ?';
    case 'browser_speech_permission_check_failed':
    case 'browser_speech_service_not_allowed':
        return english
            ? 'Voice recognition permission checks failed here. Do you want to continue by typing?'
            : 'La vérification du service vocal a échoué ici. Veux-tu continuer par écrit ?';
    case 'microphone_unavailable':
        return english
            ? 'Microphone access is unavailable.'
            : "L'accès au micro est indisponible.";
    case 'audio_context_unavailable':
        return english
            ? 'Audio visualization is unavailable here.'
            : 'La visualisation audio est indisponible ici.';
    case 'voice_api_unavailable':
        return english
            ? 'The voice runtime is unavailable.'
            : 'Le moteur vocal est indisponible.';
    default:
        return english
            ? 'Voice input is unavailable right now. Do you want to continue by typing?'
            : "L'entrée vocale est indisponible pour le moment. Veux-tu continuer par écrit ?";
    }
};

export const localizeExecutionError = (code = '', locale = 'fr-FR') => {
    const english = isEnglish(locale);
    switch (toText(code)) {
    case 'no_ai_key_configured':
        return english ? 'No AI key is configured.' : "Aucune clé IA n'est configurée.";
    case 'provider_quota_exceeded':
        return english
            ? 'The AI quota or credit balance is exhausted. Check billing or buy more credits.'
            : "Le quota ou les crédits de l'IA sont épuisés. Vérifie la facturation ou recharge les crédits.";
    case 'provider_billing_issue':
        return english
            ? 'The AI API access is blocked by a billing or project configuration issue.'
            : "L'accès API de l'IA est bloqué par un problème de facturation ou de configuration du projet.";
    case 'provider_rate_limited':
        return english
            ? 'The AI is temporarily rate-limited. Try again in a moment.'
            : "L'IA est temporairement limitée. Réessaie dans un instant.";
    case 'provider_timeout':
    case 'provider_auth_failed':
    case 'provider_unreachable':
    case 'provider_invalid_response':
    case 'voice_agent_bridge_unavailable':
    case 'voice_execution_bridge_unavailable':
    case 'voice_toolchain_empty':
        return english ? 'The AI is not responding.' : "L'IA ne répond pas.";
    case 'mail_connector_unavailable':
        return english ? 'I do not have access to your mail here yet.' : "Je n'ai pas encore accès à tes mails ici.";
    default:
        return '';
    }
};

export const localizeFragmentPrompt = (locale = 'fr-FR') => (
    isEnglish(locale)
        ? 'I only heard part of the sentence. Continue.'
        : "Je n'ai entendu qu'un fragment. Continue."
);

export const localizeDownloadProgress = ({ status = 'downloading', model = '', progress = null } = {}, locale = 'fr-FR') => {
    const english = isEnglish(locale);
    const normalizedStatus = toText(status) || 'downloading';
    const modelName = toText(model);
    const suffix = Number.isFinite(Number(progress)) ? ` ${Math.max(0, Math.min(100, Math.round(Number(progress))))}%` : '';
    if (normalizedStatus === 'ready' || normalizedStatus === 'done' || normalizedStatus === 'completed') {
        return english ? 'Voice model ready.' : 'Modèle vocal prêt.';
    }
    if (normalizedStatus === 'error' || normalizedStatus === 'failed') {
        return english ? 'Voice model download failed.' : 'Le téléchargement du modèle vocal a échoué.';
    }
    const base = english ? 'Downloading voice model' : 'Téléchargement du modèle vocal';
    return `${base}${modelName ? ` ${modelName}` : ''}${suffix}`;
};

export const classifyVoiceError = (error) => {
    const raw = toText(error?.code || error?.message || error);
    if (!raw) return 'voice_input_unavailable';
    if (raw === 'microphone_unavailable') return raw;
    if (raw === 'audio_context_unavailable') return raw;
    if (raw === 'voice_api_unavailable') return raw;
    if (/Speech recognition service permission check has failed/i.test(raw)) return 'browser_speech_permission_check_failed';
    if (/service-not-allowed|not-allowed/i.test(raw)) return 'browser_speech_service_not_allowed';
    if (/Voice stt backend is not available/i.test(raw)) return 'voice_stt_backend_unavailable';
    if (/Browser speech recognition is not available/i.test(raw)) return 'browser_speech_recognition_unavailable';
    return raw;
};

export const resolveUserFirstName = (env) => {
    const raw = toText(env?.__currentUser?.name || env?.window?.__currentUser?.name || '');
    if (!raw) return '';
    return raw.split(/\s+/).filter(Boolean)[0] || '';
};

export const localizeReadyLine = (locale = 'fr-FR', userName = '') => {
    if (isEnglish(locale)) {
        return userName ? `Hi ${userName}, I'm ready to listen.` : "I'm ready to listen.";
    }
    return userName ? `Salut ${userName}, je suis prêt à t'écouter.` : 'Salut, que veux-tu ?';
};

export const localizeClosingLine = (locale = 'fr-FR') => (
    isEnglish(locale)
        ? "I'm heading out. Call me if you need me."
        : "Je m'en vais, rappelle-moi si tu as besoin."
);

export const localizeTextOnlyReadyLine = (locale = 'fr-FR', userName = '') => {
    if (isEnglish(locale)) {
        return userName ? `Hi ${userName}, type what you want and I will answer out loud.` : 'Hi, type what you want and I will answer out loud.';
    }
    return userName ? `Salut ${userName}, écris-moi ce que tu veux et je te répondrai à voix haute.` : 'Salut, écris-moi ce que tu veux et je te répondrai à voix haute.';
};

export const localizeTextOnlyInfo = (locale = 'fr-FR') => (
    isEnglish(locale)
        ? 'Text mode only. Type your request below.'
        : 'Mode texte uniquement. Écris ta demande ci-dessous.'
);

export const localizeDeclineLine = (locale = 'fr-FR') => (
    isEnglish(locale)
        ? "Okay, I will stop here."
        : "D'accord, j'en reste là."
);

export const localizeNoResultLine = (locale = 'fr-FR') => (
    isEnglish(locale)
        ? 'I could not produce a usable answer for that request yet.'
        : "Je n'ai pas encore pu produire une réponse exploitable pour cette demande."
);

export const createLabels = (locale) => ({
    title: 'eVe',
    listening: isEnglish(locale) ? 'Listening' : "J'écoute",
    thinking: isEnglish(locale) ? 'Thinking' : 'Je réfléchis',
    speaking: isEnglish(locale) ? 'Speaking' : 'Je parle',
    idle: '',
    unavailable: isEnglish(locale) ? 'Voice unavailable' : 'Voix indisponible',
    stop: isEnglish(locale) ? 'Stop' : 'Stop',
    resume: isEnglish(locale) ? 'Resume listening' : "Reprendre l'écoute",
    send: isEnglish(locale) ? 'Send' : 'Envoyer',
    placeholder: isEnglish(locale) ? 'Type a message or speak...' : 'Tape un message ou parle...',
    transcriptLabel: isEnglish(locale) ? 'Transcript' : 'Transcription',
    empty: isEnglish(locale) ? 'Start speaking to talk with eVe.' : 'Commence à parler pour discuter avec eVe.',
    user: isEnglish(locale) ? 'You' : 'Vous',
    assistant: 'eVe'
});
