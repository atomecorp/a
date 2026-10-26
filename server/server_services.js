// Process-wide service instances shared by the HTTP routes and the /ws/api
// handler. Created once by server.js (after .env is loaded); every consumer
// receives these same instances.
import path from 'path';
import db from '../database/adole.js';
import { createUserVaultRouter } from './userVaultRouter.js';
import { createWsSyncRuntime } from './wsSyncRuntime.js';
import { createSyncSharingService } from './syncSharingService.js';
import { createDirectoryPublicService } from './directoryPublicService.js';
import {
  authenticateWsSyncMessage,
  authenticateWsSyncRequest,
  issueWsSyncChallenge,
  validateWsSyncPrincipal
} from './wsSyncSecurity.js';
import { createUserAtome, findUserById, findUserByPhone, listAllUsers } from './auth_users.js';
import { generateOpaquePrincipalId } from './auth_crypto.js';
import { isWsApiPrincipalProvisioned } from './wsApiIdentity.js';
import { getFileMetadata, setFileReadResolver } from './userFiles.js';
import { getLocalVersion } from './githubSync.js';
import { enqueuePendingConsoleMessage, wsApiConnections, wsSendJsonToUser } from './wsApiState.js';
import { wsBroadcastJson } from './wsSend.js';
import { createPublicEventsStore } from './public_events_store.js';
import { createPublicEventGuard } from './public_events_guard.js';
import { createPublicEvents } from './public_events.js';
import { pushNotificationToUserStack } from './notificationStack.js';
import { createCommunicationRelations } from './communication_relations.js';
import { persistAcceptedRequestNote } from './communication_messages.js';
import { createNotificationDelivery, createRateLimiter } from './communication_delivery.js';
import { createNewsBroadcast } from './news_broadcast.js';
import { createCommunities } from './communities.js';
import { logStructured } from './server_logger.js';

export function createServerServices({ projectRoot_env }) {
  const userVaultRouter = createUserVaultRouter({
    root: process.env.SQUIRREL_VAULT_ROOT || path.join(projectRoot_env, 'database_storage', 'vaults')
  });
  const wsSyncRuntime = createWsSyncRuntime({
    authenticateRequest: authenticateWsSyncRequest,
    authenticateMessage: authenticateWsSyncMessage,
    issueChallenge: issueWsSyncChallenge,
    validatePrincipal: validateWsSyncPrincipal,
    isProvisioned: isWsApiPrincipalProvisioned,
    getVersion: getLocalVersion,
    vaultRouter: userVaultRouter,
    reportFailure: (data) => logStructured('warn', { component: 'ws/sync', message: 'sync_processing_failed', data })
  });
  // Communication pair-a-pair : livraison serveur des notifications, premier contact, blocage.
  const deliverCommNotification = createNotificationDelivery({
    pushNotificationToUserStack,
    wsSendJsonToUser,
    enqueuePendingConsoleMessage,
    findUserById: (id) => findUserById(db.getDataSourceAdapter(), id)
  });
  const communicationRelations = createCommunicationRelations({
    notify: (targetId, senderId, notification) => deliverCommNotification(targetId, senderId, notification),
    findUserByPhone: (phone) => findUserByPhone(db.getDataSourceAdapter(), phone),
    findUserById: (id) => findUserById(db.getDataSourceAdapter(), id),
    onAccepted: async ({ ownerId, peerId, note, at }) => persistAcceptedRequestNote(userVaultRouter,
      { ownerId, peer: await findUserById(db.getDataSourceAdapter(), peerId), note, at })
  });
  const directMessageRateAllowed = createRateLimiter();
  const syncSharingService = createSyncSharingService({
    vaultRouter: userVaultRouter,
    relations: communicationRelations,
    syncRuntime: wsSyncRuntime,
    isProvisioned: isWsApiPrincipalProvisioned,
    notifyPrincipal: (principalId, payload) => wsSendJsonToUser(
      principalId,
      payload,
      { scope: 'ws/api', op: payload.type, targetUserId: principalId }
    )
  });
  // News : diffusion serveur (tous les utilisateurs, y compris prives : D1), tags, abonnements.
  // A community's posts are News with the community as audience.
  let communities = null;
  const findUserName = async (id) => (await findUserById(db.getDataSourceAdapter(), id).catch(() => null))?.username || null;
  const newsBroadcast = createNewsBroadcast({
    vaultProvider: userVaultRouter.provider,
    relations: communicationRelations,
    deliver: (targetId, senderId, notification) => deliverCommNotification(targetId, senderId, notification),
    listUserIds: async () => (await listAllUsers(db.getDataSourceAdapter(), true)).map((user) => user.user_id),
    findUserName,
    getFileMetadata,
    getCommunities: () => communities
  });
  communities = createCommunities({
    relations: communicationRelations,
    distribute: (publication) => newsBroadcast.distribute(publication),
    findUserByPhone: (phone) => findUserByPhone(db.getDataSourceAdapter(), phone),
    // A community's host is an ordinary private account, in the host's name.
    createAccount: ({ name, phone }) => createUserAtome(db.getDataSourceAdapter(), generateOpaquePrincipalId(), name, phone, 'private'),
    findUserName
  });
  const newsPublishRateAllowed = createRateLimiter({ max: 10, windowMs: 60_000 });
  setFileReadResolver('news', (userId, atomeId, ownerId) => newsBroadcast.canReadNewsMedia(userId, atomeId, { authorId: ownerId }));
  // Un partage accepte (lien actif, ou copie acceptee) ouvre la lecture du fichier de l'atome
  // partage : sans cela, une note vocale partagee a un contact etait injouable (403).
  setFileReadResolver('sync_share', async (userId, atomeId, ownerId) => Boolean(await db.query('get',
    `SELECT share_id FROM sync_share_requests
   WHERE principal_id = ? AND atome_id = ? AND owner_id = ? AND status IN ('active', 'accepted')
     AND (expires_at IS NULL OR expires_at > datetime('now')) LIMIT 1`,
    [String(userId), String(atomeId), String(ownerId)])));
  const directoryPublicService = createDirectoryPublicService({
    syncRuntime: wsSyncRuntime,
    vaultRouter: userVaultRouter
  });
  wsSyncRuntime.setDirectoryService(directoryPublicService);
  // Public events: the authors' published calendar events, projected into the shared base read by
  // the Activité rubrics; every open screen hears which cells changed (todo/evenements_publics_2026-10-26.md).
  const publicEventsStore = createPublicEventsStore({ query: db.query.bind(db) });
  const publicEvents = createPublicEvents({
    store: publicEventsStore,
    guard: createPublicEventGuard({ store: publicEventsStore, findUserById: (id) => findUserById(db.getDataSourceAdapter(), id) }),
    vaultRouter: userVaultRouter,
    syncRuntime: wsSyncRuntime,
    relations: communicationRelations,
    // The organiser shown: the name the account shares on its public card (its profile's sharing choices).
    findUserName: async (id) => (await directoryPublicService.sourceProfile(id).catch(() => null))?.display_name || '',
    broadcast: (cells) => wsBroadcastJson(wsApiConnections, { type: 'public-events-changed', cells }, { scope: 'ws/api', op: 'public-events-changed' })
  });
  return {
    publicEvents,
    userVaultRouter,
    wsSyncRuntime,
    deliverCommNotification,
    communicationRelations,
    directMessageRateAllowed,
    syncSharingService,
    newsBroadcast,
    newsPublishRateAllowed,
    communities,
    directoryPublicService
  };
}
