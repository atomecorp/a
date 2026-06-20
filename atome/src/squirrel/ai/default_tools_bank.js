export const registerBankDefaultTools = ({ Agent, safeString, requireBankApi }) => {
    Agent.registerTool({
        name: 'bank.accounts',
        description: 'List normalized bank accounts.',
        capabilities: ['bank.read'],
        risk_tier: 'LOW',
        handler: async () => {
            const api = await requireBankApi();
            return api.accounts();
        },
        summary: () => 'List bank accounts'
    });

    Agent.registerTool({
        name: 'bank.balance',
        description: 'Read one account balance or the total balance.',
        capabilities: ['bank.read'],
        risk_tier: 'LOW',
        parameters: {
            properties: {
                account_id: { type: 'string' }
            }
        },
        handler: async ({ params }) => {
            const api = await requireBankApi();
            return api.balance(params || {});
        },
        summary: () => 'Read bank balance'
    });

    Agent.registerTool({
        name: 'bank.transactions',
        description: 'List normalized bank transactions.',
        capabilities: ['bank.read'],
        risk_tier: 'LOW',
        parameters: {
            properties: {
                account_id: { type: 'string' },
                period: { type: 'string' },
                limit: { type: 'number' }
            }
        },
        handler: async ({ params }) => {
            const api = await requireBankApi();
            return api.transactions(params || {});
        },
        summary: () => 'List bank transactions'
    });

    Agent.registerTool({
        name: 'bank.summary',
        description: 'Summarize bank movements over a period.',
        capabilities: ['bank.read'],
        risk_tier: 'LOW',
        parameters: {
            properties: {
                account_id: { type: 'string' },
                period: { type: 'string' }
            }
        },
        handler: async ({ params }) => {
            const api = await requireBankApi();
            return api.summary(params || {});
        },
        summary: () => 'Summarize bank activity'
    });

    Agent.registerTool({
        name: 'bank.search_transactions',
        description: 'Search transactions in natural language over the local bank analytics index.',
        capabilities: ['bank.read'],
        risk_tier: 'LOW',
        parameters: {
            required: ['query'],
            properties: {
                query: { type: 'string' },
                account_id: { type: 'string' },
                limit: { type: 'number' }
            }
        },
        handler: async ({ params }) => {
            const api = await requireBankApi();
            const query = safeString(params?.query || params?.q);
            if (!query) throw new Error('Missing query');
            return api.searchTransactions(query, params || {});
        },
        summary: (params) => `Search bank transactions ${params?.query || params?.q || ''}`
    });

    Agent.registerTool({
        name: 'bank.find_payer',
        description: 'Find incoming payments from one payer or counterparty.',
        capabilities: ['bank.read'],
        risk_tier: 'LOW',
        parameters: {
            required: ['name'],
            properties: {
                name: { type: 'string' },
                period: { type: 'string' }
            }
        },
        handler: async ({ params }) => {
            const api = await requireBankApi();
            const name = safeString(params?.name || params?.payer || params?.counterparty);
            if (!name) throw new Error('Missing name');
            return api.findPayer(name, params || {});
        },
        summary: (params) => `Find payer ${params?.name || params?.payer || params?.counterparty || ''}`
    });

    Agent.registerTool({
        name: 'bank.spending_by_period',
        description: 'Aggregate debit spending by period.',
        capabilities: ['bank.read'],
        risk_tier: 'LOW',
        parameters: {
            properties: {
                period: { type: 'string' },
                granularity: { type: 'string' }
            }
        },
        handler: async ({ params }) => {
            const api = await requireBankApi();
            return api.spendingByPeriod(params || {});
        },
        summary: () => 'Aggregate spending by period'
    });

    Agent.registerTool({
        name: 'bank.top_merchants',
        description: 'Rank top debit merchants over a period.',
        capabilities: ['bank.read'],
        risk_tier: 'LOW',
        parameters: {
            properties: {
                period: { type: 'string' },
                limit: { type: 'number' }
            }
        },
        handler: async ({ params }) => {
            const api = await requireBankApi();
            return api.topMerchants(params || {});
        },
        summary: () => 'Top bank merchants'
    });

    Agent.registerTool({
        name: 'bank.recurring_payments',
        description: 'Detect recurring outgoing payments.',
        capabilities: ['bank.read'],
        risk_tier: 'LOW',
        handler: async ({ params }) => {
            const api = await requireBankApi();
            return api.recurringPayments(params || {});
        },
        summary: () => 'Detect recurring payments'
    });
};
