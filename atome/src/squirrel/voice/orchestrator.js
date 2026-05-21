import { classifyVoiceIntent, normalizeVoiceIntent } from './intent_schema.js';
import {
    normalizeAiProviderError,
    requestProviderCompletion,
    resolveFirstAiProviderConfig
} from '../ai/provider_client.js';
import { intentToStructuredRequest } from './semantic_contract.js';
import { createToolRouter } from './tool_router.js';
import { resolveIdentityContext } from './identity_resolver.js';
import { createPersistentMemoryStore } from '../ai/persistent_memory.js';
import { createAiTraceStore } from '../ai/trace_store.js';
import { collectProjectSceneContext, pushMutation, pushError } from './project_scene_collector.js';

export const VOICE_ORCHESTRATOR_EVENT_NAME = 'squirrel:voice:orchestrator';

const defaultEnv = () => (typeof window !== 'undefined' ? window : globalThis);

const resolveHostEnv = (env = null) => {
    if (env?.window && typeof env.window === 'object') return env.window;
    if (
        env
        && typeof env === 'object'
        && (
            typeof env.handleAtomeMCPRequestAsync === 'function'
            || typeof env.handleAtomeMCPRequest === 'function'
        )
    ) {
        return env;
    }
    const hasExplicitBusinessApis = !!(
        env?.Squirrel?.mail
        || env?.Squirrel?.contacts
        || env?.Squirrel?.calendar
        || env?.atome?.mail
        || env?.atome?.contacts
        || env?.atome?.calendar
        || env?.AtomeMail
        || env?.AtomeContacts
        || env?.AtomeCalendar
    );
    if (
        env
        && typeof env === 'object'
        && hasExplicitBusinessApis
    ) {
        return env;
    }
    if (
        env
        && typeof env === 'object'
        && (
            env.location
            || env.fetch
            || env.document
            || env.navigator
            || env.__TAURI__
            || env.__TAURI_INTERNALS__
        )
    ) {
        return env;
    }
    return defaultEnv();
};

const hasExplicitBusinessConnectorHost = (env = null) => {
    const hostEnv = resolveHostEnv(env);
    return !!(
        hostEnv?.Squirrel?.mail
        || hostEnv?.Squirrel?.contacts
        || hostEnv?.Squirrel?.calendar
        || hostEnv?.Squirrel?.messages
        || hostEnv?.atome?.mail
        || hostEnv?.atome?.contacts
        || hostEnv?.atome?.calendar
        || hostEnv?.atome?.messages
        || env?.Squirrel?.mail
        || env?.Squirrel?.contacts
        || env?.Squirrel?.calendar
        || env?.Squirrel?.messages
        || env?.atome?.mail
        || env?.atome?.contacts
        || env?.atome?.calendar
        || env?.atome?.messages
    );
};

const cloneValue = (value) => {
    if (typeof structuredClone === 'function') {
        return structuredClone(value);
    }
    return JSON.parse(JSON.stringify(value));
};

const readEnv = (env, key) => {
    if (!env || typeof env !== 'object') return null;
    if (key in env) return env[key];
    if (env.window && typeof env.window === 'object' && key in env.window) return env.window[key];
    return null;
};

const ensureToolchain = (intent) => Array.isArray(intent?.execution?.toolchain)
    ? intent.execution.toolchain.filter((step) => step && typeof step === 'object')
    : [];

const normalizeInvocationMeta = (intent, options = {}) => {
    const meta = {};
    if (intent?.intent_id) meta.intent_id = String(intent.intent_id);
    if (options?.trace_id) meta.trace_id = String(options.trace_id);
    if (options?.idempotency_key) meta.idempotency_key = String(options.idempotency_key);
    return meta;
};

const normalizeInvocationSource = (intent, options = {}) => ({
    type: 'voice',
    layer: String(options?.source_layer || 'voice_orchestrator'),
    domain: String(intent?.domain || 'unknown'),
    action: String(intent?.action || 'unknown')
});

const createVoiceConfirmation = (intent, options = {}) => {
    const suffix = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const actorId = String(options.actor?.user_id || options.actor_id || 'local_user').trim();
    const idempotencyKey = String(options.idempotency_key || `voice_idem_${suffix}`).trim();
    return {
        confirmation_id: `voice_confirm_${suffix}`,
        actor_id: actorId,
        idempotency_key: idempotencyKey,
        created_at: new Date().toISOString(),
        intent_id: String(intent?.intent_id || options.intent_id || ''),
        domain: String(intent?.domain || ''),
        action: String(intent?.action || '')
    };
};

const normalizeVoiceConfirmation = (options = {}) => {
    const confirmation = options.confirmation && typeof options.confirmation === 'object'
        ? options.confirmation
        : {};
    const confirmationId = String(confirmation.confirmation_id || confirmation.confirmationId || '').trim();
    const actorId = String(confirmation.actor_id || confirmation.actorId || options.actor?.user_id || options.actor_id || '').trim();
    const idempotencyKey = String(
        options.idempotency_key
        || options.idempotencyKey
        || confirmation.idempotency_key
        || confirmation.idempotencyKey
        || ''
    ).trim();
    if (!confirmationId || !actorId || !idempotencyKey) return null;
    return {
        confirmation_id: confirmationId,
        actor_id: actorId,
        idempotency_key: idempotencyKey
    };
};

const normalizeBatchEvents = (intent, options = {}) => ensureToolchain(intent).map((step) => ({
    tool_id: step.tool_id,
    action: step.action || 'pointer.click',
    input: step.input && typeof step.input === 'object' ? { ...step.input } : {},
    source: normalizeInvocationSource(intent, options),
    meta: normalizeInvocationMeta(intent, options)
}));

const buildPendingConnectorStep = (capability, input = {}) => ({
    source: 'pending_connector',
    capability: String(capability || '').trim() || null,
    input: input && typeof input === 'object' ? { ...input } : {}
});

const BUSINESS_CONNECTOR_DOMAINS = new Set(['mail', 'calendar', 'contacts', 'bank']);

const wait = (ms = 0) => new Promise((resolve) => {
    setTimeout(resolve, Math.max(0, Number(ms) || 0));
});

const withSoftTimeout = async (task, {
    timeoutMs = 0,
    fallbackValue = null
} = {}) => {
    const duration = Number(timeoutMs);
    if (!Number.isFinite(duration) || duration <= 0) {
        return task();
    }
    return Promise.race([
        Promise.resolve().then(() => task()),
        wait(duration).then(() => fallbackValue)
    ]);
};

const resolveMailApi = async (env) => {
    const hostEnv = resolveHostEnv(env);
    const existing = hostEnv?.Squirrel?.mail || hostEnv?.atome?.mail || hostEnv?.AtomeMail || env?.Squirrel?.mail || env?.atome?.mail || env?.AtomeMail || null;
    if (existing) return existing;
    const autoBootstrapAllowed = !!(
        hostEnv?.location
        || hostEnv?.document
        || hostEnv?.navigator
        || hostEnv?.fetch
        || hostEnv?.__TAURI__
        || hostEnv?.__TAURI_INTERNALS__
        || typeof window !== 'undefined'
    );
    if (!autoBootstrapAllowed) return null;
    const mod = await import('../mail/bootstrap.js');
    if (typeof mod?.createGlobalMailApi === 'function') {
        return mod.createGlobalMailApi({ env: hostEnv });
    }
    return null;
};

const readExistingMailApi = (env) => {
    const hostEnv = resolveHostEnv(env);
    return hostEnv?.Squirrel?.mail || hostEnv?.atome?.mail || hostEnv?.AtomeMail || env?.Squirrel?.mail || env?.atome?.mail || env?.AtomeMail || null;
};

