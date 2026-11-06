// Process-wide service instances shared by the HTTP routes and the /ws/api
// handler. Created once by server.js (after .env is loaded); every consumer
// receives these same instances.
import path from 'path';
import db from '../database/adole.js';
import { createUserVaultRouter } from './userVaultRouter.js';
import { createWsSyncRuntime } from './wsSyncRuntime.js';
import { createWsSyncFront } from './ws_sync_front.js';
import { createSyncSharingService } from './syncSharingService.js';
import { createDirectoryClient } from './directory_client.js';
import {
  authenticateWsSyncMessage,
  authenticateWsSyncRequest,
  issueWsSyncChallenge,
  validateWsSyncPrincipal
} from './wsSyncSecurity.js';
import { findUserById } from './auth_users.js';
import { isWsApiPrincipalProvisioned } from './wsApiIdentity.js';
import { setFileReadResolver } from './userFiles.js';
import { getLocalVersion } from './githubSync.js';
import { enqueuePendingConsoleMessage, wsApiConnections, wsSendJsonToUser } from './wsApiState.js';
import { wsBroadcastJson } from './wsSend.js';
import { createPublicEventsStore } from './public_events_store.js';
import { createPublicEventGuard } from './public_events_guard.js';
import { createPublicEvents } from './public_events.js';
import { createObjectiveNetwork } from './objective_network.js';
import { createShop } from './shop.js';
import { createCoaches } from './coaches.js';
import { createScheduledSends } from './scheduled_sends.js';
import { createScheduledSendChannels } from './scheduled_send_channels.js';
import { createSiteServices } from './site_services.js';
import { pushNotificationToUserStack, setNotificationStackProvider } from './notificationStack.js';
import { setCommunicationPushProvider } from './communication_push.js';
import { createCommunicationRelations } from './communication_relations.js';
import { setFrontRelationEffects } from './ws_api_front.js';
import { createNotificationDelivery } from './communication_delivery.js';
import { createNewsService } from './news_service.js';

export function createServerServices({ projectRoot_env }) {
  const userVaultRouter = createUserVaultRouter({
    root: process.env.SQUIRREL_VAULT_ROOT || path.join(projectRoot_env, 'database_storage', 'vaults')
  });
  const wsSyncRuntime = createWsSyncRuntime({ provider: userVaultRouter.provider });
  setNotificationStackProvider(userVaultRouter.provider);
  setCommunicationPushProvider(userVaultRouter.provider);
  const wsSyncFront = createWsSyncFront({
    authenticateRequest: authenticateWsSyncRequest,
    authenticateMessage: authenticateWsSyncMessage,
    issueChallenge: issueWsSyncChallenge,
    validatePrincipal: validateWsSyncPrincipal,
    isProvisioned: isWsApiPrincipalProvisioned,
    getVersion: getLocalVersion
  });
  // Communication pair-a-pair : livraison serveur des notifications, premier contact, blocage.
  const deliverCommNotification = createNotificationDelivery({
    pushNotificationToUserStack,
    wsSendJsonToUser,
    enqueuePendingConsoleMessage,
    findUserById: (id) => findUserById(db.getDataSourceAdapter(), id)
  });
  const relationEffects = {
    notify: (targetId, senderId, notification) => deliverCommNotification(targetId, senderId, notification),
    // An accepted contact's card as its owner shares it (name, photo): what the other side may show.
    readCard: (id) => directoryPublicService.sourceProfile(id)
  };
  const communicationRelations = createCommunicationRelations({ provider: userVaultRouter.provider, ...relationEffects });
  // The same effects when the front decided (the `contact` family it answers).
  setFrontRelationEffects(relationEffects);
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
  // The News, its communities and forums: the Rust front's; a scheduled publication and a News's file read here.
  const news = createNewsService(userVaultRouter);
  setFileReadResolver('news', news.canReadMedia);
  // Un partage accepte (lien actif, ou copie acceptee) ouvre la lecture du fichier de l'atome
  // partage : sans cela, une note vocale partagee a un contact etait injouable (403).
  setFileReadResolver('sync_share', async (userId, atomeId, ownerId) => Boolean(await db.query('get',
    `SELECT share_id FROM sync_share_requests
   WHERE principal_id = ? AND atome_id = ? AND owner_id = ? AND status IN ('active', 'accepted')
     AND (expires_at IS NULL OR expires_at > datetime('now')) LIMIT 1`,
    [String(userId), String(atomeId), String(ownerId)])));
  const directoryPublicService = createDirectoryClient(userVaultRouter);
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
  // The objectives network (R-104 D8): who may be found for an objective, projected from their own Atomes.
  const objectiveNetwork = createObjectiveNetwork({ query: db.query.bind(db), vaultRouter: userVaultRouter, relations: communicationRelations,
    profileOf: (id) => directoryPublicService.sourceProfile(id).catch(() => null) });
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
    ...createScheduledSendChannels({ news, syncSharingService, vaultRouter: userVaultRouter,
      deliver: wsSendJsonToUser, enqueue: enqueuePendingConsoleMessage }),
    notify: (ownerId, notification) => deliverCommNotification(ownerId, null, notification),
    tell: (ownerId, frame) => wsSendJsonToUser(ownerId, frame, { scope: 'ws/api', op: frame.type, targetUserId: ownerId }) });
  // Websites: a project published at atome.one/<slug> (todo/publication_web_2026-10-28.md).
  const site = createSiteServices({ query: db.query.bind(db), vaultRouter: userVaultRouter, syncRuntime: wsSyncRuntime, projectRoot: projectRoot_env });
  return {
    publicEvents,
    objectiveNetwork,
    shop,
    coaches,
    scheduledSends,
    site,
    userVaultRouter,
    wsSyncRuntime,
    wsSyncFront,
    deliverCommNotification,
    communicationRelations,
    syncSharingService,
    directoryPublicService
  };
}
