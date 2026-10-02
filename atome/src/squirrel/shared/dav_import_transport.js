import { FastifyAdapter } from '../apis/unified/adole.js';
import { getSessionState } from '../apis/unified/adole_api/session.js';

/** Credentials are resolved from the existing vault for each collection, never persisted in origins. */
export async function readDavImport(domain, config, options = {}, env = globalThis) {
    const owner = getSessionState()?.user?.id;
    if (!owner || getSessionState()?.mode !== 'authenticated') throw new Error('import_authenticated_owner_required');
    options.checkSession?.();
    const security = env.Squirrel?.security || env.atome?.security || env.AtomeSecurity;
    if (!config.auth_ref || !security?.readToken) throw new Error('dav_auth_reference_required');
    const stored = await security.readToken(config.auth_ref);
    options.checkSession?.();
    if (!stored?.ok || !stored.value) throw new Error('dav_credentials_unavailable');
    const response = await FastifyAdapter.ws.send('personal-import', { domain,
        url: config.addressbook_url || config.calendar_url, auth: stored.value, collections: options.collections || config.collections,
        cursor: options.cursor }, { timeout: 120000 });
    if (getSessionState()?.user?.id !== owner || options.signal?.aborted) throw new Error('import_session_changed');
    options.checkSession?.();
    return response;
}
