const QUOTA_TRACKER_STORAGE_KEY = 'eve_ai_quota_tracker_v1';

const cloneValue = (value) => {
    if (typeof structuredClone === 'function') return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
};

const nowIso = () => new Date().toISOString();
const DAY_MS = 24 * 60 * 60 * 1000;

const createDefaultState = () => ({
    version: 1,
    updated_at: null,
    budget_tokens_per_day: 50000,
    usage_events: [],
    incidents: []
});

const toFiniteNumber = (value, fallback = 0) => {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
};

export const createAiQuotaTracker = ({
    env = globalThis,
    storageKey = QUOTA_TRACKER_STORAGE_KEY
} = {}) => {
    let inMemory = createDefaultState();

    const read = () => {
        try {
            const localStorage = env?.localStorage || env?.window?.localStorage || null;
            if (!localStorage || typeof localStorage.getItem !== 'function') return cloneValue(inMemory);
            const raw = localStorage.getItem(storageKey);
            if (!raw) return cloneValue(inMemory);
            const parsed = JSON.parse(raw);
            if (!parsed || typeof parsed !== 'object') return cloneValue(inMemory);
            inMemory = {
                ...createDefaultState(),
                ...parsed
            };
            return cloneValue(inMemory);
        } catch (_) {
            return cloneValue(inMemory);
        }
    };

    const write = (state = {}) => {
        inMemory = {
            ...createDefaultState(),
            ...(state && typeof state === 'object' ? state : {})
        };
        inMemory.updated_at = nowIso();
        try {
            const localStorage = env?.localStorage || env?.window?.localStorage || null;
            if (localStorage && typeof localStorage.setItem === 'function') {
                localStorage.setItem(storageKey, JSON.stringify(inMemory));
            }
        } catch (_) {
            // Keep in-memory fallback.
        }
        return cloneValue(inMemory);
    };

    const mutate = (updater) => {
        const current = read();
        const next = typeof updater === 'function' ? updater(current) : current;
        return write(next);
    };

    return {
        setBudgetTokensPerDay(tokens) {
            return mutate((state) => ({
                ...state,
                budget_tokens_per_day: Math.max(0, toFiniteNumber(tokens, state.budget_tokens_per_day))
            }));
        },

        recordUsage({
            provider = '',
            model = '',
            prompt_tokens = 0,
            completion_tokens = 0
        } = {}) {
            return mutate((state) => ({
                ...state,
                usage_events: [
                    ...(Array.isArray(state.usage_events) ? state.usage_events : []),
                    {
                        provider: String(provider || '').trim() || null,
                        model: String(model || '').trim() || null,
                        prompt_tokens: toFiniteNumber(prompt_tokens, 0),
                        completion_tokens: toFiniteNumber(completion_tokens, 0),
                        total_tokens: toFiniteNumber(prompt_tokens, 0) + toFiniteNumber(completion_tokens, 0),
                        recorded_at: nowIso()
                    }
                ].slice(-500)
            }));
        },

        recordIncident({
            provider = '',
            model = '',
            error_code = ''
        } = {}) {
            return mutate((state) => ({
                ...state,
                incidents: [
                    ...(Array.isArray(state.incidents) ? state.incidents : []),
                    {
                        provider: String(provider || '').trim() || null,
                        model: String(model || '').trim() || null,
                        error_code: String(error_code || '').trim() || null,
                        recorded_at: nowIso()
                    }
                ].slice(-200)
            }));
        },

        getSummary({
            windowMs = DAY_MS
        } = {}) {
            const state = read();
            const cutoff = Date.now() - Math.max(0, toFiniteNumber(windowMs, DAY_MS));
            const usageEvents = (Array.isArray(state.usage_events) ? state.usage_events : [])
                .filter((entry) => new Date(entry.recorded_at).getTime() >= cutoff);
            const incidents = (Array.isArray(state.incidents) ? state.incidents : [])
                .filter((entry) => new Date(entry.recorded_at).getTime() >= cutoff);
            const promptTokens = usageEvents.reduce((sum, entry) => sum + toFiniteNumber(entry.prompt_tokens, 0), 0);
            const completionTokens = usageEvents.reduce((sum, entry) => sum + toFiniteNumber(entry.completion_tokens, 0), 0);
            const totalTokens = promptTokens + completionTokens;
            const budgetTokens = Math.max(0, toFiniteNumber(state.budget_tokens_per_day, 50000));
            const usageRatio = budgetTokens > 0 ? totalTokens / budgetTokens : 0;
            const recentQuotaIncident = incidents.find((entry) => entry.error_code === 'provider_quota_exceeded') || null;
            const recentRateLimitIncident = incidents.find((entry) => entry.error_code === 'provider_rate_limited') || null;

            return {
                prompt_tokens: promptTokens,
                completion_tokens: completionTokens,
                total_tokens: totalTokens,
                budget_tokens_per_day: budgetTokens,
                usage_ratio: usageRatio,
                warning_code: recentQuotaIncident
                    ? 'provider_quota_exceeded'
                    : (usageRatio >= 0.8 ? 'quota_running_low' : (recentRateLimitIncident ? 'provider_rate_limited' : '')),
                incidents: cloneValue(incidents.slice(-10))
            };
        }
    };
};
