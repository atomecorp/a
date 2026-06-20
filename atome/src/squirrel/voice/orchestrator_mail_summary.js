import {
    normalizeAiProviderError,
    requestProviderCompletion,
    resolveFirstAiProviderConfig
} from '../ai/provider_client.js';
import { defaultEnv } from './orchestrator_env.js';

const truncateForAi = (value, maxLength = 600) => {
    const text = String(value || '').trim().replace(/\s+/g, ' ');
    if (!text) return '';
    if (text.length <= maxLength) return text;
    return `${text.slice(0, Math.max(0, maxLength - 1)).trim()}…`;
};

const buildMailSummaryPrompt = ({
    items = [],
    stats = {},
    locale = 'fr-FR'
} = {}) => {
    const english = String(locale || '').toLowerCase().startsWith('en');
    const stripQuotedContent = (text) => {
        let cleaned = String(text || '').trim();
        cleaned = cleaned.replace(/^\s*>+.*$/gm, '');
        cleaned = cleaned.replace(/\s*>+\s*>*/g, ' ');
        cleaned = cleaned.replace(/(^|\s)(Le\s+\d.*?a\s+(e|é)crit\s*:|On\s+.*?wrote\s*:)/gim, ' ');
        cleaned = cleaned.replace(/<[^>@]+@[^>]+>/g, '');
        cleaned = cleaned.replace(/\b\d{9,}\b/g, '');
        return cleaned.replace(/[\r\n]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
    };
    const payload = items.slice(0, 5).map((item, index) => ({
        rank: index + 1,
        subject: String(item?.subject || '').trim() || '(sans objet)',
        from: String(item?.from?.name || item?.from?.address || '').trim() || '(expéditeur inconnu)',
        unread: item?.unread === true,
        preview: truncateForAi(stripQuotedContent(item?.preview || item?.body_text || ''), 800),
        body_text: truncateForAi(stripQuotedContent(item?.body_text || ''), 1600)
    }));

    const instructions = english
        ? [
            'You are eVe, summarizing recent emails for a voice reply.',
            'Use the provided emails only.',
            'Respond in concise natural English for speech.',
            'Mention the important senders, topics, and any clear action items.',
            'NEVER read out dates, timestamps, long numbers, email addresses, or technical headers.',
            'NEVER include quoted reply content (lines starting with >).',
            'Keep each mail summary to ONE short sentence focused on the main point.',
            'If there are no unread emails but there are recent emails, summarize the latest recent emails anyway.',
            'Do not say "message(s) out of". Do not produce raw counts only.'
        ]
        : [
            'Tu es eVe, tu résumes des emails récents pour une réponse vocale.',
            'Utilise uniquement les emails fournis.',
            "Réponds en français naturel, concis, adapté à l'oral.",
            'Mentionne les expéditeurs importants, les sujets, et les actions évidentes si elles existent.',
            'NE LIS JAMAIS les dates, les heures, les longs chiffres, les adresses email ou les en-têtes techniques.',
            'NE CITE JAMAIS le contenu des réponses précédentes (lignes commençant par >).',
            'Chaque mail doit être résumé en UNE SEULE phrase courte centrée sur le point principal.',
            "S'il n'y a aucun mail non lu mais qu'il y a des mails récents, résume quand même les derniers mails.",
            'Ne dis pas "message(s) out of". Ne renvoie pas seulement un compteur brut.'
        ];

    return [
        instructions.join('\n'),
        '',
        `MAIL_STATS:\n${JSON.stringify({
            total: Number(stats?.total || 0),
            unread: Number(stats?.unread || 0)
        }, null, 2)}`,
        '',
        `MAIL_ITEMS:\n${JSON.stringify(payload, null, 2)}`
    ].join('\n');
};

export const createDefaultMailAiSummarizer = ({
    env = defaultEnv(),
    fetchImpl = null
} = {}) => async ({
    items = [],
    stats = {},
    locale = 'fr-FR'
} = {}) => {
        const providerConfig = await resolveFirstAiProviderConfig();
        if (providerConfig?.ok !== true) {
            return {
                ok: false,
                error: String(providerConfig?.error || 'no_ai_key_configured')
            };
        }
        try {
            const completion = await requestProviderCompletion({
                providerId: providerConfig.providerId,
                model: providerConfig.model,
                apiKey: providerConfig.apiKey,
                systemPrompt: buildMailSummaryPrompt({ items, stats, locale }),
                prompt: String(locale || '').toLowerCase().startsWith('en')
                    ? 'Summarize these recent emails for the user.'
                    : 'Resume ces derniers emails pour l utilisateur.',
                ...(typeof fetchImpl === 'function'
                    ? { fetchImpl }
                    : (typeof env?.fetch === 'function' ? { fetchImpl: env.fetch.bind(env) } : {}))
            });
            const text = completion?.text;
            const normalized = String(text || '').trim();
            if (!normalized) {
                return { ok: false, error: 'provider_empty_response' };
            }
            return {
                ok: true,
                text: normalized,
                usage: completion?.usage || null
            };
        } catch (error) {
            const normalized = normalizeAiProviderError(error);
            return {
                ok: false,
                error: normalized.code,
                message: normalized.message
            };
        }
    };
