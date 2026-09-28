import { replaceVerifiedPhone } from './auth_identity.js';
import jwt from 'jsonwebtoken';
import db from '../database/adole.js';
import { createPhoneLinkAuth } from './auth_phone_link.js';
import { createOvhSmsProvider } from './auth_sms_ovh.js';
import { loadLocalSmsConfig } from './auth_secret_config.js';
import { deleteUserAtome, createUserAtome, findUserByPhone, findUserById, listAllUsers, updateUserParticle, authenticatedUserSnapshot } from './auth_users.js';
import { validateConnectionDeviceSession } from './auth_session_validation.js';
import { generateOpaquePrincipalId } from './auth_crypto.js';
import { AUTH_LINK_ORIGIN, AUTH_ACCESS_TTL_SECONDS } from '../atome/src/shared/auth_link_contract.js';
import { attachWsApiClientToUser, detachWsApiClient, wsApiConnections } from './wsApiState.js';

const ACTIONS = new Set(['phone-link-start', 'phone-change-start', 'phone-link-challenge', 'phone-link-consume',
    'phone-link-approve', 'phone-link-confirm', 'phone-link-resume', 'phone-link-cancel', 'session-challenge',
    'session-delete-account', 'session-renew', 'session-local-bind', 'session-logout', 'session-logout-all', 'session-revoke-device']);
const PUBLIC_ERRORS = new Set(['auth_phone_e164_required', 'auth_rate_limited', 'sms_delivery_unavailable',
    'sms_configuration_required', 'auth_trusted_phone_required', 'auth_session_invalid',
    'auth_session_stale', 'auth_session_reused', 'auth_device_cooling_off']);

