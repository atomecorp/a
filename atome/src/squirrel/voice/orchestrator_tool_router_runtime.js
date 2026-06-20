import { intentToStructuredRequest } from './semantic_contract.js';
import { createToolRouter } from './tool_router.js';
import { hasExplicitBusinessConnectorHost, resolveHostEnv } from './orchestrator_env.js';
import { readExistingMailApi } from './orchestrator_connectors.js';
import {
    BUSINESS_CONNECTOR_DOMAINS,
    createVoiceConfirmation,
    normalizeVoiceConfirmation
} from './orchestrator_invocation.js';

export const executePendingConnector = async (owner, intent, toolchain, options = {}) => {
    let confirmation = normalizeVoiceConfirmation(options);
    if (
        !confirmation
        && String(intent?.domain || '').trim() === 'mail'
        && String(intent?.action || '').trim() === 'send'
    ) {
        confirmation = createVoiceConfirmation(intent, options);
    }
    const hostEnv = resolveHostEnv(owner.env);
    const canBootstrapMail = !!(
        hostEnv?.location
        || hostEnv?.document
        || hostEnv?.navigator
        || hostEnv?.fetch
        || hostEnv?.__TAURI__
        || hostEnv?.__TAURI_INTERNALS__
        || typeof window !== 'undefined'
    );
    if (
        String(intent?.domain || '').trim() === 'mail'
        && !hasExplicitBusinessConnectorHost(owner.env)
        && !canBootstrapMail
    ) {
        const english = String(intent?.locale || options?.locale || 'fr-FR').toLowerCase().startsWith('en');
        return {
            ok: false,
            executed: false,
            transport: 'mail_api',
            intent,
            error: 'mail_credentials_missing',
            reply_text: english
                ? 'Mail is not configured yet. Check the mail settings first.'
                : 'La configuration mail est absente. Verifie les reglages mail d abord.',
            spoken_reply: english
                ? 'Mail is not configured yet. Check the mail settings first.'
                : 'La configuration mail est absente. Verifie les reglages mail d abord.'
        };
    }
    if (!owner.toolRouter && String(intent?.domain || '').trim() === 'mail') {
        const mail = readExistingMailApi(owner.env);
        if (mail) {
            owner.toolRouter = createToolRouter({
                env: owner.env,
                connectors: { mail },
                workingMemory: owner.sessionRuntime?.workingMemory ?? null,
                bridge: owner.bridge
            });
        }
    }
    if (!owner.toolRouter && BUSINESS_CONNECTOR_DOMAINS.has(String(intent?.domain || '').trim())) {
        owner.ensureExistingToolRouter();
    }
    if (
        !owner.toolRouter
        && intent?.execution?.target === 'pending_connector'
        && BUSINESS_CONNECTOR_DOMAINS.has(String(intent?.domain || '').trim())
    ) {
        try {
            await owner.initToolRouter();
        } catch (_) {
            owner.pushJournal('voice.tool_router.bootstrap_failed', {
                domain: intent?.domain || null
            });
        }
    }
    if (!owner.toolRouter) {
        if (String(intent?.domain || '').trim() === 'mail') {
            const english = String(intent?.locale || options?.locale || 'fr-FR').toLowerCase().startsWith('en');
            return {
                ok: false,
                executed: false,
                transport: 'mail_api',
                intent,
                error: 'mail_credentials_missing',
                reply_text: english
                    ? 'Mail is not configured yet. Check the mail settings first.'
                    : 'La configuration mail est absente. Verifie les reglages mail d abord.',
                spoken_reply: english
                    ? 'Mail is not configured yet. Check the mail settings first.'
                    : 'La configuration mail est absente. Verifie les reglages mail d abord.'
            };
        }
        return null;
    }

    try {
        const baseStructuredRequest = intentToStructuredRequest(intent, {
            toolchain,
            locale: intent?.locale || options?.locale
        });
        const structuredRequest = {
            ...baseStructuredRequest,
            source: {
                ...(baseStructuredRequest.source || {}),
                actor_id: confirmation?.actor_id || options.actor?.user_id || options.actor_id || ''
            },
            ...(confirmation ? { confirmation } : {}),
            ...(confirmation?.idempotency_key ? { idempotency_key: confirmation.idempotency_key } : {})
        };
        if (!structuredRequest || !structuredRequest.domain) return null;

        owner.pushJournal('voice.tool_router.dispatch', {
            domain: structuredRequest.domain,
            operation: structuredRequest.operation,
            hasFilters: !!(structuredRequest.filters && Object.keys(structuredRequest.filters).length)
        });

        const result = await owner.toolRouter.execute(structuredRequest);

        // Trust gate: if the tool router signals that confirmation is required
        // due to trust scoring, surface it as a confirmation response.
        if (result?.confirmation_required === true) {
            const pendingConfirmation = confirmation || createVoiceConfirmation(intent, options);
            const pendingIntent = {
                ...intent,
                context: {
                    ...(intent.context || {}),
                    voice_confirmation: pendingConfirmation
                }
            };
            owner.pushJournal('voice.trust_gate.triggered', {
                domain: structuredRequest.domain,
                operation: structuredRequest.operation,
                trust_score: result.trust_score || null,
                trust_level: result.trust_level || null
            });
            return {
                ok: true,
                executed: false,
                transport: `${structuredRequest.domain}_api`,
                intent: pendingIntent,
                reason: result.trust_level ? 'mail_trust_warning' : 'confirmation_required',
                confirmation_required: true,
                confirmation: pendingConfirmation,
                ...(result.trust_score !== undefined ? { trust_score: result.trust_score } : {}),
                ...(result.trust_level ? { trust_level: result.trust_level } : {}),
                ...(result.trust_signals ? { trust_signals: result.trust_signals } : {}),
                confirmation_prompt: result.reply_text,
                reply_text: result.reply_text,
                spoken_reply: result.reply_text
            };
        }

        owner.traceStore?.appendExecution?.(options.trace_id, {
            tool_name: `${structuredRequest.domain}.${structuredRequest.operation}`,
            domain: structuredRequest.domain,
            ok: result?.ok !== false,
            status: result?.queued === true ? 'QUEUED' : (result?.ok === false ? 'ERROR' : 'OK'),
            error: result?.error || null
        });
        owner.pushJournal('voice.tool_router.result', {
            domain: structuredRequest.domain,
            ok: result?.ok,
            error: result?.error || null,
            itemCount: Array.isArray(result?.items) ? result.items.length : (result?.item ? 1 : 0),
            hasReply: !!result?.reply_text
        });

        if (!result || result.ok === undefined) return null;

        const normalizedError = (
            structuredRequest.domain === 'mail'
            && result?.ok === false
            && String(result?.error || '').trim() === 'mail_connector_unavailable'
        )
            ? 'mail_credentials_missing'
            : (result?.error || '');

        let replyText = result.reply_text || '';
        if (normalizedError === 'mail_credentials_missing') {
            const english = String(intent?.locale || options?.locale || 'fr-FR').toLowerCase().startsWith('en');
            replyText = english
                ? 'Mail is not configured yet. Check the mail settings first.'
                : 'La configuration mail est absente. Verifie les reglages mail d abord.';
        }
        const structuredResultPayload = {
            ...(result.items ? { items: result.items, stats: result.stats } : {}),
            ...(result.item ? { item: result.item } : {}),
            ...(result.draft ? { draft: result.draft } : {})
        };

        if (
            structuredRequest.operation === 'summarize'
            && structuredRequest.domain === 'mail'
            && typeof owner.mailAiSummarizer === 'function'
        ) {
            const itemsForAi = Array.isArray(result?.items) && result.items.length > 0
                ? result.items
                : (result?.item ? [result.item] : []);
            if (itemsForAi.length > 0) {
                try {
                    const aiSummary = await owner.mailAiSummarizer({
                        items: itemsForAi,
                        stats: result?.stats || null,
                        locale: intent?.locale || options?.locale || 'fr-FR'
                    });
                    if (aiSummary?.ok === true && String(aiSummary.text || '').trim()) {
                        replyText = String(aiSummary.text).trim();
                    }
                } catch (_) {
                    // Keep router reply text when AI mail summarization fails.
                }
            }
        }

        owner.bindSessionIntent(options.session_id, intent, {
            phase: 'executed',
            via: 'tool_router'
        });
        return {
            ok: result.ok,
            executed: result.ok,
            transport: `${result.domain || intent?.domain}_api`,
            intent,
            ...(normalizedError ? { error: normalizedError } : {}),
            ...(Object.keys(structuredResultPayload).length ? { result: structuredResultPayload } : {}),
            ...(replyText ? { reply_text: replyText, spoken_reply: replyText } : {})
        };
    } catch (routerErr) {
        owner.pushJournal('voice.tool_router.error', {
            domain: intent?.domain,
            error: String(routerErr?.message || routerErr || '')
        });
        return null;
    }
}
