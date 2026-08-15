import jwt from 'jsonwebtoken';
import db from '../database/adole.js';
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
    const token = typeof message?.token === 'string' ? message.token.trim() : '';
    if (token) {
        const decoded = jwt.verify(token, requiredJwtSecret());
        const userId = decodedUserId(decoded);
        if (!userId) return null;

        // The signed token carried by the request is the current authority.
        // A WebSocket may have been opened with a stale cookie or may survive an
        // explicit account switch; retaining that attached principal would make
        // the server authorize the request as the wrong account.
        if (options.registerClient !== false) {
            attachWsApiClientToUser(connection, userId);
        } else {
            connection._wsApiUserId = userId;
        }
        connection._wsApiAuthExpMs = typeof decoded.exp === 'number' ? decoded.exp * 1000 : null;
        return userId;
    }

    const attachedId = connection?._wsApiUserId ? String(connection._wsApiUserId) : null;
    const attachedExpiry = Number(connection?._wsApiAuthExpMs);
    if (attachedId && (!Number.isFinite(attachedExpiry) || attachedExpiry > now)) {
        return attachedId;
    }
    if (attachedId) detachWsApiClient(connection);
    return null;
}

export async function isWsApiPrincipalProvisioned(principalId) {
    if (!principalId) return false;
    const record = await db.getAtomeById(String(principalId));
    return Boolean(record && record.atome_type === 'user' && !record.deleted_at);
}
