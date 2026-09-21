import { randomUUID } from 'node:crypto';
import { readProviderBytes } from '../../atome/src/squirrel/ai/openai_stream.js';
import { createErrorFactory, codeFromHttpStatus, createProviderRegistry, createJobStore } from '../ai_generation/core.js';

/**
 * AI Audio Service — provider-neutral audio generation for atome.
 *
 * `atome → AI Audio Service → provider adapter → MusicGPT / other provider`
 *
 * The UI and the WS contract only ever see the canonical request/response
 * shapes defined here. Every provider-specific name (endpoints, payload
 * fields, status strings) lives in its adapter under `./providers/`.
 *
 * Provider contract:
 *   {
 *     id, label, remote: boolean,
 *     credentialId: string|null,      // server vault entry, null = no key needed
 *     capabilities: { textToMusic, instrumentalGeneration, ... },
 *     validateKey(key, ctx)?          // throws AUTH_ERROR when refused
 *     submit(request, ctx)  -> { providerJobId, model, eta, costEstimate, variants, warnings }
 *     poll(job, ctx)        -> { status, outputs: [{ index, format, url, duration, title }], costActual? }
 *     readOutput?(job, output, ctx) -> { bytes: Uint8Array, mime }   // local providers
 *   }
 * ctx = { key, fetchImpl, signal }
 */

export const AUDIO_AI_ERRORS = Object.freeze([
    'PROVIDER_UNAVAILABLE', 'AUTH_ERROR', 'QUOTA_EXCEEDED', 'PAYMENT_REQUIRED', 'RATE_LIMITED',
    'INVALID_REQUEST', 'CAPABILITY_UNAVAILABLE', 'GENERATION_FAILED', 'TIMEOUT', 'CANCELLED',
    'OUTPUT_UNAVAILABLE', 'NO_PROVIDER_KEY', 'JOB_NOT_FOUND'
]);

export const audioAiError = createErrorFactory(AUDIO_AI_ERRORS, 'GENERATION_FAILED');

/** Maps an upstream HTTP status to a canonical error code. */
export const audioAiErrorFromStatus = (status) => audioAiError(codeFromHttpStatus(status));

const CANONICAL_FIELDS = ['prompt', 'style', 'instrument', 'instrumental', 'vocals', 'lyrics', 'title',
    'duration', 'tempo', 'key', 'referenceAudio', 'referenceMidi', 'stemTargets'];

const text = (value, max) => {
    const out = typeof value === 'string' ? value.trim() : '';
    return max ? out.slice(0, max) : out;
};

/** Canonical request — the only shape the domain accepts. */
export const normalizeAudioAiRequest = (input = {}) => {
    const request = {
        operation: text(input.operation) || 'generate',
        provider: text(input.provider) || 'auto',
        model: text(input.model) || null,
        prompt: text(input.prompt, 1000),
        style: text(input.style, 200) || null,
        instrument: text(input.instrument, 100) || null,
        instrumental: input.instrumental === true,
        vocals: input.vocals === true ? true : input.vocals === false ? false : null,
        lyrics: text(input.lyrics, 4000) || null,
        title: text(input.title, 200) || null,
        duration: Number.isFinite(Number(input.duration)) && Number(input.duration) > 0 ? Math.min(Number(input.duration), 600) : null,
        tempo: Number.isFinite(Number(input.tempo)) && Number(input.tempo) > 0 ? Number(input.tempo) : null,
        key: text(input.key, 20) || null,
        referenceAudio: input.referenceAudio ? true : null,
        referenceMidi: input.referenceMidi ? true : null,
        stemTargets: Array.isArray(input.stemTargets) && input.stemTargets.length ? input.stemTargets.map(String).slice(0, 8) : null,
        output: { preferredFormat: ['wav', 'mp3'].includes(input.output?.preferredFormat) ? input.output.preferredFormat : 'wav' },
        routing: { allowFallback: input.routing?.allowFallback !== false }
    };
    if (request.operation !== 'generate') throw audioAiError('CAPABILITY_UNAVAILABLE', 'operation');
    if (!request.prompt && !request.lyrics) throw audioAiError('INVALID_REQUEST', 'prompt_required');
    return request;
};

/** Capabilities a canonical request actually needs. */
export const requiredCapabilities = (request) => {
    const required = ['textToMusic'];
    if (request.instrumental) required.push('instrumentalGeneration');
    if (request.vocals === true || request.lyrics) required.push('vocalGeneration');
    if (request.referenceMidi) required.push('midiConditioning');
    if (request.referenceAudio) required.push('audioConditioning');
    if (request.stemTargets) required.push('stems');
    return required;
};

