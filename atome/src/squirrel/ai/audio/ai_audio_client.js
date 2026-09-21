import { requestProviderService, decodeProviderBytes } from '../provider_broker.js';

/**
 * aiAudio — the only audio-generation API the UI may call.
 *
 * It speaks the canonical AI Audio Service contract (`server/ai_audio/`) over
 * the authenticated `ai-provider` socket, so web, Tauri and iOS share one
 * path and no provider name or key ever reaches the frontend.
 */

const TERMINAL = new Set(['completed', 'failed']);

const sleep = (ms, signal) => new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => { clearTimeout(timer); reject(signal.reason || new Error('CANCELLED')); }, { once: true });
});

export const createAiAudioClient = ({ request = requestProviderService, decode = decodeProviderBytes } = {}) => {
    const call = (action, payload, options = {}) => request(action, payload, options);

    const client = {
        listProviders: async (options) => (await call('audio.providers', {}, options))?.providers || [],
        getCapabilities: (provider, options) => call('audio.capabilities', { provider }, options),
        generate: (canonicalRequest, options) => call('audio.generate', { request: canonicalRequest }, options),
        getJob: (jobId, options) => call('audio.job', { job_id: jobId }, options),

        /** Polls until the job is terminal. `onProgress(job)` receives every snapshot. */
        async waitForJob(jobId, { signal = null, onProgress = null, intervalMs = 4000, timeoutMs = 10 * 60_000 } = {}) {
            const started = Date.now();
            let job = await client.getJob(jobId, { signal });
            onProgress?.(job);
            while (!TERMINAL.has(job?.status)) {
                if (Date.now() - started > timeoutMs) throw new Error('TIMEOUT');
                // Respect the provider ETA for the first wait, then poll steadily.
                const eta = Number(job?.eta) > 0 && Date.now() - started < 1000 ? Math.min(job.eta * 1000, 30_000) : intervalMs;
                await sleep(Math.max(1000, eta), signal);
                job = await client.getJob(jobId, { signal });
                onProgress?.(job);
            }
            if (job.status === 'failed') {
                const error = new Error(job.error || 'GENERATION_FAILED');
                error.job = job;
                throw error;
            }
            return job;
        },

        /** Bytes of one output, fetched server-side (no provider URL reaches the client). */
        async fetchOutput(jobId, { index = 0, format = null, signal = null } = {}) {
            const data = await call('audio.output', { job_id: jobId, index, ...(format ? { format } : {}) }, { signal });
            return { bytes: decode(data.base64), mime: data.mime || 'audio/wav', format: data.format || 'wav', duration: data.duration ?? null };
        }
    };
    return client;
};

export const aiAudio = createAiAudioClient();

if (typeof window !== 'undefined' && !window.atomeAiAudio) window.atomeAiAudio = aiAudio;
