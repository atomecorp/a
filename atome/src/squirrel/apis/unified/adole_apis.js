import auth from './adole_api/auth.js';
import { flushBrowserWorkspace } from './adole_api/auth_methods_login.js';
import {
  create_project,
  list_projects,
  delete_project,
  get_current_project_id,
  get_current_project,
  set_current_project,
  load_saved_current_project
} from './adole_api/projects.js';
import { create_atome, list_atomes, delete_atome, alter_atome, realtime_patch, get_atome } from './adole_api/atomes.js';
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
  get_project_toolbox_state,
  save_global_toolbox_state,
  get_global_toolbox_state,
  save_activity_toolbox_state,
  get_activity_toolbox_state
} from './adole_api/activities.js';
import {
  share_atome,
  set_property_privacy_rule,
  list_property_privacy_rules,
  share_request,
  share_respond,
  share_publish,
  share_policy,
  grant_share_permission
} from './adole_api/sharing.js';
import {
  announceSurface,
  describeLocalSurface,
  ensureSurfaceAnnounced,
  getLocalSurfaceId,
  listSurfaces,
  pingSurface,
  retireSurface,
  setLocalSurfaceLabel
} from './adole_api/surfaces.js';
import { getSessionState, waitForAuthCheck } from './adole_api/session.js';
import { FastifyAdapter } from './adole.js';

// Kick off auth bootstrap immediately so UI waits on a single source of truth.
void auth.tryAutoLogin().catch(error => {
  globalThis.window?.dispatchEvent(new CustomEvent('squirrel:phone-login-error', { detail: { code: error.message || 'local_authorization_unavailable' } }));
});

const isAnonymousMode = () => getSessionState().mode === 'anonymous';
// Trame authentifiee vers Fastify ; `errorCode` nomme l'echec d'authentification.
const fastifyCall = async (message, errorCode) => {
  const prepared = await auth.ensureFastifyToken();
  if (!prepared?.ok) throw new Error(prepared?.error || prepared?.reason || errorCode);
  return FastifyAdapter.ws.send(message);
};
const getAnonymousIdentity = () => {
  const state = getSessionState();
  if (state.mode !== 'anonymous') return { phone: null, username: null };
  return { phone: state.user?.phone || null, username: state.user?.name || 'anonymous' };
};