const resolveMessagesApi = async (env) => {
    const hostEnv = resolveHostEnv(env);
    return hostEnv?.Squirrel?.messages
        || hostEnv?.atome?.messages
        || hostEnv?.AtomeMessages
        || env?.Squirrel?.messages
        || env?.atome?.messages
        || env?.AtomeMessages
        || null;
};

const readExistingMessagesApi = (env) => {
    const hostEnv = resolveHostEnv(env);
    return hostEnv?.Squirrel?.messages
        || hostEnv?.atome?.messages
        || hostEnv?.AtomeMessages
        || env?.Squirrel?.messages
        || env?.atome?.messages
        || env?.AtomeMessages
        || null;
};

const resolveContactsApi = async (env) => {
    const hostEnv = resolveHostEnv(env);
    const existing = hostEnv?.Squirrel?.contacts || hostEnv?.atome?.contacts || hostEnv?.AtomeContacts || env?.Squirrel?.contacts || env?.atome?.contacts || env?.AtomeContacts || null;
    if (existing) return existing;
    const autoBootstrapAllowed = !!(
        hostEnv?.location
        || hostEnv?.document
        || hostEnv?.navigator
        || hostEnv?.fetch
        || hostEnv?.__TAURI__
        || hostEnv?.__TAURI_INTERNALS__
        || typeof window !== 'undefined'
    );
    if (!autoBootstrapAllowed) return null;
    const mod = await import('../contacts/bootstrap.js');
    if (typeof mod?.createGlobalContactsApi === 'function') {
        return mod.createGlobalContactsApi({ env: hostEnv });
    }
    return null;
};

const readExistingContactsApi = (env) => {
    const hostEnv = resolveHostEnv(env);
    return hostEnv?.Squirrel?.contacts || hostEnv?.atome?.contacts || hostEnv?.AtomeContacts || env?.Squirrel?.contacts || env?.atome?.contacts || env?.AtomeContacts || null;
};

const resolveCalendarApi = async (env) => {
    const hostEnv = resolveHostEnv(env);
    const existing = hostEnv?.Squirrel?.calendar || hostEnv?.atome?.calendar || hostEnv?.AtomeCalendar || env?.Squirrel?.calendar || env?.atome?.calendar || env?.AtomeCalendar || null;
    if (existing) return existing;
    const autoBootstrapAllowed = !!(
        hostEnv?.location
        || hostEnv?.document
        || hostEnv?.navigator
        || hostEnv?.fetch
        || hostEnv?.__TAURI__
        || hostEnv?.__TAURI_INTERNALS__
        || typeof window !== 'undefined'
    );
    if (!autoBootstrapAllowed) return null;
    const mod = await import('../calendar/bootstrap.js');
    if (typeof mod?.createGlobalCalendarApi === 'function') {
        return mod.createGlobalCalendarApi({ env: hostEnv });
    }
    return null;
};

const readExistingCalendarApi = (env) => {
    const hostEnv = resolveHostEnv(env);
    return hostEnv?.Squirrel?.calendar || hostEnv?.atome?.calendar || hostEnv?.AtomeCalendar || env?.Squirrel?.calendar || env?.atome?.calendar || env?.AtomeCalendar || null;
};

const dispatchWindowEvent = (env, name, detail) => {
    if (!env || typeof env.dispatchEvent !== 'function') return;
    if (!name || typeof env.CustomEvent !== 'function') return;
    try {
        env.dispatchEvent(new env.CustomEvent(name, { detail }));
    } catch (_) {
        // Ignore non-browser hosts.
    }
};

const truncateForAi = (value, maxLength = 600) => {
    const text = String(value || '').trim().replace(/\s+/g, ' ');
    if (!text) return '';
    if (text.length <= maxLength) return text;
    return `${text.slice(0, Math.max(0, maxLength - 1)).trim()}…`;
};

const normalizePlannerText = (value) => String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const isProgressPlaceholderReply = (value = '') => {
    const normalized = normalizePlannerText(value);
    if (!normalized) return false;
    return (
        normalized.includes('je regarde')
        || normalized.includes('je verifie')
        || normalized.includes('je suis en train')
        || normalized.includes('je te prepare')
        || normalized.includes('je m occupe')
        || normalized.includes('je te dis')
        || normalized.includes('ca arrive')
        || normalized.includes('tu veux que je')
        || normalized.includes('i am checking')
        || normalized.includes('i am preparing')
        || normalized.includes('let me check')
        || normalized.includes('it is coming')
        || normalized.includes('do you want me to')
    );
};

const resolveIntentLocale = (intent = {}, options = {}) => String(
    intent?.locale
    || options?.locale
    || options?.lang
    || 'fr-FR'
).trim().toLowerCase();

const flattenResultPayload = (value, depth = 0) => {
    if (!value || typeof value !== 'object' || depth > 6) return value;
    if (Array.isArray(value)) return value;
    if (value.result !== undefined) {
        return flattenResultPayload(value.result, depth + 1);
    }
    return value;
};

const buildRuntimeIntentMeta = (result, {
    phase = 'executed',
    replyText = ''
} = {}) => {
    const resolved = flattenResultPayload(result);
    const atomeId = String(
        resolved?.atome_id
        || resolved?.elementId
        || resolved?.id
        || ''
    ).trim() || null;
    const selectedIds = Array.isArray(resolved?.selected_ids)
        ? resolved.selected_ids.map((value) => String(value || '').trim()).filter(Boolean)
        : [];
    return {
        phase,
        ...(replyText ? { reply_text: replyText, spoken_reply: replyText } : {}),
        ...(atomeId ? { atome_id: atomeId } : {}),
        ...(selectedIds.length ? { selected_ids: selectedIds } : {}),
        result: {
            ok: resolved?.ok !== false,
            ...(atomeId ? { atome_id: atomeId } : {}),
            ...(selectedIds.length ? { selected_ids: selectedIds } : {})
        }
    };
};

const pickFirstArray = (value, depth = 0) => {
    if (!value || typeof value !== 'object' || depth > 6) return [];
    if (Array.isArray(value)) return value;
    if (Array.isArray(value.items)) return value.items;
    if (Array.isArray(value.events)) return value.events;
    if (Array.isArray(value.contacts)) return value.contacts;
    if (Array.isArray(value.atomes)) return value.atomes;
    if (Array.isArray(value.results)) {
        for (const entry of value.results) {
            const nested = pickFirstArray(entry, depth + 1);
            if (nested.length) return nested;
        }
    }
    for (const nestedValue of Object.values(value)) {
        const nested = pickFirstArray(nestedValue, depth + 1);
        if (nested.length) return nested;
    }
    return [];
};

const pickNamedObject = (value, keys = [], depth = 0) => {
    if (!value || typeof value !== 'object' || depth > 6) return null;
    for (const key of keys) {
        if (value[key] && typeof value[key] === 'object') {
            return value[key];
        }
    }
    if (value.result && typeof value.result === 'object') {
        return pickNamedObject(value.result, keys, depth + 1);
    }
    if (Array.isArray(value.results)) {
        for (const entry of value.results) {
            const nested = pickNamedObject(entry, keys, depth + 1);
            if (nested) return nested;
        }
    }
    return null;
};

const formatCalendarItemLabel = (item = {}) => String(
    item?.title
    || item?.summary
    || item?.name
    || ''
).trim();

const formatContactLabel = (item = {}) => String(
    item?.name
    || item?.display_name
    || item?.full_name
    || item?.nickname
    || item?.email
    || item?.phone
    || ''
).trim();

const formatMailItemLabel = (item = {}) => String(
    item?.subject
    || item?.preview
    || item?.body_text
    || ''
).trim();

