import { access } from 'node:fs/promises';
import path from 'node:path';
import { SOCIAL_MEDIA_CONSTRAINTS, socialContentKind, utf16Length, validateSocialInput } from '../../atome/src/squirrel/social/contracts.js';
import { planSocialDestination } from '../../atome/src/squirrel/social/capabilities.js';
import { resolveDownloadTarget } from '../server_uploads.js';
import { SocialError } from './social_http.js';
import { assessMedia, issuePublicMediaUrl, prepareVariant, previewThumbnail, probeMedia } from './social_media.js';
import { cancelDeliveryRun, createSocialJobStore, jobTempDir, lockDelivery, newJobId, runDelivery } from './social_jobs.js';
import { awaitSocialConnection, cancelSocialConnection, describeSocialSession, disconnectSocialAccount,
    listSocialAccounts, loadSocialSession, startSocialConnection } from './social_sessions.js';

// The single server owner of social sharing, reached through the principal's
// authenticated `/ws/api` provider channel (relayed unchanged by the Tauri and
// iOS hosts). Every entry point — eVe panels, runtime tools, MCP — lands here.
const serverRoute = (delivery) => delivery.route === 'direct' || delivery.transfer === 'provider_inbox';
const ASSISTED_OUTCOMES = new Set(['handed_off', 'exported', 'cancelled', 'failed']);
const exists = (file) => access(file).then(() => true, () => false);

const publicDelivery = (delivery) => ({
    destination: delivery.destination, network: delivery.network, route: delivery.route, transfer: delivery.transfer || null,
    status: delivery.status, error: delivery.error || null, provider_code: delivery.provider_code || null,
    detail: delivery.detail || null, notes: delivery.notes || [], url: delivery.url || null, attempts: delivery.attempts || 0,
    progress: delivery.progress ?? null, confirmed_by: delivery.confirmed_by || null,
    remote: delivery.remote ? Object.fromEntries(Object.entries(delivery.remote).filter(([, value]) => typeof value === 'string' && value)) : null,
    variant: delivery.variant ? { ...delivery.variant, path: undefined } : null, fallback: delivery.fallback || null
});

async function resolveSource(media, principal, resolveTarget) {
    // Not found and not allowed answer alike: the asset must not be probed.
    const target = await resolveTarget(media.file, principal).catch(() => null);
    if (!target?.filePath) throw new SocialError('social_media_missing');
    return target.filePath;
}

async function prepareDelivery({ job, delivery, store }) {
    const limits = SOCIAL_MEDIA_CONSTRAINTS[delivery.network]?.[job.probe.kind];
    const { violations, steps } = assessMedia(delivery.network, job.probe);
    if (violations.length) throw new SocialError('social_media_constraint', { detail: violations.join(',') });
    const key = JSON.stringify(steps);
    let variant = job.variants[key];
    if (!variant || !(await exists(variant.path))) {
        const prepared = await prepareVariant({ sourcePath: job.source, probe: job.probe, steps, outDir: jobTempDir(store.root, job.id) });
        variant = { path: prepared.path, original: prepared.original, mime: prepared.probe.mime, size: prepared.probe.size,
            width: prepared.probe.width, height: prepared.probe.height, duration: prepared.probe.duration,
            audio: Boolean(prepared.probe.audio), steps };
        job.variants[key] = variant;
    }
    if (limits?.maxBytes && variant.size > limits.maxBytes) throw new SocialError('social_media_constraint', { detail: 'file_too_large' });
    delivery.variant_key = key;
    delivery.variant = { ...variant, converted: steps.some((step) => step.converted), flattened: steps.some((step) => step.flatten),
        resized: steps.some((step) => step.resized), transcoded: steps.some((step) => step.type === 'video_h264') };
}

function checkText(job, delivery) {
    const text = job.content.text;
    const tiktok = SOCIAL_MEDIA_CONSTRAINTS.tiktok.caption;
    if (delivery.network === 'tiktok' && job.kind === 'video' && utf16Length(text) > tiktok.video) return 'caption_too_long';
    if (delivery.network === 'tiktok' && job.kind === 'image' && utf16Length(text) > tiktok.photoDescription) return 'caption_too_long';
    return null;
}

