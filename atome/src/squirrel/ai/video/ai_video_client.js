import { requestProviderService } from '../provider_broker.js';

/**
 * aiVideo — the only video-generation API the UI may call.
 *
 * Speaks the canonical AI Video Service contract (`server/ai_video/`) over the
 * authenticated `ai-provider` socket (web, Tauri and iOS share it). No provider
 * name, key or provider URL ever reaches the frontend: a finished video comes
 * back as a file the server already stored for the user.
 */

const TERMINAL = new Set(['succeeded', 'failed', 'cancelled', 'expired']);

const sleep = (ms, signal) => new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => { clearTimeout(timer); reject(signal.reason || new Error('CANCELLED')); }, { once: true });
});

export const createAiVideoClient = ({ request = requestProviderService } = {}) => {
    const call = (action, payload, options = {}) => request(action, payload, options);
    const client = {
        listProviders: async (options) => (await call('video.providers', {}, options))?.providers || [],
        getCapabilities: (provider, options) => call('video.capabilities', { provider }, options),
        estimate: (canonicalRequest, options) => call('video.estimate', { request: canonicalRequest }, options),
        generate: (canonicalRequest, options) => call('video.generate', { request: canonicalRequest }, options),
        getJob: (jobId, options) => call('video.job', { job_id: jobId }, options),
        cancel: (jobId, options) => call('video.cancel', { job_id: jobId }, options),

        /** Polls with backoff (5 s → 15 s) until terminal; never a tight loop. */
        async waitForJob(jobId, { signal = null, onProgress = null, intervalMs = 5000, maxIntervalMs = 15000, timeoutMs = 20 * 60_000 } = {}) {
            const started = Date.now();
            let delay = intervalMs;
            let job = await client.getJob(jobId, { signal });
            onProgress?.(job);
            while (!TERMINAL.has(job?.status)) {
                if (Date.now() - started > timeoutMs) throw new Error('JOB_TIMEOUT');
                await sleep(delay, signal);
                delay = Math.min(maxIntervalMs, Math.round(delay * 1.5));
                job = await client.getJob(jobId, { signal });
                onProgress?.(job);
            }
            if (job.status !== 'succeeded') {
                const error = new Error(job.error || (job.status === 'cancelled' ? 'CANCELLED' : 'JOB_FAILED'));
                error.job = job;
                throw error;
            }
            return job;
        },

        /** Server stores the output for the user; returns `{ file_name, owner_id, file_path, atome_id, mime, job }`. */
        storeOutput: (jobId, { index = 0, signal = null } = {}) => call('video.output', { job_id: jobId, index }, { signal })
    };
    return client;
};

export const aiVideo = createAiVideoClient();

if (typeof window !== 'undefined' && !window.atomeAiVideo) window.atomeAiVideo = aiVideo;
