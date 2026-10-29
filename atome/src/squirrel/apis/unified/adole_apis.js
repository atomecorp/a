import { getWorkspaceSyncStatus } from './adole_api/sync_status.js';
import auth from './adole_api/auth.js';
import { contactBookPhone } from '../../../shared/contact_book_hash.js';
import { accountMethods } from './adole_api/auth_methods_account.js';
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
  readLocalSurfaceName,
  renameLocalSurface,
  retireSurface
} from './adole_api/surfaces.js';
// Also installs the executor that answers commands from the account's other devices.
import { listRemoteSurfaces, runRemoteCommand } from '../../teleport/remote_command.js';
// Installs the teleport lifecycle: every authenticated surface answers the offers
// addressed to it, not only one that already pressed a teleport tool.
import '../../teleport/teleport_manager.js';
import { getSessionState, waitForAuthCheck } from './adole_api/session.js';
import { FastifyAdapter } from './adole.js';

// Kick off auth bootstrap immediately so UI waits on a single source of truth.
// Only the application's own document owns the session: a frame it embeds (the
// project preview capture renderer) shares its storage, and its bootstrap, without
// the native bridge, failed and erased the stored session (a guest lost on relaunch).
if (globalThis.window?.top === globalThis.window) void auth.tryAutoLogin().catch(error => {
  globalThis.window?.dispatchEvent(new CustomEvent('squirrel:phone-login-error', { detail: { code: error.message || 'local_authorization_unavailable' } }));
});

const isAnonymousMode = () => getSessionState().mode === 'anonymous';
// Trame authentifiee vers Fastify ; `errorCode` nomme l'echec d'authentification.
const fastifyCall = async (message, errorCode) => {
  const prepared = await auth.ensureFastifyToken();
  if (!prepared?.ok) throw new Error(prepared?.error || prepared?.reason || errorCode);
  return FastifyAdapter.ws.send(message);
};
// A card number ("06 12 34 56 78" from a native book) is dialled from THIS device:
// its country is known here, never on the server, so it leaves already in E.164.
const dialledPhone = (phone) => {
  if (!phone) return '';
  const e164 = contactBookPhone(phone);
  if (!e164) throw new Error('contact_phone_invalid');
  return e164;
};
const getAnonymousIdentity = () => {
  const state = getSessionState();
  if (state.mode !== 'anonymous') return { phone: null, username: null };
  return { phone: state.user?.phone || null, username: state.user?.name || 'anonymous' };
};

