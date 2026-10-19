import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import db from '../../database/adole.js';
import { resolveWsApiPrincipal, isWsApiPrincipalProvisioned } from '../wsApiIdentity.js';
import { wsResponse, actionOf } from '../wsResponse.js';
import { BILLING_PACKS, BILLING_PLANS } from '../../atome/src/shared/billing_contract.js';
import { createBillingLedger } from './billing_ledger.js';
import { createAppleStoreVerifier } from './apple_store_verify.js';
import { createGooglePlayVerifier, loadGooglePlayAuthorization } from './google_play_verify.js';
import { createStorePurchases } from './store_purchases.js';

const PROJECT_ROOT = fileURLToPath(new URL('../../', import.meta.url));

let ledger = null;
export const getBillingLedger = () => {
    ledger ||= createBillingLedger({ query: db.query, transaction: db.withTransaction });
    return ledger;
};

// The Xcode StoreKit-testing certificate (Editor › Save Public Certificate) is
// a development root only; production trusts Apple Root CA - G3 alone.
const xcodeRoot = (env) => (env.NODE_ENV !== 'production' && env.ATOME_STOREKIT_TEST_CERT
    ? readFileSync(env.ATOME_STOREKIT_TEST_CERT) : null);

let storePurchases = null;
let googleAuthorization = null;
export const getStorePurchases = (env = process.env) => {
    storePurchases ||= createStorePurchases({
        ledger: getBillingLedger(), query: db.query,
        apple: createAppleStoreVerifier({ xcodeRoot: xcodeRoot(env) }),
        google: createGooglePlayVerifier({
            authorize: async () => {
                googleAuthorization ||= loadGooglePlayAuthorization(PROJECT_ROOT, env);
                const authorize = await googleAuthorization;
                if (!authorize) throw new Error('billing_store_unconfigured');
                return authorize();
            }
        })
    });
    return storePurchases;
};

const STORE_ACTIONS = { 'apple.verify': 'apple', 'google.verify': 'google' };

// `/ws/api` family `billing`: the authenticated principal's plan and credits,
// the single offer catalog, and the in-app purchase proofs submitted after the
// account exists (restore, renewal seen first by the app, credit packs).
export const handleWsBillingOperation = async (message, connection, {
    resolvePrincipal = resolveWsApiPrincipal, provisioned = isWsApiPrincipalProvisioned,
    billing = getBillingLedger(), stores = null
} = {}) => {
    if (message?.type !== 'billing') return null;
    const reply = (ok, fields) => wsResponse('billing', message, ok, fields);
    try {
        const principal = resolvePrincipal(connection, message);
        if (!principal || !await provisioned(principal)) throw new Error('not_authenticated');
        const action = actionOf(message);
        if (action === 'status') return reply(true, await billing.status(principal));
        if (action === 'offers') return reply(true, { plans: BILLING_PLANS, packs: BILLING_PACKS });
        if (STORE_ACTIONS[action]) {
            const purchases = stores || getStorePurchases();
            const purchase = await purchases.verify(STORE_ACTIONS[action], message.proof);
            await purchases.record(principal, purchase);
            await purchases.settle(purchase);
            return reply(true, await billing.status(principal));
        }
        throw new Error('billing_operation_not_allowed');
    } catch (error) {
        const code = /^(?:billing_|not_authenticated|insufficient_quota)/.test(error.message) ? error.message : 'billing_operation_failed';
        return reply(false, { error: code });
    }
};