export function createWsPhoneLinkHandler({ projectRoot, jwtSecret, sendLink, database = db } = {}) {
    loadLocalSmsConfig(projectRoot);
    const mockSmsRequested = process.env.SQUIRREL_AUTH_SMS_MOCK === '1';
    if (mockSmsRequested && process.env.NODE_ENV === 'production') {
        throw new Error('auth_sms_mock_forbidden_in_production');
    }
    const deliverLink = sendLink || (mockSmsRequested
        ? async (_phone, link) => ({ accepted: true, provider: 'local-development', developmentLink: link })
        : (phone, link) => createOvhSmsProvider().sendValidationLink(phone, link));
    const dataSource = database.getDataSourceAdapter();
    const service = createPhoneLinkAuth({
        query: database.query, transaction: database.withTransaction,
        masterSecret: jwtSecret(), dailyLimit: Number(process.env.AUTH_SMS_DAILY_LIMIT || 20),
        replacePhone: (id, phone) => replaceVerifiedPhone(dataSource, id, phone),
        deleteAccount: id => deleteUserAtome(dataSource, id),
        findByPhone: (phone) => findUserByPhone(dataSource, phone),
        findById: (id) => findUserById(dataSource, id),
        createAccount: async (phone) => {
            const id = generateOpaquePrincipalId();
            return createUserAtome(dataSource, id, `user_${id}`, phone, 'private');
        },
        sendLink: deliverLink,
        issueAccess: ({ principalId, keyId, sessionId }) => jwt.sign(
            { sub: principalId, userId: principalId, sid: sessionId, cnf: { kid: keyId }, auth_version: 1 },
            jwtSecret(), { algorithm: 'HS256', issuer: AUTH_LINK_ORIGIN, audience: 'atome-ws', expiresIn: AUTH_ACCESS_TTL_SECONDS }),
        disconnectSession: async (sessionId) => {
            for (const connection of wsApiConnections) {
                if (connection._wsApiSessionId !== sessionId) continue;
                detachWsApiClient(connection);
                setImmediate(() => connection.close(4001, 'session_revoked'));
            }
        }
    });

    async function handle(message, connection, network) {
        if (message?.type !== 'auth') return null;
        const requestId = message.requestId || message.request_id;
        try {
            let result;
            if (!ACTIONS.has(message.action)) {
                if (!['me', 'get-user', 'list-users', 'update-user'].includes(message.action)) {
                    return { type: 'auth-response', requestId, success: false, ok: false, error: 'auth_protocol_upgrade_required' };
                }
                const claims = await validateConnectionDeviceSession(connection, message.token, jwtSecret())
                    || connection._wsApiDeviceClaims;
                if (!claims || claims.auth_version !== 1) throw new Error('auth_session_invalid');
                const account = await findUserById(dataSource, claims.sub);
                if (!account) throw new Error('auth_session_invalid');
                if (message.action === 'me') {
                    attachWsApiClientToUser(connection, claims.sub);
                    result = { ok: true, user: authenticatedUserSnapshot(account) };
                } else if (message.action === 'list-users') {
                    result = { ok: true, users: await listAllUsers(dataSource) };
                } else if (message.action === 'get-user') {
                    if (message.phone) throw new Error('auth_request_rejected');
                    const user = await findUserById(dataSource, message.userId);
                    const visible = user && (user.user_id === claims.sub || user.visibility === 'public');
                    result = { ok: true, user: visible ? { user_id: user.user_id, username: user.username } : null };
                } else {
                    if (message.userId !== claims.sub || typeof message.key !== 'string'
                        || /password|token|credential|secret|phone|session/i.test(message.key)) throw new Error('auth_request_rejected');
                    await updateUserParticle(dataSource, claims.sub, message.key, message.value);
                    result = { ok: true };
                }
                return { type: 'auth-response', requestId, success: true, ...result };
            }
            switch (message.action) {
                case 'phone-change-start': result = await service.startPhoneChange(message, network); break;
                case 'phone-link-start': result = await service.start(message, network); break;
                case 'phone-link-challenge': result = await service.getChallenge(message, network); break;
                case 'phone-link-consume': result = await service.complete({ ...message, action: 'consume' }); break;
                case 'phone-link-resume':
                    connection._authLinkAttemptId = message.attemptId;
                    result = await service.complete({ ...message, action: 'resume' });
                    break;
                case 'phone-link-approve': result = await service.approve(message); break;
                case 'phone-link-confirm': result = await service.confirm(message); break;
                case 'phone-link-cancel': result = await service.cancel(message); break;
                case 'session-challenge': result = await service.sessions.getChallenge(message, network); break;
                case 'session-renew': result = await service.sessions.renew(message); break;
                case 'session-delete-account': result = await service.sessions.removeAccount(message); break;
                case 'session-local-bind': result = await service.sessions.localBind(message); break;
                default: result = await service.sessions.revoke({ ...message, action: message.action.slice('session-'.length) });
            }
            if (['phone-link-approve', 'phone-link-confirm'].includes(message.action) && result.approved) {
                for (const origin of wsApiConnections) {
                    if (origin._authLinkAttemptId === message.attemptId && origin.readyState === 1) {
                        origin.send(JSON.stringify({ type: 'phone-link-ready', attemptId: message.attemptId }));
                    }
                }
            }
            if (result.token) {
                delete connection._authLinkAttemptId;
                attachWsApiClientToUser(connection, result.user.id);
                connection._wsApiSessionId = result.session.id;
                const claims = jwt.verify(result.token, jwtSecret(), {
                    algorithms: ['HS256'], issuer: AUTH_LINK_ORIGIN, audience: 'atome-ws'
                });
                connection._wsApiDeviceClaims = claims;
                connection._wsApiAuthExpMs = claims.exp * 1000;
            }
            return { type: 'auth-response', requestId, success: result.ok === true, ...result };
        } catch (error) {
            if (message.action === 'phone-link-resume') delete connection._authLinkAttemptId;
            return { type: 'auth-response', requestId, success: false, ok: false,
                error: PUBLIC_ERRORS.has(error.message) ? error.message : 'auth_request_rejected' };
        }
    }
    return { handle, service };
}
