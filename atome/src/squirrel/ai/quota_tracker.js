import { OPENAI_TEXT_TOKEN_PRICING, OPENAI_REALTIME_TOKEN_PRICING, OPENAI_SERVICE_TOOLS, OPENAI_MODEL_PROFILES } from './model_catalog_registry.js';
import { getSessionState } from '../apis/unified/adole_api/session.js';
import { cloneStructured as cloneValue, nowIso } from '../shared/scalars.js';
const QUOTA_TRACKER_STORAGE_KEY = 'eve_ai_quota_tracker_v1';


const DAY_MS = 24 * 60 * 60 * 1000;

const createDefaultState = () => ({
    version: 1,
    updated_at: null,
    budget_tokens_per_day: 0,
    budget_configured: false,
    low_remaining_ratio: 0.2, critical_remaining_ratio: 0.1,
    usage_events: [],
    incidents: []
});

const toFiniteNumber = (value, fallback = 0) => {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
};

// This estimates token charges only. Hosted tools, storage, regional pricing,
// nonstandard service tiers and models without verified tariffs stay unknown.
export const estimateOpenAiTokenCost = ({ model, usage, serviceTier, now = Date.now() } = {}) => {
    const rate = OPENAI_TEXT_TOKEN_PRICING[model];
    if (!rate || serviceTier !== 'default' || now > Date.parse('2026-11-21T00:00:00Z')) return null;
    const details = usage?.input_tokens_details;
    const values = [usage?.input_tokens, usage?.output_tokens, details?.cached_tokens, details?.cache_write_tokens];
    if (values.some(value => !Number.isInteger(value) || value < 0)) return null;
    const [input, output, cached, writes] = values;
    if (cached + writes > input) return null;
    const longContext = input > 272000;
    return ((input - cached - writes) * rate.input + cached * rate.cached + writes * rate.cacheWrite)
        * (longContext ? 2 : 1) / 1000000 + output * rate.output * (longContext ? 1.5 : 1) / 1000000;
};

export const estimateOpenAiRealtimeTokenCost = ({ model, usage, now = Date.now() } = {}) => {
    const rates = OPENAI_REALTIME_TOKEN_PRICING[model];
    if (!rates || now > Date.parse('2026-11-21T00:00:00Z')) return null;
    const input = usage?.input_token_details, output = usage?.output_token_details;
    const cached = input?.cached_tokens_details;
    const integer = value => Number.isInteger(value) && value >= 0;
    if (![usage?.input_tokens, usage?.output_tokens, input?.cached_tokens].every(integer)) return null;
    let inputSum = 0, outputSum = 0, cachedSum = 0, cost = 0;
    for (const [modality, rate] of Object.entries(rates)) {
        const count = input?.[modality + '_tokens'];
        const cachedCount = input.cached_tokens === 0 ? 0 : cached?.[modality + '_tokens'];
        const generated = rate.output === undefined ? 0 : output?.[modality + '_tokens'];
        if (![count, cachedCount, generated].every(integer) || cachedCount > count) return null;
        inputSum += count; outputSum += generated; cachedSum += cachedCount;
        cost += (count - cachedCount) * rate.input + cachedCount * rate.cached + generated * (rate.output || 0);
    }
    if (inputSum !== usage.input_tokens || outputSum !== usage.output_tokens || cachedSum !== input.cached_tokens) return null;
    return cost / 1000000;
};

