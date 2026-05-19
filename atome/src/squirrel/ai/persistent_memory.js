const MEMORY_STORAGE_KEY = 'eve_ai_persistent_memory_v1';

const cloneValue = (value) => {
    if (typeof structuredClone === 'function') return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
};

const nowIso = () => new Date().toISOString();

const normalizeText = (value) => String(value || '').trim();

const createDefaultState = () => ({
    version: 1,
    updated_at: null,
    user_profile: {},
    preference_overrides: {},
    contact_affinity: {},
    workflow_patterns: {},
    dismiss_feedback: {}
});

const summarizeMap = (map = {}, {
    limit = 5
} = {}) => Object.values(map)
    .sort((left, right) => Number(right?.score || 0) - Number(left?.score || 0))
    .slice(0, limit)
    .map((entry) => cloneValue(entry));

export const createPersistentMemoryStore = ({
    env = globalThis,
    storageKey = MEMORY_STORAGE_KEY
} = {}) => {
    let inMemoryState = createDefaultState();

    const readFromStorage = () => {
        try {
            const localStorage = env?.localStorage || env?.window?.localStorage || null;
            if (!localStorage || typeof localStorage.getItem !== 'function') return cloneValue(inMemoryState);
            const raw = localStorage.getItem(storageKey);
            if (!raw) return cloneValue(inMemoryState);
            const parsed = JSON.parse(raw);
            if (!parsed || typeof parsed !== 'object') return cloneValue(inMemoryState);
            inMemoryState = {
                ...createDefaultState(),
                ...parsed
            };
            return cloneValue(inMemoryState);
        } catch (_) {
            return cloneValue(inMemoryState);
        }
    };

    const writeToStorage = (state) => {
        inMemoryState = {
            ...createDefaultState(),
            ...(state && typeof state === 'object' ? state : {})
        };
        inMemoryState.updated_at = nowIso();
        try {
            const localStorage = env?.localStorage || env?.window?.localStorage || null;
            if (localStorage && typeof localStorage.setItem === 'function') {
                localStorage.setItem(storageKey, JSON.stringify(inMemoryState));
            }
        } catch (_) {
            // Keep in-memory fallback only.
        }
        return cloneValue(inMemoryState);
    };

    const mutate = (updater) => {
        const current = readFromStorage();
        const next = typeof updater === 'function' ? updater(current) : current;
        return writeToStorage(next);
    };

    return {
        load() {
            return readFromStorage();
        },

        save(state = {}) {
            return writeToStorage(state);
        },

        updateUserProfile(patch = {}) {
            return mutate((state) => ({
                ...state,
                user_profile: {
                    ...(state.user_profile && typeof state.user_profile === 'object' ? state.user_profile : {}),
                    ...(patch && typeof patch === 'object' ? patch : {})
                }
            }));
        },

        setPreference(key, value) {
            const normalizedKey = normalizeText(key);
            if (!normalizedKey) return readFromStorage();
            return mutate((state) => ({
                ...state,
                preference_overrides: {
                    ...(state.preference_overrides && typeof state.preference_overrides === 'object' ? state.preference_overrides : {}),
                    [normalizedKey]: cloneValue(value)
                }
            }));
        },

        recordContactAffinity({
            contact_id = null,
            label = null,
            channel = null
        } = {}) {
            const id = normalizeText(contact_id) || normalizeText(label);
            if (!id) return readFromStorage();
            return mutate((state) => {
                const current = state.contact_affinity?.[id] || {
                    contact_id: normalizeText(contact_id) || null,
                    label: normalizeText(label) || null,
                    preferred_channel: normalizeText(channel) || null,
                    score: 0,
                    last_used_at: null
                };
                return {
                    ...state,
                    contact_affinity: {
                        ...(state.contact_affinity && typeof state.contact_affinity === 'object' ? state.contact_affinity : {}),
                        [id]: {
                            ...current,
                            contact_id: normalizeText(contact_id) || current.contact_id || null,
                            label: normalizeText(label) || current.label || null,
                            preferred_channel: normalizeText(channel) || current.preferred_channel || null,
                            score: Number(current.score || 0) + 1,
                            last_used_at: nowIso()
                        }
                    }
                };
            });
        },

        recordWorkflowPattern({
            domain = null,
            action = null
        } = {}) {
            const key = [normalizeText(domain), normalizeText(action)].filter(Boolean).join(':');
            if (!key) return readFromStorage();
            return mutate((state) => {
                const current = state.workflow_patterns?.[key] || {
                    key,
                    domain: normalizeText(domain) || null,
                    action: normalizeText(action) || null,
                    score: 0,
                    last_seen_at: null
                };
                return {
                    ...state,
                    workflow_patterns: {
                        ...(state.workflow_patterns && typeof state.workflow_patterns === 'object' ? state.workflow_patterns : {}),
                        [key]: {
                            ...current,
                            score: Number(current.score || 0) + 1,
                            last_seen_at: nowIso()
                        }
                    }
                };
            });
        },

        recordDismissFeedback(triggerKey = '') {
            const key = normalizeText(triggerKey);
            if (!key) return readFromStorage();
            return mutate((state) => {
                const current = state.dismiss_feedback?.[key] || {
                    key,
                    score: 0,
                    last_dismissed_at: null
                };
                return {
                    ...state,
                    dismiss_feedback: {
                        ...(state.dismiss_feedback && typeof state.dismiss_feedback === 'object' ? state.dismiss_feedback : {}),
                        [key]: {
                            ...current,
                            score: Number(current.score || 0) + 1,
                            last_dismissed_at: nowIso()
                        }
                    }
                };
            });
        },

        getSummary({
            contactLimit = 5,
            workflowLimit = 5
        } = {}) {
            const state = readFromStorage();
            return {
                user_profile: cloneValue(state.user_profile || {}),
                preference_overrides: cloneValue(state.preference_overrides || {}),
                contact_affinity: summarizeMap(state.contact_affinity || {}, { limit: contactLimit }),
                workflow_patterns: summarizeMap(state.workflow_patterns || {}, { limit: workflowLimit }),
                dismiss_feedback: summarizeMap(state.dismiss_feedback || {}, { limit: workflowLimit }),
                updated_at: state.updated_at || null
            };
        }
    };
};
