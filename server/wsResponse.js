/**
 * One reply envelope for every `/ws/api` operation family.
 *
 * Seven `ws*Operations.js` modules each defined a local `response()` with four
 * different signatures, and only two of them added the `ok` field — so a client
 * had to know which family answered to know whether to read `ok` or `success`.
 * Every family now emits `{ type, requestId, success, ok, ...fields }`.
 */

/** Request id of an inbound message, snake_case or camelCase. */
export function requestIdOf(message) {
    return message?.requestId || message?.request_id || null;
}

/** Action name of an inbound message, normalised. */
export function actionOf(message) {
    return String(message?.action || message?.op || '').trim().toLowerCase();
}

/**
 * @param {string} type - family name without the `-response` suffix
 * @param {object|string|null} message - inbound message, or the request id itself
 * @param {boolean} success
 * @param {object} [fields] - family-specific payload
 */
export function wsResponse(type, message, success, fields = {}) {
    const requestId = (message && typeof message === 'object') ? requestIdOf(message) : (message || null);
    return {
        type: `${type}-response`,
        requestId,
        success: !!success,
        ok: !!success,
        ...fields
    };
}

/** Failure envelope carrying a normalised `error` string. */
export function wsErrorResponse(type, message, error) {
    return wsResponse(type, message, false, {
        error: error instanceof Error ? error.message : String(error)
    });
}
