/**
 * Shared core of the provider-neutral AI generation services (audio, video…).
 *
 * Each domain service keeps its own canonical request/response and error
 * vocabulary; what is identical lives here: the provider registry with its
 * capability-based `auto` routing, per-principal job storage, and the
 * HTTP-status → canonical-error mapping.
 */

/** Error factory bound to a domain's closed list of canonical codes. */
export const createErrorFactory = (codes, fallback) => (code, detail = null) => {
    const error = new Error(codes.includes(code) ? code : fallback);
    if (detail) error.detail = detail;
    return error;
};

/** Upstream HTTP status → canonical code names (each domain maps names it lacks). */
export const codeFromHttpStatus = (status, names = {}) => {
    const pick = (key, value) => names[key] || value;
    if (status === 401 || status === 403) return pick('auth', 'AUTH_ERROR');
    if (status === 402) return pick('payment', 'PAYMENT_REQUIRED');
    if (status === 429) return pick('rate', 'RATE_LIMITED');
    if (status === 400 || status === 404 || status === 422) return pick('invalid', 'INVALID_REQUEST');
    if (status >= 500) return pick('unavailable', 'PROVIDER_UNAVAILABLE');
    return pick('failed', 'GENERATION_FAILED');
};

export const createProviderRegistry = ({ makeError, invalidMessage = 'ai_provider_invalid', codes = {} } = {}) => {
    const providers = new Map();
    const code = (name, value) => codes[name] || value;
    const supports = (provider, required) => required.every(name => provider.capabilities?.[name] === true);
    const keyFor = async (provider, readKey) => (provider.credentialId ? (await readKey(provider.credentialId)) || null : null);
    const describe = (provider, configured = null) => ({
        id: provider.id, label: provider.label, remote: provider.remote !== false,
        requiresKey: Boolean(provider.credentialId), configured, capabilities: { ...provider.capabilities },
        ...(provider.models ? { models: provider.models } : {})
    });

    return {
        register(provider) {
            if (!provider?.id || typeof provider.submit !== 'function' || typeof provider.poll !== 'function') throw new Error(invalidMessage);
            providers.set(provider.id, provider);
            return provider;
        },
        unregister(id) { providers.delete(id); },
        get(id) { return providers.get(id) || null; },
        keyFor,
        providerForCredential(credentialId) {
            return [...providers.values()].find(provider => provider.credentialId === credentialId) || null;
        },
        async list({ readKey } = {}) {
            const out = [];
            for (const provider of providers.values()) {
                const configured = readKey ? (!provider.credentialId || Boolean(await keyFor(provider, readKey))) : null;
                out.push(describe(provider, configured));
            }
            return out;
        },
        describe(id) {
            const provider = providers.get(id);
            if (!provider) throw makeError(code('unavailable', 'PROVIDER_UNAVAILABLE'), 'unknown_provider');
            return describe(provider);
        },
        /**
         * Explicit provider, or `auto`: first registered provider (registration order =
         * preference) with every required capability, a key, and accepted by `accept`.
         * Returns the reason of the choice so it can be recorded on the job.
         */
        async resolve({ providerId, required, readKey, accept = null }) {
            if (providerId && providerId !== 'auto') {
                const provider = providers.get(providerId);
                if (!provider) throw makeError(code('unavailable', 'PROVIDER_UNAVAILABLE'), 'unknown_provider');
                if (!supports(provider, required)) throw makeError(code('capability', 'CAPABILITY_UNAVAILABLE'));
                const key = await keyFor(provider, readKey);
                if (provider.credentialId && !key) throw makeError(code('noKey', 'NO_PROVIDER_KEY'));
                const verdict = accept ? await accept(provider) : null;
                if (verdict) throw makeError(verdict);
                return { provider, key, reason: 'explicit' };
            }
            let capable = false;
            let rejection = null;
            for (const provider of providers.values()) {
                if (!supports(provider, required)) continue;
                capable = true;
                const key = await keyFor(provider, readKey);
                if (provider.credentialId && !key) continue;
                const verdict = accept ? await accept(provider) : null;
                if (verdict) { rejection ||= verdict; continue; }
                return { provider, key, reason: `auto:first_capable(${required.join('+')})` };
            }
            throw makeError(rejection || (capable ? code('noKey', 'NO_PROVIDER_KEY') : code('capability', 'CAPABILITY_UNAVAILABLE')));
        }
    };
};

/** In-memory jobs, isolated per authenticated principal, expired after `ttlMs`. */
export const createJobStore = ({ ttlMs = 24 * 3600_000, now = () => Date.now(), makeError } = {}) => {
    const jobs = new Map();
    const prune = () => {
        const limit = now() - ttlMs;
        for (const [id, job] of jobs) if (job.createdAt < limit) jobs.delete(id);
    };
    return {
        put(job) { prune(); jobs.set(job.jobId, job); return job; },
        owned(principal, jobId) {
            prune();
            const job = jobs.get(String(jobId || ''));
            if (!job || job.principal !== principal) throw makeError('JOB_NOT_FOUND');
            return job;
        }
    };
};
