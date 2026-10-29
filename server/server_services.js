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
import { getFileMetadata, registerFileUpload, setFileReadResolver } from './userFiles.js';
import { resolveDownloadTarget } from './server_uploads.js';
import { resolveUserAssetPath } from './fileStorage.js';
import { createNewsMediaCleaner } from './news_media_cleaner.js';
import { getLocalVersion } from './githubSync.js';
import { enqueuePendingConsoleMessage, wsApiConnections, wsSendJsonToUser } from './wsApiState.js';
import { wsBroadcastJson } from './wsSend.js';
import { createPublicEventsStore } from './public_events_store.js';
import { createPublicEventGuard } from './public_events_guard.js';
import { createPublicEvents } from './public_events.js';
import { createShop } from './shop.js';
import { createCoaches } from './coaches.js';
import { createScheduledSends } from './scheduled_sends.js';
import { createScheduledSendChannels } from './scheduled_send_channels.js';
import { createSiteServices } from './site_services.js';
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
    // An accepted contact's card as its owner shares it (name, photo): what the other side may show.
    readCard: (id) => directoryPublicService.sourceProfile(id),
    onAccepted: async ({ ownerId, peerId, note, at }) => persistAcceptedRequestNote(userVaultRouter,
      { ownerId, peer: await findUserById(db.getDataSourceAdapter(), peerId), note, at })
  });
  const directMessageRateAllowed = createRateLimiter();
  const syncSharingService = createSyncSharingService({
    vaultRouter: userVaultRouter,
    relations: communicationRelations,
    deliver: (targetId, senderId, notification) => deliverCommNotification(targetId, senderId, notification),
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
    // What the audience reads of a media: a clean copy, its EXIF and GPS stripped.
    cleanMedia: createNewsMediaCleaner({ resolveSource: resolveDownloadTarget, registerFile: registerFileUpload,
      assetPath: (ownerId, relative) => resolveUserAssetPath(projectRoot_env, { id: ownerId }, relative) }),
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
  const shop = createShop({ query: db.query.bind(db), vaultRouter: userVaultRouter, syncRuntime: wsSyncRuntime, relations: communicationRelations,
    findUserName: async (id) => (await directoryPublicService.sourceProfile(id).catch(() => null))?.display_name || '',
    notify: (targetId, senderId, notification) => deliverCommNotification(targetId, senderId, notification),
    broadcast: (change) => wsBroadcastJson(wsApiConnections, { type: 'shop-changed', ...change }, { scope: 'ws/api', op: 'shop-changed' }) });
  // Coaches (cahier FEAT-010/012): the public directory of coaching agendas, the bookings and their answers.
  const coaches = createCoaches({ query: db.query.bind(db), vaultRouter: userVaultRouter, syncRuntime: wsSyncRuntime, relations: communicationRelations,
    findUserName: async (id) => (await directoryPublicService.sourceProfile(id))?.display_name || '',
    notify: (targetId, senderId, notification) => deliverCommNotification(targetId, senderId, notification),
    broadcast: (change) => wsBroadcastJson(wsApiConnections, { type: 'coaches-changed', ...change }, { scope: 'ws/api', op: 'coaches-changed' }),
    tell: (userId, change) => wsSendJsonToUser(String(userId), { type: 'coach-bookings-changed', ...change }, { scope: 'ws/api', op: 'coach-bookings-changed', targetUserId: String(userId) }) });
  // Scheduled sends: held here and sent by the server's clock through the live paths above.
  const scheduledSends = createScheduledSends({ query: db.query.bind(db),
    ...createScheduledSendChannels({ newsBroadcast, syncSharingService, vaultRouter: userVaultRouter, relations: communicationRelations,
      rateAllowed: directMessageRateAllowed, deliver: wsSendJsonToUser, enqueue: enqueuePendingConsoleMessage }),
    notify: (ownerId, notification) => deliverCommNotification(ownerId, null, notification),
    tell: (ownerId, frame) => wsSendJsonToUser(ownerId, frame, { scope: 'ws/api', op: frame.type, targetUserId: ownerId }) });
  // Websites: a project published at atome.one/<slug> (todo/publication_web_2026-10-28.md).
  const site = createSiteServices({ query: db.query.bind(db), vaultRouter: userVaultRouter, syncRuntime: wsSyncRuntime, projectRoot: projectRoot_env });
  return {
    publicEvents,
    shop,
    coaches,
    scheduledSends,
    site,
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
