import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { SOCIAL_TERMINAL_STATUSES, normalizeSocialError } from '../../atome/src/squirrel/social/contracts.js';
import { revokePublicMedia } from './social_media.js';
import { SocialError } from './social_http.js';

// Sharing jobs of one principal, persisted under that principal's own vault
// directory so a reload or a server restart never forgets what was already
// sent. A job holds one independent delivery per destination.
const JOB_ID = /^[a-f0-9]{32}$/;
const RETRYABLE = new Set(['failed', 'cancelled']);
const OPEN_STATUSES = new Set(['ready', 'transferring', 'remote_processing', 'unconfirmed', 'failed']);
const STALE_MS = 24 * 60 * 60 * 1000;
const running = new Map();
// Jobs with a delivery in flight are shared in memory, so two concurrent
// requests on the same job (two destinations, a double click, a status read)
// mutate and persist one object instead of overwriting each other's copy.
const live = new Map();

export const newJobId = () => randomBytes(16).toString('hex');
export const jobTempDir = (root, jobId) => path.join(root, 'tmp', jobId);

export function createSocialJobStore(root) {
    const file = (id) => {
        if (!JOB_ID.test(String(id || ''))) throw new SocialError('social_job_not_found');
        return path.join(root, 'jobs', `${id}.json`);
    };
    return {
        root,
        async read(id) {
            const shared = live.get(file(id));
            if (shared) return shared.job;
            try { return JSON.parse(await readFile(file(id), 'utf8')); }
            catch (error) { if (error.code === 'ENOENT') throw new SocialError('social_job_not_found'); throw error; }
        },
        hold(job) {
            const key = file(job.id);
            const entry = live.get(key) || { job, holders: 0 };
            entry.holders += 1;
            live.set(key, entry);
            return () => { entry.holders -= 1; if (entry.holders <= 0) live.delete(key); };
        },
        // Read-then-hold without a window: a copy read from disk while another
        // request already shares the job is dropped in favour of the shared one.
        async acquire(id) {
            const loaded = await this.read(id);
            const job = live.get(file(id))?.job || loaded;
            return { job, release: this.hold(job) };
        },
        async write(job) {
            await mkdir(path.join(root, 'jobs'), { recursive: true, mode: 0o700 });
            const target = file(job.id);
            const temporary = `${target}.${randomBytes(6).toString('hex')}`;
            job.updated_at = Date.now();
            await writeFile(temporary, JSON.stringify(job), { mode: 0o600 });
            await rename(temporary, target);
            return job;
        },
        // Temporary variants live until every delivery is settled: a failed one
        // may still be retried with the very same prepared file.
        async releaseIfSettled(job, { force = false } = {}) {
            const settled = Object.values(job.deliveries).every((delivery) => !OPEN_STATUSES.has(delivery.status));
            if (!settled && !force) return false;
            revokePublicMedia(job.id);
            await rm(jobTempDir(root, job.id), { recursive: true, force: true });
            job.variants_released = true;
            return true;
        },
        // Variants of jobs left unsettled for a day are dropped; their deliveries
        // keep their state but a retry then prepares the asset again.
        async pruneStale(now = Date.now()) {
            const entries = await readdir(path.join(root, 'tmp')).catch((error) => {
                if (error.code === 'ENOENT') return [];
                throw error;
            });
            for (const id of entries) {
                const info = await stat(jobTempDir(root, id)).catch(() => null);
                if (info && now - info.mtimeMs > STALE_MS) await rm(jobTempDir(root, id), { recursive: true, force: true });
            }
        }
    };
}

const runKey = (principal, jobId, destination) => `${principal}\u0000${jobId}\u0000${destination}`;
export const isDeliveryRunning = (principal, jobId, destination) => running.has(runKey(principal, jobId, destination));

// Resolves once the aborted run has recorded its final state.
export async function cancelDeliveryRun(principal, jobId, destination) {
    const entry = running.get(runKey(principal, jobId, destination));
    if (!entry) return false;
    entry.controller.abort();
    await entry.done;
    return true;
}

// Exclusive access to one delivery for work outside `runDelivery` (a status
// refresh that may finish a publication). Null when the delivery is busy.
export function lockDelivery(principal, jobId, destination) {
    const key = runKey(principal, jobId, destination);
    if (running.has(key)) return null;
    let finish;
    running.set(key, { controller: new AbortController(), done: new Promise((resolve) => { finish = resolve; }) });
    return () => { running.delete(key); finish(); };
}

// A destination is sent at most once: published, handed off, still running or
// unconfirmed deliveries are returned as they are. Only a delivery the provider
// demonstrably did not take (failed/cancelled) may be sent again.
export const canSendDelivery = (delivery) => delivery.route != null && (delivery.status === 'ready' || RETRYABLE.has(delivery.status));

export async function runDelivery({ store, job, delivery, principal, execute }) {
    const key = runKey(principal, job.id, delivery.destination);
    if (running.has(key) || !canSendDelivery(delivery)) return delivery;
    const controller = new AbortController();
    let finish;
    running.set(key, { controller, done: new Promise((resolve) => { finish = resolve; }) });
    const release = store.hold(job);
    const save = async (patch) => { Object.assign(delivery, patch, { updated_at: Date.now() }); await store.write(job); };
    try {
        await save({ status: 'transferring', error: null, provider_code: null, attempts: (delivery.attempts || 0) + 1, stage: 'transfer' });
        const result = await execute({
            signal: controller.signal,
            accepted: (remote) => save({ remote: { ...(delivery.remote || {}), ...remote } }),
            publishing: (remote) => save({ stage: 'publishing', remote: { ...(delivery.remote || {}), ...remote } }),
            progress: (ratio) => { delivery.progress = Math.max(0, Math.min(1, Number(ratio) || 0)); }
        });
        await save({ status: result.status, remote: { ...(delivery.remote || {}), ...(result.remote || {}) },
            url: result.url || delivery.url || null, error: result.error ? normalizeSocialError(result.error) : null,
            provider_code: result.provider_code || null,
            stage: result.status === 'remote_processing' ? 'remote' : SOCIAL_TERMINAL_STATUSES.includes(result.status) ? 'done' : delivery.stage });
    } catch (error) {
        const code = error instanceof SocialError ? error.code : 'social_provider_unavailable';
        const aborted = code === 'social_cancelled' || controller.signal.aborted;
        if (error?.reached || (aborted && delivery.stage === 'publishing')) {
            // The request that publishes may have been executed (its answer was
            // lost, or it was cancelled in flight): verify, never resend.
            await save({ status: 'unconfirmed', error: 'social_publish_unconfirmed' });
        } else if (aborted) {
            await save({ status: 'cancelled', error: null });
        } else {
            await save({ status: 'failed', error: normalizeSocialError(code), provider_code: error?.providerCode || null,
                detail: error?.detail || null });
        }
    } finally {
        running.delete(key);
        release();
        finish();
    }
    return delivery;
}
