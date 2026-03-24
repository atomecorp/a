import { classifyVoiceIntent, normalizeVoiceIntent, readMailOrderReference } from './intent_schema.js';
import {
    normalizeAiProviderError,
    requestProviderCompletion,
    resolveFirstAiProviderConfig
} from '../ai/provider_client.js';
import { intentToStructuredRequest } from './semantic_contract.js';
import { createToolRouter } from './tool_router.js';

export const VOICE_ORCHESTRATOR_EVENT_NAME = 'squirrel:voice:orchestrator';

const defaultEnv = () => (typeof window !== 'undefined' ? window : globalThis);

const resolveHostEnv = (env = null) => {
    if (env?.window && typeof env.window === 'object') return env.window;
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
    const mod = await import('../mail/bootstrap.js');
    if (typeof mod?.createGlobalMailApi === 'function') {
        return mod.createGlobalMailApi({ env: hostEnv });
    }
    return null;
};

const resolveContactsApi = async (env) => {
    const hostEnv = resolveHostEnv(env);
    const existing = hostEnv?.Squirrel?.contacts || hostEnv?.atome?.contacts || hostEnv?.AtomeContacts || env?.Squirrel?.contacts || env?.atome?.contacts || env?.AtomeContacts || null;
    if (existing) return existing;
    const mod = await import('../contacts/bootstrap.js');
    if (typeof mod?.createGlobalContactsApi === 'function') {
        return mod.createGlobalContactsApi({ env: hostEnv });
    }
    return null;
};

const resolveCalendarApi = async (env) => {
    const hostEnv = resolveHostEnv(env);
    const existing = hostEnv?.Squirrel?.calendar || hostEnv?.atome?.calendar || hostEnv?.AtomeCalendar || env?.Squirrel?.calendar || env?.atome?.calendar || env?.AtomeCalendar || null;
    if (existing) return existing;
    const mod = await import('../calendar/bootstrap.js');
    if (typeof mod?.createGlobalCalendarApi === 'function') {
        return mod.createGlobalCalendarApi({ env: hostEnv });
    }
    return null;
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

const normalizeComparableText = (value) => String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();



const pickMailQueryField = (toolParams = [], fieldName, fallback = null) => {
    for (const params of Array.isArray(toolParams) ? toolParams : []) {
        if (!params || typeof params !== 'object') continue;
        const value = params[fieldName];
        if (typeof value === 'number' && Number.isFinite(value)) {
            return value;
        }
        if (typeof value === 'string' && value.trim()) {
            return value.trim();
        }
        if (Array.isArray(value) && value.some((entry) => String(entry || '').trim())) {
            return value.map((entry) => String(entry || '').trim()).filter(Boolean);
        }
    }
    return fallback;
};

const pickToolParamField = (toolParams = [], fieldName, fallback = null) => {
    for (const params of Array.isArray(toolParams) ? toolParams : []) {
        if (!params || typeof params !== 'object') continue;
        const value = params[fieldName];
        if (typeof value === 'number' && Number.isFinite(value)) return value;
        if (typeof value === 'boolean') return value;
        if (typeof value === 'string' && value.trim()) return value.trim();
        if (Array.isArray(value) && value.some((entry) => String(entry || '').trim())) {
            return value.map((entry) => String(entry || '').trim()).filter(Boolean);
        }
        if (value && typeof value === 'object') return cloneValue(value);
    }
    return fallback;
};

const buildTemporalRange = (temporalRef, referenceDate = new Date()) => {
    const date = referenceDate instanceof Date ? referenceDate : new Date(referenceDate);
    if (Number.isNaN(date.getTime())) return {};
    const startOfDay = (value) => new Date(value.getFullYear(), value.getMonth(), value.getDate(), 0, 0, 0, 0);
    const endOfDay = (value) => new Date(value.getFullYear(), value.getMonth(), value.getDate(), 23, 59, 59, 999);
    const normalized = String(temporalRef || '').trim().toLowerCase();
    if (!normalized) return {};
    if (normalized === 'today') {
        return { start: startOfDay(date), end: endOfDay(date) };
    }
    if (normalized === 'tomorrow') {
        const next = new Date(date);
        next.setDate(next.getDate() + 1);
        return { start: startOfDay(next), end: endOfDay(next) };
    }
    if (normalized === 'this_week') {
        const day = date.getDay();
        const delta = day === 0 ? -6 : 1 - day;
        const start = new Date(date);
        start.setDate(date.getDate() + delta);
        const end = new Date(start);
        end.setDate(start.getDate() + 6);
        return { start: startOfDay(start), end: endOfDay(end) };
    }
    if (normalized === 'this_month') {
        const start = new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);
        const end = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
        return { start, end };
    }
    return {};
};

const buildMailQueryEntities = ({
    activeEntities = {},
    sourceEntities = {},
    sourceToolParams = [],
    unreadOnly = false,
    statusOnly = false
} = {}) => {
    // Carry-over fields: these persist across queries when the user doesn't override them
    const fromFilter = pickMailQueryField(sourceToolParams, 'from', sourceEntities?.from || activeEntities?.from || null);
    const notFromFilter = pickMailQueryField(sourceToolParams, 'not_from', sourceEntities?.not_from || activeEntities?.not_from || null);
    const mailbox = pickMailQueryField(sourceToolParams, 'mailbox', sourceEntities?.mailbox || activeEntities?.mailbox || null);
    const threadId = pickMailQueryField(sourceToolParams, 'thread_id', sourceEntities?.thread_id || activeEntities?.thread_id || null);
    // Per-query fields: order and limit must NOT bleed from previous queries.
    // Only use the current LLM output or current sourceEntities, never activeEntities.
    const limitValue = pickMailQueryField(sourceToolParams, 'limit', sourceEntities?.limit || null);
    const orderValue = pickMailQueryField(sourceToolParams, 'order', sourceEntities?.order || null);
    const next = {
        ...activeEntities,
        ...sourceEntities,
        unread_only: unreadOnly,
        status_only: statusOnly
    };
    // Remove stale per-query fields inherited from activeEntities spread above
    delete next.limit;
    delete next.order;
    if (fromFilter) next.from = cloneValue(fromFilter);
    if (notFromFilter) next.not_from = cloneValue(notFromFilter);
    if (mailbox) next.mailbox = mailbox;
    if (threadId) next.thread_id = threadId;
    if (limitValue !== null && limitValue !== undefined && String(limitValue).trim() !== '') {
        next.limit = Number.isFinite(Number(limitValue)) ? Number(limitValue) : limitValue;
    }
    if (typeof orderValue === 'string' && orderValue.trim()) {
        next.order = orderValue.trim().toLowerCase();
    }
    return next;
};

const applyHeuristicOrder = (queryEntities, normalizedUtterance) => {
    const heuristicOrder = readMailOrderReference(normalizedUtterance);
    if (heuristicOrder) queryEntities.order = heuristicOrder;
};

const readMailLimitFromUtterance = (normalized = '') => {
    if (!normalized) return null;
    // "les 5 mails", "5 derniers mails", "les 5 plus recents"
    const preMatch = normalized.match(/\b(\d+)\s*(?:mail|message|courrier|dernier|plus|premier)/i);
    if (preMatch) {
        const n = parseInt(preMatch[1], 10);
        if (Number.isFinite(n) && n > 0 && n <= 500) return n;
    }
    // "les derniers 5", "mails les plus recents 10"
    const postMatch = normalized.match(/(?:dernier|mail|message|recent|ancien)\w*\s+(\d+)/i);
    if (postMatch) {
        const n = parseInt(postMatch[1], 10);
        if (Number.isFinite(n) && n > 0 && n <= 500) return n;
    }
    // "tous les mails", "all mails"
    if (/\b(?:tous les|toutes les|all)\b/i.test(normalized)) return 999;
    return null;
};

const applyHeuristicLimit = (queryEntities, normalizedUtterance) => {
    const heuristicLimit = readMailLimitFromUtterance(normalizedUtterance);
    if (heuristicLimit) queryEntities.limit = heuristicLimit;
};

const buildMailQueryInput = (entities = {}) => {
    const input = {
        unread_only: entities?.unread_only === true,
        status_only: entities?.status_only === true
    };
    if (entities?.from) input.from = cloneValue(entities.from);
    if (entities?.not_from) input.not_from = cloneValue(entities.not_from);
    if (entities?.mailbox) input.mailbox = entities.mailbox;
    if (entities?.thread_id) input.thread_id = entities.thread_id;
    if (Number.isFinite(Number(entities?.limit))) input.limit = Number(entities.limit);
    if (typeof entities?.order === 'string' && entities.order.trim()) input.order = entities.order.trim().toLowerCase();
    return input;
};

const buildCurrentMailStepInput = (entities = {}, extra = {}) => ({
    context: 'current',
    ...(entities?.current_message_id ? { current_message_id: entities.current_message_id } : {}),
    ...extra
});

