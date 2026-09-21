import { videoAiError, videoAiErrorFromStatus } from '../service.js';
import { estimateRunwayCost, RUNWAY_PRICING } from './runway_pricing.js';

/**
 * Runway adapter — the only module that knows Runway names.
 *
 * Validated against docs.dev.runwayml.com (2026-09-21):
 *   base https://api.dev.runwayml.com, `Authorization: Bearer <key>`, `X-Runway-Version: 2024-11-06`
 *   POST /v1/text_to_video   { model, promptText, ratio, duration, seed? }          → { id }
 *   POST /v1/image_to_video  { model, promptImage, promptText?, ratio, duration, seed? } → { id }
 *   GET  /v1/tasks/{id}      → { status: PENDING|THROTTLED|RUNNING|SUCCEEDED|FAILED|CANCELLED,
 *                                output: [url] (temporary), failure, failureCode, progress? }
 *   DELETE /v1/tasks/{id}    cancel
 *   GET  /v1/organization    → { creditBalance }   (used to validate a key)
 */

const readConfig = (env = process.env) => ({
    baseUrl: String(env.RUNWAY_API_BASE || 'https://api.dev.runwayml.com').replace(/\/+$/, ''),
    version: env.RUNWAY_API_VERSION || '2024-11-06',
    textModel: env.RUNWAY_TEXT_MODEL || 'gen4.5',
    imageModel: env.RUNWAY_IMAGE_MODEL || 'gen4_turbo'
});

// Canonical aspect ratio → Runway `ratio`, per model and operation (only documented values).
const RATIO = { '16:9': '1280:720', '9:16': '720:1280', '1:1': '960:960', '4:3': '1104:832', '3:4': '832:1104', '21:9': '1584:672' };
const MODEL_LIMITS = Object.freeze({
    'gen4.5': { text: ['1280:720', '720:1280'], image: ['1280:720', '720:1280', '1104:832', '960:960', '832:1104', '1584:672'], durations: [2, 10] },
    gen4_turbo: { text: null, image: ['1280:720', '720:1280', '1104:832', '832:1104', '960:960', '1584:672'], durations: [2, 10] }
});

export const RUNWAY_CAPABILITIES = Object.freeze({
    textToVideo: true,
    imageToVideo: true,
    asyncJobs: true,
    polling: true,
    costEstimate: true,
    cancel: true,
    // Not wired to a validated endpoint in this adapter — never claimed.
    videoToVideo: false, referenceImage: false, referenceVideo: false, firstFrame: false, lastFrame: false,
    keyframes: false, cameraControl: false, audioConditioning: false, nativeAudio: false, extend: false,
    edit: false, inpaint: false, outpaint: false, upscale: false, frameRateEnhancement: false,
    alphaOutput: false, nativeSemanticLayers: false, webhooks: false
});

const pickModel = (request, config) => {
    const wanted = request.model || request.providerOptions?.runway?.model;
    const image = Boolean(request.source.image);
    const model = wanted || (image ? config.imageModel : config.textModel);
    const limits = MODEL_LIMITS[model];
    if (!limits || !(image ? limits.image : limits.text)) throw videoAiError('UNSUPPORTED_MODEL');
    return { model, limits, image };
};

/** Canonical request → Runway payload. Every adjusted or ignored field becomes a warning. */
export const toRunwayPayload = (request, config = readConfig()) => {
    const { model, limits, image } = pickModel(request, config);
    const warnings = [];
    const allowed = image ? limits.image : limits.text;
    let ratio = RATIO[request.aspectRatio];
    if (!allowed.includes(ratio)) {
        const fallback = request.aspectRatio === '9:16' || request.aspectRatio === '3:4' ? '720:1280' : '1280:720';
        warnings.push({ field: 'aspectRatio', code: 'ADJUSTED', message: `${request.aspectRatio} unavailable for ${model}` });
        ratio = allowed.includes(fallback) ? fallback : allowed[0];
    }
    const [min, max] = limits.durations;
    const duration = Math.max(min, Math.min(max, Math.round(request.duration)));
    if (duration !== request.duration) warnings.push({ field: 'duration', code: 'ADJUSTED', message: `clamped to ${duration}s` });
    if (request.resolution) warnings.push({ field: 'resolution', code: 'IGNORED', message: 'resolution follows the ratio on this provider' });
    if (request.fps) warnings.push({ field: 'fps', code: 'IGNORED' });
    if (request.negativePrompt) warnings.push({ field: 'negativePrompt', code: 'IGNORED' });
    const payload = {
        model,
        ...(request.prompt ? { promptText: request.prompt } : {}),
        ...(image ? { promptImage: request.source.image.dataUri } : {}),
        ratio,
        duration,
        ...(request.controls.seed != null ? { seed: request.controls.seed } : {})
    };
    return { payload, warnings, path: image ? 'image_to_video' : 'text_to_video', effective: { duration, ratio } };
};

