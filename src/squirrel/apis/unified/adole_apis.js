import auth from './v2/auth.js';
import {
  create_project,
  list_projects,
  delete_project,
  get_current_project_id,
  get_current_project,
  set_current_project,
  load_saved_current_project
} from './v2/projects.js';
import { create_atome, list_atomes, delete_atome, alter_atome, realtime_patch, get_atome } from './v2/atomes.js';
import {
  create_activity,
  list_activities,
  get_current_activity_id,
  get_current_activity,
  set_current_activity,
  load_saved_current_activity,
  save_tool_layer,
  list_tool_layers,
  resolve_tool_context,
  save_project_toolbox_state,
  get_project_toolbox_state
} from './v2/activities.js';
import {
  share_atome,
  share_request,
  share_respond,
  share_publish,
  share_policy,
  grant_share_permission
} from './v2/sharing.js';
import { list_tables } from './adole/debug.js';
import { getSessionState, waitForAuthCheck } from './v2/session.js';

// Kick off auth bootstrap immediately so UI waits on a single source of truth.
try { auth.tryAutoLogin(); } catch (_) { }

const isAnonymousMode = () => getSessionState().mode === 'anonymous';
const getAnonymousIdentity = () => {
  const state = getSessionState();
  if (state.mode !== 'anonymous') return { phone: null, username: null };
  return { phone: state.user?.phone || null, username: state.user?.name || 'anonymous' };
};

export const AdoleAPI = {
  auth: {
    create: auth.register,
    login: auth.login,
    logout: auth.logout,
    current: auth.current,
    delete: auth.delete,
    changePassword: auth.changePassword,
    deleteAccount: auth.deleteAccount,
    refreshToken: auth.refreshToken,
    list: auth.list,
    lookupPhone: auth.lookupPhone,
    getCurrentInfo: auth.getCurrentInfo,
    setCurrentState: auth.setCurrentState,
    tryAutoLogin: auth.tryAutoLogin,
    setVisibility: auth.setVisibility,
    ensureFastifyToken: auth.ensureFastifyToken,
    isAuthenticated: () => getSessionState().mode === 'authenticated',
    getAuthenticatedUser: () => (getSessionState().mode === 'authenticated' ? getSessionState().user : null),
    requireAuth: auth.requireAuth
  },
  projects: {
    create: create_project,
    list: list_projects,
    delete: delete_project,
    getCurrent: get_current_project,
    getCurrentId: get_current_project_id,
    setCurrent: set_current_project,
    loadSaved: load_saved_current_project
  },
  activities: {
    create: create_activity,
    list: list_activities,
    getCurrent: get_current_activity,
    getCurrentId: get_current_activity_id,
    setCurrent: set_current_activity,
    loadSaved: load_saved_current_activity,
    saveToolLayer: save_tool_layer,
    listToolLayers: list_tool_layers,
    resolveToolContext: resolve_tool_context,
    saveProjectToolboxState: save_project_toolbox_state,
    getProjectToolboxState: get_project_toolbox_state
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
    sync: auth.sync,
    listUnsynced: auth.listUnsynced,
    maybeSync: auth.maybeSync
  },
  machine: {
    getCurrent: auth.getCurrentMachine,
    register: auth.registerMachine,
    getLastUser: auth.getMachineLastUser
  },
  security: {
    clearView: auth.clearView,
    isAuthenticated: () => getSessionState().mode === 'authenticated',
    getAuthenticatedUser: () => (getSessionState().mode === 'authenticated' ? getSessionState().user : null),
    requireAuth: auth.requireAuth,
    isAnonymous: () => isAnonymousMode(),
    getAnonymousIdentity: () => getAnonymousIdentity(),
    getAnonymousUserId: () => (getSessionState().mode === 'anonymous' ? getSessionState().user?.id || null : null),
    ensureAnonymousUser: auth.ensureAnonymousUser,
    migrateAnonymousWorkspace: auth.migrateAnonymousWorkspace,
    signalAuthComplete: auth.signalAuthComplete,
    waitForAuthCheck: waitForAuthCheck
  },
  debug: {
    listTables: list_tables
  }
};

export default AdoleAPI;
