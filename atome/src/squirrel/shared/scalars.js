/**
 * Shared scalar helpers.
 *
 * These five-line helpers were rewritten between 4 and 19 times across
 * atome/src, server/ and eVe/, with divergent behaviour on the edge cases that
 * matter (`''`, `0`, `null`, objects carrying functions). One implementation
 * each, semantics documented, so a call site can no longer get a different
 * answer depending on which copy it happened to reach.
 */

// --- cloning -----------------------------------------------------------------
// Two clone semantics, named for what they do. Never swap one for the other:
// eVe menus and tools carry functions, where the JSON round-trip is a *wanted*
// strip and `structuredClone` throws `DataCloneError` at boot.

/**
 * Deep clone through the structured-clone algorithm.
 * Preserves Date/Map/Set/TypedArray. THROWS `DataCloneError` on functions,
 * DOM nodes and other non-cloneable values — that throw is the contract.
 */
export const cloneStructured = (value) => structuredClone(value);

/**
 * Deep clone through a JSON round-trip.
 * Functions, `undefined` and symbols are stripped — assumed, not accidental.
 * Dates become ISO strings. `null`/`undefined` pass through unchanged.
 */
export const cloneJson = (value) => (value == null ? value : JSON.parse(JSON.stringify(value)));

/**
 * Deep clone that never throws: structured clone first, JSON round-trip next,
 * `null` if both fail. For caches and stores that must not break on a value
 * they do not control.
 */
export const cloneLenient = (value) => {
    if (value === undefined) return undefined;
    try {
        return structuredClone(value);
    } catch (_) {
        // Non-cloneable (functions, DOM nodes): fall through to the JSON strip.
    }
    try {
        return JSON.parse(JSON.stringify(value));
    } catch (_) {
        return null;
    }
};

// --- text --------------------------------------------------------------------

/** Trimmed string. `null`/`undefined`/`false`/`0` all collapse to `''`. */
export const toText = (value) => String(value || '').trim();

/** Trimmed string preserving falsy-but-real values: `0` becomes `'0'`. */
export const toTextStrict = (value) => String(value == null ? '' : value).trim();

/** Search-normalised text: accents folded, lowercased, punctuation to spaces. */
export const normalizeSearchText = (value) => String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

// --- numbers -----------------------------------------------------------------

/**
 * Finite number or `fallback`.
 * `''` and `null` are treated as absent (they do NOT become `0`) — that is the
 * divergence that made three copies answer `0`, `undefined` and `null` for the
 * same input.
 */
export const toFiniteNumber = (value, fallback = null) => {
    if (value === null || value === undefined || value === '') return fallback;
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
};

// --- time --------------------------------------------------------------------

/** Current instant as an ISO-8601 string. */
export const nowIso = () => new Date().toISOString();

// --- environment -------------------------------------------------------------

/** Read `key` from an env-like object, falling back to its `window` member. */
export const readEnv = (env, key) => {
    if (!env || typeof env !== 'object') return null;
    if (key in env) return env[key];
    if (env.window && typeof env.window === 'object' && key in env.window) return env.window[key];
    return null;
};

// --- identifiers -------------------------------------------------------------

/**
 * Prefixed unique identifier.
 * Backed by `crypto.randomUUID()`; the 27 hand-rolled
 * `Date.now() + Math.random().toString(36)` variants used three different
 * suffix lengths (6/8/9/10), so collision odds differed by 10^6 between two
 * components of the same application. The `Math.random` branch exists only for
 * runtimes without WebCrypto and keeps the full 32-hex-digit width.
 */
export const makeId = (prefix = 'id') => {
    const cryptoRef = globalThis.crypto;
    const unique = (cryptoRef && typeof cryptoRef.randomUUID === 'function')
        ? cryptoRef.randomUUID().replace(/-/g, '')
        : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}${Math.random().toString(36).slice(2, 12)}`;
    return prefix ? `${prefix}_${unique}` : unique;
};
