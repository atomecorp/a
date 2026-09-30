// Capacite media cote client : les elements <video>/<audio>/<img> et les textures ne peuvent
// pas envoyer d'Authorization, alors les URL media Fastify portent `?media_token=`.
// Le jeton est obtenu par `POST /api/media-token` avec la session d'appareil (Bearer) ;
// le serveur le lie a cette session (revocation = mort du jeton). `media_user_id` n'est plus
// qu'un indice de chemin pour les serveurs locaux (axum, Swift), jamais une identite.
import { FastifyAdapter } from '../apis/unified/adole.js';
import { getFastifyHttpBaseUrl } from '../apis/unified/adole_backend.js';

const REFRESH_MARGIN_MS = 5 * 60 * 1000;
const RETRY_DELAY_MS = 15 * 1000;

let cached = null; // { token, expiresAt, sub }
let inflight = null;
let refreshTimer = null;
let lastFailureAt = 0;

const decodeSub = (jwtToken) => {
    try {
        const part = String(jwtToken || '').split('.')[1] || '';
        const json = atob(part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '='));
        return String(JSON.parse(json)?.sub || '');
    } catch (_) {
        return '';
    }
};

const currentBearer = () => String(FastifyAdapter?.getToken?.() || '').trim();

const scheduleRefresh = (expiresAt) => {
    if (refreshTimer) clearTimeout(refreshTimer);
    const delay = Math.max(RETRY_DELAY_MS, expiresAt - Date.now() - REFRESH_MARGIN_MS);
    refreshTimer = setTimeout(() => { refreshTimer = null; refreshMediaToken().catch(() => {}); }, delay);
};

export function clearMediaToken() {
    cached = null;
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = null;
}

export function refreshMediaToken() {
    if (inflight) return inflight;
    const bearer = currentBearer();
    const base = getFastifyHttpBaseUrl();
    if (!bearer || !base) {
        clearMediaToken();
        return Promise.resolve('');
    }
    inflight = (async () => {
        try {
            const response = await fetch(`${String(base).replace(/\/+$/, '')}/api/media-token`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' },
                body: '{}',
                cache: 'no-store'
            });
            const body = await response.json().catch(() => null);
            if (!response.ok || !body?.token) throw new Error(body?.error || `media_token_http_${response.status}`);
            cached = { token: body.token, expiresAt: Number(body.expiresAt) || 0, sub: decodeSub(bearer) };
            scheduleRefresh(cached.expiresAt);
            return cached.token;
        } catch (error) {
            lastFailureAt = Date.now();
            if (cached && cached.sub !== decodeSub(currentBearer())) clearMediaToken();
            throw error;
        } finally {
            inflight = null;
        }
    })();
    return inflight;
}

// Lecture synchrone pour les constructeurs d'URL : renvoie le jeton valide du compte
// courant, et relance l'emission en arriere-plan quand il manque ou approche l'expiration.
export function getMediaTokenSync() {
    const bearer = currentBearer();
    if (!bearer) {
        if (cached) clearMediaToken();
        return '';
    }
    const now = Date.now();
    const valid = cached && cached.expiresAt > now + 30 * 1000 && cached.sub === decodeSub(bearer);
    if (!valid || cached.expiresAt - now < REFRESH_MARGIN_MS) {
        if (!inflight && now - lastFailureAt > RETRY_DELAY_MS) refreshMediaToken().catch(() => {});
    }
    return valid ? cached.token : '';
}

export async function ensureMediaToken() {
    return getMediaTokenSync() || refreshMediaToken().catch(() => '');
}

if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('squirrel:remote-session-ready', () => {
        clearMediaToken();
        refreshMediaToken().catch(() => {});
    });
}
