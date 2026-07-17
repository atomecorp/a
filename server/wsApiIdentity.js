import jwt from 'jsonwebtoken';
import {
    attachWsApiClientToUser,
    detachWsApiClient
} from './wsApiState.js';

function requiredJwtSecret() {
    const secret = String(process.env.JWT_SECRET || '').trim();
    if (secret.length < 32) {
        throw new Error('JWT_SECRET must be configured with at least 32 characters');
    }
    return secret;
}

function decodedUserId(decoded) {
    const value = decoded?.sub || decoded?.id || decoded?.userId || decoded?.user_id || null;
    return value ? String(value) : null;
}

export function resolveWsApiPrincipal(connection, message = {}, options = {}) {
    const now = Date.now();
    const attachedId = connection?._wsApiUserId ? String(connection._wsApiUserId) : null;
    const attachedExpiry = Number(connection?._wsApiAuthExpMs);
    if (attachedId && (!Number.isFinite(attachedExpiry) || attachedExpiry > now)) {
        return attachedId;
    }
    if (attachedId) detachWsApiClient(connection);

    const token = typeof message?.token === 'string' ? message.token.trim() : '';
    if (!token) return null;

    const decoded = jwt.verify(token, requiredJwtSecret());
    const userId = decodedUserId(decoded);
    if (!userId) return null;

    if (options.registerClient !== false) {
        attachWsApiClientToUser(connection, userId);
    } else {
        connection._wsApiUserId = userId;
    }
    connection._wsApiAuthExpMs = typeof decoded.exp === 'number' ? decoded.exp * 1000 : null;
    return userId;
}
