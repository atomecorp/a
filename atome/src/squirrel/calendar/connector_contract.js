export const CALENDAR_V1_ARCHITECTURE_DECISION = Object.freeze({
    provider: 'tauri_caldav_primary',
    primary_write_source: {
        id: 'tauri_caldav_primary',
        protocol: 'caldav',
        role: 'primary',
        writable: true
    },
    execution_model: {
        sync_source_of_truth: 'primary_calendar_api',
        unified_index: 'primary_calendar_view',
        source_tagging: false,
        conflict_policy: 'primary_source_only',
        transition_mode: 'single_source'
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
    role = CALENDAR_V1_ARCHITECTURE_DECISION.primary_write_source.role,
    read_capabilities = ['calendar_today', 'calendar_next', 'calendar_search', 'calendar_sources'],
    write_capabilities = ['calendar_create', 'calendar_update', 'calendar_delete']
} = {}) => ({
    provider: String(provider || CALENDAR_V1_ARCHITECTURE_DECISION.provider),
    protocol: String(protocol || 'caldav'),
    role: String(role || CALENDAR_V1_ARCHITECTURE_DECISION.primary_write_source.role),
    read_capabilities: Array.isArray(read_capabilities) ? read_capabilities.map((entry) => String(entry)) : [],
    write_capabilities: Array.isArray(write_capabilities) ? write_capabilities.map((entry) => String(entry)) : []
});
