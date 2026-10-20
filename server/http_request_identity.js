// HTTP request identity: verified device sessions (Bearer / cookie / sync token)
// and the signed media capability used by <video>/<audio>/<img> reads.
import { assertDeviceSessionClaims } from './auth_session_validation.js';
import { readMediaTokenFromQuery, verifyMediaToken } from './media_capability.js';
import { requiredJwtSecret as getRequiredJwtSecret } from './wsApiIdentity.js';
import { resolveUserId } from './server_utils.js';

export function createHttpRequestIdentity(server) {
  // Helper function to validate token (for sharing routes)
  // SECURITY: always verify JWT signatures (never trust base64-decoded payload).
  const validateToken = async (request) => {
    const syncToken = process.env.SQUIRREL_SYNC_TOKEN;
    const headerSyncToken = request.headers['x-sync-token'];
    if (syncToken && headerSyncToken && headerSyncToken === syncToken) {
      const headerUserId = request.headers['x-user-id'] || request.headers['x-userid'];
      return {
        sub: headerUserId || 'sync',
        id: headerUserId || 'sync',
        userId: headerUserId || 'sync',
        username: 'sync',
        phone: null
      };
    }

    const verifyJwt = async (token, options = {}) => {
      if (!token) return null;

      if (server.jwt && typeof server.jwt.verify === 'function') {
        return assertDeviceSessionClaims(server.jwt.verify(token, options));
      }

      const jwt = await import('jsonwebtoken');
      return assertDeviceSessionClaims(jwt.default.verify(token, getRequiredJwtSecret(), options));
    };

    // Try Bearer token first
    const authHeader = request.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      try {
        return await verifyJwt(token);
      } catch (error) {
        request.log.warn({ err: error }, 'Bearer token validation failed');
        return null;
      }
    }

    // Try cookie
    const cookieToken = request.cookies?.access_token;
    if (cookieToken) {
      try {
        return await verifyJwt(cookieToken);
      } catch (error) {
        request.log.warn({ err: error }, 'Cookie token validation failed');
        return null;
      }
    }

    return null;
  };

  // Identite d'upload : UNIQUEMENT une session d'appareil verifiee (Bearer / cookie).
  // Les en-tetes `x-user-id` / `x-phone` / `x-username` ne sont jamais crus : n'importe
  // quel client pouvait sinon deposer un fichier au nom de n'importe qui.
  const resolveUploadIdentity = async (request) => {
    const tokenUser = await validateToken(request);
    if (tokenUser) {
      return { user: tokenUser, userId: resolveUserId(tokenUser), source: 'token' };
    }
    return { user: null, userId: 'anonymous', source: 'anonymous' };
  };

  // Lecture media : session verifiee, sinon capacite media signee `?media_token=`
  // (les elements <video>/<audio>/<img> ne peuvent pas envoyer d'Authorization).
  // `?media_user_id=` reste un simple indice de chemin pour les serveurs locaux
  // (axum, Swift) et n'est plus une identite ici.
  const resolveMediaDownloadIdentity = async (request) => {
    const identity = await resolveUploadIdentity(request);
    if (identity.userId && identity.userId !== 'anonymous') return identity;
    const mediaUserId = await verifyMediaToken(readMediaTokenFromQuery(request.query), getRequiredJwtSecret(), {
      fileParam: request.params?.file || ''
    });
    if (mediaUserId) return { user: null, userId: mediaUserId, source: 'media_token' };
    return identity;
  };

  return { validateToken, resolveUploadIdentity, resolveMediaDownloadIdentity };
}
