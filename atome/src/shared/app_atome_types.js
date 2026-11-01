// Atome types the application already commits but core_atome_types.js did not declare
// (R-104 phase A inventory, temp/r104/baseline/baseline_inventory_types.json, each one
// checked against a real writer and against the types stored in the dev vaults).
// They join CORE_ATOME_TYPE_DEFINITIONS so the server can refuse a type nobody declared
// (#shared/atome_type_gate.js). Their properties are the ones their writers write
// (#shared/atome_type_written_properties.js, R-104 D9): like every type, they refuse any other.

const declare = (type, kind, writer) => ({ type, kind, writer, schema: {} });

export const APP_ATOME_TYPES = Object.freeze([
    declare('user', 'user', 'atome/src/squirrel/apis/unified/adole_api/auth_workspace.js'),
    declare('guest_workspace', 'user', 'eVe/domains/user/profile_api.js'),
    declare('activity', 'data_model', 'atome/src/squirrel/apis/unified/adole_api/activities.js'),
    declare('tool_layer', 'data_model', 'atome/src/squirrel/apis/unified/adole_api/activities.js'),
    declare('toolbox_scope_state', 'data_model', 'atome/src/squirrel/apis/unified/adole_api/activities_toolbox_state.js'),
    declare('project_toolbox_state', 'data_model', 'atome/src/squirrel/apis/unified/adole_api/activities_toolbox_state.js'),
    declare('tool', 'tool', 'eVe/intuition/tools/core/tool_registry_storage.js'),
    declare('tool_macro', 'tool', 'eVe/intuition/tools/core/tool_registry_storage.js'),
    declare('toolbox', 'tool', 'eVe/intuition/tools/core/tool_registry_storage.js'),
    declare('tool_block', 'tool', 'eVe/intuition/tools/core/tool_registry_storage.js'),
    declare('panel', 'component', 'eVe/intuition/tools/core/tool_registry_storage.js'),
    declare('code_file', 'data_model', 'atome/src/squirrel/components/editor_builder_actions.js'),
    declare('tag', 'data_model', 'eVe/domains/news/news_tag_line_runtime.js'),
    declare('molecule', 'component', 'eVe/intuition/tools/molecule/nested/index.js'),
    declare('blackHole', 'data_model', 'eVe/intuition/tools/delete/blackhole_runtime.js'),
    declare('clipboard', 'data_model', 'eVe/intuition/tools/clipboard/state.js'),
    declare('system', 'data_model', 'server/userVaultRouter.js'),
    declare('file', 'media', 'server/file_types.js'),
    declare('sound', 'media', 'server/file_types.js'),
    declare('audio_recording', 'media', 'server/file_types.js'),
    declare('video_recording', 'media', 'server/file_types.js'),
    declare('raw', 'media', 'server/file_types.js'),
    declare('site', 'data_model', 'eVe/domains/site/site_runtime.js'),
    declare('shop_listing', 'data_model', 'eVe/domains/shop/shop_runtime.js'),
    declare('share_request', 'policy', 'server/sharing_requests.js'),
    declare('share_policy', 'policy', 'server/sharing.js'),
    declare('generic', 'generic', 'database/adole_event_atome_upsert.js')
]);
