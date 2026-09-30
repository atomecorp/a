// Capacite media : <video>/<audio>/<img> ne peuvent pas envoyer d'en-tete Authorization,
// donc une URL media porte `?media_token=`. Ce jeton est signe par le serveur, limite dans
// le temps, reserve a la lecture media (audience distincte du jeton de session WS) et lie
// a la session d'appareil qui l'a obtenu : revoquer la session le tue aussitot.
// Il ne remplace JAMAIS une identite d'upload ni un Bearer.
import jwt from 'jsonwebtoken';
import { AUTH_LINK_ORIGIN } from '../atome/src/shared/auth_link_contract.js';
import { assertDeviceSessionClaims } from './auth_session_validation.js';

export const MEDIA_TOKEN_AUDIENCE = 'atome-media';
const DEFAULT_TTL_SECONDS = 2 * 60 * 60;
const MAX_FILE_CLAIM = 512;

const ttlSeconds = () => {
    const configured = Number(process.env.SQUIRREL_MEDIA_TOKEN_TTL_SECONDS);
    return Number.isFinite(configured) && configured >= 30 && configured <= 12 * 60 * 60
        ? Math.floor(configured)
        : DEFAULT_TTL_SECONDS;
};

const normalizeFileClaim = (value) => {
    const text = String(value ?? '').trim();
    if (!text) return null;
    if (text.length > MAX_FILE_CLAIM || /[\\/]/.test(text)) throw new Error('media_token_file_invalid');
    return text;
};

// `sessionClaims` = claims deja verifies d'une session d'appareil (validateToken).
export function issueMediaToken(sessionClaims, secret, { file = null } = {}) {
    if (!sessionClaims?.sub || typeof sessionClaims.sid !== 'string' || typeof sessionClaims.cnf?.kid !== 'string') {
        throw new Error('media_token_requires_device_session');
    }
    const ttl = ttlSeconds();
    const payload = { sid: sessionClaims.sid, kid: sessionClaims.cnf.kid };
    const fileClaim = normalizeFileClaim(file);
    if (fileClaim) payload.f = fileClaim;
    const token = jwt.sign(payload, secret, {
        algorithm: 'HS256',
        audience: MEDIA_TOKEN_AUDIENCE,
        issuer: AUTH_LINK_ORIGIN,
        subject: String(sessionClaims.sub),
        expiresIn: ttl
    });
    return { token, expiresAt: Date.now() + ttl * 1000, ttlSeconds: ttl, file: fileClaim };
}

export const readMediaTokenFromQuery = (query = {}) => {
    const raw = query?.media_token;
    const value = Array.isArray(raw) ? raw[0] : raw;
    const text = String(value || '').trim();
    return text && text.length <= 4096 ? text : '';
};

// Renvoie l'identifiant du principal, ou null (jamais d'exception vers l'appelant).
export async function verifyMediaToken(token, secret, { fileParam = '' } = {}) {
    if (!token) return null;
    try {
        const claims = jwt.verify(token, secret, {
            algorithms: ['HS256'],
            audience: MEDIA_TOKEN_AUDIENCE,
            issuer: AUTH_LINK_ORIGIN
        });
        if (typeof claims.sub !== 'string' || !claims.sub) return null;
        if (claims.f) {
            let requested = String(fileParam || '');
            try { requested = decodeURIComponent(requested); } catch (_) { /* brut */ }
            if (claims.f !== requested) return null;
        }
        // Meme verification que le WS : session non revoquee, cle d'appareil valide.
        await assertDeviceSessionClaims({
            auth_version: 1,
            iss: AUTH_LINK_ORIGIN,
            aud: 'atome-ws',
            sub: claims.sub,
            sid: claims.sid,
            cnf: { kid: claims.kid }
        });
        return claims.sub;
    } catch (_) {
        return null;
    }
}
