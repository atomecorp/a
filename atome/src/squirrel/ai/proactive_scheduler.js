import { createCalendarRequest, createMailRequest } from '../voice/semantic_contract.js';

const DEFAULT_COOLDOWN_MS = 5 * 60 * 1000;
const DEFAULT_COALESCE_WINDOW_MS = 60 * 1000;
const DEFAULT_CONFIDENCE_THRESHOLD = 0.8;

const normalizeText = (value) => String(value || '').trim();

const isEnglish = (locale) => normalizeText(locale).toLowerCase().startsWith('en');

const toDate = (value) => {
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
};

const readPersistentPreferences = (persistentMemory = null) => {
    if (!persistentMemory || typeof persistentMemory.getSummary !== 'function') return {};
    return persistentMemory.getSummary().preference_overrides || {};
};

const readProactiveState = (proactiveState = null) => {
    if (!proactiveState || typeof proactiveState.load !== 'function') return {};
    return proactiveState.load() || {};
};

const readBooleanPreference = (value, fallback = false) => {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        if (normalized === 'true') return true;
        if (normalized === 'false') return false;
    }
    return fallback;
};

const resolveProactiveEnabled = ({
    persistentMemory = null,
    proactiveState = null
} = {}) => {
    const state = readProactiveState(proactiveState);
    if (typeof state.enabled === 'boolean') return state.enabled;
    const prefs = readPersistentPreferences(persistentMemory);
    return readBooleanPreference(prefs['proactive.enabled'], false);
};

const resolveStartupBriefingEnabled = ({
    persistentMemory = null,
    proactiveState = null
} = {}) => {
    const state = readProactiveState(proactiveState);
    if (typeof state.startup_briefing_enabled === 'boolean') return state.startup_briefing_enabled;
    const prefs = readPersistentPreferences(persistentMemory);
    return readBooleanPreference(prefs['proactive.startup_briefing.enabled'], false);
};

const resolveDomainCooldownMs = ({
    domain = '',
    persistentMemory = null,
    proactiveState = null
} = {}) => {
    const normalizedDomain = normalizeText(domain).toLowerCase();
    const state = readProactiveState(proactiveState);
    const stateCooldown = Number(state?.domain_preferences?.[normalizedDomain]?.cooldown_ms);
    if (Number.isFinite(stateCooldown) && stateCooldown >= 0) return stateCooldown;
    const prefs = readPersistentPreferences(persistentMemory);
    const prefCooldown = Number(prefs[`proactive.${normalizedDomain}.cooldown_ms`]);
    if (Number.isFinite(prefCooldown) && prefCooldown >= 0) return prefCooldown;
    return DEFAULT_COOLDOWN_MS;
};

const resolveLastDeliveryAt = ({
    domain = '',
    cooldownByDomain = {},
    proactiveState = null
} = {}) => {
    const normalizedDomain = normalizeText(domain).toLowerCase();
    const explicit = cooldownByDomain?.[normalizedDomain];
    if (Number.isFinite(Number(explicit))) return Number(explicit);
    const explicitDate = toDate(explicit);
    if (explicitDate) return explicitDate.getTime();
    const state = readProactiveState(proactiveState);
    const storedDate = toDate(state?.cooldown_by_domain?.[normalizedDomain]);
    return storedDate ? storedDate.getTime() : 0;
};

const isDomainSnoozed = ({
    domain = '',
    now = new Date(),
    proactiveState = null
} = {}) => {
    const normalizedDomain = normalizeText(domain).toLowerCase();
    const state = readProactiveState(proactiveState);
    const snoozedUntil = toDate(state?.snoozed_until_by_domain?.[normalizedDomain]);
    const currentDate = toDate(now) || new Date();
    return !!(snoozedUntil && snoozedUntil.getTime() > currentDate.getTime());
};

const scoreTrigger = (trigger = {}) => {
    if (trigger.type === 'meeting_soon') return 1;
    if (trigger.type === 'startup_briefing') return 0.9;
    return 0.5;
};

