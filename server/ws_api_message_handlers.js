// /ws/api typed requests for news, contacts, sharing and the restricted shell.
// Each handler answers its own '<type>-response' frame.
import db from '../database/adole.js';
import { findUserById } from './auth_users.js';
import { isWsApiPrincipalProvisioned } from './wsApiIdentity.js';
import { handleShareMessage } from './sharing_message_api.js';
import { executeShellCommand } from './shell.js';

export async function handleWsNewsRequest({ data, connection, safeSend, newsBroadcast, newsPublishRateAllowed }) {
  const requestId = data.requestId || data.request_id;
  const userId = connection?._wsApiUserId ? String(connection._wsApiUserId) : null;
  if (!userId || !await isWsApiPrincipalProvisioned(userId)) {
    safeSend({ type: 'news-response', requestId, success: false, error: 'news_auth_required' });
    return;
  }
  try {
    if (String(data.action || '').toLowerCase() === 'publish' && !newsPublishRateAllowed(userId)) {
      throw new Error('news_rate_limited');
    }
    const result = await newsBroadcast.handle(data, userId);
    safeSend({ type: 'news-response', requestId, success: result.ok !== false, ...result });
  } catch (error) {
    safeSend({ type: 'news-response', requestId, success: false, error: error.message });
  }
}

export async function handleWsCommunityRequest({ data, connection, safeSend, communities }) {
  const requestId = data.requestId || data.request_id;
  const userId = connection?._wsApiUserId ? String(connection._wsApiUserId) : null;
  if (!userId || !await isWsApiPrincipalProvisioned(userId)) {
    safeSend({ type: 'community-response', requestId, success: false, error: 'community_auth_required' });
    return;
  }
  try {
    const result = await communities.handle(data, userId);
    safeSend({ type: 'community-response', requestId, success: result.ok !== false, ...result });
  } catch (error) {
    safeSend({ type: 'community-response', requestId, success: false, error: error.message });
  }
}

export async function handleWsContactRequest({ data, connection, safeSend, communicationRelations }) {
  const requestId = data.requestId || data.request_id;
  const userId = connection?._wsApiUserId ? String(connection._wsApiUserId) : null;
  if (!userId || !await isWsApiPrincipalProvisioned(userId)) {
    safeSend({ type: 'contact-response', requestId, success: false, error: 'contact_auth_required' });
    return;
  }
  try {
    const peerId = data.userId || data.toUserId || data.fromUserId || data.peerId;
    if (peerId && data.action !== 'list' && !await isWsApiPrincipalProvisioned(String(peerId))) {
      throw new Error('contact_target_invalid');
    }
    const result = await communicationRelations.handle(data, userId);
    safeSend({ type: 'contact-response', requestId, success: result.ok !== false, ...result });
  } catch (error) {
    safeSend({ type: 'contact-response', requestId, success: false, error: error.message });
  }
}

export async function handleWsShareRequest({ data, connection, safeSend, communicationRelations, syncSharingService }) {
  const requestId = data.requestId || data.request_id;
  const userId = connection?._wsApiUserId ? String(connection._wsApiUserId) : null;
  if (!userId) {
    safeSend({
      type: 'share-response',
      requestId,
      success: false,
      error: 'share_request_auth_required'
    });
    return;
  }
  if (!await isWsApiPrincipalProvisioned(userId)) {
    safeSend({
      type: 'share-response',
      requestId,
      success: false,
      error: 'remote_account_not_provisioned'
    });
    return;
  }

  // Premier contact et blocage (D3/D4) : une demande de partage est une communication
  // pair-a-pair. Bloque par le destinataire -> succes apparent, rien n'est cree.
  const shareAction = String(data.action || '').toLowerCase();
  if (shareAction === 'request' || shareAction === 'create') {
    const shareTargetId = await syncSharingService.targetId(data).catch(() => null);
    const relation = await communicationRelations.canCommunicate(userId, shareTargetId);
    if (!relation.ok && relation.silent) {
      safeSend({ type: 'share-response', requestId, success: true, ok: true, requests: [], streams: [] });
      return;
    }
    if (!relation.ok) {
      safeSend({ type: 'share-response', requestId, success: false, error: relation.error });
      return;
    }
  }
  try {
    const response = await handleShareMessage(data, userId, { syncSharingService });
    safeSend({ type: 'share-response', ...response });
  } catch (error) {
    safeSend({
      type: 'share-response',
      requestId,
      success: false,
      error: error.message
    });
  }
}

export async function handleWsShellRequest({ data, connection, safeSend, projectRoot }) {
  const requestId = data.requestId || data.request_id;
  const attachedUserId = connection?._wsApiUserId ? String(connection._wsApiUserId) : null;

  const authExpMs = connection && typeof connection._wsApiAuthExpMs === 'number' ? connection._wsApiAuthExpMs : null;
  if (!attachedUserId || (authExpMs && Date.now() >= authExpMs)) {
    safeSend({
      type: 'shell-response',
      requestId,
      success: false,
      error: attachedUserId ? 'ws/api authentication expired (re-auth required)' : 'Unauthenticated ws/api connection'
    });
    return;
  }

  try {
    const dataSource = db.getDataSourceAdapter();
    const user = await findUserById(dataSource, attachedUserId);
    const result = await executeShellCommand({
      payload: data,
      projectRoot,
      user: user ? { id: user.user_id, username: user.username, phone: user.phone } : { id: attachedUserId },
      connectionId: connection._wsApiConnectionId
    });

    safeSend({
      type: 'shell-response',
      requestId,
      ...result
    });
  } catch (error) {
    safeSend({
      type: 'shell-response',
      requestId,
      success: false,
      error: error.message
    });
  }
}