const buildStructuredReplyFromPayload = (payload, intent = {}, options = {}) => {
    const locale = resolveIntentLocale(intent, options);
    const english = locale.startsWith('en');
    const domain = String(intent?.domain || '').trim().toLowerCase();
    const action = String(intent?.action || '').trim().toLowerCase();
    const resolved = flattenResultPayload(payload);

    if (!resolved || typeof resolved !== 'object') return '';

    if (domain === 'calendar') {
        const event = pickNamedObject(resolved, ['event']);
        const items = pickFirstArray(resolved).filter((entry) => entry && typeof entry === 'object');
        if (event) {
            const title = formatCalendarItemLabel(event);
            if (title) {
                if (action.includes('create')) return english ? `The event "${title}" has been created.` : `Le rendez-vous "${title}" a ete cree.`;
                if (action.includes('update')) return english ? `The event "${title}" has been updated.` : `Le rendez-vous "${title}" a ete mis a jour.`;
                return english ? `Calendar event: ${title}.` : `Rendez-vous : ${title}.`;
            }
        }
        if (items.length) {
            const labels = items.map((entry) => formatCalendarItemLabel(entry)).filter(Boolean).slice(0, 3);
            const count = items.length;
            if (labels.length) {
                return english
                    ? `You have ${count} calendar event(s): ${labels.join(', ')}.`
                    : `Tu as ${count} rendez-vous: ${labels.join(', ')}.`;
            }
            return english
                ? `You have ${count} calendar event(s).`
                : `Tu as ${count} rendez-vous.`;
        }
        if (resolved?.ok === true && (action.includes('list') || action.includes('search'))) {
            return english ? 'I do not see any calendar event right now.' : "Je ne vois pas de rendez-vous pour le moment.";
        }
    }

    if (domain === 'contacts') {
        const contact = pickNamedObject(resolved, ['contact']);
        const items = pickFirstArray(resolved).filter((entry) => entry && typeof entry === 'object');
        if (contact) {
            const label = formatContactLabel(contact);
            if (label) {
                return english ? `Contact: ${label}.` : `Contact: ${label}.`;
            }
        }
        if (items.length) {
            const labels = items.map((entry) => formatContactLabel(entry)).filter(Boolean).slice(0, 3);
            const count = items.length;
            if (labels.length) {
                return english
                    ? `I found ${count} contact(s): ${labels.join(', ')}.`
                    : `J'ai trouve ${count} contact(s): ${labels.join(', ')}.`;
            }
            return english
                ? `I found ${count} contact(s).`
                : `J'ai trouve ${count} contact(s).`;
        }
        if (resolved?.ok === true && (action.includes('list') || action.includes('search') || action.includes('read'))) {
            return english ? 'I do not see any matching contact right now.' : "Je ne vois pas de contact correspondant pour le moment.";
        }
    }

    if (domain === 'mail') {
        const item = pickNamedObject(resolved, ['item', 'message']);
        const items = pickFirstArray(resolved).filter((entry) => entry && typeof entry === 'object');
        if (item) {
            const label = formatMailItemLabel(item);
            if (action.includes('archive')) return english ? 'The mail has been archived.' : 'Le mail a ete archive.';
            if (action.includes('delete')) return english ? 'The mail has been deleted.' : 'Le mail a ete supprime.';
            if (action.includes('mark_read')) return english ? 'The mail has been marked as read.' : 'Le mail a ete marque comme lu.';
            if (action.includes('mark_unread')) return english ? 'The mail has been marked as unread.' : 'Le mail a ete marque comme non lu.';
            if (label) {
                return english ? `Mail: ${label}.` : `Mail: ${label}.`;
            }
        }
        if (items.length) {
            const labels = items.map((entry) => formatMailItemLabel(entry)).filter(Boolean).slice(0, 3);
            const count = items.length;
            if (labels.length) {
                return english
                    ? `I found ${count} mail item(s): ${labels.join(', ')}.`
                    : `J'ai trouve ${count} mail(s): ${labels.join(', ')}.`;
            }
        }
    }

    if (resolved?.elementId || resolved?.atome_id || resolved?.created === true) {
        return english ? 'The object has been created.' : "L'objet a ete cree.";
    }

    if (domain === 'project' || domain === 'atome' || action.includes('list_atomes') || action.includes('check_atome') || action.includes('alter_atome')) {
        const SYSTEM_TYPES = new Set([
            'tool', 'code', 'user', 'project', 'folder', 'organization',
            'share_request', 'share_link', 'share_policy'
        ]);
        const items = pickFirstArray(resolved).filter((entry) => entry && typeof entry === 'object');
        const userItems = items.filter((a) => !SYSTEM_TYPES.has(String(a?.type || a?.atome_type || '').toLowerCase()));
        const systemCount = items.length - userItems.length;

        const formatContentLabel = (a) => {
            const props = a?.properties || a?.data || {};
            const name = String(props?.name || props?.['meta.name'] || a?.name || '').trim();
            const type = String(a?.type || a?.atome_type || '').trim();
            const color = String(props?.color || props?.fill || props?.backgroundColor || '').trim();
            const shape = String(props?.shape || '').trim();
            const parts = [];
            if (name) { parts.push(name); }
            else {
                if (color) parts.push(color);
                if (shape) parts.push(shape);
                if (!parts.length && type) parts.push(type);
            }
            if (type && type !== name && type !== shape) parts.push(`(${type})`);
            return parts.join(' ') || String(a?.id || a?.atome_id || '').slice(0, 8);
        };

        if (action.includes('alter_atome') || action.includes('alter')) {
            if (resolved?.ok === true || resolved?.status === 'OK' || resolved?.altered || resolved?.updated) {
                return english ? 'Done.' : 'Fait.';
            }
        }

        if (action.includes('check_atome') || action.includes('find_atome') || action.includes('search_atome')) {
            const queryText = String(intent?.query_text || intent?.actions?.[0]?.params?.query_text || '').toLowerCase().trim();
            const queryTerms = queryText.split(/\s+/).filter(Boolean);
            if (queryTerms.length && userItems.length) {
                const matches = userItems.filter((a) => {
                    const props = a?.properties || a?.data || {};
                    const haystack = [
                        String(props?.name || props?.['meta.name'] || a?.name || ''),
                        String(a?.type || a?.atome_type || ''),
                        String(props?.color || ''),
                        String(props?.fill || ''),
                        String(props?.backgroundColor || ''),
                        String(props?.shape || '')
                    ].join(' ').toLowerCase();
                    return queryTerms.every((term) => haystack.includes(term));
                });
                if (matches.length) {
                    const labels = matches.map(formatContentLabel).filter(Boolean).slice(0, 5);
                    return english
                        ? `Yes, I found ${matches.length}: ${labels.join(', ')}.`
                        : `Oui, j'ai trouve ${matches.length}: ${labels.join(', ')}.`;
                }
                return english
                    ? `No, I do not see any "${queryText}" in the project.`
                    : `Non, je ne vois pas de "${queryText}" dans le projet.`;
            }
            if (!userItems.length) {
                return english
                    ? 'The project has no user-created content.'
                    : "Le projet ne contient aucun contenu cree par l'utilisateur.";
            }
        }

        if (userItems.length) {
            const labels = userItems.map(formatContentLabel).filter(Boolean).slice(0, 10);
            const count = userItems.length;
            const sys = systemCount > 0
                ? (english ? ` (plus ${systemCount} system objects)` : ` (plus ${systemCount} objets systeme)`)
                : '';
            if (labels.length) {
                return english
                    ? `The project has ${count} user object(s): ${labels.join(', ')}.${sys}`
                    : `Le projet contient ${count} objet(s) utilisateur: ${labels.join(', ')}.${sys}`;
            }
            return english
                ? `The project has ${count} user object(s).${sys}`
                : `Le projet contient ${count} objet(s) utilisateur.${sys}`;
        }
        if (items.length && !userItems.length) {
            return english
                ? `The project has ${items.length} system object(s) but no user-created content.`
                : `Le projet contient ${items.length} objet(s) systeme mais aucun contenu cree par l'utilisateur.`;
        }
        if (resolved?.ok === true || resolved?.tauri || resolved?.fastify) {
            return english ? 'The project has no atomes.' : "Le projet ne contient aucun atome.";
        }
    }

    return '';
};

