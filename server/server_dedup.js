/**
 * server WS request/atome-create dedup + recent-error ring buffer.
 */

import { logStructured } from './server_logger.js';

const wsRecentRequestIds = new WeakMap();

export const recentErrors = [];
const MAX_RECENT_ERRORS = 100;
const WS_DEDUPE_TTL_MS = 3000;
const WS_ATOME_CREATE_DEDUPE_MS = 2000;
const wsRecentAtomeCreates = new Map();

export function recordRecentError(payload) {
  if (!payload) return;
  recentErrors.push(payload);
  if (recentErrors.length > MAX_RECENT_ERRORS) {
    recentErrors.splice(0, recentErrors.length - MAX_RECENT_ERRORS);
  }
}

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
  if (cache.size > 200) {
    for (const [id, ts] of cache) {
      if (now - ts > WS_DEDUPE_TTL_MS) cache.delete(id);
    }
  }
  return false;
}

export function isDuplicateAtomeCreate(atomeId) {
  if (!atomeId) return false;
  const now = Date.now();
  const last = wsRecentAtomeCreates.get(atomeId);
  if (last && now - last < WS_ATOME_CREATE_DEDUPE_MS) return true;
  wsRecentAtomeCreates.set(atomeId, now);
  if (wsRecentAtomeCreates.size > 2000) {
    for (const [id, ts] of wsRecentAtomeCreates) {
      if (now - ts > WS_ATOME_CREATE_DEDUPE_MS * 2) {
        wsRecentAtomeCreates.delete(id);
      }
    }
  }
  return false;
}
