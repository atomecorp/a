import { createBankService } from './service.js';

const SERVICE_KEY = '__SQUIRREL_BANK_SERVICE__';
const API_KEY = '__SQUIRREL_BANK_API__';

const installBankGlobals = (env, api) => {
    env.Squirrel = env.Squirrel || {};
    env.Squirrel.bank = api;

    env.atome = env.atome || {};
    env.atome.bank = api;
    env.atome.tools = env.atome.tools || {};
    env.atome.tools.bank = api;

    env.AtomeBank = api;
    return api;
};

const getOrCreateService = (env) => {
    if (env[SERVICE_KEY]) return env[SERVICE_KEY];
    const service = createBankService();
    env[SERVICE_KEY] = service;
    return service;
};

export const createGlobalBankApi = ({
    env = globalThis
} = {}) => {
    if (!env || typeof env !== 'object') {
        throw new Error('Global bank bootstrap requires an object-like environment');
    }
    if (env[API_KEY]) return env[API_KEY];

    const api = {
        get service() {
            return getOrCreateService(env);
        },
        ingestAccounts(items = []) {
            return getOrCreateService(env).ingestAccounts(items);
        },
        ingestTransactions(items = []) {
            return getOrCreateService(env).ingestTransactions(items);
        },
        accounts() {
            return getOrCreateService(env).bankAccounts();
        },
        balance(options = {}) {
            return getOrCreateService(env).bankBalance(options);
        },
        transactions(options = {}) {
            return getOrCreateService(env).bankTransactions(options);
        },
        summary(options = {}) {
            return getOrCreateService(env).bankSummary(options);
        },
        searchTransactions(query, options = {}) {
            return getOrCreateService(env).bankSearchTransactions(query, options);
        },
        findPayer(name, options = {}) {
            return getOrCreateService(env).bankFindPayer(name, options);
        },
        spendingByPeriod(options = {}) {
            return getOrCreateService(env).bankSpendingByPeriod(options);
        },
        topMerchants(options = {}) {
            return getOrCreateService(env).bankSpendingTopMerchants(options);
        },
        recurringPayments(options = {}) {
            return getOrCreateService(env).bankRecurringPayments(options);
        }
    };

    env[API_KEY] = installBankGlobals(env, api);
    return env[API_KEY];
};

export const bootstrapGlobalBank = ({
    env = (typeof window !== 'undefined' ? window : globalThis)
} = {}) => createGlobalBankApi({ env });

if (typeof window !== 'undefined') {
    bootstrapGlobalBank({ env: window });
}
