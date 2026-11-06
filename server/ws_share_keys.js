// `share-key` on /ws/api (#shared/share_key_contract.js, register R-115 lot D25 B): an account's published public key, read
// by another account before it seals a health list for it. Only the public half leaves the vault; the private half stays
// sealed by its owner's backup keys and is never answered. The Rust server (atome-server, Tauri's Axum, iOS's local server)
// answers the same frame once ported (R-115, « Pour la session Rust »).
//   read {principal_id} → { public_jwk }   (an account only; SHARE_KEY_UNAVAILABLE when that account has none yet)
import { SHARE_KEY_FRAME, shareKeyId, validateSharePublicJwk } from '../atome/src/shared/share_key_contract.js';
import { wsSignedInPrincipal } from './auth_account_roles.js';
import { wsResponse } from './wsResponse.js';

export async function handleWsShareKeys(data, connection) {
    if (data?.type !== SHARE_KEY_FRAME) return null;
    if (!await wsSignedInPrincipal(connection, data)) return wsResponse(SHARE_KEY_FRAME, data, false, { error: 'AUTH_REQUIRED' });
    if (String(data.action || '') !== 'read') return wsResponse(SHARE_KEY_FRAME, data, false, { error: 'INVALID_ARGUMENT' });
    const principal = String(data.principal_id || '').trim();
    if (!principal) return wsResponse(SHARE_KEY_FRAME, data, false, { error: 'INVALID_ARGUMENT' });
    const state = await connection._wsApiVaultRouter.getState(principal, shareKeyId(principal));
    const jwk = state?.properties?.public_jwk;
    if (!jwk) return wsResponse(SHARE_KEY_FRAME, data, false, { error: 'SHARE_KEY_UNAVAILABLE' });
    return wsResponse(SHARE_KEY_FRAME, data, true, { public_jwk: validateSharePublicJwk(jwk) });
}
