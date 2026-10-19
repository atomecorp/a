import { getStorePurchases } from './ws_billing_operations.js';

const STORE_BODY_LIMIT = 256 * 1024;
const RETRYABLE = new Set(['billing_store_unavailable', 'billing_store_unconfigured']);

// The two HTTP endpoints imposed by the stores, like the social OAuth
// callback: the stores push here, they cannot speak `/ws/api`. Every push is
// re-verified (Apple signature chain, Google Play Developer API) before the
// ledger changes. A transient store failure answers 503 so the store retries.
export function registerBillingRoutes(fastify, { stores = () => getStorePurchases() } = {}) {
    const respond = async (reply, work) => {
        try {
            const result = await work();
            return reply.code(200).header('Cache-Control', 'no-store').send({ ok: true, handled: result.handled });
        } catch (error) {
            const code = /^billing_/.test(error?.message) ? error.message : 'billing_notification_failed';
            if (!RETRYABLE.has(code)) fastify.log.warn({ code }, '[billing] store notification refused');
            return reply.code(RETRYABLE.has(code) ? 503 : 400).header('Cache-Control', 'no-store').send({ ok: false, error: code });
        }
    };
    fastify.post('/api/billing/apple/notifications', { bodyLimit: STORE_BODY_LIMIT },
        (request, reply) => respond(reply, () => stores().handleAppleNotification(request.body?.signedPayload)));
    fastify.post('/api/billing/google/rtdn', { bodyLimit: STORE_BODY_LIMIT },
        (request, reply) => respond(reply, () => stores().handleGoogleNotification(request.body)));
}
