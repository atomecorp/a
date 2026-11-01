// The boot's reads of its server (its versions, its configuration) never hold the boot:
// each is bounded, and when the server does not answer in time (offline, a network that
// accepts but never answers) the boot goes on with the copy kept from the server's last
// answer on this device, or without one. A server that answers with an error is an answer.
export const BOOT_READ_TIMEOUT_MS = 2500;
const STORAGE_PREFIX = 'squirrel_boot_read:';
const sources = new Map();

// Storage refused by the browser (a blocked origin) keeps no copy: the read then goes
// on without one, as on a first launch.
const storage = () => {
    try { return globalThis.localStorage || null; } catch (error) {
        if (error?.name === 'SecurityError') return null;
        throw error;
    }
};

/** `{ value, source }`: source `network` (fresh), `cached` (the last answer kept) or `none`. */
export const readBootJson = async (url, key) => {
    let response;
    try {
        response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(BOOT_READ_TIMEOUT_MS) });
        if (!response.ok) {
            sources.set(key, 'network');
            return { value: null, source: 'network', status: response.status };
        }
        const text = await response.text();
        const value = JSON.parse(text);
        storage()?.setItem(STORAGE_PREFIX + key, text);
        sources.set(key, 'network');
        return { value, source: 'network' };
    } catch (error) {
        // No answer in time (TimeoutError) or no network at all (TypeError): the kept copy.
        if (error?.name !== 'TimeoutError' && error?.name !== 'TypeError') throw error;
        const kept = storage()?.getItem(STORAGE_PREFIX + key);
        const source = kept ? 'cached' : 'none';
        sources.set(key, source);
        return { value: kept ? JSON.parse(kept) : null, source, reason: error.name };
    }
};

/** Where each boot read of this page came from, by key (diagnostics, probes). */
export const readBootReadSources = () => Object.fromEntries(sources);
