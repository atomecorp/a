const PROACTIVE_STATE_STORAGE_KEY = 'eve_ai_proactive_state_v1';

const cloneValue = (value) => {
    if (typeof structuredClone === 'function') return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
};

const nowIso = () => new Date().toISOString();

const createDefaultState = () => ({
    version: 1,
    updated_at: null,
    enabled: false,
    startup_briefing_enabled: false,
    cooldown_by_domain: {},
    snoozed_until_by_domain: {},
    domain_preferences: {}
});

const normalizeDomain = (value) => String(value || '').trim().toLowerCase();

export const createProactiveStateStore = ({
    env = globalThis,
    storageKey = PROACTIVE_STATE_STORAGE_KEY
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
            // Keep in-memory fallback only.
        }
        return cloneValue(inMemory);
    };

    const mutate = (updater) => {
        const current = read();
        const next = typeof updater === 'function' ? updater(current) : current;
        return write(next);
    };

    return {
        load() {
            return read();
        },

        setEnabled(enabled) {
            return mutate((state) => ({
                ...state,
                enabled: enabled === true
            }));
        },

        setStartupBriefingEnabled(enabled) {
            return mutate((state) => ({
                ...state,
                startup_briefing_enabled: enabled === true
            }));
        },

        setDomainPreference(domain, patch = {}) {
            const normalizedDomain = normalizeDomain(domain);
            if (!normalizedDomain) return read();
            return mutate((state) => ({
                ...state,
                domain_preferences: {
                    ...(state.domain_preferences && typeof state.domain_preferences === 'object' ? state.domain_preferences : {}),
                    [normalizedDomain]: {
                        ...(state.domain_preferences?.[normalizedDomain] || {}),
                        ...(patch && typeof patch === 'object' ? patch : {})
                    }
                }
            }));
        },

        recordDelivery(domain, at = new Date()) {
            const normalizedDomain = normalizeDomain(domain);
            if (!normalizedDomain) return read();
            const timestamp = at instanceof Date ? at.toISOString() : String(at || nowIso());
            return mutate((state) => ({
                ...state,
                cooldown_by_domain: {
                    ...(state.cooldown_by_domain && typeof state.cooldown_by_domain === 'object' ? state.cooldown_by_domain : {}),
                    [normalizedDomain]: timestamp
                }
            }));
        },

        snoozeDomain(domain, until) {
            const normalizedDomain = normalizeDomain(domain);
            if (!normalizedDomain) return read();
            const value = until instanceof Date ? until.toISOString() : String(until || '').trim();
            return mutate((state) => ({
                ...state,
                snoozed_until_by_domain: {
                    ...(state.snoozed_until_by_domain && typeof state.snoozed_until_by_domain === 'object' ? state.snoozed_until_by_domain : {}),
                    [normalizedDomain]: value || null
                }
            }));
        },

        clear() {
            return write(createDefaultState());
        }
    };
};
