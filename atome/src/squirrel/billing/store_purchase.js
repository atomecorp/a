import { BILLING_PLANS, billingAccountToken, findBillingProduct } from '../../shared/billing_contract.js';

// In-app purchase of the single offer on the store-governed native hosts: the
// iOS app (StoreKit 2, `__ATOME_IOS_NATIVE_INVOKE`) and the Android app (Google
// Play Billing, the gated Tauri command `billing_invoke`). Both answer the same
// command, `billing_store_purchase`. A web page on a phone is not such a host:
// it keeps the Web payment. The purchase carries the account token of the
// device key that creates the account; the server verifies the proof with the
// store before anything is granted.
export function resolveBillingStore(env = globalThis) {
    const ios = env?.__ATOME_IOS_NATIVE_INVOKE;
    if (typeof ios === 'function') return { store: 'apple', invoke: (command, payload) => ios.call(env, command, payload) };
    const tauri = env?.__TAURI_INTERNALS__;
    if (typeof tauri?.invoke === 'function' && /Android/i.test(String(env.navigator?.userAgent || ''))) {
        return { store: 'google', invoke: (command, payload) => tauri.invoke('billing_invoke', { command, payload }) };
    }
    return null;
}

const failure = (code) => Object.assign(new Error(code), { code });

export function createStorePurchase({ host = resolveBillingStore() } = {}) {
    async function buy(productId, keyId) {
        if (!host) throw failure('billing_store_unavailable');
        let reply;
        try { reply = await host.invoke('billing_store_purchase', {
            productId, kind: findBillingProduct(productId).kind, accountToken: billingAccountToken(keyId) }); }
        catch (error) { throw failure(String(error?.message || error || 'billing_store_failed')); }
        if (reply?.ok === false) throw failure(reply.error || 'billing_store_failed');
        if (host.store === 'apple' && typeof reply?.jws === 'string' && reply.jws) return reply.jws;
        if (host.store === 'google' && typeof reply?.purchaseToken === 'string' && reply.purchaseToken) {
            return { productId, purchaseToken: reply.purchaseToken };
        }
        throw failure('billing_store_reply_invalid');
    }
    return {
        store: () => host?.store || null,
        // The creation payment sent with `account-create` or `phone-link-payment`:
        // the store buys the base plan with `keyId`, or a Web method is named.
        async creationPayment(payment, keyId) {
            if (!payment?.store) return { method: payment?.method };
            if (payment.store !== host?.store) throw failure('billing_store_unavailable');
            return { store: payment.store, proof: await buy(BILLING_PLANS[0].productId, keyId) };
        }
    };
}

// The page's single store purchase, shared by both account-creation clients.
let shared = null;
export const billingStorePurchase = () => (shared ||= createStorePurchase());
