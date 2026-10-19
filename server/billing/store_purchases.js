import { BILLING_SIMULATED_METHODS, BILLING_STORES, billingAccountToken, findBillingProduct } from '../../atome/src/shared/billing_contract.js';

const fail = (code = 'billing_proof_invalid') => { throw new Error(code); };
const STORE_REVOKE_NOTICES = new Set(['REFUND', 'REVOKE']);
// Refusals a client may see (the purchase itself is not a secret).
export const BILLING_PUBLIC_ERRORS = Object.freeze(['billing_proof_invalid', 'billing_proof_untrusted', 'billing_plan_required',
    'billing_purchase_owned_elsewhere', 'billing_store_unconfigured', 'billing_store_unavailable', 'billing_store_unknown',
    'billing_period_invalid', 'billing_product_unknown']);

// The in-app purchase path of the single offer, shared by account creation,
// the `billing` family (restore, renewals, packs) and the store notification
// routes. A store purchase is verified by its store, then bound to an account:
// either the account already holds its original transaction, or the purchase
// carries the account token of one of the account's device keys.
export function createStorePurchases({ ledger, query, apple, google }) {
    const verifier = (store) => (store === 'apple' ? apple : store === 'google' ? google : null) || fail('billing_store_unconfigured');

    // `apple`: the StoreKit 2 transaction JWS. `google`: `{ productId, purchaseToken }`.
    async function verify(store, proof) {
        if (!BILLING_STORES.includes(store)) fail('billing_store_unknown');
        return store === 'apple' ? verifier(store).verifyTransaction(proof) : verifier(store).verifyPurchase(proof || {});
    }

    // The token keeps the first 32 hex digits of the key id except the UUID
    // version and variant digits, so the owning key is found by prefix.
    async function principalOfToken(token) {
        const normalized = String(token || '').toLowerCase();
        const hex = normalized.replace(/-/g, '');
        if (!/^[0-9a-f]{32}$/.test(hex)) return null;
        const pattern = `${hex.slice(0, 12)}_${hex.slice(13, 16)}_${hex.slice(17)}%`;
        const rows = await query('all', 'SELECT key_id, principal_id FROM auth_device_keys WHERE key_id LIKE ?', [pattern]);
        return rows.find(row => billingAccountToken(row.key_id) === normalized)?.principal_id || null;
    }

    // Records a verified purchase for `principal`. Idempotent: the ledger keys
    // every store transaction once.
    async function record(principal, purchase) {
        const owner = await ledger.ownerOfOriginal(purchase.source, purchase.originalTransactionId)
            || (purchase.accountToken ? await principalOfToken(purchase.accountToken) : null);
        if (owner !== principal) fail('billing_purchase_owned_elsewhere');
        if (purchase.revoked) return ledger.revokePurchase(purchase.source, purchase.transactionId);
        return ledger.applyPurchase(principal, purchase);
    }

    // Google keeps refunding a purchase that is never acknowledged (plans) or
    // consumed (packs); this runs once the ledger holds it.
    const settle = (purchase) => (purchase.source === 'google' ? verifier('google').settle(purchase) : null);

    // Account creation: the proof must be an active plan bought with the
    // creating device key. The account does not exist yet, so the binding is
    // checked against that key, not against the ledger.
    async function verifyCreation(store, proof, keyId) {
        const purchase = await verify(store, proof);
        if (findBillingProduct(purchase.productId)?.kind !== 'plan' || purchase.revoked) fail('billing_plan_required');
        if (purchase.accountToken !== billingAccountToken(keyId)) fail('billing_purchase_owned_elsewhere');
        if (await ledger.ownerOfOriginal(purchase.source, purchase.originalTransactionId)) fail('billing_purchase_owned_elsewhere');
        return purchase;
    }

    // The creation payment, prepared before the account transaction (store I/O)
    // and recorded inside it. The native iOS and Android apps always send a
    // store proof; the simulated methods remain for Web and desktop.
    async function prepareCreation(payment, keyId) {
        if (!payment?.store) {
            if (!BILLING_SIMULATED_METHODS.includes(payment?.method)) fail('auth_payment_method_invalid');
            return { method: payment.method, record: principal => ledger.applySimulatedPlan(principal), settle: async () => {} };
        }
        const purchase = await verifyCreation(payment.store, payment.proof, keyId);
        const product = findBillingProduct(purchase.productId);
        return {
            method: payment.store,
            async record(principal) {
                await ledger.applyPurchase(principal, purchase);
                return { mode: payment.store, productId: product.productId, amountCents: product.priceCents, currency: product.currency, period: product.period };
            },
            settle: () => settle(purchase)
        };
    }

    // App Store Server Notifications v2. A purchase not yet linked to an
    // account is left to the app, which submits it at creation or restore.
    async function handleAppleNotification(signedPayload) {
        const { type, transaction } = verifier('apple').verifyNotification(signedPayload);
        if (!transaction) return { handled: false };
        if (STORE_REVOKE_NOTICES.has(type)) return { handled: (await ledger.revokePurchase('apple', transaction.transactionId)).revoked };
        const owner = await ledger.ownerOfOriginal('apple', transaction.originalTransactionId)
            || await principalOfToken(transaction.accountToken);
        if (!owner) return { handled: false };
        await record(owner, transaction);
        return { handled: true };
    }

    // Google Play real-time developer notifications (Pub/Sub push).
    async function handleGoogleNotification(body) {
        const notice = verifier('google').parseNotification(body);
        if (notice.kind === 'voided') return { handled: (await ledger.revokePurchase('google', notice.orderId)).revoked };
        if (notice.kind !== 'subscription') return { handled: false };
        let purchase;
        try { purchase = await verify('google', { productId: notice.productId, purchaseToken: notice.purchaseToken }); }
        catch (error) {
            // An expired, paused or on-hold subscription grants nothing new.
            if (error.message === 'billing_proof_invalid') return { handled: false };
            throw error;
        }
        const owner = await ledger.ownerOfOriginal('google', purchase.originalTransactionId) || await principalOfToken(purchase.accountToken);
        if (!owner) return { handled: false };
        await record(owner, purchase);
        await settle(purchase);
        return { handled: true };
    }

    return { verify, record, settle, prepareCreation, handleAppleNotification, handleGoogleNotification };
}
