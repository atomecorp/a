/**
 * server WS request/atome-create dedup + recent-error ring buffer.
 */

import { logStructured } from './server_logger.js';

const wsRecentRequestIds = new WeakMap();

export const recentErrors = [];
const MAX_RECENT_ERRORS = 100;
const WS_DEDUPE_TTL_MS = 3000;
const WS_ATOME_CREATE_DEDUPE_MS = 2000;
const WS_REQUEST_WINDOW_MAX = 200;
const WS_ATOME_CREATE_WINDOW_MAX = 2000;
const wsRecentAtomeCreates = new Map();

export function recordRecentError(payload) {
  if (!payload) return;
  recentErrors.push(payload);
  if (recentErrors.length > MAX_RECENT_ERRORS) {
    recentErrors.splice(0, recentErrors.length - MAX_RECENT_ERRORS);
  }
}

// Both caches are insertion-ordered Maps used as sliding windows: an entry is
// only useful for its TTL, and Map iteration yields the OLDEST entry first.
//
// The previous sweep walked the whole map on every call past the threshold and
// deleted only entries already older than the TTL. During a burst -- a bulk
// import creating thousands of atomes in a few seconds -- nothing is old enough,
// so the sweep freed nothing while the map kept growing: an O(n) scan per
// insertion, i.e. quadratic on exactly the workload that triggers it.
//
// Trimming from the front instead is O(1) amortised and bounded in every case:
// expired entries go first, and if none are expired the oldest are dropped,
// which is what a fixed-size sliding window means.
// Timestamps only ever increase, so the Map's insertion order IS age order and
// the front entry is always the oldest. Expiry itself is handled at lookup
// (`now - last < TTL`), so trimming only has to bound the size.
const trimSlidingWindow = (cache, maxSize) => {
  while (cache.size > maxSize) {
    cache.delete(cache.keys().next().value);
  }
};

export function isDuplicateWsRequest(connection, requestId) {
  if (!connection || !requestId) return false;
  const now = Date.now();
  let cache = wsRecentRequestIds.get(connection);
  if (!cache) {
    cache = new Map();
    wsRecentRequestIds.set(connection, cache);
  }
  const last = cache.get(requestId);
  if (last && now - last < WS_DEDUPE_TTL_MS) return true;
  cache.set(requestId, now);
  trimSlidingWindow(cache, WS_REQUEST_WINDOW_MAX);
  return false;
}

export function isDuplicateAtomeCreate(atomeId) {
  if (!atomeId) return false;
  const now = Date.now();
  const last = wsRecentAtomeCreates.get(atomeId);
  if (last && now - last < WS_ATOME_CREATE_DEDUPE_MS) return true;
  wsRecentAtomeCreates.set(atomeId, now);
  trimSlidingWindow(wsRecentAtomeCreates, WS_ATOME_CREATE_WINDOW_MAX);
  return false;
}
