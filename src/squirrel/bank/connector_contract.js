export const BANK_V1_ARCHITECTURE_DECISION = Object.freeze({
    provider: 'powens_psd2_with_local_analytics',
    read_source: {
        id: 'powens_psd2',
        protocol: 'https',
        role: 'primary_read',
        writable: false
    },
    execution_model: {
        sync_source_of_truth: 'powens_accounts_and_transactions',
        normalized_index: 'local_bank_analytics_index',
        analytics_mode: 'read_only_analytics',
        confirmation_policy: 'no_sensitive_write_actions_exposed_in_v1'
    },
    voice_capabilities: [
        'bank_accounts',
        'bank_balance',
        'bank_transactions',
        'bank_summary',
        'bank_search_transactions',
        'bank_find_payer',
        'bank_spending_by_period',
        'bank_spending_top_merchants',
        'bank_recurring_payments'
    ]
});

export const createBankConnectorContract = ({
    provider = BANK_V1_ARCHITECTURE_DECISION.read_source.id,
    protocol = 'https',
    role = 'primary_read',
    read_capabilities = [...BANK_V1_ARCHITECTURE_DECISION.voice_capabilities],
    write_capabilities = []
} = {}) => ({
    provider: String(provider || BANK_V1_ARCHITECTURE_DECISION.read_source.id),
    protocol: String(protocol || 'https'),
    role: String(role || 'primary_read'),
    read_capabilities: Array.isArray(read_capabilities) ? read_capabilities.map((entry) => String(entry)) : [],
    write_capabilities: Array.isArray(write_capabilities) ? write_capabilities.map((entry) => String(entry)) : []
});