export const buildStartupBriefing = async ({
    toolRouter = null,
    persistentMemory = null,
    proactiveState = null,
    locale = 'fr-FR'
} = {}) => {
    if (!resolveProactiveEnabled({ persistentMemory, proactiveState })) {
        return { ok: false, skipped: true, reason: 'proactive_disabled' };
    }
    if (!resolveStartupBriefingEnabled({ persistentMemory, proactiveState })) {
        return { ok: false, skipped: true, reason: 'startup_briefing_disabled' };
    }
    if (!toolRouter || typeof toolRouter.execute !== 'function') {
        return { ok: false, error: 'tool_router_unavailable' };
    }

    const unreadMailResult = await toolRouter.execute(createMailRequest({
        operation: 'list',
        filters: {
            read_state: 'unread',
            limit: 5,
            order: 'newest'
        },
        status_only: true,
        source: {
            locale,
            utterance_raw: '',
            utterance_normalized: ''
        }
    }));

    const calendarResult = await toolRouter.execute(createCalendarRequest({
        operation: 'list',
        filters: {
            temporal_ref: 'today',
            limit: 5
        },
        source: {
            locale,
            utterance_raw: '',
            utterance_normalized: ''
        }
    }));

    const unreadCount = Number(unreadMailResult?.stats?.unread ?? unreadMailResult?.items?.length ?? 0);
    const nextEvent = Array.isArray(calendarResult?.items) ? calendarResult.items[0] || null : null;
    const english = isEnglish(locale);
    const nextEventTitle = normalizeText(nextEvent?.title);
    const preferenceHint = persistentMemory && typeof persistentMemory.getSummary === 'function'
        ? persistentMemory.getSummary().workflow_patterns?.[0]?.key || null
        : null;

    const text = english
        ? `You have ${unreadCount} unread mail(s)${nextEventTitle ? ` and your next event is ${nextEventTitle}` : ''}.${preferenceHint ? ` I remembered your usual pattern: ${preferenceHint}.` : ''}`
        : `Tu as ${unreadCount} mail(s) non lu(s)${nextEventTitle ? ` et ton prochain rendez-vous est ${nextEventTitle}` : ''}.${preferenceHint ? ` J'ai retenu ton habitude: ${preferenceHint}.` : ''}`;

    return {
        ok: true,
        text,
        unread_count: unreadCount,
        next_event: nextEvent,
        type: 'startup_briefing'
    };
};

export const evaluateProactiveNotifications = ({
    now = new Date(),
    events = [],
    locale = 'fr-FR',
    confidenceThreshold = DEFAULT_CONFIDENCE_THRESHOLD,
    persistentMemory = null,
    proactiveState = null,
    cooldownByDomain = {},
    userPresent = true
} = {}) => {
    if (!resolveProactiveEnabled({ persistentMemory, proactiveState })) return [];
    const currentDate = toDate(now) || new Date();
    const english = isEnglish(locale);
    const triggers = [];
    const dismissFeedback = persistentMemory && typeof persistentMemory.getSummary === 'function'
        ? persistentMemory.getSummary().dismiss_feedback || []
        : [];
    const dismissScoreByKey = new Map(dismissFeedback.map((entry) => [entry.key, Number(entry.score || 0)]));

    for (const event of Array.isArray(events) ? events : []) {
        const start = toDate(event?.start_at || event?.start || event?.starts_at);
        if (!start) continue;
        const deltaMs = start.getTime() - currentDate.getTime();
        if (deltaMs < 0 || deltaMs > 10 * 60 * 1000) continue;
        const baseConfidence = deltaMs <= 5 * 60 * 1000 ? 0.95 : 0.88;
        const dismissPenalty = dismissScoreByKey.get(`meeting:${event?.id || ''}`) || 0;
        const confidence = Math.max(0, baseConfidence - (dismissPenalty * 0.05));
        if (confidence < confidenceThreshold) continue;
        if (isDomainSnoozed({ domain: 'calendar', now: currentDate, proactiveState })) continue;
        const lastDeliveredAt = resolveLastDeliveryAt({
            domain: 'calendar',
            cooldownByDomain,
            proactiveState
        });
        if ((currentDate.getTime() - lastDeliveredAt) < resolveDomainCooldownMs({
            domain: 'calendar',
            persistentMemory,
            proactiveState
        })) continue;
        if (!userPresent) continue;
        triggers.push({
            type: 'meeting_soon',
            domain: 'calendar',
            confidence,
            priority: scoreTrigger({ type: 'meeting_soon' }),
            event_id: event?.id || null,
            text: english
                ? `Your meeting ${normalizeText(event?.title || '') || 'event'} starts in ${Math.round(deltaMs / 60000)} minute(s).`
                : `Ton rendez-vous ${normalizeText(event?.title || '') || ''} commence dans ${Math.round(deltaMs / 60000)} minute(s).`
        });
    }

    return triggers.sort((left, right) => Number(right.priority || 0) - Number(left.priority || 0));
};

export const coalesceProactiveNotifications = (triggers = [], {
    locale = 'fr-FR',
    windowMs = DEFAULT_COALESCE_WINDOW_MS
} = {}) => {
    const english = isEnglish(locale);
    const list = Array.isArray(triggers) ? triggers.slice() : [];
    if (!list.length) return [];
    if (list.length === 1) return list;

    const highest = list.sort((left, right) => Number(right.priority || 0) - Number(left.priority || 0));
    const top = highest[0];
    const second = highest[1];

    return [{
        type: 'coalesced',
        domain: top.domain,
        confidence: Math.max(Number(top.confidence || 0), Number(second?.confidence || 0)),
        priority: Number(top.priority || 0),
        coalesced_window_ms: windowMs,
        text: english
            ? `${top.text} ${second?.text || ''}`.trim()
            : `${top.text} ${second?.text || ''}`.trim()
    }];
};
