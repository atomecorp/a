// /ws/api connection: connection identity, the per-message dispatch across the
// operation families (in their historical order) and connection cleanup.
import db from '../database/adole.js';
import { makeId } from '../atome/src/squirrel/shared/scalars.js';
import { wsSendJson } from './wsSend.js';
import {
  wsApiConnections,
  enqueuePendingConsoleMessage,
  attachWsApiClientToUser,
  detachWsApiClient,
  wsSendJsonToUser
} from './wsApiState.js';
import { validateConnectionDeviceSession } from './auth_session_validation.js';
import { requiredJwtSecret as getRequiredJwtSecret } from './wsApiIdentity.js';
import { handleWsApiGuestAdoption } from './wsApiGuestAdoption.js';
import { announceWsSurfaceDisconnect } from './wsSurfaceOperations.js';
import { handleTeleportSurfaceLoss } from './wsTeleportOperations.js';
import { handleRemoteControlSurfaceLoss, handleWsRemoteControlOperation } from './wsRemoteControlOperations.js';
import { handleWsApiOperationFamilies } from './wsApiOperationChain.js';
import { handleWsFileOperation } from './wsFileOperations.js';
import { handleWsCommunication } from './wsCommunicationOperations.js';
import { handleWsNotificationOperation } from './wsNotificationOperations.js';
import { deleteFile, registerFileUpload } from './userFiles.js';
import { normalizeUserRelativePath, resolveUserAssetPath, resolveUserUploadPath } from './fileStorage.js';
import { ensureVideoPlaybackCache } from './server_media.js';
import { sanitizeUploadId, coerceWsChunkSize, resolveUserId } from './server_utils.js';
import { listUserDownloadsSnapshot, resolveDownloadTarget } from './server_uploads.js';
import { handleWsApiAtomeRequest } from './ws_api_atome_request.js';
import { handleWsNewsRequest, handleWsMembershipRequest, handleWsContactRequest, handleWsShareRequest, handleWsShellRequest } from './ws_api_message_handlers.js';