async function prepare({ content, destinations, handoff = {} }, { principal, ctx, resolveTarget }) {
    const kind = socialContentKind(content);
    if (!kind) throw new SocialError('social_content_empty');
    const store = createSocialJobStore(ctx.vault.socialRoot);
    await store.pruneStale();
    const accounts = await listSocialAccounts(ctx);
    const job = { id: newJobId(), created_at: Date.now(), kind, content: { text: String(content.text || '').trim(), media: content.media || null },
        source: null, probe: null, variants: {}, deliveries: {} };
    const plans = destinations.map((destination) => planSocialDestination({ destination, accounts, kind, handoff }));
    let mediaError = null;
    if (content.media && plans.some(serverRoute)) {
        try {
            job.source = await resolveSource(content.media, principal, resolveTarget);
            job.probe = await probeMedia(job.source);
            if (job.probe.kind !== content.media.kind) throw new SocialError('social_media_type_unsupported');
        } catch (error) { mediaError = error; }
    }
    const thumbnails = {};
    for (const plan of plans) {
        const delivery = { destination: plan.destination, network: plan.network, route: plan.route || null, transfer: plan.transfer || null,
            notes: plan.notes || [], status: plan.route ? 'ready' : 'failed', error: plan.error || null, attempts: 0, remote: null, url: null };
        if (plan.route && serverRoute(plan) && content.media) {
            try {
                if (mediaError) throw mediaError;
                await prepareDelivery({ job, delivery, store });
                thumbnails[delivery.variant_key] ??= await previewThumbnail(delivery.variant.path, job.probe.kind);
            } catch (error) {
                Object.assign(delivery, { status: 'failed', route: null, error: error?.code || 'social_media_unreadable', detail: error?.detail || null,
                    // The share sheet or an export still works with the original file.
                    fallback: planSocialDestination({ destination: plan.destination, accounts: {}, kind, handoff }) });
            }
        }
        const textError = delivery.route && serverRoute(delivery) ? checkText(job, delivery) : null;
        if (textError) Object.assign(delivery, { status: 'failed', route: null, error: 'social_media_constraint', detail: textError });
        job.deliveries[plan.destination] = delivery;
    }
    await store.write(job);
    return { job_id: job.id, kind, text: job.content.text, media: job.probe ? { kind: job.probe.kind, mime: job.probe.mime,
        width: job.probe.width, height: job.probe.height, duration: job.probe.duration, size: job.probe.size, audio: Boolean(job.probe.audio) } : null,
    accounts, deliveries: Object.values(job.deliveries).map((delivery) => ({ ...publicDelivery(delivery),
        preview: delivery.variant_key ? thumbnails[delivery.variant_key] || null : null })) };
}

async function mediaFor({ job, delivery, store, ctx, principal, resolveTarget }) {
    if (!job.content.media) return null;
    if (!job.variants[delivery.variant_key] || !(await exists(job.variants[delivery.variant_key].path))) {
        if (!job.source || !(await exists(job.source))) job.source = await resolveSource(job.content.media, principal, resolveTarget);
        job.probe ??= await probeMedia(job.source);
        await prepareDelivery({ job, delivery, store });
    }
    const variant = job.variants[delivery.variant_key];
    const stem = path.parse(job.content.media.name || job.content.media.file).name || 'atome';
    const needsUrl = job.kind === 'image' && delivery.network !== 'facebook';
    return { kind: job.kind, path: variant.path, size: variant.size, mime: variant.mime, probe: { ...job.probe, ...variant },
        name: `${stem}${path.extname(variant.path)}`,
        publicUrl: needsUrl ? issuePublicMediaUrl({ baseUrl: ctx.config.SOCIAL_PUBLIC_BASE_URL, filePath: variant.path, mime: variant.mime, owner: job.id }) : null };
}

async function connectedSession(network, ctx) {
    const session = await loadSocialSession(network, ctx);
    if (session.state !== 'connected') throw new SocialError(session.state === 'expired' ? 'social_session_expired' : 'social_not_connected');
    return { session, view: await describeSocialSession(session, ctx) };
}

async function publish({ job_id: jobId, deliveries }, env) {
    const store = createSocialJobStore(env.ctx.vault.socialRoot);
    const { job, release } = await store.acquire(jobId);
    try {
        const results = await Promise.all(deliveries.map(async ({ id, options }) => {
            const delivery = job.deliveries[id];
            if (!delivery) return { destination: id, status: 'failed', error: 'social_destination_invalid' };
            if (!serverRoute(delivery)) return publicDelivery(delivery);
            if (options) delivery.options = options;
            await runDelivery({ store, job, delivery, principal: env.principal, execute: async (hooks) => {
                const { session, view } = await connectedSession(delivery.network, env.ctx);
                const media = await mediaFor({ job, delivery, store, ...env });
                return session.adapter.publish({ config: env.ctx.config, record: session.record, plan: delivery, media,
                    text: job.content.text, options: delivery.options || {}, view, fetchImpl: env.ctx.fetchImpl,
                    remote: delivery.remote, ...env.ctx.polling, ...hooks });
            } });
            return publicDelivery(delivery);
        }));
        await store.releaseIfSettled(job);
        await store.write(job);
        return { job_id: job.id, deliveries: results };
    } finally { release(); }
}

