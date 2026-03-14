export const CONTACTS_V1_ARCHITECTURE_DECISION = {
    provider: 'eve_contacts_local',
    protocol: 'eve_contacts_local',
    primary_read_source: {
        id: 'eve_contacts_local',
        role: 'primary',
        writable: false
    },
    legacy_import_source: {
        id: 'macos_contacts',
        role: 'legacy',
        writable: false
    },
    local_storage_key: 'eve_contacts_local_store_v1',
    read_capabilities: ['contacts_list', 'contacts_search', 'contacts_sources']
};

export const createContactsConnectorContract = ({
    provider = CONTACTS_V1_ARCHITECTURE_DECISION.provider,
    protocol = CONTACTS_V1_ARCHITECTURE_DECISION.protocol,
    role = CONTACTS_V1_ARCHITECTURE_DECISION.primary_read_source.role,
    read_capabilities = CONTACTS_V1_ARCHITECTURE_DECISION.read_capabilities,
    write_capabilities = []
} = {}) => ({
    provider: String(provider || CONTACTS_V1_ARCHITECTURE_DECISION.provider),
    protocol: String(protocol || CONTACTS_V1_ARCHITECTURE_DECISION.protocol),
    role: String(role || CONTACTS_V1_ARCHITECTURE_DECISION.primary_read_source.role),
    read_capabilities: Array.isArray(read_capabilities) ? [...read_capabilities] : [],
    write_capabilities: Array.isArray(write_capabilities) ? [...write_capabilities] : []
});
