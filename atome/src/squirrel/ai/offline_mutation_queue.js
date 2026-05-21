const OFFLINE_MUTATION_STORAGE_KEY = 'eve_ai_offline_mutation_queue_v1';
const MAX_PENDING_MUTATIONS = 200;

const cloneValue = (value) => {
    if (typeof structuredClone === 'function') return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
};

const nowIso = () => new Date().toISOString();

const makeId = (prefix = 'offline_mutation') => {
    if (globalThis?.crypto?.randomUUID) return `${prefix}_${globalThis.crypto.randomUUID()}`;
    return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
};

const normalizeRequest = (request = {}) => {
    if (!request || typeof request !== 'object') return null;
    return {
        domain: String(request.domain || '').trim(),
        operation: String(request.operation || '').trim(),
        target: request.target && typeof request.target === 'object' ? cloneValue(request.target) : {},
        filters: request.filters && typeof request.filters === 'object' ? cloneValue(request.filters) : {},
        payload: request.payload && typeof request.payload === 'object' ? cloneValue(request.payload) : {},
        draft: request.draft && typeof request.draft === 'object' ? cloneValue(request.draft) : {},
        source: request.source && typeof request.source === 'object' ? cloneValue(request.source) : {},
        confirmation: request.confirmation && typeof request.confirmation === 'object' ? cloneValue(request.confirmation) : {},
        audit: request.audit && typeof request.audit === 'object' ? cloneValue(request.audit) : {},
        idempotency_key: String(request.idempotency_key || request.idempotencyKey || '').trim(),
        surfaces: Array.isArray(request.surfaces) ? cloneValue(request.surfaces) : []
    };
};

export const createOfflineMutationQueue = ({
    env = globalThis,
    storageKey = OFFLINE_MUTATION_STORAGE_KEY
} = {}) => {
    let inMemory = [];

    const read = () => {
        try {
            const localStorage = env?.localStorage || env?.window?.localStorage || null;
            if (!localStorage || typeof localStorage.getItem !== 'function') return cloneValue(inMemory);
            const raw = localStorage.getItem(storageKey);
            if (!raw) return cloneValue(inMemory);
            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed)) return cloneValue(inMemory);
            inMemory = parsed.slice(-MAX_PENDING_MUTATIONS);
            return cloneValue(inMemory);
        } catch (_) {
            return cloneValue(inMemory);
        }
    };

    const write = (entries = []) => {
        inMemory = Array.isArray(entries) ? entries.slice(-MAX_PENDING_MUTATIONS) : [];
        try {
            const localStorage = env?.localStorage || env?.window?.localStorage || null;
            if (localStorage && typeof localStorage.setItem === 'function') {
                localStorage.setItem(storageKey, JSON.stringify(inMemory));
            }
        } catch (_) {
            // Keep the in-memory fallback.
        }
        return cloneValue(inMemory);
    };

    return {
        enqueue(request = {}, metadata = {}) {
            const normalizedRequest = normalizeRequest(request);
            if (!normalizedRequest?.domain || !normalizedRequest?.operation) return null;
            const entries = read();
            const entry = {
                id: String(metadata.id || makeId()),
                request: normalizedRequest,
                queued_at: metadata.queued_at || nowIso(),
                attempts: Number.isFinite(Number(metadata.attempts)) ? Number(metadata.attempts) : 0,
                last_attempt_at: metadata.last_attempt_at || null,
                last_error: metadata.last_error ? String(metadata.last_error) : '',
                last_error_code: metadata.last_error_code ? String(metadata.last_error_code) : ''
            };
            entries.push(entry);
            write(entries);
            return cloneValue(entry);
        },

        list({ limit = MAX_PENDING_MUTATIONS } = {}) {
            const size = Number.isFinite(Number(limit)) ? Math.max(1, Math.round(Number(limit))) : MAX_PENDING_MUTATIONS;
            return read().slice(-size).map((entry) => cloneValue(entry));
        },

        async flush(processor, { limit = MAX_PENDING_MUTATIONS } = {}) {
            if (typeof processor !== 'function') {
                return { processed: 0, remaining: this.list().length, failed: 0 };
            }
            const size = Number.isFinite(Number(limit)) ? Math.max(1, Math.round(Number(limit))) : MAX_PENDING_MUTATIONS;
            const sourceEntries = read();
            const pendingEntries = sourceEntries.slice(0, size);
            const retainedEntries = sourceEntries.slice(size);
            let processed = 0;
            let failed = 0;

            for (const entry of pendingEntries) {
                processed += 1;
                try {
                    const result = await processor(cloneValue(entry.request), cloneValue(entry));
                    if (result?.ok === true && result?.queued !== true && result?.offline !== true) {
                        continue;
                    }
                    failed += 1;
                    retainedEntries.push({
                        ...entry,
                        attempts: Number(entry.attempts || 0) + 1,
                        last_attempt_at: nowIso(),
                        last_error: String(result?.error || ''),
                        last_error_code: String(result?.error || '')
                    });
                } catch (error) {
                    failed += 1;
                    retainedEntries.push({
                        ...entry,
                        attempts: Number(entry.attempts || 0) + 1,
                        last_attempt_at: nowIso(),
                        last_error: String(error?.message || error || ''),
                        last_error_code: String(error?.code || '')
                    });
                }
            }

            write(retainedEntries);
            return {
                processed,
                failed,
                remaining: retainedEntries.length
            };
        },

        clear() {
            write([]);
            return [];
        }
    };
};