export const AdoleAPI = {
  auth: {
    startPhoneLogin: auth.startPhoneLogin,
    payPhoneLogin: auth.payPhoneLogin,
    resumePhoneLogin: auth.resumePhoneLogin,
    resendPhoneLogin: auth.resendPhoneLogin,
    getPendingPhoneLogin: auth.getPendingPhoneLogin,
    completePhoneLogin: auth.completePhoneLogin,
    confirmPhoneLogin: auth.confirmPhoneLogin,
    cancelPhoneLogin: auth.cancelPhoneLogin,
    loginWithPassword: auth.loginWithPassword,
    setPassword: auth.setPassword,
    hasKnownPassword: auth.hasKnownPassword,
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
    requireAuth: auth.requireAuth,
    // Authentication V1: accounts without phone, pairing, devices and recovery.
    ...accountMethods
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
    localName: readLocalSurfaceName,
    rename: renameLocalSurface,
    announce: announceSurface,
    ensureAnnounced: ensureSurfaceAnnounced,
    list: listSurfaces,
    ping: pingSurface,
    retire: retireSurface,
    listRemote: listRemoteSurfaces,
    run: runRemoteCommand
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
    getStatus: getWorkspaceSyncStatus,
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
    },
    // Rencontre: the public cards answering `{ goal, theme, scope, query }` (shared/meeting_contract.js).
    meet: async (options = {}) => {
      const prepared = await auth.ensureFastifyToken();
      if (!prepared?.ok) throw new Error(prepared?.error || prepared?.reason || 'directory_auth_unavailable');
      return FastifyAdapter.ws.send({
        type: 'directory', action: 'meet', goal: options.goal, theme: options.theme, scope: options.scope,
        query: options.query, limit: options.limit
      });
    },
    // One person's Rencontre card (hook, presentation, photos), under the search that found them.
    meetCard: async (options = {}) => {
      const prepared = await auth.ensureFastifyToken();
      if (!prepared?.ok) throw new Error(prepared?.error || prepared?.reason || 'directory_auth_unavailable');
      return FastifyAdapter.ws.send({
        type: 'directory', action: 'meet_card', principalId: options.principalId, goal: options.goal, theme: options.theme, scope: options.scope
      });
    }
  },
  communication: {
    readConversation: async ({ contactId, targetPhone = '', cursor = null, messageId = null, limit = 30 } = {}) => {
      const result = await fastifyCall({ type: 'conversation', contactId, targetPhone: dialledPhone(targetPhone), cursor, messageId, limit }, 'communication_auth_unavailable');
      if (!result.ok) throw new Error(result.error || 'conversation_read_failed');
      return result;
    },
    // Deleted for me only (the other participant keeps theirs): `messageIds`, or `all` the conversation.
    deleteConversation: async ({ contactId, targetPhone = '', messageIds = [], all = false } = {}) => {
      const result = await fastifyCall({ type: 'conversation', action: 'delete', contactId, targetPhone: dialledPhone(targetPhone),
        messageIds, all: all === true }, 'communication_auth_unavailable');
      if (!result.ok) throw new Error(result.error || 'conversation_delete_failed');
      return result;
    },
    visio: async ({ action, input = {} } = {}) => {
      const result = await fastifyCall({ type: 'visio', action, input }, 'communication_auth_unavailable');
      if (!result.ok) throw new Error(result.error || 'visio_command_failed');
      return result.data;
    },
    send: async ({ targetUserId = null, targetPhone = null, message = '' } = {}) => {
      const prepared = await auth.ensureFastifyToken();
      if (!prepared?.ok) throw new Error(prepared?.error || prepared?.reason || 'communication_auth_unavailable');
      const payload = String(message || '');
      if ((!targetUserId && !targetPhone) || !payload) throw new Error('communication_target_and_message_required');
      return FastifyAdapter.ws.send({
        type: 'direct-message',
        toUserId: targetUserId || undefined,
        toPhone: dialledPhone(targetPhone) || undefined,
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
    // La pile de notifications telle que le serveur l'a ecrite (jamais la copie locale).
    readNotifications: () => fastifyCall({ type: 'notification-stack', action: 'read' }, 'communication_auth_unavailable'),
    publishNotification: notification => fastifyCall({ type: 'notification-stack', action: 'publish', notification }, 'communication_auth_unavailable'),
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
    // `target` : un id d'utilisateur, ou `{ userId }` / `{ phone }` (un numero suffit, L11).
    request: (target, { note = '' } = {}) => {
      const byObject = target && typeof target === 'object';
      return fastifyCall({
        type: 'contact', action: 'request', note,
        userId: byObject ? target.userId || null : target,
        phone: byObject ? dialledPhone(target.phone) || null : null
      }, 'contacts_auth_unavailable');
    },
    // « Accepter les demandes de personnes absentes de mon carnet » (defaut : oui).
    getPreferences: () => fastifyCall({ type: 'contact', action: 'preferences-get' }, 'contacts_auth_unavailable'),
    setPreferences: ({ acceptUnknown = true } = {}) => fastifyCall(
      { type: 'contact', action: 'preferences-set', acceptUnknown: acceptUnknown !== false }, 'contacts_auth_unavailable'
    ),
    // Carnet sous forme d'empreintes (atome/src/shared/contact_book_hash.js), jamais en clair.
    setAddressBook: (hashes = []) => fastifyCall({ type: 'contact', action: 'address-book-set', hashes }, 'contacts_auth_unavailable'),
    respond: (userId, decision) => fastifyCall({ type: 'contact', action: 'respond', userId, decision }, 'contacts_auth_unavailable'),
    block: (userId) => fastifyCall({ type: 'contact', action: 'block', userId }, 'contacts_auth_unavailable'),
    unblock: (userId) => fastifyCall({ type: 'contact', action: 'unblock', userId }, 'contacts_auth_unavailable'),
    list: () => fastifyCall({ type: 'contact', action: 'list' }, 'contacts_auth_unavailable')
  },
  // News diffusees par le serveur : publication unique, abonnements par tags, registre de tags.
  news: {
    // `reply` ({ parent_id, anchor_ms }): a VideoTrain reply, its audience the thread's (server/news_thread.js).
    publish: ({ publication, tags = [], audience = 'all', reply = null } = {}) => fastifyCall(
      { type: 'news', action: 'publish', publication, tags, audience, ...(reply ? { reply } : {}) }, 'news_auth_unavailable'
    ),
    getSubscriptions: () => fastifyCall({ type: 'news', action: 'subscriptions-get' }, 'news_auth_unavailable'),
    setSubscriptions: (tags = []) => fastifyCall({ type: 'news', action: 'subscriptions-set', tags }, 'news_auth_unavailable'),
    searchTags: (query = '', { limit = 20 } = {}) => fastifyCall({ type: 'news', action: 'tags-search', query, limit }, 'news_auth_unavailable'),
    // A received publication: liked (its author alone learns it), or reposted to the reader's audience.
    like: (newsId) => fastifyCall({ type: 'news', action: 'like', newsId }, 'news_auth_unavailable'),
    repost: (newsId) => fastifyCall({ type: 'news', action: 'repost', newsId }, 'news_auth_unavailable'),
    // VideoTrain: an exercise's threads as this reader sees them, one vote per contribution, a report, a withdrawal.
    thread: (threadRef) => fastifyCall({ type: 'news', action: 'thread', threadRef }, 'news_auth_unavailable'),
    vote: (newsId, on = true) => fastifyCall({ type: 'news', action: 'vote', newsId, on: on !== false }, 'news_auth_unavailable'),
    report: (newsId, reason = '') => fastifyCall({ type: 'news', action: 'report', newsId, reason }, 'news_auth_unavailable'),
    retire: (newsId) => fastifyCall({ type: 'news', action: 'retire', newsId }, 'news_auth_unavailable')
  },
  // Public events (server/public_events.js): reading goes through `shows-nearby` kind `declared`; a report here.
  publicEvents: {
    report: (eventId, reason) => fastifyCall({ type: 'public-events', action: 'report', eventId, reason }, 'events_auth_unavailable')
  },
  // The shop (server/ws_shop.js) with an account: buying, an order's moves, a sale's conversations, a report.
  // Browsing is the public `shop-public` frame (eVe/domains/shop/shop_runtime.js).
  shop: {
    call: (action, fields = {}) => fastifyCall({ ...fields, type: 'shop', action }, 'shop_auth_unavailable')
  },
  // Coaches (server/ws_coaches.js) with an account: asking for a session, a coach's answer, a cancellation, one's bookings.
  // Searching is the public `coaches-public` frame (eVe/domains/coaches/coach_runtime.js).
  coaches: {
    call: (action, fields = {}) => fastifyCall({ ...fields, type: 'coaches', action }, 'coach_auth_unavailable')
  },
  // Websites (server/site_services.js): publishing, versions, planned operations, domains, mail, hosting.
  site: {
    call: (action, fields = {}) => fastifyCall({ ...fields, type: 'site', action }, 'site_auth_unavailable')
  },
  // Scheduled sends (server/scheduled_sends.js): save, cancel, send-now, read, list; the server's clock sends them.
  scheduledSends: {
    call: (action, fields = {}) => fastifyCall({ ...fields, type: 'scheduled-send', action }, 'scheduled_auth_unavailable')
  },
  // Forums (server/forums.js): create, invite, respond, claim (an e-mail's link), leave, list, members, feed.
  // A member posts through `news.publish` with `{ forum }` as audience.
  forums: {
    call: (action, fields = {}) => fastifyCall({ ...fields, type: 'forum', action }, 'forum_auth_unavailable')
  },
  // Communities (atome/src/shared/community_contract.js): joining, the thread of its members,
  // the host's moderation. A member posts through `news.publish` with `{ community }` as audience.
  communities: {
    join: (community) => fastifyCall({ type: 'community', action: 'join', community }, 'community_auth_unavailable'),
    leave: (community) => fastifyCall({ type: 'community', action: 'leave', community }, 'community_auth_unavailable'),
    feed: (community) => fastifyCall({ type: 'community', action: 'feed', community }, 'community_auth_unavailable'),
    members: (community) => fastifyCall({ type: 'community', action: 'members', community }, 'community_auth_unavailable'),
    refuse: (community, userId) => fastifyCall({ type: 'community', action: 'refuse', community, userId }, 'community_auth_unavailable'),
    ban: (community, userId) => fastifyCall({ type: 'community', action: 'ban', community, userId }, 'community_auth_unavailable'),
    unban: (community, userId) => fastifyCall({ type: 'community', action: 'unban', community, userId }, 'community_auth_unavailable'),
    removePost: (community, newsId) => fastifyCall({ type: 'community', action: 'remove-post', community, newsId }, 'community_auth_unavailable')
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