export const AdoleAPI = {
  auth: {
    startPhoneLogin: auth.startPhoneLogin,
    resumePhoneLogin: auth.resumePhoneLogin,
    completePhoneLogin: auth.completePhoneLogin,
    cancelPhoneLogin: auth.cancelPhoneLogin,
    ensureLocalSession: auth.ensureLocalSession,
    logout: auth.logout,
    current: auth.current,
    deleteAccount: auth.deleteAccount,
    changePhone: auth.changePhone,
    refreshToken: auth.refreshToken,
    getCurrentInfo: auth.getCurrentInfo,
    setCurrentState: auth.setCurrentState,
    tryAutoLogin: auth.tryAutoLogin,
    ensureFastifyToken: auth.ensureFastifyToken,
    clearFastifyToken: auth.clearFastifyToken,
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
    getProjectToolboxState: get_project_toolbox_state,
    saveGlobalToolboxState: save_global_toolbox_state,
    getGlobalToolboxState: get_global_toolbox_state,
    saveActivityToolboxState: save_activity_toolbox_state,
    getActivityToolboxState: get_activity_toolbox_state
  },
  atomes: {
    create: create_atome,
    list: list_atomes,
    get: get_atome,
    delete: delete_atome,
    alter: alter_atome,
    realtimePatch: realtime_patch
  },
  surfaces: {
    localId: getLocalSurfaceId,
    describeLocal: describeLocalSurface,
    setLabel: setLocalSurfaceLabel,
    announce: announceSurface,
    ensureAnnounced: ensureSurfaceAnnounced,
    list: listSurfaces,
    ping: pingSurface,
    retire: retireSurface
  },
  sharing: {
    share: share_atome,
    request: share_request,
    respond: share_respond,
    publish: share_publish,
    policy: share_policy,
    // Modele de droits D8–D10 : changer les droits d'un partage, revoquer (en cascade),
    // lister les partages avec un pair.
    updateRights: (payload = {}) => fastifyCall({ type: 'share', action: 'update-rights', share_id: payload.shareId || payload.share_id,
      permissions: payload.permissions || payload.rights || {}, readable_properties: payload.readableProperties,
      writable_properties: payload.writableProperties }, 'sharing_auth_unavailable'),
    revoke: (shareId) => fastifyCall({ type: 'share', action: 'revoke', share_id: shareId }, 'sharing_auth_unavailable'),
    withPeer: (peerUserId) => fastifyCall({ type: 'share', action: 'with-peer', peer_user_id: peerUserId }, 'sharing_auth_unavailable'),
    grantPermission: grant_share_permission,
    setPrivacyRule: set_property_privacy_rule,
    listPrivacyRules: list_property_privacy_rules
  },
  sync: {
    sync: auth.sync,
    // Envoie au serveur ce que le workspace navigateur a cree localement (web seulement).
    flushWorkspace: flushBrowserWorkspace,
    listUnsynced: auth.listUnsynced,
    maybeSync: auth.maybeSync
  },
  directory: {
    list: async (options = {}) => {
      const prepared = await auth.ensureFastifyToken();
      if (!prepared?.ok) throw new Error(prepared?.error || prepared?.reason || 'directory_auth_unavailable');
      return FastifyAdapter.ws.send({
        type: 'directory', action: 'list', limit: options.limit, offset: options.offset
      });
    },
    search: async (query, options = {}) => {
      const prepared = await auth.ensureFastifyToken();
      if (!prepared?.ok) throw new Error(prepared?.error || prepared?.reason || 'directory_auth_unavailable');
      return FastifyAdapter.ws.send({
        type: 'directory', action: 'search', query, limit: options.limit, offset: options.offset
      });
    }
  },
  communication: {
    send: async ({ targetUserId = null, targetPhone = null, message = '' } = {}) => {
      const prepared = await auth.ensureFastifyToken();
      if (!prepared?.ok) throw new Error(prepared?.error || prepared?.reason || 'communication_auth_unavailable');
      const payload = String(message || '');
      if ((!targetUserId && !targetPhone) || !payload) throw new Error('communication_target_and_message_required');
      return FastifyAdapter.ws.send({
        type: 'direct-message',
        toUserId: targetUserId || undefined,
        toPhone: targetPhone || undefined,
        message: payload
      });
    },
    updateNotification: async ({ notificationId = null, patch = {} } = {}) => {
      const prepared = await auth.ensureFastifyToken();
      if (!prepared?.ok) throw new Error(prepared?.error || prepared?.reason || 'communication_auth_unavailable');
      const id = String(notificationId || '').trim();
      if (!id) throw new Error('communication_notification_id_required');
      return FastifyAdapter.ws.send({
        type: 'notification-stack', action: 'update', notificationId: id, patch
      });
    },
    removeNotification: async ({ notificationId = null } = {}) => {
      const prepared = await auth.ensureFastifyToken();
      if (!prepared?.ok) throw new Error(prepared?.error || prepared?.reason || 'communication_auth_unavailable');
      const id = String(notificationId || '').trim();
      if (!id) throw new Error('communication_notification_id_required');
      return FastifyAdapter.ws.send({ type: 'notification-stack', action: 'remove', notificationId: id });
    }
  },
  // Relations pair-a-pair (premier contact, blocage) : le serveur fait foi.
  contacts: {
    request: (userId, { note = '' } = {}) => fastifyCall({ type: 'contact', action: 'request', userId, note }, 'contacts_auth_unavailable'),
    respond: (userId, decision) => fastifyCall({ type: 'contact', action: 'respond', userId, decision }, 'contacts_auth_unavailable'),
    block: (userId) => fastifyCall({ type: 'contact', action: 'block', userId }, 'contacts_auth_unavailable'),
    unblock: (userId) => fastifyCall({ type: 'contact', action: 'unblock', userId }, 'contacts_auth_unavailable'),
    list: () => fastifyCall({ type: 'contact', action: 'list' }, 'contacts_auth_unavailable')
  },
  // News diffusees par le serveur : publication unique, abonnements par tags, registre de tags.
  news: {
    publish: ({ publication, tags = [], audience = 'all' } = {}) => fastifyCall(
      { type: 'news', action: 'publish', publication, tags, audience }, 'news_auth_unavailable'
    ),
    getSubscriptions: () => fastifyCall({ type: 'news', action: 'subscriptions-get' }, 'news_auth_unavailable'),
    setSubscriptions: (tags = []) => fastifyCall({ type: 'news', action: 'subscriptions-set', tags }, 'news_auth_unavailable'),
    searchTags: (query = '', { limit = 20 } = {}) => fastifyCall({ type: 'news', action: 'tags-search', query, limit }, 'news_auth_unavailable')
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
    startGuest: auth.startGuest,
    leaveGuest: auth.leaveGuest,
    adoptGuestWorkspace: auth.adoptGuestWorkspace,
    guestAdoptionStatus: auth.guestAdoptionStatus,
    declineGuestAdoption: auth.declineGuestAdoption,
    provisionAccount: auth.provisionAccount,
    signalAuthComplete: auth.signalAuthComplete,
    waitForAuthCheck: waitForAuthCheck
  }
};

export default AdoleAPI;
