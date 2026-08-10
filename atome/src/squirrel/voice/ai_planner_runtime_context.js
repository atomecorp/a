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
    if (code === 'ai_vault_locked') {
        return english
            ? 'The local AI key vault could not be opened automatically.'
            : "Le coffre local des clés IA n'a pas pu être ouvert automatiquement.";
    }
    if (code === 'provider_timeout') {
        return english
            ? 'The AI provider did not answer within 20 seconds. Check your connection and try again.'
            : "Le fournisseur IA n'a pas répondu en 20 secondes. Vérifie la connexion puis réessaie.";
    }
    if (code === 'provider_auth_failed') {
        return english
            ? 'The configured AI key was refused. Check the active provider and its key.'
            : "La clé IA configurée a été refusée. Vérifie le fournisseur actif et sa clé.";
    }
    if (code === 'provider_invalid_response') {
        return english
            ? 'The AI provider returned an invalid response. Try again or select another model.'
            : "Le fournisseur IA a renvoyé une réponse invalide. Réessaie ou choisis un autre modèle.";
    }
    if (code === 'provider_unreachable') {
        return english
            ? 'The AI provider cannot be reached. Check the network and provider configuration.'
            : "Le fournisseur IA est inaccessible. Vérifie le réseau et sa configuration.";
    }
    if (code === 'voice_mcp_bridge_unavailable') {
        return english
            ? 'The secure AI execution bridge is unavailable.'
            : "Le pont sécurisé d'exécution IA est indisponible.";
    }
    return english ? 'The AI request failed.' : "La requête IA a échoué.";
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

export const localizeSceneGroundingFailure = (code, locale) => {
    const english = isEnglishLocale(locale);
    if (code === 'scene_target_ambiguous') {
        return english ? 'Several atomes match. Select one or name it more precisely.' : 'Plusieurs atomes correspondent. Sélectionne-en un ou précise son nom.';
    }
    if (code === 'move_relative_delta_invalid') {
        return english ? 'The requested movement distance is invalid.' : 'La distance de déplacement demandée est invalide.';
    }
    return english ? 'I cannot identify the atome to move.' : "Je ne peux pas identifier l'atome à déplacer.";
};

export const localizeRelativeMoveReply = (locale) => (
    isEnglishLocale(locale) ? 'Moved.' : 'Déplacement effectué.'
);

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
