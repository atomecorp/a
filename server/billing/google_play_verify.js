import crypto from 'node:crypto';
import path from 'node:path';
import { findBillingProduct } from '../../atome/src/shared/billing_contract.js';
import { createPlayAuthorization } from '../../scripts/android/play_api.mjs';
import { readPlayConfiguration, readServiceAccount } from '../../scripts/android/play_configuration.mjs';

export const GOOGLE_PACKAGE_NAME = 'one.atome.app';
const API = 'https://androidpublisher.googleapis.com/androidpublisher/v3/applications';
// A cancelled subscription keeps its paid period; the others carry no entitlement.
const ENTITLED_STATES = new Set(['SUBSCRIPTION_STATE_ACTIVE', 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD', 'SUBSCRIPTION_STATE_CANCELED']);
const fail = (code = 'billing_proof_invalid') => { throw new Error(code); };
const tokenRef = (token) => `token:${crypto.createHash('sha256').update(token).digest('hex').slice(0, 40)}`;
// Renewals are `GPA.x..N`; the subscription's original order is `GPA.x`.
const originalOrder = (orderId) => String(orderId).replace(/\.\.\d+$/, '');

// The Play Developer API is the only authority on a Play purchase: a purchase
// token from the device or from a Pub/Sub notification is a lookup key, never
// a proof by itself. Subscriptions are acknowledged and packs consumed once the
// caller has recorded them, so Google neither refunds them nor blocks rebuying.
export function createGooglePlayVerifier({ packageName = GOOGLE_PACKAGE_NAME, authorize, request = fetch, now = Date.now } = {}) {
    const base = `${API}/${packageName}/purchases`;
    async function send(method, url, operation) {
        if (typeof authorize !== 'function') fail('billing_store_unconfigured');
        const bearer = await authorize();
        let response;
        try {
            response = await request(url, { method, redirect: 'error', signal: AbortSignal.timeout(15000),
                headers: { authorization: `Bearer ${bearer}`, ...(method === 'POST' ? { 'content-type': 'application/json' } : {}) },
                ...(method === 'POST' ? { body: '{}' } : {}) });
        } catch { fail('billing_store_unavailable'); }
        if (response.status === 404 || response.status === 410) fail();
        if (!response.ok) fail(response.status >= 500 ? 'billing_store_unavailable' : `billing_store_${operation}_refused`);
        if (response.status === 204) return {};
        try { return await response.json(); } catch { return fail('billing_store_unavailable'); }
    }
    const token = (value) => (typeof value === 'string' && /^[A-Za-z0-9._:-]{10,4096}$/.test(value) ? value : fail());

    async function verifyPurchase({ productId, purchaseToken }) {
        const product = findBillingProduct(productId);
        if (!product) fail('billing_product_unknown');
        const purchase = token(purchaseToken);
        if (product.kind === 'plan') {
            const sub = await send('GET', `${base}/subscriptionsv2/tokens/${encodeURIComponent(purchase)}`, 'read');
            const line = (sub.lineItems || []).find(item => item.productId === productId);
            if (!line || !ENTITLED_STATES.has(sub.subscriptionState)) fail();
            const periodEndMs = Date.parse(line.expiryTime);
            const orderId = sub.latestOrderId || tokenRef(purchase);
            return {
                source: 'google', transactionId: orderId, originalTransactionId: sub.latestOrderId ? originalOrder(orderId) : orderId,
                productId, periodStartMs: Math.min(now(), periodEndMs - 1), periodEndMs,
                accountToken: sub.externalAccountIdentifiers?.obfuscatedExternalAccountId || null,
                acknowledged: sub.acknowledgementState === 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED', purchaseToken: purchase
            };
        }
        const item = await send('GET', `${base}/products/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(purchase)}`, 'read');
        if (item.purchaseState !== 0) fail();
        const orderId = item.orderId || tokenRef(purchase);
        return {
            source: 'google', transactionId: orderId, originalTransactionId: orderId, productId,
            periodStartMs: null, periodEndMs: null, accountToken: item.obfuscatedExternalAccountId || null,
            acknowledged: item.consumptionState === 1, purchaseToken: purchase
        };
    }

    // Called after the ledger recorded the purchase.
    async function settle({ productId, purchaseToken, acknowledged }) {
        if (acknowledged) return;
        const product = findBillingProduct(productId);
        const purchase = encodeURIComponent(token(purchaseToken));
        const id = encodeURIComponent(productId);
        await send('POST', product?.kind === 'plan'
            ? `${base}/subscriptions/${id}/tokens/${purchase}:acknowledge`
            : `${base}/products/${id}/tokens/${purchase}:consume`, 'settle');
    }

    // Real-time developer notification (Pub/Sub push). Only the identifiers are
    // read; the state always comes back from the API.
    function parseNotification(body) {
        let notice;
        try { notice = JSON.parse(Buffer.from(String(body?.message?.data || ''), 'base64').toString('utf8')); } catch { fail(); }
        if (notice?.packageName !== packageName) fail();
        if (notice.subscriptionNotification) return { kind: 'subscription', productId: notice.subscriptionNotification.subscriptionId,
            purchaseToken: notice.subscriptionNotification.purchaseToken, type: Number(notice.subscriptionNotification.notificationType) };
        if (notice.voidedPurchaseNotification) return { kind: 'voided', orderId: String(notice.voidedPurchaseNotification.orderId || '') };
        return { kind: 'ignored' };
    }

    return { verifyPurchase, settle, parseNotification };
}

// The service account is a runtime input: `ATOME_PLAY_SERVICE_ACCOUNT_FILE`, or
// the `serviceAccountFile` of the Play release configuration. Without it every
// Play operation answers `billing_store_unconfigured`.
export async function loadGooglePlayAuthorization(projectRoot, env = process.env) {
    const configFile = path.resolve(projectRoot, env.ATOME_PLAY_CONFIG || 'Private/android-play.json');
    const file = env.ATOME_PLAY_SERVICE_ACCOUNT_FILE || (await readPlayConfiguration(configFile, GOOGLE_PACKAGE_NAME))?.serviceAccountFile;
    if (!file) return null;
    return createPlayAuthorization({ account: await readServiceAccount(file, projectRoot) });
}
