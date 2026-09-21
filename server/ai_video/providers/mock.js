import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Mock video provider — proves Runway can be replaced without any UI change.
 * Registered only when `ATOME_AI_VIDEO_MOCK=1`; returns a bundled demo mp4.
 */
const DEMO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../atome/src/assets/videos/superman.mp4');

export const createMockVideoProvider = ({ pollsUntilDone = 1, file = DEMO } = {}) => ({
    id: 'mock',
    label: 'Mock video',
    remote: false,
    credentialId: null,
    capabilities: Object.freeze({ textToVideo: true, imageToVideo: true, asyncJobs: true, polling: true, costEstimate: true, cancel: true }),
    estimate: (request) => ({ model: 'mock-demo', credits: 0, costUsd: 0, unit: 'credits_per_second', pricingVersion: 'mock' }),
    async submit(request) {
        return { providerJobId: `mock-${Date.now()}`, model: 'mock-demo', effective: { duration: request.duration, ratio: request.aspectRatio }, warnings: [] };
    },
    async poll(job) {
        job.providerState = (job.providerState || 0) + 1;
        if (job.providerState < pollsUntilDone) return { status: 'running', progress: 0.5, outputs: [] };
        return { status: 'succeeded', outputs: [{ index: 0, url: null, format: 'mp4' }], costActualUsd: 0 };
    },
    async cancel() {},
    async readOutput() {
        return { bytes: await fs.readFile(file), mime: 'video/mp4' };
    }
});
