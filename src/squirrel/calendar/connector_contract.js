export const CALENDAR_V1_ARCHITECTURE_DECISION = Object.freeze({
    provider: 'tauri_caldav_primary_with_icloud_legacy_reads',
    primary_write_source: {
        id: 'tauri_caldav_primary',
        protocol: 'caldav',
        role: 'primary',
        writable: true
    },
    legacy_read_sources: [
        {
            id: 'icloud_legacy',
            protocol: 'caldav',
            role: 'legacy',
            writable: false
        }
    ],
    execution_model: {
        sync_source_of_truth: 'multi_source_transition',
        unified_index: 'normalized_calendar_view',
        source_tagging: true,
        conflict_policy: 'prefer_primary_then_latest_update',
        transition_mode: 'double_read_single_write'
    },
    voice_capabilities: [
        'calendar_today',
        'calendar_next',
        'calendar_create',
        'calendar_update',
        'calendar_search',
        'calendar_sources'
    ]
});

export const createCalendarConnectorContract = ({
    provider = CALENDAR_V1_ARCHITECTURE_DECISION.provider,
    protocol = 'caldav',
    role = 'legacy',
    read_capabilities = ['calendar_today', 'calendar_next', 'calendar_search', 'calendar_sources'],
    write_capabilities = ['calendar_create', 'calendar_update']
} = {}) => ({
    provider: String(provider || CALENDAR_V1_ARCHITECTURE_DECISION.provider),
    protocol: String(protocol || 'caldav'),
    role: String(role || 'legacy'),
    read_capabilities: Array.isArray(read_capabilities) ? read_capabilities.map((entry) => String(entry)) : [],
    write_capabilities: Array.isArray(write_capabilities) ? write_capabilities.map((entry) => String(entry)) : []
});
