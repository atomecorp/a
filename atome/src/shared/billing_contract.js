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

// The money rules (R-193, user decisions of 16 Nov. 2026), shared by the server ledger
// (atome-server src/billing/, through the generated catalog) and the clients' screens. All amounts
// are whole euro cents, prices are all taxes included.
// - The entry opens an account and becomes its credit, whole: `entryCents` (12 €) is only what is
//   proposed; the person pays what they want from `topupMinCents` (user, 16 Nov. 2026), and an
//   invitation's discount is atome's gift added on top of what they paid. A store purchase keeps
//   its product's price.
// - A top-up is any amount from `topupMinCents`; the roller proposes natural values (rule 19).
// - atome adds `commissionBps` (3 %) on top of what a supplier or a seller asks, rounded to the
//   nearest cent (0.015 € -> 0.02 €), once, paid by the buyer; card fees are atome's own.
// - There is no month anywhere: the balance counts down with use. Storage is a recurring cost
//   (`storage.costCents` per `storage.periodDays`, plus the 3 %) taken day by day; AI is its real
//   cost per token plus the 3 %. At zero nothing is erased; atome carries the storage.
// - `ai.prices`: provider cost per token in millionths of a cent, dated; a model with no price
//   is refused (`money_ai_price_missing`), never guessed. `ai.flatMicroCents`: an operation the
//   provider bills per call. `holdCents`: what is reserved before a provider is called.
export const BILLING_MONEY = Object.freeze({
    currency: 'EUR',
    entryCents: 1200,
    topupMinCents: 100,
    topupChoicesCents: Object.freeze([300, 500, 1200, 2100, 3400, 5500]),
    commissionBps: 300,
    storage: Object.freeze({ costCents: 500, periodDays: 30 }),
    ai: Object.freeze({
        pricedAt: '2026-11-18',
        // USD per million tokens × 0.92 (Not Diamond's dated catalog, `GET /v2/models`, 18 Nov. 2026, for the
        // models it routes); `notdiamond-router` is the router's own $0.05 per million tokens routed.
        prices: Object.freeze({
            'deepseek-v4-flash': Object.freeze({ input: 13, output: 26 }),
            'claude-haiku-4-5': Object.freeze({ input: 92, output: 460 }),
            'gpt-5.6-luna': Object.freeze({ input: 92, output: 552 }),
            'notdiamond-router': Object.freeze({ input: 5, output: 0 }),
            'gpt-5.6-sol': Object.freeze({ input: 115, output: 920 }),
            'gpt-6-astra': Object.freeze({ input: 230, output: 1840 }),
            'gpt-live-1': Object.freeze({ input: 400, output: 1600 })
        }),
        flatMicroCents: Object.freeze({ speech: 1_000_000, 'realtime-connect': 5_000_000, image: 4_000_000 }),
        // One US cent in millionths of a euro cent: the 0.92 the prices above use (18 Nov. 2026). A
        // generation (Runway's video, MusicGPT's music, R-120) is billed in its provider's US cents.
        usdCentMicroCents: 920_000,
        // What a generation reserves before its provider is called when the provider gives no
        // estimate first, in US cents: MusicGPT's pay-as-you-go song is $0.10 a minute (19 Nov. 2026),
        // two minutes reserved; the real cost it reports is what is settled.
        generationHoldUsdCents: Object.freeze({ musicgpt: 20 })
    }),
    holdCents: Object.freeze({ ai: 5, domains: 0, shop: 0, services: 0 }),
    categories: Object.freeze(['ai', 'domains', 'shop', 'services', 'storage']),
    holdTtlMs: 15 * 60 * 1000
});

// The 3 % on top, in cents, half rounded up: `billingCommissionCents(1000) === 30`, `(50) === 2`.
export const billingCommissionCents = (cents) => Math.floor((cents * BILLING_MONEY.commissionBps + 5000) / 10000);
