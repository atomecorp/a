import { normalizeConnectorContract } from '../shared/connector_contract.js';

// Gelé comme les trois autres décisions d'architecture: c'était le seul mutable.
export const CONTACTS_V1_ARCHITECTURE_DECISION = Object.freeze({
    provider: 'eve_contacts_local',
    protocol: 'eve_contacts_local',
    primary_read_source: {
        id: 'eve_contacts_local',
        role: 'primary',
        writable: true
    },
    import_source: {
        id: 'macos_contacts',
        role: 'import',
        writable: false
    },
    local_storage_key: 'eve_contacts_local_store_v1',
    read_capabilities: ['contacts_list', 'contacts_search', 'contacts_sources']
});

export const createContactsConnectorContract = ({
    provider = CONTACTS_V1_ARCHITECTURE_DECISION.provider,
    protocol = CONTACTS_V1_ARCHITECTURE_DECISION.protocol,
    role = CONTACTS_V1_ARCHITECTURE_DECISION.primary_read_source.role,
    read_capabilities = CONTACTS_V1_ARCHITECTURE_DECISION.read_capabilities,
    write_capabilities = [],
    interactive_import = false,
    label_key = ''
} = {}) => normalizeConnectorContract({
    provider: provider || CONTACTS_V1_ARCHITECTURE_DECISION.provider,
    protocol: protocol || CONTACTS_V1_ARCHITECTURE_DECISION.protocol,
    role: role || CONTACTS_V1_ARCHITECTURE_DECISION.primary_read_source.role,
    read_capabilities,
    write_capabilities
}, {
    interactive_import: interactive_import === true,
    label_key: String(label_key || '')
});