async function status({ job_id: jobId }, env) {
    const store = createSocialJobStore(env.ctx.vault.socialRoot);
    const { job, release } = await store.acquire(jobId);
    try {
        for (const delivery of Object.values(job.deliveries)) {
            if (!serverRoute(delivery) || !['remote_processing', 'unconfirmed'].includes(delivery.status) || !delivery.remote) continue;
            const unlock = lockDelivery(env.principal, job.id, delivery.destination);
            if (!unlock) continue;
            try {
                const { session, view } = await connectedSession(delivery.network, env.ctx);
                const result = await session.adapter.status({ config: env.ctx.config, record: session.record, remote: delivery.remote,
                    fetchImpl: env.ctx.fetchImpl, view, verifyOnly: delivery.status === 'unconfirmed', ...env.ctx.polling,
                    publishing: async () => { delivery.stage = 'publishing'; await store.write(job); } });
                Object.assign(delivery, { status: result.status, remote: { ...delivery.remote, ...(result.remote || {}) },
                    url: result.url || delivery.url || null, error: result.error || null, provider_code: result.provider_code || null });
            } catch (error) {
                delivery.notes = [...new Set([...(delivery.notes || []), error?.code || 'social_provider_unavailable'])];
            } finally { unlock(); }
        }
        await store.releaseIfSettled(job);
        await store.write(job);
        return { job_id: job.id, deliveries: Object.values(job.deliveries).map(publicDelivery) };
    } finally { release(); }
}

async function cancel({ job_id: jobId, destination }, env) {
    const store = createSocialJobStore(env.ctx.vault.socialRoot);
    const { job, release } = await store.acquire(jobId);
    try {
        for (const delivery of Object.values(job.deliveries)) {
            if (destination && delivery.destination !== destination) continue;
            if (await cancelDeliveryRun(env.principal, job.id, delivery.destination)) continue;
            if (delivery.status === 'ready' || delivery.status === 'failed') Object.assign(delivery, { status: 'cancelled', updated_at: Date.now() });
        }
        await store.releaseIfSettled(job, { force: !destination });
        await store.write(job);
        return { job_id: job.id, deliveries: Object.values(job.deliveries).map(publicDelivery) };
    } finally { release(); }
}

// The client reports what happened to an assisted transfer (share sheet,
// copied text, export). atome cannot see into the other app: `handed_off` is
// the most it ever records, never `published`.
async function recordClientOutcome({ job_id: jobId, destination, outcome, target, error }, env, kind) {
    const store = createSocialJobStore(env.ctx.vault.socialRoot);
    const { job, release } = await store.acquire(jobId);
    try {
        const delivery = job.deliveries[String(destination || '')];
        if (!delivery) throw new SocialError('social_destination_invalid');
        if (kind === 'handoff') {
            const assisted = !serverRoute(delivery) && (delivery.route || delivery.fallback?.route);
            if (!assisted || !ASSISTED_OUTCOMES.has(outcome) || !['ready', 'failed', 'cancelled'].includes(delivery.status)) throw new SocialError('social_request_invalid');
            Object.assign(delivery, { status: outcome, error: outcome === 'failed' ? (['social_app_unavailable', 'social_handoff_unavailable'].includes(error) ? error : 'social_handoff_unavailable') : null,
                target: typeof target === 'string' ? target.slice(0, 200) : null, updated_at: Date.now() });
        } else {
            if (delivery.status !== 'unconfirmed' || !['published', 'not_published'].includes(outcome)) throw new SocialError('social_request_invalid');
            Object.assign(delivery, outcome === 'published'
                ? { status: 'published', error: null, confirmed_by: 'user' }
                : { status: 'failed', error: 'social_publish_unconfirmed', confirmed_by: 'user' }, { updated_at: Date.now() });
        }
        await store.releaseIfSettled(job);
        await store.write(job);
        return publicDelivery(delivery);
    } finally { release(); }
}

export async function handleSocialAction(action, payload = {}, { principal, ctx, signal, resolveTarget = resolveDownloadTarget }) {
    const env = { principal, ctx: { ...ctx, signal }, resolveTarget };
    const name = action.replace(/^social\./, '');
    if (name === 'connect.start') return startSocialConnection({ network: String(payload.network || ''), principal, ctx: env.ctx });
    if (name === 'connect.await') return awaitSocialConnection({ principal, attemptId: String(payload.attempt_id || ''), signal });
    if (name === 'connect.cancel') return { cancelled: cancelSocialConnection({ principal, attemptId: String(payload.attempt_id || '') }) };
    if (name === 'handoff' || name === 'confirm') return recordClientOutcome(payload, env, name);
    if (validateSocialInput(name, payload)) throw new SocialError('social_request_invalid');
    if (name === 'accounts') return { accounts: await listSocialAccounts(env.ctx) };
    if (name === 'disconnect') return disconnectSocialAccount(payload.network, env.ctx);
    if (name === 'prepare') return prepare(payload, env);
    if (name === 'publish') return publish(payload, env);
    if (name === 'status') return status(payload, env);
    if (name === 'cancel') return cancel(payload, env);
    throw new SocialError('social_request_invalid');
}
