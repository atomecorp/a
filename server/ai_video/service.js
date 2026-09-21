import { randomUUID } from 'node:crypto';
import { readProviderBytes } from '../../atome/src/squirrel/ai/openai_stream.js';
import { createErrorFactory, codeFromHttpStatus, createProviderRegistry, createJobStore } from '../ai_generation/core.js';

/**
 * AI Video Service — provider-neutral video generation for atome.
 *
 * `atome → AI Video Service → Capability Registry → Provider Router → adapter → Runway / …`
 *
 * The UI and the WS contract only see the canonical request/job defined here.
 * Provider names (endpoints, payload fields, statuses, pricing) live in the
 * adapters under `./providers/`.
 *
 * Provider contract:
 *   {
 *     id, label, remote, credentialId, capabilities, models?,
 *     validateKey?(key, ctx)
 *     estimate(request) -> { model, costUsd, credits, unit, pricingVersion }
 *     submit(request, ctx) -> { providerJobId, model, costEstimate, warnings }
 *     poll(job, ctx) -> { status, progress?, outputs: [{ index, url, format }], costActualUsd?, error? }
 *     cancel?(job, ctx)
 *     readOutput?(job, output, ctx) -> { bytes, mime }        // local providers
 *   }
 * ctx = { key, fetchImpl, signal }
 */

export const VIDEO_AI_ERRORS = Object.freeze([
    'AUTH_ERROR', 'QUOTA_EXCEEDED', 'PAYMENT_REQUIRED', 'RATE_LIMITED', 'INVALID_REQUEST', 'UNSUPPORTED_CAPABILITY',
    'UNSUPPORTED_MODEL', 'CONTENT_REJECTED', 'PROVIDER_UNAVAILABLE', 'JOB_TIMEOUT', 'JOB_FAILED', 'DOWNLOAD_FAILED',
    'COST_LIMIT_EXCEEDED', 'UNKNOWN_PROVIDER_ERROR', 'NO_PROVIDER_KEY', 'JOB_NOT_FOUND', 'CANCELLED'
]);
export const videoAiError = createErrorFactory(VIDEO_AI_ERRORS, 'UNKNOWN_PROVIDER_ERROR');
export const videoAiErrorFromStatus = (status) => videoAiError(codeFromHttpStatus(status, { payment: 'PAYMENT_REQUIRED', failed: 'UNKNOWN_PROVIDER_ERROR' }));

const ASPECT_RATIOS = ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9'];
const MAX_IMAGE_DATA_URI = 5_000_000;
const MAX_VIDEO_BYTES = 200_000_000;
const text = (value, max) => (typeof value === 'string' ? value.trim().slice(0, max || undefined) : '');
const finite = (value) => (Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : null);

/** Canonical request — the only shape the domain accepts. */
export const normalizeVideoAiRequest = (input = {}) => {
    const image = input.source?.image || null;
    const request = {
        operation: text(input.operation) || 'generate',
        provider: text(input.provider) || 'auto',
        model: text(input.model) || null,
        prompt: text(input.prompt, 1000),
        negativePrompt: text(input.negativePrompt, 1000) || null,
        duration: finite(input.duration) ? Math.min(finite(input.duration), 60) : 5,
        aspectRatio: ASPECT_RATIOS.includes(input.aspectRatio) ? input.aspectRatio : '16:9',
        resolution: text(input.resolution, 20) || null,
        fps: finite(input.fps),
        source: {
            image: image ? {
                dataUri: typeof image.dataUri === 'string' && /^data:image\/(png|jpeg|webp);base64,/.test(image.dataUri) ? image.dataUri : null,
                atomeId: text(image.atomeId, 200) || null
            } : null,
            video: input.source?.video ? true : null,
            audio: input.source?.audio ? true : null
        },
        controls: { seed: Number.isInteger(input.controls?.seed) ? input.controls.seed : null },
        routing: {
            priority: ['quality', 'cost', 'latency'].includes(input.routing?.priority) ? input.routing.priority : 'quality',
            maxCostUsd: finite(input.routing?.maxCostUsd)
        },
        providerOptions: input.providerOptions && typeof input.providerOptions === 'object' ? input.providerOptions : {}
    };
    if (request.source.image && !request.source.image.dataUri) throw videoAiError('INVALID_REQUEST', 'image_data_uri_required');
    if (request.source.image?.dataUri.length > MAX_IMAGE_DATA_URI) throw videoAiError('INVALID_REQUEST', 'image_too_large');
    if (request.operation !== 'generate') throw videoAiError('UNSUPPORTED_CAPABILITY', 'operation');
    if (!request.prompt && !request.source.image) throw videoAiError('INVALID_REQUEST', 'prompt_required');
    return request;
};