export function registerWsApiRoute(server, {
  projectRoot,
  UPLOADS_TMP_DIR,
  DATABASE_ENABLED,
  validateToken,
  phoneLinkAuth,
  userVaultRouter,
  wsSyncRuntime,
  directoryPublicService,
  communicationRelations,
  directMessageRateAllowed,
  syncSharingService,
  newsBroadcast,
  newsPublishRateAllowed,
  communities,
  forums,
  publicEvents,
  shop,
  coaches,
  scheduledSends,
  site
}) {
  // Route WebSocket pour API calls (replaces HTTP fetch)
  server.register(async function (fastify) {
    fastify.get('/ws/api', { websocket: true }, async (connection, request) => {
      // Assign a stable connection id for audit/debugging (server-side only)
      try {
        const crypto = await import('crypto');
        connection._wsApiConnectionId = crypto.randomUUID();
      } catch (error) {
        console.warn("[server] operation failed", error);
        connection._wsApiConnectionId = makeId('ws');
      }

      if (process.env.WS_CONNECTION_DEBUG === '1') {
        console.log('🔗 New WebSocket API connection');
      }

      try { wsApiConnections.add(connection); } catch (error) {
        console.warn("[server] operation failed", error);
      }
      // Key-bound tokens need a signed connection proof here (auth_session_validation.js).
      connection._wsApiRequiresProof = true;
      connection._wsApiVaultRouter = userVaultRouter;
      connection._wsApiSyncRuntime = wsSyncRuntime;
      connection._wsApiDirectoryService = directoryPublicService;
      connection._wsApiPublicEvents = publicEvents;
      connection._wsApiShop = shop;
      connection._wsApiCoaches = coaches;
      connection._wsApiScheduledSends = scheduledSends;
      connection._wsApiSite = site;

      try {
        const requestUser = await validateToken(request);
        const requestUserId = resolveUserId(requestUser);
        // A key-bound token proves nothing before the connection proof.
        if (requestUserId && requestUser?.cnf?.pop !== true) {
          attachWsApiClientToUser(connection, requestUserId);
          if (requestUser && typeof requestUser.exp === 'number') {
            connection._wsApiAuthExpMs = requestUser.exp * 1000;
          }
        }
      } catch (error) {
        console.warn("[server] operation failed", error);
      }

      const unknownMessageTypesSeen = new Set();

      const safeSend = (payload) => wsSendJson(connection, payload, { scope: 'ws/api', op: 'reply' });

      connection.on('message', async (message) => {
        let data;
        try {
          data = JSON.parse(message.toString());
        } catch (e) {
          safeSend({ type: 'error', message: 'Invalid JSON' });
          return;
        }

        const phoneLinkResponse = await phoneLinkAuth?.handle(data, connection, request.ip);
        if (phoneLinkResponse) {
          safeSend(phoneLinkResponse);
          return;
        }

        try {
          await validateConnectionDeviceSession(connection, data.token, getRequiredJwtSecret());
        } catch {
          detachWsApiClient(connection);
          safeSend({ type: `${String(data.type || 'error')}-response`, requestId: data.requestId || data.request_id,
            success: false, ok: false, error: 'auth_session_invalid' });
          return;
        }

        const familyResponse = await handleWsApiOperationFamilies(data, connection, request.ip);
        if (familyResponse) {
          safeSend(familyResponse);
          return;
        }

        if (String(data?.type || '') === 'remote-control') {
          const remoteControlResponse = await handleWsRemoteControlOperation(data, connection);
          // Input events may opt out of a reply; the family still handled them.
          if (remoteControlResponse) safeSend(remoteControlResponse);
          return;
        }

        if (data.type === 'notification-stack') {
          safeSend(await handleWsNotificationOperation(data, connection));
          return;
        }

        // Handle direct messages (targeted, console-only)
        if (['direct-message', 'conversation', 'visio'].includes(data.type)) {
          await handleWsCommunication({ data, connection, safeSend, relations: communicationRelations,
            rateAllowed: directMessageRateAllowed, deliver: wsSendJsonToUser,
            enqueue: enqueuePendingConsoleMessage, visio: server.visioService });
          return;
        }

        // Handle ping/pong
        if (data.type === 'ping') {
          safeSend({ type: 'pong' });
          return;
        }

        // Handle file requests (ADOLE v3.0 WebSocket)
        // File-transfer family: extracted to server/wsFileOperations.js (P1-2).
        // The 2 465-line handler kept every family inline; this one is the first
        // moved out. Only closure values travel, the body is unchanged.
        if (data.type === 'file') {
          await handleWsFileOperation({
            connection,
            data,
            safeSend,
            projectRoot,
            UPLOADS_TMP_DIR,
            deps: {
              databaseEnabled: DATABASE_ENABLED, coerceWsChunkSize, ensureVideoPlaybackCache, getRequiredJwtSecret,
              listUserDownloadsSnapshot, normalizeUserRelativePath, registerFileUpload,
              resolveDownloadTarget, resolveUserAssetPath, resolveUserUploadPath, sanitizeUploadId, deleteFile
            }
          });
          return;
        }

        // Handle auth requests (ADOLE v3.0 WebSocket-only)
        const guestAdoptionResponse = await handleWsApiGuestAdoption(data, {
          dataSource: db.getDataSourceAdapter(),
          connection,
          projectRoot
        });
        if (guestAdoptionResponse) {
          safeSend(guestAdoptionResponse);
          return;
        }

        // Handle atome requests (ADOLE v3.0 WebSocket-only)
        if (data.type === 'atome') {
          await handleWsApiAtomeRequest({ data, connection, safeSend });
          return;
        }

        if (data.type === 'news') {
          await handleWsNewsRequest({ data, connection, safeSend, newsBroadcast, newsPublishRateAllowed });
          return;
        }

        if (data.type === 'community' || data.type === 'forum') {
          await handleWsMembershipRequest({ data, connection, safeSend, service: data.type === 'forum' ? forums : communities, kind: data.type });
          return;
        }

        if (data.type === 'contact') {
          await handleWsContactRequest({ data, connection, safeSend, communicationRelations });
          return;
        }

        // Handle share requests (permissions) over ws/api
        if (data.type === 'share') {
          await handleWsShareRequest({ data, connection, safeSend, communicationRelations, syncSharingService });
          return;
        }

        // Handle shell commands (highly restricted)
        if (data.type === 'shell') {
          await handleWsShellRequest({ data, connection, safeSend, projectRoot });
          return;
        }

        // Unknown message type: do not notify any client, log server-side only
        const unknownType = String(data?.type || '');
        if (!unknownMessageTypesSeen.has(unknownType)) {
          unknownMessageTypesSeen.add(unknownType);
          console.warn(`[ws/api] Unknown message type: ${unknownType}`);
        }
        return;
      });

      connection.on('close', () => {
        if (process.env.WS_CONNECTION_DEBUG === '1') {
          console.log('🔌 WebSocket API connection closed');
        }
      });

      connection.on('error', (error) => {
        console.error('❌ WebSocket API error:', error);
      });

      // Cleanup
      connection.on('close', () => {
        server.visioService?.closeConnection(connection);
        try { wsApiConnections.delete(connection); } catch (error) {
          console.warn("[server] operation failed", error);
        }
        // Announce before detaching the client: the presence broadcast needs the
        // principal still attached to this connection to reach its other surfaces.
        const lostUserId = connection?._wsApiUserId ? String(connection._wsApiUserId) : null;
        let lostSurface = null;
        try { lostSurface = announceWsSurfaceDisconnect(connection); } catch (error) {
          console.warn("[server] surface disconnect announce failed", error);
        }
        detachWsApiClient(connection);

        // A destination that vanished must not leave an object in limbo: pending
        // offers roll back and hosted objects become DISCONNECTED, never lost.
        if (lostSurface && lostUserId) {
          try { handleRemoteControlSurfaceLoss({ userId: lostUserId, surfaceId: lostSurface.surface_id }); }
          catch (error) { console.warn("[server] remote control surface loss failed", error); }
          handleTeleportSurfaceLoss({ userId: lostUserId, surfaceId: lostSurface.surface_id, connection })
            .catch((error) => console.warn("[server] teleport surface loss failed", error));
        }
      });
    });
  });
}
