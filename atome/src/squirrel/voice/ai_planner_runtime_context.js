export const DEFAULT_LOCALE = 'fr-FR';

const toText = (value) => String(value || '').trim();

export const resolveLocale = (locale = null) => {
    const runtimeLocale = globalThis?.AtomeLocale?.get?.()
        || globalThis?.Squirrel?.locale?.get?.()
        || globalThis?.eveLocale
        || globalThis?.EveLocale?.get?.();
    const preferred = toText(locale) || toText(runtimeLocale) || toText(globalThis?.document?.documentElement?.lang) || DEFAULT_LOCALE;
    return preferred || DEFAULT_LOCALE;
};

export const isEnglishLocale = (locale) => toText(locale).toLowerCase().startsWith('en');

export const localizeAiFailure = (code, locale) => {
    const english = isEnglishLocale(locale);
    if (code === 'no_ai_key_configured') {
        return english ? 'No AI key is configured.' : "Aucune cle IA n'est configuree.";
    }
    if (code === 'provider_quota_exceeded') {
        return english
            ? 'The AI quota or credit balance is exhausted. Check billing or buy more credits.'
            : "Le quota ou les credits de l'IA sont epuises. Verifie la facturation ou recharge les credits.";
    }
    if (code === 'provider_billing_issue') {
        return english
            ? 'The AI API access is blocked by a billing or project configuration issue.'
            : "L'acces API de l'IA est bloque par un probleme de facturation ou de configuration du projet.";
    }
    if (code === 'provider_rate_limited') {
        return english
            ? 'The AI is temporarily rate-limited. Try again in a moment.'
            : "L'IA est temporairement limitee. Reessaie dans un instant.";
    }
    return english ? 'The AI is not responding.' : "L'IA ne repond pas.";
};

export const localizeQuotaWarning = (code, locale) => {
    const english = isEnglishLocale(locale);
    if (code === 'quota_running_low') {
        return english
            ? 'AI usage is running low. Complex requests may be delayed.'
            : "Le budget d'utilisation IA commence a etre bas. Les requetes complexes peuvent etre ralenties.";
    }
    if (code === 'provider_rate_limited') {
        return english
            ? 'The AI provider is currently rate-limited. Complex requests may be delayed.'
            : "Le provider IA est actuellement limite. Les requetes complexes peuvent etre ralenties.";
    }
    if (code === 'provider_quota_exceeded') {
        return english
            ? 'The AI quota is exhausted until the budget is restored.'
            : "Le quota IA est epuise tant que le budget n'est pas retabli.";
    }
    return '';
};

const readEnv = (env, key) => {
    if (!env || typeof env !== 'object') return null;
    if (key in env) return env[key];
    if (env.window && typeof env.window === 'object' && key in env.window) return env.window[key];
    return null;
};

export const listAtomeAiTools = (env = globalThis) => {
    const agent = readEnv(env, 'AtomeAI') || readEnv(env, 'window')?.AtomeAI || null;
    if (!agent || typeof agent.listTools !== 'function') return [];
    try {
        return Array.isArray(agent.listTools()) ? agent.listTools() : [];
    } catch (_) {
        return [];
    }
};