export const requiredVideoCapabilities = (request) => {
    const required = [request.source.image ? 'imageToVideo' : 'textToVideo'];
    if (request.source.video) required.push('videoToVideo');
    if (request.source.audio) required.push('audioConditioning');
    return required;
};

export const createVideoAiService = ({ jobTtlMs = 24 * 3600_000, now = () => Date.now(), storeOutput = null } = {}) => {
    const registry = createProviderRegistry({ makeError: videoAiError, invalidMessage: 'video_ai_provider_invalid',
        codes: { capability: 'UNSUPPORTED_CAPABILITY' } });
    const jobs = createJobStore({ ttlMs: jobTtlMs, now, makeError: videoAiError });

    const route = (request, readKey) => registry.resolve({
        providerId: request.provider,
        required: requiredVideoCapabilities(request),
        readKey,
        // Budget is a routing constraint: a provider over `maxCostUsd` is skipped under `auto`.
        accept: (provider) => {
            const estimate = provider.estimate?.(request);
            return request.routing.maxCostUsd != null && estimate?.costUsd != null && estimate.costUsd > request.routing.maxCostUsd
                ? 'COST_LIMIT_EXCEEDED' : null;
        }
    });

    const publicJob = (job) => ({
        jobId: job.jobId,
        provider: job.provider,
        requestedProvider: job.request.provider,
        providerJobId: job.providerJobId,
        model: job.model,
        operation: job.request.source.image ? 'imageToVideo' : 'textToVideo',
        status: job.status,
        progress: job.progress ?? null,
        createdAt: new Date(job.createdAt).toISOString(),
        startedAt: job.startedAt ? new Date(job.startedAt).toISOString() : null,
        completedAt: job.completedAt ? new Date(job.completedAt).toISOString() : null,
        estimatedCostUsd: job.estimate?.costUsd ?? null,
        actualCostUsd: job.actualCostUsd ?? null,
        pricingVersion: job.estimate?.pricingVersion ?? null,
        latencyMs: job.completedAt ? job.completedAt - job.createdAt : null,
        error: job.error || null,
        routingReason: job.routingReason,
        // Provider URLs stay server-side: clients receive a stored atome file via `video.output`.
        outputAssets: job.outputs.map(({ index, format }) => ({ type: 'video', index, format })),
        parameters: {
            prompt: job.request.prompt,
            negativePrompt: job.request.negativePrompt,
            duration: job.effective?.duration ?? job.request.duration,
            aspectRatio: job.request.aspectRatio,
            ratio: job.effective?.ratio ?? null,
            resolution: job.request.resolution,
            seed: job.request.controls.seed,
            sourceImageAtomeId: job.request.source.image?.atomeId || null
        },
        warnings: job.warnings
    });

    const readyProvider = async (job, readKey) => {
        const provider = registry.get(job.provider);
        if (!provider) throw videoAiError('PROVIDER_UNAVAILABLE');
        const key = await registry.keyFor(provider, readKey);
        if (provider.credentialId && !key) throw videoAiError('NO_PROVIDER_KEY');
        return { provider, key };
    };

    return {
        register: registry.register,
        unregister: registry.unregister,
        providerForCredential: registry.providerForCredential,
        listProviders: ({ readKey } = {}) => registry.list({ readKey }),
        getCapabilities: (id) => registry.describe(id),

        /** Cost before generation: provider, model, unit, USD. */
        async estimate(input, { readKey }) {
            const request = normalizeVideoAiRequest(input);
            const { provider, reason } = await route(request, readKey);
            return { provider: provider.id, routingReason: reason, ...provider.estimate(request) };
        },

        async generate(principal, input, { readKey, fetchImpl, signal }) {
            const request = normalizeVideoAiRequest(input);
            const { provider, key, reason } = await route(request, readKey);
            const estimate = provider.estimate?.(request) || null;
            const submitted = await provider.submit(request, { key, fetchImpl, signal });
            const job = jobs.put({
                jobId: randomUUID(), principal, provider: provider.id, request,
                providerJobId: submitted.providerJobId || null, model: submitted.model || estimate?.model || null,
                effective: submitted.effective || null, status: 'queued', progress: null, estimate,
                warnings: [...(submitted.warnings || [])], outputs: [], routingReason: reason,
                createdAt: now(), startedAt: null, completedAt: null
            });
            return publicJob(job);
        },

        async getJob(principal, jobId, { readKey, fetchImpl, signal }) {
            const job = jobs.owned(principal, jobId);
            if (['succeeded', 'failed', 'cancelled', 'expired'].includes(job.status)) return publicJob(job);
            const { provider, key } = await readyProvider(job, readKey);
            const polled = await provider.poll(job, { key, fetchImpl, signal });
            const status = ['queued', 'running', 'succeeded', 'failed', 'cancelled'].includes(polled.status) ? polled.status : 'running';
            if (status === 'running' && !job.startedAt) job.startedAt = now();
            job.status = status;
            if (Number.isFinite(polled.progress)) job.progress = polled.progress;
            if (polled.costActualUsd != null) job.actualCostUsd = polled.costActualUsd;
            if (status === 'succeeded') {
                job.outputs = polled.outputs || [];
                job.completedAt = now();
                if (!job.outputs.length) { job.status = 'failed'; job.error = 'DOWNLOAD_FAILED'; }
            }
            if (status === 'failed' || status === 'cancelled') {
                job.completedAt = now();
                job.error = status === 'cancelled' ? 'CANCELLED' : (VIDEO_AI_ERRORS.includes(polled.error) ? polled.error : 'JOB_FAILED');
            }
            return publicJob(job);
        },

        async cancel(principal, jobId, { readKey, fetchImpl, signal }) {
            const job = jobs.owned(principal, jobId);
            if (['succeeded', 'failed', 'cancelled'].includes(job.status)) return publicJob(job);
            const { provider, key } = await readyProvider(job, readKey);
            if (typeof provider.cancel !== 'function' || provider.capabilities?.cancel !== true) throw videoAiError('UNSUPPORTED_CAPABILITY', 'cancel');
            await provider.cancel(job, { key, fetchImpl, signal });
            job.status = 'cancelled'; job.error = 'CANCELLED'; job.completedAt = now();
            return publicJob(job);
        },

        /**
         * Downloads the (temporary) provider output and stores it as a file of the
         * principal — the client receives a file reference, never bytes nor provider URLs.
         */
        async storeOutput(principal, jobId, index, { readKey, fetchImpl, signal }) {
            const job = jobs.owned(principal, jobId);
            if (job.status !== 'succeeded') throw videoAiError('DOWNLOAD_FAILED', 'job_not_succeeded');
            if (job.stored?.[index]) return job.stored[index];
            const output = job.outputs.find(item => item.index === Number(index || 0)) || job.outputs[0];
            if (!output) throw videoAiError('DOWNLOAD_FAILED');
            const { provider, key } = await readyProvider(job, readKey);
            let bytes; let mime;
            if (provider.readOutput) {
                ({ bytes, mime } = await provider.readOutput(job, output, { key, fetchImpl, signal }));
            } else {
                if (!/^https:\/\//i.test(output.url || '')) throw videoAiError('DOWNLOAD_FAILED');
                let response;
                try { response = await fetchImpl(output.url, { method: 'GET', redirect: 'follow', signal }); }
                catch (error) { if (signal?.aborted) throw error; throw videoAiError('DOWNLOAD_FAILED'); }
                if (!response.ok) throw videoAiError('DOWNLOAD_FAILED');
                bytes = await readProviderBytes(response.body, { signal, maxBytes: MAX_VIDEO_BYTES });
                mime = response.headers.get('content-type') || 'video/mp4';
            }
            if (typeof storeOutput !== 'function') throw videoAiError('DOWNLOAD_FAILED', 'store_unavailable');
            const extension = /webm/i.test(mime) ? '.webm' : /quicktime/i.test(mime) ? '.mov' : '.mp4';
            const slug = (job.request.prompt || 'video_ai').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
                .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'video_ai';
            const stored = await storeOutput({ principal, bytes: Buffer.from(bytes), mime, fileName: `${slug}${extension}` });
            job.stored = { ...(job.stored || {}), [index]: { ...stored, mime, job: publicJob(job) } };
            return job.stored[index];
        }
    };
};
