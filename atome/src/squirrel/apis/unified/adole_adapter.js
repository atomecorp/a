// Extracted from adole.js: createWebSocketAdapter — the unified backend adapter factory (ws/auth/atome/share/file/userData/sync).
import { sanitizeAtomeProperties } from '../../../shared/atome_contract.js';
import { TauriWebSocket, getTauriWs, getFastifyWs } from './adole_websocket.js';
import { buildAtomeApi } from './adole_adapter_atome.js';
import {
    isInTauri,
    getTauriWsUrl,
    getFastifyWsApiUrl
} from './adole_backend.js';
import {
    getToken,
    setToken,
    clearToken
} from './adole_connection.js';

function createWebSocketAdapter(tokenKey, backend = 'tauri') {
    const resolvedBackend = backend || (isInTauri() ? 'tauri' : 'fastify');

    // IMPORTANT:
    // Do NOT capture the WebSocket instance at module load time.
    // In browser mode, server_config.json is loaded asynchronously and the Fastify WS URL
    // may not exist yet. If we capture a no-op WS too early, the adapter stays broken forever.
    const getWs = () => (resolvedBackend === 'fastify' ? getFastifyWs() : getTauriWs());
    const getBaseUrl = () => {
        if (resolvedBackend === 'fastify') {
            const wsApi = getFastifyWsApiUrl();
            return wsApi ? wsApi.replace(/\/ws\/api$/, '') : '';
        }
        return getTauriWsUrl().replace(/\/ws\/api$/, '');
    };

    return {
        get baseUrl() { return getBaseUrl(); },
        tokenKey,

        isAvailable: () => getWs().isAvailable(),
        getToken: () => getToken(tokenKey),
        setToken: (token) => setToken(tokenKey, token),
        clearToken: () => clearToken(tokenKey),
        ws: {
            send: (message) => getWs().send(message),
            sendFireAndForget: (message) => {
                const ws = getWs();
                if (ws && typeof ws.sendFireAndForget === 'function') {
                    return ws.sendFireAndForget(message);
                }
                return ws.send(message);
            }
        },

        auth: {
            async register(data) {
                const result = await getWs().send({
                    type: 'auth',
                    action: 'register',
                    username: data.username,
                    phone: data.phone,
                    password: data.password,
                    visibility: data.visibility || 'public', // 'public' (default) or 'private'
                    optional: data.optional || undefined
                });
                const token = result?.token
                    || result?.data?.token
                    || result?.data?.data?.token
                    || result?.result?.token
                    || result?.data?.result?.token
                    || null;
                if (token) {
                    setToken(tokenKey, token);
                }
                return result;
            },
            async bootstrap(data) {
                const result = await getWs().send({
                    type: 'auth',
                    action: 'bootstrap',
                    username: data.username,
                    phone: data.phone,
                    password: data.password,
                    visibility: data.visibility || 'public',
                    optional: data.optional || undefined
                });
                const token = result?.token
                    || result?.data?.token
                    || result?.data?.data?.token
                    || result?.result?.token
                    || result?.data?.result?.token
                    || null;
                if (token) {
                    setToken(tokenKey, token);
                }
                return result;
            },
            async login(data) {
                const result = await getWs().send({
                    type: 'auth',
                    action: 'login',
                    phone: data.phone,
                    password: data.password
                });
                const token = result?.token
                    || result?.data?.token
                    || result?.data?.data?.token
                    || result?.result?.token
                    || result?.data?.result?.token
                    || null;
                if (token) {
                    setToken(tokenKey, token);
                }
                return result;
            },
            async logout() {
                clearToken(tokenKey);
                await getWs().send({ type: 'auth', action: 'logout' });
                return { ok: true, success: true };
            },
            async me() {
                const token = getToken(tokenKey);
                return getWs().send({ type: 'auth', action: 'me', token });
            },
            async changePassword(data) {
                const token = getToken(tokenKey);
                return getWs().send({
                    type: 'auth',
                    action: 'change-password',
                    token,
                    currentPassword: data.currentPassword,
                    newPassword: data.newPassword
                });
            },
            async requestPhoneVerification(data = {}) {
                return getWs().send({
                    type: 'auth',
                    action: 'request-phone-verification',
                    phone: data.phone,
                    context: data.context,
                    exposeForTest: data.exposeForTest === true
                });
            },
            async verifyPhoneVerification(data = {}) {
                return getWs().send({
                    type: 'auth',
                    action: 'verify-phone-verification',
                    phone: data.phone,
                    code: data.code,
                    context: data.context
                });
            },
            async deleteAccount(data) {
                const token = getToken(tokenKey);
                return getWs().send({
                    type: 'auth',
                    action: 'delete',
                    token,
                    password: data.password
                });
            },
            async refreshToken() {
                return { ok: true, success: true }; // JWT doesn't need refresh for local
            },
            async lookupPhone(data) {
                const phone = data?.phone;
                return getWs().send({
                    type: 'auth',
                    action: 'lookup-phone',
                    phone
                });
            }
        },

        atome: buildAtomeApi({ getWs, tokenKey }),

        share: {
            async request(data) {
                return getWs().send({
                    type: 'share',
                    action: 'request',
                    target_user_id: data.target_user_id || data.targetUserId || null,
                    target_phone: data.target_phone || data.targetPhone || null,
                    atome_ids: data.atome_ids || data.atomeIds || [],
                    permissions: data.permissions || {},
                    mode: data.mode || 'real-time',
                    share_type: data.share_type || data.shareType || null,
                    property_overrides: data.property_overrides || data.propertyOverrides || {}
                });
            },
            async respond(data) {
                return getWs().send({
                    type: 'share',
                    action: 'respond',
                    status: data.status || data.decision || null,
                    request_atome_id: data.request_atome_id || data.requestAtomeId || data.atome_id || null,
                    request_id: data.request_id || data.requestId || null,
                    policy: data.policy || null,
                    receiver_project_id: data.receiver_project_id || data.receiverProjectId || null
                });
            },
            async publish(data) {
                return getWs().send({
                    type: 'share',
                    action: 'publish',
                    request_atome_id: data.request_atome_id || data.requestAtomeId || data.atome_id || null,
                    request_id: data.request_id || data.requestId || null
                });
            },
            async policy(data) {
                return getWs().send({
                    type: 'share',
                    action: 'policy',
                    peer_user_id: data.peer_user_id || data.peerUserId || null,
                    policy: data.policy || null,
                    permissions: data.permissions || null
                });
            },
            async create(data) {
                // Permissions sharing is handled server-side; token auth binds ws identity.
                return getWs().send({
                    type: 'share',
                    action: 'create',
                    user_id: data.user_id || data.userId,
                    atome_id: data.atome_id || data.atomeId,
                    principal_id: data.principal_id || data.principalId,
                    permission: data.permission,
                    particle_key: data.particle_key || data.particleKey || null,
                    expires_at: data.expires_at || data.expiresAt || null
                });
            },
            async revoke(data) {
                return getWs().send({
                    type: 'share',
                    action: 'revoke',
                    user_id: data.user_id || data.userId,
                    permission_id: data.permission_id || data.permissionId
                });
            },
            async accessible(data = {}) {
                return getWs().send({
                    type: 'share',
                    action: 'accessible',
                    user_id: data.user_id || data.userId,
                    atome_type: data.atome_type || data.atomeType || null
                });
            },
            async sharedWithMe() {
                return getWs().send({ type: 'share', action: 'shared-with-me' });
            },
            async myShares() {
                return getWs().send({ type: 'share', action: 'my-shares' });
            },
            async check(data) {
                return getWs().send({
                    type: 'share',
                    action: 'check',
                    user_id: data.user_id || data.userId,
                    atome_id: data.atome_id || data.atomeId,
                    permission: data.permission || 'read'
                });
            }
        },

        file: {
            async downloadInfo(data = {}) {
                const token = getToken(tokenKey);
                return getWs().send({
                    type: 'file',
                    action: 'download-info',
                    token,
                    debug: data.debug === true,
                    atome_id: data.atome_id || data.atomeId || data.id || null,
                    identifier: data.identifier || data.file_id || data.fileId || null,
                    chunk_size: data.chunk_size || data.chunkSize || null
                });
            },
            async downloadChunk(data = {}) {
                const token = getToken(tokenKey);
                return getWs().send({
                    type: 'file',
                    action: 'download-chunk',
                    token,
                    atome_id: data.atome_id || data.atomeId || data.id || null,
                    identifier: data.identifier || data.file_id || data.fileId || null,
                    chunk_index: data.chunk_index ?? data.chunkIndex ?? null,
                    chunk_size: data.chunk_size || data.chunkSize || null
                });
            },
            async uploadChunk(data = {}) {
                const token = getToken(tokenKey);
                return getWs().send({
                    type: 'file',
                    action: 'upload-chunk',
                    token,
                    upload_id: data.upload_id || data.uploadId || null,
                    chunk_index: data.chunk_index ?? data.chunkIndex ?? null,
                    chunk_count: data.chunk_count ?? data.chunkCount ?? null,
                    chunk_base64: data.chunk_base64 || data.chunkBase64 || null
                });
            },
            async uploadComplete(data = {}) {
                const token = getToken(tokenKey);
                return getWs().send({
                    type: 'file',
                    action: 'upload-complete',
                    token,
                    debug: data.debug === true,
                    upload_id: data.upload_id || data.uploadId || null,
                    chunk_count: data.chunk_count ?? data.chunkCount ?? null,
                    file_name: data.file_name || data.fileName || null,
                    file_path: data.file_path || data.filePath || null,
                    atome_id: data.atome_id || data.atomeId || null,
                    atome_type: data.atome_type || data.atomeType || null,
                    original_name: data.original_name || data.originalName || null,
                    mime_type: data.mime_type || data.mimeType || null
                });
            }
        },

        userData: {
            async deleteAll(data = {}) {
                const token = getToken(tokenKey);
                return getWs().send({
                    type: 'user-data',
                    action: 'delete-all',
                    token,
                    tx_id: data.tx_id || data.txId || null
                });
            },
            async export(data = {}) {
                const token = getToken(tokenKey);
                return getWs().send({
                    type: 'user-data',
                    action: 'export',
                    token,
                    limit: data.limit
                });
            }
        },

        sync: {
            async getPending() {
                const token = getToken(tokenKey);
                return getWs().send({ type: 'sync', action: 'get-pending', token });
            },
            async push(data = {}) {
                const token = getToken(tokenKey);
                return getWs().send({
                    type: 'sync',
                    action: 'push',
                    token,
                    events: data.events || data.changes || [],
                    tx_id: data.tx_id || data.txId || null,
                    sync_source: data.sync_source || data.syncSource || null
                });
            },
            async pull(data = {}) {
                const token = getToken(tokenKey);
                return getWs().send({
                    type: 'sync',
                    action: 'pull',
                    token,
                    since: data.since || null,
                    until: data.until || null,
                    limit: data.limit,
                    offset: data.offset
                });
            },
            async ack(data = {}) {
                const token = getToken(tokenKey);
                return getWs().send({
                    type: 'sync',
                    action: 'ack',
                    token,
                    atome_ids: data.atome_ids || data.atomeIds || []
                });
            }
        }
    };
}

// ============================================
// PRE-BUILT ADAPTERS
// ============================================

/**
 * Tauri/Axum adapter (localhost:3000, SQLite) - WebSocket-only
 * Uses createWebSocketAdapter for full ADOLE v3.0 compliance
 */

export { createWebSocketAdapter };