const STATUS = { PENDING: 'queued', THROTTLED: 'queued', RUNNING: 'running', SUCCEEDED: 'succeeded', FAILED: 'failed', CANCELLED: 'cancelled' };

/** Runway task → canonical poll result. Moderation failures surface as CONTENT_REJECTED. */
export const fromRunwayTask = (task = {}) => {
    const status = STATUS[String(task.status || '').toUpperCase()] || 'running';
    const failure = `${task.failureCode || ''} ${task.failure || ''}`;
    return {
        status,
        progress: Number.isFinite(Number(task.progress)) ? Number(task.progress) : null,
        outputs: status === 'succeeded' ? (task.output || []).map((url, index) => ({ index, url, format: /\.webm(\?|$)/i.test(url) ? 'webm' : 'mp4' })) : [],
        error: status === 'failed' ? (/SAFETY|MODERATION|CONTENT/i.test(failure) ? 'CONTENT_REJECTED' : 'JOB_FAILED') : null
    };
};

export const createRunwayProvider = ({ env = process.env } = {}) => {
    const config = readConfig(env);
    const call = async (path, { key, fetchImpl, signal, method = 'GET', body } = {}) => {
        let response;
        try {
            response = await fetchImpl(`${config.baseUrl}${path}`, {
                method, redirect: 'error', signal,
                headers: { Authorization: `Bearer ${key}`, 'X-Runway-Version': config.version, ...(body ? { 'Content-Type': 'application/json' } : {}) },
                ...(body ? { body: JSON.stringify(body) } : {})
            });
        } catch (error) {
            if (signal?.aborted) throw error;
            throw videoAiError('PROVIDER_UNAVAILABLE');
        }
        // Provider messages are never forwarded (they may echo request data).
        if (!response.ok) throw videoAiErrorFromStatus(response.status);
        if (response.status === 204) return {};
        return response.json().catch(() => ({}));
    };

    return {
        id: 'runway',
        label: 'Runway',
        remote: true,
        credentialId: 'runway',
        capabilities: RUNWAY_CAPABILITIES,
        models: { textToVideo: config.textModel, imageToVideo: config.imageModel, pricingVersion: RUNWAY_PRICING.version },
        config,
        async validateKey(key, { fetchImpl, signal }) {
            await call('/v1/organization', { key, fetchImpl, signal });
        },
        estimate(request) {
            const { model } = pickModel(request, config);
            const { effective } = toRunwayPayload(request, config);
            return estimateRunwayCost({ model, duration: effective.duration });
        },
        async submit(request, { key, fetchImpl, signal }) {
            const { payload, warnings, path, effective } = toRunwayPayload(request, config);
            const data = await call(`/v1/${path}`, { key, fetchImpl, signal, method: 'POST', body: payload });
            if (!data?.id) throw videoAiError('UNKNOWN_PROVIDER_ERROR');
            return { providerJobId: data.id, model: payload.model, effective, warnings };
        },
        async poll(job, { key, fetchImpl, signal }) {
            const task = await call(`/v1/tasks/${encodeURIComponent(job.providerJobId)}`, { key, fetchImpl, signal });
            const result = fromRunwayTask(task);
            const credits = Number(task?.estimatedCost?.credits);
            return { ...result, ...(result.status === 'succeeded' && Number.isFinite(credits) ? { costActualUsd: Math.round(credits * RUNWAY_PRICING.usdPerCredit * 100) / 100 } : {}) };
        },
        async cancel(job, { key, fetchImpl, signal }) {
            await call(`/v1/tasks/${encodeURIComponent(job.providerJobId)}`, { key, fetchImpl, signal, method: 'DELETE' });
        }
    };
};
