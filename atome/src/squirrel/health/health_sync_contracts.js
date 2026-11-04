import { validateParams } from '../ai/agent_gateway_normalize.js';
import { ACTIVITY_SOURCE_CATEGORIES } from '../../shared/activity_source_contract.js';

// One contract for runtime V2, AI discovery, voice and direct MCP calls: this device's health store (Apple Health on
// iOS, Health Connect on Android) as a source of the person's sport sessions (#health_activity_sync.js, D18
// improvement 6). Préférences › Santé runs the same commands. They answer states and counts only: the sessions and
// their measures are never answered, and the assistant never reads them.
export const HEALTH_SYNC_ERRORS = Object.freeze(['INVALID_ARGUMENT', 'AUTH_REQUIRED', 'CONTEXT_CHANGED', 'NOT_CONNECTED',
    'IMPORT_WRITE_FAILED', 'SOURCE_WRITE_FAILED', 'health_host_unsupported', 'health_access_sealed', 'health_account_required',
    'health_link_required', 'health_context_changed', 'health_store_unavailable', 'health_connect_unavailable',
    'health_permission_required', 'health_access_request_in_flight', 'health_anchor_invalid', 'health_activities_reply_invalid',
    'temporarily_unavailable', 'HEALTH_SYNC_FAILED']);
const categories = { type: 'array', uniqueItems: true, maxItems: ACTIVITY_SOURCE_CATEGORIES.length,
    items: { type: 'string', enum: ACTIVITY_SOURCE_CATEGORIES }, description: 'What to import: the sessions (workouts, always) and their heart rate, active energy, distance and steps. All when absent.' };
const definitions = {
    get_state: [{}, [], 'read', 'Tell whether this device has a health store eVe can import sport sessions from (Apple Health, Health Connect), whether it is connected, the categories chosen and the moment of the last complete synchronization. Never opens a sheet.'],
    connect: [{ categories }, [], 'control', 'Connect this device\'s health store: the store\'s own sheet asks the person for each chosen category, then the authorized history of their sport sessions is imported (whatever app recorded them), then only what changes. Answers counts only.'],
    sync: [{}, [], 'write', 'Import what changed in the connected health store since the last synchronization. Idempotent: a session already imported and unchanged is not written again. Answers counts only.'],
    disconnect: [{}, [], 'control', 'Disconnect the health store: eVe stops reading it. The sessions already imported stay. The store\'s own permissions are withdrawn in its settings (health_sync.open_settings).'],
    open_settings: [{}, [], 'control', 'Open the store\'s own settings, where the person allows or withdraws each category (Settings › Health on iPhone, Health Connect on Android).']
};
export const HEALTH_SYNC_COMMANDS = Object.freeze(Object.entries(definitions).map(([action, [properties, required, access, description]]) => Object.freeze({
    action, name: `health_sync.${action}`, access, description, capability: `health_sync.${access}`,
    input_schema: { type: 'object', additionalProperties: false, properties, required },
    output_schema: { type: 'object', required: ['ok'], properties: { ok: { type: 'boolean' }, error: { type: 'string', enum: HEALTH_SYNC_ERRORS },
        supported: { type: 'boolean' }, source: { type: 'string', enum: ['apple_health', 'health_connect'] },
        state: { type: 'string', enum: ['unsupported', 'disconnected', 'connected'] }, categories: { type: 'array' }, refused: { type: 'array' },
        last_sync_at: { type: 'string' }, history_done: { type: 'boolean' }, more: { type: 'boolean' }, kept_imported: { type: 'boolean' },
        added: { type: 'integer' }, updated: { type: 'integer' }, unchanged: { type: 'integer' }, rejected: { type: 'integer' }, deleted: { type: 'integer' } } }
})));
export const HEALTH_SYNC_CONFIRMED_COMMANDS = Object.freeze(['health_sync.connect', 'health_sync.disconnect']);
export const validateHealthSyncInput = (action, input = {}) => {
    const contract = HEALTH_SYNC_COMMANDS.find(command => command.action === action);
    return contract && validateParams(contract.input_schema, input).ok ? null : 'INVALID_ARGUMENT';
};
export const HEALTH_SYNC_ASSISTANT_INSTRUCTIONS = 'Health store sessions: « connecte Santé » or « connecte Health Connect » calls health_sync.connect (the store\'s own sheet asks the person); « synchronise mes activités » calls health_sync.sync; « déconnecte Santé » calls health_sync.disconnect (the imported sessions stay); « où retirer l\'accès » calls health_sync.open_settings; « quand ai-je synchronisé » calls health_sync.get_state. You never read the imported sessions or their values: only say how many were added or updated.';
const healthSyncError = error => (HEALTH_SYNC_ERRORS.includes(error) ? error : 'HEALTH_SYNC_FAILED');

/** The service executor of the family (eVe/intuition/tools/core/tool_runtime_service_commands.js). */
export const executeHealthSyncCommand = async (action, input = {}) => {
    if (validateHealthSyncInput(action, input)) return { ok: false, error: 'INVALID_ARGUMENT' };
    const { getHealthOwner } = await import('./index.js');
    const sync = getHealthOwner().activitySync;
    const run = { get_state: () => sync.state(), connect: () => sync.connect(input), sync: () => sync.sync(), disconnect: () => sync.disconnect(),
        open_settings: () => sync.openSettings() }[action];
    const result = await run();
    return result.ok ? result : { ok: false, error: healthSyncError(result.error) };
};
