import { audioAiError, audioAiErrorFromStatus } from '../service.js';

/**
 * MusicGPT adapter — the only module that knows MusicGPT names.
 *
 * Validated against docs.musicgpt.com (sept. 2026):
 *   POST {base}/{version}/MusicAI     → task_id, conversion_id_1/2, eta, [credit_estimate]
 *   GET  {base}/{version}/byId?conversionType=MUSIC_AI&task_id=…
 *        → { conversion: { status: IN_QUEUE|COMPLETED|ERROR|FAILED,
 *                          conversion_path_N (mp3), conversion_path_wav_N,
 *                          conversion_duration_N, title_N, conversion_cost } }
 *   Header `Authorization: <api key>` (apiKey scheme, no Bearer prefix).
 *
 * v1 is flagged deprecated by MusicGPT and v2 may require an Enterprise plan,
 * so base URL, version and model stay configuration, never domain.
 */

export const MUSICGPT_CAPABILITIES = Object.freeze({
    textToMusic: true,
    instrumentalGeneration: true,
    vocalGeneration: true,
    asyncJobs: true,
    // Not wired to a validated endpoint yet — never claim them.
    webhooks: false,
    durationControl: false,
    stems: false,
    audioToMidi: false,
    midiConditioning: false,
    audioConditioning: false,
    extend: false,
    remix: false,
    inpaint: false
});

const readConfig = (env = process.env) => ({
    baseUrl: String(env.MUSICGPT_API_BASE || 'https://api.musicgpt.com/api/public').replace(/\/+$/, ''),
    version: /^v\d+$/.test(env.MUSICGPT_API_VERSION || '') ? env.MUSICGPT_API_VERSION : 'v1',
    model: env.MUSICGPT_MODEL || null
});

/** Canonical request → MusicGPT payload. Unsupported canonical fields become warnings. */
export const toMusicGPTPayload = (request, config = readConfig()) => {
    const warnings = [];
    const styleParts = [request.style, request.instrument].filter(Boolean);
    const payload = {
        prompt: request.prompt || undefined,
        music_style: styleParts.length ? styleParts.join(', ') : undefined,
        lyrics: request.lyrics || undefined,
        title: request.title || undefined,
        make_instrumental: request.instrumental === true,
        generate_album_cover: false
    };
    if (request.vocals === true && !request.lyrics) payload.make_instrumental = false;
    if (config.version !== 'v1' && (request.model || config.model)) payload.model = request.model || config.model;
    if (request.duration != null) warnings.push({ field: 'duration', code: 'CAPABILITY_UNAVAILABLE', message: 'duration is not controllable on this provider' });
    if (request.tempo != null) warnings.push({ field: 'tempo', code: 'IGNORED', message: 'tempo is only conveyed through the prompt' });
    if (request.key) warnings.push({ field: 'key', code: 'IGNORED', message: 'key is only conveyed through the prompt' });
    Object.keys(payload).forEach(field => payload[field] === undefined && delete payload[field]);
    return { payload, warnings };
};

const STATUS = { IN_QUEUE: 'queued', QUEUED: 'queued', PENDING: 'queued', PROCESSING: 'running', IN_PROGRESS: 'running',
    COMPLETED: 'completed', ERROR: 'failed', FAILED: 'failed' };

/** MusicGPT conversion record → canonical outputs. */
export const fromMusicGPTConversion = (conversion = {}) => {
    const outputs = [];
    for (const n of [1, 2]) {
        const mp3 = conversion[`conversion_path_${n}`];
        const wav = conversion[`conversion_path_wav_${n}`];
        if (!mp3 && !wav) continue;
        outputs.push({
            index: n - 1,
            format: wav ? 'wav' : 'mp3',
            formats: { ...(wav ? { wav } : {}), ...(mp3 ? { mp3 } : {}) },
            url: wav || mp3,
            duration: Number(conversion[`conversion_duration_${n}`]) || null,
            title: conversion[`title_${n}`] || null
        });
    }
    if (!outputs.length && conversion.audio_url) {
        outputs.push({ index: 0, format: /\.wav(\?|$)/i.test(conversion.audio_url) ? 'wav' : 'mp3', formats: {},
            url: conversion.audio_url, duration: Number(conversion.conversion_duration) || null, title: conversion.title || null });
    }
    return {
        status: STATUS[String(conversion.status || '').toUpperCase()] || 'running',
        outputs,
        costActual: conversion.conversion_cost ?? null
    };
};

export const createMusicGptProvider = ({ env = process.env } = {}) => {
    const config = readConfig(env);
    const url = (path) => `${config.baseUrl}/${config.version}/${path}`;
    const call = async (path, { key, fetchImpl, signal, method = 'GET', body } = {}) => {
        let response;
        try {
            response = await fetchImpl(url(path), {
                method, redirect: 'error', signal,
                headers: { Authorization: key, ...(body ? { 'Content-Type': 'application/json' } : {}) },
                ...(body ? { body: JSON.stringify(body) } : {})
            });
        } catch (error) {
            if (signal?.aborted) throw error;
            throw audioAiError('PROVIDER_UNAVAILABLE');
        }
        // Provider messages are never forwarded: they may echo request data.
        if (!response.ok) throw audioAiErrorFromStatus(response.status);
        return response.json().catch(() => { throw audioAiError('GENERATION_FAILED', 'invalid_json'); });
    };

    return {
        id: 'musicgpt',
        label: 'MusicGPT',
        remote: true,
        credentialId: 'musicgpt',
        capabilities: MUSICGPT_CAPABILITIES,
        config,
        /** A lookup of an unknown task is 4xx for a valid key and 401/403 for a refused one. */
        async validateKey(key, { fetchImpl, signal }) {
            try {
                await call('byId?conversionType=MUSIC_AI&task_id=00000000-0000-0000-0000-000000000000', { key, fetchImpl, signal });
            } catch (error) {
                if (error.message === 'AUTH_ERROR' || error.message === 'PROVIDER_UNAVAILABLE') throw error;
            }
        },
        async submit(request, { key, fetchImpl, signal }) {
            const { payload, warnings } = toMusicGPTPayload(request, config);
            const data = await call('MusicAI', { key, fetchImpl, signal, method: 'POST', body: payload });
            if (data?.success === false || !data?.task_id) throw audioAiError('GENERATION_FAILED');
            return {
                providerJobId: data.task_id,
                model: payload.model || `musicai-${config.version}`,
                eta: Number(data.eta) || null,
                costEstimate: data.credit_estimate != null ? { amount: Number(data.credit_estimate), unit: 'credits' } : null,
                variants: [data.conversion_id_1, data.conversion_id_2].filter(Boolean),
                warnings: [...warnings, ...(data.is_flagged ? [{ code: 'FLAGGED', message: 'prompt flagged by provider' }] : [])]
            };
        },
        async poll(job, { key, fetchImpl, signal }) {
            const data = await call(`byId?conversionType=MUSIC_AI&task_id=${encodeURIComponent(job.providerJobId)}`, { key, fetchImpl, signal });
            const result = fromMusicGPTConversion(data?.conversion || data || {});
            return {
                ...result,
                costActual: result.costActual != null ? { amount: Number(result.costActual), unit: 'credits' } : null,
                error: result.status === 'failed' ? 'GENERATION_FAILED' : null
            };
        }
    };
};