const buildRuntimeFailureReply = (payload, intent = {}, options = {}) => {
    const resolved = flattenResultPayload(payload);
    const explicitReply = String(resolved?.reply_text || '').trim();
    if (explicitReply) return explicitReply;
    const locale = resolveIntentLocale(intent, options);
    return locale.startsWith('en')
        ? 'The action failed.'
        : "L'action a echoue.";
};

const wantsExplicitConfirmation = (intent = {}) => {
    const normalized = String(intent?.utterance?.normalized || '').trim();
    if (!normalized) return false;
    return (
        normalized.includes('confirme')
        || normalized.includes('confirmation')
        || normalized.includes('demande moi avant')
        || normalized.includes('dis moi avant')
        || normalized.includes('avant d envoyer')
        || normalized.includes('before sending')
        || normalized.includes('ask me before')
        || normalized.includes('confirm first')
    );
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

const createDefaultMailAiSummarizer = ({
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

const createMcpBridge = (env) => {
    const asyncHandler = readEnv(env, 'handleAtomeMCPRequestAsync');
    if (typeof asyncHandler !== 'function') return null;
    return {
        kind: 'mcp',
        async listRuntimeTools() {
            const response = await asyncHandler({
                jsonrpc: '2.0',
                id: 'voice-runtime-tools-list',
                method: 'runtime.tools.list',
                params: {}
            });
            if (response?.error) {
                throw new Error(response.error.message || 'MCP runtime.tools.list failed');
            }
            return Array.isArray(response?.result?.tools) ? response.result.tools : [];
        },
        async callRuntimeTool(payload = {}) {
            const response = await asyncHandler({
                jsonrpc: '2.0',
                id: 'voice-runtime-tool-call',
                method: 'runtime.tools.call',
                params: payload
            });
            if (response?.error) {
                throw new Error(response.error.message || 'MCP runtime.tools.call failed');
            }
            return response.result;
        },
        async batchRuntimeTools(events = [], options = {}) {
            const response = await asyncHandler({
                jsonrpc: '2.0',
                id: 'voice-runtime-tool-batch',
                method: 'runtime.tools.batch_call',
                params: {
                    events,
                    ...(options?.tx_id ? { tx_id: options.tx_id } : {})
                }
            });
            if (response?.error) {
                throw new Error(response.error.message || 'MCP runtime.tools.batch_call failed');
            }
            return response.result;
        }
    };
};

const createRuntimeBridge = (env) => {
    const runtime = readEnv(env, 'atome')?.tools?.v2Runtime
        || readEnv(env, 'window')?.atome?.tools?.v2Runtime
        || null;
    if (!runtime || typeof runtime.invokeById !== 'function') return null;
    return {
        kind: 'runtime_v2',
        async listRuntimeTools() {
            if (typeof runtime.listTools !== 'function') return [];
            return runtime.listTools({ includeDisabled: false });
        },
        async callRuntimeTool(payload = {}) {
            return runtime.invokeById(payload);
        },
        async batchRuntimeTools(events = [], options = {}) {
            if (typeof runtime.invokeBatch === 'function') {
                return runtime.invokeBatch(events, options);
            }
            const results = [];
            for (const event of events) {
                results.push(await runtime.invokeById(event));
            }
            return { ok: results.every((entry) => entry?.ok !== false), results };
        }
    };
};

export const resolveVoiceExecutionBridge = (env = defaultEnv()) => {
    return createMcpBridge(env) || createRuntimeBridge(env) || null;
};

class VoiceOrchestrator {
    constructor({
        env = defaultEnv(),
        bridge = resolveVoiceExecutionBridge(env),
        aiPlanner = null,
        mailAiSummarizer = null,
        classifyIntent = classifyVoiceIntent,
        sessionRuntime = null,
        toolRouter = null,
        persistentMemory = null,
        traceStore = null,
        now = () => Date.now(),
        eventName = VOICE_ORCHESTRATOR_EVENT_NAME
    } = {}) {
        this.env = env;
        this.bridge = bridge;
        this.aiPlanner = aiPlanner && typeof aiPlanner.planUtterance === 'function' ? aiPlanner : null;
        this.mailAiSummarizer = typeof mailAiSummarizer === 'function'
            ? mailAiSummarizer
            : createDefaultMailAiSummarizer({ env });
        this.classifyIntent = typeof classifyIntent === 'function' ? classifyIntent : classifyVoiceIntent;
        this.sessionRuntime = sessionRuntime && typeof sessionRuntime.getSession === 'function' ? sessionRuntime : null;
        this.toolRouter = toolRouter && typeof toolRouter.execute === 'function' ? toolRouter : null;
        this.persistentMemory = persistentMemory && typeof persistentMemory.getSummary === 'function'
            ? persistentMemory
            : createPersistentMemoryStore({ env });
        this.traceStore = traceStore && typeof traceStore.startTrace === 'function'
            ? traceStore
            : createAiTraceStore({ env });
        this.now = typeof now === 'function' ? now : (() => Date.now());
        this.eventName = String(eventName || VOICE_ORCHESTRATOR_EVENT_NAME);
        this.runtimeCatalog = null;
        this.listeners = new Set();
        this.journal = [];
        this.seq = 0;
    }

    subscribe(listener) {
        if (typeof listener !== 'function') return () => { };
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    /**
     * Lazily initializes the unified tool router by resolving domain connectors
     * from the current environment. Call this after all domain APIs are
     * registered on window.Squirrel.
     */
    async initToolRouter({ workingMemory = null } = {}) {
        const mail = await resolveMailApi(this.env);
        const messages = await resolveMessagesApi(this.env);
        const contacts = await resolveContactsApi(this.env);
        const calendar = await resolveCalendarApi(this.env);
        this.toolRouter = createToolRouter({
            connectors: { mail, messages, contacts, calendar },
            workingMemory: workingMemory
                || (this.sessionRuntime?.workingMemory ?? null),
            bridge: this.bridge
        });
        return this.toolRouter;
    }

    ensureExistingToolRouter({ workingMemory = null } = {}) {
        if (this.toolRouter) return this.toolRouter;
        const connectors = {
            mail: readExistingMailApi(this.env),
            messages: readExistingMessagesApi(this.env),
            contacts: readExistingContactsApi(this.env),
            calendar: readExistingCalendarApi(this.env)
        };
        if (!Object.values(connectors).some(Boolean)) return null;
        this.toolRouter = createToolRouter({
            connectors,
            workingMemory: workingMemory
                || (this.sessionRuntime?.workingMemory ?? null),
            bridge: this.bridge
        });
        return this.toolRouter;
    }

    listJournal({ limit = 50 } = {}) {
        const size = Number.isFinite(Number(limit)) ? Math.max(1, Math.round(Number(limit))) : 50;
        return cloneValue(this.journal.slice(-size));
    }

    clearJournal() {
        this.journal = [];
        this.seq = 0;
    }

    async listRuntimeTools({ refresh = false } = {}) {
        if (!refresh && Array.isArray(this.runtimeCatalog)) {
            return cloneValue(this.runtimeCatalog);
        }
        if (!this.bridge || typeof this.bridge.listRuntimeTools !== 'function') {
            this.runtimeCatalog = [];
            return [];
        }
        const tools = await this.bridge.listRuntimeTools();
        this.runtimeCatalog = Array.isArray(tools) ? cloneValue(tools) : [];
        return cloneValue(this.runtimeCatalog);
    }

    async planUtterance(utterance, options = {}) {
        const runtimeTools = options.runtime_tools || await this.listRuntimeTools({
            refresh: options.refresh_catalog === true
        });
        const planningContext = this.#buildPlanningContext(options.session_id, options.context);
        if (this.persistentMemory && typeof this.persistentMemory.getSummary === 'function') {
            planningContext.persistent_memory_summary = this.persistentMemory.getSummary();
        }
        planningContext.identity_resolution = await resolveIdentityContext({
            utterance,
            workingMemory: this.sessionRuntime?.workingMemory || null,
            connectors: {
                contacts: readExistingContactsApi(this.env),
                calendar: readExistingCalendarApi(this.env),
                mail: readExistingMailApi(this.env)
            },
            ui_context: planningContext.ui_context || {},
            preferred_domains: ['contacts', 'calendar', 'mail', 'atome']
        });
        const localIntent = this.classifyIntent(utterance, {
            intent_id: options.intent_id,
            locale: options.locale,
            source: options.source,
            context: planningContext,
            runtime_tools: runtimeTools
        });
        const normalizedIntent = await this.#resolvePlanningIntent(utterance, {
            ...options,
            locale: options.locale,
            context: planningContext,
            runtime_tools: runtimeTools,
            local_intent: normalizeVoiceIntent(localIntent)
        });
        this.#bindSessionIntent(options.session_id, normalizedIntent, {
            phase: 'planned'
        });
        this.#pushJournal('voice.intent.planned', {
            utterance: normalizedIntent.utterance.raw,
            intent: normalizedIntent
        });
        return normalizedIntent;
    }

    planSessionFollowup(sessionId, {
        consume = false,
        nextPhase = 'processing',
        allowResume = true
    } = {}) {
        if (!this.sessionRuntime) {
            throw new Error('Voice session runtime is not available for followup planning');
        }
        const snapshot = this.sessionRuntime.getSession(sessionId);
        const consumed = consume === true
            ? this.sessionRuntime.consumePendingFollowup(sessionId, { nextPhase, allowResume })
            : null;
        const followup = consumed?.followup
            || snapshot?.conversation?.pending_followup
            || ((allowResume === true && snapshot?.conversation?.resume_available) ? 'resume_interrupted' : null);
        if (!followup) return null;
        const activeIntent = consumed?.active_intent || snapshot?.conversation?.active_intent || null;
        const planned = this.#buildContextualFollowupIntent({
            sessionId,
            followup,
            activeIntent
        });
        this.#bindSessionIntent(sessionId, planned, {
            phase: consume === true ? 'followup_consumed' : 'followup_planned',
            followup
        });
        this.#pushJournal('voice.followup.planned', {
            session_id: sessionId,
            followup,
            intent: planned
        });
        return planned;
    }

    async executeSessionFollowup(sessionId, options = {}) {
        const planned = this.planSessionFollowup(sessionId, {
            consume: options.consume !== false,
            nextPhase: options.nextPhase || 'processing',
            allowResume: options.allowResume !== false
        });
        if (!planned) return null;
        return this.executeIntent(planned, {
            ...options,
            session_id: sessionId
        });
    }

    async executeIntent(intent, options = {}) {
        const normalizedIntent = normalizeVoiceIntent(intent);
        // Trust-gated: mail reply confirmation is no longer forcibly disabled.
        // The trust scoring engine in tool_router handles confirmation at the result level.
        this.#bindSessionIntent(options.session_id, normalizedIntent, {
            phase: 'executing'
        });
        if (normalizedIntent.status === 'failed' && normalizedIntent.context?.ai_error) {
            const response = {
                ok: false,
                executed: false,
                transport: 'none',
                intent: normalizedIntent,
                error: normalizedIntent.context.ai_error,
                reply_text: normalizedIntent.assistant_reply || null,
                spoken_reply: normalizedIntent.assistant_reply || null
            };
            this.#pushJournal('voice.intent.executed', response);
            return response;
        }
        const confirmation = normalizeVoiceConfirmation(options);
        if (
            normalizedIntent.execution.confirmation_required === true
            && normalizedIntent.execution.target !== 'pending_connector'
            && !confirmation
        ) {
            const createdConfirmation = createVoiceConfirmation(normalizedIntent, options);
            const pendingIntent = {
                ...normalizedIntent,
                context: {
                    ...(normalizedIntent.context || {}),
                    voice_confirmation: createdConfirmation
                }
            };
            const response = {
                ok: true,
                executed: false,
                transport: normalizedIntent.execution.target,
                intent: pendingIntent,
                reason: 'confirmation_required',
                confirmation_required: true,
                confirmation: createdConfirmation,
                confirmation_prompt: options.confirmation_prompt
                    || (String(normalizedIntent?.locale || '').toLowerCase().startsWith('fr')
                        ? `Confirmation demandee avant execution de ${normalizedIntent.domain}:${normalizedIntent.action}.`
                        : `Confirmation requested before executing ${normalizedIntent.domain}:${normalizedIntent.action}.`)
            };
            this.#pushJournal('voice.intent.executed', response);
            return response;
        }
        const toolchain = ensureToolchain(normalizedIntent);
        const replyText = typeof normalizedIntent.assistant_reply === 'string' ? normalizedIntent.assistant_reply.trim() : '';

        if (normalizedIntent.execution.target === 'voice_runtime') {
            const response = {
                ok: true,
                executed: false,
                transport: 'voice_runtime',
                intent: normalizedIntent,
                reason: 'local_command_handled_by_voice_runtime',
                ...(replyText ? { reply_text: replyText, spoken_reply: replyText } : {})
            };
            this.#pushJournal('voice.intent.executed', response);
            return response;
        }

        if (normalizedIntent.execution.target === 'none') {
            const response = {
                ok: !!replyText,
                executed: false,
                transport: 'none',
                intent: normalizedIntent,
                ...(replyText
                    ? {
                        reply_text: replyText,
                        spoken_reply: replyText
                    }
                    : {
                        error: 'voice_intent_not_executable'
                    })
            };
            this.#pushJournal('voice.intent.executed', response);
            return response;
        }

        if (normalizedIntent.execution.target === 'pending_connector') {
            const resolved = await this.#executePendingConnector(normalizedIntent, toolchain, options);
            if (resolved) {
                this.#pushJournal('voice.intent.executed', resolved);
                return resolved;
            }
            const response = {
                ok: true,
                executed: false,
                transport: 'pending_connector',
                intent: normalizedIntent,
                requested_capabilities: cloneValue(normalizedIntent.requested_capabilities),
                reason: 'connector_not_implemented_yet',
                ...(replyText ? { reply_text: replyText, spoken_reply: replyText } : {})
            };
            this.#pushJournal('voice.intent.executed', response);
            return response;
        }

        if (BUSINESS_CONNECTOR_DOMAINS.has(String(normalizedIntent?.domain || '').trim())) {
            const resolved = await this.#executePendingConnector(normalizedIntent, toolchain, options);
            if (resolved) {
                this.#pushJournal('voice.intent.executed', resolved);
                return resolved;
            }
        }

        if (normalizedIntent.execution.target === 'atome_ai') {
            const response = await this.#executeAgentToolchain(normalizedIntent, toolchain, options);
            this.#pushJournal('voice.intent.executed', response);
            return response;
        }

        if (normalizedIntent.execution.target !== 'runtime_v2') {
            const response = {
                ok: false,
                executed: false,
                transport: 'none',
                intent: normalizedIntent,
                error: 'voice_intent_not_executable'
            };
            this.#pushJournal('voice.intent.executed', response);
            return response;
        }

        if (!this.bridge) {
            const response = {
                ok: false,
                executed: false,
                transport: 'none',
                intent: normalizedIntent,
                error: 'voice_execution_bridge_unavailable'
            };
            this.#pushJournal('voice.intent.executed', response);
            return response;
        }

        const events = normalizeBatchEvents(normalizedIntent, options);
        if (!events.length) {
            const response = {
                ok: false,
                executed: false,
                transport: this.bridge.kind,
                intent: normalizedIntent,
                error: 'voice_toolchain_empty'
            };
            this.#pushJournal('voice.intent.executed', response);
            return response;
        }

        if (events.length === 1) {
            const result = await this.bridge.callRuntimeTool(events[0]);
            this.traceStore?.appendExecution?.(options.trace_id, {
                tool_name: events[0]?.tool_id || 'runtime.tools.call',
                domain: 'runtime',
                ok: result?.ok !== false,
                status: result?.ok === false ? 'ERROR' : 'OK',
                error: result?.error || null
            });
            const executionOk = result?.ok !== false;
            const structuredReply = executionOk ? buildStructuredReplyFromPayload(result, normalizedIntent, options) : '';
            const fallbackReply = executionOk
                ? (structuredReply || replyText)
                : buildRuntimeFailureReply(result, normalizedIntent, options);
            this.#bindSessionIntent(options.session_id, normalizedIntent, buildRuntimeIntentMeta(result, {
                phase: 'executed',
                replyText: fallbackReply
            }));
            const response = {
                ok: executionOk,
                executed: executionOk,
                transport: this.bridge.kind,
                intent: normalizedIntent,
                result,
                ...(fallbackReply ? { reply_text: fallbackReply, spoken_reply: fallbackReply } : {})
            };
            this.#pushJournal('voice.intent.executed', response);
            return response;
        }

        const result = await this.bridge.batchRuntimeTools(events, {
            tx_id: options.tx_id || normalizedIntent.intent_id || undefined
        });
        events.forEach((event, index) => {
            const stepResult = Array.isArray(result?.results) ? result.results[index] : result;
            this.traceStore?.appendExecution?.(options.trace_id, {
                tool_name: event?.tool_id || 'runtime.tools.call',
                domain: 'runtime',
                ok: stepResult?.ok !== false,
                status: stepResult?.ok === false ? 'ERROR' : 'OK',
                error: stepResult?.error || null
            });
        });
        const executionOk = result?.ok !== false;
        const structuredReply = executionOk ? buildStructuredReplyFromPayload(result, normalizedIntent, options) : '';
        const fallbackReply = executionOk
            ? (structuredReply || replyText)
            : buildRuntimeFailureReply(result, normalizedIntent, options);
        this.#bindSessionIntent(options.session_id, normalizedIntent, buildRuntimeIntentMeta(result, {
            phase: 'executed',
            replyText: fallbackReply
        }));
        const response = {
            ok: executionOk,
            executed: executionOk,
            transport: this.bridge.kind,
            intent: normalizedIntent,
            result,
            ...(fallbackReply ? { reply_text: fallbackReply, spoken_reply: fallbackReply } : {})
        };
        this.#pushJournal('voice.intent.executed', response);
        return response;
    }

    async executeUtterance(utterance, options = {}) {
        const startedAt = this.now();
        const trace = this.traceStore?.startTrace?.({
            trace_id: options.trace_id,
            input: {
                utterance,
                modality: 'voice',
                locale: options.locale || null
            }
        }) || null;
        const intent = await this.planUtterance(utterance, options);
        const response = await this.executeIntent(intent, {
            ...options,
            trace_id: trace?.trace_id || options.trace_id
        });
        if (trace?.trace_id && this.traceStore?.finishTrace) {
            this.traceStore.finishTrace(trace.trace_id, {
                identity_resolution: intent?.context?.identity_resolution
                    || options?.context?.identity_resolution
                    || null,
                llm_call: {
                    provider: intent?.context?.ai_provider || null,
                    model: intent?.context?.ai_model || null,
                    target: intent?.execution?.target || null,
                    prompt_tokens: intent?.context?.ai_usage?.prompt_tokens || 0,
                    completion_tokens: intent?.context?.ai_usage?.completion_tokens || 0
                },
                autonomy_decision: {
                    confirmation_required: intent?.execution?.confirmation_required === true,
                    risk_tier: response?.result?.aggregate_risk || null
                },
                response: {
                    ok: response?.ok === true,
                    transport: response?.transport || null,
                    reply_text: response?.reply_text || response?.spoken_reply || null
                },
                total_latency_ms: Math.max(0, this.now() - startedAt)
            });
        }
        if (response?.ok === true && response?.executed === true && this.persistentMemory) {
            try {
                this.persistentMemory.recordWorkflowPattern({
                    domain: response?.intent?.domain || null,
                    action: response?.intent?.action || null
                });
                if (response?.intent?.domain === 'contacts') {
                    this.persistentMemory.recordContactAffinity({
                        contact_id: response?.intent?.entities?.current_contact_id || response?.intent?.entities?.contact_id || null,
                        label: response?.intent?.entities?.query_text || null,
                        channel: 'contacts'
                    });
                }
            } catch (_) {
                // Persistent memory updates stay off the critical path.
            }
        }
        return response;
    }

    listTraces(options = {}) {
        if (!this.traceStore || typeof this.traceStore.list !== 'function') return [];
        return this.traceStore.list(options);
    }

    queryTraces(options = {}) {
        if (!this.traceStore || typeof this.traceStore.query !== 'function') return [];
        return this.traceStore.query(options);
    }

    traceMetrics(options = {}) {
        if (!this.traceStore || typeof this.traceStore.metrics !== 'function') return {};
        return this.traceStore.metrics(options);
    }

    listPendingMutations(options = {}) {
        if (!this.toolRouter || typeof this.toolRouter.listPendingMutations !== 'function') return [];
        return this.toolRouter.listPendingMutations(options);
    }

    async flushPendingMutations(options = {}) {
        if (!this.toolRouter || typeof this.toolRouter.flushPendingMutations !== 'function') {
            return { processed: 0, failed: 0, remaining: 0 };
        }
        return this.toolRouter.flushPendingMutations(options);
    }

    #buildPlanningContext(sessionId, providedContext = {}) {
        const context = providedContext && typeof providedContext === 'object'
            ? cloneValue(providedContext)
            : {};
        const key = String(sessionId || '').trim();
        if (!key || !this.sessionRuntime) return context;
        const workingMemory = this.sessionRuntime?.workingMemory || null;
        if (workingMemory && typeof workingMemory.getConversationContext === 'function' && !context.conversation_history) {
            try {
                const memoryContext = workingMemory.getConversationContext({ turnLimit: 6, summaryLimit: 3 });
                if (Array.isArray(memoryContext?.turns) && memoryContext.turns.length) {
                    context.conversation_history = memoryContext.turns.map((turn) => ({
                        user: turn.user || '',
                        assistant: turn.assistant || null,
                        domain: turn.domain || null,
                        action: turn.action || null
                    }));
                }
                if (Array.isArray(memoryContext?.summaries) && memoryContext.summaries.length) {
                    context.conversation_summaries = cloneValue(memoryContext.summaries);
                }
            } catch (_) {
                // Ignore memory context extraction failures.
            }
        }
        try {
            const activeIntent = this.sessionRuntime.getActiveIntent(key);
            if (activeIntent && !context.active_intent) {
                context.active_intent = activeIntent;
            }
        } catch (_) {
            // Ignore unknown session context reads.
        }
        try {
            const session = this.sessionRuntime.getSession(key);
            const intentHistory = session?.conversation?.intent_history;
            if (Array.isArray(intentHistory) && intentHistory.length > 0) {
                const turns = [];
                for (const past of intentHistory.slice(-6)) {
                    const userText = String(past?.utterance?.raw || past?.utterance?.normalized || '').trim();
                    const assistReply = String(past?.meta?.reply_text || past?.meta?.spoken_reply || '').trim();
                    const domain = String(past?.domain || '').trim();
                    const action = String(past?.action || '').trim();
                    if (userText) {
                        turns.push({
                            user: userText,
                            assistant: assistReply || null,
                            domain: domain || null,
                            action: action || null
                        });
                    }
                }
                if (turns.length) {
                    context.conversation_history = turns;
                }
            }
        } catch (_) {
            // Ignore history extraction errors.
        }
        // SOURCE 4: Project, scene, selection, user, mtrack, recent mutations/errors.
        try {
            const sceneContext = collectProjectSceneContext();
            if (sceneContext && !context.project_scene) {
                context.project_scene = sceneContext;
            }
        } catch (_) {
            // Ignore scene context extraction failures.
        }
        return context;
    }

    async #resolvePlanningIntent(utterance, options = {}) {
        const localIntent = normalizeVoiceIntent(options.local_intent);
        if (localIntent.type === 'local_command') {
            return localIntent;
        }
        if (options.use_ai === false || !this.aiPlanner) {
            const locale = options.locale || options.lang || 'fr-FR';
            const english = String(locale).toLowerCase().startsWith('en');
            return normalizeVoiceIntent({
                intent_id: options.intent_id,
                utterance: { raw: utterance },
                locale,
                source: options.source,
                context: {
                    ...(options.context && typeof options.context === 'object' ? cloneValue(options.context) : {}),
                    ai_error: options.use_ai === false ? 'voice_ai_disabled' : 'voice_ai_unavailable',
                    ai_provider: null
                },
                assistant_reply: english
                    ? 'The AI planner is required but unavailable.'
                    : "Le planner IA est requis mais indisponible.",
                type: 'ambiguous',
                domain: 'unknown',
                action: 'unknown',
                confidence: 0,
                status: 'failed',
                execution: {
                    target: 'none',
                    confirmation_required: false,
                    toolchain: []
                }
            });
        }

        return normalizeVoiceIntent(await this.aiPlanner.planUtterance(utterance, {
            intent_id: options.intent_id,
            locale: options.locale,
            source: options.source,
            context: options.context,
            runtime_tools: options.runtime_tools,
            ...(options.signal ? { signal: options.signal } : {})
        }));
    }

    #bindSessionIntent(sessionId, intent, meta = {}) {
        const key = String(sessionId || '').trim();
        if (!key || !this.sessionRuntime || !intent || typeof intent !== 'object') return;
        if (intent.execution?.target === 'voice_runtime' && meta.phase === 'executing') return;
        try {
            this.sessionRuntime.bindIntentContext(key, intent, meta);
        } catch (_) {
            // Ignore stale or unknown session bindings from exploratory calls.
        }
    }

    async #executeAgentToolchain(intent, toolchain, options = {}) {
        const agent = this.env?.AtomeAI || this.env?.window?.AtomeAI || null;
        if (!agent || typeof agent.callTool !== 'function') {
            return {
                ok: false,
                executed: false,
                transport: 'atome_ai',
                intent,
                error: 'voice_agent_bridge_unavailable',
                ...(intent.assistant_reply ? { reply_text: intent.assistant_reply, spoken_reply: intent.assistant_reply } : {})
            };
        }
        if (!toolchain.length) {
            return {
                ok: !!intent.assistant_reply,
                executed: false,
                transport: 'atome_ai',
                intent,
                ...(intent.assistant_reply
                    ? { reply_text: intent.assistant_reply, spoken_reply: intent.assistant_reply }
                    : { error: 'voice_toolchain_empty' })
            };
        }

        const actor = {
            user_id: options.actor?.user_id || 'local_user',
            agent_id: 'voice_ai_planner',
            session_id: options.session_id || 'voice'
        };
        const signals = {
            overall_confidence: Number.isFinite(Number(intent.confidence)) ? Number(intent.confidence) : 0.92
        };
        const source = normalizeInvocationSource(intent, options);
        const results = [];

        if (typeof agent.executeToolchain === 'function') {
            const toolchainResult = await agent.executeToolchain({
                steps: toolchain.map((step) => ({
                    tool_name: step.tool_name,
                    params: step.params || {}
                })),
                actor,
                signals,
                trace_id: options.trace_id,
                intent_id: options.intent_id || intent.intent_id,
                idempotency_key: confirmation?.idempotency_key || options.idempotency_key,
                source,
                confirmation
            });

            if (toolchainResult?.status === 'CONFIRMATION_REQUIRED') {
                this.traceStore?.appendExecution?.(options.trace_id, {
                    tool_name: 'atome_ai.toolchain',
                    domain: 'atome_ai',
                    ok: true,
                    status: toolchainResult.status
                });
                return {
                    ok: true,
                    executed: false,
                    transport: 'atome_ai',
                    intent,
                    confirmation_required: true,
                    reason: 'confirmation_required',
                    confirmation_prompt: toolchainResult.human_summary || intent.assistant_reply || null,
                    result: toolchainResult
                };
            }

            if (toolchainResult?.status !== 'OK') {
                this.traceStore?.appendExecution?.(options.trace_id, {
                    tool_name: 'atome_ai.toolchain',
                    domain: 'atome_ai',
                    ok: false,
                    status: toolchainResult?.status || 'ERROR',
                    error: toolchainResult?.error || null
                });
                return {
                    ok: false,
                    executed: toolchainResult?.completed_steps > 0,
                    transport: 'atome_ai',
                    intent,
                    result: toolchainResult?.result || toolchainResult,
                    error: toolchainResult?.error || toolchainResult?.status || 'voice_toolchain_failed',
                    ...(intent.assistant_reply ? { reply_text: intent.assistant_reply, spoken_reply: intent.assistant_reply } : {})
                };
            }

            const fallbackReply = buildStructuredReplyFromPayload(toolchainResult?.result || toolchainResult, intent, options);
            this.traceStore?.appendExecution?.(options.trace_id, {
                tool_name: 'atome_ai.toolchain',
                domain: 'atome_ai',
                ok: true,
                status: toolchainResult?.status || 'OK'
            });
            return {
                ok: true,
                executed: true,
                transport: 'atome_ai',
                intent,
                result: toolchainResult?.result || toolchainResult,
                ...((fallbackReply || intent.assistant_reply)
                    ? {
                        reply_text: fallbackReply || intent.assistant_reply,
                        spoken_reply: fallbackReply || intent.assistant_reply
                    }
                    : {})
            };
        }

        for (const step of toolchain) {
            const result = await agent.callTool({
                tool_name: step.tool_name,
                params: step.params || {},
                actor,
                signals,
                trace_id: options.trace_id,
                intent_id: options.intent_id || intent.intent_id,
                idempotency_key: options.idempotency_key,
                source
            });
            results.push({
                tool_name: step.tool_name,
                result
            });
            this.traceStore?.appendExecution?.(options.trace_id, {
                tool_name: step.tool_name,
                domain: 'atome_ai',
                ok: result?.status === 'OK',
                status: result?.status || null,
                error: result?.error || null
            });
            if (result?.status && result.status !== 'OK') {
                return {
                    ok: false,
                    executed: true,
                    transport: 'atome_ai',
                    intent,
                    result: { results },
                    error: result.error || result.status,
                    ...(intent.assistant_reply ? { reply_text: intent.assistant_reply, spoken_reply: intent.assistant_reply } : {})
                };
            }
        }

        const fallbackReply = buildStructuredReplyFromPayload({ results }, intent, options);

        return {
            ok: true,
            executed: true,
            transport: 'atome_ai',
            intent,
            result: { results },
            ...((fallbackReply || intent.assistant_reply)
                ? {
                    reply_text: fallbackReply || intent.assistant_reply,
                    spoken_reply: fallbackReply || intent.assistant_reply
                }
                : {})
        };
    }

    async #executePendingConnector(intent, toolchain, options = {}) {
        const confirmation = normalizeVoiceConfirmation(options);
        const hostEnv = resolveHostEnv(this.env);
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
            && !hasExplicitBusinessConnectorHost(this.env)
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
        if (!this.toolRouter && String(intent?.domain || '').trim() === 'mail') {
            const mail = readExistingMailApi(this.env);
            if (mail) {
                this.toolRouter = createToolRouter({
                    connectors: { mail },
                    workingMemory: this.sessionRuntime?.workingMemory ?? null,
                    bridge: this.bridge
                });
            }
        }
        if (!this.toolRouter && BUSINESS_CONNECTOR_DOMAINS.has(String(intent?.domain || '').trim())) {
            this.ensureExistingToolRouter();
        }
        if (
            !this.toolRouter
            && intent?.execution?.target === 'pending_connector'
            && BUSINESS_CONNECTOR_DOMAINS.has(String(intent?.domain || '').trim())
        ) {
            try {
                await this.initToolRouter();
            } catch (_) {
                this.#pushJournal('voice.tool_router.bootstrap_failed', {
                    domain: intent?.domain || null
                });
            }
        }
        if (!this.toolRouter) {
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

            this.#pushJournal('voice.tool_router.dispatch', {
                domain: structuredRequest.domain,
                operation: structuredRequest.operation,
                hasFilters: !!(structuredRequest.filters && Object.keys(structuredRequest.filters).length)
            });

            const result = await this.toolRouter.execute(structuredRequest);

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
                this.#pushJournal('voice.trust_gate.triggered', {
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

            this.traceStore?.appendExecution?.(options.trace_id, {
                tool_name: `${structuredRequest.domain}.${structuredRequest.operation}`,
                domain: structuredRequest.domain,
                ok: result?.ok !== false,
                status: result?.queued === true ? 'QUEUED' : (result?.ok === false ? 'ERROR' : 'OK'),
                error: result?.error || null
            });
            this.#pushJournal('voice.tool_router.result', {
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
                && typeof this.mailAiSummarizer === 'function'
            ) {
                const itemsForAi = Array.isArray(result?.items) && result.items.length > 0
                    ? result.items
                    : (result?.item ? [result.item] : []);
                if (itemsForAi.length > 0) {
                    try {
                        const aiSummary = await this.mailAiSummarizer({
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

            this.#bindSessionIntent(options.session_id, intent, {
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
            this.#pushJournal('voice.tool_router.error', {
                domain: intent?.domain,
                error: String(routerErr?.message || routerErr || '')
            });
            return null;
        }
    }

    #buildContextualFollowupIntent({ sessionId, followup, activeIntent }) {
        const baseIntent = activeIntent && typeof activeIntent === 'object'
            ? cloneValue(activeIntent)
            : {
                intent_id: null,
                type: 'ambiguous',
                domain: 'unknown',
                action: 'unknown',
                status: 'ambiguous',
                utterance: { raw: '', normalized: '' },
                entities: {},
                requested_capabilities: [],
                execution: { target: 'none', confirmation_required: false, toolchain: [] }
            };

        const override = baseIntent?.followups?.[followup];
        if (override && typeof override === 'object') {
            return normalizeVoiceIntent({
                ...cloneValue(override),
                context: {
                    session_id: sessionId,
                    followup_kind: followup
                }
            });
        }

        if (followup === 'resume_interrupted') {
            return normalizeVoiceIntent({
                ...baseIntent,
                status: 'ready',
                context: {
                    session_id: sessionId,
                    followup_kind: followup
                }
            });
        }

        const baseDomain = String(baseIntent?.domain || '').trim();
        if (baseDomain === 'mail') {
            if (followup === 'next_item') {
                return normalizeVoiceIntent({
                    ...baseIntent,
                    action: 'next_item',
                    status: 'ready',
                    requested_capabilities: ['mail_next_unread'],
                    context: {
                        session_id: sessionId,
                        followup_kind: followup
                    },
                    execution: {
                        target: 'pending_connector',
                        confirmation_required: false,
                        toolchain: []
                    }
                });
            }
            if (followup === 'previous_item') {
                return normalizeVoiceIntent({
                    ...baseIntent,
                    action: 'previous_item',
                    status: 'ready',
                    requested_capabilities: ['mail_list'],
                    context: {
                        session_id: sessionId,
                        followup_kind: followup
                    },
                    execution: {
                        target: 'pending_connector',
                        confirmation_required: false,
                        toolchain: []
                    }
                });
            }
            if (followup === 'reply_current') {
                return normalizeVoiceIntent({
                    ...baseIntent,
                    action: 'reply_current',
                    status: 'ready',
                    requested_capabilities: ['mail_reply_draft'],
                    context: {
                        session_id: sessionId,
                        followup_kind: followup
                    },
                    execution: {
                        target: 'pending_connector',
                        confirmation_required: false,
                        toolchain: []
                    }
                });
            }
            if (followup === 'summarize_current') {
                return normalizeVoiceIntent({
                    ...baseIntent,
                    action: 'summarize_current',
                    status: 'ready',
                    requested_capabilities: ['mail_summarize'],
                    context: {
                        session_id: sessionId,
                        followup_kind: followup
                    },
                    execution: {
                        target: 'pending_connector',
                        confirmation_required: false,
                        toolchain: []
                    }
                });
            }
        }

        return normalizeVoiceIntent({
            ...baseIntent,
            action: String(followup || 'unknown'),
            status: 'ambiguous',
            context: {
                session_id: sessionId,
                followup_kind: followup
            },
            execution: {
                target: 'none',
                confirmation_required: false,
                toolchain: []
            }
        });
    }

    #pushJournal(type, payload = {}) {
        const entry = {
            seq: ++this.seq,
            at: this.now(),
            type,
            payload: cloneValue(payload)
        };
        this.journal.push(entry);
        if (this.journal.length > 200) {
            this.journal.splice(0, this.journal.length - 200);
        }
        // Feed recent mutations/errors into the project scene collector.
        if (type === 'voice.intent.executed') {
            const intent = payload?.intent;
            if (payload?.ok === false) {
                pushError({
                    code: payload?.error || 'execution_failed',
                    message: payload?.reply_text || null,
                    domain: intent?.domain || null
                });
            } else if (payload?.executed) {
                pushMutation({
                    action: intent?.action || null,
                    domain: intent?.domain || null,
                    atome_id: intent?.entities?.atome_id || null,
                    summary: payload?.reply_text || null
                });
            }
        }
        for (const listener of this.listeners) {
            listener(entry);
        }
        dispatchWindowEvent(this.env, this.eventName, entry);
        return entry;
    }
}

export const createVoiceOrchestrator = (options = {}) => new VoiceOrchestrator(options);

export { VoiceOrchestrator };
