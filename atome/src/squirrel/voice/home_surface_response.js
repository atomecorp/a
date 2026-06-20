import { toText } from './home_surface_transcript.js';
import {
    isEnglish,
    looksLikeInternalToolSummary
} from './home_surface_i18n.js';

export const readAssistantText = (response = {}, locale = 'fr-FR') => {
    const direct = toText(
        response?.reply_text
        || response?.spoken_reply
        || response?.assistant_reply
        || response?.confirmation_prompt
    );
    if (direct) return direct;

    const results = response?.result?.results;
    if (Array.isArray(results)) {
        const summaries = results
            .map((entry) => toText(entry?.result?.human_summary || entry?.result?.result?.human_summary))
            .filter(Boolean)
            .filter((entry) => !looksLikeInternalToolSummary(entry));
        if (summaries.length) return summaries.join('\n');
    }

    const one = toText(response?.result?.human_summary);
    if (one && !looksLikeInternalToolSummary(one)) return one;

    if (response?.ok === true && response?.executed === true) {
        return isEnglish(locale) ? 'Done.' : "C'est fait.";
    }
    return '';
};