export const createAudioAiService = ({ jobTtlMs = 24 * 3600_000, now = () => Date.now() } = {}) => {
    const registry = createProviderRegistry({ makeError: audioAiError, invalidMessage: 'audio_ai_provider_invalid' });
    const jobs = createJobStore({ ttlMs: jobTtlMs, now, makeError: audioAiError });
    const keyFor = registry.keyFor;
    const resolveProvider = (request, readKey) => registry.resolve({ providerId: request.provider, required: requiredCapabilities(request), readKey });

    const publicJob = (job) => ({
        jobId: job.jobId,
        provider: job.provider,
        requestedProvider: job.requestedProvider,
        providerJobId: job.providerJobId,
        model: job.model,
        status: job.status,
        eta: job.eta,
        costEstimate: job.costEstimate,
        costActual: job.costActual ?? null,
        // Provider URLs stay server-side: clients fetch bytes through `audio.output`.
        outputs: job.outputs.map(({ index, format, formats, duration, title }) => ({ type: 'audio', index, format, formats: Object.keys(formats || {}), duration, title })),
        metadata: {
            prompt: job.request.prompt,
            generationParameters: Object.fromEntries(CANONICAL_FIELDS.map(field => [field, job.request[field]]).filter(([, value]) => value !== null && value !== false)),
            variants: job.variants,
            createdAt: new Date(job.createdAt).toISOString(),
            completedAt: job.completedAt ? new Date(job.completedAt).toISOString() : null,
            elapsedMs: (job.completedAt || now()) - job.createdAt
        },
        warnings: job.warnings
    });

    const ownedJob = (principal, jobId) => jobs.owned(principal, jobId);

    return {
        register: registry.register,
        unregister: registry.unregister,
        hasCredentialProvider: (credentialId) => Boolean(registry.providerForCredential(credentialId)),
        providerForCredential: registry.providerForCredential,
        listProviders: ({ readKey } = {}) => registry.list({ readKey }),
        getCapabilities: (id) => registry.describe(id),
        async generate(principal, input, { readKey, fetchImpl, signal }) {
            const request = normalizeAudioAiRequest(input);
            const { provider, key, reason } = await resolveProvider(request, readKey);
            const submitted = await provider.submit(request, { key, fetchImpl, signal });
            const job = {
                jobId: randomUUID(),
                principal,
                provider: provider.id,
                requestedProvider: request.provider,
                providerJobId: submitted.providerJobId || null,
                providerState: submitted.providerState || null,
                model: submitted.model || null,
                status: 'queued',
                eta: Number.isFinite(submitted.eta) ? submitted.eta : null,
                costEstimate: submitted.costEstimate ?? null,
                variants: submitted.variants || [],
                warnings: [...(submitted.warnings || [])],
                outputs: [],
                request,
                createdAt: now(),
                completedAt: null
            };
            job.routingReason = reason;
            jobs.put(job);
            return publicJob(job);
        },
        async getJob(principal, jobId, { readKey, fetchImpl, signal }) {
            const job = ownedJob(principal, jobId);
            if (job.status === 'completed' || job.status === 'failed') return publicJob(job);
            const provider = registry.get(job.provider);
            if (!provider) throw audioAiError('PROVIDER_UNAVAILABLE');
            const key = await keyFor(provider, readKey);
            if (provider.credentialId && !key) throw audioAiError('NO_PROVIDER_KEY');
            const polled = await provider.poll(job, { key, fetchImpl, signal });
            job.status = ['queued', 'running', 'completed', 'failed'].includes(polled.status) ? polled.status : 'running';
            if (Number.isFinite(polled.eta)) job.eta = polled.eta;
            if (polled.costActual != null) job.costActual = polled.costActual;
            if (job.status === 'completed') {
                job.outputs = polled.outputs || [];
                job.completedAt = now();
                if (!job.outputs.length) { job.status = 'failed'; job.error = 'OUTPUT_UNAVAILABLE'; }
            }
            if (job.status === 'failed') job.error = job.error || polled.error || 'GENERATION_FAILED';
            const out = publicJob(job);
            return job.status === 'failed' ? { ...out, error: job.error } : out;
        },
        /** Downloads one output server-side so clients (iOS opaque origin) never fetch provider URLs. */
        async fetchOutput(principal, jobId, index, { readKey, fetchImpl, signal, preferredFormat }) {
            const job = ownedJob(principal, jobId);
            if (job.status !== 'completed') throw audioAiError('OUTPUT_UNAVAILABLE', 'job_not_completed');
            const output = job.outputs.find(item => item.index === Number(index || 0)) || job.outputs[0];
            if (!output) throw audioAiError('OUTPUT_UNAVAILABLE');
            const provider = registry.get(job.provider);
            if (provider?.readOutput) {
                const key = await keyFor(provider, readKey);
                const local = await provider.readOutput(job, output, { key, fetchImpl, signal });
                return { base64: Buffer.from(local.bytes).toString('base64'), mime: local.mime, format: output.format, duration: output.duration };
            }
            const format = preferredFormat || job.request.output.preferredFormat;
            const candidates = [output.formats?.[format], ...Object.values(output.formats || {}), output.url].filter(Boolean);
            for (const url of [...new Set(candidates)]) {
                if (!/^https:\/\//i.test(url)) continue;
                const response = await fetchImpl(url, { method: 'GET', redirect: 'follow', signal });
                if (!response.ok) continue;
                const bytes = Buffer.from(await readProviderBytes(response.body, { signal, maxBytes: 20_000_000 }));
                const mime = response.headers.get('content-type') || (/\.wav(\?|$)/i.test(url) ? 'audio/wav' : 'audio/mpeg');
                const resolvedFormat = /wav/i.test(mime) || /\.wav(\?|$)/i.test(url) ? 'wav' : 'mp3';
                return { base64: bytes.toString('base64'), mime, format: resolvedFormat, duration: output.duration };
            }
            throw audioAiError('OUTPUT_UNAVAILABLE');
        }
    };
};
