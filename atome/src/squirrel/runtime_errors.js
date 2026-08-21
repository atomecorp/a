// Single collection point for errors the framework deliberately absorbs.
//
// Why this exists: `$()` wraps every event handler so that a rejected promise
// never reaches `unhandledrejection` (which reloads the Tauri WebView). That
// goal is legitimate, swallowing the error silently is not -- it made every
// interaction bug invisible. `reportRuntimeError` keeps the absorption and
// restores the trace:
//   - the last RUNTIME_ERROR_RING_SIZE entries stay readable on
//     `window.__squirrelErrors`
//   - `console.error` fires only when `window.__SQUIRREL_DEBUG` is truthy,
//     so production stays quiet.

const RUNTIME_ERROR_RING_SIZE = 200;

const runtimeErrorRing = [];

const globalScope = (typeof globalThis !== 'undefined' && globalThis)
  || (typeof window !== 'undefined' && window)
  || null;

if (globalScope && !globalScope.__squirrelErrors) {
  globalScope.__squirrelErrors = runtimeErrorRing;
}

const describeError = (error) => {
  if (error instanceof Error) return { name: error.name, message: error.message, stack: error.stack };
  if (error && typeof error === 'object') {
    return { name: 'NonError', message: String(error.message ?? ''), value: error };
  }
  return { name: 'NonError', message: String(error) };
};

/**
 * Record an absorbed error. Never throws, never rethrows.
 * @param {unknown} error - the caught value
 * @param {string} context - where it was caught ('squirrel:handler', 'server:ws', ...)
 * @param {Object} [details] - optional structured extras
 * @returns {Object} the recorded entry
 */
const reportRuntimeError = (error, context = 'unknown', details = null) => {
  const entry = {
    context: String(context),
    at: new Date().toISOString(),
    error: describeError(error),
  };
  if (details) entry.details = details;

  runtimeErrorRing.push(entry);
  if (runtimeErrorRing.length > RUNTIME_ERROR_RING_SIZE) {
    runtimeErrorRing.splice(0, runtimeErrorRing.length - RUNTIME_ERROR_RING_SIZE);
  }

  if (globalScope && globalScope.__SQUIRREL_DEBUG && typeof console !== 'undefined') {
    console.error(`[squirrel:${entry.context}]`, error, details || '');
  }
  return entry;
};

/** Snapshot of the ring, oldest first. */
const getRuntimeErrors = () => runtimeErrorRing.slice();

/** Drop every recorded entry (tests and probes). */
const clearRuntimeErrors = () => { runtimeErrorRing.length = 0; };

export { reportRuntimeError, getRuntimeErrors, clearRuntimeErrors, RUNTIME_ERROR_RING_SIZE };
export default reportRuntimeError;