export const createAiQuotaTracker = ({
    env = globalThis,
    storageKey = QUOTA_TRACKER_STORAGE_KEY,
    principal = () => getSessionState()?.user?.id || 'anonymous'
} = {}) => {
    let inMemory = createDefaultState(), owner = null;
    const scopedKey = () => {
        const current = String(principal());
        if (owner !== current) { owner = current; inMemory = createDefaultState(); }
        return storageKey + ':' + encodeURIComponent(current);
    };

    const read = () => {
        const key = scopedKey();
        try {
            const localStorage = env?.localStorage || env?.window?.localStorage || null;
            if (!localStorage || typeof localStorage.getItem !== 'function') return cloneValue(inMemory);
            const raw = localStorage.getItem(key);
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
        const key = scopedKey();
        inMemory = {
            ...createDefaultState(),
            ...(state && typeof state === 'object' ? state : {})
        };
        inMemory.updated_at = nowIso();
        try {
            const localStorage = env?.localStorage || env?.window?.localStorage || null;
            if (localStorage && typeof localStorage.setItem === 'function') {
                localStorage.setItem(key, JSON.stringify(inMemory));
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
            const result = mutate((state) => ({
                ...state,
                budget_configured: Number.isFinite(Number(tokens)) && Number(tokens) > 0,
                budget_tokens_per_day: Math.max(0, toFiniteNumber(tokens, state.budget_tokens_per_day))
            }));
            if (env.dispatchEvent && env.CustomEvent) env.dispatchEvent(new env.CustomEvent('squirrel:ai-budget-changed'));
            return result;
        },

        setThresholds({ low = 0.2, critical = 0.1 } = {}) {
            if (!Number.isFinite(low) || !Number.isFinite(critical) || critical < 0 || low > 1 || critical >= low) throw new Error('quota_thresholds_invalid');
            return mutate(state => ({ ...state, low_remaining_ratio: low, critical_remaining_ratio: critical }));
        },
        recordUsage({
            provider = '',
            model = '',
            prompt_tokens = 0,
            completion_tokens = 0, audio_input_tokens = 0, audio_output_tokens = 0, images = 0, tool_calls = 0, estimated_cost_usd = null, estimated_token_cost_usd = null, usage_known = true
        } = {}) {
            return mutate((state) => ({
                ...state,
                usage_events: [
                    ...(Array.isArray(state.usage_events) ? state.usage_events : []),
                    {
                        provider: String(provider || '').trim() || null,
                        model: String(model || '').trim() || null,
                        usage_known: usage_known === true,
                        prompt_tokens: Math.max(0, toFiniteNumber(prompt_tokens, 0)),
                        completion_tokens: Math.max(0, toFiniteNumber(completion_tokens, 0)),
                        total_tokens: Math.max(0, toFiniteNumber(prompt_tokens, 0)) + Math.max(0, toFiniteNumber(completion_tokens, 0)),
                        audio_input_tokens: Math.max(0, toFiniteNumber(audio_input_tokens)),
                        audio_output_tokens: Math.max(0, toFiniteNumber(audio_output_tokens)),
                        images: Math.max(0, toFiniteNumber(images)), tool_calls: Math.max(0, toFiniteNumber(tool_calls)),
                        estimated_token_cost_usd: Number.isFinite(estimated_token_cost_usd) && estimated_token_cost_usd >= 0 ? estimated_token_cost_usd : null,
                        estimated_cost_usd: estimated_cost_usd == null ? null : Math.max(0, toFiniteNumber(estimated_cost_usd)),
                        recorded_at: nowIso()
                    }
                ].filter(entry => Date.parse(entry.recorded_at) >= Date.now() - DAY_MS)
            }));
        },

        recordProviderUsage(result = {}, action = 'responses', payload = {}) {
            const hosted = OPENAI_SERVICE_TOOLS.find(item => item.action === action)?.hosted;
            if (!hosted && !action.startsWith('remote_mcp.') && !['responses', 'image-generate', 'image-edit', 'speech', 'transcription', 'translation', 'embeddings', 'realtime'].includes(action)) return null;
            const usage = result.usage || {};
            const input = usage.input_tokens ?? usage.prompt_tokens;
            const output = usage.output_tokens ?? usage.completion_tokens ?? (action === 'embeddings' ? 0 : undefined);
            const images = action.startsWith('image-') ? (result.data?.length || 1)
                : (result.output || []).filter(item => item.type === 'image_generation_call').length;
            const model = result.model || payload.model || (hosted || action.startsWith('remote_mcp.') ? OPENAI_MODEL_PROFILES[0].model : '');
            const details = usage.input_tokens_details || usage.input_token_details || {};
            const outputDetails = usage.output_tokens_details || usage.output_token_details || {};
            const recorded = this.recordUsage({ provider: 'openai', model,
                prompt_tokens: input, completion_tokens: output,
                usage_known: Number.isInteger(input) && Number.isInteger(output),
                audio_input_tokens: details.audio_tokens, audio_output_tokens: outputDetails.audio_tokens,
                images, tool_calls: (result.output || []).filter(item => /_call$/.test(item.type)).length,
                estimated_token_cost_usd: action === 'realtime' && result.service_tier === undefined
                    ? estimateOpenAiRealtimeTokenCost({ model, usage })
                    : images ? null : estimateOpenAiTokenCost({ model, usage, serviceTier: result.service_tier })
            });
            if (env.dispatchEvent && env.CustomEvent) env.dispatchEvent(new env.CustomEvent('squirrel:ai-budget-changed'));
            return recorded;
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
            const budgetTokens = Math.max(0, toFiniteNumber(state.budget_tokens_per_day, 0));
            const usageKnown = usageEvents.every(entry => entry.usage_known !== false);
            const usageRatio = usageKnown && state.budget_configured && budgetTokens > 0 ? totalTokens / budgetTokens : null;
            const recentQuotaIncident = incidents.find((entry) => entry.error_code === 'provider_quota_exceeded') || null;
            const recentRateLimitIncident = incidents.find((entry) => entry.error_code === 'provider_rate_limited') || null;

            return {
                prompt_tokens: promptTokens,
                completion_tokens: completionTokens,
                total_tokens: totalTokens,
                usage_complete: usageKnown,
                budget_tokens_per_day: budgetTokens,
                usage_ratio: usageRatio,
                remaining_percent: usageRatio == null ? null : Math.max(0, 100 * (1 - usageRatio)),
                budget_state: recentQuotaIncident ? 'exhausted' : usageRatio == null ? 'unknown'
                    : usageRatio >= 1 ? 'exhausted' : usageRatio >= 1 - state.critical_remaining_ratio ? 'critical' : usageRatio >= 1 - state.low_remaining_ratio ? 'low' : 'normal',
                audio_input_tokens: usageEvents.reduce((sum, item) => sum + toFiniteNumber(item.audio_input_tokens), 0),
                audio_output_tokens: usageEvents.reduce((sum, item) => sum + toFiniteNumber(item.audio_output_tokens), 0),
                tool_calls: usageEvents.reduce((sum, item) => sum + toFiniteNumber(item.tool_calls), 0),
                images: usageEvents.reduce((sum, item) => sum + toFiniteNumber(item.images), 0),
                estimated_token_cost_usd: usageEvents.length && usageEvents.every(item => item.estimated_token_cost_usd != null)
                    ? usageEvents.reduce((sum, item) => sum + item.estimated_token_cost_usd, 0) : null,
                estimated_cost_usd: usageEvents.length && usageEvents.every(item => item.estimated_cost_usd != null)
                    ? usageEvents.reduce((sum, item) => sum + item.estimated_cost_usd, 0) : null,
                warning_code: recentQuotaIncident
                    ? 'provider_quota_exceeded'
                    : (usageRatio >= 1 - state.low_remaining_ratio ? 'quota_running_low' : (recentRateLimitIncident ? 'provider_rate_limited' : '')),
                incidents: cloneValue(incidents.slice(-10))
            };
        }
    };
};

// One runtime owner also preserves usage when browser storage is unavailable.
export const aiQuotaTracker = createAiQuotaTracker();
