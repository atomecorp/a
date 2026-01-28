import {
  ANONYMOUS_USERNAME,
  resolve_anonymous_phone,
  is_anonymous_mode,
  ensure_anonymous_user,
  get_authenticated_user,
  require_authenticated_user,
  get_current_user_info,
  set_current_user_state,
  try_auto_login,
  ensure_fastify_token,
  wait_for_auth_check,
  signal_auth_check_complete,
  get_current_project,
  get_current_project_id,
  set_current_project,
  load_saved_current_project,
  current_user,
  create_user,
  log_user,
  unlog_user,
  delete_user,
  change_password,
  delete_account,
  refresh_token,
  set_user_visibility,
  user_list,
  lookup_user_by_phone,
  get_atome,
  sync_atomes,
  list_unsynced_atomes,
  maybe_sync_atomes,
  clear_ui_on_logout,
  get_current_machine,
  register_machine,
  get_machine_last_user,
  get_anonymous_user_id,
  migrate_anonymous_workspace
} from './adole/core.js';

import { create_project, list_projects, delete_project } from './adole/projects.js';
import { create_atome, list_atomes, delete_atome, alter_atome, realtime_patch } from './adole/atomes.js';
import {
  share_atome,
  share_request,
  share_respond,
  share_publish,
  share_policy,
  grant_share_permission
} from './adole/sharing.js';
import { list_tables } from './adole/debug.js';

export const AdoleAPI = {
  auth: {
    create: create_user,
    login: log_user,
    logout: unlog_user,
    current: current_user,
    delete: delete_user,
    changePassword: change_password,
    deleteAccount: delete_account,
    refreshToken: refresh_token,
    list: user_list,
    lookupPhone: lookup_user_by_phone,
    // Current user state management
    getCurrentInfo: get_current_user_info,
    setCurrentState: set_current_user_state,
    tryAutoLogin: try_auto_login,
    // Visibility management
    setVisibility: set_user_visibility,
    // Fastify token management
    ensureFastifyToken: ensure_fastify_token,
    // Security helpers
    isAuthenticated: () => !!get_authenticated_user(),
    getAuthenticatedUser: get_authenticated_user,
    requireAuth: require_authenticated_user
  },
  projects: {
    create: create_project,
    list: list_projects,
    delete: delete_project,
    // Current project management
    getCurrent: get_current_project,
    getCurrentId: get_current_project_id,
    setCurrent: set_current_project,
    loadSaved: load_saved_current_project
  },
  atomes: {
    create: create_atome,
    list: list_atomes,
    get: get_atome,
    delete: delete_atome,
    alter: alter_atome,
    realtimePatch: realtime_patch
  },
  sharing: {
    share: share_atome,
    request: share_request,
    respond: share_respond,
    publish: share_publish,
    policy: share_policy,
    grantPermission: grant_share_permission
  },
  sync: {
    sync: sync_atomes,
    listUnsynced: list_unsynced_atomes,
    maybeSync: maybe_sync_atomes
  },
  machine: {
    getCurrent: get_current_machine,
    register: register_machine,
    getLastUser: get_machine_last_user
  },
  security: {
    clearView: clear_ui_on_logout,
    isAuthenticated: () => !!get_authenticated_user(),
    getAuthenticatedUser: get_authenticated_user,
    requireAuth: require_authenticated_user,
    isAnonymous: () => is_anonymous_mode(),
    getAnonymousIdentity: () => ({ phone: resolve_anonymous_phone(), username: ANONYMOUS_USERNAME }),
    getAnonymousUserId: get_anonymous_user_id,
    ensureAnonymousUser: ensure_anonymous_user,
    migrateAnonymousWorkspace: migrate_anonymous_workspace,
    // Auth gate functions for startup coordination
    signalAuthComplete: signal_auth_check_complete,
    waitForAuthCheck: wait_for_auth_check
  },
  debug: {
    listTables: list_tables
  }
};

export default AdoleAPI;