const readReplyDraftDetails = (rawUtterance = '') => {
    const text = String(rawUtterance || '').trim();
    if (!text) return null;

    // "demande a X si/de/que Y", "dis a X de/que Y", "ecris a X que Y"
    const demandeMatch = text.match(/^\s*(?:demande|dis|ecris)\s+(?:a|à)\s+(.+?)\s+((?:si|de|que|d')\s+.+)$/i);
    if (demandeMatch) {
        return {
            reply_target: String(demandeMatch[1] || '').trim() || null,
            draft_text: String(demandeMatch[2] || '').trim() || null
        };
    }
    // "demande a X" / "dis a X" / "ecris a X" with no body
    const demandeTargetOnly = text.match(/^\s*(?:demande|dis|ecris)\s+(?:a|à)\s+(\S+.*)$/i);
    if (demandeTargetOnly) {
        return {
            reply_target: String(demandeTargetOnly[1] || '').trim() || null,
            draft_text: null
        };
    }

    // Direct form: "reponds a X que Y" or "reponds a X: Y"
    const directMatch = text.match(/^\s*r(?:e|é)ponds?\s+(.+)$/i);
    if (directMatch) {
        const value = String(directMatch[1] || '').trim();
        if (!value) return null;

        const targetedWithClause = value.match(/^(?:a|à)\s+(.+?)\s+que\s+(.+)$/i);
        if (targetedWithClause) {
            return {
                reply_target: String(targetedWithClause[1] || '').trim() || null,
                draft_text: String(targetedWithClause[2] || '').trim() || null
            };
        }

        const targetedDirect = value.match(/^(?:a|à)\s+(.+?)\s*[:,]\s*(.+)$/i);
        if (targetedDirect) {
            return {
                reply_target: String(targetedDirect[1] || '').trim() || null,
                draft_text: String(targetedDirect[2] || '').trim() || null
            };
        }

        return {
            reply_target: null,
            draft_text: value
        };
    }

    // Natural form: "peux tu repondre a X pour lui dire/demander Y"
    const naturalMatch = text.match(/r(?:e|é)pond(?:re|s)?\s+(?:a|à)\s+(.+?)\s+(?:pour\s+(?:lui|leur)?\s*(?:dire|demander|signaler|confirmer|indiquer|ecrire|annoncer)?|que|en\s+disant)\s+(.+)$/i);
    if (naturalMatch) {
        return {
            reply_target: String(naturalMatch[1] || '').trim() || null,
            draft_text: String(naturalMatch[2] || '').trim() || null
        };
    }

    // Partial natural: "repondre a X" with no message body
    const targetOnly = text.match(/r(?:e|é)pond(?:re|s)?\s+(?:a|à)\s+(.+?)(?:[\s?!.]*$)/i);
    if (targetOnly) {
        return {
            reply_target: String(targetOnly[1] || '').trim() || null,
            draft_text: null
        };
    }

    return null;
};

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

const pickFirstArray = (value, depth = 0) => {
    if (!value || typeof value !== 'object' || depth > 6) return [];
    if (Array.isArray(value)) return value;
    if (Array.isArray(value.items)) return value.items;
    if (Array.isArray(value.events)) return value.events;
    if (Array.isArray(value.contacts)) return value.contacts;
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

    return '';
};

const buildMaterializedMailIntent = (sourceIntent = {}, utterance = '', context = {}, heuristicIntent = null) => {
    const normalizedUtterance = normalizePlannerText(utterance);
    const rawUtterance = String(utterance || '').trim().toLowerCase();
    const activeIntent = context?.active_intent && typeof context.active_intent === 'object'
        ? context.active_intent
        : null;
    const activeEntities = activeIntent?.entities && typeof activeIntent.entities === 'object'
        ? cloneValue(activeIntent.entities)
        : {};
    // Resolve action: if the AI planner returned the generic default 'list'
    // but the heuristic detected a more specific action, trust the heuristic.
    const aiAction = String(sourceIntent?.action || '').trim().toLowerCase();
    const heuristicAction = String(heuristicIntent?.action || '').trim().toLowerCase();
    const heuristicHasSpecificAction = heuristicAction
        && heuristicAction !== 'list'
        && heuristicAction !== 'unknown'
        && heuristicAction !== 'ai_planned';
    const resolvedAction = (aiAction === 'list' || aiAction === '' || aiAction === 'unknown' || aiAction === 'ai_planned')
        && heuristicHasSpecificAction
        ? heuristicAction
        : (aiAction || activeIntent?.action || 'list');
    const normalizedAction = resolvedAction.trim().toLowerCase();
    const sourceToolchain = Array.isArray(sourceIntent?.execution?.toolchain) ? sourceIntent.execution.toolchain : [];
    const sourceToolParams = sourceToolchain
        .map((step) => (
            step?.input && typeof step.input === 'object'
                ? step.input
                : (step?.params && typeof step.params === 'object' ? step.params : null)
        ))
        .filter(Boolean);
    const sourceUnreadOnly = sourceToolParams.some((params) => params.unread_only === true);
    const sourceStatusOnly = sourceToolParams.some((params) => params.status_only === true);
    const shortFollowup = normalizedUtterance === 'alors'
        || normalizedUtterance === 'et alors'
        || normalizedUtterance === 'du coup'
        || normalizedUtterance === 'quoi de neuf';

    const wantsUnreadOnly = (
        normalizedUtterance.includes('non lu')
        || normalizedUtterance.includes('non lus')
        || normalizedUtterance.includes('nouveau mail')
        || normalizedUtterance.includes('nouveaux mail')
        || normalizedUtterance.includes('nouveau message')
        || normalizedUtterance.includes('nouveaux message')
        || normalizedUtterance.includes('new mail')
        || normalizedUtterance.includes('unread')
    );
    const wantsStatusOnly = (
        normalizedUtterance.includes('ai je')
        || normalizedUtterance.includes('ais je')
        || normalizedUtterance.includes('est ce que j ai')
        || normalizedUtterance.includes('y a t il')
        || normalizedUtterance.includes('il y a')
        || normalizedUtterance.includes('combien')
        || shortFollowup
        || sourceStatusOnly === true
        || (sourceUnreadOnly === true && rawUtterance.includes('?'))
        || (sourceUnreadOnly === true && !String(sourceIntent?.assistant_reply || '').trim())
        || activeEntities.status_only === true
    );
    const sourceEntities = sourceIntent?.entities && typeof sourceIntent.entities === 'object'
        ? cloneValue(sourceIntent.entities)
        : {};
    const queryEntities = buildMailQueryEntities({
        activeEntities,
        sourceEntities,
        sourceToolParams,
        unreadOnly: wantsUnreadOnly,
        statusOnly: wantsStatusOnly
    });
    applyHeuristicOrder(queryEntities, normalizedUtterance);
    applyHeuristicLimit(queryEntities, normalizedUtterance);
    const wantsCurrentMailSummary = (
        normalizedAction.includes('summarize_current')
        || (
            (
                normalizedUtterance.includes('ce mail')
                || normalizedUtterance.includes('ce message')
            )
            && (
                normalizedUtterance.includes('que contient')
                || normalizedUtterance.includes('resume')
                || normalizedUtterance.includes('resumer')
                || normalizedUtterance.includes('summary')
                || normalizedUtterance.includes('summarize')
            )
        )
    );
    const replyDraft = readReplyDraftDetails(utterance);
    // AI planner reformulation takes priority over raw heuristic extraction
    // Check both toolchain params AND entities (entities survive even when toolchain is empty)
    const aiReplyTarget = sourceToolParams.reduce((acc, p) => acc || String(p?.reply_target || '').trim(), '')
        || String(sourceEntities?.reply_target || '').trim();
    const aiDraftText = sourceToolParams.reduce((acc, p) => acc || String(p?.draft_text || '').trim(), '')
        || String(sourceEntities?.draft_text || '').trim();
    const explicitReplyDraftText = String(aiDraftText || replyDraft?.draft_text || '').trim();
    const explicitReplyTarget = String(replyDraft?.reply_target || '').trim() || aiReplyTarget;
    const explicitAutoSend = replyDraft?.draft_text
        ? true
        : sourceToolParams.some((p) => p?.auto_send === true)
        || sourceEntities?.auto_send === true;

    if (
        (explicitReplyDraftText || (explicitReplyTarget && normalizedAction.includes('reply')))
        && (activeIntent?.domain === 'mail' || String(sourceIntent?.domain || '').trim() === 'mail')
    ) {
        const currentMessageId = String(
            sourceIntent?.entities?.current_message_id
            || activeEntities.current_message_id
            || ''
        ).trim();
        return normalizeVoiceIntent({
            ...sourceIntent,
            type: 'connector_tool',
            domain: 'mail',
            action: 'reply_current',
            status: 'pending_connector',
            entities: {
                ...activeEntities,
                ...(sourceIntent?.entities && typeof sourceIntent.entities === 'object' ? cloneValue(sourceIntent.entities) : {}),
                ...(currentMessageId ? { current_message_id: currentMessageId } : {}),
                ...(explicitReplyTarget ? { reply_target: explicitReplyTarget } : {}),
                draft_text: explicitReplyDraftText,
                auto_send: explicitAutoSend
            },
            requested_capabilities: ['mail_reply_draft'],
            execution: {
                target: 'pending_connector',
                confirmation_required: false,
                toolchain: [buildPendingConnectorStep('mail_reply_draft', {
                    ...(currentMessageId ? { current_message_id: currentMessageId } : {}),
                    ...(explicitReplyTarget ? { reply_target: explicitReplyTarget } : {}),
                    draft_text: explicitReplyDraftText,
                    auto_send: explicitAutoSend
                })]
            }
        });
    }

    if (wantsCurrentMailSummary) {
        const currentMessageId = String(
            sourceIntent?.entities?.current_message_id
            || activeEntities.current_message_id
            || ''
        ).trim();
        const summaryEntities = {
            ...queryEntities,
            ...(currentMessageId ? { current_message_id: currentMessageId } : {})
        };
        return normalizeVoiceIntent({
            ...sourceIntent,
            type: 'connector_tool',
            domain: 'mail',
            action: 'summarize_current',
            status: 'pending_connector',
            entities: summaryEntities,
            requested_capabilities: ['mail_read'],
            execution: {
                target: 'pending_connector',
                confirmation_required: false,
                toolchain: [buildPendingConnectorStep('mail_read', buildCurrentMailStepInput(summaryEntities))]
            }
        });
    }

    if (
        normalizedAction.includes('read')
        && (
            activeEntities.current_message_id
            || sourceIntent?.entities?.current_message_id
            || queryEntities.order
        )
    ) {
        const currentMessageId = String(
            sourceIntent?.entities?.current_message_id
            || activeEntities.current_message_id
            || ''
        ).trim();
        const readEntities = {
            ...queryEntities,
            ...(currentMessageId ? { current_message_id: currentMessageId } : {})
        };
        return normalizeVoiceIntent({
            ...sourceIntent,
            type: 'connector_tool',
            domain: 'mail',
            action: 'read_current',
            status: 'pending_connector',
            entities: readEntities,
            requested_capabilities: ['mail_read', 'mail_mark_read'],
            execution: {
                target: 'pending_connector',
                confirmation_required: false,
                toolchain: [
                    buildPendingConnectorStep('mail_read', buildCurrentMailStepInput(readEntities)),
                    buildPendingConnectorStep('mail_mark_read', buildCurrentMailStepInput(readEntities))
                ]
            }
        });
    }

    if (normalizedAction.includes('read') && normalizedAction.includes('next')) {
        return normalizeVoiceIntent({
            ...sourceIntent,
            type: 'connector_tool',
            domain: 'mail',
            action: 'read_next',
            status: 'pending_connector',
            entities: {
                ...queryEntities
            },
            requested_capabilities: ['mail_next_unread'],
            execution: {
                target: 'pending_connector',
                confirmation_required: false,
                toolchain: [buildPendingConnectorStep('mail_next_unread', {
                    context: 'current'
                })]
            }
        });
    }

    if (normalizedAction === 'send' || normalizedAction.includes('send')) {
        return normalizeVoiceIntent({
            ...sourceIntent,
            type: 'connector_tool',
            domain: 'mail',
            action: 'send',
            status: 'pending_connector',
            entities: {
                ...queryEntities
            },
            requested_capabilities: ['mail_send'],
            execution: {
                target: 'pending_connector',
                confirmation_required: false,
                toolchain: [buildPendingConnectorStep('mail_send', {})]
            }
        });
    }

    if (normalizedAction.includes('archive')) {
        const currentMessageId = String(
            sourceIntent?.entities?.current_message_id
            || activeEntities.current_message_id
            || ''
        ).trim();
        return normalizeVoiceIntent({
            ...sourceIntent,
            type: 'connector_tool',
            domain: 'mail',
            action: 'archive_current',
            status: 'pending_connector',
            entities: {
                ...queryEntities,
                ...(currentMessageId ? { current_message_id: currentMessageId } : {})
            },
            requested_capabilities: ['mail_archive'],
            execution: {
                target: 'pending_connector',
                confirmation_required: false,
                toolchain: [buildPendingConnectorStep('mail_archive', buildCurrentMailStepInput({
                    ...queryEntities,
                    ...(currentMessageId ? { current_message_id: currentMessageId } : {})
                }))]
            }
        });
    }

    if (normalizedAction.includes('delete') || normalizedAction.includes('trash')) {
        const currentMessageId = String(
            sourceIntent?.entities?.current_message_id
            || activeEntities.current_message_id
            || ''
        ).trim();
        return normalizeVoiceIntent({
            ...sourceIntent,
            type: 'connector_tool',
            domain: 'mail',
            action: 'delete_current',
            status: 'pending_connector',
            entities: {
                ...queryEntities,
                ...(currentMessageId ? { current_message_id: currentMessageId } : {})
            },
            requested_capabilities: ['mail_delete'],
            execution: {
                target: 'pending_connector',
                confirmation_required: false,
                toolchain: [buildPendingConnectorStep('mail_delete', buildCurrentMailStepInput({
                    ...queryEntities,
                    ...(currentMessageId ? { current_message_id: currentMessageId } : {})
                }))]
            }
        });
    }

    if (normalizedAction.includes('mark_unread') || normalizedAction.includes('unread')) {
        const currentMessageId = String(
            sourceIntent?.entities?.current_message_id
            || activeEntities.current_message_id
            || ''
        ).trim();
        return normalizeVoiceIntent({
            ...sourceIntent,
            type: 'connector_tool',
            domain: 'mail',
            action: 'mark_unread_current',
            status: 'pending_connector',
            entities: {
                ...queryEntities,
                ...(currentMessageId ? { current_message_id: currentMessageId } : {}),
                read: false
            },
            requested_capabilities: ['mail_mark_read'],
            execution: {
                target: 'pending_connector',
                confirmation_required: false,
                toolchain: [buildPendingConnectorStep('mail_mark_read', buildCurrentMailStepInput({
                    ...queryEntities,
                    ...(currentMessageId ? { current_message_id: currentMessageId } : {}),
                    read: false
                }))]
            }
        });
    }

    if (normalizedAction.includes('mark_read')) {
        const currentMessageId = String(
            sourceIntent?.entities?.current_message_id
            || activeEntities.current_message_id
            || ''
        ).trim();
        return normalizeVoiceIntent({
            ...sourceIntent,
            type: 'connector_tool',
            domain: 'mail',
            action: 'mark_read_current',
            status: 'pending_connector',
            entities: {
                ...queryEntities,
                ...(currentMessageId ? { current_message_id: currentMessageId } : {}),
                read: true
            },
            requested_capabilities: ['mail_mark_read'],
            execution: {
                target: 'pending_connector',
                confirmation_required: false,
                toolchain: [buildPendingConnectorStep('mail_mark_read', buildCurrentMailStepInput({
                    ...queryEntities,
                    ...(currentMessageId ? { current_message_id: currentMessageId } : {}),
                    read: true
                }))]
            }
        });
    }

    if (normalizedAction.includes('search')) {
        const queryText = pickMailQueryField(sourceToolParams, 'query', sourceEntities?.query_text || activeEntities?.query_text || null)
            || pickMailQueryField(sourceToolParams, 'query_text', sourceEntities?.query_text || activeEntities?.query_text || null);
        return normalizeVoiceIntent({
            ...sourceIntent,
            type: 'connector_tool',
            domain: 'mail',
            action: 'search',
            status: 'pending_connector',
            entities: {
                ...queryEntities,
                ...(queryText ? { query_text: queryText } : {})
            },
            requested_capabilities: ['mail_search'],
            execution: {
                target: 'pending_connector',
                confirmation_required: false,
                toolchain: [buildPendingConnectorStep('mail_search', {
                    ...buildMailQueryInput(queryEntities),
                    ...(queryText ? { query: queryText } : {})
                })]
            }
        });
    }

    if (normalizedAction.includes('summar')) {
        return normalizeVoiceIntent({
            ...sourceIntent,
            type: 'connector_toolchain',
            domain: 'mail',
            action: 'summarize',
            status: 'pending_connector',
            entities: {
                ...queryEntities,
                status_only: false
            },
            requested_capabilities: ['mail_list', 'mail_summarize'],
            execution: {
                target: 'pending_connector',
                confirmation_required: false,
                toolchain: [
                    buildPendingConnectorStep('mail_list', {
                        ...buildMailQueryInput({
                            ...queryEntities,
                            status_only: false
                        })
                    }),
                    buildPendingConnectorStep('mail_summarize', {
                        ...buildMailQueryInput({
                            ...queryEntities,
                            status_only: false
                        })
                    })
                ]
            }
        });
    }

    return normalizeVoiceIntent({
        ...sourceIntent,
        type: 'connector_tool',
        domain: 'mail',
        action: 'list',
        status: 'pending_connector',
        entities: {
            ...queryEntities
        },
        requested_capabilities: ['mail_list'],
        execution: {
            target: 'pending_connector',
            confirmation_required: false,
            toolchain: [buildPendingConnectorStep('mail_list', buildMailQueryInput(queryEntities))]
        }
    });
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

const collectMailCandidates = (...groups) => {
    const seen = new Set();
    const items = [];
    for (const group of groups) {
        for (const item of Array.isArray(group) ? group : []) {
            const messageId = String(item?.message_id || '').trim();
            if (!messageId || seen.has(messageId)) continue;
            seen.add(messageId);
            items.push(item);
        }
    }
    return items;
};

const normalizeSpeechSubject = (item = {}) => {
    const subject = String(item?.subject || '').trim();
    if (
        subject
        && !/^[\s?._\uFFFD-]+$/.test(subject)
        && !/^=\?[^?]+\?[bqBQ]\?/.test(subject)
    ) {
        return subject;
    }
    const preview = String(item?.preview || '').trim();
    if (preview) return preview.length > 80 ? `${preview.slice(0, 79).trim()}…` : preview;
    const sender = String(item?.from?.name || item?.from?.address || '').trim();
    return sender || 'sans objet';
};

const pickMailItemByOrder = (items = [], order = 'newest') => {
    const normalizedOrder = String(order || 'newest').trim().toLowerCase();
    const candidates = (Array.isArray(items) ? items : [])
        .filter((entry) => entry && typeof entry === 'object');
    if (!candidates.length) return null;
    const sorted = candidates.slice().sort((left, right) => {
        const leftTs = Number(left?.received_at) || 0;
        const rightTs = Number(right?.received_at) || 0;
        if (leftTs !== rightTs) {
            return normalizedOrder === 'oldest' ? leftTs - rightTs : rightTs - leftTs;
        }
        return normalizedOrder === 'oldest'
            ? String(left?.message_id || '').localeCompare(String(right?.message_id || ''))
            : String(right?.message_id || '').localeCompare(String(left?.message_id || ''));
    });
    return sorted[0] || null;
};

const buildSingleMailSummary = (item = {}, locale = 'fr-FR') => {
    const english = String(locale || '').toLowerCase().startsWith('en');
    const sender = String(item?.from?.name || item?.from?.address || 'expediteur inconnu').trim();
    const subject = normalizeSpeechSubject(item);
    const body = truncateForAi(item?.body_text || item?.preview || '', 260);
    if (english) {
        return body
            ? `This mail from ${sender}, subject "${subject}", says: ${body}`
            : `This mail from ${sender} is about "${subject}".`;
    }
    return body
        ? `Ce mail de ${sender}, sujet "${subject}", dit en substance : ${body}`
        : `Ce mail de ${sender} concerne "${subject}".`;
};

const findMailByReplyTarget = (items = [], replyTarget = '') => {
    const normalizedTarget = normalizeComparableText(replyTarget);
    if (!normalizedTarget) return null;
    return items.find((item) => {
        const senderName = normalizeComparableText(item?.from?.name);
        const senderAddress = normalizeComparableText(item?.from?.address);
        return (
            (senderName && (senderName.includes(normalizedTarget) || normalizedTarget.includes(senderName)))
            || (senderAddress && senderAddress.includes(normalizedTarget))
        );
    }) || null;
};

const readMailFilterValue = (intent = {}, toolchain = [], fieldName) => {
    const entityValue = intent?.entities?.[fieldName];
    if (typeof entityValue === 'number' && Number.isFinite(entityValue)) return entityValue;
    if (typeof entityValue === 'string' && entityValue.trim()) return entityValue.trim();
    if (Array.isArray(entityValue) && entityValue.some((entry) => String(entry || '').trim())) {
        return entityValue.map((entry) => String(entry || '').trim()).filter(Boolean);
    }
    for (const step of Array.isArray(toolchain) ? toolchain : []) {
        const value = step?.input?.[fieldName] ?? step?.params?.[fieldName];
        if (typeof value === 'number' && Number.isFinite(value)) return value;
        if (typeof value === 'string' && value.trim()) return value.trim();
        if (Array.isArray(value) && value.some((entry) => String(entry || '').trim())) {
            return value.map((entry) => String(entry || '').trim()).filter(Boolean);
        }
    }
    const activeEntityValue = intent?.context?.active_intent?.entities?.[fieldName];
    if (typeof activeEntityValue === 'number' && Number.isFinite(activeEntityValue)) return activeEntityValue;
    if (typeof activeEntityValue === 'string' && activeEntityValue.trim()) return activeEntityValue.trim();
    if (Array.isArray(activeEntityValue) && activeEntityValue.some((entry) => String(entry || '').trim())) {
        return activeEntityValue.map((entry) => String(entry || '').trim()).filter(Boolean);
    }
    return null;
};

const describeMailSenderScope = ({
    locale = 'fr-FR',
    from = null,
    notFrom = null
} = {}) => {
    const english = String(locale || '').toLowerCase().startsWith('en');
    const toLabel = (value) => Array.isArray(value) ? value.join(', ') : String(value || '').trim();
    const includeLabel = toLabel(from);
    const excludeLabel = toLabel(notFrom);
    if (includeLabel) {
        return english ? ` from ${includeLabel}` : ` de ${includeLabel}`;
    }
    if (excludeLabel) {
        return english ? ` from people other than ${excludeLabel}` : ` d'autres personnes que ${excludeLabel}`;
    }
    return '';
};

const buildMailReplyAcknowledgement = ({
    draft = null,
    sourceItem = null,
    locale = 'fr-FR'
} = {}) => {
    const english = String(locale || '').toLowerCase().startsWith('en');
    const recipient = String(
        sourceItem?.from?.name
        || sourceItem?.from?.address
        || draft?.to?.[0]?.name
        || draft?.to?.[0]?.address
        || ''
    ).trim();
    const bodyText = String(draft?.body_text || '').trim();
    if (english) {
        return recipient
            ? `I prepared a reply to ${recipient}: "${bodyText}". Say "send the mail" to send it.`
            : `I prepared the reply draft: "${bodyText}". Say "send the mail" to send it.`;
    }
    return recipient
        ? `J'ai prepare une reponse a ${recipient}: "${bodyText}". Dis "envoie le mail" pour l'envoyer.`
        : `J'ai prepare le brouillon de reponse: "${bodyText}". Dis "envoie le mail" pour l'envoyer.`;
};

const buildMailSendAcknowledgement = ({
    locale = 'fr-FR',
    queued = false,
    recipient = ''
} = {}) => {
    const english = String(locale || '').toLowerCase().startsWith('en');
    if (english) {
        if (queued) {
            return recipient
                ? `The mail for ${recipient} is queued locally.`
                : 'The mail is queued locally.';
        }
        return recipient
            ? `The mail has been sent to ${recipient}.`
            : 'The mail has been sent.';
    }
    if (queued) {
        return recipient
            ? `Le mail pour ${recipient} est en file d'attente locale.`
            : "Le mail est en file d'attente locale.";
    }
    return recipient
        ? `Le mail a ete envoye a ${recipient}.`
        : 'Le mail a ete envoye.';
};

const buildMailSummaryPrompt = ({
    items = [],
    stats = {},
    locale = 'fr-FR'
} = {}) => {
    const english = String(locale || '').toLowerCase().startsWith('en');
    const payload = items.slice(0, 5).map((item, index) => ({
        rank: index + 1,
        subject: String(item?.subject || '').trim() || '(sans objet)',
        from: String(item?.from?.name || item?.from?.address || '').trim() || '(expediteur inconnu)',
        unread: item?.unread === true,
        received_at: item?.received_at || null,
        preview: truncateForAi(item?.preview || item?.body_text || '', 800),
        body_text: truncateForAi(item?.body_text || '', 1600)
    }));

    const instructions = english
        ? [
            'You are eVe, summarizing recent emails for a voice reply.',
            'Use the provided emails only.',
            'Respond in concise natural English for speech.',
            'Mention the important senders, topics, and any clear action items.',
            'If there are no unread emails but there are recent emails, summarize the latest recent emails anyway.',
            'Do not say "message(s) out of". Do not produce raw counts only.'
        ]
        : [
            'Tu es eVe, tu resumes des emails recents pour une reponse vocale.',
            'Utilise uniquement les emails fournis.',
            'Reponds en francais naturel, concis, adapte a l oral.',
            'Mentionne les expediteurs importants, les sujets, et les actions evidentes si elles existent.',
            "S'il n'y a aucun mail non lu mais qu'il y a des mails recents, resume quand meme les derniers mails.",
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
            const text = await requestProviderCompletion({
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
            const normalized = String(text || '').trim();
            if (!normalized) {
                return { ok: false, error: 'provider_empty_response' };
            }
            return {
                ok: true,
                text: normalized
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
        const contacts = await resolveContactsApi(this.env);
        const calendar = await resolveCalendarApi(this.env);
        this.toolRouter = createToolRouter({
            connectors: { mail, contacts, calendar },
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
        const aiFirst = options.use_ai !== false && !!this.aiPlanner;
        const heuristicIntent = this.classifyIntent(utterance, {
            intent_id: options.intent_id,
            locale: options.locale,
            source: options.source,
            context: planningContext,
            runtime_tools: runtimeTools,
            allow_business_heuristics: aiFirst !== true
        });
        const normalizedHeuristic = normalizeVoiceIntent(heuristicIntent);
        const normalizedFallback = aiFirst === true
            ? normalizeVoiceIntent(this.classifyIntent(utterance, {
                intent_id: options.intent_id,
                locale: options.locale,
                source: options.source,
                context: planningContext,
                runtime_tools: runtimeTools,
                allow_business_heuristics: true
            }))
            : normalizedHeuristic;
        const normalizedIntent = await this.#resolvePlanningIntent(utterance, {
            ...options,
            locale: options.locale,
            context: planningContext,
            runtime_tools: runtimeTools,
            heuristic_intent: normalizedHeuristic,
            fallback_intent: normalizedFallback
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
        const confirmationRequestedByUser = wantsExplicitConfirmation(normalizedIntent);
        if (normalizedIntent.execution?.confirmation_required === true && confirmationRequestedByUser !== true) {
            normalizedIntent.execution.confirmation_required = false;
        }
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
        if (normalizedIntent.execution.confirmation_required === true && options.confirmed !== true) {
            const response = {
                ok: true,
                executed: false,
                transport: normalizedIntent.execution.target,
                intent: normalizedIntent,
                reason: 'confirmation_required',
                confirmation_required: true,
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
            const fallbackReply = replyText || buildStructuredReplyFromPayload(result, normalizedIntent, options);
            const response = {
                ok: result?.ok !== false,
                executed: true,
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
        const fallbackReply = replyText || buildStructuredReplyFromPayload(result, normalizedIntent, options);
        const response = {
            ok: result?.ok !== false,
            executed: true,
            transport: this.bridge.kind,
            intent: normalizedIntent,
            result,
            ...(fallbackReply ? { reply_text: fallbackReply, spoken_reply: fallbackReply } : {})
        };
        this.#pushJournal('voice.intent.executed', response);
        return response;
    }

    async executeUtterance(utterance, options = {}) {
        const intent = await this.planUtterance(utterance, options);
        return this.executeIntent(intent, options);
    }

    #buildPlanningContext(sessionId, providedContext = {}) {
        const context = providedContext && typeof providedContext === 'object'
            ? cloneValue(providedContext)
            : {};
        const key = String(sessionId || '').trim();
        if (!key || !this.sessionRuntime) return context;
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
        return context;
    }

    async #resolvePlanningIntent(utterance, options = {}) {
        const heuristicIntent = normalizeVoiceIntent(options.heuristic_intent);
        const fallbackIntent = normalizeVoiceIntent(options.fallback_intent || heuristicIntent);
        const activeIntent = options?.context?.active_intent && typeof options.context.active_intent === 'object'
            ? normalizeVoiceIntent(options.context.active_intent)
            : null;
        if (
            heuristicIntent.type === 'local_command'
            || options.use_ai === false
            || !this.aiPlanner
        ) {
            return fallbackIntent;
        }

        const fallbackExecutable = fallbackIntent?.status !== 'ambiguous'
            && fallbackIntent?.status !== 'failed'
            && (
                fallbackIntent?.execution?.target !== 'none'
                || String(fallbackIntent?.assistant_reply || '').trim().length > 0
            );

        const plannedIntent = normalizeVoiceIntent(await this.aiPlanner.planUtterance(utterance, {
            intent_id: options.intent_id,
            locale: options.locale,
            source: options.source,
            context: options.context,
            runtime_tools: options.runtime_tools,
            heuristic_intent: heuristicIntent,
            ...(options.signal ? { signal: options.signal } : {})
        }));

        const plannedTarget = String(plannedIntent?.execution?.target || 'none').trim();
        const plannedToolchain = ensureToolchain(plannedIntent);
        const plannedReply = String(plannedIntent?.assistant_reply || '').trim();
        const plannedBusinessDomain = BUSINESS_CONNECTOR_DOMAINS.has(String(plannedIntent?.domain || '').trim());
        const plannerProducedToolIntent = plannedIntent?.status === 'ready'
            && plannedTarget !== 'none'
            && plannedToolchain.length > 0;
        const plannerProducedFreeReply = plannedIntent?.status === 'ready'
            && plannedTarget === 'none'
            && plannedReply.length > 0;
        const plannerProducedBusinessPlaceholder = plannedBusinessDomain
            && plannerProducedFreeReply
            && isProgressPlaceholderReply(plannedReply);
        const businessConnectorFallback = fallbackExecutable
            && BUSINESS_CONNECTOR_DOMAINS.has(String(fallbackIntent?.domain || '').trim());

        if (plannedBusinessDomain && String(plannedIntent?.domain || '').trim() === 'mail') {
            return buildMaterializedMailIntent(plannedIntent, utterance, options.context || {}, fallbackIntent);
        }

        // For business connectors, keep the LLM as the interpreter but execute through the
        // deterministic connector route when one is available. If the planner did not produce
        // a business-domain interpretation, keep the heuristic fallback.
        if (businessConnectorFallback) {
            return fallbackIntent;
        }

        if (plannerProducedToolIntent) {
            return plannedIntent;
        }

        // If the planner only produced a conversational placeholder while a concrete
        // local/business route exists, prefer the executable fallback.
        if (fallbackExecutable) {
            return fallbackIntent;
        }

        if (
            plannerProducedFreeReply
            && plannerProducedBusinessPlaceholder !== true
            && !(activeIntent?.domain && BUSINESS_CONNECTOR_DOMAINS.has(String(activeIntent.domain).trim()) && isProgressPlaceholderReply(plannedReply))
        ) {
            return plannedIntent;
        }

        if (
            plannerProducedFreeReply
            && isProgressPlaceholderReply(plannedReply)
            && String(activeIntent?.domain || '').trim() === 'mail'
        ) {
            return buildMaterializedMailIntent(activeIntent, utterance, options.context || {}, fallbackIntent);
        }

        return plannedIntent;
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
            ...((intent.assistant_reply || fallbackReply)
                ? {
                    reply_text: intent.assistant_reply || fallbackReply,
                    spoken_reply: intent.assistant_reply || fallbackReply
                }
                : {})
        };
    }

    async #executePendingConnector(intent, toolchain, options = {}) {
        // --- Unified tool router fast path ---
        if (this.toolRouter) {
            try {
                const structuredRequest = intentToStructuredRequest(intent, {
                    toolchain,
                    locale: intent?.locale || options?.locale
                });
                if (structuredRequest && structuredRequest.domain) {
                    this.#pushJournal('voice.tool_router.dispatch', {
                        domain: structuredRequest.domain,
                        operation: structuredRequest.operation,
                        hasFilters: !!(structuredRequest.filters && Object.keys(structuredRequest.filters).length)
                    });
                    const result = await this.toolRouter.execute(structuredRequest);
                    this.#pushJournal('voice.tool_router.result', {
                        domain: structuredRequest.domain,
                        ok: result?.ok,
                        error: result?.error || null,
                        itemCount: Array.isArray(result?.items) ? result.items.length : (result?.item ? 1 : 0),
                        hasReply: !!result?.reply_text
                    });
                    if (result && result.ok !== undefined) {
                        const replyText = result.reply_text || '';
                        this.#bindSessionIntent(options.session_id, intent, {
                            phase: 'executed',
                            via: 'tool_router'
                        });
                        return {
                            ok: result.ok,
                            executed: result.ok,
                            transport: `${result.domain || intent?.domain}_api`,
                            intent,
                            ...(result.error ? { error: result.error } : {}),
                            ...(result.items ? { result: { items: result.items, stats: result.stats } } : {}),
                            ...(result.item ? { result: { item: result.item } } : {}),
                            ...(replyText ? { reply_text: replyText, spoken_reply: replyText } : {})
                        };
                    }
                }
            } catch (routerErr) {
                // Tool router failed — fall through to legacy path.
                this.#pushJournal('voice.tool_router.error', {
                    domain: intent?.domain,
                    error: String(routerErr?.message || routerErr || '')
                });
            }
        }

        if (intent?.domain === 'contacts') {
            const contactsAction = String(intent?.action || '').trim().toLowerCase();
            if (
                contactsAction
                && !contactsAction.includes('list')
                && !contactsAction.includes('search')
                && !contactsAction.includes('read')
            ) {
                return null;
            }
            const contacts = await resolveContactsApi(this.env);
            if (!contacts) return null;
            try {
                if (typeof contacts.syncPull === 'function') {
                    await contacts.syncPull({
                        limit: 100
                    });
                }
            } catch (_) {
                // Keep the local contacts index path alive.
            }
            const locale = String(intent?.locale || options?.locale || 'fr-FR').toLowerCase();
            const english = locale.startsWith('en');
            const toolParams = toolchain
                .map((step) => (
                    step?.input && typeof step.input === 'object'
                        ? step.input
                        : (step?.params && typeof step.params === 'object' ? step.params : null)
                ))
                .filter(Boolean);
            const queryText = String(
                intent?.entities?.query
                || intent?.entities?.query_text
                || pickToolParamField(toolParams, 'query', '')
                || ''
            ).trim();
            const limit = Number.isFinite(Number(
                intent?.entities?.limit ?? pickToolParamField(toolParams, 'limit', null)
            ))
                ? Math.max(1, Number(intent?.entities?.limit ?? pickToolParamField(toolParams, 'limit', null)))
                : 10;
            const currentContactId = String(
                intent?.entities?.current_contact_id
                || intent?.context?.active_intent?.entities?.current_contact_id
                || pickToolParamField(toolParams, 'contact_id', '')
                || ''
            ).trim();
            const buildResponse = (payload = {}) => ({
                ok: payload.ok !== false,
                executed: payload.executed !== false,
                transport: 'contacts_api',
                intent,
                ...(payload.error ? { error: payload.error } : {}),
                ...(payload.result ? { result: payload.result } : {}),
                ...(payload.reply_text ? { reply_text: payload.reply_text, spoken_reply: payload.reply_text } : {})
            });
            const makeListReply = (items = []) => {
                const labels = items.map((entry) => formatContactLabel(entry)).filter(Boolean).slice(0, 3);
                if (!items.length) {
                    return english ? 'I do not see any matching contact right now.' : "Je ne vois pas de contact correspondant pour le moment.";
                }
                if (!labels.length) {
                    return english ? `I found ${items.length} contact(s).` : `J'ai trouve ${items.length} contact(s).`;
                }
                return english
                    ? `I found ${items.length} contact(s): ${labels.join(', ')}.`
                    : `J'ai trouve ${items.length} contact(s): ${labels.join(', ')}.`;
            };

            if (intent?.action === 'read_contact' || intent?.action === 'read_current' || currentContactId) {
                if (!currentContactId || typeof contacts.read !== 'function') {
                    return buildResponse({
                        ok: false,
                        executed: false,
                        error: 'contacts_not_found',
                        reply_text: english ? 'I do not know which contact to read right now.' : "Je ne sais pas quel contact lire pour le moment."
                    });
                }
                const read = await contacts.read(currentContactId);
                if (read?.ok === true && read.contact) {
                    const label = formatContactLabel(read.contact);
                    this.#bindSessionIntent(options.session_id, {
                        ...intent,
                        domain: 'contacts',
                        action: 'read_contact',
                        entities: {
                            ...(intent?.entities && typeof intent.entities === 'object' ? cloneValue(intent.entities) : {}),
                            current_contact_id: read.contact.source_contact_id || read.contact.id || currentContactId
                        }
                    }, {
                        phase: 'executed',
                        contact_id: read.contact.source_contact_id || read.contact.id || currentContactId
                    });
                    return buildResponse({
                        result: read,
                        reply_text: label
                            ? (english ? `Contact: ${label}.` : `Contact: ${label}.`)
                            : makeListReply([read.contact])
                    });
                }
            }

            const result = queryText && typeof contacts.search === 'function'
                ? await contacts.search(queryText, { limit })
                : (typeof contacts.list === 'function' ? await contacts.list({ limit }) : { ok: false, items: [] });
            const items = Array.isArray(result?.items) ? result.items : [];
            const currentItem = items[0] || null;
            this.#bindSessionIntent(options.session_id, {
                ...intent,
                domain: 'contacts',
                action: queryText ? 'search_contacts' : 'list_contacts',
                entities: {
                    ...(intent?.entities && typeof intent.entities === 'object' ? cloneValue(intent.entities) : {}),
                    ...(queryText ? { query: queryText } : {}),
                    current_contact_id: currentItem?.source_contact_id || currentItem?.id || null
                }
            }, {
                phase: 'executed',
                contact_id: currentItem?.source_contact_id || currentItem?.id || null
            });
            return buildResponse({
                result,
                reply_text: makeListReply(items)
            });
        }

        if (intent?.domain === 'calendar') {
            const calendarAction = String(intent?.action || '').trim().toLowerCase();
            if (
                calendarAction
                && !calendarAction.includes('list')
                && !calendarAction.includes('search')
                && !calendarAction.includes('read')
            ) {
                return null;
            }
            const calendar = await resolveCalendarApi(this.env);
            if (!calendar) return null;
            try {
                if (typeof calendar.syncPull === 'function') {
                    await calendar.syncPull({});
                }
            } catch (_) {
                // Keep the registered source path alive.
            }
            const locale = String(intent?.locale || options?.locale || 'fr-FR').toLowerCase();
            const english = locale.startsWith('en');
            const toolParams = toolchain
                .map((step) => (
                    step?.input && typeof step.input === 'object'
                        ? step.input
                        : (step?.params && typeof step.params === 'object' ? step.params : null)
                ))
                .filter(Boolean);
            const queryText = String(
                intent?.entities?.query
                || intent?.entities?.query_text
                || pickToolParamField(toolParams, 'query', '')
                || ''
            ).trim();
            const temporalRef = String(
                intent?.entities?.temporal_ref
                || pickToolParamField(toolParams, 'temporal_ref', '')
                || ''
            ).trim();
            const limit = Number.isFinite(Number(
                intent?.entities?.limit ?? pickToolParamField(toolParams, 'limit', null)
            ))
                ? Math.max(1, Number(intent?.entities?.limit ?? pickToolParamField(toolParams, 'limit', null)))
                : 10;
            const currentEventId = String(
                intent?.entities?.current_event_id
                || intent?.context?.active_intent?.entities?.current_event_id
                || pickToolParamField(toolParams, 'event_id', '')
                || ''
            ).trim();
            const buildResponse = (payload = {}) => ({
                ok: payload.ok !== false,
                executed: payload.executed !== false,
                transport: 'calendar_api',
                intent,
                ...(payload.error ? { error: payload.error } : {}),
                ...(payload.result ? { result: payload.result } : {}),
                ...(payload.reply_text ? { reply_text: payload.reply_text, spoken_reply: payload.reply_text } : {})
            });
            const makeListReply = (items = []) => {
                const labels = items.map((entry) => formatCalendarItemLabel(entry)).filter(Boolean).slice(0, 3);
                if (!items.length) {
                    return english ? 'I do not see any calendar event right now.' : "Je ne vois pas de rendez-vous pour le moment.";
                }
                if (!labels.length) {
                    return english ? `You have ${items.length} calendar event(s).` : `Tu as ${items.length} rendez-vous.`;
                }
                return english
                    ? `You have ${items.length} calendar event(s): ${labels.join(', ')}.`
                    : `Tu as ${items.length} rendez-vous: ${labels.join(', ')}.`;
            };
            const range = buildTemporalRange(temporalRef, new Date());

            if ((intent?.action === 'read_event' || intent?.action === 'read_current') && currentEventId && typeof calendar.read === 'function') {
                const read = await calendar.read(currentEventId, {});
                if (read?.ok === true && read.event) {
                    this.#bindSessionIntent(options.session_id, {
                        ...intent,
                        domain: 'calendar',
                        action: 'read_event',
                        entities: {
                            ...(intent?.entities && typeof intent.entities === 'object' ? cloneValue(intent.entities) : {}),
                            current_event_id: read.event.id || currentEventId
                        }
                    }, {
                        phase: 'executed',
                        event_id: read.event.id || currentEventId
                    });
                    return buildResponse({
                        result: read,
                        reply_text: formatCalendarItemLabel(read.event)
                            ? (english ? `Calendar event: ${formatCalendarItemLabel(read.event)}.` : `Rendez-vous : ${formatCalendarItemLabel(read.event)}.`)
                            : makeListReply([read.event])
                    });
                }
            }

            let result = null;
            if (queryText && typeof calendar.search === 'function') {
                result = await calendar.search(queryText, {
                    ...(range.start ? { start: range.start } : {}),
                    ...(range.end ? { end: range.end } : {}),
                    limit
                });
            } else if (temporalRef === 'today' && typeof calendar.today === 'function') {
                result = await calendar.today({ limit });
            } else if ((range.start || range.end) && typeof calendar.search === 'function') {
                result = await calendar.search('', {
                    ...(range.start ? { start: range.start } : {}),
                    ...(range.end ? { end: range.end } : {}),
                    limit
                });
            } else if (typeof calendar.next === 'function') {
                result = await calendar.next({ limit });
            }

            const items = Array.isArray(result?.items)
                ? result.items
                : (result?.event ? [result.event] : []);
            const currentItem = items[0] || null;
            this.#bindSessionIntent(options.session_id, {
                ...intent,
                domain: 'calendar',
                action: queryText ? 'search_events' : 'list_events',
                entities: {
                    ...(intent?.entities && typeof intent.entities === 'object' ? cloneValue(intent.entities) : {}),
                    ...(queryText ? { query: queryText } : {}),
                    ...(temporalRef ? { temporal_ref: temporalRef } : {}),
                    current_event_id: currentItem?.id || null
                }
            }, {
                phase: 'executed',
                event_id: currentItem?.id || null
            });
            return buildResponse({
                result,
                reply_text: makeListReply(items)
            });
        }

        if (intent?.domain !== 'mail') return null;
        const mail = await resolveMailApi(this.env);
        if (!mail) return null;
        let readyResult = null;

        try {
            if (typeof mail.ensureReady === 'function') {
                readyResult = await mail.ensureReady({
                    initial: false,
                    limit: 20
                });
            }
        } catch (ensureReadyError) {
            // Capture the real error so downstream logic can surface it.
            const errMsg = String(ensureReadyError?.message || ensureReadyError || 'ensureReady_threw').trim();
            readyResult = { ok: false, error: errMsg };
            this.#pushJournal('voice.mail.ensureReady_error', {
                error: errMsg,
                action: intent?.action || null
            });
        }

        let connectorStatus = null;
        try {
            connectorStatus = typeof mail.connectorStatus === 'function' ? mail.connectorStatus() : null;
            if (connectorStatus?.configured && typeof mail.syncPull === 'function') {
                const syncTimeoutMs = Number.isFinite(Number(
                    this.env?.__SQUIRREL_VOICE_MAIL_SYNC_TIMEOUT_MS
                    || this.env?.window?.__SQUIRREL_VOICE_MAIL_SYNC_TIMEOUT_MS
                ))
                    ? Math.max(0, Number(
                        this.env?.__SQUIRREL_VOICE_MAIL_SYNC_TIMEOUT_MS
                        || this.env?.window?.__SQUIRREL_VOICE_MAIL_SYNC_TIMEOUT_MS
                    ))
                    : 2500;
                const syncResult = await withSoftTimeout(
                    () => mail.syncPull({ initial: false }),
                    {
                        timeoutMs: syncTimeoutMs,
                        fallbackValue: {
                            ok: false,
                            error: 'mail_sync_pull_timeout'
                        }
                    }
                );
                if (syncResult?.error === 'mail_sync_pull_timeout') {
                    this.#pushJournal('voice.intent.connector_timeout', {
                        domain: 'mail',
                        action: intent?.action || null,
                        timeout_ms: syncTimeoutMs
                    });
                }
            }
        } catch (syncErr) {
            // Log sync refresh failures but keep the local index fallback.
            this.#pushJournal('voice.mail.sync_refresh_error', {
                error: String(syncErr?.message || syncErr || ''),
                action: intent?.action || null
            });
        }

        const capabilities = toolchain
            .map((step) => String(step?.capability || '').trim())
            .filter(Boolean);

        const locale = String(intent?.locale || options?.locale || 'fr-FR').toLowerCase();
        const english = locale.startsWith('en');
        const buildResponse = (payload = {}) => ({
            ok: payload.ok !== false,
            executed: payload.executed !== false,
            transport: 'mail_api',
            intent,
            ...(payload.error ? { error: payload.error } : {}),
            ...(payload.result ? { result: payload.result } : {}),
            ...(payload.reply_text ? { reply_text: payload.reply_text, spoken_reply: payload.reply_text } : {})
        });
        const mailUtterance = normalizePlannerText(
            intent?.utterance?.raw
            || intent?.utterance?.normalized
            || ''
        );
        const inferredUnreadOnly = (
            mailUtterance.includes('non lu')
            || mailUtterance.includes('non lus')
            || mailUtterance.includes('nouveau mail')
            || mailUtterance.includes('nouveaux mail')
            || mailUtterance.includes('nouveau message')
            || mailUtterance.includes('nouveaux message')
            || mailUtterance.includes('new mail')
            || mailUtterance.includes('unread')
        );
        const inferredStatusOnly = (
            mailUtterance.includes('ai je')
            || mailUtterance.includes('ais je')
            || mailUtterance.includes("j ai")
            || mailUtterance.includes('est ce que j ai')
            || mailUtterance.includes('y a t il')
            || mailUtterance.includes('il y a')
            || mailUtterance.includes('combien')
        );
        const unreadOnly = intent?.entities?.unread_only === true
            || toolchain.some((step) => step?.input?.unread_only === true || step?.params?.unread_only === true);
        const statusOnly = intent?.entities?.status_only === true
            || toolchain.some((step) => step?.input?.status_only === true || step?.params?.status_only === true);
        // Only mark as unread if the user's utterance explicitly mentions it:
        // do not rely solely on LLM/entity flags which may over-trigger.
        const resolvedUnreadOnly = inferredUnreadOnly;
        const resolvedStatusOnly = statusOnly || (inferredUnreadOnly && inferredStatusOnly);
        const fromFilter = readMailFilterValue(intent, toolchain, 'from');
        const notFromFilter = readMailFilterValue(intent, toolchain, 'not_from');
        const mailboxFilter = readMailFilterValue(intent, toolchain, 'mailbox');
        const threadIdFilter = readMailFilterValue(intent, toolchain, 'thread_id');
        const limitFilter = readMailFilterValue(intent, toolchain, 'limit');
        const orderFilter = String(readMailFilterValue(intent, toolchain, 'order') || '').trim().toLowerCase() || null;
        const resolvedLimit = Number.isFinite(Number(limitFilter)) ? Math.max(1, Number(limitFilter)) : 5;
        const baseListOptions = {
            limit: resolvedLimit,
            ...(mailboxFilter ? { mailbox: mailboxFilter } : {}),
            ...(threadIdFilter ? { thread_id: threadIdFilter } : {}),
            ...(fromFilter ? { from: fromFilter } : {}),
            ...(notFromFilter ? { not_from: notFromFilter } : {}),
            ...(orderFilter ? { order: orderFilter } : {})
        };

        const topList = typeof mail.list === 'function'
            ? mail.list(baseListOptions)
            : { ok: false, items: [] };
        const unreadList = typeof mail.list === 'function'
            ? mail.list({
                ...baseListOptions,
                unread_only: true
            })
            : { ok: false, items: [] };
        const hasIndexedMail = Array.isArray(topList?.items) && topList.items.length > 0;
        if (!connectorStatus?.configured && !hasIndexedMail) {
            const readyError = String(readyResult?.error || '').trim();
            const readyMessage = String(readyResult?.message || '').trim();
            if (
                readyError === 'mail_credentials_missing'
                || readyError === 'icloud_mail_live_smoke_missing_credentials'
                || readyError === 'icloud_mail_credentials_missing'
            ) {
                const missingFields = readyMessage.startsWith('Missing mail settings:')
                    ? readyMessage.slice('Missing mail settings:'.length)
                        .split(',')
                        .map((entry) => String(entry || '').trim())
                        .filter(Boolean)
                    : [];
                const frFieldLabels = {
                    email: 'email',
                    password: 'mot de passe mail',
                    imap_host: 'hote IMAP',
                    smtp_host: 'hote SMTP'
                };
                const enFieldLabels = {
                    email: 'email',
                    password: 'mail password',
                    imap_host: 'IMAP host',
                    smtp_host: 'SMTP host'
                };
                const labels = english ? enFieldLabels : frFieldLabels;
                const suffix = missingFields.length > 0
                    ? (english
                        ? ` Missing: ${missingFields.map((field) => labels[field] || field).join(', ')}.`
                        : ` Champs manquants : ${missingFields.map((field) => labels[field] || field).join(', ')}.`)
                    : '';
                return buildResponse({
                    ok: false,
                    executed: false,
                    error: readyError,
                    reply_text: english
                        ? `I do not see any mail credentials configured in your settings yet.${suffix}`
                        : `Je ne trouve pas encore toute la configuration mail dans tes reglages.${suffix}`
                });
            }
            const surfacedError = readyError && readyError !== 'mail_connector_missing' && readyError !== 'mail_remote_sync_unavailable'
                ? readyError
                : 'mail_connector_unavailable';
            this.#pushJournal('voice.mail.connector_unavailable', {
                readyError,
                surfacedError,
                connectorConfigured: connectorStatus?.configured ?? null,
                hasIndexedMail,
                action: intent?.action || null
            });
            const syncFailReply = readyError === 'mail_remote_sync_failed'
                || readyError === 'mail_sync_failed'
                || readyError === 'ensureReady_threw';
            const replyText = syncFailReply
                ? (english
                    ? 'Mail sync failed. Please check your connection and credentials.'
                    : 'La synchronisation mail a echoue. Verifie ta connexion et tes identifiants.')
                : (english
                    ? 'I do not have access to your mail here yet.'
                    : "Je n'ai pas encore acces a tes mails ici.");
            return buildResponse({
                ok: false,
                executed: false,
                error: surfacedError,
                reply_text: replyText
            });
        }
        const currentMessageId = String(
            intent?.entities?.current_message_id
            || intent?.context?.active_intent?.entities?.current_message_id
            || ''
        ).trim();
        const currentItem = currentMessageId && typeof mail.read === 'function'
            ? mail.read(currentMessageId)?.item || null
            : null;
        const nextUnread = typeof mail.nextUnread === 'function'
            ? mail.nextUnread({
                ...(mailboxFilter ? { mailbox: mailboxFilter } : {}),
                ...(orderFilter ? { order: orderFilter } : {})
            })
            : { ok: false, error: 'mail_next_unread_not_found' };
        const scopedList = resolvedUnreadOnly ? unreadList : topList;
        const scopedItems = Array.isArray(scopedList?.items) ? scopedList.items : [];
        const orderedScopedItem = orderFilter ? pickMailItemByOrder(scopedItems, orderFilter) : null;
        const selectedCurrentItem = orderedScopedItem || currentItem || scopedItems[0] || (nextUnread?.ok === true ? nextUnread.item : null) || null;

        if (intent.action === 'summarize_current') {
            const summaryItem = selectedCurrentItem;
            if (!summaryItem?.message_id) {
                return buildResponse({
                    ok: false,
                    executed: false,
                    error: 'mail_not_found',
                    reply_text: english
                        ? 'I do not see which mail to summarize right now.'
                        : "Je ne vois pas quel mail resumer pour le moment."
                });
            }
            let replyText = buildSingleMailSummary(summaryItem, locale);
            if (typeof this.mailAiSummarizer === 'function') {
                const aiSummary = await this.mailAiSummarizer({
                    items: [summaryItem],
                    stats: {
                        total: 1,
                        unread: summaryItem.unread === true ? 1 : 0
                    },
                    locale
                });
                if (aiSummary?.ok === true && String(aiSummary.text || '').trim()) {
                    replyText = String(aiSummary.text || '').trim();
                }
            }
            this.#bindSessionIntent(options.session_id, {
                ...intent,
                domain: 'mail',
                action: 'summarize_current',
                entities: {
                    ...(intent?.entities && typeof intent.entities === 'object' ? cloneValue(intent.entities) : {}),
                    current_message_id: summaryItem.message_id,
                    current_mailbox: summaryItem.mailbox || null,
                    ...(orderFilter ? { order: orderFilter } : {}),
                    ...(fromFilter ? { from: cloneValue(fromFilter) } : {}),
                    ...(notFromFilter ? { not_from: cloneValue(notFromFilter) } : {})
                }
            }, {
                phase: 'executed',
                message_id: summaryItem.message_id
            });
            return buildResponse({
                result: {
                    item: summaryItem,
                    summary: replyText
                },
                reply_text: replyText
            });
        }

        if (capabilities.includes('mail_read') && (intent.action === 'read_current' || currentMessageId)) {
            const selectedId = String(selectedCurrentItem?.message_id || currentMessageId || nextUnread?.item?.message_id || '').trim();
            const item = selectedId && typeof mail.read === 'function' ? mail.read(selectedId) : { ok: false, error: 'mail_not_found' };
            if (item?.ok === true && item.item?.message_id && typeof mail.buildReadout === 'function') {
                const readout = mail.buildReadout(item.item.message_id, { mode: 'full' });
                if (typeof mail.markRead === 'function') {
                    await mail.markRead(item.item.message_id, { read: true });
                }
                this.#bindSessionIntent(options.session_id, {
                    ...intent,
                    domain: 'mail',
                    action: 'read_current',
                    entities: {
                        ...(intent?.entities && typeof intent.entities === 'object' ? cloneValue(intent.entities) : {}),
                        current_message_id: item.item.message_id,
                        current_mailbox: item.item.mailbox || null,
                        ...(orderFilter ? { order: orderFilter } : {}),
                        ...(fromFilter ? { from: cloneValue(fromFilter) } : {}),
                        ...(notFromFilter ? { not_from: cloneValue(notFromFilter) } : {})
                    }
                }, {
                    phase: 'executed',
                    message_id: item.item.message_id,
                    read: true
                });
                return buildResponse({
                    result: {
                        item: item.item,
                        readout
                    },
                    reply_text: readout?.text || ''
                });
            }
        }

        if (capabilities.includes('mail_mark_read') && (intent.action === 'mark_unread_current' || intent.action === 'mark_read_current')) {
            const targetId = currentMessageId || String(nextUnread?.item?.message_id || '').trim();
            if (!targetId || typeof mail.markRead !== 'function') {
                return buildResponse({
                    ok: false,
                    executed: false,
                    error: 'mail_not_found',
                    reply_text: english
                        ? 'I do not see which mail to update right now.'
                        : "Je ne vois pas quel mail mettre a jour pour le moment."
                });
            }
            const read = intent?.entities?.read !== false;
            const updated = await mail.markRead(targetId, { read });
            if (updated?.ok === true) {
                const item = updated?.item || currentItem || nextUnread?.item || null;
                this.#bindSessionIntent(options.session_id, {
                    ...intent,
                    domain: 'mail',
                    action: read ? 'mark_read_current' : 'mark_unread_current',
                    entities: {
                        ...(intent?.entities && typeof intent.entities === 'object' ? cloneValue(intent.entities) : {}),
                        current_message_id: item?.message_id || targetId,
                        current_mailbox: item?.mailbox || null,
                        read
                    }
                }, {
                    phase: 'executed',
                    message_id: item?.message_id || targetId,
                    read
                });
                return buildResponse({
                    result: updated,
                    reply_text: english
                        ? (read ? 'The mail has been marked as read.' : 'The mail has been marked as unread.')
                        : (read ? 'Le mail a ete marque comme lu.' : 'Le mail a ete marque comme non lu.')
                });
            }
        }

        if (capabilities.includes('mail_next_unread') || intent.action === 'read') {
            if (nextUnread?.ok === true && nextUnread.item?.message_id && typeof mail.buildReadout === 'function') {
                const readout = mail.buildReadout(nextUnread.item.message_id, {
                    mode: 'summary'
                });
                if (readout?.ok === true) {
                    if (typeof mail.markRead === 'function') {
                        await mail.markRead(nextUnread.item.message_id, { read: true });
                    }
                    this.#bindSessionIntent(options.session_id, {
                        ...intent,
                        domain: 'mail',
                        action: 'read_current',
                        entities: {
                            ...(intent?.entities && typeof intent.entities === 'object' ? cloneValue(intent.entities) : {}),
                            current_message_id: nextUnread.item.message_id,
                            current_mailbox: nextUnread.item.mailbox || null
                        }
                    }, {
                        phase: 'executed',
                        message_id: nextUnread.item.message_id,
                        read: true
                    });
                    return buildResponse({
                        result: {
                            item: nextUnread.item,
                            readout
                        },
                        reply_text: readout.text
                    });
                }
            }
            const fallback = topList?.items?.[0];
            if (fallback?.message_id && typeof mail.buildReadout === 'function') {
                const readout = mail.buildReadout(fallback.message_id, {
                    mode: 'summary'
                });
                if (readout?.ok === true) {
                    return buildResponse({
                        result: {
                            item: fallback,
                            readout
                        },
                        reply_text: readout.text
                    });
                }
            }
            return buildResponse({
                ok: false,
                executed: false,
                error: 'mail_next_unread_not_found',
                reply_text: english ? 'I do not see any mail to read right now.' : "Je ne vois pas de mail a lire pour le moment."
            });
        }

        if (capabilities.includes('mail_summarize') || intent.action === 'summarize') {
            const summary = typeof mail.summarize === 'function'
                ? mail.summarize({
                    unread_only: unreadOnly,
                    limit: 10,
                    ...(mailboxFilter ? { mailbox: mailboxFilter } : {}),
                    ...(threadIdFilter ? { thread_id: threadIdFilter } : {}),
                    ...(fromFilter ? { from: fromFilter } : {}),
                    ...(notFromFilter ? { not_from: notFromFilter } : {})
                })
                : null;
            if (summary?.ok === true) {
                const itemsForAi = Array.isArray(summary?.items) && summary.items.length > 0
                    ? summary.items
                    : (Array.isArray(topList?.items) ? topList.items : []);
                if (itemsForAi.length > 0 && typeof this.mailAiSummarizer === 'function') {
                    const aiSummary = await this.mailAiSummarizer({
                        items: itemsForAi,
                        stats: summary?.stats || topList?.stats || null,
                        locale
                    });
                    if (aiSummary?.ok === true && aiSummary?.text) {
                        return buildResponse({
                            result: {
                                ...summary,
                                ai_summary: aiSummary.text
                            },
                            reply_text: aiSummary.text
                        });
                    }
                }
                return buildResponse({
                    result: summary,
                    reply_text: summary.summary
                });
            }
        }

        if (capabilities.includes('mail_list') || intent.action === 'list') {
            const listing = resolvedUnreadOnly ? unreadList : topList;
            if (resolvedStatusOnly) {
                const statusItems = ((resolvedUnreadOnly ? unreadList : listing)?.items || []);
                const statusCount = statusItems.length;
                const subjects = statusItems
                    .slice(0, 3)
                    .map((item) => normalizeSpeechSubject(item))
                    .filter(Boolean);
                const senderScope = describeMailSenderScope({
                    locale,
                    from: fromFilter,
                    notFrom: notFromFilter
                });
                const replyText = statusCount <= 0
                    ? (english
                        ? (resolvedUnreadOnly
                            ? `You do not have any unread mail${senderScope}.`
                            : `You do not have any mail${senderScope}.`)
                        : (resolvedUnreadOnly
                            ? `Tu n'as pas de mail non lu${senderScope}.`
                            : `Tu n'as pas de mail${senderScope}.`))
                    : (subjects.length
                        ? (english
                            ? (resolvedUnreadOnly
                                ? `You have ${statusCount} unread mail(s)${senderScope}: ${subjects.join(', ')}.`
                                : `You have ${statusCount} mail(s)${senderScope}: ${subjects.join(', ')}.`)
                            : (resolvedUnreadOnly
                                ? `Tu as ${statusCount} mail(s) non lu(s)${senderScope}: ${subjects.join(', ')}.`
                                : `Tu as ${statusCount} mail(s)${senderScope}: ${subjects.join(', ')}.`))
                        : (english
                            ? (resolvedUnreadOnly
                                ? `You have ${statusCount} unread mail(s)${senderScope}.`
                                : `You have ${statusCount} mail(s)${senderScope}.`)
                            : (resolvedUnreadOnly
                                ? `Tu as ${statusCount} mail(s) non lu(s)${senderScope}.`
                                : `Tu as ${statusCount} mail(s)${senderScope}.`)));
                const currentItem = statusItems[0] || null;
                this.#bindSessionIntent(options.session_id, {
                    ...intent,
                    domain: 'mail',
                    action: 'list',
                    entities: {
                        ...(intent?.entities && typeof intent.entities === 'object' ? cloneValue(intent.entities) : {}),
                        current_message_id: currentItem?.message_id || null,
                        current_mailbox: currentItem?.mailbox || null,
                        unread_only: resolvedUnreadOnly,
                        status_only: true,
                        ...(orderFilter ? { order: orderFilter } : {}),
                        ...(fromFilter ? { from: cloneValue(fromFilter) } : {}),
                        ...(notFromFilter ? { not_from: cloneValue(notFromFilter) } : {})
                    },
                    followups: {
                        read_current: {
                            intent_id: intent?.intent_id || null,
                            type: 'connector_toolchain',
                            domain: 'mail',
                            action: 'read_current',
                            status: 'pending_connector',
                            requested_capabilities: ['mail_read', 'mail_mark_read'],
                            entities: {
                                current_message_id: currentItem?.message_id || null
                            },
                            execution: {
                                target: 'pending_connector',
                                confirmation_required: false,
                                toolchain: [
                                    buildPendingConnectorStep('mail_read', {
                                        context: 'current',
                                        current_message_id: currentItem?.message_id || null
                                    }),
                                    buildPendingConnectorStep('mail_mark_read', {
                                        context: 'current',
                                        current_message_id: currentItem?.message_id || null
                                    })
                                ]
                            }
                        }
                    }
                }, {
                    phase: 'executed',
                    message_id: currentItem?.message_id || null
                });
                return buildResponse({
                    result: resolvedUnreadOnly ? unreadList : listing,
                    reply_text: replyText
                });
            }
            if (listing?.ok === true) {
                const subjects = (listing.items || [])
                    .slice(0, 3)
                    .map((item) => normalizeSpeechSubject(item))
                    .filter(Boolean);
                const currentItem = (listing.items || [])[0] || null;
                const senderScope = describeMailSenderScope({
                    locale,
                    from: fromFilter,
                    notFrom: notFromFilter
                });
                const replyText = subjects.length
                    ? (english
                        ? (resolvedUnreadOnly
                            ? `Here are the unread mails${senderScope}: ${subjects.join(', ')}.`
                            : orderFilter === 'oldest'
                                ? `Here is the oldest mail${senderScope}: ${subjects.join(', ')}.`
                                : `Here are the latest mails${senderScope}: ${subjects.join(', ')}.`)
                        : (resolvedUnreadOnly
                            ? `Voici les mails non lus${senderScope}: ${subjects.join(', ')}.`
                            : orderFilter === 'oldest'
                                ? `Voici le mail le plus ancien${senderScope} : ${subjects.join(', ')}.`
                                : `Voici les derniers mails${senderScope} : ${subjects.join(', ')}.`))
                    : (english
                        ? (resolvedUnreadOnly
                            ? `I do not see any unread mail${senderScope} right now.`
                            : `I do not see any mail${senderScope} right now.`)
                        : (resolvedUnreadOnly
                            ? `Je ne vois pas de mail non lu${senderScope} pour le moment.`
                            : `Je ne vois pas de mail${senderScope} pour le moment.`));
                this.#bindSessionIntent(options.session_id, {
                    ...intent,
                    domain: 'mail',
                    action: 'list',
                    entities: {
                        ...(intent?.entities && typeof intent.entities === 'object' ? cloneValue(intent.entities) : {}),
                        current_message_id: currentItem?.message_id || null,
                        current_mailbox: currentItem?.mailbox || null,
                        unread_only: resolvedUnreadOnly,
                        status_only: resolvedStatusOnly,
                        ...(orderFilter ? { order: orderFilter } : {}),
                        ...(fromFilter ? { from: cloneValue(fromFilter) } : {}),
                        ...(notFromFilter ? { not_from: cloneValue(notFromFilter) } : {})
                    },
                    followups: {
                        read_current: {
                            intent_id: intent?.intent_id || null,
                            type: 'connector_toolchain',
                            domain: 'mail',
                            action: 'read_current',
                            status: 'pending_connector',
                            requested_capabilities: ['mail_read', 'mail_mark_read'],
                            entities: {
                                current_message_id: currentItem?.message_id || null
                            },
                            execution: {
                                target: 'pending_connector',
                                confirmation_required: false,
                                toolchain: [
                                    buildPendingConnectorStep('mail_read', {
                                        context: 'current',
                                        current_message_id: currentItem?.message_id || null
                                    }),
                                    buildPendingConnectorStep('mail_mark_read', {
                                        context: 'current',
                                        current_message_id: currentItem?.message_id || null
                                    })
                                ]
                            }
                        }
                    }
                }, {
                    phase: 'executed',
                    message_id: currentItem?.message_id || null
                });
                return buildResponse({
                    result: listing,
                    reply_text: replyText
                });
            }
        }

        if (capabilities.includes('mail_search') || intent.action === 'search') {
            const queryText = String(
                intent?.entities?.query_text
                || toolchain.find((step) => step?.capability === 'mail_search')?.input?.query
                || ''
            ).trim();
            if (!queryText || typeof mail.search !== 'function') {
                return buildResponse({
                    ok: false,
                    executed: false,
                    error: 'mail_search_query_missing',
                    reply_text: english
                        ? 'What should I search for in your mails?'
                        : 'Que veux-tu que je cherche dans tes mails ?'
                });
            }
            const results = mail.search(queryText, {
                unread_only: resolvedUnreadOnly,
                ...(mailboxFilter ? { mailbox: mailboxFilter } : {}),
                ...(fromFilter ? { from: fromFilter } : {}),
                ...(notFromFilter ? { not_from: notFromFilter } : {}),
                limit: resolvedLimit
            });
            const subjects = (results?.items || []).slice(0, 3).map((item) => normalizeSpeechSubject(item)).filter(Boolean);
            return buildResponse({
                result: results,
                reply_text: subjects.length
                    ? (english
                        ? `I found these mails for "${queryText}": ${subjects.join(', ')}.`
                        : `J'ai trouve ces mails pour "${queryText}" : ${subjects.join(', ')}.`)
                    : (english
                        ? `I did not find any mail for "${queryText}".`
                        : `Je n'ai trouve aucun mail pour "${queryText}".`)
            });
        }

        if (capabilities.includes('mail_archive') || intent.action === 'archive_current') {
            const targetId = currentMessageId || String(nextUnread?.item?.message_id || '').trim();
            if (!targetId || typeof mail.archive !== 'function') {
                return buildResponse({
                    ok: false,
                    executed: false,
                    error: 'mail_not_found',
                    reply_text: english
                        ? 'I do not see which mail to archive right now.'
                        : "Je ne vois pas quel mail archiver pour le moment."
                });
            }
            const archived = await mail.archive(targetId, {});
            if (archived?.ok === true) {
                return buildResponse({
                    result: archived,
                    reply_text: english ? 'The mail has been archived.' : 'Le mail a ete archive.'
                });
            }
        }

        if (capabilities.includes('mail_delete') || intent.action === 'delete_current') {
            const targetId = currentMessageId || String(nextUnread?.item?.message_id || '').trim();
            if (!targetId || typeof mail.delete !== 'function') {
                return buildResponse({
                    ok: false,
                    executed: false,
                    error: 'mail_not_found',
                    reply_text: english
                        ? 'I do not see which mail to delete right now.'
                        : "Je ne vois pas quel mail supprimer pour le moment."
                });
            }
            const removed = await mail.delete(targetId, {});
            if (removed?.ok === true) {
                return buildResponse({
                    result: removed,
                    reply_text: english ? 'The mail has been deleted.' : 'Le mail a ete supprime.'
                });
            }
        }

        if (capabilities.includes('mail_reply_draft')) {
            const replyStep = toolchain.find((step) => step?.capability === 'mail_reply_draft') || null;
            const replyTarget = String(
                replyStep?.input?.reply_target
                || intent?.entities?.reply_target
                || ''
            ).trim();
            const autoSend = (
                replyStep?.input?.auto_send === true
                || intent?.entities?.auto_send === true
            );
            const rawDraftText = String(
                replyStep?.input?.draft_text
                || intent?.entities?.draft_text
                || ''
            ).trim();
            const draftText = rawDraftText;

            if (!draftText) {
                return buildResponse({
                    ok: false,
                    executed: false,
                    error: 'mail_reply_text_missing',
                    reply_text: english
                        ? 'What should I reply to this mail?'
                        : 'Que veux-tu que je reponde a ce mail ?'
                });
            }

            const candidates = collectMailCandidates(
                topList?.items,
                nextUnread?.ok === true ? [nextUnread.item] : []
            );
            const sourceItem = findMailByReplyTarget(candidates, replyTarget)
                || (nextUnread?.ok === true ? nextUnread.item : null)
                || candidates[0]
                || null;

            if (!sourceItem?.message_id || typeof mail.replyDraft !== 'function') {
                return buildResponse({
                    ok: false,
                    executed: false,
                    error: 'mail_not_found',
                    reply_text: english
                        ? 'I do not see which mail to reply to right now.'
                        : "Je ne vois pas encore a quel mail repondre."
                });
            }

            const draftResult = mail.replyDraft(sourceItem.message_id, {
                reply_text: draftText
            });
            if (draftResult?.ok === true && draftResult?.draft) {
                const boundIntent = {
                    ...intent,
                    entities: {
                        ...(intent?.entities && typeof intent.entities === 'object' ? cloneValue(intent.entities) : {}),
                        draft_text: draftText,
                        auto_send: autoSend,
                        last_draft_id: draftResult.draft.draft_id,
                        last_source_message_id: sourceItem.message_id,
                        ...(replyTarget ? { reply_target: replyTarget } : {})
                    },
                    followups: {
                        send_current: {
                            intent_id: intent?.intent_id || null,
                            type: 'connector_tool',
                            domain: 'mail',
                            action: 'send',
                            status: 'pending_connector',
                            requested_capabilities: ['mail_send'],
                            entities: {
                                last_draft_id: draftResult.draft.draft_id
                            },
                            execution: {
                                target: 'pending_connector',
                                confirmation_required: false,
                                toolchain: [buildPendingConnectorStep('mail_send', {
                                    draft_id: draftResult.draft.draft_id
                                })]
                            }
                        }
                    }
                };
                this.#bindSessionIntent(options.session_id, {
                    ...boundIntent
                }, {
                    phase: 'executed',
                    draft_id: draftResult.draft.draft_id
                });

                if (autoSend && typeof mail.send === 'function') {
                    const sendResult = await mail.send(draftResult.draft.draft_id, {
                        confirmed: true
                    });
                    if (sendResult?.ok === true) {
                        const recipient = String(
                            sendResult?.draft?.to?.[0]?.name
                            || sendResult?.draft?.to?.[0]?.address
                            || sourceItem?.from?.name
                            || sourceItem?.from?.address
                            || ''
                        ).trim();
                        this.#bindSessionIntent(options.session_id, {
                            ...boundIntent,
                            entities: {
                                ...boundIntent.entities,
                                last_sent_draft_id: draftResult.draft.draft_id
                            }
                        }, {
                            phase: 'executed',
                            draft_id: draftResult.draft.draft_id,
                            sent: true
                        });
                        return buildResponse({
                            result: {
                                ...sendResult,
                                source_item: sourceItem
                            },
                            reply_text: buildMailSendAcknowledgement({
                                locale,
                                queued: sendResult?.queued === true,
                                recipient
                            })
                        });
                    }
                    return buildResponse({
                        ok: false,
                        executed: false,
                        error: sendResult?.error || 'mail_send_failed',
                        result: {
                            draft: draftResult.draft,
                            send_result: sendResult,
                            source_item: sourceItem
                        },
                        reply_text: english
                            ? 'I prepared the reply, but I could not send it.'
                            : "J'ai prepare la reponse, mais je n'ai pas pu l'envoyer."
                    });
                }

                return buildResponse({
                    result: {
                        ...draftResult,
                        source_item: sourceItem
                    },
                    reply_text: buildMailReplyAcknowledgement({
                        draft: draftResult.draft,
                        sourceItem,
                        locale
                    })
                });
            }
            return buildResponse({
                ok: false,
                executed: false,
                error: draftResult?.error || 'mail_reply_draft_failed',
                result: draftResult || undefined,
                reply_text: english
                    ? 'I could not prepare the reply draft for this mail.'
                    : "Je n'ai pas pu preparer le brouillon de reponse pour ce mail."
            });
        }

        if (capabilities.includes('mail_send')) {
            const sendStep = toolchain.find((step) => step?.capability === 'mail_send') || null;
            const activeIntent = intent?.context?.active_intent || null;
            const draftId = String(
                sendStep?.input?.draft_id
                || intent?.entities?.last_draft_id
                || activeIntent?.entities?.last_draft_id
                || ''
            ).trim();
            if (!draftId || typeof mail.send !== 'function') {
                return buildResponse({
                    ok: false,
                    executed: false,
                    error: 'mail_draft_not_found',
                    reply_text: english
                        ? 'I do not have any reply draft ready to send.'
                        : "Je n'ai pas encore de brouillon pret a envoyer."
                });
            }
            const sendResult = await mail.send(draftId, {
                confirmed: true
            });
            if (sendResult?.ok === true) {
                const recipient = String(
                    sendResult?.draft?.to?.[0]?.name
                    || sendResult?.draft?.to?.[0]?.address
                    || ''
                ).trim();
                this.#bindSessionIntent(options.session_id, {
                    ...intent,
                    entities: {
                        ...(intent?.entities && typeof intent.entities === 'object' ? cloneValue(intent.entities) : {}),
                        last_draft_id: draftId,
                        last_sent_draft_id: draftId
                    }
                }, {
                    phase: 'executed',
                    draft_id: draftId,
                    sent: true
                });
                return buildResponse({
                    result: sendResult,
                    reply_text: buildMailSendAcknowledgement({
                        locale,
                        queued: sendResult?.queued === true,
                        recipient
                    })
                });
            }
            return buildResponse({
                ok: false,
                executed: false,
                error: sendResult?.error || 'mail_send_failed',
                result: sendResult || undefined,
                reply_text: english
                    ? 'I could not send that mail.'
                    : "Je n'ai pas pu envoyer ce mail."
            });
        }

        if (capabilities.includes('mail_search')) {
            return null;
        }

        return null;
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

        if (followup === 'reply_current') {
            if (baseIntent.domain === 'mail') {
                return normalizeVoiceIntent({
                    ...baseIntent,
                    action: 'reply_current',
                    type: 'connector_tool',
                    status: 'pending_connector',
                    requested_capabilities: ['mail_reply_draft'],
                    context: {
                        session_id: sessionId,
                        followup_kind: followup
                    },
                    execution: {
                        target: 'pending_connector',
                        confirmation_required: false,
                        toolchain: [buildPendingConnectorStep('mail_reply_draft', {
                            context: 'current'
                        })]
                    }
                });
            }
            return normalizeVoiceIntent({
                ...baseIntent,
                action: 'reply_current',
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

        if (followup === 'summarize_current') {
            const capability = baseIntent.domain === 'mail' ? 'mail_summarize' : 'voice_summarize_current';
            return normalizeVoiceIntent({
                ...baseIntent,
                action: 'summarize_current',
                type: 'connector_tool',
                status: 'pending_connector',
                requested_capabilities: [capability],
                context: {
                    session_id: sessionId,
                    followup_kind: followup
                },
                execution: {
                    target: 'pending_connector',
                    confirmation_required: false,
                    toolchain: [buildPendingConnectorStep(capability, {
                        context: 'current',
                        summary_mode: 'short'
                    })]
                }
            });
        }

        if (followup === 'next_item' || followup === 'previous_item') {
            const direction = followup === 'next_item' ? 'next' : 'previous';
            if (baseIntent.domain === 'mail') {
                const capability = direction === 'next' ? 'mail_next_unread' : 'mail_list';
                return normalizeVoiceIntent({
                    ...baseIntent,
                    action: `${direction}_item`,
                    type: 'connector_tool',
                    status: 'pending_connector',
                    requested_capabilities: [capability],
                    context: {
                        session_id: sessionId,
                        followup_kind: followup
                    },
                    execution: {
                        target: 'pending_connector',
                        confirmation_required: false,
                        toolchain: [buildPendingConnectorStep(capability, {
                            direction,
                            context: 'current'
                        })]
                    }
                });
            }

            if (baseIntent.domain === 'calendar') {
                return normalizeVoiceIntent({
                    ...baseIntent,
                    action: `${direction}_item`,
                    status: 'ready',
                    context: {
                        session_id: sessionId,
                        followup_kind: followup
                    },
                    execution: {
                        target: 'runtime_v2',
                        confirmation_required: false,
                        toolchain: [{
                            source: 'runtime_v2',
                            tool_id: 'calendar.list_events',
                            action: 'pointer.click',
                            input: {
                                direction,
                                context: 'current'
                            }
                        }]
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
        for (const listener of this.listeners) {
            listener(entry);
        }
        dispatchWindowEvent(this.env, this.eventName, entry);
        return entry;
    }
}

export const createVoiceOrchestrator = (options = {}) => new VoiceOrchestrator(options);

export { VoiceOrchestrator };
