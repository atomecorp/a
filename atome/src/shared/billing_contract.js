// The single "atome" offer, shared by the server ledger and the clients. One
// monthly subscription tier carries storage and included AI credits; packs top
// up credits. Product ids are identical on the App Store, Google Play and Stripe
// (lookup key), so a proof from any store resolves through this one catalog.
// 1 credit = 0.001 EUR of provider cost.
const GIB = 1024 ** 3;
const plan = (tier, priceCents, storageGib) => Object.freeze({
    productId: `one.atome.plan.${tier}.monthly`, kind: 'plan', tier, priceCents, currency: 'EUR',
    period: 'month', storageBytes: storageGib * GIB, monthlyCredits: 3000
});
const pack = (credits, priceCents) => Object.freeze({
    productId: `one.atome.credits.${credits}`, kind: 'pack', credits, priceCents, currency: 'EUR'
});

export const BILLING_PLANS = Object.freeze([plan('standard', 1200, 50), plan('plus', 2000, 200), plan('max', 3000, 1024)]);
export const BILLING_PACKS = Object.freeze([pack(4000, 500)]);
export const BILLING_SOURCES = Object.freeze(['simulated', 'apple', 'google', 'stripe']);
export const BILLING_PERIOD_MS = 30 * 24 * 3600 * 1000;

export const findBillingProduct = (productId) => BILLING_PLANS.find(item => item.productId === productId)
    || BILLING_PACKS.find(item => item.productId === productId) || null;

// Store-governed platforms: their apps may only sell through the platform's
// in-app purchase system (App Store 3.1.1, Google Play payments policy).
export const BILLING_STORES = Object.freeze(['apple', 'google']);
// Web and desktop payment choices; still simulated (no card is charged).
export const BILLING_SIMULATED_METHODS = Object.freeze(['card', 'paypal', 'wero', 'apple_pay', 'google_pay', 'other']);

// The store purchase is bound to the device key that creates (or owns) the
// account: Apple `appAccountToken` and Google `obfuscatedAccountId` both carry
// this UUID, derived without hashing from the hex SHA-256 key id so that every
// runtime (including iOS pages without SubtleCrypto) computes it identically.
export function billingAccountToken(keyId) {
    if (typeof keyId !== 'string' || !/^[0-9a-f]{64}$/.test(keyId)) throw new Error('billing_account_token_invalid');
    const hex = keyId.slice(0, 32).split('');
    hex[12] = '8';
    hex[16] = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
    const value = hex.join('');
    return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}
